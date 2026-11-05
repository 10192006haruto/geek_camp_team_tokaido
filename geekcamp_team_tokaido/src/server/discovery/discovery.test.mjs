import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// 既存のTypeScript依存で判定処理を実行する。server-onlyマーカーの置き換えはテスト内だけ。
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
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
const { cleanseCandidates, classifyCandidates, discoverRecommendations, discoverRestaurants, discoverRestaurantsWithOfficialMenus } = await import("./index.ts");
const { mockCandidates } = await import("./mock.ts");
const { addPlacesMenus } = await import("./places-menu.ts");
const { isPublicIPv4, publicWebsiteUrl } = await import("./public-menu-page.ts");

test("invalid values become null; measured zero and false survive", () => {
  const [clean] = cleanseCandidates([{ id: " a ", name: " 店 ", rating: Infinity,
    reviewCount: 0, distanceMeters: -1, isOpenNow: false, location: { latitude: 91, longitude: 0 },
    photoUrl: "javascript:alert(1)", googleMapsUrl: "https://www.google.com.evil.test/maps" }]);
  assert.equal(clean.id, "a"); assert.equal(clean.name, "店");
  for (const key of ["rating", "distanceMeters", "location", "photoUrl", "googleMapsUrl"]) assert.equal(clean[key], null);
  assert.equal(clean.reviewCount, 0); assert.equal(clean.isOpenNow, false);
  const [zero] = cleanseCandidates([{ id: "z", name: "零", rating: 0, distanceMeters: 0,
    location: { latitude: -90, longitude: 180 }, reviewCount: "0" }]);
  assert.equal(zero.rating, 0); assert.equal(zero.distanceMeters, 0);
  assert.equal(zero.reviewCount, null); assert.deepEqual(zero.location, { latitude: -90, longitude: 180 });
});

test("invalid identities and duplicates do not create extra recommendations", () => {
  assert.deepEqual(cleanseCandidates([null, {}, { id: "a", name: " " }]), []);
  assert.equal(cleanseCandidates([...mockCandidates(), ...mockCandidates()]).length, 2);
  assert.throws(() => cleanseCandidates({}), TypeError);
});

test("unverified dishes, names, reviews and injected labels cannot supply evidence", async () => {
  const candidate = mockCandidates()[0];
  for (const localDishes of [[], [{ ...candidate.localDishes[0], servingSource: "" }],
    [{ ...candidate.localDishes[0], regionalSource: null }], [{ ...candidate.localDishes[0], observedAt: "invalid" }]]) {
    const [decision] = await classifyCandidates([{ ...candidate, localDishes,
      name: "大阪名物かすうどん", labels: ["隠れた名店"], recommendationReason: "地元で大人気" }]);
    assert.equal(decision.selected, false); assert.equal(decision.recommendationReason, null);
    assert.deepEqual(decision.labels, []);
  }
});

test("one short grounded comment per selected ID, without mutating input", async () => {
  const input = mockCandidates(); const before = structuredClone(input);
  const output = await discoverRestaurants(input);
  assert.deepEqual(output.map((r) => [r.id, r.recommendationReason]), [
    ["mock-osaka", "大阪名物のかすうどんを提供"], ["mock-yamanashi", "山梨名物のほうとうを提供"],
  ]);
  assert.deepEqual(input, before);
  assert.ok(output.every((r) => !Object.hasOwn(r, "localDishes") && !Object.hasOwn(r, "isChain")));
  const [decision] = await classifyCandidates(input);
  assert.deepEqual(decision.evidence, [input[0].localDishes[0]]);
  input[0].localDishes[0].dish = "非常に長い料理名".repeat(10);
  const [long] = await classifyCandidates(input);
  assert.ok(Array.from(long.recommendationReason).length <= 20);
  assert.equal(long.recommendationReason, "地域ならではの郷土料理を提供");
});

test("optional criteria respect boundaries and exclude unknowns only when enabled", async () => {
  const candidate = { ...mockCandidates()[0], rating: 4, reviewCount: 20, isChain: false };
  assert.equal((await classifyCandidates([candidate], { minRating: 4, maxReviewCount: 20, excludeChains: true }))[0].selected, true);
  for (const config of [{ minRating: 4.1 }, { maxReviewCount: 19 }])
    assert.equal((await classifyCandidates([candidate], config))[0].selected, false);
  assert.equal((await classifyCandidates(mockCandidates(), { excludeChains: true }))[0].exclusion, "chain");
  assert.equal((await classifyCandidates(mockCandidates(), { minRating: 0 }))[0].exclusion, "rating");
  await assert.rejects(classifyCandidates([], { maxReviewCount: -1 }), RangeError);
  await assert.rejects(classifyCandidates([], { minRating: NaN }), RangeError);
});

test("empty, rejected and concurrent requests have no shared state", async () => {
  assert.deepEqual(await discoverRestaurants([]), []);
  await assert.rejects(discoverRestaurants(null), TypeError);
  const [a, b] = await Promise.all([discoverRestaurants(mockCandidates()), discoverRestaurants(mockCandidates(), { excludeChains: true })]);
  assert.equal(a.length, 2); assert.deepEqual(b, []);
});

test("builds evidence from the restaurant menu and a sourced regional catalogue", async () => {
  const [candidate] = mockCandidates();
  const { dish, region, servingSource, regionalSource, observedAt } = candidate.localDishes[0];
  const menuItem = { name: dish, status: "offered", source: servingSource, observedAt };
  const config = { regionalDishes: [{ dish, region, source: regionalSource }] };
  const input = { ...candidate, localDishes: [], menuItems: [menuItem] };
  const [decision] = await classifyCandidates([input], config);
  assert.equal(decision.selected, true);
  assert.deepEqual(decision.evidence, [{ dish, region, servingSource, regionalSource, observedAt }]);
  const [restaurant] = await discoverRestaurants([input], config);
  assert.equal(restaurant.recommendationReason, "大阪名物のかすうどんを提供");
  assert.equal(Object.hasOwn(restaurant, "menuItems"), false);

  for (const menuItems of [
    [],
    [{ ...menuItem, name: `${dish}風の別料理` }],
    [{ ...menuItem, source: "" }],
    [{ ...menuItem, status: "unknown" }],
    [menuItem, { ...menuItem, status: "not_offered" }],
  ]) {
    // Legacy evidence must not override missing or conflicting menu input.
    const [rejected] = await classifyCandidates([{ ...candidate, menuItems }], config);
    assert.equal(rejected.exclusion, "insufficient_evidence");
    assert.equal(rejected.recommendationReason, null);
  }
  for (const regionalDishes of [
    [],
    [{ dish, region, source: "" }],
    [...config.regionalDishes, { dish, region: "別地域", source: "mock:another" }],
  ]) {
    assert.deepEqual(await discoverRestaurants([input], { regionalDishes }), []);
  }
});

test("current coordinates restrict the dish catalog before matching and no AI ranks the results", async (t) => {
  const requests = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected external request"); });
  const [osaka, yamanashi] = mockCandidates();
  const location = { latitude: 35.664, longitude: 138.568 };
  const observedAt = "2026-11-06T00:00:00Z";
  const offered = (name) => ({ name, status: "offered", source: "mock:menu", observedAt });
  const outOfRegion = { ...osaka, distanceMeters: 1, menuItems: [offered("たこ焼き")] };
  const local = { ...yamanashi, menuItems: [offered("たこ焼き"), offered("おざら")] };
  const stores = [
    outOfRegion,
    { ...local, id: "unknown", distanceMeters: null },
    { ...local, id: "far", distanceMeters: 300 },
    { ...local, id: "near", distanceMeters: 0 },
    { ...local, id: "computed", location: { ...location, latitude: location.latitude + 0.001 } },
    { ...local, id: "middle", distanceMeters: 200 },
    { ...local, id: "tie", distanceMeters: 200 },
  ];
  const config = { searchLocation: location, gemini: { model: "test-model" } };
  const result = await discoverRecommendations(stores, config);
  assert.deepEqual(result.map(({ restaurant }) => restaurant.id), ["near", "computed", "middle", "tie", "far"]);
  assert.equal(result[0].restaurant.distanceMeters, 0);
  assert.ok(result[1].restaurant.distanceMeters >= 110 && result[1].restaurant.distanceMeters <= 112);
  assert.equal(result[0].evidence.dish, "おざら");
  assert.equal(result[0].restaurant.recommendationReason, "山梨名物のおざらを提供");
  assert.equal((await classifyCandidates([outOfRegion], config))[0].selected, false);
  assert.deepEqual(await discoverRestaurants([osaka], config), []);

  const unlocated = await discoverRestaurants([stores[1], outOfRegion], {
    searchLocation: { latitude: 0, longitude: 0 },
  });
  assert.deepEqual(unlocated.map(({ id }) => id), [outOfRegion.id, "unknown"]);
  assert.equal(unlocated[1].distanceMeters, null);
  assert.equal(requests.mock.callCount(), 0);
});

test("prefecture detection handles the main islands and unknown coordinates", async () => {
  const { prefectureForLocation } = await import("./search-geography.ts");
  assert.equal(prefectureForLocation({ latitude: 43.062, longitude: 141.354 }), "北海道");
  assert.equal(prefectureForLocation({ latitude: 35.6812, longitude: 139.7671 }), "東京");
  assert.equal(prefectureForLocation({ latitude: 35.472, longitude: 133.05 }), "島根");
  assert.equal(prefectureForLocation({ latitude: 26.213, longitude: 127.681 }), "沖縄");
  assert.equal(prefectureForLocation({ latitude: NaN, longitude: 139 }), null);
  assert.equal(prefectureForLocation({ latitude: 0, longitude: 0 }), null);
});
test("Places menu lookup uses existing IDs and considers every candidate without exposing website URLs", async (t) => {
  const priorKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-only";
  t.after(() => {
    if (priorKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = priorKey;
  });
  const candidates = cleanseCandidates(Array.from({ length: 8 }, (_, i) => ({
    id: `place_${i}`, name: `山梨食堂${i}`, address: "山梨県甲府市徳行1-13-18",
  })));
  const ids = [];
  const requests = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /^https:\/\/places\.googleapis\.com\/v1\/places\/place_\d$/);
    assert.equal(options.headers["X-Goog-FieldMask"], "id,websiteUri");
    assert.equal(options.headers["X-Goog-Api-Key"], "test-only");
    const id = url.split("/").at(-1);
    ids.push(id);
    if (id === "place_1") return Response.json({ id: "other", websiteUri: "https://other.example.com/" });
    if (id === "place_2") return new Response(null, { status: 429 });
    if (id === "place_3") return Response.json({ id, websiteUri: "https://127.0.0.1/" });
    if (id === "place_4") return Response.json({ id });
    return Response.json({ id, websiteUri: `https://shop${id.at(-1)}.example.com/` });
  });
  const read = [];
  const load = async (url) => {
    read.push(url.href);
    if (url.pathname === "/") return '<a href="https://outside.example.com/menu">メニュー</a><a href="/food">お品書き</a>';
    const branch = url.hostname.match(/\d/)[0];
    return `<h1>お品書き</h1><li>おざら 800円</li><img alt="ほうとう 800円" src="/image.jpg">
      <div hidden><p>ほうとう 800円</p></div><footer>山梨食堂${branch} 山梨県甲府市徳行1丁目13番${branch === "6" ? "180" : "18"}号</footer>`;
  };
  const enriched = await addPlacesMenus(candidates, undefined, undefined, load);
  assert.deepEqual(ids.sort(), candidates.map(({ id }) => id));
  assert.ok(read.every((url) => /^https:\/\/shop[0567]\.example\.com\/(?:food)?$/.test(url)));
  const last = enriched.find(({ id }) => id === "place_7");
  assert.equal(last.menuItems[0].source, "https://shop7.example.com/food");
  assert.deepEqual(last.menuItems.map(({ name }) => name), ["おざら"]);
  const results = await discoverRestaurants(enriched);
  assert.deepEqual(results.map(({ id }) => id), ["place_0", "place_5", "place_7"]);
  assert.equal(results[2].recommendationReason, "山梨名物のおざらを提供");
  assert.equal(Object.hasOwn(results[2], "websiteUri"), false);

  // The normal discovery path stays offline; the explicit entry point opts in.
  const count = requests.mock.callCount();
  assert.deepEqual(await discoverRestaurants(candidates, { officialMenuSource: "google-places" }), []);
  assert.equal(requests.mock.callCount(), count);
  const preverified = { ...candidates[4], localDishes: mockCandidates()[1].localDishes };
  const [offline] = await discoverRestaurantsWithOfficialMenus([{
    ...preverified, name: "ほうとう金峰", address: "山梨県甲府市徳行1丁目13-18",
  }]);
  assert.equal(offline.recommendationReason, "山梨名物のほうとうを提供");
  assert.equal(requests.mock.callCount(), count);
  assert.deepEqual(await discoverRestaurantsWithOfficialMenus([preverified], { officialMenuSource: "google-places" }), []);
  assert.equal(requests.mock.callCount(), count + 1);
  await assert.rejects(addPlacesMenus(candidates, undefined, AbortSignal.abort(), load), { name: "AbortError" });
});

test("Gemini reads an unpriced menu only after website verification and cannot invent a quote", async (t) => {
  for (const key of ["GOOGLE_PLACES_API_KEY", "GEMINI_API_KEY"]) {
    const previous = process.env[key];
    process.env[key] = "test-only";
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const candidates = cleanseCandidates([{
    id: "place_1", name: "山梨食堂", address: "山梨県甲府市徳行1-13-18",
  }]);
  let websiteUri = "https://shop.example.com/menu";
  let quote = "おざら";
  let geminiCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.startsWith("https://places.googleapis.com/")) return Response.json({ id: "place_1", websiteUri });
    geminiCalls++;
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.ok(input.pages[0].rows.includes("おざら"));
    assert.deepEqual(input.dishes, ["おざら"]);
    assert.equal(body.tools, undefined);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { text: JSON.stringify({ items: [{ page: 0, quote }] }) },
    ] } }] });
  });
  let menu = '<h1>お品書き</h1><h3>おざら</h3><footer>山梨食堂 山梨県甲府市徳行1-13-18</footer>';
  const run = () => addPlacesMenus(candidates, undefined, undefined, async () => menu, "test-model");
  const [recommendation] = await discoverRecommendations(await run());
  assert.equal(recommendation.restaurant.recommendationReason, "山梨名物のおざらを提供");
  assert.equal(recommendation.evidence.menuExcerpt, "おざら");
  quote = "ほうとう";
  assert.deepEqual(await run(), []);
  assert.equal(geminiCalls, 2);
  menu = menu.replace("おざら</h3>", "おざら 800円</h3>");
  assert.equal((await run()).length, 1);
  menu += "<p>おざらの提供はしていません。</p>";
  assert.deepEqual(await run(), []);
  websiteUri = undefined;
  assert.deepEqual(await run(), []);
  assert.equal(geminiCalls, 2);
});

test("menu page fetch rejects IP literals, private address ranges and non-HTTPS URLs", () => {
  for (const url of ["https://127.0.0.1/", "https://[::1]/", "https://0x7f000001/", "https://localhost/", "http://example.com/"]) {
    assert.equal(publicWebsiteUrl(url), null);
  }
  for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1"]) {
    assert.equal(isPublicIPv4(ip), false);
  }
  assert.equal(isPublicIPv4("8.8.8.8"), true);
});
