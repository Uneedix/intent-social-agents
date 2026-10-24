'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Play, Pause, Users, X } from 'lucide-react';
import type { Chat } from '../lib/data';
import { useT } from './I18n';

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export function Avatar({ chat, size: s = 48, dot }: { chat: Pick<Chat, 'kind' | 'avatar' | 'name' | 'online'>; size?: number; dot?: boolean }) {
  const st = { width: s, height: s };
  return <span className="ms-av" style={st}>
    {chat.kind === 'saved' ? <span className="ms-av-saved" style={st}><Bookmark size={s * 0.42} fill="currentColor" /></span>
      : chat.avatar ? <img src={chat.avatar} alt="" style={st} />
      : chat.kind === 'group' ? <span className="ms-av-logo" style={st}><Users size={s * 0.42} /></span>
      : <span className="ms-av-logo" style={{ ...st, fontSize: s * 0.32 }}>{initials(chat.name)}</span>}
    {dot && chat.online && <i />}</span>;
}

/** Decorative waveform bars, stable per message (not derived from audio). */
const bars = (seed: number, n = 28) => Array.from({ length: n }, (_, i) => { const x = Math.sin(seed * 9.13 + i * 1.7) * 10000; return 0.25 + Math.abs(x - Math.floor(x)) * 0.75; });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VoicePlayer({ src, duration, seed }: { src: string; duration: number; seed: number }) {
  const t = useT();
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const b = bars(seed);
  const total = duration || a.current?.duration || 0;
  const pct = total ? Math.min(1, pos / total) : 0;
  useEffect(() => { if (a.current) a.current.playbackRate = rate; }, [rate]);
  const toggle = () => { const el = a.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); };
  return <span className="vp" onClick={e => e.stopPropagation()}>
    <button type="button" className="vp-play" onClick={toggle} aria-label={t(playing ? 'Pause' : 'Play')}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
    <span className="vp-wave" onClick={e => { const el = a.current; if (!el || !total) return; const r = e.currentTarget.getBoundingClientRect(); el.currentTime = (e.clientX - r.left) / r.width * total; }}>
      {b.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} className={i / b.length < pct ? 'on' : ''} />)}</span>
    <small>{mmss(playing || pos ? pos : total)}</small>
    <button type="button" className="vp-rate" onClick={() => setRate(rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1)} aria-label={t('Playback speed')}>{rate}x</button>
    <audio ref={a} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }} onTimeUpdate={e => setPos(e.currentTarget.currentTime)} />
  </span>;
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({ title, onClose, children, className = '' }: { title?: ReactNode; onClose: () => void; children: ReactNode; className?: string }) {
  const t = useT();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="sh-backdrop" onClick={onClose}>
    <div className={'sh ' + className} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
      <span className="sh-grip" />
      {title && <div className="sh-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('Close')}><X size={20} /></button></div>}
      {children}
    </div>
  </div>;
}
