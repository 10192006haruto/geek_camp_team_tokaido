import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DEMO_LOCATION, DEFAULT_FILTERS, distanceMeters, previewResults, searchPreview } from "./preview.js";
import { locationErrorMessage, parseSearchResponse, safeExternalUrl, searchRestaurants } from "./search.js";

const request = { ...DEFAULT_FILTERS, location: DEMO_LOCATION };

test("preview respects radius; condition selection belongs to the search pipeline", () => {
  assert.equal(previewResults(request, "success").returnedCount, 3);
  assert.equal(previewResults({ ...request, radiusMeters: 500 }, "success").returnedCount, 1);
  assert.equal(previewResults({ ...request, location: { latitude: 0, longitude: 0 } }, "success").returnedCount, 0);
  assert.equal(distanceMeters(DEMO_LOCATION, DEMO_LOCATION), 0);
});

test("unknown, zero and false stay distinct", () => {
  const result = parseSearchResponse(previewResults(request, "success"));
  assert.equal(result.restaurants[2].rating, null);
  assert.equal(result.restaurants[2].reviewCount, 0);
  assert.equal(result.restaurants[1].isOpenNow, false);
  assert.equal(result.restaurants[2].isOpenNow, null);
  const missing = parseSearchResponse(previewResults(request, "missing"));
  assert.equal(missing.restaurants[0].distanceMeters, null);
  assert.equal(missing.restaurants[0].reviewCount, null);
});

test("empty results are valid and errors are separate", () => {
  assert.deepEqual(parseSearchResponse(previewResults(request, "empty")), { restaurants: [], returnedCount: 0, uncheckedCount: 0 });
  assert.throws(() => previewResults(request, "error"));
});

test("response validation rejects missing fields, invalid numbers, count mismatch and duplicate IDs", () => {
  const valid = previewResults(request, "success");
  for (const patch of [{ rating: -1 }, { rating: 6 }, { reviewCount: 1.5 }, { distanceMeters: Infinity }, { address: undefined }, { location: { latitude: 91, longitude: 0 } }]) {
    assert.throws(() => parseSearchResponse({ restaurants: [{ ...valid.restaurants[0], ...patch }], returnedCount: 1, uncheckedCount: 0 }));
  }
  assert.throws(() => parseSearchResponse({ ...valid, returnedCount: 0 }));
  assert.throws(() => parseSearchResponse({ restaurants: [valid.restaurants[0], valid.restaurants[0]], returnedCount: 2, uncheckedCount: 0 }));
  assert.throws(() => parseSearchResponse({ restaurants: Array(6).fill(valid.restaurants[0]), returnedCount: 6, uncheckedCount: 0 }));
});

test("unsafe URLs and non-Google directions are never linked", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("https://secret@example.com"), undefined);
  assert.equal(safeExternalUrl("https://google.com.evil.example/maps", true), undefined);
  assert.equal(safeExternalUrl("https://www.google.com/maps/dir/?api=1", true), "https://www.google.com/maps/dir/?api=1");
});

test("geolocation errors have distinct guidance", () => {
  assert.match(locationErrorMessage(1), /許可/);
  assert.match(locationErrorMessage(3), /時間/);
  assert.match(locationErrorMessage(2), /取得できません/);
  assert.equal(new Set([1, 2, 3].map(locationErrorMessage)).size, 3);
});

test("an aborted slow preview cannot complete", async () => {
  const controller = new AbortController();
  const pending = searchPreview(request, "slow", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(searchPreview(request, "success", controller.signal), { name: "AbortError" });
});

test("HTTP client sends contract JSON and propagates its AbortSignal", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/restaurants/search");
    assert.equal(init.method, "POST");
    assert.equal(init.signal, controller.signal);
    assert.deepEqual(JSON.parse(init.body as string), request);
    return new Response(JSON.stringify({ restaurants: [], returnedCount: 0, uncheckedCount: 0 }), { status: 200 });
  });
  assert.deepEqual(await searchRestaurants(request, controller.signal), { restaurants: [], returnedCount: 0, uncheckedCount: 0 });
});

test("uncheckedCount is required and must be a non-negative integer", () => {
  const valid = previewResults(request, "success");
  assert.equal(parseSearchResponse({ ...valid, uncheckedCount: 3 }).uncheckedCount, 3);
  for (const uncheckedCount of [undefined, -1, 1.5, "2", null]) assert.throws(() => parseSearchResponse({ ...valid, uncheckedCount }));
});

test("HTTP failures and non-JSON success responses do not leak raw server content", async (context) => {
  const mock = context.mock.method(globalThis, "fetch", async () => new Response("secret-key: example", { status: 502 }));
  await assert.rejects(searchRestaurants(request, new AbortController().signal), (error: Error) => !error.message.includes("secret-key"));
  mock.mock.mockImplementation(async () => new Response("<html>internal stack</html>", { status: 200 }));
  await assert.rejects(searchRestaurants(request, new AbortController().signal), /読み込めません/);
  mock.mock.mockImplementation(async () => new Response("Not found", { status: 404 }));
  await assert.rejects(searchRestaurants(request, new AbortController().signal), /まだ接続されていません/);
});

test("optional photos are validated without changing the legacy response shape", () => {
  const response = previewResults(request, "success");
  const restaurant = response.restaurants[0];
  const valid = { ...restaurant, photos: [{ url: "https://example.com/photo.jpg", label: null, attributions: [] }] };
  assert.equal(parseSearchResponse({ restaurants: [valid], returnedCount: 1, uncheckedCount: 0 }).restaurants[0].photos?.length, 1);
  for (const photos of [null, [{ url: 12, label: null, attributions: [] }], [{ url: "https://example.com", label: null, attributions: [{ text: 12, url: null }] }]]) {
    assert.throws(() => parseSearchResponse({ restaurants: [{ ...restaurant, photos }], returnedCount: 1, uncheckedCount: 0 }));
  }
});

test("review response supports five unique restaurants and validates menu evidence", () => {
  const place = previewResults(request, "success").restaurants[0];
  const restaurants = Array.from({ length: 5 }, (_, index) => ({ ...place, id: String(index) }));
  assert.equal(parseSearchResponse({ restaurants, returnedCount: 5, uncheckedCount: 0 }).restaurants.length, 5);
  assert.throws(() => parseSearchResponse({ restaurants: [...restaurants, { ...place, id: "6" }], returnedCount: 6, uncheckedCount: 0 }));
  const evidence = place.inferredMenu[0].evidence[0];
  for (const inferredMenu of [undefined, null, [{ name: "料理", evidence: [] }],
    [{ name: "定食", evidence: [{ ...evidence, quote: "" }] }],
    [{ name: "定食", evidence: [{ ...evidence, author: null }] }],
    [{ name: "定食", evidence: [{ ...evidence, publishTime: "not-a-date" }] }]]) {
    assert.throws(() => parseSearchResponse({ restaurants: [{ ...place, inferredMenu }], returnedCount: 1, uncheckedCount: 0 }));
  }
  assert.equal(parseSearchResponse({ restaurants: [{ ...place, inferredMenu: [] }], returnedCount: 1, uncheckedCount: 0 }).returnedCount, 1);
});
