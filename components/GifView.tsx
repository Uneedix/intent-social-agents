'use client';
import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useT } from './I18n';
import { validateGifAttachment } from '../lib/gifs';
import s from './GifPicker.module.css';

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return document.documentElement.classList.contains('intent-reduce-motion')
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export type GifViewProps = {
  /** Untrusted stored value (ChatMsg.gif / Post.gif). Validated here; invalid data renders nothing. */
  gif: unknown;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
};

/** Renders a GIF/mp4 only from allowed provider hosts or an uploaded data:image/gif. Tap toggles play/pause. */
export function GifView({ gif, maxWidth = 320, maxHeight = 320, className }: GifViewProps) {
  const t = useT();
  const valid = validateGifAttachment(gif);
  const [playing, setPlaying] = useState(true);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isVideo = !!valid && valid.provider !== 'upload' && /\.mp4(?:$|\?)/i.test(valid.url);

  useEffect(() => { if (prefersReducedMotion()) setPlaying(false); }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (v) { if (playing) v.play().catch(() => setPlaying(false)); else v.pause(); }
  }, [playing]);

  if (!valid) return null;
  const scale = Math.min(1, maxWidth / valid.width, maxHeight / valid.height);
  const w = Math.max(80, Math.round(valid.width * scale));
  const h = Math.max(40, Math.round(valid.height * scale));
  const label = valid.title ? `GIF: ${valid.title}` : 'GIF';

  /** Freezes a GIF by drawing its current frame (display only; never read back, so cross-origin is fine). */
  const freeze = () => {
    const img = imgRef.current; const c = canvasRef.current;
    if (!img || !c || !img.complete) return;
    c.width = w; c.height = h;
    try { c.getContext('2d')?.drawImage(img, 0, 0, w, h); } catch { /* ignore */ }
  };
  const toggle = () => { if (playing && !isVideo) freeze(); setPlaying(p => !p); };

  if (failed) return <div className={[s.gifView, s.gifFailed, className].filter(Boolean).join(' ')} style={{ width: w, height: h }}>{t('GIF unavailable')}</div>;
  return (
    <button type="button" className={[s.gifView, className].filter(Boolean).join(' ')} style={{ width: w, height: h }}
      onClick={toggle} aria-pressed={playing} aria-label={`${label}. ${playing ? t('Pause GIF') : t('Play GIF')}`}>
      {isVideo ? (
        <video ref={videoRef} src={valid.url} poster={valid.previewUrl} width={w} height={h} muted loop playsInline
          autoPlay={playing} preload="metadata" onError={() => setFailed(true)} aria-hidden />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={valid.url} alt="" width={w} height={h} loading="lazy" decoding="async" referrerPolicy="no-referrer"
            onError={() => setFailed(true)} onLoad={() => { if (!playing) freeze(); }} style={{ visibility: playing ? 'visible' : 'hidden' }} />
          <canvas ref={canvasRef} aria-hidden className={s.gifFrame} style={{ display: playing ? 'none' : 'block' }} />
        </>
      )}
      {!playing && <span className={s.gifBadge} aria-hidden><Play size={14} /> GIF</span>}
    </button>
  );
}
