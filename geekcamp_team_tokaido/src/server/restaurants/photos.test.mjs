import '../../../scripts/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { normalizeNearbyResponse } = await import('./nearby-search.ts');
const { attachRestaurantPhotos } = await import('./photos.ts');

test('normalizes photo references, retains credits and rejects unrelated resources', () => {
  const normalize = (photos) => normalizeNearbyResponse({ places: [{ id: 'test', displayName: { text: '架空店舗' }, photos }] })[0];
  const c = normalize([{ name: 'places/test/photos/abc', authorAttributions: [{ displayName: '撮影者', uri: 'https://www.google.com/maps/contrib/test' }] }]);
  assert.equal(c.photoResource.name, 'places/test/photos/abc');
  assert.equal(c.photoResource.attributions[0].text, '撮影者');
  assert.equal(normalize([{ name: 'places/other/photos/abc' }]).photoResource, null);
  assert.equal(normalize([{ name: 'places/test/photos/abc', authorAttributions: [{}] }]).photoResource, null);
  assert.equal(normalize([]).photoResource, null);
});

test('fetches only selected photos, keeps secrets server-side and tolerates failure', async (t) => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'fake-secret';
  t.after(() => { globalThis.fetch = savedFetch; if (savedKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = savedKey; });
  const candidates = ['a', 'b', 'c'].map(id => ({ id, photoResource: { name: `places/${id}/photos/test`, attributions: [{ text: '撮影者', url: null }] } }));
  const results = ['a', 'b'].map(id => ({ id, photoUrl: null, photoAttributions: [] }));
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init.headers['X-Goog-Api-Key'], 'fake-secret');
    assert.ok(!String(url).includes('fake-secret'));
    if (String(url).includes('/b/')) throw new Error('unavailable');
    return Response.json({ photoUri: 'https://lh3.googleusercontent.com/example' });
  };
  await attachRestaurantPhotos(results, candidates, new AbortController().signal);
  assert.equal(calls.length, 2);
  assert.equal(results[0].photoUrl, 'https://lh3.googleusercontent.com/example');
  assert.equal(results[0].photoAttributions[0].text, '撮影者');
  assert.equal(results[1].photoUrl, null);
  globalThis.fetch = async () => Response.json({ photoUri: 'https://evil.example/photo' });
  results[0].photoUrl = null;
  await attachRestaurantPhotos(results, candidates, new AbortController().signal);
  assert.equal(results[0].photoUrl, null);
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { assert.fail('aborted fetch'); };
  await attachRestaurantPhotos(results, candidates, controller.signal);
});
