'use client';
import { useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Globe, Hash, Lock, LogIn, Newspaper, Plus, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { Button, Choice, Field, Modal, Toggle, inputClass } from '../ui';
import ImagePicker from '../ImagePicker';
import { useT } from '../I18n';
import { CATEGORIES, CATEGORY_LABEL, DESCRIPTION_MAX, NAME_MAX, TAGS_MAX, addTag, emptyDraft, normalizeChannel, validateStep, type Draft } from './model';
import { Pic } from './parts';
import s from './communities.module.css';

const STEPS = ['Basics', 'Look', 'Privacy', 'Structure', 'Review'] as const;
const COVER_LIMIT = 400000, ICON_LIMIT = 120000; // mirrors communities_images_check

type Props = { signedIn: boolean; configured: boolean; onClose: () => void; onCreate: (d: Draft) => Promise<string | null> };

export default function CreateWizard({ signedIn, configured, onClose, onCreate }: Props) {
  const t = useT();
  const [step, setStep] = useState(0), [d, setD] = useState<Draft>(emptyDraft), [tag, setTag] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(x => ({ ...x, [k]: v })); setError(''); };
  const imageError = d.cover.length > COVER_LIMIT || d.icon.length > ICON_LIMIT ? 'This image is too large. Choose a smaller one.' : '';
  const next = () => {
    const e = validateStep(step, d) || (step === 1 ? imageError : '');
    if (e) { setError(e); return; }
    setStep(x => Math.min(x + 1, STEPS.length - 1));
  };
  const back = () => { setError(''); if (step === 0) onClose(); else setStep(x => x - 1); };
  const submit = async () => {
    for (let i = 0; i < STEPS.length; i++) { const e = validateStep(i, d); if (e) { setStep(i); setError(e); return; } }
    setBusy(true); setError('');
    const e = await onCreate(d).catch(x => x instanceof Error ? x.message : 'Something went wrong.');
    setBusy(false); if (e) setError(e);
  };
  const tagKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (tag.trim()) { set('tags', addTag(d.tags, tag)); setTag(''); } } else if (e.key === 'Backspace' && !tag && d.tags.length) set('tags', d.tags.slice(0, -1)); };
  const channelAt = (i: number, v: string) => set('channels', d.channels.map((c, j) => j === i ? v : c));
  const last = step === STEPS.length - 1;

  const footer = <>
    <Button variant="ghost" onClick={back} disabled={busy}>{step === 0 ? t('Cancel') : <><ArrowLeft size={16} /> {t('Back')}</>}</Button>
    {!last ? <Button variant="primary" onClick={next}>{t('Next')} <ArrowRight size={16} /></Button>
      : !signedIn ? <Button variant="primary" onClick={() => { location.href = '/login'; }} disabled={!configured}><LogIn size={16} /> {t('Log in to create')}</Button>
      : <Button variant="primary" onClick={() => void submit()} disabled={busy || !configured}>{busy ? t('Creating…') : t('Create community')}</Button>}
  </>;

  return <Modal width={600} title={t('Create a community')} subtitle={`${t('Step {n} of {total}', { n: step + 1, total: STEPS.length })} · ${t(STEPS[step])}`} steps={{ total: STEPS.length, current: step }} onClose={onClose} footer={footer}>
    {!configured ? <p className={s.notice} role="status"><Lock size={16} /> {t('The database is not configured here, so new communities cannot be saved. You can still explore the steps.')}</p>
      : !signedIn && <p className={s.notice} role="status"><LogIn size={16} /> {t('Log in to create a community. You can look through the steps first.')}</p>}

    {step === 0 && <>
      <Field label={t('Name')} hint={`${d.name.trim().length}/${NAME_MAX}`}><input className={inputClass} value={d.name} maxLength={NAME_MAX} placeholder={t('e.g. Warsaw Founders')} onChange={e => set('name', e.target.value)} /></Field>
      <Field label={t('Description')} hint={`${d.description.length}/${DESCRIPTION_MAX}`}><textarea className={inputClass} rows={3} value={d.description} maxLength={DESCRIPTION_MAX} placeholder={t('Who is it for and what will you talk about?')} onChange={e => set('description', e.target.value)} /></Field>
      <div className={s.fieldLabel}>{t('Category')}</div>
      <div className={s.catGrid} role="radiogroup" aria-label={t('Category')}>{CATEGORIES.map(c => <Button key={c} size="sm" role="radio" aria-checked={d.category === c} variant={d.category === c ? 'primary' : 'outline'} onClick={() => set('category', c)}>{t(CATEGORY_LABEL[c])}</Button>)}</div>
      <Field label={t('Tags')} hint={t('Up to {n}. Press Enter to add.', { n: TAGS_MAX })}>
        <div className={s.tagInput}>{d.tags.map(x => <span key={x}>#{x}<button type="button" aria-label={t('Remove {tag}', { tag: x })} onClick={() => set('tags', d.tags.filter(y => y !== x))}><X size={12} /></button></span>)}
          <input value={tag} disabled={d.tags.length >= TAGS_MAX} placeholder={d.tags.length ? '' : t('startups, networking')} onChange={e => setTag(e.target.value)} onKeyDown={tagKey} onBlur={() => { if (tag.trim()) { set('tags', addTag(d.tags, tag)); setTag(''); } }} /></div>
      </Field>
    </>}

    {step === 1 && <>
      <ImagePicker label={t('Cover image')} hint={t('Wide image, shown at the top of the community.')} value={d.cover} onChange={v => set('cover', v)} shape="wide" maxSide={960} />
      <ImagePicker label={t('Icon')} hint={t('Square image, shown next to the name.')} value={d.icon} onChange={v => set('icon', v)} shape="circle" maxSide={256} />
      <p className={s.hint}>{t('File storage is not set up yet, so images are compressed and saved inside the community record. Both are optional.')}</p>
    </>}

    {step === 2 && <>
      <div className={s.fieldLabel}>{t('Who can join')}</div>
      <div role="radiogroup" className={s.choices}>
        <Choice on={d.privacy === 'public'} onClick={() => set('privacy', 'public')} icon={<Globe size={20} />} title={t('Open')} desc={t('Anyone can find and join instantly.')} />
        <Choice on={d.privacy === 'request'} onClick={() => set('privacy', 'request')} icon={<ShieldCheck size={20} />} title={t('Approval required')} desc={t('Anyone can find it; staff approve each join request.')} />
        <Choice on={d.privacy === 'private'} onClick={() => set('privacy', 'private')} icon={<Lock size={20} />} title={t('Private')} desc={t('Hidden from everyone except members. Invite links are not available yet.')} />
      </div>
      <div className={s.fieldLabel}>{t('Who can post in the feed')}</div>
      <div role="radiogroup" className={s.choices}>
        <Choice on={d.posting === 'members'} onClick={() => set('posting', 'members')} icon={<Users size={20} />} title={t('All members')} desc={t('Best for conversation and introductions.')} />
        <Choice on={d.posting === 'staff'} onClick={() => set('posting', 'staff')} icon={<ShieldCheck size={20} />} title={t('Owner, admins and moderators')} desc={t('Members read and chat in channels.')} />
      </div>
    </>}

    {step === 3 && <>
      <div className={s.structRow}><Newspaper size={20} /><div><b>{t('Feed')}</b><small>{t('Every community has a feed of publications. It is always on.')}</small></div><span className={s.locked}><Lock size={13} /> {t('Always on')}</span></div>
      <div className={s.structRow}><Hash size={20} /><div><b>{t('Channels')}</b><small>{t('Live chat rooms for real-time conversation. You can turn them off later — that hides them without deleting messages.')}</small></div><Toggle on={d.channelsEnabled} onChange={v => set('channelsEnabled', v)} label={t('Enable channels')} /></div>
      {d.channelsEnabled && <div className={s.channelEdit}>
        {d.channels.map((c, i) => <div key={i} className={s.channelLine}><Hash size={16} /><input className={inputClass} value={c} maxLength={40} aria-label={t('Channel name')} onChange={e => channelAt(i, e.target.value)} onBlur={e => channelAt(i, normalizeChannel(e.target.value))} />
          <Button variant="ghost" icon aria-label={t('Remove channel')} onClick={() => set('channels', d.channels.filter((_, j) => j !== i))}><Trash2 size={16} /></Button></div>)}
        {d.channels.length < 8 && <Button size="sm" onClick={() => set('channels', [...d.channels, ''])}><Plus size={14} /> {t('Add channel')}</Button>}
      </div>}
    </>}

    {step === 4 && <div className={s.review}>
      <div className={s.reviewCard}><Pic src={d.cover} className={s.reviewCover} initial={false} seed={d.name} /><div className={s.reviewId}><Pic src={d.icon} className={s.icon} seed={d.name} /><div><strong>{d.name.trim()}</strong><small>{t(CATEGORY_LABEL[d.category] || 'Other')}{d.tags.length > 0 && ' · ' + d.tags.map(x => '#' + x).join(' ')}</small></div></div>
        {d.description.trim() && <p className={s.desc}>{d.description.trim()}</p>}</div>
      <dl className={s.summary}>
        <dt>{t('Who can join')}</dt><dd>{t(d.privacy === 'public' ? 'Open' : d.privacy === 'request' ? 'Approval required' : 'Private')}</dd>
        <dt>{t('Who can post')}</dt><dd>{t(d.posting === 'members' ? 'All members' : 'Owner, admins and moderators')}</dd>
        <dt>{t('Feed')}</dt><dd>{t('Always on')}</dd>
        <dt>{t('Channels')}</dt><dd>{d.channelsEnabled ? d.channels.map(normalizeChannel).filter(Boolean).map(c => '#' + c).join(', ') || t('On') : t('Off')}</dd>
      </dl>
      <p className={s.hint}>{t('You become the owner. Roles, permissions and the join-request queue are in Settings.')}</p>
    </div>}
    {error && <p className={s.error} role="alert">{t(error)}</p>}
  </Modal>;
}
