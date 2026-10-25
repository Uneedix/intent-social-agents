'use client';
// One uniform layout for every community (real or example): header, tabs Feed | Channels | Members | About.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Hash, Info, Lock, LogOut, MessageCircle, MoreHorizontal, PhoneCall, RefreshCw, Send, Settings, Smile, Sparkles, Trash2, Users, Volume2, X } from 'lucide-react';
import { Button, Menu, inputClass } from '../ui';
import { useT } from '../I18n';
import { CATEGORY_LABEL, canJoinVoice, displayRole, formatCount, type ChannelKind, type JoinState, type Privacy, type VoiceAccess } from './model';
import { EmojiPicker } from '../EmojiPicker';
import { GifPicker } from '../GifPicker';
import { GifView } from '../GifView';
import { encodeGifBody, parseGifBody } from '../../lib/community-gif';
import { ExampleBadge, Face, Pic } from './parts';
import s from './communities.module.css';

export type Person = { id: string; name: string; avatar?: string | null; role?: string; me?: boolean; shared?: string[] };
export type ViewPost = { id: string; author: Person; body: string; at: number; canDelete: boolean };
export type ViewMsg = { id: string; author: Person; body: string; at: number };
/** exampleInCall: invented occupancy, demo communities only (always labelled Example). */
export type ViewChannel = { id: string; name: string; kind?: ChannelKind; access?: VoiceAccess; max_participants?: number; exampleInCall?: number };
export type ViewModel = {
  demo: boolean; name: string; description: string; category: string; tags: string[]; cover: string | null; icon: string | null;
  privacy: Privacy; memberCount: number | null; join: JoinState; role: string | null; signedIn: boolean;
  channelsEnabled: boolean; canPost: boolean; canManage: boolean;
  posts: ViewPost[]; members: Person[] | null; channels: ViewChannel[]; canManageChannels: boolean;
  activeChannel: string | null; messages: ViewMsg[]; recent: Person[]; activeNow: number | null;
  sharedInterest: Person[] | null; hasIntroduced: boolean;
  loading: boolean; busy: boolean; error: string; notice: string; messagesLoading: boolean; hasOlder: boolean; olderLoading: boolean;
};
export type ViewActions = {
  back: () => void; join: () => void; leave: () => void; retry: () => void; openSettings: () => void;
  publish: (body: string) => Promise<boolean>; deletePost: (id: string) => void;
  openChannel: (id: string) => void; send: (body: string) => Promise<boolean>; loadOlder: () => void;
  /** Opens channel settings (Structure). Absent for demo communities. */
  editChannels?: () => void;
};
type Tab = 'feed' | 'channels' | 'members' | 'about';

const ago = (at: number, t: (s: string, v?: Record<string, string | number>) => string) => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : new Date(at).toLocaleDateString();
};

export default function CommunityView({ v, a }: { v: ViewModel; a: ViewActions }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('feed'), [draft, setDraft] = useState(''), [chat, setChat] = useState('');
  const [picker, setPicker] = useState<'emoji' | 'gif' | null>(null), [chatNote, setChatNote] = useState(''), [voiceNote, setVoiceNote] = useState('');
  const chatInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null), chatEnd = useRef<HTMLDivElement>(null);
  const locale = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
  useEffect(() => { if (tab === 'channels' && !v.channelsEnabled) setTab('feed'); }, [tab, v.channelsEnabled]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [v.messages.length, v.activeChannel]);
  const member = v.join === 'member';
  const staff = v.canManage;
  const intro = v.channels.find(c => c.kind !== 'voice' && /intro/.test(c.name));
  const textChannels = v.channels.filter(c => c.kind !== 'voice'), voiceChannels = v.channels.filter(c => c.kind === 'voice');
  const active = v.channels.find(c => c.id === v.activeChannel) || null;
  useEffect(() => { setPicker(null); setChatNote(''); setVoiceNote(''); }, [v.activeChannel]);
  const sendGif = async (g: { url: string; width: number; height: number; provider: 'giphy' | 'tenor' | 'upload' }) => {
    setPicker(null);
    const body = encodeGifBody(g);
    if (!body) { setChatNote(t('Uploaded GIFs cannot be shared in channels yet. Pick one from search or paste a GIPHY/Tenor link.')); return; }
    setChatNote(''); await a.send(body);
  };
  const channelBtn = (c: ViewChannel) => <button key={c.id} className={v.activeChannel === c.id ? s.channelOn : s.channel} onClick={() => a.openChannel(c.id)}>
    {c.kind === 'voice' ? <Volume2 size={15} /> : <Hash size={15} />}<span>{c.name}</span>
    {c.kind === 'voice' && <>{c.access === 'closed' && <Lock size={12} aria-label={t('Closed channel')} />}<small className={s.cap}>{c.exampleInCall ?? 0}/{c.max_participants ?? 10}</small></>}</button>;
  const startIntro = () => { setTab('feed'); setDraft(t('Hi everyone! I’m … and I joined because …')); setTimeout(() => composer.current?.focus(), 0); };
  const jump = (id: string) => { setTab('channels'); a.openChannel(id); };
  const joinText = v.join === 'member' ? 'Joined' : v.join === 'pending' ? 'Requested' : v.privacy === 'private' ? 'Invite only' : v.privacy === 'request' ? 'Request to join' : 'Join';

  const tabs: [Tab, string][] = [['feed', 'Feed'], ...(v.channelsEnabled ? [['channels', 'Channels'] as [Tab, string]] : []), ['members', 'Members'], ['about', 'About']];
  return <section className={s.view}>
    <Button variant="ghost" size="sm" className={s.back} onClick={a.back}><ArrowLeft size={16} /> {t('All communities')}</Button>
    <header className={s.hero}>
      <Pic src={v.cover} className={s.heroCover} initial={false} seed={v.name} />
      <div className={s.heroBar}>
        <Pic src={v.icon} className={s.heroIcon} seed={v.name} />
        <div className={s.heroText}><h1 title={v.name}>{v.name}</h1>
          <small>{v.memberCount != null ? t('{n} members', { n: formatCount(v.memberCount, locale) }) : t(v.privacy === 'private' ? 'Private' : v.privacy === 'request' ? 'Approval required' : 'Open')}
            {v.activeNow != null && <> · <i className={s.dot} /> {t('{n} active now', { n: formatCount(v.activeNow, locale) })}</>}
            {' · '}{t(CATEGORY_LABEL[v.category] || 'Other')}{v.demo && <> · <ExampleBadge label={t('Example')} /></>}</small></div>
        <div className={s.heroActions}>
          {!v.signedIn && !v.demo ? <Button variant="primary" onClick={() => { location.href = '/login'; }}>{t('Log in to join')}</Button>
            : v.role !== 'owner' && <Button variant={v.join === 'none' ? 'primary' : 'outline'} disabled={v.busy || (v.join === 'none' && v.privacy === 'private')} onClick={v.join === 'none' ? a.join : undefined}>{v.privacy === 'private' && v.join === 'none' && <Lock size={15} />}{t(joinText)}</Button>}
          {staff && <Button variant="outline" onClick={a.openSettings}><Settings size={16} /> {t('Settings')}</Button>}
          {(v.join !== 'none' && v.role !== 'owner') && <Menu trigger={(open, toggle) => <Button variant="outline" icon aria-label={t('More options')} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} /></Button>}
            items={[{ label: t(v.join === 'pending' ? 'Cancel request' : 'Leave community'), icon: <LogOut size={16} />, danger: true, onSelect: a.leave }]} />}
        </div>
      </div>
      <nav className={s.tabs} role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? s.tabOn : s.tab} onClick={() => setTab(k)}>{t(l)}</button>)}</nav>
    </header>
    {v.notice && <p className={s.notice} role="status"><Info size={16} /> {v.notice}</p>}
    {v.error && <p className={s.error} role="alert">{v.error} <Button size="sm" onClick={a.retry}><RefreshCw size={14} /> {t('Retry')}</Button></p>}
    {v.loading && <p className={s.muted} role="status">{t('Loading community...')}</p>}

    {tab === 'feed' && <div className={s.feedLayout}>
      <div className={s.feedCol}>
        {member && !v.hasIntroduced && <div className={s.introCard}><Sparkles size={20} /><div><b>{t('Say hello to the community')}</b><small>{t('A short intro helps like-minded members find you.')}</small></div>
          <Button size="sm" variant="primary" onClick={intro && !v.canPost ? () => jump(intro.id) : startIntro}>{t('Introduce yourself')}</Button></div>}
        {member && v.canPost && <div className={s.composer}><textarea ref={composer} className={inputClass} rows={3} maxLength={10000} placeholder={t('Share something with your community...')} value={draft} onChange={e => setDraft(e.target.value)} />
          <div className={s.composerFoot}><Button variant="primary" size="sm" disabled={v.busy || !draft.trim()} onClick={async () => { if (await a.publish(draft)) setDraft(''); }}>{t('Publish')}</Button></div></div>}
        {member && !v.canPost && <p className={s.muted}>{t('Only the owner, admins and moderators publish here. Join the conversation in channels.')}</p>}
        {!member && !v.loading && <p className={s.muted}>{t('Join to post and chat with members.')}</p>}
        {v.posts.map(p => <article key={p.id} className={s.post}><div className={s.postHead}><Face src={p.author.avatar} name={p.author.name} size={36} /><div><b>{p.author.me ? t('You') : p.author.name}</b><small>{ago(p.at, t)}</small></div>
          {p.canDelete && <Menu trigger={(open, toggle) => <button className={s.dots} aria-label={t('More options')} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} /></button>} items={[{ label: t('Delete'), icon: <Trash2 size={16} />, danger: true, onSelect: () => a.deletePost(p.id) }]} />}</div>
          <p className={s.postBody}>{p.body}</p></article>)}
        {!v.loading && !v.posts.length && <div className={s.emptySmall}>{t('No posts yet.')}</div>}
      </div>
    </div>}

    {tab === 'channels' && v.channelsEnabled && <div className={s.chatLayout}>
      <div className={s.channelList}>
        {textChannels.length > 0 && <small className={s.groupLabel}>{t('Text channels')}</small>}
        {textChannels.map(channelBtn)}
        {voiceChannels.length > 0 && <small className={s.groupLabel}>{t('Voice channels')}</small>}
        {voiceChannels.map(channelBtn)}
        {!v.channels.length && <small className={s.muted}>{t('No channels yet.')}</small>}
        {v.canManageChannels && a.editChannels && <button className={s.channel} onClick={a.editChannels}><Settings size={15} /><span>{t('Manage channels')}</span></button>}</div>
      <div className={s.chat}>
        {!active ? <div className={s.emptySmall}>{v.channels.length ? t('Pick a channel to join the conversation.') : t('No channels yet.')}</div>
        : active.kind === 'voice' ? <div className={s.voiceRoom}>
          <div className={s.voiceIcon}><Volume2 size={30} /></div>
          <h3 title={active.name}>{active.name}</h3>
          <p className={s.voiceMeta}>{active.access === 'closed' ? <><Lock size={14} /> {t('Closed: only the owner, admins and moderators can join')}</> : <><Users size={14} /> {t('Open: all members can join')}</>}</p>
          <p className={s.voiceMeta}><b>{t('{n}/{max} in the call', { n: active.exampleInCall ?? 0, max: active.max_participants ?? 10 })}</b>{v.demo && <> · <ExampleBadge label={t('Example')} /></>}</p>
          <div className={s.voiceActions}>
            <Button variant="primary" disabled={!member || !canJoinVoice(active.access, v.role || (member ? 'member' : null))} onClick={() => setVoiceNote(t('Voice calls are not available yet — the channel and its settings are saved.'))}><PhoneCall size={16} /> {t('Join call')}</Button>
            {v.canManageChannels && a.editChannels && <Button variant="outline" onClick={a.editChannels}><Settings size={16} /> {t('Channel settings')}</Button>}
          </div>
          {!member ? <p className={s.muted}>{t('Join to chat with members.')}</p>
            : !canJoinVoice(active.access, v.role || 'member') && <p className={s.muted}>{t('This voice channel is closed. Only the owner, admins and moderators can join.')}</p>}
          {voiceNote && <p className={s.notice} role="status"><Info size={16} /> {voiceNote}</p>}
        </div> : <>
          <div className={s.chatScroll}>
            {v.hasOlder && <Button size="sm" disabled={v.olderLoading} onClick={a.loadOlder}>{t(v.olderLoading ? 'Loading...' : 'Load older messages')}</Button>}
            {v.messagesLoading && <p className={s.muted} role="status">{t('Loading...')}</p>}
            {!v.messagesLoading && !v.messages.length && <div className={s.emptySmall}>{t('No messages yet.')}</div>}
            {v.messages.map(m => { const gif = parseGifBody(m.body); return <div key={m.id} className={s.msg}><Face src={m.author.avatar} name={m.author.name} size={30} /><div><b>{m.author.me ? t('You') : m.author.name} <small>{ago(m.at, t)}</small></b>
              {gif ? <div className={s.msgGif}><GifView gif={gif} maxWidth={260} maxHeight={220} /></div> : <p>{m.body}</p>}</div></div>; })}
            <div ref={chatEnd} />
          </div>
          {member ? <div className={s.chatCompose}>
            {picker === 'emoji' && <EmojiPicker variant="inline" onPick={e => { setChat(c => (c + e).slice(0, 4000)); chatInput.current?.focus(); }} onClose={() => setPicker(null)} />}
            {picker === 'gif' && <GifPicker variant="inline" onPick={g => void sendGif(g)} onClose={() => setPicker(null)} />}
            {chatNote && <p className={s.notice} role="status"><Info size={16} /> {chatNote}</p>}
            <form className={s.chatForm} onSubmit={async e => { e.preventDefault(); if (chat.trim() && await a.send(chat)) { setChat(''); setPicker(null); } }}>
              <button type="button" className={picker === 'emoji' ? s.roundOn : s.round} aria-label={t('Emoji')} aria-expanded={picker === 'emoji'} onClick={() => setPicker(p => p === 'emoji' ? null : 'emoji')}>{picker === 'emoji' ? <X size={20} /> : <Smile size={20} />}</button>
              <button type="button" className={picker === 'gif' ? s.roundOn : s.round} aria-label="GIF" aria-expanded={picker === 'gif'} onClick={() => setPicker(p => p === 'gif' ? null : 'gif')}><span className={s.gifTag}>GIF</span></button>
              <input ref={chatInput} className={s.pill} value={chat} maxLength={4000} placeholder={t('Message #{name}', { name: active.name })} onChange={e => setChat(e.target.value)} />
              <Button type="submit" variant="primary" icon aria-label={t('Send')} disabled={v.busy || !chat.trim()}><Send size={17} /></Button></form></div>
            : <p className={s.muted}>{t('Join to chat with members.')}</p>}
        </>}
      </div>
    </div>}

    {tab === 'members' && <div className={s.memberGrid}>
      {v.members === null ? <div className={s.emptySmall}>{t('Log in to see who is here.')}</div>
        : v.members.map(p => <div key={p.id} className={s.memberRow}><Face src={p.avatar} name={p.name} size={40} /><div><b>{p.me ? t('You') : p.name}</b><small>{t(displayRole(p.role).replace(/^./, c => c.toUpperCase()))}</small></div></div>)}
    </div>}

    {tab === 'about' && <div className={s.about}>
      <p>{v.description || t('No description yet.')}</p>
      <dl className={s.summary}>
        <dt>{t('Category')}</dt><dd>{t(CATEGORY_LABEL[v.category] || 'Other')}</dd>
        <dt>{t('Who can join')}</dt><dd>{t(v.privacy === 'public' ? 'Open' : v.privacy === 'request' ? 'Approval required' : 'Private')}</dd>
        <dt>{t('Feed')}</dt><dd>{t('Always on')}</dd>
        <dt>{t('Channels')}</dt><dd>{t(v.channelsEnabled ? 'On' : 'Off')}</dd>
        {v.tags.length > 0 && <><dt>{t('Tags')}</dt><dd>{v.tags.map(x => '#' + x).join(' ')}</dd></>}
      </dl>
    </div>}
  </section>;
}
