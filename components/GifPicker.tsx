'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link2, Search, Upload, X } from 'lucide-react';
import { useI18n } from './I18n';
import { LANG_CODES } from '../lib/i18n-dict';
import {
  GIF_MAX_QUERY, GIF_MAX_UPLOAD_BYTES, isGifLocale, isUploadGifDataUrl, parseGifLink,
  type GifAttachment, type GifPage, type GifProvider, type GifResult,
} from '../lib/gifs';
import s from './GifPicker.module.css';

export type GifPick = { id: string; url: string; previewUrl: string; width: number; height: number; title: string; mp4Url?: string; provider: GifProvider };

/** Converts a picker result into the stored attachment shape (ChatMsg.gif / Post.gif). */
export function toGifAttachment(pick: GifPick): GifAttachment {
  const out: GifAttachment = { url: pick.url, width: pick.width, height: pick.height, provider: pick.provider };
  if (pick.title) out.title = pick.title.slice(0, 140);
  if (pick.provider !== 'upload' && pick.previewUrl && pick.previewUrl !== pick.url) out.previewUrl = pick.previewUrl;
  return out;
}

type Status = 'loading' | 'ready' | 'error' | 'unconfigured';
export type GifPickerProps = {
  onPick: (gif: GifPick) => void;
  onClose?: () => void;
  variant?: 'auto' | 'popover' | 'sheet' | 'inline';
  autoFocus?: boolean;
  className?: string;
  /** Test/preview hook; defaults to window.fetch. */
  fetcher?: typeof fetch;
};

const clampDim = (n: number) => Math.min(4096, Math.max(1, Math.round(n) || 1));

function measure(url: string, video: boolean): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), 10000);
    const done = (w: number, h: number) => { window.clearTimeout(timer); if (w && h) resolve({ width: clampDim(w), height: clampDim(h) }); else reject(new Error('size')); };
    if (video) {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => { window.clearTimeout(timer); reject(new Error('load')); };
      v.src = url;
    } else {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => { window.clearTimeout(timer); reject(new Error('load')); };
      img.src = url;
    }
  });
}

export function GifPicker({ onPick, onClose, variant = 'auto', autoFocus = true, className, fetcher }: GifPickerProps) {
  const { t, lang } = useI18n();
  const locale = isGifLocale(LANG_CODES[lang]) ? LANG_CODES[lang] : 'en';
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<GifResult[]>([]);
  const [provider, setProvider] = useState<'giphy' | 'tenor' | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const id = window.setTimeout(() => setDebounced(query.trim().slice(0, GIF_MAX_QUERY)), 350); return () => window.clearTimeout(id); }, [query]);
  useEffect(() => { if (autoFocus) searchRef.current?.focus({ preventScroll: true }); }, [autoFocus]);

  const fetchPage = useCallback(async (q: string, cursor: string | null) => {
    const id = ++reqId.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit', '24');
    params.set('locale', locale);
    if (cursor) params.set('cursor', cursor);
    if (cursor) setLoadingMore(true); else { setStatus('loading'); setItems([]); setNext(null); }
    try {
      const res = await (fetcher ?? fetch)(`/api/gifs/${q ? 'search' : 'trending'}?${params}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      const body: unknown = await res.json().catch(() => null);
      if (id !== reqId.current) return; // stale response (query changed meanwhile)
      if (res.status === 503 && (body as { code?: string } | null)?.code === 'gif_not_configured') { setStatus('unconfigured'); return; }
      if (!res.ok || !body || !Array.isArray((body as GifPage).results)) { setStatus('error'); return; }
      const page = body as GifPage;
      setProvider(page.provider === 'tenor' ? 'tenor' : 'giphy');
      setItems(prev => {
        const seen = new Set(cursor ? prev.map(p => p.id) : []);
        return [...(cursor ? prev : []), ...page.results.filter(r => !seen.has(r.id) && seen.add(r.id))];
      });
      setNext(typeof page.next === 'string' ? page.next : null);
      setStatus('ready');
    } catch (error) {
      if (id !== reqId.current || (error as Error)?.name === 'AbortError') return;
      setStatus('error');
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  }, [fetcher, locale]);

  useEffect(() => { void fetchPage(debounced, null); }, [debounced, fetchPage]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(() => { if (next && !loadingMore && status === 'ready') void fetchPage(debounced, next); }, [next, loadingMore, status, debounced, fetchPage]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !next || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadMore(); }, { root: scrollRef.current, rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore]);

  /** Two balanced masonry columns by accumulated aspect height. */
  const columns = useMemo(() => {
    const cols: [GifResult[], GifResult[]] = [[], []];
    const heights = [0, 0];
    for (const it of items) { const c = heights[0] <= heights[1] ? 0 : 1; cols[c].push(it); heights[c] += it.height / it.width; }
    return cols;
  }, [items]);

  const pickResult = (r: GifResult) => onPick({ ...r, provider: provider ?? 'giphy' });

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'image/gif') { setNotice(t('Please choose a .gif file.')); return; }
    if (file.size > GIF_MAX_UPLOAD_BYTES) { setNotice(t('This GIF is too large (max 1 MB).')); return; }
    setBusy(true); setNotice('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file);
      });
      if (!isUploadGifDataUrl(dataUrl)) throw new Error('invalid');
      const { width, height } = await measure(dataUrl, false);
      onPick({ id: `upload-${Date.now()}`, url: dataUrl, previewUrl: dataUrl, width, height, title: file.name.slice(0, 140), provider: 'upload' });
    } catch { setNotice(t("Couldn't read this GIF.")); } finally { setBusy(false); }
  };

  const onLink = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseGifLink(link);
    if (!parsed) { setNotice(t('Only direct GIPHY or Tenor GIF links are supported.')); return; }
    setBusy(true); setNotice('');
    try {
      const isMp4 = /\.mp4$/i.test(new URL(parsed.url).pathname);
      const { width, height } = await measure(parsed.url, isMp4);
      onPick({ id: `link-${Date.now()}`, url: parsed.url, previewUrl: parsed.url, width, height, title: '', provider: parsed.provider });
      setLink('');
    } catch { setNotice(t("Couldn't load this GIF link.")); } finally { setBusy(false); }
  };

  const fallback = (
    <div className={s.fallback}>
      <button type="button" className={s.uploadButton} onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={15} aria-hidden /> {t('Upload GIF from device')}</button>
      <form className={s.linkForm} onSubmit={onLink}>
        <Link2 size={15} aria-hidden />
        <input type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} maxLength={2048} placeholder={t('Paste a GIPHY or Tenor link')} aria-label={t('Paste a GIPHY or Tenor link')} />
        <button type="submit" disabled={busy || !link.trim()}>{t('Add')}</button>
      </form>
      {notice && <p className={s.notice} role="alert">{notice}</p>}
    </div>
  );

  return (
    <div className={[s.root, s[variant], className].filter(Boolean).join(' ')} role="dialog" aria-label={t('GIFs')}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (query) setQuery(''); else onClose?.(); } }}>
      <div className={s.top}>
        <label className={s.search}>
          <Search size={15} aria-hidden />
          <input ref={searchRef} type="search" value={query} maxLength={GIF_MAX_QUERY} placeholder={t('Search GIFs')} aria-label={t('Search GIFs')}
            onChange={e => setQuery(e.target.value)} autoComplete="off" enterKeyHint="search" disabled={status === 'unconfigured'} />
        </label>
        <button type="button" className={s.iconBtn} aria-label={t('Upload GIF from device')} title={t('Upload GIF from device')} onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={16} /></button>
        {onClose && variant !== 'inline' && <button type="button" className={s.iconBtn} aria-label={t('Close')} onClick={onClose}><X size={16} /></button>}
        <input ref={fileRef} type="file" accept="image/gif" hidden onChange={onFile} />
      </div>

      <div ref={scrollRef} className={s.scroll} aria-busy={status === 'loading'}>
        {status === 'unconfigured' ? (
          <div className={s.state}>
            <strong>{t("GIF search isn't connected yet")}</strong>
            <p>{t('The site owner needs to add a GIPHY API key. You can still send a GIF from your device or paste a GIPHY/Tenor link.')}</p>
            {fallback}
          </div>
        ) : status === 'error' ? (
          <div className={s.state}>
            <p>{t("Couldn't load GIFs. Check your connection and try again.")}</p>
            <button type="button" className={s.retry} onClick={() => void fetchPage(debounced, null)}>{t('Try again')}</button>
            {fallback}
          </div>
        ) : status === 'loading' ? (
          <div className={s.masonry} aria-label={t('Loading GIFs…')}>
            {[0, 1].map(c => <div key={c} className={s.col}>{[0, 1, 2].map(i => <div key={i} className={s.skeleton} style={{ height: 90 + ((c + i) % 3) * 30 }} />)}</div>)}
          </div>
        ) : items.length === 0 ? (
          <div className={s.state}><p>{debounced ? t('No GIFs found for “{q}”', { q: debounced }) : t('No GIFs to show')}</p>{fallback}</div>
        ) : (
          <>
            <h3 className={s.heading}>{debounced ? t('Search results') : t('Trending')}</h3>
            <div className={s.masonry}>
              {columns.map((col, c) => (
                <div key={c} className={s.col}>
                  {col.map(r => (
                    <button key={r.id} type="button" className={s.tile} style={{ aspectRatio: `${r.width} / ${r.height}` }} onClick={() => pickResult(r)}
                      aria-label={r.title ? `GIF: ${r.title}` : 'GIF'} title={r.title || undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.previewUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {next && <div ref={sentinelRef} className={s.more}><button type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? t('Loading GIFs…') : t('Load more')}</button></div>}
          </>
        )}
      </div>
      {status !== 'unconfigured' && notice && <p className={s.notice} role="alert">{notice}</p>}
      <div className={s.attribution}>{provider === 'tenor' ? 'Powered by Tenor' : 'Powered by GIPHY'}</div>
    </div>
  );
}
