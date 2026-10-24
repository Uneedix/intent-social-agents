'use client';
import { useT } from './I18n';
import {useEffect,useRef,useState} from 'react';
import {compressImage, useStored, useLocalStore} from '../lib/social';
import { clearScope, exportScope } from '../lib/storage';
import {Search,SlidersHorizontal,Users,FileText,Target,ShoppingBag,Bookmark,MapPin,Check,Edit3,Camera,Link2,Shield,Globe,Bell,Monitor,Download,Trash2,Lock,Eye,EyeOff,UserRound,ArrowUpDown,Upload,Image as ImageIcon} from 'lucide-react';
import {avatars,products,type Post} from '../lib/data';

type Person=[string,string,string];
export type ProfileData={name:string;handle:string;bio:string;location:string;website:string;avatar:string;cover:string;pronouns:string;interests:string;};
export const defaultProfile:ProfileData={name:'Gera Fischer',handle:'gerafischer',bio:'Building, creating and exploring opportunities.',location:'Warsaw, Poland',website:'',avatar:avatars.you,cover:'',pronouns:'',interests:'Technology, Business, Music'};
export function useProfile(){const [profile,save]=useStored<ProfileData>('intent-profile-v1',defaultProfile);return {profile,save}}
const norm=(v:string)=>v.toLocaleLowerCase().trim();
export function SearchHub({query,onQuery,people,posts,intentions,onFollow,following,onPost,onMessage}:{query:string;onQuery:(s:string)=>void;people:Person[];posts:Post[];intentions:Post[];onFollow:(s:string)=>void;following:string[];onPost:(p:Post)=>void;onMessage:(name:string)=>void}){
  const t = useT();
 const [category,setCategory]=useState('All');const [sort,setSort]=useState('Relevant');const [onlyFollowing,setOnlyFollowing]=useState(false);const [place,setPlace]=useState('');const [savedSearches,setSavedSearches]=useStored<string[]>('intent-saved-searches',[]);
 const saveSearch=()=>{const q=query.trim();if(!q)return;const next=[q,...savedSearches.filter(x=>x!==q)].slice(0,12);setSavedSearches(next)};
 const matches=(...values:string[])=>!norm(query)||values.some(v=>norm(v).includes(norm(query)));
 const filteredPeople=people.filter(([name,handle])=>matches(name,handle)).filter(([,handle])=>!onlyFollowing||following.includes(handle));
 const filteredPosts=[...posts,...intentions].filter(p=>matches(p.text,p.author,p.handle,p.category||'')).filter(p=>category==='All'||category==='Posts'&&p.kind!=='intention'||category==='Intentions'&&p.kind==='intention').filter(p=>!onlyFollowing||following.includes(p.handle)).sort((a,b)=>sort==='Popular'?b.likes-a.likes:sort==='Newest'?b.id-a.id:0);
 const filteredItems=products.filter(p=>matches(p.name,p.city)).filter(p=>!place||norm(p.city).includes(norm(place)));
 const results=(category==='All'?filteredPeople.length+filteredPosts.length+filteredItems.length:category==='People'?filteredPeople.length:category==='Market'?filteredItems.length:filteredPosts.length);
 return <section className="experience"><div className="page-heading"><div><h1>{t("Explore & search")}</h1><p>{t("Search people, posts, intentions and marketplace listings.")}</p></div><Search size={27}/></div><div className="experience-card"><div className="experience-search"><Search size={20}/><input aria-label="Search INTENT" value={query} onChange={e=>onQuery(e.target.value)} placeholder={t("Name, @username, topic, opportunity, product...")}/><button className="outline" onClick={saveSearch} disabled={!query.trim()}><Bookmark size={16}/> {t("Save search")}</button></div><div className="experience-filters"><div className="experience-tabs">{['All','People','Posts','Intentions','Market'].map(x=><button key={x} className={category===x?'selected':''} onClick={()=>setCategory(x)}>{t(x)}</button>)}</div><label><ArrowUpDown size={15}/><select aria-label="Sort results" value={sort} onChange={e=>setSort(e.target.value)}><option value="Relevant">{t("Relevant")}</option><option value="Newest">{t("Newest")}</option><option value="Popular">{t("Popular")}</option></select></label><label><MapPin size={15}/><input aria-label="Filter marketplace by city" value={place} onChange={e=>setPlace(e.target.value)} placeholder={t("Market city")}/></label><label className="experience-check"><input type="checkbox" checked={onlyFollowing} onChange={e=>setOnlyFollowing(e.target.checked)}/> {t("Following only")}</label></div></div><div className="experience-meta"><span>{t('{n} matching demo results', { n: results })}</span><span>{t("Search covers locally available content; global indexing requires backend search.")}</span></div>{savedSearches.length>0&&<div className="experience-recent"><span>{t("Saved searches")}</span>{savedSearches.map(q=><button key={q} onClick={()=>onQuery(q)}>{q}</button>)}<button onClick={()=>{setSavedSearches([]);localStorage.removeItem('intent-saved-searches')}}>{t("Clear")}</button></div>}
 {(category==='All'||category==='People')&&<><h2><Users size={19}/> {t("People")}</h2>{filteredPeople.length?filteredPeople.map(([name,handle,avatar])=><div className="experience-result" key={handle}><img className="avatar" src={avatar} alt=""/><div><strong>{name}</strong><small>@{handle}</small></div><button className="outline" onClick={()=>onMessage(name)}>{t("Message")}</button><button className="follow" onClick={()=>onFollow(handle)}>{t(following.includes(handle)?'Following|button':'Follow')}</button></div>):<p className="muted">{t("No matching people.")}</p>}</>}
 {(category==='All'||category==='Posts'||category==='Intentions')&&<><h2><FileText size={19}/> {t(category==='Intentions'?'Intentions':'Publications')}</h2>{filteredPosts.length?filteredPosts.slice(0,40).map(p=><button className="experience-post" key={p.id} onClick={()=>onPost(p)}><div><strong>{p.author}</strong><small> @{p.handle} · {t(p.kind==='intention'?'Intention':'Posts')}</small></div><p>{p.text}</p><small>{t('{n} likes', { n: p.likes })} · {t('{n} comments', { n: p.comments })}</small></button>):<p className="muted">{t("No matching publications.")}</p>}</>}
 {(category==='All'||category==='Market')&&<><h2><ShoppingBag size={19}/> {t("Marketplace")}</h2><div className="experience-market">{filteredItems.map(p=><div className="experience-product" key={p.id}><img src={p.image} alt=""/><strong>{p.name}</strong><small>{p.city} · {p.price.toLocaleString()} PLN</small></div>)}</div>{!filteredItems.length&&<p className="muted">{t("No matching listings.")}</p>}</>}
 </section>;
}
export function ProfileStudio({ profile, posts, intentions, followingCount, pinnedId, renderPost, onCompose, onEdit }: { profile: ProfileData; onSave?: (p: ProfileData) => void; posts: Post[]; intentions: Post[]; followingCount: number; pinnedId: number | null; renderPost: (p: Post) => React.ReactNode; onPost?: (p: Post) => void; onCompose: () => void; onEdit: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<'Posts' | 'Media' | 'Intentions' | 'About'>('Posts');
  const mine = posts.filter(p => p.handle === 'you');
  const pinned = [...posts, ...intentions].find(p => p.id === pinnedId && p.handle === 'you');
  const list = tab === 'Posts' ? mine.filter(p => p.id !== pinned?.id) : intentions.filter(p => p.handle === 'you');
  const media = mine.flatMap(p => p.images.map(src => ({ src, id: p.id })));
  return <section className="experience">
    <div className="profile-cover-enhanced" style={profile.cover ? { backgroundImage: `url(${profile.cover})` } : undefined} />
    <div className="profile-enhanced"><img src={profile.avatar} alt="Your avatar" /><div><h1>{profile.name}</h1><p>@{profile.handle}{profile.pronouns && ` · ${profile.pronouns}`}</p><p className="profile-bio">{profile.bio}</p>
      <small><MapPin size={14} />{profile.location}</small>{profile.website && <a href={profile.website.startsWith('https://') ? profile.website : '#'} target="_blank" rel="noopener noreferrer nofollow"><Link2 size={14} /> {profile.website.replace(/^https:\/\//, '')}</a>}
      {profile.interests && <div className="profile-interests">{profile.interests.split(',').map(t => t.trim()).filter(Boolean).map(t => <span key={t}>{t}</span>)}</div>}</div>
      <button className="outline" onClick={onEdit}><Edit3 size={16} /> {t("Edit profile")}</button></div>
    <div className="stats"><span><strong>{mine.length}</strong> {t("Posts")}</span><span><strong>{intentions.filter(p => p.handle === 'you').length}</strong> {t("Intentions")}</span><span><strong>{followingCount}</strong> {t("Following")}</span></div>
    <div className="experience-tabs profile-tabs">{(['Posts', 'Media', 'Intentions', 'About'] as const).map(x => <button key={x} className={tab === x ? 'selected' : ''} onClick={() => setTab(x)}>{t(x)}</button>)}</div>
    {tab === 'About' ? <div className="experience-card"><h2>{t("About")}</h2><p>{profile.bio}</p><p><MapPin size={16} /> {profile.location}</p><p><Globe size={16} /> {profile.website || t('No website provided')}</p><p>{profile.interests}</p></div>
      : tab === 'Media' ? (media.length ? <div className="ig-grid profile-grid">{media.map((m, i) => <div key={i} className="ig-cell"><img src={m.src} alt="" loading="lazy" /></div>)}</div> : <div className="empty">{t("Photos you post appear here.")} <button className="outline" onClick={onCompose}>{t("Share a photo")}</button></div>)
      : <div className="feed">{tab === 'Posts' && pinned && renderPost(pinned)}{list.length ? list.map(renderPost) : !pinned && <div className="empty">{t(tab === 'Posts' ? 'Your posts will appear here.' : 'Your intentions will appear here.')} <button className="outline" onClick={onCompose}>{t("Create")}</button></div>}</div>}
  </section>;
}

export type SettingsSection = 'profile' | 'notifications' | 'language' | 'privacy' | 'blocked' | 'words' | 'appearance' | 'security' | 'data';
const GROUPS: [string, [SettingsSection, string, typeof UserRound][]][] = [
  ['How you use intent', [['profile', 'Edit profile', UserRound], ['notifications', 'Notifications', Bell], ['language', 'Language & region', Globe]]],
  ['Who can see your content', [['privacy', 'Privacy', Lock], ['blocked', 'Muted & hidden', EyeOff], ['words', 'Hidden words', Eye]]],
  ['Your app', [['appearance', 'Appearance', Monitor]]],
  ['Account', [['security', 'Security & sign-in', Shield], ['data', 'Data & account', Download]]]];

type SettingsProps = { section: SettingsSection; onSection: (s: SettingsSection) => void; profile: ProfileData; onSaveProfile: (p: ProfileData) => void; right: boolean; onRight: (v: boolean) => void; currency: string; onCurrency: (v: string) => void; privacy: string; onPrivacy: (v: string) => void; allowMessages: boolean; onAllowMessages: (v: boolean) => void; allowMentions: boolean; onAllowMentions: (v: boolean) => void; emailAlerts: boolean; onEmailAlerts: (v: boolean) => void; language: string; onLanguage: (v: string) => void; onAds: () => void; muted: string[]; onUnmute: (h: string) => void; hiddenCount: number; onClearHidden: () => void; words: string[]; onWords: (w: string[]) => void; toast: (m: string) => void };

export function SettingsStudio(props: SettingsProps) {
  const t = useT();
  const { section, onSection } = props;
  const { scope } = useLocalStore();
  const [compact, setCompact] = useStored('intent-compact', false); const [reduceMotion, setReduceMotion] = useStored('intent-reduce-motion', false); const [contentLangs, setContentLangs] = useStored<string[]>('intent-content-languages', ['English']); const [confirmReset, setConfirmReset] = useState(false);
  const [push, setPush] = useStored<Record<string, boolean>>('intent-push', { likes: true, comments: true, follows: true, messages: true, mentions: true });
  const [activity, setActivity] = useStored('intent-activity-status', true); const [word, setWord] = useState('');
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void, description: string) => <div className="setting-row"><div><strong>{t(label)}</strong><small>{t(description)}</small></div><button className={'toggle ' + (value ? 'on' : '')} onClick={() => onChange(!value)} aria-label={t(label)} aria-pressed={value} /></div>;
  const title = GROUPS.flatMap(g => g[1]).find(x => x[0] === section)?.[1];
  return <section className="settings2">
    <nav className="settings2-nav" aria-label="Settings sections"><h1>{t("Settings")}</h1>{GROUPS.map(([g, items]) => <div key={g}><p className="settings2-group">{t(g)}</p>{items.map(([k, l, Icon]) => <button key={k} className={section === k ? 'on' : ''} onClick={() => onSection(k)} aria-current={section === k ? 'page' : undefined}><Icon size={18} />{t(l)}</button>)}</div>)}</nav>
    <div className="settings2-panel"><h2>{title && t(title)}</h2>
      {section === 'profile' && <ProfileEditor profile={props.profile} onSave={p => { props.onSaveProfile(p); props.toast(t("Profile saved")); }} />}
      {section === 'notifications' && <>{toggle('Email notifications', props.emailAlerts, props.onEmailAlerts, 'Weekly summary and important account emails')}
        {([['likes', 'Likes and reactions'], ['comments', 'Comments and replies'], ['mentions', 'Mentions'], ['follows', 'New followers'], ['messages', 'Messages']] as const).map(([k, l]) => <div key={k}>{toggle(l, push[k], v => { const n = { ...push, [k]: v }; setPush(n); persist('intent-push', n); }, 'In-app notifications')}</div>)}
        <p className="disclaimer">{t("Push and email delivery need backend services; these are your saved preferences.")}</p></>}
      {section === 'language' && <><div className="setting-row"><div><strong>{t("Interface language")}</strong><small>{t('Translations were prepared with AI and are being reviewed. Posts and private messages are never translated automatically.')}</small></div><select value={props.language} onChange={e => props.onLanguage(e.target.value)}>{LANGS.map(l => <option key={l}>{l}</option>)}</select></div>
        <h3>{t("Content languages")}</h3><p className="muted">{t("Posts in these languages are preferred in your feed.")}</p><div className="language-grid">{LANGS.map(l => <label key={l}><input type="checkbox" checked={contentLangs.includes(l)} onChange={() => { const next = contentLangs.includes(l) ? contentLangs.filter(x => x !== l) : [...contentLangs, l]; setContentLangs(next); persist('intent-content-languages', next); }} />{l}</label>)}</div>
        <div className="setting-row"><div><strong>{t("Display currency")}</strong><small>{t("Used in Market")}</small></div><select value={props.currency} onChange={e => props.onCurrency(e.target.value)}>{['PLN', 'EUR', 'USD', 'HUF'].map(c => <option key={c}>{c}</option>)}</select></div></>}
      {section === 'privacy' && <><div className="setting-row"><div><strong>{t("Profile visibility")}</strong><small>{t("Private: only followers you approve see your posts")}</small></div><select value={props.privacy} onChange={e => props.onPrivacy(e.target.value)}><option value="Public">{t("Public")}</option><option value="Private">{t("Private")}</option></select></div>
        {toggle('Allow direct messages', props.allowMessages, props.onAllowMessages, 'Who can start a chat with you')}{toggle('Allow mentions', props.allowMentions, props.onAllowMentions, 'Let others @mention you')}{toggle('Show activity status', activity, v => { setActivity(v); persist('intent-activity-status', v); }, 'Show when you were last online')}
        <p className="disclaimer">{t("These preferences are not enforced on the server yet. Don’t rely on them to protect private data.")}</p></>}
      {section === 'blocked' && <>{props.muted.length ? props.muted.map(h => <div className="setting-row" key={h}><div><strong>@{h}</strong><small>{t("Muted — their posts are hidden from your feed")}</small></div><button className="outline" onClick={() => props.onUnmute(h)}>{t("Unmute")}</button></div>) : <p className="muted">{t("You haven’t muted anyone. Use “Mute” in a post’s menu.")}</p>}
        <div className="setting-row"><div><strong>{t("Hidden posts")}</strong><small>{t('{n} posts marked “Not interested”', { n: props.hiddenCount })}</small></div><button className="outline" disabled={!props.hiddenCount} onClick={props.onClearHidden}>{t("Show again")}</button></div></>}
      {section === 'words' && <><p className="muted">{t("Posts containing these words or #hashtags are hidden from your feed and search.")}</p>
        <form className="words-form" onSubmit={e => { e.preventDefault(); const w = word.trim().toLowerCase(); if (w && !props.words.includes(w)) props.onWords([...props.words, w]); setWord(''); }}><input value={word} onChange={e => setWord(e.target.value)} maxLength={40} placeholder={t("Add a word or #hashtag")} aria-label="Hidden word" /><button className="primary" disabled={!word.trim()}>{t("Add")}</button></form>
        <div className="profile-interests">{props.words.map(w => <span key={w}>{w}<button aria-label={`Remove ${w}`} onClick={() => props.onWords(props.words.filter(x => x !== w))}>×</button></span>)}</div></>}
      {section === 'appearance' && <>{toggle('Show right sidebar', props.right, props.onRight, 'Recommendations and trending topics')}{toggle('Compact interface', compact, v => { setCompact(v); persist('intent-compact', v); document.documentElement.classList.toggle('intent-compact', v); }, 'Reduce padding in cards and panels')}{toggle('Reduce motion', reduceMotion, v => { setReduceMotion(v); persist('intent-reduce-motion', v); document.documentElement.classList.toggle('intent-reduce-motion', v); }, 'Minimize transitions and animations')}</>}
      {section === 'security' && <><div className="setting-row"><div><strong>{t("Password")}</strong><small>{t("Change your password by email link")}</small></div><a className="outline" href="/forgot-password">{t("Reset password")}</a></div>
        <div className="setting-row"><div><strong>{t("Two-factor authentication")}</strong><small>{t("Coming soon — will use Supabase Auth MFA (authenticator app)")}</small></div><button className="outline" disabled>{t("Set up")}</button></div>
        <div className="setting-row"><div><strong>{t("Sign out")}</strong><small>{t("End the session on this device")}</small></div><a className="outline" href="/login">{t("Switch account")}</a></div></>}
      {section === 'data' && <><div className="setting-row"><div><strong>{t("Instant ADS")}</strong><small>{t("Campaign drafts and advertising workspace")}</small></div><button className="outline" onClick={props.onAds}>{t("Open →")}</button></div>
        <div className="setting-row"><div><strong>{t("Download your data")}</strong><small>{t("Everything intent stores on this device, as JSON")}</small></div><button className="outline" onClick={() => { const data = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('intent-')).map(k => [k, store(k, null)])); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'intent-local-data.json'; a.click(); URL.revokeObjectURL(url); }}><Download size={16} /> {t("Export")}</button></div>
        <div className="setting-row"><div><strong>{t("Reset this device")}</strong><small>{t("Deletes local posts, chats and preferences. Your account stays.")}</small></div><button className="outline" onClick={() => setConfirmReset(true)}><Trash2 size={16} /> {t("Reset")}</button></div>
        {confirmReset && <div className="experience-confirm"><strong>{t("Delete all intent data on this device?")}</strong><p>{t("This cannot be undone. Your Supabase account, communities and group chats remain.")}</p><button className="outline" onClick={() => setConfirmReset(false)}>{t("Cancel")}</button><button className="primary" onClick={() => { Object.keys(localStorage).filter(k => k.startsWith('intent-')).forEach(k => localStorage.removeItem(k)); location.reload(); }}>{t("Delete local data")}</button></div>}</>}
    </div>
  </section>;
}
const LANGS = ['English', 'Русский', 'Українська', 'Polski', 'Magyar', 'Deutsch', 'Français', 'Español'];

function ProfileEditor({ profile, onSave }: { profile: ProfileData; onSave: (p: ProfileData) => void }) {
  const t = useT();
  const [d, setD] = useState(profile);
  useEffect(() => setD(profile), [profile]);
  const set = (k: keyof ProfileData, v: string) => setD(p => ({ ...p, [k]: v }));
  const handleOk = /^[a-zA-Z0-9_.]{3,30}$/.test(d.handle);
  const siteOk = !d.website || /^https:\/\/[^\s]+\.[^\s]+$/.test(d.website);
  const dirty = JSON.stringify(d) !== JSON.stringify(profile);
  const coverInput = useRef<HTMLInputElement>(null); const avInput = useRef<HTMLInputElement>(null); const [err, setErr] = useState('');
  const pick = async (k: 'avatar' | 'cover', f?: File) => { if (!f) return; setErr(''); try { set(k, await compressImage(f, k === 'avatar' ? 600 : 1800)); } catch (e) { setErr(e instanceof Error ? e.message : t('Upload failed')); } };
  return <form className="pe" onSubmit={e => { e.preventDefault(); if (d.name.trim() && handleOk && siteOk) onSave({ ...d, name: d.name.trim() }); }}>
    <div className="pe-card"><div className="pe-cover" style={d.cover ? { backgroundImage: `url(${d.cover})` } : undefined}>
      <div className="pe-cover-actions"><button type="button" className="pill-btn glass" onClick={() => coverInput.current?.click()}><ImageIcon size={15} /> {t(d.cover ? 'Change cover' : 'Add cover')}</button>{d.cover && <button type="button" className="pill-btn glass" onClick={() => set('cover', '')} aria-label="Remove cover"><Trash2 size={15} /></button>}</div></div>
      <div className="pe-who"><button type="button" className="pe-av" onClick={() => avInput.current?.click()} aria-label="Change profile photo"><img src={d.avatar} alt="" /><span><Camera size={18} /></span></button><div><b>{d.name || t('Your name')}</b><small>@{d.handle}</small></div>
        <button type="button" className="pill-btn light" onClick={() => avInput.current?.click()}><Upload size={15} /> {t("New photo")}</button></div>
      <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => { void pick('cover', e.target.files?.[0]); e.target.value = ''; }} /><input ref={avInput} type="file" accept="image/*" hidden onChange={e => { void pick('avatar', e.target.files?.[0]); e.target.value = ''; }} />
      {err && <small className="img-picker-error" role="alert">{err}</small>}</div>
    <div className="pe-grid">
      <label htmlFor="pe-name">{t("Name")}</label><input id="pe-name" value={d.name} maxLength={50} onChange={e => set('name', e.target.value)} />
      <label htmlFor="pe-handle">{t("Username")}</label><div><div className="pe-at"><span>@</span><input id="pe-handle" value={d.handle} maxLength={30} onChange={e => set('handle', e.target.value.toLowerCase().replace(/\s/g, ''))} /></div><small className={handleOk ? 'ok' : 'bad'}>{t(handleOk ? (d.handle === profile.handle ? 'Your current username' : 'Username looks good') : '3–30 characters: letters, numbers, dot and underscore')}</small></div>
      <label htmlFor="pe-pron">{t("Pronouns")}</label><input id="pe-pron" value={d.pronouns} maxLength={30} placeholder={t("e.g. he/him")} onChange={e => set('pronouns', e.target.value)} />
      <label htmlFor="pe-bio">{t("Bio")}</label><div><textarea id="pe-bio" rows={3} value={d.bio} maxLength={150} onChange={e => set('bio', e.target.value)} /><small>{d.bio.length} / 150</small></div>
      <label htmlFor="pe-loc">{t("Location")}</label><div><input id="pe-loc" value={d.location} maxLength={60} onChange={e => set('location', e.target.value)} /><small>{t("Only your city is shown. Your exact location is never shared.")}</small></div>
      <label htmlFor="pe-web">{t("Website")}</label><div><input id="pe-web" value={d.website} maxLength={120} placeholder="https://" onChange={e => set('website', e.target.value.trim())} />{!siteOk && <small className="bad">{t("Use a full https:// link")}</small>}</div>
      <label htmlFor="pe-int">{t("Interests")}</label><div><input id="pe-int" value={d.interests} maxLength={200} placeholder="Technology, Music, Travel" onChange={e => set('interests', e.target.value)} /><small>{t("Separate with commas")}</small></div>
    </div>
    <div className="pe-foot"><small className="muted">{t("Saved on this device. Public profiles sync once the profiles table is connected.")}</small><button type="button" className="outline" disabled={!dirty} onClick={() => setD(profile)}>{t("Cancel")}</button><button type="submit" className="primary" disabled={!dirty || !d.name.trim() || !handleOk || !siteOk}><Check size={16} /> {t("Save")}</button></div>
  </form>;
}
