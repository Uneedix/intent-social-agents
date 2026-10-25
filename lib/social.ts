'use client';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useSession } from '../components/SessionBoundary';
import { readStored, storageKey, writeStored } from './storage';

export function notifyStorageFailure() {
  if(typeof window!=='undefined')window.dispatchEvent(new Event('intent-storage-error'));
}

export function useLocalStore() {
  const { scope } = useSession();
  return {
    scope,
    read: <T,>(key: string, fallback: T) => {
      try { return readStored(localStorage, storageKey(scope, key), fallback); } catch { return fallback; }
    },
    write: (key: string, value: unknown) => {
      let ok = false;
      try { ok = writeStored(localStorage, storageKey(scope, key), value); } catch { /* blocked */ }
      if (!ok) notifyStorageFailure();
      return ok;
    },
    remove: (key: string) => { try { localStorage.removeItem(storageKey(scope, key)); } catch { notifyStorageFailure(); } },
  };
}

/** localStorage-backed state. Reads after mount (SSR-safe), writes on change. */
export function useStored<T>(key: string, init: T) {
  const { scope } = useSession();
  const scopedKey = storageKey(scope, key);
  const [state, setState] = useState({ key: scopedKey, value: init, hydrated: false });
  const initial = useRef(init);
  useEffect(() => {
    let value = initial.current;
    try {
      value = readStored(localStorage, scopedKey, initial.current);
    } catch { /* corrupted or blocked storage: keep defaults */ }
    setState({ key: scopedKey, value, hydrated: true });
  }, [scopedKey]);
  useEffect(() => {
    if (!state.hydrated || state.key !== scopedKey) return;
    try { if (!writeStored(localStorage, scopedKey, state.value)) notifyStorageFailure(); }
    catch { notifyStorageFailure(); }
  }, [scopedKey, state]);
  const setValue = useCallback((update: SetStateAction<T>) => {
    setState(current => {
      const previous = current.key === scopedKey ? current.value : initial.current;
      return { key: scopedKey, hydrated: true, value: typeof update === 'function' ? (update as (v: T) => T)(previous) : update };
    });
  }, [scopedKey]);
  const value = state.key === scopedKey ? state.value : initial.current;
  return [value, setValue] as const;
}

/**
 * Downscale an image file in the browser and return a JPEG/PNG data URL.
 * Keeps local demo storage small (localStorage is ~5 MB per site).
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.84): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG, PNG, WebP or GIF).');
  if (file.size > 15 * 1024 * 1024) throw new Error('This image is larger than 15 MB.');
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/gif') return src; // keep animation
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('This image format is not supported.'));
    i.src = src;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = file.type === 'image/png';
  return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', quality);
}

export type Segment = { t: 'text' | 'tag' | 'mention' | 'link'; v: string };
/** Split text into plain text, #hashtags, @mentions and https links. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /(https:\/\/[^\s]+)|(#[\p{L}\p{N}_]{2,40})|(@[a-zA-Z0-9_.]{2,30})/gu;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    out.push({ t: m[1] ? 'link' : m[2] ? 'tag' : 'mention', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  const d = Math.round(h / 24); if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const uid = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
