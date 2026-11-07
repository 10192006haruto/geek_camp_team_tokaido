// 実APIの接続確認用CLI。--live を付けたときだけ Google Places（と --full なら Gemini）を実際に呼ぶ。
//   node --env-file=.env.local scripts/check-live-search.mjs --live          … Places だけ（1リクエスト）
//   node --env-file=.env.local scripts/check-live-search.mjs --live --full   … Places → Gemini → 照合まで
// キー・クチコミ本文・投稿者名は表示しない。Places は Nearby Search Enterprise + Atmosphere の料金区分。
import './register-typescript.mjs';

const args = process.argv.slice(2);
if (!args.includes('--live')) {
  console.error('実際の有料APIを呼びます。実行するには --live を付けてください（--full で Gemini まで）。');
  process.exit(2);
}
const { buildNearbyRequest, normalizeNearbyResponse, NEARBY_FIELD_MASK, NEARBY_SEARCH_URL } = await import('../src/server/restaurants/nearby-search.ts');
const { searchPlaces } = await import('../src/server/restaurants/search.ts');

const lat = Number(process.env.CHECK_LAT ?? 35.6812);
const lng = Number(process.env.CHECK_LNG ?? 139.7671);
const req = { location: { latitude: lat, longitude: lng }, radiusMeters: 1000, mood: '', openNow: false };
const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
if (!key) { console.error('GOOGLE_PLACES_API_KEY が未設定です（.env.local を確認）。'); process.exit(1); }

console.log(`検索地点: (${lat}, ${lng}) 半径 ${req.radiusMeters}m`);

// 1. Places を直接呼び、失敗時は Google のエラー理由を表示する（アプリのAPIは詳細を返さないため）。
const started = Date.now();
const response = await fetch(NEARBY_SEARCH_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': NEARBY_FIELD_MASK },
  body: JSON.stringify(buildNearbyRequest(req)),
  cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
});
const elapsed = Date.now() - started;
const payload = await response.json().catch(() => null);
console.log(`\n[Places] HTTP ${response.status}（${elapsed}ms）`);
if (!response.ok) {
  const error = payload?.error ?? {};
  const reasons = (error.details ?? []).map((d) => [d.reason, d.metadata?.service, d.metadata?.consumer].filter(Boolean).join(' / ')).filter(Boolean);
  console.log(`  status : ${error.status ?? '(不明)'}`);
  console.log(`  message: ${(error.message ?? '').replaceAll(key, '***')}`);
  if (reasons.length) console.log(`  reason : ${reasons.join(' | ')}`);
  console.log('\nよくある原因:');
  console.log('  - Places API (New) が有効になっていない（旧 Places API とは別）');
  console.log('  - APIキーの「API の制限」で Places API (New) が許可されていない');
  console.log('  - APIキーに HTTPリファラー制限が付いている（サーバーからの呼び出しでは使えない）');
  console.log('  - プロジェクトに課金アカウントが紐付いていない');
  process.exit(1);
}
const candidates = normalizeNearbyResponse(payload);
const reviewTotal = candidates.reduce((n, c) => n + c.reviews.length, 0);
console.log(`  取得店舗: ${candidates.length}件 / 本文のあるクチコミ: ${reviewTotal}件`);
for (const c of candidates) console.log(`  - ${c.name}（クチコミ ${c.reviews.length}件, 営業中: ${c.isOpenNow ?? '不明'}）`);

if (!args.includes('--full')) process.exit(0);

// 2. アプリと同じ経路（10秒期限・Gemini 抽出・引用照合・最大5件）で通す。Places をもう1回呼ぶ。
console.log('\n[検索全体] Places → Gemini → 照合（もう一度 Places を呼びます）');
const fullStarted = Date.now();
try {
  const result = await searchPlaces(req, new AbortController().signal);
  console.log(`  成功（${Date.now() - fullStarted}ms）: ${result.returnedCount}件`);
  for (const r of result.restaurants) console.log(`  - ${r.name}: ${r.inferredMenu.map((m) => m.name).join('、')}`);
} catch (error) {
  console.log(`  失敗（${Date.now() - fullStarted}ms）: ${error.code ?? error.name}`);
  process.exit(1);
}
