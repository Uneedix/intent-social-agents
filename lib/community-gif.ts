/**
 * Community channel messages only have a text `body`. A GIF is stored as one line:
 *   gif:<width>x<height>:<https url on an allowed provider host>
 * Parsing never trusts the body: the URL must pass lib/gifs.ts validation (exact
 * Giphy/Tenor media hosts, https, no credentials/port), otherwise it is plain text.
 * Uploaded GIFs (data: URLs) are device-local only and are never encoded here.
 */
import { isAllowedGifUrl, validateGifAttachment, type GifAttachment } from './gifs';

const PREFIX = 'gif:';
const RE = /^gif:(\d{1,4})x(\d{1,4}):(https:\/\/\S{1,2048})$/;

const providerOf = (url: string): 'giphy' | 'tenor' | null => {
  try { const h = new URL(url).hostname; return /giphy\.com$/.test(h) ? 'giphy' : /tenor\.com$/.test(h) ? 'tenor' : null; } catch { return null; }
};

/** Returns the stored body, or null when the GIF cannot be shared (upload or disallowed host). */
export function encodeGifBody(gif: Pick<GifAttachment, 'url' | 'width' | 'height' | 'provider'>): string | null {
  if (gif.provider === 'upload' || !isAllowedGifUrl(gif.url)) return null;
  const w = Math.round(gif.width), h = Math.round(gif.height);
  if (!(w >= 1 && w <= 4096 && h >= 1 && h <= 4096)) return null;
  const body = `${PREFIX}${w}x${h}:${gif.url}`;
  return RE.test(body) ? body : null;
}

/** A validated attachment for GifView, or null (render the body as plain text). */
export function parseGifBody(body: unknown): GifAttachment | null {
  if (typeof body !== 'string' || !body.startsWith(PREFIX)) return null;
  const m = RE.exec(body);
  if (!m) return null;
  const provider = providerOf(m[3]);
  if (!provider) return null;
  return validateGifAttachment({ url: m[3], width: Number(m[1]), height: Number(m[2]), provider });
}
