'use client';
import { GifView } from './GifView';
import { PostMediaView } from './PostMedia';
import { useT } from './I18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Heart, MessageCircle, Repeat2, Bookmark, MoreHorizontal, CheckCircle2, Target, ArrowRight, Trash2, Flag, Pencil, Pin, PinOff, Link2, Send, EyeOff, BarChart3, Quote, X, ChevronLeft, ChevronRight, CornerDownRight, VolumeX } from 'lucide-react';
import type { Post } from '../lib/data';
import { avatars } from '../lib/data';
import { segments, compact, timeAgo, uid } from '../lib/social';

export type Comment = { id: number; text: string; author: string; handle: string; avatar: string; at: number; replyTo?: number; likes: number; liked?: boolean };
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

export function RichText({ text, onTag }: { text: string; onTag: (q: string) => void }) {
  return <>{segments(text).map((s, i) => s.t === 'text' ? <span key={i}>{s.v}</span>
    : s.t === 'link' ? <a key={i} href={s.v} target="_blank" rel="noopener noreferrer nofollow" className="rt-link">{s.v.replace(/^https:\/\//, '').slice(0, 40)}</a>
    : <button key={i} type="button" className="rt-tag" onClick={e => { e.stopPropagation(); onTag(s.v); }}>{s.v}</button>)}</>;
}

export function Lightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const t = useT();
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(v => Math.min(images.length - 1, v + 1)); if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [images.length, onClose]);
  return <div className="lightbox" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={onClose}
    onTouchStart={e => { touch.current = e.touches[0].clientX; }} onTouchEnd={e => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) setI(v => Math.max(0, Math.min(images.length - 1, v + (dx < 0 ? 1 : -1)))); touch.current = null; }}>
    <button className="lb-close" aria-label={t("Close")} onClick={onClose}><X /></button>
    {i > 0 && <button className="lb-nav l" aria-label="Previous" onClick={e => { e.stopPropagation(); setI(i - 1); }}><ChevronLeft /></button>}
    <img src={images[i]} alt={`Image ${i + 1} of ${images.length}`} onClick={e => e.stopPropagation()} />
    {i < images.length - 1 && <button className="lb-nav r" aria-label="Next" onClick={e => { e.stopPropagation(); setI(i + 1); }}><ChevronRight /></button>}
    {images.length > 1 && <div className="lb-dots">{images.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>}
  </div>;
}

function PollView({ post, onVote }: { post: Post; onVote: (i: number) => void }) {
  const t = useT();
  const poll = post.poll!; const total = poll.options.reduce((a, o) => a + o.votes, 0) + (poll.myVote != null ? 1 : 0);
  const ended = Date.now() > poll.endsAt; const voted = poll.myVote != null || ended;
  const left = Math.max(0, poll.endsAt - Date.now()); const h = Math.round(left / 3600000);
  return <div className="poll">
    {poll.options.map((o, i) => { const v = o.votes + (poll.myVote === i ? 1 : 0); const pct = total ? Math.round(v / total * 100) : 0;
      return voted ? <div key={i} className={'poll-res ' + (poll.myVote === i ? 'mine' : '')}><i style={{ width: pct + '%' }} /><span>{o.text}{poll.myVote === i && <CheckCircle2 size={14} />}</span><b>{pct}%</b></div>
        : <button key={i} className="poll-opt" onClick={() => onVote(i)}>{o.text}</button>; })}
    <small>{t('{n} votes', { n: compact(total) })} · {ended ? t('Final results') : h >= 24 ? t('{n} days left', { n: Math.round(h / 24) }) : t('{n} hours left', { n: Math.max(1, h) })}</small>
  </div>;
}

type Props = {
  p: Post; me: string; quoted?: Post | null;
  reaction?: string; saved: boolean; reposted: boolean; pinned: boolean;
  comments: Comment[];
  onReact: (r: string) => void; onSave: () => void; onRepost: () => void; onQuote: () => void;
  onComments: (c: Comment[]) => void; onVote: (i: number) => void;
  onEdit: () => void; onDelete: () => void; onPin: () => void; onHide: () => void; onMute: () => void;
  onRespond: () => void; onShareDM: () => void; onTag: (q: string) => void; toast: (m: string) => void;
  extra?: ReactNode;
};

export default function PostCard(props: Props) {
  const t = useT();
  const { p, me, quoted, reaction, saved, reposted, pinned, comments } = props;
  const mine = p.handle === me;
  const [menu, setMenu] = useState(false);
  const [repostMenu, setRepostMenu] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [lb, setLb] = useState<number | null>(null);
  const [burst, setBurst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTap = useRef(0);
  const long = p.text.length > 280 && !expanded;

  const like = () => { if (!reaction) props.onReact('❤️'); setBurst(true); setTimeout(() => setBurst(false), 700); };
  const tapMedia = (i: number) => { const t = Date.now(); if (t - lastTap.current < 300) { like(); lastTap.current = 0; return; } lastTap.current = t; setTimeout(() => { if (lastTap.current === t) setLb(i); }, 310); };
  const addComment = () => {
    const text = draft.trim(); if (!text) return;
    props.onComments([...comments, { id: uid(), text, author: 'You', handle: me, avatar: avatars.you, at: Date.now(), replyTo: replyTo?.id, likes: 0 }]);
    setDraft(''); setReplyTo(null);
  };
  const top = comments.filter(c => !c.replyTo);
  const replies = (id: number) => comments.filter(c => c.replyTo === id);
  const commentRow = (c: Comment, nested = false) => <div className={'cmt ' + (nested ? 'nested' : '')} key={c.id}>
    <img src={c.avatar} alt="" className="cmt-av" />
    <div className="cmt-body"><div className="cmt-bubble"><b>{c.author}</b> <RichText text={c.text} onTag={props.onTag} /></div>
      <div className="cmt-meta"><span>{timeAgo(c.at)}</span>
        <button onClick={() => props.onComments(comments.map(x => x.id === c.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x))} className={c.liked ? 'on' : ''}>{t(c.liked ? 'Liked' : 'Like')}{c.likes > 0 && ` · ${c.likes}`}</button>
        {!nested && <button onClick={() => { setReplyTo(c); setDraft(`@${c.handle} `); }}>{t("Reply")}</button>}
        {c.handle === me && <button onClick={() => props.onComments(comments.filter(x => x.id !== c.id && x.replyTo !== c.id))}>{t("Delete")}</button>}
      </div>
      {!nested && replies(c.id).map(r => commentRow(r, true))}
    </div></div>;

  const totalReact = p.likes + (reaction ? 1 : 0);
  return <article className={'post ' + (pinned ? 'is-pinned' : '')}>
    {pinned && <div className="post-pin"><Pin size={13} /> {t("Pinned")}</div>}
    <div className="post-header"><img className="avatar" src={p.avatar} alt="" />
      <div className="author"><strong>{p.author} <CheckCircle2 size={14} fill="white" color="#0c0c0c" /></strong><span>@{p.handle} · {p.createdAt ? timeAgo(p.createdAt) : p.time}{p.edited && ` · ${t('edited')}`}{p.audience === 'followers' && ` · ${t('Followers')}`}</span></div>
      <div className="pop-wrap"><button className="icon-button" onClick={() => setMenu(!menu)} aria-label="More options" aria-expanded={menu}><MoreHorizontal /></button>
        {menu && <div className="pop" onMouseLeave={() => setMenu(false)}>
          {mine ? <>
            <button onClick={() => { props.onPin(); setMenu(false); }}>{pinned ? <><PinOff size={16} /> {t("Unpin from profile")}</> : <><Pin size={16} /> {t("Pin to profile")}</>}</button>
            <button onClick={() => { props.onEdit(); setMenu(false); }}><Pencil size={16} /> {t("Edit")}</button>
            <button className="danger" onClick={() => { props.onDelete(); setMenu(false); }}><Trash2 size={16} /> {t("Delete")}</button>
          </> : <>
            <button onClick={() => { props.onHide(); setMenu(false); }}><EyeOff size={16} /> {t("Not interested")}</button>
            <button onClick={() => { props.onMute(); setMenu(false); }}><VolumeX size={16} /> {t('Mute @{h}', { h: p.handle })}</button>
            <button onClick={() => { setMenu(false); props.toast(t("Thanks. Reporting will reach moderators once moderation is connected.")); }}><Flag size={16} /> {t("Report")}</button>
          </>}
          <button onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/?post=${p.id}`).then(() => props.toast(t("Link copied")), () => props.toast(t("Could not copy"))); setMenu(false); }}><Link2 size={16} /> {t("Copy link")}</button>
        </div>}
      </div>
    </div>
    <div className="post-body">
      {p.kind === 'intention' && <span className="type-label"><Target size={13} />{p.category ? t(p.category) : t('Intention')}</span>}
      <p className="post-text"><RichText text={long ? p.text.slice(0, 280) + '…' : p.text} onTag={props.onTag} />{long && <button className="rt-more" onClick={() => setExpanded(true)}>{t("Show more")}</button>}</p>
      {p.media && <PostMediaView media={p.media} />}
      {p.gif && <div className="post-gif"><GifView gif={p.gif} maxWidth={520} maxHeight={420} /></div>}
      {p.images.length > 0 && <div className={'photo-grid n' + Math.min(p.images.length, 4)}>
        {p.images.slice(0, 4).map((im, i) => <button key={i} className={'pg-cell image-' + i} onClick={() => tapMedia(i)} aria-label={`Open image ${i + 1}`}><img src={im} alt="Post media" loading="lazy" />{i === 3 && p.images.length > 4 && <span className="pg-more">+{p.images.length - 4}</span>}</button>)}
        {burst && <span className="heart-burst"><Heart size={90} fill="white" /></span>}
      </div>}
      {p.poll && <PollView post={p} onVote={props.onVote} />}
      {quoted && <div className="quote-card"><div className="quote-h"><img src={quoted.avatar} alt="" /><b>{quoted.author}</b><span>@{quoted.handle}</span></div><p>{quoted.text.slice(0, 220)}{quoted.text.length > 220 && '…'}</p>{quoted.images[0] && <img className="quote-img" src={quoted.images[0]} alt="" />}</div>}
      {p.quoteOf && !quoted && <div className="quote-card muted">{t("This post is unavailable.")}</div>}
      {p.kind === 'intention' && !mine && <button className="outline small" onClick={props.onRespond}>{t("Respond")} <ArrowRight size={15} /></button>}
      {props.extra}
    </div>
    <div className="actions">
      <div className="actions-left">
        <div className="reaction-wrapper"><button className={'action ' + (reaction ? 'on' : '')} onClick={() => props.onReact(reaction ? '' : '❤️')} aria-label={t(reaction ? 'Remove reaction' : 'Like')}><span>{reaction ? <span className="rx-emoji">{reaction}</span> : <Heart size={21} />}</span><span>{compact(totalReact)}</span></button>
          <div className="reaction-picker">{REACTIONS.map(r => <button key={r} onClick={() => props.onReact(r)} aria-label={`React ${r}`}>{r}</button>)}</div></div>
        <button className="action" onClick={() => setOpen(!open)} aria-expanded={open}><MessageCircle size={20} />{compact(p.comments + comments.length)}</button>
        <div className="pop-wrap"><button className={'action ' + (reposted ? 'green' : '')} onClick={() => setRepostMenu(!repostMenu)} aria-expanded={repostMenu}><Repeat2 size={20} />{compact(p.reposts + (reposted ? 1 : 0))}</button>
          {repostMenu && <div className="pop up" onMouseLeave={() => setRepostMenu(false)}>
            <button onClick={() => { props.onRepost(); setRepostMenu(false); }}><Repeat2 size={16} /> {t(reposted ? 'Undo repost' : 'Repost')}</button>
            <button onClick={() => { props.onQuote(); setRepostMenu(false); }}><Quote size={16} /> {t("Quote")}</button>
            <button onClick={() => { props.onShareDM(); setRepostMenu(false); }}><Send size={16} /> {t("Send in a message")}</button>
          </div>}</div>
        {p.views != null && <span className="action static"><BarChart3 size={19} />{compact(p.views)}</span>}
      </div>
      <button className={'action ' + (saved ? 'on' : '')} onClick={props.onSave} aria-label={t(saved ? 'Remove from saved' : 'Save post')}><Bookmark size={21} fill={saved ? 'white' : 'none'} /></button>
    </div>
    {open && <div className="comments-panel">
      {top.length === 0 && <p className="muted small-note">{p.comments > 0 ? t('{n} earlier comments are example data. New comments stay on this device.', { n: p.comments }) : t('Be the first to comment.')}</p>}
      {top.map(c => commentRow(c))}
      <form className="cmt-form" onSubmit={e => { e.preventDefault(); addComment(); }}>
        <img src={avatars.you} alt="" className="cmt-av" />
        <div className="cmt-input">{replyTo && <span className="cmt-replying"><CornerDownRight size={13} /> {t('Replying to {name}', { name: replyTo.author })}<button type="button" onClick={() => { setReplyTo(null); setDraft(''); }} aria-label="Cancel reply"><X size={13} /></button></span>}
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={t("Add a comment…")} maxLength={1000} aria-label="Comment" /></div>
        <button type="submit" disabled={!draft.trim()} aria-label="Post comment"><Send size={18} /></button>
      </form>
    </div>}
    {lb != null && <Lightbox images={p.images} start={lb} onClose={() => setLb(null)} />}
  </article>;
}
