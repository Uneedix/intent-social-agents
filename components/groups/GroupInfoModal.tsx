'use client';
import { useState, type ReactNode } from 'react';
import { Crown, Link2, LogOut, MessagesSquare, MoreHorizontal, Pencil, Shield, ShieldOff, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useT } from '../I18n';
import { Button, Field, Menu, Modal, Toggle, inputClass } from '../ui';
import { AvatarEditor, GroupAvatar, PersonAvatar } from './parts';
import { canManage, canRemove } from './model';
import type { GroupRole } from '../../lib/data';
import s from './groups.module.css';

export type InfoMember = { id: string; name: string; sub?: string; avatar?: string; role: GroupRole; you?: boolean };
export type GroupProfile = { name: string; description: string; avatar: string; color: number; topicsEnabled: boolean };

type Props = GroupProfile & {
  myRole: GroupRole | null;
  members: InfoMember[];
  onClose: () => void;
  onSave?: (p: GroupProfile) => void | Promise<void>;
  onAddMembers?: () => void;
  onInvite?: () => void;
  onRemove?: (m: InfoMember) => void;
  onRole?: (m: InfoMember, role: 'admin' | 'member') => void;
  onLeave?: () => void;
  onDelete?: () => void;
  busy?: boolean;
  error?: string;
  note?: ReactNode;
  /** Why photo/topics editing is unavailable (missing database upgrade). */
  unavailable?: string;
};

const ROLE_ORDER: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };

/** Telegram-style group info: profile, description, members with roles, management and danger zone. */
export default function GroupInfoModal(p: Props) {
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<GroupProfile>({ name: p.name, description: p.description, avatar: p.avatar, color: p.color, topicsEnabled: p.topicsEnabled });
  const admin = canManage(p.myRole);
  const members = [...p.members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || Number(!!b.you) - Number(!!a.you) || a.name.localeCompare(b.name));
  const roleLabel = (r: GroupRole) => t(r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : 'Member');
  const save = async () => { if (draft.name.trim().length < 3 || !p.onSave) return; await p.onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() }); setEdit(false); };

  if (edit && p.onSave) return <Modal title={t('Edit group')} onClose={() => setEdit(false)} width={540}
    footer={<><Button onClick={() => setEdit(false)}>{t('Cancel')}</Button><Button variant="primary" disabled={draft.name.trim().length < 3 || p.busy} onClick={() => void save()}>{t('Save')}</Button></>}>
    <form className={s.form} onSubmit={e => { e.preventDefault(); void save(); }}>
      <AvatarEditor name={draft.name} avatar={draft.avatar} color={draft.color} onAvatar={avatar => setDraft({ ...draft, avatar })} onColor={color => setDraft({ ...draft, color })} uploadDisabled={p.unavailable} />
      <Field label={t('Group name')}><input className={inputClass} value={draft.name} maxLength={60} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label={t('Description (optional)')}><textarea className={inputClass} rows={3} maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder={t('What is this group about?')} /></Field>
      <div className={s.toggleRow + (p.unavailable ? ' ' + s.disabled : '')}>
        <span className={s.toggleIcon}><MessagesSquare size={20} /></span>
        <span className={s.rowText}><b>{t('Topics (subgroups)')}</b><small>{t('Turning topics off keeps all messages; they are shown together.')}</small></span>
        <Toggle on={draft.topicsEnabled && !p.unavailable} onChange={v => !p.unavailable && setDraft({ ...draft, topicsEnabled: v })} label={t('Topics (subgroups)')} />
      </div>
      {p.error && <p className={s.err} role="alert">{p.error}</p>}
      <button type="submit" hidden />
    </form>
  </Modal>;

  const actions: { key: string; icon: ReactNode; label: string; onClick: () => void }[] = [
    ...(p.onAddMembers ? [{ key: 'add', icon: <UserPlus size={20} />, label: t('Add members'), onClick: p.onAddMembers }] : []),
    ...(p.onInvite ? [{ key: 'invite', icon: <Link2 size={20} />, label: t('Invite'), onClick: p.onInvite }] : []),
    ...(admin && p.onSave ? [{ key: 'edit', icon: <Pencil size={20} />, label: t('Edit'), onClick: () => { setDraft({ name: p.name, description: p.description, avatar: p.avatar, color: p.color, topicsEnabled: p.topicsEnabled }); setEdit(true); } }] : []),
  ];

  return <Modal title={t('Group info')} onClose={p.onClose} width={540}>
    <div className={s.infoHero}>
      <GroupAvatar name={p.name} src={p.avatar} color={p.color} size={96} />
      <h3 className={s.ellipsis}>{p.name}</h3>
      <small>{t('{n} members', { n: p.members.length })}{p.topicsEnabled ? ' · ' + t('Topics on') : ''}</small>
    </div>
    {actions.length > 0 && <div className={s.tiles} style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
      {actions.map(a => <button key={a.key} type="button" className={s.tile} onClick={a.onClick}>{a.icon}<span className={s.ellipsis}>{a.label}</span></button>)}
    </div>}
    {p.description && <section className={s.card}><div className={s.cardHead}><b>{t('Description')}</b></div><p className={s.desc}>{p.description}</p></section>}
    <section className={s.card}>
      <div className={s.cardHead}><b>{t('Members')}</b><span className={s.count}>{p.members.length}</span></div>
      <div className={s.memberRows}>{members.map(m => {
        const menu: Parameters<typeof Menu>[0]['items'] = [
          ...(p.myRole === 'owner' && !m.you && m.role !== 'owner' && p.onRole ? [m.role === 'admin'
            ? { label: t('Remove admin rights'), icon: <ShieldOff size={17} />, onSelect: () => p.onRole!(m, 'member') }
            : { label: t('Make admin'), icon: <Shield size={17} />, onSelect: () => p.onRole!(m, 'admin') }] : []),
          ...(!m.you && p.onRemove && canRemove(p.myRole, m.role) ? [{ label: t('Remove from group'), icon: <UserMinus size={17} />, onSelect: () => p.onRemove!(m), danger: true }] : []),
        ];
        return <div key={m.id} className={s.member}>
          <PersonAvatar name={m.name} src={m.avatar} size={40} />
          <span className={s.rowText}><b><span className={s.ellipsis}>{m.you ? t('You') : m.name}</span></b>{m.sub && <small>{m.sub}</small>}</span>
          {m.role !== 'member' && <span className={s.role + ' ' + (m.role === 'owner' ? s.owner : '')}>{m.role === 'owner' ? <Crown size={12} /> : <Shield size={12} />}{roleLabel(m.role)}</span>}
          {menu.length > 0 ? <Menu items={menu} trigger={(open, toggle) => <Button variant="ghost" icon onClick={toggle} aria-expanded={open} aria-label={t('Manage {name}', { name: m.name })}><MoreHorizontal size={18} /></Button>} /> : <i className={s.menuSpacer} />}
        </div>;
      })}</div>
    </section>
    {p.error && <p className={s.err} role="alert">{p.error}</p>}
    {p.note && <p className={s.note}>{p.note}</p>}
    {(p.onLeave || p.onDelete) && <div className={s.danger}>
      {p.onLeave && p.myRole !== 'owner' && <Button variant="danger" block onClick={p.onLeave} disabled={p.busy}><LogOut size={16} /> {t('Leave group')}</Button>}
      {p.onDelete && p.myRole === 'owner' && <Button variant="danger" block onClick={p.onDelete} disabled={p.busy}><Trash2 size={16} /> {t('Delete group')}</Button>}
    </div>}
  </Modal>;
}
