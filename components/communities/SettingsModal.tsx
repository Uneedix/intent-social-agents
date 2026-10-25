'use client';
import { useCallback, useState } from 'react';
import { Check, Globe, Hash, Lock, MoreHorizontal, Plus, ShieldCheck, Trash2, UserMinus, X } from 'lucide-react';
import { Button, Choice, Field, Menu, Modal, Toggle, inputClass } from '../ui';
import { useT } from '../I18n';
import ImagePicker from '../ImagePicker';
import { CATEGORIES, CATEGORY_LABEL, DESCRIPTION_MAX, NAME_MAX, NAME_MIN, addTag, assignableRoles, can, canRemove, displayRole, shortId, type Community, type Threshold } from './model';
import type { Live } from './useLiveCommunity';
import DeleteCommunityControl from './DeleteCommunityControl';
import s from './communities.module.css';

type Section = 'general' | 'privacy' | 'structure' | 'members' | 'requests';
const roleLabel = (r: string) => displayRole(r).replace(/^./, c => c.toUpperCase());

export default function SettingsModal({ live, role, userId, onClose, onDelete }: { live: Live; role: string | null; userId: string | null; onClose: () => void; onDelete?: () => Promise<void> }) {
  const t = useT();
  const c = live.community;
  const v2 = 'category' in c;
  const sections: [Section, string][] = ([['general', 'General'], ['privacy', 'Privacy & permissions'], ['structure', 'Structure'], ['members', 'Members & roles'], ['requests', 'Join requests']] as [Section, string][])
    .filter(([k]) => k === 'general' || k === 'privacy' ? can(c, role, 'settings') : k === 'structure' ? can(c, role, 'settings') || can(c, role, 'manage_channels') : k === 'members' ? can(c, role, 'moderate') : can(c, role, 'approve'));
  const [section, setSection] = useState<Section>(sections[0]?.[0] || 'members');
  const [g, setG] = useState({ name: c.name, description: c.description, category: c.category || 'other', tags: c.tags || [], cover: c.cover_url || '', icon: c.avatar_url || '' });
  const [tag, setTag] = useState('');
  const [p, setP] = useState({ privacy: c.privacy, posting_permission: c.posting_permission, comments_permission: c.comments_permission || 'members', manage_channels_role: c.manage_channels_role || 'admin', approve_requests_role: c.approve_requests_role || 'admin', remove_members_role: c.remove_members_role || 'admin' });
  const [channel, setChannel] = useState(''), [confirmChannel, setConfirmChannel] = useState<string | null>(null), [saved, setSaved] = useState('');
  const [deleting, setDeleting] = useState(false);
  const requestClose = useCallback(() => { if (!deleting) onClose(); }, [deleting, onClose]);
  const done = (ok: boolean) => { if (ok) { setSaved(t('Saved')); setTimeout(() => setSaved(''), 1800); } };
  const saveGeneral = async () => {
    if (g.name.trim().length < NAME_MIN) { live.setError(t('Name must be at least 3 characters.')); return; }
    const patch: Partial<Community> = { name: g.name.trim(), description: g.description.trim(), cover_url: g.cover || null, avatar_url: g.icon || null };
    if (v2) Object.assign(patch, { category: g.category, tags: g.tags });
    done(await live.update(patch));
  };
  const savePrivacy = async () => {
    const patch: Partial<Community> = { privacy: p.privacy, posting_permission: p.posting_permission, comments_permission: p.comments_permission };
    if (v2) Object.assign(patch, { manage_channels_role: p.manage_channels_role, approve_requests_role: p.approve_requests_role, remove_members_role: p.remove_members_role });
    done(await live.update(patch));
  };
  const threshold = (k: 'manage_channels_role' | 'approve_requests_role' | 'remove_members_role', label: string) => <div className={s.permRow}><span>{t(label)}</span>
    <div className={s.seg} role="radiogroup" aria-label={t(label)}>{(['admin', 'moderator'] as Threshold[]).map(r => <Button key={r} size="sm" role="radio" aria-checked={p[k] === r} disabled={!v2} variant={p[k] === r ? 'primary' : 'outline'} onClick={() => setP({ ...p, [k]: r })}>{t(r === 'admin' ? 'Admins' : 'Moderators+')}</Button>)}</div></div>;
  const migrationNote = <p className={s.notice} role="status"><Lock size={16} /> {t('Moderator role, role changes, removing members, declining requests and these permissions need the database update (community roles migration). Ask the project owner to apply it.')}</p>;

  return <Modal width={680} title={t('Community settings')} subtitle={c.name} onClose={requestClose}
    footer={saved ? <span className={s.saved}><Check size={16} /> {saved}</span> : <Button disabled={deleting} onClick={requestClose}>{t('Close')}</Button>}>
    <nav className={s.settingsTabs} role="tablist">{sections.map(([k, l]) => <button key={k} role="tab" disabled={deleting} aria-selected={section === k} className={section === k ? s.chipOn : s.chip} onClick={() => setSection(k)}>{t(l)}{k === 'requests' && live.requests.length > 0 && <em className={s.count}>{live.requests.length}</em>}</button>)}</nav>
    {(live.needsMigration || (!v2 && (section === 'privacy' || section === 'members'))) && migrationNote}
    {live.error && <p className={s.error} role="alert">{live.error}</p>}

    {section === 'general' && <>
      <Field label={t('Name')}><input className={inputClass} value={g.name} maxLength={NAME_MAX} onChange={e => setG({ ...g, name: e.target.value })} /></Field>
      <Field label={t('Description')}><textarea className={inputClass} rows={3} maxLength={DESCRIPTION_MAX} value={g.description} onChange={e => setG({ ...g, description: e.target.value })} /></Field>
      <div className={s.fieldLabel}>{t('Category')}</div>
      <div className={s.catGrid}>{CATEGORIES.map(k => <Button key={k} size="sm" disabled={!v2} variant={g.category === k ? 'primary' : 'outline'} onClick={() => setG({ ...g, category: k })}>{t(CATEGORY_LABEL[k])}</Button>)}</div>
      <Field label={t('Tags')}><div className={s.tagInput}>{g.tags.map(x => <span key={x}>#{x}<button type="button" aria-label={t('Remove {tag}', { tag: x })} onClick={() => setG({ ...g, tags: g.tags.filter(y => y !== x) })}><X size={12} /></button></span>)}
        <input value={tag} disabled={!v2} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); setG({ ...g, tags: addTag(g.tags, tag) }); setTag(''); } }} /></div></Field>
      <ImagePicker label={t('Cover image')} value={g.cover} onChange={v => setG({ ...g, cover: v })} shape="wide" maxSide={960} />
      <ImagePicker label={t('Icon')} value={g.icon} onChange={v => setG({ ...g, icon: v })} shape="circle" maxSide={256} />
      <Button variant="primary" disabled={live.busy || deleting} onClick={() => void saveGeneral()}>{t('Save changes')}</Button>
      {userId !== null && userId === c.owner_id && onDelete && <DeleteCommunityControl name={c.name} onDelete={onDelete} onBusy={setDeleting} />}
    </>}

    {section === 'privacy' && <>
      <div role="radiogroup" className={s.choices}>
        <Choice on={p.privacy === 'public'} onClick={() => setP({ ...p, privacy: 'public' })} icon={<Globe size={20} />} title={t('Open')} desc={t('Anyone can find and join instantly.')} />
        <Choice on={p.privacy === 'request'} onClick={() => setP({ ...p, privacy: 'request' })} icon={<ShieldCheck size={20} />} title={t('Approval required')} desc={t('Anyone can find it; staff approve each join request.')} />
        <Choice on={p.privacy === 'private'} onClick={() => setP({ ...p, privacy: 'private' })} icon={<Lock size={20} />} title={t('Private')} desc={t('Hidden from everyone except members. Invite links are not available yet.')} />
      </div>
      <div className={s.permRow}><span>{t('Who can post')}</span><div className={s.seg}>{(['members', 'staff'] as const).map(r => <Button key={r} size="sm" variant={p.posting_permission === r ? 'primary' : 'outline'} onClick={() => setP({ ...p, posting_permission: r })}>{t(r === 'members' ? 'All members' : 'Staff')}</Button>)}</div></div>
      <div className={s.permRow}><span>{t('Who can comment')}<small>{t('Applies when post comments launch.')}</small></span><div className={s.seg}>{(['members', 'staff', 'disabled'] as const).map(r => <Button key={r} size="sm" variant={p.comments_permission === r ? 'primary' : 'outline'} onClick={() => setP({ ...p, comments_permission: r })}>{t(r === 'members' ? 'All members' : r === 'staff' ? 'Staff' : 'Nobody')}</Button>)}</div></div>
      {threshold('manage_channels_role', 'Who can manage channels')}
      {threshold('approve_requests_role', 'Who can approve requests')}
      {threshold('remove_members_role', 'Who can remove members')}
      <p className={s.hint}>{t('The owner can always do everything. Staff means owner, admins and moderators. Rules are enforced by the server.')}</p>
      <Button variant="primary" disabled={live.busy} onClick={() => void savePrivacy()}>{t('Save changes')}</Button>
    </>}

    {section === 'structure' && <>
      <div className={s.structRow}><Hash size={20} /><div><b>{t('Feed')}</b><small>{t('Every community has a feed of publications. It is always on.')}</small></div><span className={s.locked}><Lock size={13} /> {t('Always on')}</span></div>
      {can(c, role, 'settings') && <div className={s.structRow}><Hash size={20} /><div><b>{t('Channels')}</b><small>{t('Turning channels off hides them for everyone. Messages are kept and return when you turn them back on.')}</small></div>
        <Toggle on={c.channels_enabled} onChange={v => void live.update({ channels_enabled: v })} label={t('Enable channels')} /></div>}
      {c.channels_enabled && can(c, role, 'manage_channels') && <div className={s.channelEdit}>
        {live.channels.map(ch => <div key={ch.id} className={s.channelLine}><Hash size={16} /><span className={s.grow}>{ch.name}</span>
          {confirmChannel === ch.id ? <><Button size="sm" variant="danger" disabled={live.busy} onClick={() => { setConfirmChannel(null); void live.deleteChannel(ch.id); }}>{t('Delete with messages')}</Button><Button size="sm" variant="ghost" onClick={() => setConfirmChannel(null)}>{t('Cancel')}</Button></>
            : <Button variant="ghost" icon aria-label={t('Remove channel')} onClick={() => setConfirmChannel(ch.id)}><Trash2 size={16} /></Button>}</div>)}
        <form className={s.channelLine} onSubmit={async e => { e.preventDefault(); if (channel.trim() && await live.createChannel(channel)) setChannel(''); }}><Hash size={16} />
          <input className={inputClass} value={channel} maxLength={40} placeholder={t('Channel name')} onChange={e => setChannel(e.target.value)} />
          <Button type="submit" size="sm" disabled={live.busy || !channel.trim()}><Plus size={14} /> {t('Add channel')}</Button></form>
      </div>}
    </>}

    {section === 'members' && <div className={s.memberList}>
      {live.members.map(m => {
        const roles = v2 ? assignableRoles(role, m.role).filter(r => r !== displayRole(m.role)) : [];
        const removable = v2 && m.user_id !== userId && canRemove(c, role, m.role);
        return <div key={m.user_id} className={s.memberRow}><div className={s.grow}><b>{m.user_id === userId ? t('You') : t('Member {id}', { id: shortId(m.user_id) })}</b><small>{t(roleLabel(m.role))}</small></div>
          {(roles.length > 0 || removable) && <Menu trigger={(open, toggle) => <Button variant="outline" size="sm" aria-expanded={open} onClick={toggle}>{t('Manage')} <MoreHorizontal size={14} /></Button>}
            items={[...roles.map(r => ({ label: t('Make {role}', { role: t(roleLabel(r)).toLowerCase() }), onSelect: () => void live.setRole(m.user_id, r) })), ...(removable ? ['sep' as const, { label: t('Remove from community'), icon: <UserMinus size={16} />, danger: true, onSelect: () => void live.removeMember(m.user_id) }] : [])]} />}
        </div>;
      })}
      {!live.members.length && <div className={s.emptySmall}>{t('No members yet.')}</div>}
    </div>}

    {section === 'requests' && <div className={s.memberList}>
      {live.requests.map(r => <div key={r.user_id} className={s.memberRow}><div className={s.grow}><b>{t('Member {id}', { id: shortId(r.user_id) })}</b><small>{r.created_at ? new Date(r.created_at).toLocaleString() : t('Pending')}</small></div>
        <Button size="sm" variant="primary" disabled={live.busy} onClick={() => void live.approve(r.user_id)}>{t('Approve')}</Button>
        <Button size="sm" variant="outline" disabled={live.busy} onClick={() => void live.decline(r.user_id)}>{t('Decline')}</Button></div>)}
      {!live.requests.length && <div className={s.emptySmall}>{t('No pending requests.')}</div>}
    </div>}
  </Modal>;
}
