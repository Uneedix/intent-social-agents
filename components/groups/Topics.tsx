'use client';
import { useState } from 'react';
import { ChevronLeft, Lock, LockOpen, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search } from 'lucide-react';
import { useT } from '../I18n';
import { Button, Field, Menu, Modal, inputClass } from '../ui';
import { TopicIcon, Swatches } from './parts';
import { TOPIC_ICONS } from './model';
import s from './groups.module.css';

export type TopicRow = { id: string; title: string; icon: string; color: number; general?: boolean; closed?: boolean; pinned?: boolean; unread?: number; last?: string; lastWho?: string; lastAt?: number };

const when = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
export const topicTitle = (t: (s: string) => string, topic: Pick<TopicRow, 'title' | 'general'>) => topic.general ? t('General') : topic.title;

/** Telegram-style topic list: icon, name, last message, unread badge. */
export function TopicList({ topics, active, onOpen, manage, onNew, className = '' }: { topics: TopicRow[]; active: string | null; onOpen: (id: string) => void; manage: boolean; onNew: () => void; className?: string }) {
  const t = useT();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = topics.filter(x => !query || topicTitle(t, x).toLowerCase().includes(query) || (x.last || '').toLowerCase().includes(query));
  return <nav className={s.topicList + ' ' + className} aria-label={t('Topics')}>
    <div className={s.topicHead}>
      <b>{t('Topics')}</b><span className={s.count}>{topics.length}</span>
      {manage && <Button size="sm" variant="outline" onClick={onNew} className={s.newTopic}><Plus size={15} /> {t('New topic')}</Button>}
    </div>
    <label className={s.search + ' ' + s.searchSm}><Search size={16} /><input className={inputClass} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search topics')} aria-label={t('Search topics')} /></label>
    <div className={s.topicRows}>
      {shown.map(x => <button key={x.id} type="button" className={s.topic + (active === x.id ? ' ' + s.topicOn : '')} onClick={() => onOpen(x.id)} aria-current={active === x.id ? 'true' : undefined}>
        <TopicIcon icon={x.icon} color={x.color} size={44} />
        <span className={s.rowText}>
          <b><span className={s.ellipsis}>{topicTitle(t, x)}</span>{x.closed && <Lock size={13} className={s.dim} aria-label={t('Closed')} />}{x.pinned && <Pin size={13} className={s.dim} aria-label={t('Pinned')} />}</b>
          <small>{x.last ? <>{x.lastWho && <em>{x.lastWho}: </em>}{x.last}</> : t('No messages yet')}</small>
        </span>
        <span className={s.topicEnd}><small>{when(x.lastAt)}</small>{x.unread ? <em className={s.badge}>{x.unread > 99 ? '99+' : x.unread}</em> : <i />}</span>
      </button>)}
      {!shown.length && <p className={s.empty}>{t('No topics found.')}</p>}
    </div>
  </nav>;
}

/** Bar above a topic's messages: back to the list (phone), topic name, search and admin actions. */
export function TopicBar({ topic, onBack, manage, onEdit, onClosed, onPin, onSearch }: { topic: TopicRow; onBack: () => void; manage: boolean; onEdit: () => void; onClosed: (closed: boolean) => void; onPin: (pinned: boolean) => void; onSearch: () => void }) {
  const t = useT();
  // Pinning, renaming and closing are admin actions (enforced by the server for Supabase groups).
  const items: Parameters<typeof Menu>[0]['items'] = [
    { label: t(topic.pinned ? 'Unpin topic' : 'Pin topic'), icon: topic.pinned ? <PinOff size={17} /> : <Pin size={17} />, onSelect: () => onPin(!topic.pinned) },
    { label: t('Edit topic'), icon: <Pencil size={17} />, onSelect: onEdit },
    ...(!topic.general ? [{ label: t(topic.closed ? 'Reopen topic' : 'Close topic'), icon: topic.closed ? <LockOpen size={17} /> : <Lock size={17} />, onSelect: () => onClosed(!topic.closed), danger: !topic.closed }] : []),
  ];
  return <div className={s.topicBar}>
    <Button variant="ghost" icon className={s.phoneOnly} onClick={onBack} aria-label={t('All topics')}><ChevronLeft size={24} /></Button>
    <TopicIcon icon={topic.icon} color={topic.color} size={34} />
    <span className={s.rowText}><b><span className={s.ellipsis}>{topicTitle(t, topic)}</span></b><small>{t(topic.closed ? 'Closed topic' : 'Topic')}</small></span>
    <Button variant="ghost" icon onClick={onSearch} aria-label={t('Search in this topic')}><Search size={19} /></Button>
    {manage && <Menu items={items} trigger={(open, toggle) => <Button variant="ghost" icon onClick={toggle} aria-expanded={open} aria-label={t('Topic options')}><MoreHorizontal size={20} /></Button>} />}
  </div>;
}

/** Replaces the composer inside a closed topic. */
export function ClosedTopic({ manage, onReopen }: { manage: boolean; onReopen: () => void }) {
  const t = useT();
  return <div className={s.closed} role="status"><Lock size={17} /><span>{t('This topic is closed. New messages are not accepted.')}</span>{manage && <Button size="sm" variant="outline" onClick={onReopen}><LockOpen size={15} /> {t('Reopen')}</Button>}</div>;
}

/** Create or edit a topic: name, icon and colour. */
export function TopicModal({ initial, onClose, onSave, busy, error }: { initial?: TopicRow; onClose: () => void; onSave: (v: { title: string; icon: string; color: number }) => void | Promise<void>; busy?: boolean; error?: string }) {
  const t = useT();
  const [title, setTitle] = useState(initial ? topicTitle(t, initial) : '');
  const [icon, setIcon] = useState(initial?.icon || TOPIC_ICONS[0]);
  const [color, setColor] = useState(initial?.color ?? 0);
  const general = !!initial?.general;
  const ok = title.trim().length >= 1;
  const save = () => { if (ok && !busy) void onSave({ title: general ? 'General' : title.trim(), icon, color }); };
  return <Modal title={t(initial ? 'Edit topic' : 'New topic')} onClose={onClose} width={480}
    footer={<><Button onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" disabled={!ok || busy} onClick={save}>{t(initial ? 'Save' : 'Create topic')}</Button></>}>
    <form className={s.form} onSubmit={e => { e.preventDefault(); save(); }}>
      <div className={s.topicPreview}><TopicIcon icon={icon} color={color} size={64} /><b className={s.ellipsis}>{title.trim() || t('Topic name')}</b></div>
      <Field label={t('Topic name')}>
        <input className={inputClass} value={title} maxLength={60} autoFocus disabled={general} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. Announcements')} />
      </Field>
      <div className={s.fieldLabel}>{t('Icon')}</div>
      <div className={s.icons} role="radiogroup" aria-label={t('Icon')}>
        {(general ? ['#', ...TOPIC_ICONS] : TOPIC_ICONS).map(i => <button key={i} type="button" role="radio" aria-checked={icon === i} className={s.iconBtn + (icon === i ? ' ' + s.on : '')} onClick={() => setIcon(i)}><TopicIcon icon={i} color={color} size={36} /></button>)}
      </div>
      <div className={s.fieldLabel}>{t('Colour')}</div>
      <Swatches value={color} onChange={setColor} label={t('Colour')} />
      {error && <p className={s.err} role="alert">{error}</p>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}
