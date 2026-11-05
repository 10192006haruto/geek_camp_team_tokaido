import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DiscoverySession, INITIAL_CONDITIONS, candidateKey, rankByMood, scrollIntent, type Acquire, type DiscoveryRequest } from "./discovery.js";
import { DEMO_LOCATION, DEFAULT_FILTERS, previewResults } from "./preview.js";
const pool = previewResults({ ...DEFAULT_FILTERS, location: DEMO_LOCATION }, "success").restaurants;
const request: DiscoveryRequest = { conditions: { ...INITIAL_CONDITIONS }, location: DEMO_LOCATION, mode: "live", scenario: "success" };

test("mood and opening filters reuse candidates; radius, coordinates and explicit refresh retrieve again", async () => {
  let calls = 0;
  const session = new DiscoverySession(async () => { calls++; return { candidates: pool, scope: "returned" }; });
  await session.run(request);
  const ranked = await session.run({ ...request, conditions: { ...request.conditions, mood: "そば" } });
  assert.equal(ranked.displayed[0].id, pool[1].id);
  assert.equal(calls, 1);
  const open = await session.run({ ...request, conditions: { ...request.conditions, openNow: true } });
  assert.deepEqual(open.displayed.map((r) => r.id), [pool[0].id]);
  assert.equal(open.batch.candidates.length, 3);
  assert.equal(calls, 1);
  await session.run({ ...request, conditions: { ...request.conditions, radiusMeters: 3000 } });
  await session.run({ ...request, location: { ...DEMO_LOCATION, latitude: 35.69 } });
  assert.equal(calls, 3);
  await session.run(request, true);
  await session.run(request, true);
  assert.equal(calls, 5);
});
test("retrieval identity ignores mood and opening filters but separates modes", () => {
  assert.equal(candidateKey(request), candidateKey({ ...request, conditions: { ...request.conditions, mood: "カフェ", openNow: true } }));
  assert.notEqual(candidateKey(request), candidateKey({ ...request, mode: "demo" }));
});
test("ranking considers candidates beyond the first five", async () => {
  const candidates = Array.from({ length: 7 }, (_, i) => ({ ...pool[0], id: String(i), cuisineLabel: i === 6 ? "うどん" : "和食" }));
  const session = new DiscoverySession(async () => ({ candidates, scope: "demo-pool" }));
  const ordinary = await session.run(request);
  assert.equal(ordinary.displayed.length, 5);
  assert.ok(!ordinary.displayed.some((r) => r.id === "6"));
  const ranked = await session.run({ ...request, conditions: { ...request.conditions, mood: "麺もの" } });
  assert.equal(ranked.displayed[0].id, "6");
  assert.equal(ranked.batch.candidates.length, 7);
});
test("unknown intent/cuisine are retained; generated recommendations never determine matching", async () => {
  const candidates = [{ ...pool[0], cuisineLabel: null, recommendationReason: "そばが大人気" }, pool[1]];
  const signal = new AbortController().signal;
  assert.deepEqual((await rankByMood(candidates, "そば", signal)).map((r) => r.id), [pool[1].id, pool[0].id]);
  for (const mood of ["がっつり", "", "そば以外"]) assert.deepEqual(await rankByMood(candidates, mood, signal), candidates);
});
test("ranking failure, omission, duplicate and fabricated IDs fall back to normal order", async () => {
  for (const rank of [async () => { throw new Error("unavailable"); }, async () => pool.slice(1), async () => [pool[0], pool[0], pool[2]], async () => [...pool.slice(0, 2), { ...pool[2], id: "fake" }]]) {
    const session = new DiscoverySession(async () => ({ candidates: pool, scope: "returned" }), rank);
    const result = await session.run(request);
    assert.deepEqual(result.displayed, pool);
    assert.match(result.notice!, /通常/);
  }
});
test("ranker cannot change provider facts", async () => {
  const session = new DiscoverySession(async () => ({ candidates: pool, scope: "returned" }), async (items) => items.map((r) => ({ ...r, recommendationReason: "invented" })));
  assert.deepEqual((await session.run(request)).displayed, pool);
});
test("late requests cannot overwrite a newer candidate cache", async () => {
  let finish!: (value: { candidates: typeof pool; scope: "returned" }) => void;
  let calls = 0;
  const acquire: Acquire = async () => ++calls === 1 ? new Promise((resolve) => { finish = resolve; }) : { candidates: [pool[1]], scope: "returned" };
  const session = new DiscoverySession(acquire);
  const old = session.run(request);
  const rejected = assert.rejects(old, { name: "AbortError" });
  const nextRequest = { ...request, conditions: { ...request.conditions, radiusMeters: 3000 as const } };
  const fresh = await session.run(nextRequest);
  finish({ candidates: pool, scope: "returned" });
  await rejected;
  assert.deepEqual(fresh.displayed, [pool[1]]);
  assert.deepEqual((await session.run(nextRequest)).displayed, [pool[1]]);
  assert.equal(calls, 2);
});
test("cancelled slow ranking cannot commit", async () => {
  let finish!: (items: typeof pool) => void;
  const session = new DiscoverySession(async () => ({ candidates: pool, scope: "returned" }), () => new Promise((resolve) => { finish = resolve; }));
  const pending = session.run(request);
  await Promise.resolve(); session.cancel(); finish(pool);
  await assert.rejects(pending, { name: "AbortError" });
});
test("failed refresh preserves the previous candidate cache", async () => {
  let calls = 0;
  const session = new DiscoverySession(async () => { if (++calls === 2) throw new Error("offline"); return { candidates: pool, scope: "returned" }; });
  const previous = await session.run(request);
  await assert.rejects(session.run(request, true), /offline/);
  assert.deepEqual((await session.run(request)).batch, previous.batch);
});
test("only detail return restores position; all search completions go to top; cancel keeps position", () => {
  const saved = { y: 2400, cardId: pool[2].id };
  for (const action of ["search", "home", "detail"] as const) assert.deepEqual(scrollIntent(action, saved), { kind: "top" });
  assert.deepEqual(scrollIntent("back", saved), { kind: "restore", ...saved });
  assert.deepEqual(scrollIntent("cancel", saved), { kind: "keep" });
});

test("history keeps cancelled panel position and restores detail origin; old search versions never restore old scroll", async () => {
  const { restoreHistory, HOME_VIEW } = await import("./discovery.js");
  const result = await new DiscoverySession(async () => ({ candidates: pool, scope: "returned" })).run(request);
  const list = { ...HOME_VIEW, screen: "results" as const, y: 1800, cardId: pool[2].id, version: 2 };
  const detail = { ...list, screen: "detail" as const, selectedId: pool[2].id };
  assert.deepEqual(restoreHistory({ ...list, panel: true }, list, 2, result).intent, { kind: "keep" });
  assert.deepEqual(restoreHistory(detail, list, 2, result).intent, { kind: "restore", y: 1800, cardId: pool[2].id });
  assert.deepEqual(restoreHistory(detail, list, 3, result).intent, { kind: "top" });
  assert.equal(restoreHistory(list, detail, 2, result).selected?.id, pool[2].id);
  assert.equal(restoreHistory(list, detail, 2, null).view.screen, "home");
  assert.equal(restoreHistory(list, { ...detail, selectedId: "removed" }, 3, result).view.screen, "results");
  assert.deepEqual(restoreHistory(detail, HOME_VIEW, 2, result).intent, { kind: "top" });
});

test("legacy adapter sends no mood/search text and explicitly labels its limited candidate scope", async (context) => {
  const { acquireCandidates } = await import("./discovery.js");
  context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/restaurants/search");
    assert.deepEqual(JSON.parse(init.body as string), { location: DEMO_LOCATION, radiusMeters: 1000, cuisine: null, budgetMaxYen: null });
    return new Response(JSON.stringify({ restaurants: pool, returnedCount: pool.length }));
  });
  const batch = await acquireCandidates({ ...request, conditions: { ...request.conditions, mood: "そばが食べたい", openNow: true } }, new AbortController().signal);
  assert.equal(batch.scope, "returned");
  assert.equal(batch.candidates.length, 3);
});
