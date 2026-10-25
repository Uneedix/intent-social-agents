import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET as searchGET } from '../app/api/gifs/search/route';
import { GET as trendingGET } from '../app/api/gifs/trending/route';
import {
  buildUpstreamUrl, handleGifRoute, isAllowedGifUrl, parseGifLink, parseGifRequest, validateGifAttachment, type GifRequest,
} from '../lib/gifs';

const KEY = 'test-secret-key-123';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const req = (path: string) => new Request(`http://localhost${path}`);
const gif = (id: string, host = 'media1.giphy.com') => ({
  id, title: `  Funny   ${id} `,
  images: {
    original: { url: `https://${host}/media/${id}/giphy.gif`, mp4: `https://${host}/media/${id}/giphy.mp4`, width: '480', height: '270' },
    downsized_medium: { url: `https://${host}/media/${id}/giphy-downsized.gif`, width: '480', height: '270' },
    fixed_width: { url: `https://${host}/media/${id}/200w.gif`, webp: `https://${host}/media/${id}/200w.webp`, width: '200', height: '113' },
  },
});

test('missing provider key -> 503 gif_not_configured, never calls upstream', async () => {
  let called = false;
  const res = await handleGifRoute('search', req('/api/gifs/search?q=cat'), {}, async () => { called = true; return json({}); });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { error: 'GIF search is not configured.', code: 'gif_not_configured' });
  assert.equal(called, false);
  // Real route handlers with an empty test env behave the same.
  const saved = { g: process.env.GIPHY_API_KEY, t: process.env.TENOR_API_KEY };
  delete process.env.GIPHY_API_KEY; delete process.env.TENOR_API_KEY;
  try {
    assert.equal((await searchGET(req('/api/gifs/search?q=cat'))).status, 503);
    assert.equal((await trendingGET(req('/api/gifs/trending'))).status, 503);
  } finally {
    if (saved.g !== undefined) process.env.GIPHY_API_KEY = saved.g;
    if (saved.t !== undefined) process.env.TENOR_API_KEY = saved.t;
  }
});

test('bad queries -> 400 before any upstream request', async () => {
  const bad = [
    '/api/gifs/search', '/api/gifs/search?q=', '/api/gifs/search?q=%20%20', `/api/gifs/search?q=${'a'.repeat(51)}`,
    '/api/gifs/search?q=cat&q=dog', '/api/gifs/search?q=cat&limit=0', '/api/gifs/search?q=cat&limit=25', '/api/gifs/search?q=cat&limit=abc',
    '/api/gifs/search?q=cat&locale=xx', '/api/gifs/search?q=cat&cursor=../../x', '/api/gifs/search?q=cat&api_key=evil',
    '/api/gifs/search?q=a%00b', '/api/gifs/search?q=cat&url=https://evil.example',
  ];
  for (const path of bad) {
    const res = await handleGifRoute('search', req(path), { GIPHY_API_KEY: KEY }, async () => { throw new Error('must not fetch'); });
    assert.equal(res.status, 400, path);
    assert.equal((await res.json()).code, 'bad_request');
  }
  const res = await handleGifRoute('trending', req('/api/gifs/trending?q=cat'), { GIPHY_API_KEY: KEY }, async () => { throw new Error('no'); });
  assert.equal(res.status, 400);
});

test('GIPHY: fixed upstream, encoded query, pg-13, provider media hosts filtered, key never returned', async () => {
  let seen: URL | undefined; let init: RequestInit | undefined;
  const res = await handleGifRoute('search', req('/api/gifs/search?q=cat%20%26%20dog%3Fx%3D1&limit=4&locale=ru&cursor=24'), { GIPHY_API_KEY: KEY }, async (input, options) => {
    seen = new URL(String(input)); init = options;
    return json({
      data: [gif('good1'), gif('evil', 'media.giphy.com.evil.example'), gif('good2', 'i.giphy.com'), { id: 'x', images: { original: { url: 'http://media.giphy.com/a.gif', width: 1, height: 1 } } }, gif('bad id!')],
      pagination: { offset: 24, count: 4, total_count: 100 },
    });
  });
  assert.equal(seen!.origin + seen!.pathname, 'https://api.giphy.com/v1/gifs/search');
  assert.equal(seen!.searchParams.get('q'), 'cat & dog?x=1');
  assert.equal(seen!.searchParams.get('rating'), 'pg-13');
  assert.equal(seen!.searchParams.get('limit'), '4');
  assert.equal(seen!.searchParams.get('offset'), '24');
  assert.equal(seen!.searchParams.get('lang'), 'ru');
  assert.equal(init?.redirect, 'error');
  assert.equal(init?.credentials, 'omit');
  assert.ok(init?.signal instanceof AbortSignal);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control') ?? '', /public, max-age=\d+/);
  const text = await res.text();
  assert.ok(!text.includes(KEY), 'API key must never reach the client');
  const body = JSON.parse(text);
  assert.equal(body.provider, 'giphy');
  assert.deepEqual(body.results.map((r: { id: string }) => r.id), ['good1', 'good2']);
  assert.deepEqual(body.results[0], {
    id: 'good1', title: 'Funny good1', previewUrl: 'https://media1.giphy.com/media/good1/200w.webp',
    url: 'https://media1.giphy.com/media/good1/giphy-downsized.gif', mp4Url: 'https://media1.giphy.com/media/good1/giphy.mp4', width: 480, height: 270,
  });
  assert.equal(body.next, '28');
});

test('Tenor fallback provider and upstream failures are opaque', async () => {
  let seen: URL | undefined;
  const res = await handleGifRoute('trending', req('/api/gifs/trending'), { TENOR_API_KEY: KEY }, async input => {
    seen = new URL(String(input));
    return json({ results: [
      { id: '123', content_description: 'hi', media_formats: { gif: { url: 'https://media.tenor.com/a/b.gif', dims: [320, 240] }, tinygif: { url: 'https://media.tenor.com/a/t.gif' }, mp4: { url: 'https://media.tenor.com/a/b.mp4' } } },
      { id: '456', media_formats: { gif: { url: 'https://tenor.com.evil.io/b.gif', dims: [320, 240] } } },
    ], next: 'CAgQ' });
  });
  assert.equal(seen!.origin + seen!.pathname, 'https://tenor.googleapis.com/v2/featured');
  assert.equal(seen!.searchParams.get('contentfilter'), 'medium');
  const body = await res.json();
  assert.equal(body.provider, 'tenor');
  assert.deepEqual(body.results.map((r: { id: string }) => r.id), ['123']);
  assert.equal(body.next, 'CAgQ');

  for (const upstream of [
    async () => json({ message: `bad key ${KEY}` }, 403),
    async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    async () => { throw new Error(`network ${KEY}`); },
    async () => new Response('x'.repeat(10), { headers: { 'Content-Type': 'application/json', 'Content-Length': '99999999' } }),
  ]) {
    const r = await handleGifRoute('search', req('/api/gifs/search?q=a'), { GIPHY_API_KEY: KEY }, upstream);
    assert.equal(r.status, 502);
    const t = await r.text();
    assert.ok(!t.includes(KEY));
    assert.equal(JSON.parse(t).code, 'gif_unavailable');
  }
});

test('GIPHY key wins when both keys exist; cursor is coerced to a numeric offset', () => {
  const r = parseGifRequest('search', new URLSearchParams('q=hi&cursor=abc')) as GifRequest;
  const url = buildUpstreamUrl(r, { provider: 'giphy', key: 'k' });
  assert.equal(url.searchParams.get('offset'), '0');
});

test('host allow-list and attachment validator', () => {
  for (const ok of ['https://media.giphy.com/a.gif', 'https://media4.giphy.com/a.mp4', 'https://i.giphy.com/x.gif', 'https://media.tenor.com/x.gif', 'https://media1.tenor.com/x.gif']) assert.ok(isAllowedGifUrl(ok), ok);
  for (const bad of ['http://media.giphy.com/a.gif', 'https://media.giphy.com.evil.com/a.gif', 'https://evilgiphy.com/a.gif', 'https://user:pw@media.giphy.com/a.gif',
    'https://media.giphy.com:444/a.gif', 'https://127.0.0.1/a.gif', 'javascript:alert(1)', 'https://giphy.com/gifs/x', 'https://media10.giphy.com/a.gif', 42, null]) assert.ok(!isAllowedGifUrl(bad), String(bad));

  const good = { url: 'https://media.giphy.com/media/x/giphy.gif', previewUrl: 'https://media.giphy.com/media/x/200w.webp', width: 480, height: 270, title: 'x', provider: 'giphy', extra: '<script>' };
  assert.deepEqual(validateGifAttachment(good), { url: good.url, previewUrl: good.previewUrl, width: 480, height: 270, title: 'x', provider: 'giphy' });
  assert.equal(validateGifAttachment({ ...good, url: 'https://evil.example/a.gif' }), null);
  assert.equal(validateGifAttachment({ ...good, previewUrl: 'data:image/gif;base64,R0lGODlh' }), null);
  assert.equal(validateGifAttachment({ ...good, width: 0 }), null);
  assert.equal(validateGifAttachment({ ...good, height: 1.5 }), null);
  assert.equal(validateGifAttachment({ ...good, provider: 'imgur' }), null);
  assert.equal(validateGifAttachment({ ...good, title: 5 }), null);
  assert.equal(validateGifAttachment('https://media.giphy.com/a.gif'), null);
  assert.equal(validateGifAttachment(null), null);
  assert.equal(validateGifAttachment({ ...good, title: 'y'.repeat(500) })?.title?.length, 140);
  // Uploads: only data:image/gif with GIF magic bytes, and a remote url can't claim provider "upload".
  assert.ok(validateGifAttachment({ url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', width: 1, height: 1, provider: 'upload' }));
  assert.equal(validateGifAttachment({ url: 'data:image/svg+xml;base64,PHN2Zz4=', width: 1, height: 1, provider: 'upload' }), null);
  assert.equal(validateGifAttachment({ url: 'data:image/gif;base64,PHN2Zz4=', width: 1, height: 1, provider: 'upload' }), null);
  assert.equal(validateGifAttachment({ url: 'data:image/gif;base64,R0lGOD"><script>', width: 1, height: 1, provider: 'upload' }), null);
  assert.equal(validateGifAttachment({ url: good.url, width: 1, height: 1, provider: 'upload' }), null);
  assert.equal(validateGifAttachment({ url: 'data:image/gif;base64,R0lGODlh', width: 1, height: 1, provider: 'giphy' }), null);
});

test('pasted links: giphy page links map to i.giphy.com; other hosts rejected', () => {
  assert.deepEqual(parseGifLink('https://giphy.com/gifs/cat-funny-JIX9t2j0ZTN9S'), { url: 'https://i.giphy.com/JIX9t2j0ZTN9S.gif', provider: 'giphy' });
  assert.deepEqual(parseGifLink(' https://media.tenor.com/abc/x.gif '), { url: 'https://media.tenor.com/abc/x.gif', provider: 'tenor' });
  for (const bad of ['https://evil.com/x.gif', 'http://media.giphy.com/x.gif', 'https://media.giphy.com/x.png', 'not a url', 'https://giphy.com/explore/cats']) assert.equal(parseGifLink(bad), null, bad);
});
