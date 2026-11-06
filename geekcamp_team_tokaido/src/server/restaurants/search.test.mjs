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
const { selectRestaurants, searchRestaurants } = await import("./search.ts");
const { fetchMockCandidates } = await import("./mock-data.ts");
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

test("regional evidence and opening status precede the five-result limit", async () => {
  const result = await searchRestaurants({ ...request, openNow: true }, signal);
  assert.equal(result.returnedCount, 5);
  assert.deepEqual(result.restaurants.map((r) => r.id), [3, 4, 5, 6, 7].map((n) => `mock-place-${n}`));
  assert.ok(result.restaurants.every((r) => r.isOpenNow === true && r.labels.includes("ご当地料理") && r.recommendationReason));
  const candidates = await fetchMockCandidates(request, signal);
  const unverified = candidates[8];
  assert.equal((await selectRestaurants([unverified], request, signal)).returnedCount, 0);
  assert.equal((await selectRestaurants([{ ...candidates[0], localDishes: candidates[0].localDishes.map((e) => ({ ...e, region: "大阪" })) }], request, signal)).returnedCount, 0);
});

test("mood promotes a distant candidate before slicing; unknown/negative intent never removes candidates", async () => {
  const result = await searchRestaurants({ ...request, mood: "麺が食べたい", openNow: true }, signal);
  assert.equal(result.restaurants[0].id, "mock-place-8");
  assert.equal(result.returnedCount, 5);
  const ordinary = await searchRestaurants(request, signal);
  for (const mood of ["がっつり", "そば以外"]) assert.deepEqual(await searchRestaurants({ ...request, mood }, signal), ordinary);
  assert.equal(ordinary.restaurants[0].reviewCount, 0);
  assert.equal(ordinary.restaurants[0].rating, null);
  assert.equal(ordinary.restaurants[1].isOpenNow, null);
});

test("empty, out-of-radius, missing coordinates, cancellation and concurrent conditions", async () => {
  assert.deepEqual(await selectRestaurants([], request, signal), { restaurants: [], returnedCount: 0 });
  assert.equal((await searchRestaurants({ ...request, location: { latitude: 0, longitude: 0 } }, signal)).returnedCount, 0);
  const candidates = await fetchMockCandidates(request, signal);
  assert.equal((await selectRestaurants([{ ...candidates[0], location: null }], request, signal)).returnedCount, 0);
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
