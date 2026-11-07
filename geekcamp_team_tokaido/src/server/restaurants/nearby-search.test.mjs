import '../../../scripts/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { buildNearbyRequest, fetchNearbyCandidates, normalizeNearbyResponse, NEARBY_FIELD_MASK, NEARBY_SEARCH_URL } = await import('./nearby-search.ts');
const { PlacesSearchError } = await import('./errors.ts');
const { selectReviewRestaurants } = await import('./review-results.ts');

const req = { location: { latitude: 35.6812, longitude: 139.7671 }, radiusMeters: 1000, mood: '', openNow: false };

// 架空の Places レスポンス（実在店舗・実レビューではない）
const review = (text, extra = {}) => ({
  text: { text, languageCode: 'ja' }, originalText: { text, languageCode: 'ja' }, rating: 4,
  publishTime: '2026-10-01T03:00:00Z', googleMapsUri: 'https://www.google.com/maps/reviews/fake',
  authorAttribution: { displayName: '架空投稿者', uri: 'https://www.google.com/maps/contrib/fake', photoUri: 'https://lh3.googleusercontent.com/fake' },
  ...extra,
});
const place = (extra = {}) => ({
  id: 'fake-place-1', displayName: { text: '【架空】ここメシ食堂', languageCode: 'ja' },
  location: { latitude: 35.6815, longitude: 139.7672 }, formattedAddress: '架空の住所',
  primaryTypeDisplayName: { text: '和食店', languageCode: 'ja' }, googleMapsUri: 'https://maps.google.com/?cid=1',
  rating: 4.2, userRatingCount: 12, priceLevel: 'PRICE_LEVEL_MODERATE', currentOpeningHours: { openNow: true },
  reviews: [review('天ぷらそばを食べました。')],
  ...extra,
});

function stubFetch(t, impl) {
  const saved = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return impl(url, init); };
  t.after(() => { globalThis.fetch = saved; });
  return calls;
}
function withKey(t, value = 'fake-places-key') {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  if (value === null) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = value;
  t.after(() => { if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved; });
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const code = (c) => (e) => e instanceof PlacesSearchError && e.code === c;

test('request body and field mask follow the plan (20 places, reviews, distance order)', () => {
  const body = buildNearbyRequest({ ...req, radiusMeters: 3000 });
  assert.equal(body.maxResultCount, 20);
  assert.equal(body.rankPreference, 'DISTANCE');
  assert.equal(body.languageCode, 'ja');
  assert.deepEqual(body.locationRestriction.circle, { center: req.location, radius: 3000 });
  assert.ok(NEARBY_FIELD_MASK.split(',').includes('places.reviews'));
  assert.ok(NEARBY_FIELD_MASK.split(',').includes('places.photos'));
});

test('normalizes a place into ReviewCandidate without inventing values', () => {
  const [c] = normalizeNearbyResponse({ places: [place()] });
  assert.equal(c.id, 'fake-place-1');
  assert.equal(c.name, '【架空】ここメシ食堂');
  assert.deepEqual(c.location, { latitude: 35.6815, longitude: 139.7672 });
  assert.equal(c.priceLevel, 'moderate');
  assert.equal(c.isOpenNow, true);
  assert.equal(c.cuisineLabel, '和食店');
  assert.equal(c.distanceMeters, null);
  assert.equal(c.photoUrl, null);
  assert.deepEqual(c.reviews[0], {
    index: 0, text: '天ぷらそばを食べました。', languageCode: 'ja', rating: 4, publishTime: '2026-10-01T03:00:00Z',
    author: { displayName: '架空投稿者', uri: 'https://www.google.com/maps/contrib/fake' },
    googleMapsUri: 'https://www.google.com/maps/reviews/fake', authorPhotoUrl: 'https://lh3.googleusercontent.com/fake',
    originalText: null, translated: false,
  });
});

test('unknown values stay null; 0 and false are kept', () => {
  const [c] = normalizeNearbyResponse({ places: [place({
    rating: undefined, userRatingCount: 0, priceLevel: 'PRICE_LEVEL_UNSPECIFIED', currentOpeningHours: { openNow: false },
    location: { latitude: 200, longitude: 139 }, formattedAddress: '', primaryTypeDisplayName: undefined,
  })] });
  assert.equal(c.rating, null);
  assert.equal(c.reviewCount, 0);
  assert.equal(c.priceLevel, null);
  assert.equal(c.isOpenNow, false);
  assert.equal(c.location, null);
  assert.equal(c.address, null);
  assert.equal(c.cuisineLabel, null);
  const [noHours] = normalizeNearbyResponse({ places: [place({ currentOpeningHours: undefined, userRatingCount: undefined })] });
  assert.equal(noHours.isOpenNow, null);
  assert.equal(noHours.reviewCount, null);
});

test('review indices are not renumbered after dropping reviews without text or author', () => {
  const [c] = normalizeNearbyResponse({ places: [place({ reviews: [
    review('そばを食べました。'), { ...review('x'), text: undefined }, review('定食を注文しました。'),
    review('うどんを食べました。', { authorAttribution: { displayName: '' } }), review('カレーを食べました。'), review('6件目'),
  ] })] });
  assert.deepEqual(c.reviews.map((r) => [r.index, r.text]), [[0, 'そばを食べました。'], [2, '定食を注文しました。'], [4, 'カレーを食べました。']]);
});

test('translated reviews keep the original text', () => {
  const [c] = normalizeNearbyResponse({ places: [place({ reviews: [review('ラーメンを食べました。', {
    originalText: { text: 'I had ramen.', languageCode: 'en' } })] })] });
  assert.equal(c.reviews[0].translated, true);
  assert.equal(c.reviews[0].originalText, 'I had ramen.');
});

test('drops places without id or name, duplicates, and unsafe links', () => {
  const list = normalizeNearbyResponse({ places: [
    place({ id: '' }), place({ displayName: undefined }), place(), place(),
    place({ id: 'fake-place-2', googleMapsUri: 'javascript:alert(1)', reviews: [review('そば', { googleMapsUri: 'http://www.google.com/x' })] }),
    place({ id: 'fake-place-3', googleMapsUri: 'https://evil.example.com/maps' }),
  ] });
  assert.deepEqual(list.map((c) => c.id), ['fake-place-1', 'fake-place-2', 'fake-place-3']);
  assert.equal(list[1].googleMapsUrl, null);
  assert.equal(list[1].reviews[0].googleMapsUri, null);
  assert.equal(list[2].googleMapsUrl, null);
});

test('empty and malformed responses', () => {
  assert.deepEqual(normalizeNearbyResponse({}), []);
  assert.deepEqual(normalizeNearbyResponse({ places: [] }), []);
  assert.throws(() => normalizeNearbyResponse(null), code('SEARCH_FAILED'));
  assert.throws(() => normalizeNearbyResponse({ places: 'x' }), code('SEARCH_FAILED'));
  assert.equal(normalizeNearbyResponse({ places: Array.from({ length: 25 }, (_, i) => place({ id: `p${i}` })) }).length, 20);
});

test('sends key and field mask in headers, never in the URL', async (t) => {
  withKey(t);
  const calls = stubFetch(t, () => json({ places: [place()] }));
  const result = await fetchNearbyCandidates(req, new AbortController().signal);
  assert.equal(result.length, 1);
  assert.equal(calls[0].url, NEARBY_SEARCH_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'fake-places-key');
  assert.equal(calls[0].init.headers['X-Goog-FieldMask'], NEARBY_FIELD_MASK);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.ok(!calls[0].url.includes('fake-places-key'));
});

test('missing key fails without calling Places', async (t) => {
  withKey(t, null);
  const calls = stubFetch(t, () => json({}));
  await assert.rejects(fetchNearbyCandidates(req, new AbortController().signal), code('SERVICE_UNAVAILABLE'));
  assert.equal(calls.length, 0);
});

test('maps HTTP failures to error codes', async (t) => {
  withKey(t);
  for (const [status, expected] of [[403, 'SERVICE_UNAVAILABLE'], [429, 'SERVICE_UNAVAILABLE'], [500, 'SEARCH_FAILED'], [400, 'SEARCH_FAILED']]) {
    stubFetch(t, () => json({ error: { message: 'raw upstream detail' } }, status));
    await assert.rejects(fetchNearbyCandidates(req, new AbortController().signal), (e) => {
      assert.equal(e.code, expected); assert.ok(!e.message.includes('raw upstream detail')); return true;
    });
  }
  stubFetch(t, () => new Response('not json', { status: 200 }));
  await assert.rejects(fetchNearbyCandidates(req, new AbortController().signal), code('SEARCH_FAILED'));
  stubFetch(t, () => { throw new TypeError('network down'); });
  await assert.rejects(fetchNearbyCandidates(req, new AbortController().signal), code('SEARCH_FAILED'));
});

test('deadline becomes UPSTREAM_TIMEOUT; user cancel stays AbortError', async (t) => {
  withKey(t);
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  stubFetch(t, hang);
  await assert.rejects(fetchNearbyCandidates(req, AbortSignal.timeout(20)), code('UPSTREAM_TIMEOUT'));
  const controller = new AbortController();
  const pending = fetchNearbyCandidates(req, controller.signal);
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
});

test('normalized candidates are accepted by the review selection step', () => {
  const candidates = normalizeNearbyResponse({ places: [place()] });
  const result = selectReviewRestaurants(candidates,
    [{ placeId: 'fake-place-1', items: [{ name: '天ぷらそば', evidence: [{ reviewIndex: 0, quote: '天ぷらそばを食べました。' }] }] }], req);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.restaurants[0].inferredMenu[0].evidence[0].author.text, '架空投稿者');
  assert.equal(result.restaurants[0].inferredMenu[0].evidence[0].reviewUrl, 'https://www.google.com/maps/reviews/fake');
});
