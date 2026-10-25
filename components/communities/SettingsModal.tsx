'use client';
import { useCallback, useState } from 'react';
import { Check, Globe, Hash, Lock, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, UserMinus, Users, Volume2, X } from 'lucide-react';
import { Button, Choice, Field, Menu, Modal, Toggle, inputClass } from '../ui';
import { useT } from '../I18n';
import ImagePicker from '../ImagePicker';
import { CATEGORIES, CATEGORY_LABEL, DESCRIPTION_MAX, NAME_MAX, NAME_MIN, addTag, assignableRoles, can, canRemove, clampCapacity, displayRole, shortId, VOICE_DEFAULT, VOICE_MAX, VOICE_MIN, type Channel, type Community, type Threshold, type VoiceAccess } from './model';
import type { Live } from './useLiveCommunity';
import DeleteCommunityControl from './DeleteCommunityControl';
import s from './communities.module.css';

export type Section = 'general' | 'privacy' | 'structure' | 'members' | 'requests';
const roleLabel = (r: string) => displayRole(r).replace(/^./, c => c.toUpperCase());

export default function SettingsModal({ live, role, userId, onClose, onDelete, initialSection }: { live: Live; role: string | null; userId: string | null; onClose: () => void; onDelete?: () => Promise<void>; initialSection?: Section }) {
  const t = useT();
  const c = live.community;
  const v2 = 'category' in c;
  const sections: [Section, string][] = ([['general', 'General'], ['privacy', 'Privacy & permissions'], ['structure', 'Structure'], ['members', 'Members & roles'], ['requests', 'Join requests']] as [Section, string][])
    .filter(([k]) => k === 'general' || k === 'privacy' ? can(c, role, 'settings') : k === 'structure' ? can(c, role, 'settings') || can(c, role, 'manage_channels') : k === 'members' ? can(c, role, 'moderate') : can(c, role, 'approve'));
  const [section, setSection] = useState<Section>(sections.some(([k]) => k === initialSection) ? initialSection! : sections[0]?.[0] || 'members');
  const [voice, setVoice] = useState({ name: '', access: 'open' as VoiceAccess, max: String(VOICE_DEFAULT) });
  const [editing, setEditing] = useState<{ id: string; name: string; access: VoiceAccess; max: string } | null>(null);
  const voiceOff = live.voiceReady === false || live.voiceNeedsMigration;
  const accessSeg = (value: VoiceAccess, set: (a: VoiceAccess) => void) => <div className={s.seg} role="radiogroup" aria-label={t('Who can join the call')}>
    {(['open', 'closed'] as VoiceAccess[]).map(a => <Button key={a} size="sm" role="radio" aria-checked={value === a} variant={value === a ? 'primary' : 'outline'} onClick={() => set(a)}>{a === 'open' ? <Users size={14} /> : <Lock size={14} />} {t(a === 'open' ? 'Open channel' : 'Closed channel')}</Button>)}</div>;
  const capInput = (value: string, set: (v: string) => void) => <input className={inputClass} type="number" inputMode="numeric" min={VOICE_MIN} max={VOICE_MAX} value={value} aria-label={t('Max participants')} onChange={e => set(e.target.value)} onBlur={() => set(String(clampCapacity(value)))} />;
  const removeBtn = (ch: Channel) => confirmChannel === ch.id ? <><Button size="sm" variant="danger" disabled={live.busy} onClick={() => { setConfirmChannel(null); void live.deleteChannel(ch.id); }}>{t(ch.kind === 'voice' ? 'Delete' : 'Delete with messages')}</Button><Button size="sm" variant="ghost" onClick={() => setConfirmChannel(null)}>{t('Cancel')}</Button></>
    : <Button variant="ghost" icon aria-label={t('Remove channel')} onClick={() => setConfirmChannel(ch.id)}><Trash2 size={16} /></Button>;
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
        <div className={s.fieldLabel}>{t('Text channels')}</div>
        {live.channels.filter(ch => ch.kind !== 'voice').map(ch => <div key={ch.id} className={s.channelLine}><Hash size={16} /><span className={s.grow}>{ch.name}</span>{removeBtn(ch)}</div>)}
        <form className={s.channelLine} onSubmit={async e => { e.preventDefault(); if (channel.trim() && await live.createChannel(channel)) setChannel(''); }}><Hash size={16} />
          <input className={inputClass} value={channel} maxLength={40} placeholder={t('Channel name')} onChange={e => setChannel(e.target.value)} />
          <Button type="submit" size="sm" disabled={live.busy || !channel.trim()}><Plus size={14} /> {t('Add channel')}</Button></form>

        <div className={s.fieldLabel}>{t('Voice channels')}</div>
        {voiceOff && <p className={s.notice} role="status"><Lock size={16} /> {t('Voice channels need the database update (voice channels migration). Text channels keep working.')}</p>}
        {live.channels.filter(ch => ch.kind === 'voice').map(ch => editing?.id === ch.id ? <div key={ch.id} className={s.voiceEdit}>
          <Field label={t('Name')}><input className={inputClass} value={editing.name} maxLength={80} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
          <div className={s.permRow}><span>{t('Who can join the call')}<small>{t('Closed: only the owner, admins and moderators can join')}</small></span>{accessSeg(editing.access, a => setEditing({ ...editing, access: a }))}</div>
          <div className={s.permRow}><span>{t('Max participants')}<small>{t('From {min} to {max}', { min: VOICE_MIN, max: VOICE_MAX })}</small></span>{capInput(editing.max, v => setEditing({ ...editing, max: v }))}</div>
          <div className={s.seg}><Button size="sm" variant="primary" disabled={live.busy || !editing.name.trim()} onClick={async () => { if (await live.updateVoiceChannel(editing.id, { name: editing.name, access: editing.access, max: clampCapacity(editing.max) })) { setEditing(null); done(true); } }}>{t('Save changes')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('Cancel')}</Button></div>
        </div> : <div key={ch.id} className={s.channelLine}><Volume2 size={16} /><span className={s.grow}>{ch.name}</span>
          <span className={s.locked}>{ch.access === 'closed' ? <><Lock size={12} /> {t('Closed channel')}</> : t('Open channel')} · 0/{ch.max_participants ?? VOICE_DEFAULT}</span>
          <Button variant="ghost" icon aria-label={t('Edit voice channel')} onClick={() => setEditing({ id: ch.id, name: ch.name, access: ch.access || 'open', max: String(ch.max_participants ?? VOICE_DEFAULT) })}><Pencil size={16} /></Button>{removeBtn(ch)}</div>)}
        {!voiceOff && <form className={s.voiceEdit} onSubmit={async e => { e.preventDefault(); if (voice.name.trim() && await live.createChannel(voice.name, { access: voice.access, max: clampCapacity(voice.max) })) setVoice({ name: '', access: 'open', max: String(VOICE_DEFAULT) }); }}>
          <div className={s.channelLine}><Volume2 size={16} /><input className={inputClass} value={voice.name} maxLength={80} placeholder={t('Voice channel name')} onChange={e => setVoice({ ...voice, name: e.target.value })} /></div>
          <div className={s.permRow}><span>{t('Who can join the call')}</span>{accessSeg(voice.access, a => setVoice({ ...voice, access: a }))}</div>
          <div className={s.permRow}><span>{t('Max participants')}<small>{t('From {min} to {max}', { min: VOICE_MIN, max: VOICE_MAX })}</small></span>{capInput(voice.max, v => setVoice({ ...voice, max: v }))}</div>
          <div><Button type="submit" size="sm" disabled={live.busy || !voice.name.trim()}><Plus size={14} /> {t('Add voice channel')}</Button></div>
        </form>}
        <p className={s.hint}>{t('Voice calls themselves are not available yet. The channels and their settings are saved and enforced by the server.')}</p>
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
