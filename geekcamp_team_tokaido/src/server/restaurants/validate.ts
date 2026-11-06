import type { SearchRequest } from "@/types/restaurants";

export type ParseResult =
  | { ok: true; value: SearchRequest }
  | { ok: false; message: string };

const RADIUS_VALUES = [500, 1000, 3000] as const;
// ⚠️ ジャンルの許可リストは未確定。仮置き（ふらさんの選択肢と同期が必要）
const CUISINE_VALUES = ["和食", "ラーメン", "郷土料理"] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const fail = (message: string): ParseResult => ({ ok: false, message });

export function parseSearchRequest(body: unknown): ParseResult {
  if (!isObject(body)) return fail("リクエストはオブジェクトで送信してください。");

  // 「省略」と「null」を区別：キー自体が無いのは不正
  for (const key of ["location", "radiusMeters", "cuisine", "budgetMaxYen"]) {
    if (!(key in body)) return fail(`${key} は必須です。`);
  }

  const { location, radiusMeters, cuisine, budgetMaxYen } = body;

  if (!isObject(location)) return fail("location が不正です。");
  const { latitude, longitude } = location;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90)
    return fail("latitude が不正です。");
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180)
    return fail("longitude が不正です。");

  if (!RADIUS_VALUES.includes(radiusMeters as never))   // "1000"（文字列）はここで弾かれる
    return fail("radiusMeters は 500 / 1000 / 3000 のいずれかです。");

  if (cuisine !== null && !CUISINE_VALUES.includes(cuisine as never))
    return fail("cuisine が不正です。");               // 空文字 "" もここで弾かれる

  if (budgetMaxYen !== null &&
      !(Number.isSafeInteger(budgetMaxYen) && (budgetMaxYen as number) > 0))
    return fail("budgetMaxYen は正の整数か null です。");

  return {
    ok: true,
    // 余計なキーを持ち込まないよう、組み立て直して返す
    value: {
      location: { latitude, longitude },
      radiusMeters: radiusMeters as SearchRequest["radiusMeters"],
      cuisine: cuisine as string | null,
      budgetMaxYen: budgetMaxYen as number | null,
    },
  };
}
