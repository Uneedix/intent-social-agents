'use client';
import { useT } from './I18n';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Plus, X, Heart, Send, Trash2, Pause, Play, Type, Wand2, ImagePlus, ChevronRight, Star, MoreHorizontal, Download, Loader2 } from 'lucide-react';
import { avatars, sampleStories } from '../lib/data';
import { compressImage } from '../lib/social';

export type StoryText = { id: number; text: string; x: number; y: number; color: string; bg: boolean };
export type MyStory = { id: number; image: string; caption: string; createdAt: number; filter?: string; texts?: StoryText[]; audience?: 'all' | 'close' };
type Item = { image: string; caption: string; ago: string; id?: number; filter?: string; texts?: StoryText[]; audience?: 'all' | 'close' };
type Group = { handle: string; name: string; avatar: string; mine?: boolean; items: Item[] };
const DURATION = 5000;

const FILTERS: [string, string][] = [['Normal', 'none'], ['Clarendon', 'contrast(1.2) saturate(1.35)'], ['Juno', 'saturate(1.5) hue-rotate(-8deg) brightness(1.05)'], ['Lark', 'brightness(1.12) saturate(.9)'], ['Moon', 'grayscale(1) contrast(1.1) brightness(1.05)'], ['Gingham', 'sepia(.25) brightness(1.08) contrast(.9)'], ['Valencia', 'sepia(.35) saturate(1.3) contrast(1.05)'], ['Cool', 'hue-rotate(15deg) saturate(1.1) brightness(1.02)']];
const COLORS = ['#ffffff', '#000000', '#ff3040', '#ffd400', '#00d26a', '#3d8ef0', '#a855f7', '#ff7a00'];
const ink = (c: string) => (c === '#ffffff' || c === '#ffd400' ? '#000' : '#fff');
const css = (name?: string) => FILTERS.find(f => f[0] === name)?.[1] || 'none';

export default function Stories({ mine, setMine, seen, setSeen, onReply, toast }: {
  mine: MyStory[]; setMine: (s: MyStory[]) => void; seen: string[]; setSeen: (s: string[]) => void;
  onReply: (handle: string, text: string) => void; toast: (m: string) => void;
}) {
  const t = useT();
  const fresh = mine.filter(s => Date.now() - s.createdAt < 86400000);
  const groups: Group[] = [
    ...(fresh.length ? [{ handle: 'you', name: 'Your story', avatar: avatars.you, mine: true, items: fresh.map(s => ({ ...s, ago: ago(s.createdAt) })) }] : []),
    ...sampleStories
  ];
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<{ g: number; i: number } | null>(null);
  const open = (handle: string) => { const g = groups.findIndex(x => x.handle === handle); if (g >= 0) setView({ g, i: 0 }); };

  return <>
    <div className="stories" role="list">
      <div className="story" role="listitem">
        <button className={'story-ring ' + (fresh.length ? 'own' : 'seen')} onClick={() => fresh.length ? open('you') : setCreating(true)} aria-label={t(fresh.length ? 'View your story' : 'Create a story')}><img src={avatars.you} alt="" /></button>
        <button className="story-add" onClick={() => setCreating(true)} aria-label={t("Add to your story")}><Plus size={14} strokeWidth={3} /></button>
        <span>{t("Your story")}</span>
      </div>
      {sampleStories.map(s => <button key={s.handle} className="story" role="listitem" onClick={() => open(s.handle)}><div className={'story-ring ' + (seen.includes(s.handle) ? 'seen' : 'new')}><img src={s.avatar} alt="" /></div><span>{s.name}</span></button>)}
    </div>
    {creating && <StoryEditor onClose={() => setCreating(false)} onShare={s => { setMine([s, ...fresh]); setCreating(false); toast(t(s.audience === 'close' ? 'Shared with Close Friends on this device' : 'Story shared for 24 hours on this device')); }} />}
    {view && <Viewer groups={groups} start={view} onClose={() => setView(null)} onSeen={h => { if (!seen.includes(h)) setSeen([...seen, h]); }}
      onDelete={id => { setMine(mine.filter(s => s.id !== id)); setView(null); toast(t("Story deleted")); }} onAdd={() => { setView(null); setCreating(true); }} onReply={onReply} toast={toast} />}
  </>;
}

function ago(t: number) { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)}m` : `${Math.round(m / 60)}h`; }

/** Overlay texts positioned in % of the 9:16 frame. */
function Overlays({ texts }: { texts?: StoryText[] }) {
  return <>{texts?.map(t => <span key={t.id} className={'st-text ' + (t.bg ? 'bg' : '')} style={{ left: `${t.x}%`, top: `${t.y}%`, color: t.bg ? ink(t.color) : t.color, background: t.bg ? t.color : undefined }}>{t.text}</span>)}</>;
}

/* ---------------- Instagram-style story editor ---------------- */
function StoryEditor({ onClose, onShare }: { onClose: () => void; onShare: (s: MyStory) => void }) {
  const t = useT();
  const [img, setImg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('Normal');
  const [showFilters, setShowFilters] = useState(false);
  const [texts, setTexts] = useState<StoryText[]>([]);
  const [editing, setEditing] = useState<StoryText | null>(null);
  const [caption, setCaption] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editing) setEditing(null); else onClose(); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [editing, onClose]);
  const pick = async (f?: File) => { if (!f) return; setBusy(true); setErr(''); try { setImg(await compressImage(f, 1400)); } catch (e) { setErr(e instanceof Error ? e.message : t('Upload failed')); } finally { setBusy(false); if (file.current) file.current.value = ''; } };

  const commitText = () => { if (!editing) return; const t = editing.text.trim(); setTexts(list => { const rest = list.filter(x => x.id !== editing.id); return t ? [...rest, { ...editing, text: t.slice(0, 120) }] : rest; }); setEditing(null); };
  const down = (e: RPointerEvent, t: StoryText) => { e.stopPropagation(); const r = frame.current!.getBoundingClientRect(); drag.current = { id: t.id, dx: (e.clientX - r.left) / r.width * 100 - t.x, dy: (e.clientY - r.top) / r.height * 100 - t.y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: RPointerEvent) => { if (!drag.current || !frame.current) return; const r = frame.current.getBoundingClientRect(); const d = drag.current;
    const x = Math.max(5, Math.min(95, (e.clientX - r.left) / r.width * 100 - d.dx)); const y = Math.max(5, Math.min(92, (e.clientY - r.top) / r.height * 100 - d.dy)); setTexts(l => l.map(t => t.id === d.id ? { ...t, x, y } : t)); };
  const share = (audience: 'all' | 'close') => onShare({ id: Date.now(), image: img, caption: caption.slice(0, 180), createdAt: Date.now(), filter, texts, audience });

  return <div className="se-backdrop" role="dialog" aria-modal="true" aria-label="Create story">
    <div className="se">
      {!img ? <div className="se-pick" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
        <div className="se-top"><button className="se-round" onClick={onClose} aria-label={t("Close")}><X size={22} /></button><b>{t("Add to story")}</b><span /></div>
        <div className="se-pick-body">
          <button className="se-gallery" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Loader2 size={34} className="spin" /> : <ImagePlus size={34} />}<b>{t("Choose from gallery")}</b><small>{t("or drag a photo here · vertical photos look best")}</small></button>
          {err && <small className="img-picker-error" role="alert">{err}</small>}
        </div>
      </div> : <>
        <div className="se-frame" ref={frame} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
          <img src={img} alt="" style={{ filter: css(filter) }} draggable={false} />
          {texts.map(t => editing?.id === t.id ? null : <span key={t.id} className={'st-text drag ' + (t.bg ? 'bg' : '')} onPointerDown={e => down(e, t)} onDoubleClick={() => setEditing(t)}
            style={{ left: `${t.x}%`, top: `${t.y}%`, color: t.bg ? ink(t.color) : t.color, background: t.bg ? t.color : undefined }}>{t.text}</span>)}
          <div className="se-top"><button className="se-round" onClick={onClose} aria-label="Discard story"><X size={22} /></button><span />
            <div className="se-tools">
              <button className="se-round" onClick={() => setEditing({ id: Date.now(), text: '', x: 50, y: 40, color: '#ffffff', bg: false })} aria-label="Add text"><Type size={20} /><em>{t("Text")}</em></button>
              <button className={'se-round ' + (showFilters ? 'on' : '')} onClick={() => setShowFilters(!showFilters)} aria-label={t("Filters")}><Wand2 size={20} /><em>{t("Filters")}</em></button>
              <button className="se-round" onClick={() => file.current?.click()} aria-label="Change photo"><ImagePlus size={20} /><em>{t("Photo")}</em></button>
            </div></div>
          {showFilters && <div className="se-filters">{FILTERS.map(([n, f]) => <button key={n} className={filter === n ? 'on' : ''} onClick={() => setFilter(n)}><img src={img} alt="" style={{ filter: f }} /><span>{n}</span></button>)}</div>}
          {editing && <div className="se-textedit" onClick={commitText}>
            <div className="se-text-tools" onClick={e => e.stopPropagation()}>
              <button className={'se-aa ' + (editing.bg ? 'on' : '')} onClick={() => setEditing({ ...editing, bg: !editing.bg })} aria-label="Toggle text background">A</button>
              <button className="pill-btn light" onClick={commitText}>{t("Done")}</button></div>
            <input autoFocus value={editing.text} maxLength={120} placeholder={t("Type something…")} onClick={e => e.stopPropagation()} onChange={e => setEditing({ ...editing, text: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') commitText(); }}
              className={editing.bg ? 'bg' : ''} style={{ color: editing.bg ? ink(editing.color) : editing.color, background: editing.bg ? editing.color : 'transparent' }} aria-label="Story text" />
            <div className="se-colors" onClick={e => e.stopPropagation()}>{COLORS.map(c => <button key={c} style={{ background: c }} className={editing.color === c ? 'on' : ''} onClick={() => setEditing({ ...editing, color: c })} aria-label={`Color ${c}`} />)}</div>
          </div>}
        </div>
        <div className="se-foot">
          <input className="se-caption" value={caption} maxLength={180} onChange={e => setCaption(e.target.value)} placeholder={t("Add a caption…")} aria-label="Caption" />
          <div className="se-share">
            <button className="se-pill" onClick={() => share('all')}><img src={avatars.you} alt="" /> {t("Your story")}</button>
            <button className="se-pill close" onClick={() => share('close')}><span><Star size={13} fill="#fff" /></span> {t("Close Friends")}</button>
            <button className="se-send" onClick={() => share('all')} aria-label="Share to your story"><ChevronRight size={22} /></button>
          </div>
        </div>
      </>}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => void pick(e.target.files?.[0])} />
    </div>
  </div>;
}

/* ---------------- viewer ---------------- */
function Viewer({ groups, start, onClose, onSeen, onDelete, onAdd, onReply, toast }: { groups: Group[]; start: { g: number; i: number }; onClose: () => void; onSeen: (h: string) => void; onDelete: (id: number) => void; onAdd: () => void; onReply: (h: string, t: string) => void; toast: (m: string) => void }) {
  const t = useT();
  const [pos, setPos] = useState(start);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [liked, setLiked] = useState(false);
  const [menu, setMenu] = useState(false);
  const t0 = useRef(Date.now()); const acc = useRef(0);
  const g = groups[pos.g]; const item = g?.items[pos.i];
  const hold = paused || menu;

  const groupCount=groups.length;
  const itemCount=g?.items.length || 0;
  const next = useCallback(() => {
    setLiked(false);
    if(pos.i < itemCount - 1)setPos({g:pos.g,i:pos.i+1});
    else if(pos.g < groupCount - 1)setPos({g:pos.g+1,i:0});
    else onClose();
  },[pos.g,pos.i,itemCount,groupCount,onClose]);
  const prev = useCallback(() => {
    setLiked(false);
    if(pos.i>0)setPos({g:pos.g,i:pos.i-1});
    else if(pos.g>0)setPos({g:pos.g-1,i:0});
  },[pos.g,pos.i]);
  const handle=g?.handle;
  useEffect(()=>{if(handle)onSeen(handle);},[handle,onSeen]);
  useEffect(()=>{acc.current=0;setProgress(0);},[pos.g,pos.i]);
  useEffect(()=>{
    if(hold)return;
    t0.current=Date.now();
    const id=setInterval(()=>{
      const elapsed=acc.current+Date.now()-t0.current;
      const p=Math.min(1,elapsed/DURATION);
      setProgress(p);
      if(p>=1){clearInterval(id);next();}
    },50);
    return ()=>{clearInterval(id);acc.current+=Date.now()-t0.current;};
  },[hold,next]);
  useEffect(()=>{
    const k=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))return;
      if(e.key==='Escape')onClose();
      if(e.key==='ArrowRight'){e.preventDefault();next();}
      if(e.key==='ArrowLeft'){e.preventDefault();prev();}
      if(e.key===' '){e.preventDefault();setPaused(p=>!p);}
    };
    window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);
  },[next,prev,onClose]);
  if (!g || !item) return null;

  const download = () => { const a = document.createElement('a'); a.href = item.image; a.download = 'intent-story.jpg'; a.click(); setMenu(false); };
  return <div className="story-view-backdrop" role="dialog" aria-modal="true" aria-label={`${g.name} story`} onClick={onClose}>
    <div className="sv" onClick={e => e.stopPropagation()}>
      <div className="sv-bars">{g.items.map((_, k) => <span key={k}><i style={{ width: `${k < pos.i ? 100 : k === pos.i ? progress * 100 : 0}%` }} /></span>)}</div>
      <div className="sv-head"><img src={g.avatar} alt="" /><b>{g.mine ? t('Your story') : g.name}</b><small>{item.ago}</small>{item.audience === 'close' && <span className="sv-close-badge"><Star size={11} fill="#fff" /></span>}
        <button className="icon-button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={19} /> : <Pause size={19} />}</button>
        <button className="icon-button" onClick={() => setMenu(!menu)} aria-label="More"><MoreHorizontal size={20} /></button>
        <button className="icon-button" onClick={onClose} aria-label={t("Close")}><X /></button></div>
      <img className="sv-img" src={item.image} alt="Story" draggable={false} style={{ filter: css(item.filter) }} />
      <div className="sv-overlays"><Overlays texts={item.texts} /></div>
      <button className="sv-tap l" aria-label="Previous" onClick={prev} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)} />
      <button className="sv-tap r" aria-label="Next" onClick={next} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)} />
      {item.caption && <p className="sv-cap">{item.caption}</p>}
      <div className="sv-foot">{g.mine ? <>
        <button className="pill-btn glass" onClick={onAdd}><Plus size={15} /> {t("Add to story")}</button>
        <button className="pill-btn glass" onClick={() => item.id && onDelete(item.id)}><Trash2 size={15} /> {t("Delete")}</button></> : <>
        <form onSubmit={e => { e.preventDefault(); if (!reply.trim()) return; onReply(g.handle, `Replied to your story: ${reply.trim()}`); setReply(''); toast(t('Reply sent to {name}', { name: g.name })); }}>
          <input value={reply} onChange={e => setReply(e.target.value)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} placeholder={t('Reply to {name}…', { name: g.name })} aria-label="Reply to story" />
          <button type="submit" aria-label="Send reply" disabled={!reply.trim()}><Send size={18} /></button></form>
        <button className={'icon-button sv-like ' + (liked ? 'on' : '')} onClick={() => setLiked(!liked)} aria-label="Like story"><Heart size={24} fill={liked ? '#ff3040' : 'none'} /></button></>}</div>
      {menu && <div className="sv-sheet" onClick={() => setMenu(false)}><div onClick={e => e.stopPropagation()}>
        {g.mine ? <>
          <button className="danger" onClick={() => { setMenu(false); if (item.id) onDelete(item.id); }}><Trash2 size={17} /> {t("Delete")}</button>
          <button onClick={download}><Download size={17} /> {t("Save photo")}</button>
          <button onClick={() => { setMenu(false); onAdd(); }}><Plus size={17} /> {t("Add another story")}</button>
        </> : <>
          <button onClick={() => { setMenu(false); toast(t("Thanks. Reporting will reach moderators once moderation is connected.")); }} className="danger">{t("Report")}</button>
          <button onClick={() => { void navigator.clipboard?.writeText(location.origin).then(() => toast(t("Link copied"))); setMenu(false); }}>{t("Copy link")}</button>
        </>}
        <button onClick={() => setMenu(false)}>{t("Cancel")}</button>
      </div></div>}
    </div>
  </div>;
}
