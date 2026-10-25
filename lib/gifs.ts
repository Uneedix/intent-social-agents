/** GIF provider proxy + validators. Server code only imports the API key from process.env; it never leaves the server. */
export type GifProvider = 'giphy' | 'tenor' | 'upload';
/** Stored on ChatMsg.gif / Post.gif. Always validate with validateGifAttachment before rendering. */
export type GifAttachment = { url: string; previewUrl?: string; width: number; height: number; title?: string; provider: GifProvider };
/** Normalized search result returned by /api/gifs/*. */
export type GifResult = { id: string; title: string; previewUrl: string; url: string; mp4Url?: string; width: number; height: number };
export type GifPage = { provider: 'giphy' | 'tenor'; results: GifResult[]; next: string | null };

export const GIF_LOCALES = ['en', 'ru', 'uk', 'pl', 'hu', 'de', 'fr', 'es'] as const;
export type GifLocale = typeof GIF_LOCALES[number];
export const GIF_MAX_QUERY = 50;
export const GIF_MAX_LIMIT = 24;
export const GIF_TIMEOUT_MS = 5000;
export const GIF_MAX_RESPONSE_BYTES = 1_500_000;
/** Max data: URL length for an uploaded GIF (about 1.1 MB of binary). Device-local demo storage only. */
export const GIF_MAX_UPLOAD_DATA_URL = 1_500_000;
export const GIF_MAX_UPLOAD_BYTES = 1_100_000;
const MAX_DIM = 4096;

const GIPHY_HOST = /^(?:media[0-9]?\.giphy\.com|i\.giphy\.com)$/;
const TENOR_HOST = /^media[0-9]?\.tenor\.com$/;
/** Exact provider media hosts. Anything else (incl. look-alike suffixes or IP literals) is rejected. */
export function isAllowedGifHost(hostname: string): boolean {
  return GIPHY_HOST.test(hostname) || TENOR_HOST.test(hostname);
}

/** https URL on an allowed media host, no credentials/port, <= 2048 chars. */
export function isAllowedGifUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && isAllowedGifHost(url.hostname);
}

const UPLOAD_PREFIX = 'data:image/gif;base64,';
export function isUploadGifDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= GIF_MAX_UPLOAD_DATA_URL && value.startsWith(UPLOAD_PREFIX)
    // base64 "GIF8" magic = R0lGOD
    && value.startsWith(`${UPLOAD_PREFIX}R0lGOD`) && /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(UPLOAD_PREFIX.length));
}

const isDim = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_DIM;
const PROVIDERS: readonly GifProvider[] = ['giphy', 'tenor', 'upload'];

/** Returns a clean copy or null. Unknown fields are dropped; provider must match the URL kind. */
export function validateGifAttachment(value: unknown): GifAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.provider !== 'string' || !PROVIDERS.includes(v.provider as GifProvider)) return null;
  const provider = v.provider as GifProvider;
  if (!isDim(v.width) || !isDim(v.height)) return null;
  if (provider === 'upload' ? !isUploadGifDataUrl(v.url) : !isAllowedGifUrl(v.url)) return null;
  const out: GifAttachment = { url: v.url as string, width: v.width, height: v.height, provider };
  if (v.previewUrl !== undefined) {
    if (!isAllowedGifUrl(v.previewUrl)) return null;
    out.previewUrl = v.previewUrl;
  }
  if (v.title !== undefined) {
    if (typeof v.title !== 'string') return null;
    out.title = v.title.slice(0, 140);
  }
  return out;
}

/** Turns a pasted link into a direct media URL on an allowed host. Supports giphy.com/gifs/<slug>-<id> page links. */
export function parseGifLink(input: string): { url: string; provider: 'giphy' | 'tenor' } | null {
  const text = input.trim();
  if (text.length > 2048) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (url.hostname === 'giphy.com' || url.hostname === 'www.giphy.com') {
    const m = /^\/(?:gifs|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{5,40})\/?$/.exec(url.pathname);
    return m ? { url: `https://i.giphy.com/${m[1]}.gif`, provider: 'giphy' } : null;
  }
  if (!isAllowedGifHost(url.hostname) || !/\.(?:gif|webp|mp4)$/i.test(url.pathname)) return null;
  return { url: url.href, provider: GIPHY_HOST.test(url.hostname) ? 'giphy' : 'tenor' };
}

export function isGifLocale(v: unknown): v is GifLocale {
  return typeof v === 'string' && (GIF_LOCALES as readonly string[]).includes(v);
}

export type GifRequest = { kind: 'search' | 'trending'; q: string; limit: number; cursor: string | null; locale: GifLocale };
const ALLOWED_PARAMS = { search: ['q', 'limit', 'cursor', 'locale'], trending: ['limit', 'cursor', 'locale'] };

/** Strict query validation: unknown/duplicate params, bad lengths or characters -> error string. */
export function parseGifRequest(kind: 'search' | 'trending', params: URLSearchParams): GifRequest | string {
  const keys = [...params.keys()];
  if (keys.some(k => !ALLOWED_PARAMS[kind].includes(k)) || new Set(keys).size !== keys.length) return 'Unsupported parameters.';
  let q = '';
  if (kind === 'search') {
    q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim();
    if (!q || q.length > GIF_MAX_QUERY || /[\u0000-\u001f\u007f]/.test(q)) return 'Query must be 1-50 characters.';
  }
  const limitRaw = params.get('limit') ?? String(GIF_MAX_LIMIT);
  if (!/^\d{1,2}$/.test(limitRaw) || +limitRaw < 1 || +limitRaw > GIF_MAX_LIMIT) return 'Invalid limit.';
  const cursor = params.get('cursor');
  if (cursor !== null && !/^[A-Za-z0-9._-]{1,64}$/.test(cursor)) return 'Invalid cursor.';
  const locale = params.get('locale') ?? 'en';
  if (!isGifLocale(locale)) return 'Unsupported locale.';
  return { kind, q, limit: +limitRaw, cursor, locale };
}

export class GifConfigError extends Error { code = 'gif_not_configured' as const; }

type Env = Record<string, string | undefined>;
export function gifProviderFromEnv(env: Env): { provider: 'giphy' | 'tenor'; key: string } | null {
  const giphy = env.GIPHY_API_KEY?.trim();
  if (giphy) return { provider: 'giphy', key: giphy };
  const tenor = env.TENOR_API_KEY?.trim();
  if (tenor) return { provider: 'tenor', key: tenor };
  return null;
}

/** Fixed upstream origins; user input only ever goes into encoded query parameters. */
export function buildUpstreamUrl(req: GifRequest, cfg: { provider: 'giphy' | 'tenor'; key: string }): URL {
  if (cfg.provider === 'giphy') {
    const url = new URL(`https://api.giphy.com/v1/gifs/${req.kind}`);
    url.searchParams.set('api_key', cfg.key);
    if (req.kind === 'search') { url.searchParams.set('q', req.q); url.searchParams.set('lang', req.locale); }
    url.searchParams.set('limit', String(req.limit));
    if (req.cursor) url.searchParams.set('offset', /^\d{1,4}$/.test(req.cursor) ? req.cursor : '0');
    url.searchParams.set('rating', 'pg-13');
    url.searchParams.set('bundle', 'messaging_non_clips');
    return url;
  }
  const url = new URL(`https://tenor.googleapis.com/v2/${req.kind === 'search' ? 'search' : 'featured'}`);
  if (req.kind === 'search') url.searchParams.set('q', req.q);
  url.searchParams.set('key', cfg.key);
  url.searchParams.set('client_key', 'intent_social');
  url.searchParams.set('limit', String(req.limit));
  if (req.cursor) url.searchParams.set('pos', req.cursor);
  url.searchParams.set('locale', req.locale);
  url.searchParams.set('contentfilter', 'medium'); // ~PG-13
  url.searchParams.set('media_filter', 'gif,tinygif,mp4,tinymp4');
  return url;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const dim = (v: unknown) => { const n = typeof v === 'string' ? Number(v) : v; return isDim(n) ? n : undefined; };
const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const safeId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined);
const title = (v: unknown) => (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);

/** Normalizes provider JSON; items whose media is not on an allowed host are dropped. */
export function normalizeGiphy(payload: unknown, req: GifRequest): GifPage {
  const body = rec(payload);
  const list = Array.isArray(body.data) ? body.data : [];
  const results: GifResult[] = [];
  for (const raw of list.slice(0, GIF_MAX_LIMIT)) {
    const item = rec(raw); const images = rec(item.images);
    const fixed = rec(images.fixed_width); const full = rec(images.downsized_medium ?? images.original); const orig = rec(images.original);
    const id = safeId(item.id);
    const url = str(full.url) ?? str(orig.url);
    const previewUrl = str(fixed.webp) ?? str(fixed.url);
    const mp4Url = str(orig.mp4) ?? str(fixed.mp4);
    const width = dim(orig.width) ?? dim(full.width); const height = dim(orig.height) ?? dim(full.height);
    if (!id || !isAllowedGifUrl(url) || !isAllowedGifUrl(previewUrl) || !width || !height) continue;
    if (mp4Url !== undefined && !isAllowedGifUrl(mp4Url)) continue;
    results.push({ id, title: title(item.title), previewUrl, url, ...(mp4Url ? { mp4Url } : {}), width, height });
  }
  const pg = rec(body.pagination);
  const offset = (typeof pg.offset === 'number' ? pg.offset : 0) + (typeof pg.count === 'number' ? pg.count : list.length);
  const total = typeof pg.total_count === 'number' ? pg.total_count : 0;
  const next = list.length >= req.limit && offset < Math.min(total || 5000, 4999) ? String(offset) : null;
  return { provider: 'giphy', results, next };
}

export function normalizeTenor(payload: unknown): GifPage {
  const body = rec(payload);
  const list = Array.isArray(body.results) ? body.results : [];
  const results: GifResult[] = [];
  for (const raw of list.slice(0, GIF_MAX_LIMIT)) {
    const item = rec(raw); const f = rec(item.media_formats);
    const gif = rec(f.gif); const tiny = rec(f.tinygif); const mp4 = rec(f.mp4);
    const id = safeId(item.id); const url = str(gif.url); const previewUrl = str(tiny.url) ?? url; const mp4Url = str(mp4.url);
    const dims = Array.isArray(gif.dims) ? gif.dims : [];
    const width = dim(dims[0]); const height = dim(dims[1]);
    if (!id || !isAllowedGifUrl(url) || !isAllowedGifUrl(previewUrl) || !width || !height) continue;
    if (mp4Url !== undefined && !isAllowedGifUrl(mp4Url)) continue;
    results.push({ id, title: title(item.content_description ?? item.title), previewUrl, url, ...(mp4Url ? { mp4Url } : {}), width, height });
  }
  const next = typeof body.next === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(body.next) && body.next !== '0' && list.length ? body.next : null;
  return { provider: 'tenor', results, next };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > GIF_MAX_RESPONSE_BYTES)) throw new Error('Invalid body length');
  if (!response.body) throw new Error('Missing body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0; let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > GIF_MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Too large'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

/** Throws GifConfigError when no key is configured, Error on any upstream problem (details never exposed). */
export async function loadGifs(req: GifRequest, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<GifPage> {
  const cfg = gifProviderFromEnv(env);
  if (!cfg) throw new GifConfigError('GIF provider not configured');
  const url = buildUpstreamUrl(req, cfg);
  const response = await fetcher(url.href, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(GIF_TIMEOUT_MS),
    next: { revalidate: req.kind === 'trending' ? 900 : 300 },
  } as RequestInit);
  if (!response.ok || response.redirected
    || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('GIF provider unavailable');
  }
  const payload = await readBoundedJson(response);
  return cfg.provider === 'giphy' ? normalizeGiphy(payload, req) : normalizeTenor(payload);
}

/** Shared GET handler for the two routes. */
export async function handleGifRoute(kind: 'search' | 'trending', request: Request, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<Response> {
  const noStore = { 'Cache-Control': 'no-store' };
  const parsed = parseGifRequest(kind, new URL(request.url).searchParams);
  if (typeof parsed === 'string') return Response.json({ error: parsed, code: 'bad_request' }, { status: 400, headers: noStore });
  try {
    const page = await loadGifs(parsed, env, fetcher);
    return Response.json(page, {
      headers: { 'Cache-Control': `public, max-age=${kind === 'trending' ? 300 : 120}, s-maxage=${kind === 'trending' ? 900 : 300}` },
    });
  } catch (error) {
    if (error instanceof GifConfigError) {
      return Response.json({ error: 'GIF search is not configured.', code: 'gif_not_configured' }, { status: 503, headers: noStore });
    }
    // No provider details, keys, URLs or stack traces.
    return Response.json({ error: 'GIF search is temporarily unavailable.', code: 'gif_unavailable' }, { status: 502, headers: noStore });
  }
}
