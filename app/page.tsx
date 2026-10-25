'use client';
import { useI18n } from '../components/I18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Search, Target, Users, ShoppingBag, MessageCircle, Bell, UserCircle, Bookmark, Clock3, Settings, Plus, Image as ImageIcon, Video, List, BarChart3, X, ArrowRight, MapPin, Megaphone, Trash2, Heart, UserPlus, AtSign, CheckCheck , Repeat2 } from 'lucide-react';
import GroupMessages from '../components/GroupMessages';
import AuthStatus from '../components/AuthStatus';
import WidgetRail from '../components/WidgetRail';
import ResizeHandle from '../components/ResizeHandle';
import { checkOffer, minOffer } from '../lib/offers';
import Communities from '../components/Communities';
import PostCard, { type Comment, Lightbox } from '../components/PostCard';
import Composer, { type Draft } from '../components/Composer';
import Stories, { type MyStory } from '../components/Stories';
import Messenger from '../components/Messenger';
import ImagePicker from '../components/ImagePicker';
import { Button, Modal, Field, inputClass } from '../components/ui';
import ExplorePage from '../components/explore/ExplorePage';
import ExploreRail from '../components/explore/ExploreRail';
import { useExploreState } from '../components/explore/shared';
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
  const [myListings, setMyListings] = useStored<{ id: number; name: string; price: number; city: string; image: string; desc?: string }[]>('intent-listings', []);
  const [offers, setOffers] = useStored<Record<string, number>>('intent-offers', {});
  const [offerFor, setOfferFor] = useState<{ id: number; name: string; price: number } | null>(null); const [offerInput, setOfferInput] = useState('');
  const [ads, setAds] = useStored<{ id: number; name: string; budget: number; days?: number; objective: string; status: string }[]>('intent-ads', []);
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
  const [listingName, setListingName] = useState(''); const [listingPrice, setListingPrice] = useState(''); const [listingImage, setListingImage] = useState(''); const [listingDesc, setListingDesc] = useState('');
  const [marketCategory, setMarketCategory] = useState('All');
  const [adName, setAdName] = useState(''); const [adBudget, setAdBudget] = useState('10'); const [adObjective, setAdObjective] = useState('Profile visits'); const [adDays, setAdDays] = useState('7');
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
    const p: Post = { id: uid(), author: profile.name || 'You', handle: ME, avatar: profile.avatar || avatars.you, time: 'now', createdAt: Date.now(), text: d.text, images: d.images, likes: 0, comments: 0, reposts: 0, kind: d.kind, category: d.category, poll: d.poll, audience: d.audience, quoteOf: d.quoteOf, gif: d.gif, views: 0 };
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
    // My reposts appear at the top of my feed, newest repost first (only posts that still exist and aren't hidden).
    const all = visible(posts); const rp = [...reposted].reverse().map(id => all.find(p => p.id === id)).filter((p): p is Post => !!p);
    return [...rp, ...base.filter(p => !reposted.includes(p.id))];
  }, [posts, hidden, muted, words, feedMode, following, pinned, reposted]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sections ---------- */
  const composerBox = <div className="composer"><div className="composer-top"><img className="avatar" src={profile.avatar || avatars.you} alt="Your avatar" /><button className="composer-input" onClick={() => setComposer({ kind: 'post' })}>{t("What's on your mind?")}</button></div>
    <div className="composer-bottom"><button onClick={() => setComposer({ kind: 'post' })}><ImageIcon /> {t("Photo")}</button><button onClick={() => toast(t("Video upload needs server storage — coming soon"))}><Video /> {t("Video")}</button><button onClick={() => setComposer({ kind: 'post' })}><BarChart3 /> {t("Poll")}</button><button onClick={() => setComposer({ kind: 'intention' })}><Target /> {t("Intention")}</button><button onClick={() => { go('Market'); setListingOpen(true); }}><ShoppingBag /> {t("List item")}</button><button className="post-submit" onClick={() => setComposer({ kind: 'post' })}>{t("Post")}</button></div></div>;
  const switcher = <div className="switcher"><button className={tab === 'Feeds' ? 'active' : ''} onClick={() => setTab('Feeds')}><List size={18} /> {t("Feeds")}</button><button className={tab === 'Intentions' ? 'active' : ''} onClick={() => setTab('Intentions')}><Target size={18} /> {t("Intentions")}</button></div>;
  const feedTabs = <div className="feed-tabs"><button className={feedMode === 'foryou' ? 'on' : ''} onClick={() => setFeedMode('foryou')}>{t("For you")}</button><button className={feedMode === 'following' ? 'on' : ''} onClick={() => setFeedMode('following')}>{t("Following")}</button></div>;
  const home = <><Stories mine={myStories} setMine={setMyStories} seen={seenStories} setSeen={setSeenStories} toast={toast} onReply={(h, msg) => { const s = people.find(x => x[1] === h); openChatWith(h, s?.[0] || h, s?.[2] || avatars.you, msg); }} />
    {composerBox}{switcher}{tab === 'Feeds' && feedTabs}
    <div className="feed">{tab === 'Feeds' ? (feedPosts.length ? feedPosts.map(p => reposted.includes(p.id) ? <div className="repost-wrap" key={'rp-' + p.id}><div className="repost-label"><Repeat2 size={15} /> {t('You reposted')}</div>{card(p)}</div> : card(p)) : <div className="empty">{t(feedMode === 'following' ? 'Follow people to see their posts here.' : 'No posts yet.')}</div>) : visible(intentions).map(card)}</div></>;

  const intentionsPage = <><div className="page-heading"><div><h1>{t("Intentions")}</h1><p>{t("Opportunities, people and ideas worth connecting over.")}</p></div><button className="primary" onClick={() => setComposer({ kind: 'intention' })}><Plus size={18} /> {t("Post intention")}</button></div>
    <div className="feed">{visible(intentions).map(card)}</div></>;

  const listings = [...myListings, ...products];
  const fx: Record<string, number> = { EUR: .23, USD: .27, HUF: 90 };
  const market = <><div className="page-heading"><div><h1>{t("Market")}</h1><p>{t("Discover great things from your community.")}</p></div><button className="primary" onClick={() => setListingOpen(true)}><Plus size={18} /> {t("List item")}</button></div>
    <div className="chips">{['All', 'Mine'].map(s => <button key={s} className={marketCategory === s ? 'selected' : ''} onClick={() => setMarketCategory(s)}>{t(s)}</button>)}</div>
    <div className="market-controls"><span><MapPin size={17} /> {t("Warsaw, Poland")}</span><select aria-label={t("Display currency")} value={currency} onChange={e => setCurrency(e.target.value)}><option>PLN</option><option>EUR</option><option>USD</option><option>HUF</option></select></div>
    <div className="product-grid">{listings.filter(p => marketCategory === 'All' || myListings.some(x => x.id === p.id)).map(p => <div className="product" key={p.id}><img src={p.image} alt={p.name} /><strong>{p.name}</strong><b>{currency === 'PLN' ? `${p.price.toLocaleString()} zł` : '≈ ' + (p.price * (fx[currency] || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' ' + currency}</b><small>{p.city}</small>{'desc' in p && typeof p.desc === 'string' && p.desc ? <p className="mk-desc">{p.desc}</p> : null}{offers[String(p.id)] != null && <small className="mk-my-offer">{t('Your offer: {amount} zł', { amount: offers[String(p.id)] })}</small>}
      <div className="product-actions">{!myListings.some(x => x.id === p.id) && <button className="pill-btn" onClick={() => { setOfferFor({ id: p.id, name: p.name, price: p.price }); setOfferInput(''); }}>{t("Make an offer")}</button>}<button className="pill-btn light" onClick={() => { openChatWith('seller-' + p.id, 'Seller · ' + p.name, avatars.daniel, `Hi! Is “${p.name}” still available?`); go('Messages'); }}>{t("Message seller")}</button>{myListings.some(x => x.id === p.id) && <button className="pill-btn ghost" aria-label="Delete listing" onClick={() => setMyListings(myListings.filter(x => x.id !== p.id))}><Trash2 size={15} /></button>}</div></div>)}</div>
    <p className="disclaimer">{t("Demo listings and illustrative exchange rates. No purchases or payments are enabled.")}</p></>;

  const modeSwitch = <div className="message-mode-switch"><button className={messageMode === 'direct' ? 'active' : ''} onClick={() => setMessageMode('direct')}>{t("Chats")}</button><button className={messageMode === 'groups' ? 'active' : ''} onClick={() => setMessageMode('groups')}>{t("Group chats")}</button></div>;
  const messages = messageMode === 'direct'
    ? <Messenger chats={chats} setChats={setChats} active={activeChat} setActive={setActiveChat} toast={toast} modeSwitch={modeSwitch} people={people}
        onViewProfile={h => { setQuery('@' + h); go('Explore'); }} onShareIntention={() => setComposer({ kind: 'intention' })} onCommunities={() => go('Communities')} />
    : <><div className="page-heading"><div><h1>{t("Messages")}</h1></div>{modeSwitch}</div><GroupMessages /></>;

  const exploreState = useExploreState();
  const exploreMessage = (h: string, name: string, avatar: string) => { openChatWith(h, name, avatar); go('Messages'); };
  const explore = query.trim()
    ? <SearchHub query={query} onQuery={setQuery} people={people.filter(([,handle])=>!muted.includes(handle))} posts={visible(posts)} intentions={visible(intentions)} onFollow={toggleFollow} following={following} onPost={p => { go(p.kind === 'intention' ? 'Intentions' : 'Home'); setTab(p.kind === 'intention' ? 'Intentions' : 'Feeds'); }} onMessage={name => { const x = people.find(y => y[0] === name); if (x) openChatWith(x[1], x[0], x[2]); go('Messages'); }} />
    : <ExplorePage me={ME} posts={visible(posts)} intentions={visible(intentions)} people={people} following={following} onFollow={toggleFollow}
        saved={saved} onToggleSave={id => { const on = saved.includes(id); setSaved(on ? saved.filter(x => x !== id) : [...saved, id]); toast(t(on ? 'Removed from saved' : 'Saved!')); }}
        reactions={reactions} onReact={(id, r) => { const n = { ...reactions }; if (r) n[id] = r; else delete n[id]; setReactions(n); }} comments={comments}
        hidden={hidden} onHidePost={id => setHidden([...hidden, id])} muted={muted} hiddenWords={words} interests={profile.interests} state={exploreState}
        toast={toast} openLightbox={(images, i) => setLightbox({ images, i })} renderPost={card} onSearch={setQuery} onOpenCommunities={() => go('Communities')} onMessage={exploreMessage} />;

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

  const AD_OBJ = [{ id: 'Profile visits', Icon: UserCircle }, { id: 'Post engagement', Icon: Heart }, { id: 'Market listing views', Icon: ShoppingBag }, { id: 'Intention responses', Icon: Target }, { id: 'Community discovery', Icon: Users }] as const;
  const adBudgetN = /^\d{1,6}$/.test(adBudget) ? Number(adBudget) : 0; const adDaysN = /^\d{1,2}$/.test(adDays) ? Number(adDays) : 0;
  const adValid = !!adName.trim() && adBudgetN >= 1 && adDaysN >= 1 && adDaysN <= 30;
  const ObjIcon = (id: string) => { const o = AD_OBJ.find(x => x.id === id); return o ? <o.Icon size={18} /> : <Megaphone size={18} />; };
  const instantAds = <div className="ad-page"><div className="page-heading"><div><h1>{t("Instant ADS")}</h1><p>{t("Promote what matters. Prototype campaign workspace.")}</p></div></div>
    <div className="ad-stats"><div><b>{ads.length}</b><span>{t("Draft campaigns")}</span></div><div><b>0</b><span>{t("Impressions")}</span></div><div><b>0</b><span>{t("Clicks")}</span></div><div><b>0 zł</b><span>{t("Actual spend")}</span></div></div>
    <div className="ad-grid">
      <section className="ad-card"><h2>{t("Create a campaign draft")}</h2>
        <Field label={t("Campaign name")}><input className={inputClass} value={adName} maxLength={60} onChange={e => setAdName(e.target.value)} placeholder={t("e.g. Promote my project")} /></Field>
        <div className="ad-label">{t("Objective")}</div>
        <div className="ad-objs">{AD_OBJ.map(o => <button type="button" key={o.id} className={'ad-obj' + (adObjective === o.id ? ' on' : '')} aria-pressed={adObjective === o.id} onClick={() => setAdObjective(o.id)}><o.Icon size={20} /><span>{t(o.id)}</span></button>)}</div>
        <div className="ad-row">
          <Field label={t("Daily budget (PLN)")}><input className={inputClass} inputMode="numeric" value={adBudget} onChange={e => setAdBudget(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
          <Field label={t("Duration (days)")}><input className={inputClass} inputMode="numeric" value={adDays} onChange={e => setAdDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} /></Field>
        </div>
        <div className="ad-chips">{[10, 25, 50, 100].map(v => <button type="button" key={v} className={adBudgetN === v ? 'on' : ''} onClick={() => setAdBudget(String(v))}>{v} zł</button>)}</div>
        <div className="ad-total"><span>{t("Planned total (draft)")}</span><b>{adValid ? (adBudgetN * adDaysN).toLocaleString() : '—'} zł</b></div>
        <Button variant="primary" block disabled={!adValid} onClick={() => { setAds([{ id: Date.now(), name: adName.trim(), budget: adBudgetN, days: adDaysN, objective: adObjective, status: 'Draft' }, ...ads]); setAdName(''); toast(t("Campaign draft saved locally")); }}><Plus size={18} /> {t("Save campaign draft")}</Button>
      </section>
      <section className="ad-card ad-preview"><div className="ad-label">{t("Preview")}</div>
        <div className="ad-mock"><div className="ad-mock-head"><img src={profile.avatar || avatars.you} alt="" /><div><b>{profile.name || t('You')}</b><small>{t("Sponsored")}</small></div></div>
          <p>{adName.trim() || t("Your campaign name appears here")}</p>
          <div className="ad-mock-cta">{ObjIcon(adObjective)}<span>{t(adObjective)}</span></div></div>
        <ul className="ad-notes"><li>{t("Ads are never shown inside private chats.")}</li><li>{t("Private messages, sensitive data and exact location are never used for targeting.")}</li></ul>
      </section>
    </div>
    <h2 className="ad-h2">{t("Campaigns")}</h2>
    {ads.length ? <div className="ad-list">{ads.map(a => <div className="ad-item" key={a.id}><span className="ad-item-ic">{ObjIcon(a.objective)}</span><div><strong>{a.name}</strong><small>{t(a.objective)} · {a.budget} zł / {t("day")}{a.days ? ' · ' + a.days + ' ' + t("days") : ''}</small></div><span className="ad-badge">{t("Draft")}</span><button className="icon-button" aria-label={t("Delete")} title={t("Delete")} onClick={() => setAds(ads.filter(x => x.id !== a.id))}><Trash2 size={18} /></button></div>)}</div> : <div className="empty">{t("No campaigns yet. Create your first draft above.")}</div>}
    <p className="disclaimer">{t("Advertising is NOT active: no audience targeting, ad delivery, payment collection or analytics is connected. Budget amounts are drafts only.")}</p></div>;

  const myCount = all.filter(p => p.handle === ME).length; const myComments = Object.values(comments).reduce((a, b) => a + b.filter(c => c.handle === ME).length, 0);
  const content = section === 'Home' ? home : section === 'Intentions' ? intentionsPage : section === 'Market' ? market : section === 'Communities' ? <Communities /> : section === 'Messages' ? messages : section === 'Profile' ? profilePage : section === 'Explore' ? explore : section === 'Notifications' ? notifications
    : section === 'Settings' || section === 'Advanced Settings' ? <SettingsStudio {...settingsProps} /> : section === 'Instant ADS' ? instantAds
    : section === 'Saved' ? <><div className="page-heading"><div><h1>{t("Saved")}</h1><p>{t("Only you can see what you’ve saved.")}</p></div></div><div className="feed">{all.filter(p => saved.includes(p.id)).map(card)}{!saved.length && <div className="empty">{t("Tap the bookmark on any post to save it here.")}</div>}</div></>
    : <><div className="page-heading"><div><h1>{t("Your activity")}</h1><p>{t("Activity on this device.")}</p></div></div><div className="activity-cards"><div><b>{myCount}</b><span>{t("Publications")}</span></div><div><b>{myComments}</b><span>{t("Comments")}</span></div><div><b>{Object.keys(reactions).length}</b><span>{t("Reactions")}</span></div><div><b>{saved.length}</b><span>{t("Saved")}</span></div><div><b>{reposted.length}</b><span>{t("Reposts")}</span></div></div>
      {(hidden.length > 0 || muted.length > 0) && <div className="settings-group"><h2>{t("Hidden & muted")}</h2>{muted.map(h => <div className="setting-row" key={h}><div><strong>@{h}</strong><small>{t("Muted account")}</small></div><button className="outline" onClick={() => setMuted(muted.filter(x => x !== h))}>{t("Unmute")}</button></div>)}{hidden.length > 0 && <div className="setting-row"><div><strong>{t('{n} hidden posts', { n: hidden.length })}</strong><small>{t("Posts you marked “Not interested”")}</small></div><button className="outline" onClick={() => setHidden([])}>{t("Show again")}</button></div>}</div>}</>;

  const showRight = right && section !== 'Settings' && section !== 'Messages' && section !== 'Advanced Settings' && section !== 'Communities';
  const unreadChats = chats.reduce((a, c) => a + (c.unread || 0), 0); const unreadNotifs = notifs.filter(n => !n.read).length;
  const topActions = <div className="top-actions">
    <button className="icon-button badge-btn" onClick={() => go('Messages')} aria-label={t("Messages")}><MessageCircle />{unreadChats > 0 && <i>{unreadChats}</i>}</button>
    <button className="icon-button badge-btn" onClick={() => go('Notifications')} aria-label={t("Notifications")}><Bell />{unreadNotifs > 0 && <i>{unreadNotifs}</i>}</button>
    <AuthStatus avatar={profile.avatar || avatars.you} name={profile.name} onProfile={() => go('Profile')} onSettings={() => { setSettingsSection('profile'); go('Settings'); }} /></div>;
  const sidebar = <aside className="rightbar"><ResizeHandle pane="widgetRail" edge="start" container=".app" label="Resize widget panel" />{topActions}<div className="widget"><div className="widget-heading"><strong>{t("Recommended for you")}</strong><button onClick={() => go('Explore')}>{t("See all")}</button></div>{people.map(([name, handle, img]) => <div className="person" key={handle}><img className="avatar" src={img} alt="" /><div><strong>{name} ✓</strong><small>@{handle}</small></div><button className={'follow ' + (following.includes(handle) ? 'on' : '')} onClick={() => toggleFollow(handle)}>{t(following.includes(handle) ? 'Following|button' : 'Follow')}</button></div>)}</div>
    <div className="widget"><div className="widget-heading"><strong>{t("Trending now")}</strong><button onClick={() => go('Explore')}>{t("See all")}</button></div>{['#Warsaw', '#Technology', '#Art', '#Startups', '#Music'].map((tag, i) => <button className="trend" key={tag} onClick={() => tagSearch(tag)}><span>#{i + 1}</span><div><strong>{tag.slice(1)}</strong><small>{t("Trending topic")}</small></div><ArrowRight size={16} /></button>)}</div>
    <div className="widget promo"><strong>{t("Find your people.")}<br />{t("Build what matters.")}</strong><button onClick={() => go('Intentions')} aria-label="Open intentions"><ArrowRight /></button></div></aside>;

  return <div className="app">
    {storageError && <div className="storage-warning" role="alert">{t('Changes could not be saved on this device. Free up browser storage before reloading.')} <button onClick={() => setStorageError(false)}>{t('Dismiss')}</button></div>}
    <aside className="leftbar"><button className="logo" onClick={() => go('Home')}>intent<span>.</span></button>
      <nav>{nav.map(({ name, Icon }) => <button key={name} className={section === name ? 'active' : ''} onClick={() => go(name)}><Icon size={24} />{t(name)}{name === 'Messages' && unreadChats > 0 && <em>{unreadChats}</em>}{name === 'Notifications' && unreadNotifs > 0 && <em>{unreadNotifs}</em>}</button>)}
        <div className="nav-divider" />{extras.map(({ name, Icon }) => <button key={name} className={section === name ? 'active' : ''} onClick={() => go(name)}><Icon size={23} />{t(name)}</button>)}</nav>
      <button className="create-button" onClick={() => setComposer({ kind: 'post' })}><Plus /> {t("Create")}</button></aside>
    <main className={'main ' + (!showRight ? 'expanded' : 'with-right') + (section === 'Messages' && messageMode === 'direct' ? ' is-messages' : '')}>
      <div className="topbar"><div className="global-search"><Search size={22} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onFocus={() => go('Explore')} placeholder={t("Search people, posts, intentions, communities...")} aria-label={t("Search")} /></div>
        {topActions}</div>
      <div className="content">{content}</div></main>
    {showRight && (section === 'Home' ? <WidgetRail header={topActions} /> : section === 'Explore' && !query.trim() ? <aside className="rightbar">{topActions}<ExploreRail people={people} following={following} onFollow={toggleFollow} muted={muted} state={exploreState} onSearch={setQuery} onMessage={exploreMessage} onDiscover={() => go('Intentions')} toast={toast} /></aside> : sidebar)}
    <nav className="mobile-nav">{[nav[0], nav[1], nav[2], nav[3], nav[4]].map(({ name, Icon }) => <button className={section === name ? 'active' : ''} key={name} onClick={() => go(name)}><Icon size={24} /><small>{t(name)}</small></button>)}<button className="mobile-create" onClick={() => setComposer({ kind: 'post' })} aria-label={t("Create")}><Plus /></button></nav>

    {composer && <Composer initialKind={composer.kind} quote={composer.quote} onClose={() => setComposer(null)} onPublish={publish} />}
    {confirmDelete && <Modal title={t("Delete this post?")} width={440} onClose={() => setConfirmDelete(null)} footer={<><Button onClick={() => setConfirmDelete(null)}>{t("Cancel")}</Button><Button variant="danger" onClick={() => deletePost(confirmDelete)}><Trash2 size={18} /> {t("Delete")}</Button></>}><p className="ds-muted">{t("This removes your post and its comments from this device. It cannot be undone.")}</p></Modal>}
    {editPost && <Modal title={t("Edit post")} width={560} onClose={() => setEditPost(null)} footer={<><Button onClick={() => setEditPost(null)}>{t("Cancel")}</Button><Button variant="primary" disabled={!editPost.text.trim()} onClick={updatePost}>{t("Save changes")}</Button></>}><textarea className={inputClass} rows={6} maxLength={500} aria-label={t("Edit post")} value={editPost.text} onChange={e => setEditPost({ ...editPost, text: e.target.value })} /></Modal>}
    {shareDM && <Modal title={t("Send to…")} width={440} onClose={() => setShareDM(null)}>
      <div className="tg-fwd-list">{chats.map(c => <button key={c.id} onClick={() => { setChats(chats.map(x => x.id === c.id ? { ...x, messages: [...x.messages, { id: uid(), from: 'me', text: `Shared a post by @${shareDM.handle}: “${shareDM.text.slice(0, 140)}”`, image: shareDM.images[0], at: Date.now() }] } : x)); toast(t('Sent to {name}', { name: c.name })); setShareDM(null); }}><img src={c.avatar} alt="" /><b>{c.name}</b></button>)}</div></Modal>}
    {listingOpen && <Modal title={t("List an item")} subtitle={t("Local listing only. Shipping and checkout are not connected.")} onClose={() => setListingOpen(false)} footer={<><Button onClick={() => setListingOpen(false)}>{t("Cancel")}</Button><Button variant="primary" disabled={!listingName.trim() || Number(listingPrice) <= 0} onClick={() => { setMyListings([{ id: Date.now(), name: listingName.trim(), price: Number(listingPrice), city: profile.location || 'Your location', image: listingImage || products[1].image, desc: listingDesc.trim() || undefined }, ...myListings]); setListingName(''); setListingDesc(''); setListingPrice(''); setListingImage(''); setListingOpen(false); setMarketCategory('Mine'); toast(t("Listing created")); }}>{t("Create listing")}</Button></>}>
      <ImagePicker label={t("Item photo")} hint={t("A clear photo on a plain background sells faster.")} value={listingImage} onChange={setListingImage} />
      <Field label={t("Item name")}><input className={inputClass} value={listingName} onChange={e => setListingName(e.target.value)} placeholder={t("Item title")} maxLength={80} /></Field>
      <Field label={t("Price (PLN)")}><input className={inputClass} type="number" min="1" inputMode="numeric" value={listingPrice} onChange={e => setListingPrice(e.target.value)} /></Field>
      <Field label={t("Description")}><textarea className={inputClass} rows={4} maxLength={1000} value={listingDesc} onChange={e => setListingDesc(e.target.value)} placeholder={t("Condition, size, what is included, how to pick up...")} /></Field></Modal>}
    {offerFor && (() => { const min = minOffer(offerFor.price); const chk = checkOffer(offerInput, offerFor.price); const err = !offerInput.trim() ? '' : chk.ok ? '' : chk.reason === 'too-low' ? t('The offer cannot be lower than {min} zł.', { min }) : chk.reason === 'not-lower' ? t('The offer must be lower than the asking price.') : t('Enter a whole number.');
      return <Modal title={t("Make an offer")} subtitle={offerFor.name + ' · ' + t('Asking price: {price} zł', { price: offerFor.price.toLocaleString() })} onClose={() => setOfferFor(null)} footer={<><Button onClick={() => setOfferFor(null)}>{t("Cancel")}</Button><Button variant="primary" disabled={!chk.ok} onClick={() => { if (!chk.ok) return; const p = offerFor; setOffers({ ...offers, [String(p.id)]: chk.amount }); openChatWith('seller-' + p.id, 'Seller · ' + p.name, avatars.daniel, t('Hi! I would like to offer {amount} zł for “{name}” (asking {price} zł).', { amount: chk.amount, name: p.name, price: p.price })); setOfferFor(null); toast(t('Offer sent')); go('Messages'); }}>{t("Send offer")}</Button></>}>
        <Field label={t("Your offer (PLN)")}><input className={inputClass} autoFocus type="text" inputMode="numeric" value={offerInput} onChange={e => setOfferInput(e.target.value.replace(/[^0-9]/g, ''))} placeholder={String(min)} /></Field>
        <input type="range" className="mk-offer-range" min={min} max={Math.max(min, offerFor.price - 1)} step={1} value={chk.ok ? chk.amount : min} onChange={e => setOfferInput(e.target.value)} aria-label={t("Your offer (PLN)")} />
        <p className={err ? 'mk-offer-err' : 'muted'} role={err ? 'alert' : undefined}>{err || t('Minimum offer: {min} zł (50% of the price).', { min })}</p>
        <p className="muted">{t('The offer is sent to the seller as a chat message. No payment is made.')}</p></Modal>; })()}
    {lightbox && <Lightbox images={lightbox.images} start={lightbox.i} onClose={() => setLightbox(null)} />}
    {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
  </div>;
}
