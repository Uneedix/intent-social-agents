'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Heart, MessageCircle, Bookmark, Play, EyeOff, Link2, Flag, Users, Hash, ArrowRight, UserPlus, Info } from 'lucide-react';
import { useT } from '../I18n';
import type { Post } from '../../lib/data';
import type { Comment } from '../PostCard';
import { buildSignals, inferTopics, masonry, postTime, rankForYou, rankTrending, type RecItem, type Ranked } from '../../lib/explore-recs';
import { demoTiles, demoPeople, demoCommunities, allTopics, exploreTrends, verifiedHandles, peopleTopics, topicVocabulary } from '../../lib/explore-demo';
import { ExMenu, Verified, agoLabel, compactNum, type ExploreState } from './shared';
import s from './explore.module.css';

export const EXPLORE_TABS = ['For you', 'Trending', 'People', 'Communities', 'Posts', 'Intentions', 'Topics'] as const;
export type ExploreTab = typeof EXPLORE_TABS[number];

export interface ExplorePageProps {
  /** Handle of the current user (own posts are not recommended back to them). */
  me: string;
  /** Posts/intentions already filtered by the shell's hidden/muted/hidden-words rules. */
  posts: Post[];
  intentions: Post[];
  people: [name: string, handle: string, avatar: string][];
  following: string[];
  onFollow: (handle: string) => void;
  saved: number[];
  onToggleSave: (postId: number) => void;
  reactions: Record<number, string>;
  onReact: (postId: number, reaction: string) => void;
  comments: Record<number, Comment[]>;
  hidden: number[];
  onHidePost: (postId: number) => void;
  muted: string[];
  hiddenWords: string[];
  /** Comma-separated profile interests. */
  interests: string;
  state: ExploreState;
  toast: (msg: string) => void;
  openLightbox: (images: string[], index: number) => void;
  renderPost: (p: Post) => ReactNode;
  onSearch: (q: string) => void;
  onOpenCommunities: () => void;
  onMessage: (handle: string, name: string, avatar: string) => void;
}

type Tile = RecItem & { handle: string; avatar: string; caption: string; images: string[]; ratio: number; video?: boolean; verified: boolean };

const PHONE_MQ = '(max-width: 690px)';
/** 3 columns on desktop, 2 on phones (matches the shell's phone breakpoint). */
function useCols() {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const f = () => setCols(mq.matches ? 2 : 3); f();
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, []);
  return cols;
}

const RATIOS = [1.25, 1, 1.45];

export default function ExplorePage(props: ExplorePageProps) {
  const t = useT();
  const { state: st } = props;
  const [tab, setTab] = useState<ExploreTab>('For you');
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const cols = useCols();

  const realItems: Tile[] = useMemo(() => props.posts.map(p => ({
    key: 'p' + p.id, postId: p.id, author: p.handle, authorName: p.author, topics: inferTopics(p.text, topicVocabulary), text: p.text,
    createdAt: postTime(p.time, p.createdAt, now), likes: p.likes, comments: p.comments, reposts: p.reposts,
    handle: p.handle, avatar: p.avatar, caption: p.text, images: p.images, ratio: RATIOS[p.id % 3], verified: verifiedHandles.includes(p.handle),
  })), [props.posts, now]);
  const demoItems: Tile[] = useMemo(() => demoTiles.map(d => ({
    key: d.id, author: d.owner, authorName: d.name, topics: d.tags, text: d.caption + ' ' + d.tags.map(x => '#' + x).join(' '),
    createdAt: postTime(d.ago, undefined, now), likes: d.likes, comments: d.comments,
    handle: d.handle, avatar: d.avatar, caption: d.caption, images: [d.image], ratio: d.ratio, video: d.video, verified: verifiedHandles.includes(d.handle),
  })), [now]);

  const signals = useMemo(() => buildSignals({
    me: props.me, interests: props.interests, following: props.following, reactions: props.reactions, saved: props.saved,
    commentedPostIds: Object.entries(props.comments).filter(([, cs]) => cs.some(c => c.handle === props.me)).map(([id]) => Number(id)),
    posts: realItems, items: demoItems, engagedKeys: [...st.likedDemo, ...st.savedDemo], peopleTopics,
    notInterested: st.notInterested, hiddenPostIds: props.hidden, hiddenAuthors: st.hiddenPeople, hiddenTopics: st.hiddenTopics,
    muted: props.muted, hiddenWords: props.hiddenWords,
  }), [props.me, props.interests, props.following, props.reactions, props.saved, props.comments, props.hidden, props.muted, props.hiddenWords, realItems, demoItems, st.likedDemo, st.savedDemo, st.notInterested, st.hiddenPeople, st.hiddenTopics]);

  const gridItems = useMemo(() => [...demoItems, ...realItems.filter(x => x.images.length && x.author !== props.me)], [demoItems, realItems, props.me]);
  const forYou = useMemo(() => rankForYou(gridItems, signals, now), [gridItems, signals, now]);
  const trending = useMemo(() => rankTrending(gridItems, now, signals), [gridItems, now, signals]);

  const isSaved = (x: Tile) => x.postId != null ? props.saved.includes(x.postId) : st.savedDemo.includes(x.key);
  const isLiked = (x: Tile) => x.postId != null ? !!props.reactions[x.postId] : st.likedDemo.includes(x.key);
  const toggleSave = (x: Tile) => {
    if (x.postId != null) { props.onToggleSave(x.postId); return; }
    const on = st.savedDemo.includes(x.key);
    st.setSavedDemo(on ? st.savedDemo.filter(k => k !== x.key) : [...st.savedDemo, x.key]);
    props.toast(t(on ? 'Removed from saved' : 'Saved on this device'));
  };
  const toggleLike = (x: Tile) => {
    if (x.postId != null) { props.onReact(x.postId, props.reactions[x.postId] ? '' : '❤️'); return; }
    const on = st.likedDemo.includes(x.key);
    st.setLikedDemo(on ? st.likedDemo.filter(k => k !== x.key) : [...st.likedDemo, x.key]);
  };
  const notInterested = (x: Tile) => {
    if (x.postId != null) props.onHidePost(x.postId); else st.setNotInterested([...st.notInterested, x.key]);
    props.toast(t('Got it. You’ll see fewer posts like this.'));
  };
  const copyLink = (x: Tile) => {
    const url = location.origin + '/' + (x.postId != null ? `?post=${x.postId}` : '');
    const done = () => props.toast(t('Link copied')); const fail = () => props.toast(t('Could not copy'));
    try { if (navigator.clipboard) void navigator.clipboard.writeText(url).then(done, fail); else fail(); } catch { fail(); }
  };
  const openTile = (x: Tile) => {
    if (!x.images.length) return;
    props.openLightbox(x.images, 0);
    if (x.video) props.toast(t('Video playback is not available yet — showing the cover'));
  };
  const reasonText = (r: Ranked) => t(r.reason.key, r.reason.vars);

  const tile = (r: Ranked, phone: boolean) => {
    const x = r.item as Tile; const liked = isLiked(x); const saved = isSaved(x);
    const likes = x.likes + (liked ? 1 : 0); // real posts: real count + your own reaction
    const ratio = phone && x.ratio < 0.95 ? 0.95 : x.ratio;
    return <article key={x.key} className={s.tile} style={{ aspectRatio: `1 / ${ratio}` }} data-key={x.key}>
      <button type="button" className={s.media} onClick={() => openTile(x)} aria-label={t('Open post by @{h}', { h: x.handle })}>
        <img src={x.images[0]} alt={x.caption.slice(0, 80)} loading="lazy" />
      </button>
      {x.video && <span className={s.play} title={t('Video')}><Play size={13} fill="#fff" aria-hidden /><span className={s.sr}>{t('Video')}</span></span>}
      <ExMenu className={s.tileMenu} label={t('More options')} items={[
        { label: t('Not interested'), icon: <EyeOff size={16} />, onClick: () => notInterested(x) },
        { label: t('Copy link'), icon: <Link2 size={16} />, onClick: () => copyLink(x) },
        { label: t('Report'), icon: <Flag size={16} />, danger: true, onClick: () => props.toast(t('Thanks. Reporting will reach moderators once moderation is connected.')) },
      ]} />
      <div className={s.foot}>
        <div className={s.who}><img src={x.avatar} alt="" /><span><b><span>{x.handle}</span>{x.verified && <Verified size={13} />}</b><small>{agoLabel(t, x.createdAt, now)}</small></span></div>
        <p className={s.cap}>{x.caption}</p>
        <p className={s.why} title={t('Why am I seeing this?')}><Info size={11} aria-hidden /><span>{reasonText(r)}</span></p>
        <div className={s.acts}>
          <button type="button" className={liked ? s.on : ''} onClick={() => toggleLike(x)} aria-label={t(liked ? 'Remove reaction' : 'Like')} aria-pressed={liked}>
            <Heart size={17} fill={liked ? '#ff3040' : 'none'} color={liked ? '#ff3040' : 'currentColor'} /><span>{compactNum(likes)}</span></button>
          <span className={s.stat} aria-label={t('{n} comments', { n: x.comments })}><MessageCircle size={17} aria-hidden /><span>{compactNum(x.comments)}</span></span>
          <button type="button" className={s.save} onClick={() => toggleSave(x)} aria-label={t(saved ? 'Remove from saved' : 'Save post')} aria-pressed={saved}><Bookmark size={17} fill={saved ? '#fff' : 'none'} /></button>
        </div>
      </div>
    </article>;
  };

  const grid = (list: Ranked[]) => {
    if (!now) return <div className={s.masonry} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-busy="true">{Array.from({ length: cols }, (_, i) => <div className={s.col} key={i}><div className={s.skel} /></div>)}</div>;
    if (!list.length) return <div className={s.empty}>{t('Nothing here yet.')}</div>;
    const phone = cols === 2;
    const sized = list.map(r => ({ r, ratio: phone && (r.item as Tile).ratio < 0.95 ? 0.95 : (r.item as Tile).ratio }));
    return <div className={s.masonry} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {masonry(sized, cols).map((c, i) => <div className={s.col} key={i}>{c.map(x => tile(x.r, phone))}</div>)}
    </div>;
  };

  let body: ReactNode;
  if (tab === 'For you') body = grid(forYou);
  else if (tab === 'Trending') body = grid(trending);
  else if (tab === 'People') {
    const ppl = demoPeople.filter(p => p.handle !== props.me && !props.muted.includes(p.handle) && !st.hiddenPeople.includes(p.handle));
    body = ppl.length ? <div className={s.cards3}>{ppl.map(p => { const on = props.following.includes(p.handle); return <div className={s.card + ' ' + s.pcard} key={p.handle}>
      <img src={p.avatar} alt="" /><b><span>{p.name}</span>{verifiedHandles.includes(p.handle) && <Verified />}</b><small>@{p.handle}</small><p>{t(p.title)}</p>
      <div className={s.pcardBtns}>
        <button type="button" className={s.follow + (on ? ' ' + s.outline : '')} aria-pressed={on} onClick={() => props.onFollow(p.handle)}>{on ? t('Following|button') : <><UserPlus size={15} aria-hidden />{t('Follow')}</>}</button>
        <button type="button" className={s.follow + ' ' + s.outline} onClick={() => props.onMessage(p.handle, p.name, p.avatar)}><MessageCircle size={15} aria-hidden />{t('Message')}</button>
      </div></div>; })}</div> : <div className={s.empty}>{t('No more suggestions right now.')}</div>;
  } else if (tab === 'Communities') body = <>
    <div className={s.cards3}>{demoCommunities.map(c => <button type="button" className={s.card + ' ' + s.ccard} key={c.name} onClick={props.onOpenCommunities}>
      <img src={c.image} alt="" loading="lazy" /><span className={s.ccardBody}><b>{c.name}</b><small><Users size={14} aria-hidden />{t('{n} members', { n: compactNum(c.members) })} · {t(c.topic)}</small></span>
    </button>)}</div>
    <p className={s.note}>{t('Sample communities for illustration.')} <button type="button" className={s.link} onClick={props.onOpenCommunities}>{t('Open Communities')} <ArrowRight size={14} aria-hidden /></button></p>
  </>;
  else if (tab === 'Posts') body = props.posts.length ? <div className={s.feed}>{props.posts.map(p => <div key={p.id}>{props.renderPost(p)}</div>)}</div> : <div className={s.empty}>{t('No posts yet.')}</div>;
  else if (tab === 'Intentions') body = props.intentions.length ? <div className={s.feed}>{props.intentions.map(p => <div key={p.id}>{props.renderPost(p)}</div>)}</div> : <div className={s.empty}>{t('No intentions yet.')}</div>;
  else body = <div className={s.topics}>{allTopics.filter(x => !st.hiddenTopics.includes(x.tag.toLowerCase())).map(x => <button type="button" key={x.tag} className={s.card + ' ' + s.topic} onClick={() => props.onSearch('#' + x.tag)}>
    <img src={x.image} alt="" loading="lazy" /><span><b><Hash size={15} aria-hidden />{x.tag}</b><small>{t('{n} posts', { n: compactNum(x.posts) })}</small></span>
  </button>)}</div>;

  const isGrid = tab === 'For you' || tab === 'Trending';
  return <div className={s.explore}>
    <h1 className={s.h1}>{t('Explore')}</h1>
    <div className={s.tabs} role="tablist" aria-label={t('Explore')}>{EXPLORE_TABS.map(x => <button key={x} type="button" role="tab" aria-selected={tab === x} className={s.chip + (tab === x ? ' ' + s.chipOn : '')} onClick={() => setTab(x)}>{t(x)}</button>)}</div>
    <div className={s.phoneTrends} aria-label={t('Trending now')}>{exploreTrends.filter(x => !st.hiddenTopics.includes(x.tag.toLowerCase())).map(x => <button type="button" key={x.tag} className={s.chip} onClick={() => props.onSearch('#' + x.tag)}>#{x.tag}</button>)}</div>
    <div role="tabpanel" aria-label={t(tab)}>{body}</div>
    {isGrid && <p className={s.footnote}><Info size={13} aria-hidden />{t('Recommendations are based on your activity on this device.')} {t('Sample posts and their counts are illustrative.')}</p>}
  </div>;
}
