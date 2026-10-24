import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET } from '../app/api/widgets/rates/route';
import { loadWidgetRates, RATES_TIMEOUT_MS, WIDGET_CURRENCIES, type WidgetCurrency } from '../lib/widget-rates';

const now = Date.UTC(2026, 9, 24, 12);
const observation = '2026-10-23';
function rows(base: WidgetCurrency = 'EUR', date = observation) {
  return WIDGET_CURRENCIES.map((quote, index) => ({ base, quote, date, rate: quote === base ? 1 : (index + 1) * 0.7 }));
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

test('rates use the fixed v2 origin, complete quote allowlist, timeout and hourly revalidation for every base', async () => {
  for (const base of WIDGET_CURRENCIES) {
    let calls = 0;
    const result = await loadWidgetRates(base, async (input, options) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://api.frankfurter.dev');
      assert.equal(url.pathname, '/v2/rates');
      assert.equal(url.searchParams.get('base'), base);
      assert.equal(url.searchParams.get('quotes'), 'USD,EUR,PLN,GBP,CHF');
      assert.equal(url.searchParams.get('date'), '2026-10-24');
      assert.deepEqual([...url.searchParams.keys()], ['base', 'quotes', 'date']);
      assert.equal(options?.method, 'GET');
      assert.equal(options?.redirect, 'error');
      assert.equal(options?.credentials, 'omit');
      assert.deepEqual(options?.headers, { Accept: 'application/json' });
      assert.equal((options as RequestInit & { next: { revalidate: number } }).next.revalidate, 3600);
      assert.ok(options?.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return json(rows(base));
    }, now);
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      base, date: observation,
      rates: Object.fromEntries(rows(base).map(row => [row.quote, row.rate])),
      source: 'Frankfurter',
    });
    assert.equal(result.rates[base], 1);
  }
});

test('the upstream date cutoff follows UTC midnight and never rewrites provider dates', async () => {
  for (const instant of ['2026-10-24T23:59:59.999Z', '2026-10-25T00:00:00.000Z', '2026-10-24T23:30:00-02:00']) {
    const timestamp = Date.parse(instant);
    const utcDate = new Date(timestamp).toISOString().slice(0, 10);
    const result = await loadWidgetRates('EUR', async input => {
      assert.equal(new URL(String(input)).searchParams.get('date'), utcDate);
      // A legitimate previous observation keeps its source date in the response.
      return json(rows('EUR', '2026-10-23'));
    }, timestamp);
    assert.equal(result.date, '2026-10-23');
  }
  await assert.rejects(loadWidgetRates('EUR', async input => {
    assert.equal(new URL(String(input)).searchParams.get('date'), '2026-10-24');
    return json(rows('EUR', '2026-10-25'));
  }, now), 'future rows must still fail if the provider ignores the date cutoff');
});

test('invalid or ambiguous query parameters return 400 without any upstream fetch', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
  for (const query of ['base=', 'base=eur', 'base=JPY', 'base=__proto__', 'base=https%3A%2F%2F127.0.0.1',
    'base=EUR&base=USD', 'base=EUR&url=https://127.0.0.1', 'base=EUR%26quotes%3DBTC']) {
    const response = await GET(new Request(`https://intent.example/api/widgets/rates?${query}`));
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  await assert.rejects(loadWidgetRates('https://127.0.0.1' as WidgetCurrency, fetch));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('route defaults to EUR, serves validated response and limits public caching', async t => {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    assert.equal(new URL(String(input)).searchParams.get('base'), 'EUR');
    return json(rows('EUR', new Date().toISOString().slice(0, 10)));
  });
  const response = await GET(new Request('https://intent.example/api/widgets/rates'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300, s-maxage=3600, must-revalidate');
  assert.equal((await response.json()).source, 'Frankfurter');
});

test('malformed, stale, mixed-base and incomplete rates are rejected rather than invented', async t => {
  const cases: Array<[string, unknown]> = [
    ['v1 shape', { base: 'EUR', date: observation, rates: { USD: 1 } }],
    ['empty', []], ['missing currency', rows().slice(1)],
    ['duplicate currency', [rows()[0], rows()[0], ...rows().slice(2)]],
    ['unexpected quote', rows().map((row, i) => i === 0 ? { ...row, quote: 'JPY' } : row)],
    ['old base after selection changed', rows('USD')],
    ['one wrong base', rows().map((row, i) => i === 0 ? { ...row, base: 'GBP' } : row)],
    ['invalid calendar day', rows('EUR', '2026-02-30')],
    ['invalid format', rows('EUR', '2026-10-23T00:00:00Z')],
    ['future date', rows('EUR', '2026-10-25')],
    ['stale observation', rows('EUR', '2026-10-16')],
    ['mixed observation dates', rows().map((row, i) => i === 0 ? { ...row, date: '2026-10-22' } : row)],
    ['wrong identity rate', rows().map(row => row.quote === 'EUR' ? { ...row, rate: 1.01 } : row)],
    ...[0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1.25', null].map(value => [
      `invalid rate ${String(value)}`, rows().map((row, i) => i === 0 ? { ...row, rate: value } : row),
    ] as [string, unknown]),
  ];
  for (const [label, payload] of cases) {
    await t.test(label, async () => {
      await assert.rejects(loadWidgetRates('EUR', async () => json(payload), now));
    });
  }
  const oldestAccepted = await loadWidgetRates('EUR', async () => json(rows('EUR', '2026-10-17')), now);
  assert.equal(oldestAccepted.date, '2026-10-17', 'allow a bounded weekend/holiday publication gap');
});

test('upstream failures, redirect attempts, body limits and invalid JSON cannot reach clients as rates', async t => {
  const redirected = json(rows());
  Object.defineProperty(redirected, 'redirected', { value: true });
  const wrongHost = json(rows());
  Object.defineProperty(wrongHost, 'url', { value: 'https://127.0.0.1/internal' });
  const responses = [
    json({ message: 'private upstream diagnostics' }, 503),
    new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/internal' } }),
    new Response('<html>provider error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(rows()).replace('"rate":0.7', '"rate":1e309'), { headers: { 'Content-Type': 'application/json' } }),
    new Response(' '.repeat(16_385), { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' } }),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error('Read failed')); } }), { headers: { 'Content-Type': 'application/json' } }),
    redirected, wrongHost,
  ];
  for (const upstream of responses) {
    t.mock.method(globalThis, 'fetch', async () => upstream);
    const response = await GET(new Request('https://intent.example/api/widgets/rates?base=EUR'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Exchange rates are temporarily unavailable.' });
  }
});

test('a rejected network request returns no upstream diagnostics', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Private upstream connection failure'); });
  const response = await GET(new Request('https://intent.example/api/widgets/rates?base=USD'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Exchange rates are temporarily unavailable.' });
});

test('network and timeout failures return a safe uncacheable 503 without fallback values', async t => {
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, RATES_TIMEOUT_MS);
    return AbortSignal.abort(new DOMException('Synthetic timeout', 'TimeoutError'));
  });
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(options?.signal?.aborted, true);
    throw options?.signal?.reason;
  });
  const response = await GET(new Request('https://intent.example/api/widgets/rates?base=CHF'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Exchange rates are temporarily unavailable.' });
});
