'use client';
import { useT } from './I18n';
import { useEffect, useState } from 'react';
import { GifPicker, toGifAttachment } from './GifPicker';
import { GifView } from './GifView';
import type { GifAttachment } from '../lib/gifs';
import { X, ArrowRight, BarChart3, ImagePlus, Plus, Globe, Users, Target, Trash2 } from 'lucide-react';
import type { Post, Poll } from '../lib/data';
import { avatars } from '../lib/data';
import { MediaPicker } from './ImagePicker';
import {useStored, useLocalStore} from '../lib/social';

const LIMIT = 500;
const CATEGORIES = ['Job opportunity', 'Collaboration', 'Meet people', 'Learning', 'Project', 'Service', 'Other'];

export type Draft = { text: string; images: string[]; poll?: Poll; kind: 'post' | 'intention'; category?: string; audience: 'everyone' | 'followers'; quoteOf?: number; gif?: GifAttachment };

export default function Composer({ initialKind, quote, onClose, onPublish }: { initialKind: 'post' | 'intention'; quote?: Post | null; onClose: () => void; onPublish: (d: Draft) => void }) {
  const t = useT();
  const [kind, setKind] = useState(initialKind);
  const [postDraft,setPostDraft] = useStored('intent-draft-post','');
  const [intentionDraft,setIntentionDraft] = useStored('intent-draft-intention','');
  const [quoteText,setQuoteText] = useState('');
  const {remove} = useLocalStore();
  const text = quote ? quoteText : kind === 'post' ? postDraft : intentionDraft;
  const setText = (value:string) => { if(quote)setQuoteText(value);else if(kind==='post')setPostDraft(value);else setIntentionDraft(value); };
  const [images, setImages] = useState<string[]>([]);
  const [gif, setGif] = useState<GifAttachment | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [pollOn, setPollOn] = useState(false);
  const [options, setOptions] = useState(['', '']);
  const [days, setDays] = useState(1);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [audience, setAudience] = useState<'everyone' | 'followers'>('everyone');

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const left = LIMIT - text.length;
  const pollValid = !pollOn || options.filter(o => o.trim()).length >= 2;
  const can = (text.trim().length > 0 || images.length > 0 || !!gif) && left >= 0 && pollValid;

  function publish() {
    if (!can) return;
    const poll: Poll | undefined = pollOn ? { options: options.filter(o => o.trim()).map(o => ({ text: o.trim().slice(0, 40), votes: 0 })), endsAt: Date.now() + days * 86400000 } : undefined;
    if(!quote)remove('intent-draft-' + kind);
    onPublish({ text: text.trim(), images, poll, kind, category: kind === 'intention' ? category : undefined, audience, quoteOf: quote?.id, gif: gif || undefined });
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal composer-modal" role="dialog" aria-modal="true" aria-label={t("Create")} onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>{t(quote ? 'Quote post' : kind === 'post' ? 'Create post' : 'Create intention')}</h2><button className="icon-button" onClick={onClose} aria-label={t("Close")}><X /></button></div>
      {!quote && <div className="modal-types"><button className={kind === 'post' ? 'selected' : ''} onClick={() => setKind('post')}>{t("Post|type")}</button><button className={kind === 'intention' ? 'selected' : ''} onClick={() => setKind('intention')}><Target size={15} /> {t("Intention")}</button></div>}
      <div className="cmp-row"><img className="avatar" src={avatars.you} alt="" />
        <div className="cmp-main">
          <button type="button" className="aud-btn" onClick={() => setAudience(audience === 'everyone' ? 'followers' : 'everyone')}>{audience === 'everyone' ? <><Globe size={14} /> {t("Everyone")}</> : <><Users size={14} /> {t("Followers only")}</>}</button>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={t(quote ? 'Add a comment…' : kind === 'post' ? "What's on your mind? Use #hashtags and @mentions" : 'What are you looking for or offering?')} autoFocus rows={5} aria-label={t("Text")} />
          {kind === 'intention' && <label className="cmp-cat">{t("Category")}<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label>}
          {quote && <div className="quote-card"><div className="quote-h"><img src={quote.avatar} alt="" /><b>{quote.author}</b><span>@{quote.handle}</span></div><p>{quote.text.slice(0, 200)}</p></div>}
          {(showMedia || images.length > 0) && <MediaPicker images={images} onChange={setImages} />}
          {gif && <div className="cmp-gif"><GifView gif={gif} maxWidth={260} /><button type="button" className="icon-button" onClick={() => setGif(null)} aria-label={t('Remove')}><X size={16} /></button></div>}
          {gifOpen && <GifPicker variant="inline" layout="row" onPick={g => { setGif(toGifAttachment(g)); setGifOpen(false); setImages([]); setShowMedia(false); }} onClose={() => setGifOpen(false)} />}
          {pollOn && <div className="poll-edit">
            {options.map((o, i) => <div key={i} className="poll-edit-row"><input value={o} maxLength={40} placeholder={t('Choice {n}', { n: i + 1 })} onChange={e => setOptions(options.map((x, k) => k === i ? e.target.value : x))} />{options.length > 2 && <button type="button" className="icon-button" aria-label="Remove choice" onClick={() => setOptions(options.filter((_, k) => k !== i))}><Trash2 size={16} /></button>}</div>)}
            <div className="poll-edit-foot">{options.length < 4 && <button type="button" className="pill-btn ghost" onClick={() => setOptions([...options, ''])}><Plus size={15} /> {t("Add choice")}</button>}
              <label>{t("Length")}<select value={days} onChange={e => setDays(Number(e.target.value))}>{[1, 3, 7].map(d => <option key={d} value={d}>{d > 1 ? t('{n} days', { n: d }) : t('1 day')}</option>)}</select></label>
              <button type="button" className="pill-btn ghost" onClick={() => setPollOn(false)}>{t("Remove poll")}</button></div>
          </div>}
        </div>
      </div>
      <div className="cmp-foot">
        <div className="cmp-tools">
          <button type="button" className="icon-button" onClick={() => setShowMedia(true)} aria-label={t("Add photos")} disabled={pollOn}><ImagePlus size={21} /></button>
          <button type="button" className="icon-button" onClick={() => { setPollOn(true); setImages([]); setShowMedia(false); }} aria-label={t("Add poll")} disabled={images.length > 0 || !!quote || !!gif}><BarChart3 size={21} /></button>
          <button type="button" className="icon-button cmp-gif-btn" onClick={() => setGifOpen(!gifOpen)} aria-label="GIF" disabled={pollOn || images.length > 0}>GIF</button>
        </div>
        {left<40&&<span className={'cmp-limit'+(left<0?' over':'')} role="status">{t(left<0?'Over the character limit: {n}':'Characters remaining: {n}',{n:Math.abs(left)})}</span>}
        <button className="primary modal-publish" disabled={!can} onClick={publish}>{t("Publish")} <ArrowRight size={18} /></button>
      </div>
    </div>
  </div>;
}
