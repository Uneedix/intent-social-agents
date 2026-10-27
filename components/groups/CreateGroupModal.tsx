'use client';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, MessagesSquare, Users } from 'lucide-react';
import { useT } from '../I18n';
import { Button, Field, Modal, Toggle, inputClass } from '../ui';
import { AvatarEditor, MemberPicker, type Candidate } from './parts';
import { colorFor } from './model';
import s from './groups.module.css';

export type GroupDraft = { name: string; description: string; avatar: string; color: number; topics: boolean; members: Candidate[] };

type Props = {
  candidates: Candidate[];
  initialMembers?: Candidate[];
  minMembers?: number;
  manual?: boolean;
  minName?: number;
  busy?: boolean;
  error?: string;
  /** Shown under the details step (e.g. storage scope or a missing database upgrade). */
  note?: ReactNode;
  /** Explains why photo/topics are unavailable (missing migration), or undefined when available. */
  unavailable?: string;
  onClose: () => void;
  onCreate: (draft: GroupDraft) => void | Promise<void>;
};

/** Telegram-style two-step wizard: add members → photo, name, description, topics. */
export default function CreateGroupModal({ candidates, initialMembers = [], minMembers = 1, manual, minName = 3, busy, error, note, unavailable, onClose, onCreate }: Props) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [members, setMembers] = useState<Candidate[]>(initialMembers);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState('');
  const [color, setColor] = useState<number | null>(null);
  const [topics, setTopics] = useState(false);
  const enough = members.length >= minMembers;
  const validName = name.trim().length >= minName;
  const shownColor = color ?? colorFor(name.trim() || 'group');
  const create = () => { if (validName && enough && !busy) void onCreate({ name: name.trim(), description: description.trim(), avatar: unavailable ? '' : avatar, color: shownColor, topics: unavailable ? false : topics, members }); };

  return <Modal title={t('New group')} subtitle={step === 0 ? t('Step 1 of 2 · Add members') : t('Step 2 of 2 · Group details')} onClose={onClose} width={560} steps={{ total: 2, current: step }}
    footer={step === 0
      ? <><span className={s.footInfo}>{t('{n} selected', { n: members.length })}</span><Button onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" disabled={!enough} onClick={() => setStep(1)}>{t('Next')} <ArrowRight size={16} /></Button></>
      : <><Button onClick={() => setStep(0)}><ArrowLeft size={16} /> {t('Back')}</Button><Button variant="primary" disabled={!validName || !enough || busy} onClick={create}><Users size={16} /> {t(busy ? 'Creating…' : 'Create group')}</Button></>}>
    {step === 0 ? <>
      <p className={s.lead}>{manual ? t('Add people by their account ID. A people directory is not connected yet.') : t(minMembers > 1 ? 'Choose at least {n} people to start the group.' : 'Choose people to add to the group.', { n: minMembers })}</p>
      <MemberPicker candidates={candidates} selected={members} onChange={setMembers} manual={manual} />
    </> : <form className={s.form} onSubmit={e => { e.preventDefault(); create(); }}>
      <AvatarEditor name={name} avatar={avatar} color={shownColor} onAvatar={setAvatar} onColor={setColor} uploadDisabled={unavailable} />
      <Field label={t('Group name')} hint={t('{n}/{max} characters', { n: name.length, max: 60 })}>
        <input className={inputClass} value={name} maxLength={60} autoFocus onChange={e => setName(e.target.value)} placeholder={t('e.g. Design team')} />
      </Field>
      <Field label={t('Description (optional)')}>
        <textarea className={inputClass} value={description} maxLength={300} rows={3} onChange={e => setDescription(e.target.value)} placeholder={t('What is this group about?')} />
      </Field>
      <div className={s.toggleRow + (unavailable ? ' ' + s.disabled : '')}>
        <span className={s.toggleIcon}><MessagesSquare size={20} /></span>
        <span className={s.rowText}><b>{t('Topics (subgroups)')}</b><small>{t('Separate conversations inside the group, like in Telegram. General is always there.')}</small></span>
        <Toggle on={topics && !unavailable} onChange={v => !unavailable && setTopics(v)} label={t('Topics (subgroups)')} />
      </div>
      {error && <p className={s.err} role="alert">{error}</p>}
      {note && <p className={s.note}>{note}</p>}
      <button type="submit" hidden />
    </form>}
  </Modal>;
}

/** Add people to an existing group (same picker as the wizard). */
export function AddMembersModal({ candidates, exclude, manual, busy, error, note, onClose, onAdd }: { candidates: Candidate[]; exclude: string[]; manual?: boolean; busy?: boolean; error?: string; note?: ReactNode; onClose: () => void; onAdd: (people: Candidate[]) => void | Promise<void> }) {
  const t = useT();
  const [picked, setPicked] = useState<Candidate[]>([]);
  return <Modal title={t('Add members')} onClose={onClose} width={520}
    footer={<><span className={s.footInfo}>{t('{n} selected', { n: picked.length })}</span><Button onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" disabled={!picked.length || busy} onClick={() => void onAdd(picked)}>{t('Add')}</Button></>}>
    <MemberPicker candidates={candidates} selected={picked} onChange={setPicked} manual={manual} exclude={exclude} />
    {error && <p className={s.err} role="alert">{error}</p>}
    {note && <p className={s.note}>{note}</p>}
  </Modal>;
}
