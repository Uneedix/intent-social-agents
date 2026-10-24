export const WIDGET_CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const;
export type WidgetCurrency = typeof WIDGET_CURRENCIES[number];
export type WidgetRates = {
  base: WidgetCurrency;
  date: string;
  rates: Record<WidgetCurrency, number>;
  source: 'Frankfurter';
};

const UPSTREAM = 'https://api.frankfurter.dev/v2/rates';
const MAX_RESPONSE_BYTES = 16_384;
const MAX_OBSERVATION_AGE_MS = 7 * 86_400_000;
export const RATES_REVALIDATE_SECONDS = 3600;
export const RATES_TIMEOUT_MS = 5000;

export function isWidgetCurrency(value: unknown): value is WidgetCurrency {
  return typeof value === 'string' && WIDGET_CURRENCIES.some(currency => currency === value);
}

/** Frankfurter v2 returns one row per pair, including the base identity row.
 * Official schema: https://api.frankfurter.dev/v2/openapi.json
 * These are daily reference observations, not executable or intraday quotes.
 */
function validateRates(value: unknown, base: WidgetCurrency, now: number): WidgetRates {
  if (!Array.isArray(value) || value.length !== WIDGET_CURRENCIES.length) throw new Error('Incomplete rates');
  const rates: Partial<Record<WidgetCurrency, number>> = {};
  let date: string | undefined;
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid rate');
    const row = candidate as Record<string, unknown>;
    const quote = row.quote;
    const rate = row.rate;
    if (row.base !== base || !isWidgetCurrency(quote)
      || typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0
      || Object.hasOwn(rates, quote) || (quote === base && rate !== 1)) {
      throw new Error('Invalid rate');
    }
    if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error('Invalid date');
    const observed = Date.parse(`${row.date}T00:00:00.000Z`);
    if (!Number.isFinite(observed) || new Date(observed).toISOString().slice(0, 10) !== row.date
      || observed > today || today - observed > MAX_OBSERVATION_AGE_MS
      || (date !== undefined && date !== row.date)) throw new Error('Invalid observation date');
    date = row.date;
    rates[quote] = rate;
  }
  if (!date || !WIDGET_CURRENCIES.every(currency => Object.hasOwn(rates, currency))) throw new Error('Incomplete rates');
  return { base, date, rates: rates as Record<WidgetCurrency, number>, source: 'Frankfurter' };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new Error('Invalid body length');
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export async function loadWidgetRates(base: WidgetCurrency, fetcher: typeof fetch = fetch, now = Date.now()): Promise<WidgetRates> {
  // Validate at both boundaries; callers cannot turn this into an arbitrary proxy.
  if (!isWidgetCurrency(base)) throw new Error('Invalid base');
  const url = new URL(UPSTREAM);
  url.searchParams.set('base', base);
  url.searchParams.set('quotes', WIDGET_CURRENCIES.join(','));
  // Pin the official date query to this request's UTC day. Unqualified "latest"
  // can include future-dated provider rows; never relabel or accept those rows.
  // A new UTC day also gets its own upstream cache key. Validate returned dates
  // independently in case the provider ignores the requested cutoff.
  url.searchParams.set('date', new Date(now).toISOString().slice(0, 10));
  const response = await fetcher(url.href, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(RATES_TIMEOUT_MS),
    next: { revalidate: RATES_REVALIDATE_SECONDS },
  });
  if (!response.ok || response.redirected || (response.url && response.url !== url.href)
    || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('Rates unavailable');
  }
  return validateRates(await readBoundedJson(response), base, now);
}
