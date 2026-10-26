"use client";
import { useEffect, useRef, useState } from 'react';
import { Music2, Video, X } from 'lucide-react';
import { useSession } from './SessionBoundary';
import { useT } from './I18n';
import { deletePostMedia, POST_MEDIA_ACCEPT, readPostMedia, savePostMedia, type PostMediaAttachment } from '../lib/post-media';
import s from './PostMedia.module.css';

export function PostMediaView({ media }: { media: PostMediaAttachment }) {
  const { scope } = useSession();
  const t = useT();
  const [loaded, setLoaded] = useState<{ key: string; url: string; error?: string } | null>(null);
  const key = scope + ':' + media.id;
  useEffect(() => {
    let active = true, url = '';
    readPostMedia(scope, media).then(blob => {
      if (!active) return;
      if (!blob) { setLoaded({ key, url: '', error: 'This media file is not available on this device.' }); return; }
      url = URL.createObjectURL(blob); setLoaded({ key, url });
    }).catch(() => { if (active) setLoaded({ key, url: '', error: 'Could not load this media file.' }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [scope, key, media]);
  const current = loaded?.key === key ? loaded : null;
  return <div className={s.attachment}>
    <div className={s.label}>{media.kind === 'audio' ? <Music2 size={18} /> : <Video size={18} />}<strong>{media.name}</strong><small>{(media.size / 1024 / 1024).toFixed(1)} MB</small></div>
    {!current ? <small role="status">{t('Loading…')}</small> : current.error ? <small role="status">{t(current.error)}</small> : media.kind === 'audio'
      ? <audio controls preload="metadata" src={current.url} aria-label={media.name} onError={() => setLoaded({ key, url: current.url, error: 'This browser cannot play this media format.' })} />
      : <video controls playsInline preload="metadata" src={current.url} aria-label={media.name} onError={() => setLoaded({ key, url: current.url, error: 'This browser cannot play this media format.' })} />}
  </div>;
}
/** Pending uploads are deleted on cancel; published blobs remain available after reload. */
export function PostMediaPicker({ value, onChange, onBusy, disabled, isCommitted }: { value: PostMediaAttachment | null; onChange: (v: PostMediaAttachment | null) => void; onBusy: (v: boolean) => void; disabled?: boolean; isCommitted: () => boolean }) {
  const { scope } = useSession();
  const t = useT();
  const audio = useRef<HTMLInputElement>(null), video = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const active = useRef(true), pending = useRef<PostMediaAttachment | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; if (pending.current && !isCommitted()) void deletePostMedia(scope, pending.current.id).catch(() => {}); }; }, [scope, isCommitted]);
  async function take(file: File | undefined, kind: 'audio' | 'video') {
    if (!file || busy || disabled) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const next = await savePostMedia(scope, file, kind);
      if (!active.current) { void deletePostMedia(scope, next.id).catch(() => {}); return; }
      const previous = pending.current; pending.current = next; onChange(next);
      if (previous) void deletePostMedia(scope, previous.id).catch(() => {});
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Could not save this media file.'); }
    finally { if (active.current) { setBusy(false); onBusy(false); } if (audio.current) audio.current.value = ''; if (video.current) video.current.value = ''; }
  }
  function remove() { if (pending.current) void deletePostMedia(scope, pending.current.id).catch(() => {}); pending.current = null; onChange(null); setError(''); }
  return <div className={s.picker}>
    <div className={s.tools}>
      <button type="button" className="pill-btn" onClick={() => audio.current?.click()} disabled={disabled || busy} aria-label={t('Upload audio')}><Music2 size={17} />{t('Audio')}</button>
      <button type="button" className="pill-btn" onClick={() => video.current?.click()} disabled={disabled || busy} aria-label={t('Upload video')}><Video size={17} />{t('Video')}</button>
      <small>{t('MP3, WAV, OGG, M4A, FLAC · 25 MB / MP4, WebM · 50 MB')}</small>
    </div>
    <input ref={audio} type="file" accept={POST_MEDIA_ACCEPT.audio} hidden onChange={e => void take(e.target.files?.[0], 'audio')} />
    <input ref={video} type="file" accept={POST_MEDIA_ACCEPT.video} hidden onChange={e => void take(e.target.files?.[0], 'video')} />
    {busy && <small role="status">{t('Saving media on this device…')}</small>}
    {error && <small className={s.error} role="alert">{t(error)}</small>}
    {value && <div className={s.preview}><PostMediaView media={value} /><button type="button" className="icon-button" onClick={remove} disabled={busy} aria-label={t('Remove media')}><X size={18} /></button></div>}
  </div>;
}
