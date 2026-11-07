import '../../../scripts/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { prepareReviewResults, selectReviewRestaurants } = await import('./review-results.ts');
const { parseSearchResponse } = await import('../../app/_lib/search.ts');
const req = { location: { latitude: 35.6812, longitude: 139.7671 }, radiusMeters: 1000, mood: '', openNow: false };
const candidates = () => Array.from({ length: 20 }, (_, i) => ({ id: `place-${i}`, name: `架空店舗${i}`,
  location: { latitude: req.location.latitude + i * 0.00001, longitude: req.location.longitude },
  address: null, distanceMeters: null, rating: null, reviewCount: 0, photoUrl: null, openingHours: null, priceLevel: null,
  isOpenNow: i > 4, cuisineLabel: null, googleMapsUrl: null, attributions: [], photoAttributions: [],
  reviews: [{ index: 0, text: i === 19 ? 'そばを食べました。' : '定食を食べました。', languageCode: 'ja', rating: null,
    publishTime: null, author: { displayName: `架空投稿者${i}`, uri: null }, googleMapsUri: null }] }));
const inference = (cs) => cs.map((c) => ({ placeId: c.id, items: [{ name: c.reviews[0].text.startsWith('そば') ? 'そば' : '定食',
  evidence: [{ reviewIndex: 0, quote: c.reviews[0].text }] }] }));

test('20 candidates are filtered before the five-result limit; last candidate can rank first', () => {
  const cs = candidates(); cs[5].isOpenNow = null;
  const result = inference(cs); result[6].items = [];
  const selected = selectReviewRestaurants(cs, result, { ...req, mood: '麺', openNow: true });
  assert.deepEqual(selected.restaurants.map((r) => r.id), [19, 7, 8, 9, 10].map((i) => `place-${i}`));
  assert.equal(selected.restaurants[0].inferredMenu[0].evidence[0].author.text, '架空投稿者19');
  assert.equal(selected.restaurants[0].reviewCount, 0); assert.equal(selected.restaurants[0].rating, null);
  assert.ok(!('reviews' in selected.restaurants[0]));
  assert.deepEqual(parseSearchResponse(selected), selected);
});

test('invalid citations, missing locations, radius, unknown opening and empty results', () => {
  const cs = candidates().slice(0, 2); const result = inference(cs);
  result[0].items[0].evidence[0].quote = '架空の定食';
  assert.equal(selectReviewRestaurants(cs, result, req).returnedCount, 1);
  assert.equal(selectReviewRestaurants(cs, result, { ...req, openNow: true }).returnedCount, 0);
  assert.equal(selectReviewRestaurants(cs, result, { ...req, location: { latitude: 0, longitude: 0 } }).returnedCount, 0);
  cs[1].location = null;
  assert.equal(selectReviewRestaurants(cs, result, req).returnedCount, 0);
  assert.deepEqual(selectReviewRestaurants([], [], req), { restaurants: [], returnedCount: 0, uncheckedCount: 0 });
});

test('normalized candidates reach Gemini and frontend without any Nearby call', async (t) => {
  const saved = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'fake-key';
  t.after(() => { if (saved === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved; });
  let calls = 0;
  const cs = candidates();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++; assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    const sent = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
    assert.equal(sent.places.length, 20); assert.ok(!JSON.stringify(sent).includes('架空投稿者'));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ results: inference(cs) }) }] } }] });
  });
  const result = await prepareReviewResults(cs, { ...req, mood: 'そば', openNow: true }, new AbortController().signal);
  assert.equal(calls, 1); assert.equal(parseSearchResponse(result).returnedCount, 5);
  assert.equal(result.restaurants[0].id, 'place-19');
});

test('empty reviews skip communication and caller abort or expired deadline never succeeds', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected API'); });
  const cs = candidates().map((c) => ({ ...c, reviews: [] }));
  assert.equal((await prepareReviewResults(cs, req, new AbortController().signal)).returnedCount, 0);
  await assert.rejects(prepareReviewResults(cs, req, AbortSignal.abort()), { name: 'AbortError' });
  await assert.rejects(prepareReviewResults(cs, req, AbortSignal.abort(new DOMException('deadline', 'TimeoutError'))), { code: 'UPSTREAM_TIMEOUT' });
});
