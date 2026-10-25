'use client';
import { useI18n } from '../components/I18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Search, Target, Users, ShoppingBag, MessageCircle, Bell, UserCircle, Bookmark, Clock3, Settings, Plus, Image as ImageIcon, Video, List, BarChart3, X, ArrowRight, MapPin, Megaphone, Trash2, Heart, UserPlus, AtSign, CheckCheck } from 'lucide-react';
import GroupMessages from '../components/GroupMessages';
import AuthStatus from '../components/AuthStatus';
import WidgetRail from '../components/WidgetRail';
import FeedPanels from '../components/FeedPanels';
import Communities from '../components/Communities';
import PostCard, { type Comment, Lightbox } from '../components/PostCard';
import Composer, { type Draft } from '../components/Composer';
import Stories, { type MyStory } from '../components/Stories';
import Messenger from '../components/Messenger';
import ImagePicker from '../components/ImagePicker';
import { SearchHub, ProfileStudio, SettingsStudio, useProfile, type SettingsSection } from '../components/Experience';
import { avatars, initialPosts, initialIntentions, products, sampleChats, type Post, type Section, type Chat } from '../lib/data';
import { useStored, uid } from '../lib/social';

const nav = [{ name: 'Home', Icon: Home }, { name: 'Explore', Icon: Search }, { name: 'Intentions', Icon: Target }, { name: 'Communities', Icon: Users }, { name: 'Messages', Icon: MessageCircle }, { name: 'Market', Icon: ShoppingBag }, { name: 'Notifications', Icon: Bell }, { name: 'Profile', Icon: UserCircle }] as const;
const extras = [{ name: 'Instant ADS', Icon: Megaphone }, { name: 'Saved', Icon: Bookmark }, { name: 'Your activity', Icon: Clock3 }, { name: 'Settings', Icon: Settings }] as const;
const ME = 'you';
const people: [string, string, string][] = [['Daniel', 'daniel', avatars.daniel], ['Maria', 'maria', avatars.sofia], ['Luca', 'luca', avatars.luca], ['Emma', 'emma', avatars.emma]];
const SAMPLE_POLL: Post = { id: 4, author: 'Emma', handle: 'emma', avatar: avatars.emma, time: '9h', text: 'Where do you prefer to meet new people? #networking #Warsaw', images: [], likes: 64, comments: 9, reposts: 3, poll: { options: [{ text: 'Coffee meetups', votes: 182 }, { text: 'Online communities', votes: 140 }, { text: 'Events & workshops', votes: 96 }], endsAt: Date.now() + 2 * 86400000 }, views: 4200 };
type Notif = { id: number; kind: 'like' | 'comment' | 'follow' | 'mention' | 'invite' | 'system'; who: string; avatar: string; text: string; at: number; read?: boolean };
const seedNotifs = (): Notif[] => [
  { id: 1, kind: 'like', who: 'Sofia', avatar: avatars.sofia, text: 'reacted to your intention', at: Date.now() - 2 * 3600e3 },
  { id: 2, kind: 'follow', who: 'Luca', avatar: avatars.luca, text: 'started following you', at: Date.now() - 5 * 3600e3 },
  { id: 3, kind: 'invite', who: 'Creative Hub', avatar: avatars.alex, text: 'invited you to join their community', at: Date.now() - 26 * 3600e3 },
  { id: 4, kind: 'system', who: 'intent.', avatar: avatars.you, text: 'Welcome to intent. Complete your profile to get better recommendations.', at: Date.now() - 30 * 3600e3, read: true }];

export default function Page() {
  const { t, lang: language, setLang: setLanguage } = useI18n();
  const [section, setSection] = useState<Section>('Home');
  const [tab, setTab] = useState<'Feeds' | 'Intentions'>('Feeds');
  const [feedMode, setFeedMode] = useState<'foryou' | 'following'>('foryou');
  const [posts, setPosts] = useStored<Post[]>('intent-posts', [...initialPosts, SAMPLE_POLL]);
  const [intentions, setIntentions] = useStored<Post[]>('intent-intentions', initialIntentions);
  const [saved, setSaved] = useStored<number[]>('intent-saved', []);
  const [reactions, setReactions] = useStored<Record<number, string>>('intent-reactions', {});
  const [following, setFollowing] = useStored<string[]>('intent-following', []);
  const [right, setRight] = useStored('intent-sidebar', true);
  const [reposted, setReposted] = useStored<number[]>('intent-reposts', []);
  const [pinned, setPinned] = useStored<number | null>('intent-pinned', null);
  const [hidden, setHidden] = useStored<number[]>('intent-hidden', []);
  const [muted, setMuted] = useStored<string[]>('intent-muted', []);
  const [comments, setComments] = useStored<Record<number, Comment[]>>('intent-comments-v2', {});
  const [myStories, setMyStories] = useStored<MyStory[]>('intent-stories-v1', []);
  const [seenStories, setSeenStories] = useStored<string[]>('intent-stories-seen', []);
  const [chats, setChats] = useStored<Chat[]>('intent-chats-v2', sampleChats());
  const [notifs, setNotifs] = useStored<Notif[]>('intent-notifs', seedNotifs());
  const [myListings, setMyListings] = useStored<{ id: number; name: string; price: number; city: string; image: string }[]>('intent-listings', []);
  const [ads, setAds] = useStored<{ id: number; name: string; budget: number; objective: string; status: string }[]>('intent-ads', []);
  const [privacy, setPrivacy] = useStored('intent-privacy', 'Public');
  const [allowMessages, setAllowMessages] = useStored('intent-allow-messages', true);
  const [allowMentions, setAllowMentions] = useStored('intent-allow-mentions', true);
  const [emailAlerts, setEmailAlerts] = useStored('intent-email-alerts', false);
  const [currency, setCurrency] = useStored('intent-currency', 'PLN');
  const [words, setWords] = useStored<string[]>('intent-hidden-words', []);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profile');
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState<{ kind: 'post' | 'intention'; quote?: Post | null } | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messageMode, setMessageMode] = useState<'direct' | 'groups'>('direct');
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Post | null>(null);
  const [shareDM, setShareDM] = useState<Post | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [listingName, setListingName] = useState(''); const [listingPrice, setListingPrice] = useState(''); const [listingImage, setListingImage] = useState('');
  const [marketCategory, setMarketCategory] = useState('All');
  const [adName, setAdName] = useState(''); const [adBudget, setAdBudget] = useState('10'); const [adObjective, setAdObjective] = useState('Profile visits');
  const [notifFilter, setNotifFilter] = useState<'all' | 'mentions' | 'follows'>('all');
  const [lightbox, setLightbox] = useState<{ images: string[]; i: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { profile, save: saveProfile } = useProfile();

  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const failed = () => setStorageError(true);
    window.addEventListener('intent-storage-error', failed);
    return () => window.removeEventListener('intent-storage-error', failed);
  }, []);
  const toast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2800); }, []);
  const all = useMemo(() => [...posts, ...intentions], [posts, intentions]);
  const byId = (id?: number) => (id ? all.find(p => p.id === id) || null : null);
  const go = (s: Section) => { setSection(s); window.scrollTo({ top: 0 }); };

  // X-style keyboard shortcuts: "/" search, "n" new post
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setComposer({ kind: 'post' }); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);

  const openChatWith = (handle: string, name: string, avatar: string, text?: string) => {
    let list = chats; let c = list.find(x => x.handle === handle);
    if (!c) { c = { id: handle, name, handle, avatar, kind: 'personal', messages: [] }; list = [c, ...list]; }
    if (text) list = list.map(x => x.id === c!.id ? { ...x, messages: [...x.messages, { id: uid(), from: 'me', text, at: Date.now() }] } : x);
    setChats(list); setActiveChat(c.id); setMessageMode('direct'); return c;
  };

  const publish = (d: Draft) => {
    const p: Post = { id: uid(), author: profile.name || 'You', handle: ME, avatar: profile.avatar || avatars.you, time: 'now', createdAt: Date.now(), text: d.text, images: d.images, likes: 0, comments: 0, reposts: 0, kind: d.kind, category: d.category, poll: d.poll, audience: d.audience, quoteOf: d.quoteOf, views: 0 };
    if (d.quoteOf) { const q = byId(d.quoteOf); if (q) setReposted(current => current.includes(q.id) ? current : [...current, q.id]); }
    if (d.kind === 'post') { setPosts([p, ...posts]); setTab('Feeds'); if (section !== 'Profile') go('Home'); } else { setIntentions([p, ...intentions]); go('Intentions'); }
    setComposer(null); toast(t("Published"));
  };
  const updatePost = () => { if (!editPost?.text.trim()) return; const f = (x: Post) => x.id === editPost.id ? { ...x, text: editPost.text.trim(), edited: true } : x; setPosts(posts.map(f)); setIntentions(intentions.map(f)); setEditPost(null); toast(t("Post updated")); };
  const deletePost = (p: Post) => { if (p.handle !== ME) return; setPosts(posts.filter(x => x.id !== p.id)); setIntentions(intentions.filter(x => x.id !== p.id)); setSaved(saved.filter(x => x !== p.id)); const c = { ...comments }; delete c[p.id]; setComments(c); if (pinned === p.id) setPinned(null); setConfirmDelete(null); toast(t("Post deleted")); };
  const vote = (p: Post, i: number) => { const f = (x: Post) => x.id === p.id && x.poll && x.poll.myVote == null && Date.now() < x.poll.endsAt ? { ...x, poll: { ...x.poll, myVote: i } } : x; setPosts(posts.map(f)); setIntentions(intentions.map(f)); };
  const toggleFollow = (handle: string) => { const on = following.includes(handle); setFollowing(on ? following.filter(x => x !== handle) : [...following, handle]); toast(t(on ? 'Unfollowed' : 'Following|button')); };
  const tagSearch = (q: string) => { setQuery(q); go('Explore'); };

  const card = (p: Post) => <PostCard key={p.id} p={p} me={ME} quoted={byId(p.quoteOf)} reaction={reactions[p.id]} saved={saved.includes(p.id)} reposted={reposted.includes(p.id)} pinned={pinned === p.id}
    comments={comments[p.id] || []} toast={toast} onTag={tagSearch}
    onReact={r => { const n = { ...reactions }; if (r) n[p.id] = r; else delete n[p.id]; setReactions(n); }}
    onSave={() => { const on = saved.includes(p.id); setSaved(on ? saved.filter(x => x !== p.id) : [...saved, p.id]); toast(t(on ? 'Removed from saved' : 'Saved!')); }}
    onRepost={() => { const on = reposted.includes(p.id); setReposted(on ? reposted.filter(x => x !== p.id) : [...reposted, p.id]); toast(t(on ? 'Repost removed' : 'Reposted')); }}
    onQuote={() => setComposer({ kind: 'post', quote: p })} onComments={c => setComments({ ...comments, [p.id]: c })} onVote={i => vote(p, i)}
    onEdit={() => setEditPost({ ...p })} onDelete={() => setConfirmDelete(p)} onPin={() => { setPinned(pinned === p.id ? null : p.id); toast(t(pinned === p.id ? 'Unpinned' : 'Pinned to your profile')); }}
    onHide={() => { setHidden([...hidden, p.id]); toast(t("Post hidden. We’ll show fewer posts like this.")); }} onMute={() => { setMuted([...muted, p.handle]); toast(t('@{h} muted', { h: p.handle })); }}
    onRespond={() => { openChatWith(p.handle, p.author, p.avatar); go('Messages'); toast(t("Conversation opened")); }} onShareDM={() => setShareDM(p)} />;

  const visible = (list: Post[]) => list.filter(p => !hidden.includes(p.id) && !muted.includes(p.handle) && !words.some(w => p.text.toLowerCase().includes(w)));
  const feedPosts = useMemo(() => {
    const base = visible(posts).filter(p => feedMode === 'foryou' || p.handle === ME || following.includes(p.handle));
    return pinned ? base : base; // pinned posts are shown on the profile, like X
  }, [posts, hidden, muted, words, feedMode, following, pinned]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sections ---------- */
  const composerBox = <div className="composer"><div className="composer-top"><img className="avatar" src={profile.avatar || avatars.you} alt="Your avatar" /><button className="composer-input" onClick={() => setComposer({ kind: 'post' })}>{t("What's on your mind?")}</button></div>
    <div className="composer-bottom"><button onClick={() => setComposer({ kind: 'post' })}><ImageIcon /> {t("Photo")}</button><button onClick={() => toast(t("Video upload needs server storage — coming soon"))}><Video /> {t("Video")}</button><button onClick={() => setComposer({ kind: 'post' })}><BarChart3 /> {t("Poll")}</button><button onClick={() => setComposer({ kind: 'intention' })}><Target /> {t("Intention")}</button><button onClick={() => { go('Market'); setListingOpen(true); }}><ShoppingBag /> {t("List item")}</button><button className="post-submit" onClick={() => setComposer({ kind: 'post' })}>{t("Post")}</button></div></div>;
  const switcher = <div className="switcher"><button className={tab === 'Feeds' ? 'active' : ''} onClick={() => setTab('Feeds')}><List size={18} /> {t("Feeds")}</button><button className={tab === 'Intentions' ? 'active' : ''} onClick={() => setTab('Intentions')}><Target size={18} /> {t("Intentions")}</button></div>;
  const feedTabs = <div className="feed-tabs"><button className={feedMode === 'foryou' ? 'on' : ''} onClick={() => setFeedMode('foryou')}>{t("For you")}</button><button className={feedMode === 'following' ? 'on' : ''} onClick={() => setFeedMode('following')}>{t("Following")}</button></div>;
  const home = <><Stories mine={myStories} setMine={setMyStories} seen={seenStories} setSeen={setSeenStories} toast={toast} onReply={(h, msg) => { const s = people.find(x => x[1] === h); openChatWith(h, s?.[0] || h, s?.[2] || avatars.you, msg); }} />
    {composerBox}{switcher}{tab === 'Feeds' && feedTabs}
    <div className="feed">{tab === 'Feeds' ? (feedPosts.length ? feedPosts.map(card) : <div className="empty">{t(feedMode === 'following' ? 'Follow people to see their posts here.' : 'No posts yet.')}</div>) : visible(intentions).map(card)}</div></>;

  const intentionsPage = <><div className="page-heading"><div><h1>{t("Intentions")}</h1><p>{t("Opportunities, people and ideas worth connecting over.")}</p></div><button className="primary" onClick={() => setComposer({ kind: 'intention' })}><Plus size={18} /> {t("Post intention")}</button></div>
    <div className="feed">{visible(intentions).map(card)}</div></>;

  const listings = [...myListings, ...products];
  const fx: Record<string, number> = { EUR: .23, USD: .27, HUF: 90 };
  const market = <><div className="page-heading"><div><h1>{t("Market")}</h1><p>{t("Discover great things from your community.")}</p></div><button className="primary" onClick={() => setListingOpen(true)}><Plus size={18} /> {t("List item")}</button></div>
    <div className="chips">{['All', 'Mine'].map(s => <button key={s} className={marketCategory === s ? 'selected' : ''} onClick={() => setMarketCategory(s)}>{t(s)}</button>)}</div>
    <div className="market-controls"><span><MapPin size={17} /> {t("Warsaw, Poland")}</span><select aria-label={t("Display currency")} value={currency} onChange={e => setCurrency(e.target.value)}><option>PLN</option><option>EUR</option><option>USD</option><option>HUF</option></select></div>
    <div className="product-grid">{listings.filter(p => marketCategory === 'All' || myListings.some(x => x.id === p.id)).map(p => <div className="product" key={p.id}><img src={p.image} alt={p.name} /><strong>{p.name}</strong><b>{currency === 'PLN' ? `${p.price.toLocaleString()} zł` : '≈ ' + (p.price * (fx[currency] || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + currency}</b><small>{p.city}</small>
      <div className="product-actions"><button className="pill-btn light" onClick={() => { openChatWith('seller-' + p.id, 'Seller · ' + p.name, avatars.daniel, `Hi! Is “${p.name}” still available?`); go('Messages'); }}>{t("Message seller")}</button>{myListings.some(x => x.id === p.id) && <button className="pill-btn ghost" aria-label="Delete listing" onClick={() => setMyListings(myListings.filter(x => x.id !== p.id))}><Trash2 size={15} /></button>}</div></div>)}</div>
    <p className="disclaimer">{t("Demo listings and illustrative exchange rates. No purchases or payments are enabled.")}</p></>;

  const modeSwitch = <div className="message-mode-switch"><button className={messageMode === 'direct' ? 'active' : ''} onClick={() => setMessageMode('direct')}>{t("Chats")}</button><button className={messageMode === 'groups' ? 'active' : ''} onClick={() => setMessageMode('groups')}>{t("Group chats")}</button></div>;
  const messages = messageMode === 'direct'
    ? <Messenger chats={chats} setChats={setChats} active={activeChat} setActive={setActiveChat} toast={toast} modeSwitch={modeSwitch} people={people}
        onViewProfile={h => { setQuery('@' + h); go('Explore'); }} onShareIntention={() => setComposer({ kind: 'intention' })} onCommunities={() => go('Communities')} />
    : <><div className="page-heading"><div><h1>{t("Messages")}</h1></div>{modeSwitch}</div><GroupMessages /></>;

  const explorePosts = visible(posts).filter(p => p.images.length);
  const explore = <>{!query && explorePosts.length > 0 && <div className="ig-grid">{explorePosts.flatMap(p => p.images.map((im, i) => ({ p, im, i }))).slice(0, 12).map(({ p, im, i }, k) => <button key={p.id + '-' + i} className={'ig-cell ' + (k % 5 === 0 ? 'tall' : '')} onClick={() => setLightbox({ images: p.images, i })}><img src={im} alt="" loading="lazy" /><span className="ig-ov"><Heart size={18} fill="white" /> {p.likes}</span></button>)}</div>}
    <SearchHub query={query} onQuery={setQuery} people={people.filter(([,handle])=>!muted.includes(handle))} posts={visible(posts)} intentions={visible(intentions)} onFollow={toggleFollow} following={following} onPost={p => { go(p.kind === 'intention' ? 'Intentions' : 'Home'); setTab(p.kind === 'intention' ? 'Intentions' : 'Feeds'); }} onMessage={name => { const x = people.find(y => y[0] === name); if (x) openChatWith(x[1], x[0], x[2]); go('Messages'); }} /></>;

  const nIcon = { like: <Heart size={16} />, comment: <MessageCircle size={16} />, follow: <UserPlus size={16} />, mention: <AtSign size={16} />, invite: <Users size={16} />, system: <Bell size={16} /> };
  const shownNotifs = notifs.filter(n => notifFilter === 'all' || (notifFilter === 'mentions' ? n.kind === 'mention' || n.kind === 'comment' : n.kind === 'follow'));
  const notifications = <><div className="page-heading"><div><h1>{t("Notifications")}</h1><p>{t("Stay updated with what’s happening on intent.")}</p></div><button className="outline" onClick={() => setNotifs(notifs.map(n => ({ ...n, read: true })))}><CheckCheck size={16} /> {t("Mark all as read")}</button></div>
    <div className="chips">{([['all', 'All'], ['mentions', 'Mentions'], ['follows', 'Follows']] as const).map(([k, l]) => <button key={k} className={notifFilter === k ? 'selected' : ''} onClick={() => setNotifFilter(k)}>{t(l)}</button>)}</div>
    {shownNotifs.map(n => <div className={'notification ' + (n.read ? '' : 'unread')} key={n.id} onClick={() => setNotifs(notifs.map(x => x.id === n.id ? { ...x, read: true } : x))}><span className="n-av"><img src={n.avatar} alt="" /><i className={'n-ic ' + n.kind}>{nIcon[n.kind]}</i></span><div><strong>{n.who}</strong> {t(n.text)}<small>{new Date(n.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
      {n.kind === 'follow' && <button className="pill-btn light" onClick={e => { e.stopPropagation(); toggleFollow(n.who.toLowerCase()); }}>{t(following.includes(n.who.toLowerCase()) ? 'Following|button' : 'Follow back')}</button>}
      <button className="icon-button" aria-label="Delete notification" onClick={e => { e.stopPropagation(); setNotifs(notifs.filter(x => x.id !== n.id)); }}><X size={16} /></button></div>)}
    {!shownNotifs.length && <div className="empty">{t("You’re all caught up.")}</div>}
    <p className="disclaimer">{t("Example notifications. Live events will be available after backend integration.")}</p></>;

  const settingsProps = { section: settingsSection, onSection: setSettingsSection, profile, onSaveProfile: saveProfile, right, onRight: setRight, currency, onCurrency: setCurrency, privacy, onPrivacy: setPrivacy, allowMessages, onAllowMessages: setAllowMessages, allowMentions, onAllowMentions: setAllowMentions, emailAlerts, onEmailAlerts: setEmailAlerts, language, onLanguage: setLanguage, onAds: () => go('Instant ADS'), muted, onUnmute: (h: string) => setMuted(muted.filter(x => x !== h)), hiddenCount: hidden.length, onClearHidden: () => setHidden([]), words, onWords: setWords, toast };
  const profilePage = <ProfileStudio profile={profile} onSave={saveProfile} posts={posts} intentions={intentions} followingCount={following.length} pinnedId={pinned} renderPost={card} onPost={p => { go(p.kind === 'intention' ? 'Intentions' : 'Home'); setTab(p.kind === 'intention' ? 'Intentions' : 'Feeds'); }} onCompose={() => setComposer({ kind: 'post' })} onEdit={() => { setSettingsSection('profile'); go('Settings'); }} />;

  const instantAds = <><div className="page-heading"><div><h1>{t("Instant ADS")}</h1><p>{t("Promote what matters. Prototype campaign workspace.")}</p></div><Megaphone size={30} /></div>
    <div className="activity-cards"><div><b>{ads.length}</b><span>{t("Draft campaigns")}</span></div><div><b>0</b><span>{t("Impressions")}</span></div><div><b>0</b><span>{t("Clicks")}</span></div><div><b>0</b><span>{t("Actual spend")}</span></div></div>
    <div className="ads-workspace"><h2>{t("Create a campaign draft")}</h2><label>{t("Campaign name")}<input value={adName} onChange={e => setAdName(e.target.value)} placeholder="e.g. Promote my project" /></label><label>{t("Objective")}<select value={adObjective} onChange={e => setAdObjective(e.target.value)}><option value="Profile visits">{t("Profile visits")}</option><option value="Post engagement">{t("Post engagement")}</option><option value="Market listing views">{t("Market listing views")}</option><option value="Intention responses">{t("Intention responses")}</option><option value="Community discovery">{t("Community discovery")}</option></select></label><label>{t("Daily budget (PLN)")}<input type="number" min="1" value={adBudget} onChange={e => setAdBudget(e.target.value)} /></label>
      <button className="primary" disabled={!adName.trim() || Number(adBudget) <= 0} onClick={() => { setAds([{ id: Date.now(), name: adName.trim(), budget: Number(adBudget), objective: adObjective, status: 'Draft' }, ...ads]); setAdName(''); toast(t("Campaign draft saved locally")); }}><Plus size={18} /> {t("Save campaign draft")}</button></div>
    <h2>{t("Campaigns")}</h2>{ads.length ? ads.map(a => <div className="campaign" key={a.id}><div><strong>{a.name}</strong><small>{a.objective} · {a.budget} PLN/day · Draft</small></div><button className="outline" onClick={() => setAds(ads.filter(x => x.id !== a.id))}>{t("Delete")}</button></div>) : <div className="empty">{t("No campaigns yet. Create your first draft above.")}</div>}
    <p className="disclaimer">{t("Advertising is NOT active: no audience targeting, ad delivery, payment collection or analytics is connected. Budget amounts are drafts only.")}</p></>;

  const myCount = all.filter(p => p.handle === ME).length; const myComments = Object.values(comments).reduce((a, b) => a + b.filter(c => c.handle === ME).length, 0);
  const content = section === 'Home' ? home : section === 'Intentions' ? intentionsPage : section === 'Market' ? market : section === 'Communities' ? <Communities /> : section === 'Messages' ? messages : section === 'Profile' ? profilePage : section === 'Explore' ? explore : section === 'Notifications' ? notifications
    : section === 'Settings' || section === 'Advanced Settings' ? <SettingsStudio {...settingsProps} /> : section === 'Instant ADS' ? instantAds
    : section === 'Saved' ? <><div className="page-heading"><div><h1>{t("Saved")}</h1><p>{t("Only you can see what you’ve saved.")}</p></div></div><div className="feed">{all.filter(p => saved.includes(p.id)).map(card)}{!saved.length && <div className="empty">{t("Tap the bookmark on any post to save it here.")}</div>}</div></>
    : <><div className="page-heading"><div><h1>{t("Your activity")}</h1><p>{t("Activity on this device.")}</p></div></div><div className="activity-cards"><div><b>{myCount}</b><span>{t("Publications")}</span></div><div><b>{myComments}</b><span>{t("Comments")}</span></div><div><b>{Object.keys(reactions).length}</b><span>{t("Reactions")}</span></div><div><b>{saved.length}</b><span>{t("Saved")}</span></div><div><b>{reposted.length}</b><span>{t("Reposts")}</span></div></div>
      {(hidden.length > 0 || muted.length > 0) && <div className="settings-group"><h2>{t("Hidden & muted")}</h2>{muted.map(h => <div className="setting-row" key={h}><div><strong>@{h}</strong><small>{t("Muted account")}</small></div><button className="outline" onClick={() => setMuted(muted.filter(x => x !== h))}>{t("Unmute")}</button></div>)}{hidden.length > 0 && <div className="setting-row"><div><strong>{t('{n} hidden posts', { n: hidden.length })}</strong><small>{t("Posts you marked “Not interested”")}</small></div><button className="outline" onClick={() => setHidden([])}>{t("Show again")}</button></div>}</div>}</>;

  const showRight = right && section !== 'Settings' && section !== 'Messages' && section !== 'Advanced Settings';
  const unreadChats = chats.reduce((a, c) => a + (c.unread || 0), 0); const unreadNotifs = notifs.filter(n => !n.read).length;
  const topActions = <div className="top-actions">
    <button className="icon-button badge-btn" onClick={() => go('Messages')} aria-label={t("Messages")}><MessageCircle />{unreadChats > 0 && <i>{unreadChats}</i>}</button>
    <button className="icon-button badge-btn" onClick={() => go('Notifications')} aria-label={t("Notifications")}><Bell />{unreadNotifs > 0 && <i>{unreadNotifs}</i>}</button>
    <AuthStatus avatar={profile.avatar || avatars.you} name={profile.name} onProfile={() => go('Profile')} onSettings={() => { setSettingsSection('profile'); go('Settings'); }} /></div>;
  const sidebar = <aside className="rightbar">{topActions}<div className="widget"><div className="widget-heading"><strong>{t("Recommended for you")}</strong><button onClick={() => go('Explore')}>{t("See all")}</button></div>{people.map(([name, handle, img]) => <div className="person" key={handle}><img className="avatar" src={img} alt="" /><div><strong>{name} ✓</strong><small>@{handle}</small></div><button className={'follow ' + (following.includes(handle) ? 'on' : '')} onClick={() => toggleFollow(handle)}>{t(following.includes(handle) ? 'Following|button' : 'Follow')}</button></div>)}</div>
    <div className="widget"><div className="widget-heading"><strong>{t("Trending now")}</strong><button onClick={() => go('Explore')}>{t("See all")}</button></div>{['#Warsaw', '#Technology', '#Art', '#Startups', '#Music'].map((tag, i) => <button className="trend" key={tag} onClick={() => tagSearch(tag)}><span>#{i + 1}</span><div><strong>{tag.slice(1)}</strong><small>{t("Trending topic")}</small></div><ArrowRight size={16} /></button>)}</div>
    <div className="widget promo"><strong>{t("Find your people.")}<br />{t("Build what matters.")}</strong><button onClick={() => go('Intentions')} aria-label="Open intentions"><ArrowRight /></button></div></aside>;

  return <FeedPanels enabled={showRight}>
    {storageError && <div className="storage-warning" role="alert">{t('Changes could not be saved on this device. Free up browser storage before reloading.')} <button onClick={() => setStorageError(false)}>{t('Dismiss')}</button></div>}
    <aside className="leftbar"><button className="logo" onClick={() => go('Home')}>intent<span>.</span></button>
      <nav>{nav.map(({ name, Icon }) => <button key={name} className={section === name ? 'active' : ''} onClick={() => go(name)}><Icon size={24} />{t(name)}{name === 'Messages' && unreadChats > 0 && <em>{unreadChats}</em>}{name === 'Notifications' && unreadNotifs > 0 && <em>{unreadNotifs}</em>}</button>)}
        <div className="nav-divider" />{extras.map(({ name, Icon }) => <button key={name} className={section === name ? 'active' : ''} onClick={() => go(name)}><Icon size={23} />{t(name)}</button>)}</nav>
      <button className="create-button" onClick={() => setComposer({ kind: 'post' })}><Plus /> {t("Create")}</button></aside>
    <main className={'main ' + (!showRight ? 'expanded' : 'with-right') + (section === 'Messages' && messageMode === 'direct' ? ' is-messages' : '')}>
      <div className="topbar"><div className="global-search"><Search size={22} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onFocus={() => go('Explore')} placeholder={t("Search people, posts, intentions, communities...")} aria-label={t("Search")} /></div>
        {topActions}</div>
      <div className="content">{content}</div></main>
    {showRight && (section === 'Home' ? <WidgetRail header={topActions} /> : sidebar)}
    <nav className="mobile-nav">{[nav[0], nav[1], nav[2], nav[3], nav[4]].map(({ name, Icon }) => <button className={section === name ? 'active' : ''} key={name} onClick={() => go(name)}><Icon size={24} /><small>{t(name)}</small></button>)}<button className="mobile-create" onClick={() => setComposer({ kind: 'post' })} aria-label={t("Create")}><Plus /></button></nav>

    {composer && <Composer initialKind={composer.kind} quote={composer.quote} onClose={() => setComposer(null)} onPublish={publish} />}
    {confirmDelete && <div className="modal-backdrop" onClick={() => setConfirmDelete(null)}><div className="modal intent-dialog" role="dialog" aria-modal="true" aria-label="Delete post" onClick={e => e.stopPropagation()}><h2>{t("Delete this post?")}</h2><p>{t("This removes your post and its comments from this device. It cannot be undone.")}</p><div className="dialog-actions"><button className="outline" onClick={() => setConfirmDelete(null)}>{t("Cancel")}</button><button className="primary danger-button" onClick={() => deletePost(confirmDelete)}>{t("Delete")}</button></div></div></div>}
    {editPost && <div className="modal-backdrop" onClick={() => setEditPost(null)}><div className="modal intent-dialog" role="dialog" aria-modal="true" aria-label={t("Edit post")} onClick={e => e.stopPropagation()}><h2>{t("Edit post")}</h2><textarea rows={6} maxLength={500} value={editPost.text} onChange={e => setEditPost({ ...editPost, text: e.target.value })} /><div className="dialog-actions"><button className="outline" onClick={() => setEditPost(null)}>{t("Cancel")}</button><button className="primary" disabled={!editPost.text.trim()} onClick={updatePost}>{t("Save changes")}</button></div></div></div>}
    {shareDM && <div className="modal-backdrop" onClick={() => setShareDM(null)}><div className="modal intent-dialog" role="dialog" aria-modal="true" aria-label={t("Send in a message")} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>{t("Send to…")}</h2><button className="icon-button" onClick={() => setShareDM(null)} aria-label={t("Close")}><X /></button></div>
      <div className="tg-fwd-list">{chats.map(c => <button key={c.id} onClick={() => { setChats(chats.map(x => x.id === c.id ? { ...x, messages: [...x.messages, { id: uid(), from: 'me', text: `Shared a post by @${shareDM.handle}: “${shareDM.text.slice(0, 140)}”`, image: shareDM.images[0], at: Date.now() }] } : x)); toast(t('Sent to {name}', { name: c.name })); setShareDM(null); }}><img src={c.avatar} alt="" /><b>{c.name}</b></button>)}</div></div></div>}
    {listingOpen && <div className="modal-backdrop" onClick={() => setListingOpen(false)}><div className="modal intent-dialog" role="dialog" aria-modal="true" aria-label={t("List an item")} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>{t("List an item")}</h2><button className="icon-button" onClick={() => setListingOpen(false)} aria-label={t("Close")}><X /></button></div>
      <ImagePicker label={t("Item photo")} hint={t("A clear photo on a plain background sells faster.")} value={listingImage} onChange={setListingImage} />
      <div className="ads-workspace"><label>{t("Item name")}<input value={listingName} onChange={e => setListingName(e.target.value)} placeholder={t("Item title")} maxLength={80} /></label><label>{t("Price (PLN)")}<input type="number" min="1" value={listingPrice} onChange={e => setListingPrice(e.target.value)} /></label>
        <button className="primary" disabled={!listingName.trim() || Number(listingPrice) <= 0} onClick={() => { setMyListings([{ id: Date.now(), name: listingName.trim(), price: Number(listingPrice), city: profile.location || 'Your location', image: listingImage || products[1].image }, ...myListings]); setListingName(''); setListingPrice(''); setListingImage(''); setListingOpen(false); setMarketCategory('Mine'); toast(t("Listing created")); }}>{t("Create listing")}</button></div>
      <p className="disclaimer">{t("Local listing only. Shipping and checkout are not connected.")}</p></div></div>}
    {lightbox && <Lightbox images={lightbox.images} start={lightbox.i} onClose={() => setLightbox(null)} />}
    {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
  </FeedPanels>;
}
