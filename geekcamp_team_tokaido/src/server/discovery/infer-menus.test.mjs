import '../../../scripts/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { inferMenus, parseMenuInference, MenuInferenceError } = await import('./infer-menus.ts');
const candidate = { id: 'one', reviews: [{ index: 2, text: '昼にそばを食べました。', author: { displayName: 'private author', uri: null } }] };
const output = { results: [{ placeId: 'one', items: [{ name: 'そば', evidence: [{ reviewIndex: 2, quote: '昼にそばを食べました。' }] }] }] };
const response = (value = output, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] }));
const signal = () => new AbortController().signal;
function setup(t, key = 'test-key') { const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = key; t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }); }

test('batch request sends only IDs/review text and returns original candidate order', async (t) => {
  setup(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    assert.match(url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.ok(init.signal instanceof AbortSignal);
    const body = JSON.parse(init.body);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), { places: [{ placeId: 'one', reviews: [{ index: 2, text: candidate.reviews[0].text }] }] });
    assert.ok(!init.body.includes('private author') && !init.body.includes('test-key'));
    return response();
  });
  const result = await inferMenus([{ id: 'empty', reviews: [] }, candidate], signal());
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ placeId: 'empty', items: [] }, output.results[0]]);
});

test('empty reviews skip API; blank text is ignored without renumbering', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call'); });
  assert.deepEqual(await inferMenus([], signal()), []);
  assert.deepEqual(await inferMenus([{ id: 'blank', reviews: [{ index: 4, text: ' ' }] }], signal()), [{ placeId: 'blank', items: [] }]);
});

test('invalid, duplicate, out-of-range and oversized input fails before sending', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call'); });
  for (const input of [null, [candidate, candidate], Array(21).fill(candidate), [{ id: 'a', reviews: [{ index: 5, text: 'x' }] }],
    [{ id: 'a', reviews: [{ index: 0, text: 'x'.repeat(200001) }] }], [{ ...candidate, reviews: [candidate.reviews[0], candidate.reviews[0]] }]])
    await assert.rejects(inferMenus(input, signal()), { code: 'SEARCH_FAILED' });
});

test('missing credentials are unavailable, not an empty inference', async (t) => {
  setup(t, '');
  await assert.rejects(inferMenus([candidate], signal()), { code: 'SERVICE_UNAVAILABLE' });
});

test('unknown/missing/duplicate IDs and invalid output structure are rejected', () => {
  for (const value of [null, {}, { ...output, extra: true }, { results: [] }, { results: [output.results[0], output.results[0]] },
    { results: [{ ...output.results[0], placeId: 'invented' }] },
    { results: [{ placeId: 'one', items: [{ name: 'そば', evidence: [] }] }] },
    { results: [{ placeId: 'one', items: [{ name: 'そば', evidence: [{ reviewIndex: 0, quote: 'そば' }] }] }] }])
    assert.throws(() => parseMenuInference(value, [candidate]), MenuInferenceError);
});

test('invented quotes, blank quotes and dish names not in quotation are discarded', () => {
  for (const [name, quote] of [['そば', 'そばは人気'], ['そば', ''], ['カレー', candidate.reviews[0].text]]) {
    assert.deepEqual(parseMenuInference({ results: [{ placeId: 'one', items: [{ name, evidence: [{ reviewIndex: 2, quote }] }] }] }, [candidate]), [{ placeId: 'one', items: [] }]);
  }
  assert.deepEqual(parseMenuInference(output, [candidate]), output.results);
});

test('HTTP failures become bounded error codes without raw provider data', async (t) => {
  setup(t);
  for (const [status, code] of [[400, 'SEARCH_FAILED'], [401, 'SERVICE_UNAVAILABLE'], [403, 'SERVICE_UNAVAILABLE'], [404, 'SERVICE_UNAVAILABLE'], [429, 'SERVICE_UNAVAILABLE'], [500, 'SEARCH_FAILED']]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('sensitive provider payload', { status }));
    await assert.rejects(inferMenus([candidate], signal()), (e) => e.code === code && !e.message.includes('sensitive'));
    mock.mock.restore();
  }
});

test('invalid JSON, blocked and truncated replies are not returned as zero results', async (t) => {
  setup(t);
  for (const value of [() => new Response('not-json'), () => response(output, 'MAX_TOKENS'), () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => value());
    await assert.rejects(inferMenus([candidate], signal()), { code: 'SEARCH_FAILED' }); mock.mock.restore();
  }
});

test('caller cancellation and deadline propagate with distinct outcomes', async (t) => {
  setup(t);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(inferMenus([candidate], controller.signal), { name: 'AbortError' });
  const timed = new AbortController(); timed.abort(new DOMException('deadline', 'TimeoutError'));
  await assert.rejects(inferMenus([candidate], timed.signal), { code: 'UPSTREAM_TIMEOUT' });
  const running = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { running.abort(); return response(); });
  await assert.rejects(inferMenus([candidate], running.signal), { name: 'AbortError' });
});

test('concurrent searches cannot exchange review IDs or output', async (t) => {
  setup(t);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const { places } = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
    return response({ results: places.map((p) => ({ placeId: p.placeId, items: [] })) });
  });
  const [a, b] = await Promise.all([inferMenus([candidate], signal()), inferMenus([{ ...candidate, id: 'two' }], signal())]);
  assert.deepEqual(a, [{ placeId: 'one', items: [] }]); assert.deepEqual(b, [{ placeId: 'two', items: [] }]);
});
