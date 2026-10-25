'use client';
import { useRef, useState } from 'react';
import { Camera, Check, Hash, Plus, Search, Trash2, X } from 'lucide-react';
import { useT } from '../I18n';
import { Button, inputClass } from '../ui';
import { compressImage } from '../../lib/social';
import { GROUP_COLORS, UUID_RE, colorFor, colorOf, gradient, initialsOf } from './model';
import s from './groups.module.css';

export type Candidate = { id: string; name: string; sub?: string; avatar?: string; online?: boolean };

/** Group photo, or generated colour + initials when there is none. */
export function GroupAvatar({ name, src, color, size = 48, className = '' }: { name: string; src?: string | null; color?: number | null; size?: number; className?: string }) {
  return <span className={s.av + ' ' + className} style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: src ? '#141416' : gradient(color ?? colorFor(name)) }} aria-hidden="true">
    {src ? <img src={src} alt="" /> : initialsOf(name)}</span>;
}

export function PersonAvatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  return <span className={s.av} style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: src ? '#141416' : gradient(colorFor(name)) }} aria-hidden="true">
    {src ? <img src={src} alt="" /> : initialsOf(name)}</span>;
}

export function TopicIcon({ icon, color, size = 40 }: { icon: string; color: number; size?: number }) {
  const [c] = colorOf(color);
  return <span className={s.ticon} style={{ width: size, height: size, fontSize: Math.round(size * 0.5), background: c + '24', color: c, borderColor: c + '40' }} aria-hidden="true">
    {icon === '#' ? <Hash size={Math.round(size * 0.48)} strokeWidth={2.4} /> : icon}</span>;
}

export function Swatches({ value, onChange, label }: { value: number; onChange: (i: number) => void; label: string }) {
  const t = useT();
  return <div className={s.swatches} role="radiogroup" aria-label={label}>
    {GROUP_COLORS.map((_, i) => <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={t('Colour {n}', { n: i + 1 })}
      className={s.swatch + (value === i ? ' ' + s.on : '')} style={{ background: gradient(i) }} onClick={() => onChange(i)}>{value === i && <Check size={14} strokeWidth={3} />}</button>)}
  </div>;
}

const MAX_AVATAR = 190000; // characters of data URL; the server accepts up to 200000

/** Photo upload (compressed in the browser) or a generated colour avatar. */
export function AvatarEditor({ name, avatar, color, onAvatar, onColor, uploadDisabled }: { name: string; avatar: string; color: number; onAvatar: (v: string) => void; onColor: (i: number) => void; uploadDisabled?: string }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function take(f?: File) {
    if (!f) return; setBusy(true); setError('');
    try { let url = await compressImage(f, 320, 0.82); if (url.length > MAX_AVATAR) url = await compressImage(f, 200, 0.7); if (url.length > MAX_AVATAR) throw new Error(t('This image is too large for a group photo.')); onAvatar(url); }
    catch (e) { setError(e instanceof Error ? e.message : t('Upload failed')); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <div className={s.avEdit}>
    <button type="button" className={s.avBig} onClick={() => !uploadDisabled && input.current?.click()} aria-label={t('Upload group photo')} disabled={!!uploadDisabled || busy}>
      <GroupAvatar name={name || '#'} src={avatar} color={color} size={88} />
      {!uploadDisabled && <span className={s.avCam}><Camera size={18} /></span>}
    </button>
    <div className={s.avSide}>
      <div className={s.avBtns}>
        {!uploadDisabled && <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}><Camera size={15} /> {t(avatar ? 'Change photo' : 'Upload photo')}</Button>}
        {avatar && <Button size="sm" variant="ghost" onClick={() => onAvatar('')}><Trash2 size={15} /> {t('Remove')}</Button>}
      </div>
      <small className={s.muted}>{uploadDisabled || t(avatar ? 'The photo is shown to every member.' : 'No photo? Pick a colour — initials are generated from the name.')}</small>
      <Swatches value={color} onChange={onColor} label={t('Avatar colour')} />
      {error && <small className={s.err} role="alert">{error}</small>}
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void take(e.target.files?.[0])} />
  </div>;
}

/** Search + chips + multi-select list. `manual` adds account IDs (Supabase has no people directory yet). */
export function MemberPicker({ candidates, selected, onChange, manual, exclude = [] }: { candidates: Candidate[]; selected: Candidate[]; onChange: (v: Candidate[]) => void; manual?: boolean; exclude?: string[] }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState('');
  const query = q.trim().toLowerCase();
  const list = candidates.filter(c => !exclude.includes(c.id) && (!query || c.name.toLowerCase().includes(query) || (c.sub || '').toLowerCase().includes(query)));
  const on = (id: string) => selected.some(x => x.id === id);
  const toggle = (c: Candidate) => onChange(on(c.id) ? selected.filter(x => x.id !== c.id) : [...selected, c]);
  const addManual = () => {
    const id = manualId.trim().toLowerCase();
    if (!UUID_RE.test(id)) { setError(t('Enter a valid account ID (UUID).')); return; }
    if (exclude.includes(id) || on(id)) { setError(t('This person is already added.')); return; }
    onChange([...selected, { id, name: id.slice(0, 8), sub: id }]); setManualId(''); setError('');
  };
  return <div className={s.picker}>
    {!manual && <label className={s.search}><Search size={18} /><input className={inputClass} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search people')} aria-label={t('Search people')} /></label>}
    {manual && <div className={s.manual}>
      <input className={inputClass} value={manualId} onChange={e => { setManualId(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual(); } }} placeholder={t('Account ID (UUID)')} aria-label={t('Account ID (UUID)')} />
      <Button variant="outline" onClick={addManual} disabled={!manualId.trim()}><Plus size={16} /> {t('Add')}</Button>
    </div>}
    {error && <small className={s.err} role="alert">{error}</small>}
    {selected.length > 0 && <div className={s.chips} aria-label={t('Selected people')}>{selected.map(c => <span key={c.id} className={s.chip}>
      <PersonAvatar name={c.name} src={c.avatar} size={24} /><span className={s.ellipsis}>{c.name}</span>
      <button type="button" onClick={() => toggle(c)} aria-label={t('Remove {name}', { name: c.name })}><X size={14} /></button></span>)}</div>}
    {(!manual || list.length > 0) && <div className={s.rows}>
      {list.map(c => <button key={c.id} type="button" className={s.row + (on(c.id) ? ' ' + s.rowOn : '')} onClick={() => toggle(c)} aria-pressed={on(c.id)}>
        <PersonAvatar name={c.name} src={c.avatar} size={42} />
        <span className={s.rowText}><b>{c.name}</b>{c.sub && <small>{c.sub}</small>}</span>
        <i className={s.check}>{on(c.id) && <Check size={14} strokeWidth={3} />}</i></button>)}
      {!list.length && <p className={s.empty}>{t('No people found.')}</p>}
    </div>}
  </div>;
}
