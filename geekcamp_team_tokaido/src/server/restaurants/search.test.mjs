import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// 既存のTypeScript依存で判定処理を実行する。server-onlyマーカーの置き換えはテスト内だけ。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, shortCircuit: true };
    if (specifier === "../discovery") specifier = "../discovery/index";
    if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) specifier += ".ts";
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText };
    return next(url, context);
  },
});
const { searchRestaurants } = await import("./search.ts");
const { fetchMockReviewCandidates, mockMenuInference } = await import("./mock-data.ts");
const { selectReviewRestaurants } = await import("./review-results.ts");
const { parseSearchRequest } = await import("./validate.ts");
const { POST, GET, OPTIONS } = await import("../../app/api/restaurants/search/route.ts");
const request = { location: { latitude: 35.6812, longitude: 139.7671 }, radiusMeters: 1000, mood: "", openNow: false };
const signal = new AbortController().signal;

test("all three conditions are required; validate boundaries and reject removed conditions", () => {
  assert.deepEqual(parseSearchRequest(request), { ok: true, value: request });
  assert.equal(parseSearchRequest({ ...request, mood: " ".repeat(150) }).ok, true);
  assert.equal(parseSearchRequest({ ...request, mood: "a".repeat(151) }).ok, false);
  for (const key of Object.keys(request)) { const invalid = { ...request }; delete invalid[key]; assert.equal(parseSearchRequest(invalid).ok, false); }
  for (const patch of [{ mood: null }, { openNow: null }, { openNow: "true" }, { radiusMeters: 0 }, { radiusMeters: "1000" },
    { cuisine: null }, { budgetMaxYen: null }, { location: { latitude: 91, longitude: 0 } }]) {
    assert.equal(parseSearchRequest({ ...request, ...patch }).ok, false);
  }
  assert.equal(parseSearchRequest({ ...request, location: { latitude: -90, longitude: 180 } }).ok, true);
});

const ids = (result) => result.restaurants.map((r) => r.id.replace("mock-place-", "")).map(Number);

test("mock: only shops with verified dishes, opening filter before the five-result limit", async () => {
  const ordinary = await searchRestaurants(request, signal);
  assert.deepEqual(ids(ordinary), [1, 2, 3, 5, 6]); // 4 has no dish mention
  const open = await searchRestaurants({ ...request, openNow: true }, signal);
  assert.deepEqual(ids(open), [3, 5, 6, 7, 8]); // 1 (false) and 2 (null) excluded, later shops fill in
  assert.ok(open.restaurants.every((r) => r.isOpenNow === true && r.inferredMenu.length > 0 && r.recommendationReason));
  assert.deepEqual(ids(await searchRestaurants({ ...request, radiusMeters: 3000, mood: "麺", openNow: true }, signal)), [8, 9, 3, 5, 6]);
});

test("mock: citations, attribution, null / 0 and translated reviews survive to the response", async () => {
  const { restaurants } = await searchRestaurants(request, signal);
  const byId = Object.fromEntries(restaurants.map((r) => [r.id, r]));
  assert.equal(byId["mock-place-3"].reviewCount, 0);
  assert.equal(byId["mock-place-3"].rating, null);
  assert.equal(byId["mock-place-3"].cuisineLabel, null);
  assert.equal(byId["mock-place-2"].isOpenNow, null);
  // review index 1 has no text; index 2 keeps its number
  assert.equal(byId["mock-place-5"].inferredMenu[0].evidence[0].author.text, "架空投稿者5-3");
  const curry = byId["mock-place-6"].inferredMenu[0].evidence[0];
  assert.equal(curry.translated, true);
  assert.ok(curry.originalText.startsWith("I had"));
  assert.ok(restaurants.every((r) => r.name.startsWith("【架空】") && !("reviews" in r)));
});

test("mock: fabricated citations are dropped by the same verification as production", async () => {
  const candidates = await fetchMockReviewCandidates(request, signal);
  const inference = mockMenuInference(candidates);
  inference[0].items[0].evidence[0].quote = "天ぷらそばは最高だと聞きました。";
  assert.ok(!ids(selectReviewRestaurants(candidates, inference, request)).includes(1));
});

test("mood promotes a distant candidate before slicing; unknown/negative intent never removes candidates", async () => {
  const result = await searchRestaurants({ ...request, mood: "麺が食べたい", openNow: true }, signal);
  assert.equal(result.restaurants[0].id, "mock-place-8");
  assert.equal(result.returnedCount, 5);
  const ordinary = await searchRestaurants(request, signal);
  for (const mood of ["がっつり", "そば以外"]) assert.deepEqual(await searchRestaurants({ ...request, mood }, signal), ordinary);
});

test("empty, out-of-radius, missing coordinates, cancellation and concurrent conditions", async () => {
  assert.deepEqual(selectReviewRestaurants([], [], request), { restaurants: [], returnedCount: 0 });
  assert.equal((await searchRestaurants({ ...request, location: { latitude: 0, longitude: 0 } }, signal)).returnedCount, 0);
  const candidates = await fetchMockReviewCandidates(request, signal);
  assert.equal(selectReviewRestaurants([{ ...candidates[0], location: null }], mockMenuInference(candidates), request).returnedCount, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchRestaurants(request, controller.signal), { name: "AbortError" });
  const [open, all] = await Promise.all([searchRestaurants({ ...request, openNow: true }, signal), searchRestaurants(request, signal)]);
  assert.notEqual(open.restaurants[0].id, all.restaurants[0].id);
});

test("HTTP pipeline returns reasons and strict validation without external calls", async () => {
  const post = (body, contentType = "application/json") => POST(new Request("http://localhost/api/restaurants/search", {
    method: "POST", headers: { "Content-Type": contentType }, body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  const success = await post({ ...request, mood: "麺", openNow: true });
  assert.equal(success.status, 200);
  const body = await success.json();
  assert.equal(body.restaurants[0].id, "mock-place-8");
  assert.equal(body.returnedCount, body.restaurants.length);
  assert.equal((await post("{")).status, 400);
  assert.equal((await post({ ...request, openNow: null })).status, 400);
  assert.equal((await post(request, "application/json-invalid")).status, 415);
  for (const handler of [GET, OPTIONS]) { const response = handler(); assert.equal(response.status, 405); assert.equal(response.headers.get("allow"), "POST"); }
});

// ---- 実APIの経路（Places・Gemini は架空のレスポンスに差し替え。実通信なし） ----
const { resolveDataSource, searchPlaces } = await import("./search.ts");

function withEnv(t, patch) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) { if (v === null) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}
function stubFetch(t, routes) {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const handler = String(url).startsWith("https://places.googleapis.com/") ? routes.places : routes.gemini;
    return handler(init);
  };
  t.after(() => { globalThis.fetch = saved; });
  return calls;
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fakePlaces = () => jsonResponse({ places: [{
  id: "fake-place-1", displayName: { text: "【架空】ここメシ食堂" }, location: { latitude: 35.6815, longitude: 139.7672 },
  currentOpeningHours: { openNow: true }, userRatingCount: 3,
  reviews: [{ text: { text: "天ぷらそばを食べました。", languageCode: "ja" }, authorAttribution: { displayName: "架空投稿者" } }],
}] });
const fakeGemini = (results) => () => jsonResponse({ candidates: [{ finishReason: "STOP",
  content: { parts: [{ text: JSON.stringify({ results }) }] } }] });
const geminiOk = fakeGemini([{ placeId: "fake-place-1",
  items: [{ name: "天ぷらそば", evidence: [{ reviewIndex: 0, quote: "天ぷらそばを食べました。" }] }] }]);
const livePost = (body, init = {}) => POST(new Request("http://localhost/api/restaurants/search", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...init,
}));

test("data source must be explicit outside development", () => {
  assert.equal(resolveDataSource({ RESTAURANT_DATA_SOURCE: "places" }), "places");
  assert.equal(resolveDataSource({ RESTAURANT_DATA_SOURCE: "mock", NODE_ENV: "production" }), "mock");
  assert.equal(resolveDataSource({ NODE_ENV: "development" }), "mock");
  assert.equal(resolveDataSource({}), "mock");
  assert.throws(() => resolveDataSource({ NODE_ENV: "production" }), { code: "SERVICE_UNAVAILABLE" });
  assert.throws(() => resolveDataSource({ RESTAURANT_DATA_SOURCE: "real" }), { code: "SERVICE_UNAVAILABLE" });
});

test("places mode: Nearby → Gemini → verified dishes reach the HTTP response", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: "fake-places", GEMINI_API_KEY: "fake-gemini" });
  const calls = stubFetch(t, { places: fakePlaces, gemini: geminiOk });
  const response = await livePost(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.returnedCount, 1);
  assert.equal(body.restaurants[0].inferredMenu[0].name, "天ぷらそば");
  assert.equal(body.restaurants[0].inferredMenu[0].evidence[0].author.text, "架空投稿者");
  assert.equal(calls.length, 2);
});

test("places mode: upstream failures map to 502 / 503 / 504 without leaking details", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: "fake-places", GEMINI_API_KEY: "fake-gemini" });
  const cases = [
    [{ places: () => jsonResponse({ error: { message: "secret detail" } }, 403), gemini: geminiOk }, 503, "SERVICE_UNAVAILABLE"],
    [{ places: () => jsonResponse({}, 500), gemini: geminiOk }, 502, "SEARCH_FAILED"],
    [{ places: fakePlaces, gemini: () => jsonResponse({ error: "secret detail" }, 500) }, 502, "SEARCH_FAILED"],
    [{ places: fakePlaces, gemini: () => jsonResponse({}, 429) }, 503, "SERVICE_UNAVAILABLE"],
    [{ places: fakePlaces, gemini: fakeGemini([{ placeId: "unknown", items: [] }]) }, 502, "SEARCH_FAILED"],
  ];
  for (const [routes, status, code] of cases) {
    stubFetch(t, routes);
    const response = await livePost(request);
    assert.equal(response.status, status);
    const text = await response.text();
    assert.equal(JSON.parse(text).error.code, code);
    assert.ok(!text.includes("secret detail") && !text.includes("fake-places"));
  }
});

test("places mode: missing key is 503 and no-dish result is an empty 200", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: null, GEMINI_API_KEY: "fake-gemini" });
  const calls = stubFetch(t, { places: fakePlaces, gemini: geminiOk });
  assert.equal((await livePost(request)).status, 503);
  assert.equal(calls.length, 0);
  process.env.GOOGLE_PLACES_API_KEY = "fake-places";
  stubFetch(t, { places: fakePlaces, gemini: fakeGemini([{ placeId: "fake-place-1", items: [] }]) });
  const empty = await livePost(request);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { restaurants: [], returnedCount: 0 });
});

test("places mode: one shared deadline turns a hanging upstream into 504", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: "fake-places", GEMINI_API_KEY: "fake-gemini" });
  const hang = (init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  stubFetch(t, { places: hang, gemini: geminiOk });
  await assert.rejects(searchPlaces(request, AbortSignal.timeout(20)), { code: "UPSTREAM_TIMEOUT" });
  stubFetch(t, { places: fakePlaces, gemini: hang });
  await assert.rejects(searchPlaces(request, AbortSignal.timeout(20)), { code: "UPSTREAM_TIMEOUT" });
  const response = await livePost(request, { signal: AbortSignal.timeout(20) });
  assert.equal(response.status, 504);
});

// ---- Gemini の分割並行呼び出し ----
const { inferMenusInBatches, INFERENCE_BATCH_SIZE } = await import("./search.ts");
const manyPlaces = (n) => () => jsonResponse({ places: Array.from({ length: n }, (_, i) => ({
  id: `fake-${i}`, displayName: { text: `【架空】店${i}` }, location: { latitude: 35.6812 + i * 0.0001, longitude: 139.7671 },
  currentOpeningHours: { openNow: true },
  reviews: [{ text: { text: `定食${i}を食べました。`, languageCode: "ja" }, authorAttribution: { displayName: `架空投稿者${i}` } }],
})) });
// 送られてきた店舗IDごとに、その店のクチコミから料理を返す
const echoGemini = (log) => (init) => {
  const body = JSON.parse(init.body);
  const places = JSON.parse(body.contents[0].parts[0].text).places;
  log.push(places.map((p) => p.placeId));
  return jsonResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ results: places.map((p) => {
    const dish = p.reviews[0].text.replace("を食べました。", "");
    return { placeId: p.placeId, items: [{ name: dish, evidence: [{ reviewIndex: 0, quote: p.reviews[0].text }] }] };
  }) }) }] } }] });
};

test("places mode: 20 candidates are sent to Gemini in parallel batches and merged", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: "fake-places", GEMINI_API_KEY: "fake-gemini" });
  const log = [];
  stubFetch(t, { places: manyPlaces(20), gemini: echoGemini(log) });
  const result = await searchPlaces(request, signal);
  assert.equal(log.length, 20 / INFERENCE_BATCH_SIZE);
  assert.ok(log.every((ids) => ids.length <= INFERENCE_BATCH_SIZE));
  assert.deepEqual(log.flat().sort(), Array.from({ length: 20 }, (_, i) => `fake-${i}`).sort());
  assert.equal(result.returnedCount, 5);
  assert.deepEqual(result.restaurants.map((r) => r.inferredMenu[0].name), ["定食0", "定食1", "定食2", "定食3", "定食4"]);
});

test("places mode: one failing batch fails the whole search and cancels siblings", async (t) => {
  withEnv(t, { RESTAURANT_DATA_SOURCE: "places", GOOGLE_PLACES_API_KEY: "fake-places", GEMINI_API_KEY: "fake-gemini" });
  let calls = 0; let cancelled = 0;
  stubFetch(t, { places: manyPlaces(10), gemini: (init) => {
    calls += 1;
    if (calls === 1) return jsonResponse({}, 500);
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => { cancelled += 1; reject(init.signal.reason); }));
  } });
  await assert.rejects(searchPlaces(request, signal), { code: "SEARCH_FAILED" });
  assert.equal(calls, 2);
  assert.equal(cancelled, 1);
});

test("batching: empty input makes no Gemini call; deadline still maps to UPSTREAM_TIMEOUT", async (t) => {
  withEnv(t, { GEMINI_API_KEY: "fake-gemini" });
  const log = [];
  stubFetch(t, { places: manyPlaces(0), gemini: echoGemini(log) });
  assert.deepEqual(await inferMenusInBatches([], signal), []);
  assert.equal(log.length, 0);
  stubFetch(t, { places: manyPlaces(0), gemini: (init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))) });
  const candidates = (await (await import("./nearby-search.ts")).normalizeNearbyResponse(await manyPlaces(7)().json()));
  await assert.rejects(inferMenusInBatches(candidates, AbortSignal.timeout(20)), { code: "UPSTREAM_TIMEOUT" });
});
