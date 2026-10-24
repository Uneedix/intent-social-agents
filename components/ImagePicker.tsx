'use client';
import { useT } from './I18n';
import { useId, useRef, useState, type DragEvent } from 'react';
import { Camera, ImagePlus, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { compressImage } from '../lib/social';

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChange: (dataUrl: string) => void;
  shape?: 'circle' | 'wide' | 'tall';
  maxSide?: number;
};

/** Styled image upload tile: preview, drag & drop, change and remove. */
export default function ImagePicker({ label, hint, value, onChange, shape = 'wide', maxSide = 1600 }: Props) {
  const t = useT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);

  async function take(file?: File) {
    if (!file) return;
    setBusy(true); setError('');
    try { onChange(await compressImage(file, maxSide)); }
    catch (e) { setError(e instanceof Error ? e.message : t('Upload failed')); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); };

  return (
    <div className={`img-picker ${shape} ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <button type="button" className="img-picker-preview" onClick={() => input.current?.click()} aria-describedby={`${id}-hint`} aria-label={value ? `Change ${label}` : `Upload ${label}`}>
        {value ? <img src={value} alt="" /> : <span className="img-picker-empty">{shape === 'circle' ? <Camera size={26} /> : <ImagePlus size={28} />}</span>}
        {busy && <span className="img-picker-busy"><Loader2 size={22} className="spin" /></span>}
      </button>
      <div className="img-picker-info">
        <strong>{label}</strong>
        <small id={`${id}-hint`}>{hint || t('JPG, PNG or WebP. Drag & drop or click to choose.')}</small>
        <div className="img-picker-actions">
          <button type="button" className="pill-btn light" onClick={() => input.current?.click()} disabled={busy}>
            {value ? <><RefreshCw size={15} /> {t("Change")}</> : <><ImagePlus size={15} /> {t("Upload photo")}</>}
          </button>
          {value && <button type="button" className="pill-btn ghost" onClick={() => onChange('')}><Trash2 size={15} /> {t("Remove")}</button>}
        </div>
        {error && <small className="img-picker-error" role="alert">{error}</small>}
      </div>
      <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => void take(e.target.files?.[0])} />
    </div>
  );
}

/** Up to `max` images for a post, shown as removable thumbnails. */
export function MediaPicker({ images, onChange, max = 4 }: { images: string[]; onChange: (v: string[]) => void; max?: number }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    const next = [...images];
    try {
      for (const f of Array.from(files).slice(0, max - images.length)) next.push(await compressImage(f, 1600));
      onChange(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="media-picker">
      {images.map((src, i) => (
        <div key={i} className="media-thumb"><img src={src} alt={`Attachment ${i + 1}`} /><button type="button" aria-label="Remove image" onClick={() => onChange(images.filter((_, k) => k !== i))}><Trash2 size={14} /></button></div>
      ))}
      {images.length < max && (
        <button type="button" className="media-add" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={20} className="spin" /> : <ImagePlus size={20} />}<span>{t(images.length ? 'Add more' : 'Add photos')}</span><small>{images.length}/{max}</small>
        </button>
      )}
      {error && <small className="img-picker-error" role="alert">{error}</small>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={e => void add(e.target.files)} />
    </div>
  );
}
