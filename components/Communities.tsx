'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useT } from './I18n';
import { useSession } from './SessionBoundary';
import { useProfile } from './Experience';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';
import { demoCommunities, demoPeople } from '../lib/demo/communities';
import { createCommunity, joinCommunity, leaveCommunity, loadDirectory, schemaOf, type DB, type Schema } from './communities/api';
import { can, errorText, filterCards, recentlyActive, shortId, type CardItem, type Community, type Draft, type JoinState } from './communities/model';
import { useLiveCommunity } from './communities/useLiveCommunity';
import Directory from './communities/Directory';
import CreateWizard from './communities/CreateWizard';
import CommunityView, { type Person, type ViewActions, type ViewModel } from './communities/CommunityView';
import SettingsModal from './communities/SettingsModal';
import { setRailState } from './communities/store';
import s from './communities/communities.module.css';

export { default as CommunitiesRail } from './communities/Rail';

type Selected = { kind: 'real' | 'demo'; id: string } | null;
const DEMO_KEY = 'demo:', REAL_KEY = 'real:';

export default function Communities() {
  const { user, scope } = useSession();
  const [db] = useState<DB | null>(() => { try { return isSupabaseConfigured() ? createClient() : null; } catch { return null; } });
  return <CommunitiesApp key={scope} db={db} user={user} />;
}

const interestWords = (raw: string) => raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

function CommunitiesApp({ db, user }: { db: DB | null; user: User | null }) {
  const t = useT();
  const { profile } = useProfile();
  const interests = useMemo(() => interestWords(profile.interests || ''), [profile.interests]);
  const [rows, setRows] = useState<Community[]>([]), [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [mine, setMine] = useState<Record<string, { join: JoinState; role?: string }>>({});
  const [schema, setSchema] = useState<Schema>('unknown');
  const [loading, setLoading] = useState(!!db), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [chip, setChip] = useState('foryou'), [hidden, setHidden] = useState<string[]>([]);
  const [demoJoined, setDemoJoined] = useState<string[]>([]), [demoChannel, setDemoChannel] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null), [wizard, setWizard] = useState(false), [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try { const r = await loadDirectory(db, user?.id || null); setRows(r.rows); setCounts(r.counts); setMine(r.mine); setSchema(x => schemaOf(r.rows, x)); setError(''); }
    catch (e) { setError(errorText(e, t('Could not load communities'))); }
    finally { setLoading(false); }
  }, [db, user, t]);
  useEffect(() => { void reload(); }, [reload]);
  const flash = useCallback((m: string) => { setNotice(m); window.setTimeout(() => setNotice(n => n === m ? '' : n), 4000); }, []);

  const showDemo = !db || (!loading && !error && rows.length === 0);
  const cards = useMemo<CardItem[]>(() => {
    const real: CardItem[] = rows.map(c => { const n = counts?.[c.id] ?? null; return { key: REAL_KEY + c.id, name: c.name, description: c.description, category: c.category || 'other', tags: c.tags || [], cover: c.cover_url, icon: c.avatar_url, members: n, privacy: c.privacy, demo: false, join: mine[c.id]?.join || 'none', avatars: n ? Array(Math.min(3, n)).fill('') : [] }; });
    const demo: CardItem[] = showDemo ? demoCommunities.map(d => ({ key: DEMO_KEY + d.id, name: d.name, description: d.description, category: d.category, tags: d.tags, cover: d.cover, icon: d.icon, members: d.members, privacy: 'public', demo: true, join: demoJoined.includes(d.id) ? 'member' : 'none', avatars: demoPeople.slice(0, 3).map(p => p.avatar) })) : [];
    return [...real, ...demo].filter(c => !hidden.includes(c.key));
  }, [rows, counts, mine, showDemo, demoJoined, hidden]);
  const visible = useMemo(() => filterCards(cards, chip, interests), [cards, chip, interests]);

  const open = useCallback((key: string) => { setSelected({ kind: key.startsWith(DEMO_KEY) ? 'demo' : 'real', id: key.replace(/^(demo|real):/, '') }); window.scrollTo({ top: 0 }); }, []);
  const openWizard = useCallback(() => setWizard(true), []);
  const closeWizard = useCallback(() => setWizard(false), []);
  const join = useCallback(async (key: string) => {
    const id = key.replace(/^(demo|real):/, '');
    if (key.startsWith(DEMO_KEY)) { setDemoJoined(j => j.includes(id) ? j.filter(x => x !== id) : [...j, id]); flash(t('This is an example community — joining is shown here but not saved.')); return; }
    const c = rows.find(r => r.id === id); if (!c || !db) return;
    if (!user) { flash(t('Log in to join communities.')); return; }
    if (mine[id]?.join && mine[id].join !== 'none') { open(key); return; }
    setBusyKey(key);
    try { const state = await joinCommunity(db, user.id, c); setMine(m => ({ ...m, [id]: { join: state, role: state === 'member' ? 'member' : undefined } })); flash(t(state === 'member' ? 'You joined {name}.' : 'Request sent to {name}.', { name: c.name })); void reload(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusyKey(null); }
  }, [rows, db, user, mine, flash, t, reload, open]);
  const discover = useCallback(() => { setSelected(null); setChip('foryou'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  useEffect(() => { setRailState({ items: cards, open, join: k => void join(k), create: openWizard, discover, busyKey }); }, [cards, open, join, openWizard, discover, busyKey]);
  useEffect(() => () => setRailState({ items: [] }), []);

  const create = async (d: Draft) => {
    if (!db) return t('The database is not configured here, so new communities cannot be saved.');
    if (!user) return t('Log in to create a community.');
    try {
      const r = await createCommunity(db, user.id, d, schema);
      if (r.legacy) setSchema('legacy');
      setWizard(false); setRows(x => [r.community, ...x.filter(y => y.id !== r.community.id)]); setMine(m => ({ ...m, [r.community.id]: { join: 'member', role: 'owner' } }));
      setSelected({ kind: 'real', id: r.community.id });
      flash([t('Community created.'), r.legacy ? t('Category and tags were not saved: the database update for communities is not applied yet.') : '', r.channelError ? t('Starter channels could not be created: {e}', { e: r.channelError }) : ''].filter(Boolean).join(' '));
      void reload(); return null;
    } catch (e) { return errorText(e); }
  };

  const real = selected?.kind === 'real' ? rows.find(r => r.id === selected.id) : undefined;
  const demo = selected?.kind === 'demo' ? demoCommunities.find(d => d.id === selected.id) : undefined;
  return <div className={s.root}>
    {real && db ? <LiveCommunityPage key={real.id} db={db} user={user} community={real} mine={mine[real.id]} count={counts?.[real.id] ?? null} notice={notice}
      onBack={() => setSelected(null)} onChanged={() => void reload()} onJoin={() => void join(REAL_KEY + real.id)}
      onLeft={() => { setMine(m => { const n = { ...m }; delete n[real.id]; return n; }); void reload(); }} />
      : demo ? <CommunityView v={demoModel(demo.id, demoJoined.includes(demo.id), interests, notice, demoChannel)} a={{
        back: () => setSelected(null), join: () => void join(DEMO_KEY + demo.id), leave: () => void join(DEMO_KEY + demo.id), retry: () => {}, openSettings: () => {},
        publish: async () => { flash(t('This is an example community — posts are not saved. Create your own community to start.')); return false; },
        send: async () => { flash(t('This is an example community — messages are not saved.')); return false; },
        deletePost: () => {}, openChannel: id => setDemoChannel(id), loadOlder: () => {},
      }} />
      : <Directory cards={visible} chip={chip} onChip={setChip} onCreate={openWizard} onOpen={open} onJoin={k => void join(k)} busyKey={busyKey}
        onHide={k => { setHidden(h => [...h, k]); flash(t('Hidden from this list until you reload.')); }} onReport={() => flash(t('Reporting is not available yet.'))}
        loading={loading} error={error} onRetry={() => void reload()}
        notice={notice || (!db ? t('The database is not configured here. Showing example communities; nothing you do is saved.') : '')} />}
    {wizard && <CreateWizard signedIn={!!user} configured={!!db} onClose={closeWizard} onCreate={create} />}
  </div>;
}

function demoModel(id: string, joined: boolean, interests: string[], notice: string, demoChannel: string | null): ViewModel {
  const d = demoCommunities.find(x => x.id === id)!;
  const person = (i: number): Person => ({ id: 'demo-person-' + i, name: demoPeople[i].name, avatar: demoPeople[i].avatar, role: demoPeople[i].role || 'member' });
  const channels = d.channels.map(n => ({ id: d.id + '#' + n, name: n }));
  const active = channels.some(c => c.id === demoChannel) ? demoChannel : null;
  const now = Date.now();
  return {
    demo: true, name: d.name, description: d.description, category: d.category, tags: d.tags, cover: d.cover, icon: d.icon, privacy: 'public',
    memberCount: d.members, join: joined ? 'member' : 'none', role: null, signedIn: true, channelsEnabled: true, canPost: joined, canManage: false,
    posts: d.posts.map((p, i) => ({ id: d.id + '-p' + i, author: person(p.author), body: p.text, at: now - p.hoursAgo * 3600e3, canDelete: false })),
    members: demoPeople.map((_, i) => person(i)), channels, activeChannel: active,
    messages: active ? d.chat.map((m, i) => ({ id: d.id + '-m' + i, author: person(m.author), body: m.text, at: now - m.minutesAgo * 60e3 })) : [],
    recent: demoPeople.map((_, i) => person(i)), activeNow: d.activeNow,
    sharedInterest: demoPeople.map((p, i) => ({ ...person(i), shared: p.interests.filter(x => interests.some(w => w.includes(x) || x.includes(w))) })).filter(p => p.shared!.length),
    hasIntroduced: false, loading: false, busy: false, error: '', notice, messagesLoading: false, hasOlder: false, olderLoading: false,
  };
}

function LiveCommunityPage({ db, user, community, mine, count, notice, onBack, onChanged, onJoin, onLeft }: {
  db: DB; user: User | null; community: Community; mine?: { join: JoinState; role?: string }; count: number | null; notice: string;
  onBack: () => void; onChanged: () => void; onJoin: () => void; onLeft: () => void;
}) {
  const t = useT();
  const live = useLiveCommunity(db, community, user, onChanged);
  const [settings, setSettings] = useState(false);
  const closeSettings = useCallback(() => setSettings(false), []);
  const c = live.community;
  const meRow = live.members.find(m => m.user_id === user?.id);
  const role = meRow?.role || (mine?.join === 'member' ? mine.role || 'member' : null);
  const join: JoinState = meRow ? 'member' : mine?.join || 'none';
  const person = (id: string, roleName?: string): Person => ({ id, name: t('Member {id}', { id: shortId(id) }), me: id === user?.id, role: roleName });
  const roleOf = (id: string) => live.members.find(m => m.user_id === id)?.role;
  const recent = recentlyActive([...live.posts, ...live.messages], Date.now()).map(id => person(id, roleOf(id)));
  const v: ViewModel = {
    demo: false, name: c.name, description: c.description, category: c.category || 'other', tags: c.tags || [], cover: c.cover_url, icon: c.avatar_url, privacy: c.privacy,
    memberCount: user ? live.members.length || count : count, join, role, signedIn: !!user, channelsEnabled: c.channels_enabled,
    canPost: can(c, role, 'post'), canManage: can(c, role, 'moderate') || can(c, role, 'approve'),
    posts: live.posts.map(p => ({ id: p.id, author: person(p.author_id, roleOf(p.author_id)), body: p.body, at: Date.parse(p.created_at), canDelete: p.author_id === user?.id || can(c, role, 'moderate') })),
    members: user ? live.members.map(m => person(m.user_id, m.role)) : null, channels: live.channels, activeChannel: live.activeChannel,
    messages: live.messages.map(m => ({ id: m.id, author: person(m.author_id), body: m.body, at: Date.parse(m.created_at) })),
    recent, activeNow: null, sharedInterest: null, hasIntroduced: live.posts.some(p => p.author_id === user?.id),
    loading: live.loading, busy: live.busy, error: live.error, notice: notice || (live.needsMigration ? t('Some management features need the database update for communities. Ask the project owner to apply it.') : ''),
    messagesLoading: live.messagesLoading, hasOlder: live.hasOlder, olderLoading: live.olderLoading,
  };
  const a: ViewActions = {
    back: onBack, retry: () => void live.reload(), openSettings: () => setSettings(true),
    join: () => { onJoin(); setTimeout(() => void live.reload(), 600); },
    leave: () => void live.perform(async () => { if (!user) return; await leaveCommunity(db, user.id, c.id, join === 'pending'); await live.reload(); onLeft(); }),
    publish: body => live.publish(body), deletePost: id => void live.deletePost(id),
    openChannel: live.openChannel, send: body => live.send(body), loadOlder: () => void live.loadOlder(),
  };
  return <>
    <CommunityView v={v} a={a} />
    {settings && <SettingsModal live={live} role={role} userId={user?.id || null} onClose={closeSettings} />}
  </>;
}
