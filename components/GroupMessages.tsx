'use client';
import { useT, useI18n } from './I18n';
import { Sheet } from './MsgParts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';
import { useSession } from './SessionBoundary';
import ResizeHandle from './ResizeHandle';
import { Send, UserPlus, ArrowLeft, RefreshCw, Search, SquarePen, MessageSquare, Info, X } from 'lucide-react';
type Group = { id:string; title:string; description:string|null; created_by:string; created_at:string };
type Member = { user_id:string; role:string };
type Message = { id:string; sender_id:string; body:string; created_at:string };
type DB = ReturnType<typeof createClient>;
const PAGE_SIZE = 100;
const chronological = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const mergeMessages = (old: Message[], next: Message[]) => [...new Map([...old, ...next].map(m => [m.id, m])).values()].sort(chronological);
type Props={modeSwitch?:ReactNode;onHome?:()=>void};
export default function GroupMessages({modeSwitch,onHome}:Props={}) {
 const {user,scope} = useSession();
 const [db] = useState<DB | null>(() => { try { return isSupabaseConfigured() ? createClient() : null; } catch { return null; } });
 return <GroupMessagesSession key={scope} supabase={db} userId={user?.id || null} modeSwitch={modeSwitch} onHome={onHome} />;
}
function GroupMessagesSession({supabase,userId,modeSwitch,onHome}:{supabase:DB|null;userId:string|null}&Props) {
 const t = useT();
 const {lang}=useI18n();
 const ui=lang==='Русский'?{search:'Поиск групп…',created:'Созданные мной',members:'Участники',unavailable:'Групповые чаты пока недоступны.'}:lang==='Polski'?{search:'Szukaj grup…',created:'Utworzone przeze mnie',members:'Uczestnicy',unavailable:'Czaty grupowe są teraz niedostępne.'}:{search:'Search groups…',created:'Created by me',members:'Members',unavailable:'Group chats are unavailable right now.'};
 const [query,setQuery]=useState('');const [groupFilter,setGroupFilter]=useState<'all'|'created'>('all');const [showInfo,setShowInfo]=useState(false);
 const history=useRef<HTMLDivElement>(null);
 const [groups,setGroups]=useState<Group[]>([]);
 const [selected,setSelected]=useState<Group|null>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(!!userId&&!!supabase);
 const [conversationLoading,setConversationLoading]=useState(false);
 const [olderLoading,setOlderLoading]=useState(false);
 const [hasOlder,setHasOlder]=useState(false);
 const [error,setError]=useState('');
 const [creating,setCreating]=useState(false);
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [invite,setInvite]=useState('');
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const alive = useRef(true);
 const groupRequest = useRef(0);
 const conversationRequest = useRef(0);
 const selection = useRef<string | null>(null);
 const selectionVersion = useRef(0);
 const olderBusy = useRef(false);
 const oldest = useRef<Message | null>(null);
 useEffect(() => { const counters=[groupRequest,conversationRequest];alive.current = true; return () => { alive.current = false; counters.forEach(counter=>counter.current++); }; }, []);
 const choose = (group: Group | null) => {
  selectionVersion.current++; selection.current = group?.id || null; conversationRequest.current++; olderBusy.current = false; oldest.current = null;
  setSelected(group); setMembers([]); setMessages([]); setDraft(''); setInvite(''); setError(''); setHasOlder(false); setOlderLoading(false); setConversationLoading(!!group); setBusy(false);
 };
 const refreshGroups=useCallback(async()=>{
  if(!supabase)return;
  const request = ++groupRequest.current; setLoading(true);
  try {
   const {data,error}=await supabase.from('message_groups').select('id,title,description,created_by,created_at').order('created_at',{ascending:false}).order('id',{ascending:false});
   if (!alive.current || request !== groupRequest.current) return;
   if(error) setError(error.message); else setGroups((data||[]) as Group[]);
  } catch(e) { if (alive.current && request === groupRequest.current) setError(e instanceof Error ? e.message : 'Could not load groups'); }
  finally { if (alive.current && request === groupRequest.current) setLoading(false); }
 },[supabase]);
 const refreshConversation=useCallback(async(id:string)=>{
  if(!supabase)return;
  const request = ++conversationRequest.current;
  const current = () => alive.current && selection.current === id && request === conversationRequest.current;
  try {
   const [m,p]=await Promise.all([
    supabase.from('message_group_messages').select('id,sender_id,body,created_at').eq('group_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE),
    supabase.from('message_group_members').select('user_id,role').eq('group_id',id)
   ]);
   if (!current()) return;
   if(m.error || p.error) { setError([m.error?.message,p.error?.message].filter(Boolean).join('; ')); setMessages([]);setMembers([]);oldest.current=null;setHasOlder(false); return; }
   const next = (m.data || []) as Message[];
   setMessages(old => mergeMessages(old, next)); setMembers((p.data||[]) as Member[]);
   if (!oldest.current) { oldest.current = [...next].sort(chronological)[0] || null; setHasOlder(next.length === PAGE_SIZE); }
   setError('');
  } catch(e) { if(current()) setError(e instanceof Error ? e.message : 'Could not load conversation'); }
  finally { if(current()) setConversationLoading(false); }
 },[supabase]);
 async function loadOlder() {
  if (!supabase || !selected || !oldest.current || olderBusy.current || !hasOlder) return;
  const id = selected.id, cursor = oldest.current, version = selectionVersion.current; olderBusy.current = true; setOlderLoading(true);
  const current = () => alive.current && selection.current === id && selectionVersion.current === version && oldest.current === cursor;
  try {
   const { data, error } = await supabase.from('message_group_messages').select('id,sender_id,body,created_at').eq('group_id',id)
    .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
   if (!current()) return;
   if (error) { setError(error.message); return; }
   const next = (data || []) as Message[]; setMessages(old => mergeMessages(old,next));
   oldest.current = [...next].sort(chronological)[0] || cursor; setHasOlder(next.length === PAGE_SIZE); setError('');
  } catch(e) { if(current()) setError(e instanceof Error ? e.message : 'Could not load older messages'); }
  finally { if(alive.current && selection.current === id && selectionVersion.current === version) { olderBusy.current = false; setOlderLoading(false); } }
 }
 useEffect(()=>{if(userId)void refreshGroups();},[userId,refreshGroups]);
 useEffect(()=>{if(!selected)return;void refreshConversation(selected.id);
  const timer=setInterval(()=>{void refreshConversation(selected.id)},5000);
  return()=>clearInterval(timer);
 },[selected,refreshConversation]);
 async function mutate(action: () => PromiseLike<{error: {message:string} | null}>, after: () => Promise<void> | void) {
  const id = selection.current, version = selectionVersion.current; setBusy(true); setError('');
  try { const { error } = await action(); if (!alive.current || selection.current !== id || selectionVersion.current !== version) return; if(error) throw Error(error.message); await after(); }
  catch(e) { if(alive.current && selection.current === id && selectionVersion.current === version) setError(e instanceof Error ? e.message : 'Operation failed'); }
  finally { if(alive.current && selection.current === id && selectionVersion.current === version) setBusy(false); }
 }
 async function createGroup(e:React.FormEvent){
  e.preventDefault();if(!supabase||!userId||title.trim().length < 3 || busy)return;
  const version=selectionVersion.current;setBusy(true);setError('');
  try {
   const {data,error}=await supabase.rpc('create_message_group',{p_title:title.trim(),p_description:description.trim()});
   if(!alive.current||version!==selectionVersion.current)return;if(error)throw Error(error.message);
   setCreating(false);setTitle('');setDescription('');
   const {data:group,error:groupError}=await supabase.from('message_groups').select('id,title,description,created_by,created_at').eq('id',data).single();
   if(!alive.current||version!==selectionVersion.current)return;if(groupError)throw Error(groupError.message);
   if(group)choose(group as Group);await refreshGroups();
  }catch(e){if(alive.current&&version===selectionVersion.current)setError(e instanceof Error?e.message:'Could not create group');}
  finally{if(alive.current&&version===selectionVersion.current)setBusy(false);}

 }
 async function addMember(e:React.FormEvent){e.preventDefault();if(!supabase||!selected||!invite.trim()||busy)return;
  const id=selected.id;
  await mutate(()=>supabase.rpc('add_message_group_member',{p_group_id:id,p_user_id:invite.trim()}), async()=>{setInvite('');await refreshConversation(id);});
 }
 async function sendMessage(e:React.FormEvent){e.preventDefault();if(!supabase||!selected||!draft.trim()||busy)return;
  const id=selected.id;
  await mutate(()=>supabase.from('message_group_messages').insert({group_id:id,body:draft.trim()}),async()=>{setDraft('');await refreshConversation(id);});
 }
 const filteredGroups=groups.filter(group=>(groupFilter==='all'||group.created_by===userId)&&`${group.title} ${group.description||''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const errorNotice=error&&<div role="alert" className="group-error">{error} <button type="button" onClick={()=>{setError('');if(selected)void refreshConversation(selected.id);else void refreshGroups();}}>{t('Retry')}</button><button type="button" onClick={()=>setError('')}>{t('Dismiss')}</button></div>;
 return <div className={'ms ms-groups group-messages group-messages-grid '+(selected?'has-chat ':'')+(selected&&showInfo?'side-open':'')}>
  <aside className="group-list ms-list">
   <ResizeHandle pane="groupList" edge="end" container=".group-messages-grid" label="Resize group list"/>
   <div className="ms-title"><h1>{t('Messages')}</h1><button type="button" className="ms-logo ms-home-logo" onClick={onHome} aria-label={t('Home')}>intent<span>.</span></button><span className="ms-title-tools">{modeSwitch}<button type="button" className="icon-button ms-show-m" disabled={!userId||!supabase} onClick={()=>setCreating(true)} aria-label={t('New group')}><SquarePen size={22}/></button></span></div>
   <div className="ms-search-row"><label className="ms-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ui.search} aria-label={ui.search}/></label><button type="button" className="ms-new ms-hide-m" disabled={!userId||!supabase} onClick={()=>setCreating(true)} aria-label={t('New group')} title={t('New group')}><SquarePen size={20}/></button></div>
   <div className="ms-chips" role="tablist" aria-label={t('Group chats')}><button type="button" role="tab" aria-selected={groupFilter==='all'} className={groupFilter==='all'?'on':''} onClick={()=>setGroupFilter('all')}>{t('All')}</button><button type="button" role="tab" aria-selected={groupFilter==='created'} className={groupFilter==='created'?'on':''} onClick={()=>setGroupFilter('created')}>{ui.created}</button><button type="button" className="ms-chip-add" disabled={!userId||!supabase||loading} onClick={()=>void refreshGroups()} aria-label="Refresh groups"><RefreshCw size={15}/></button></div>
   {!selected&&errorNotice}
   <div className="ms-chats">{loading?<p role="status" className="ms-empty">{t('Loading…')}</p>:filteredGroups.map(group=><button type="button" key={group.id} className={'group-list-item ms-item '+(selected?.id===group.id?'current on':'')} onClick={()=>choose(group)}><span className="ms-av"><span className="ms-av-logo group-server-avatar">{group.title.slice(0,1).toUpperCase()}</span></span><span className="ms-mid"><strong className="ms-name">{group.title}</strong><small>{group.description||t('Group conversation')}</small></span></button>)}
    {!loading&&userId&&supabase&&!filteredGroups.length&&<p className="muted ms-empty">{t(query?'No chats found.':'No groups yet. Create your first group.')}</p>}
    {!supabase?<p className="ms-local-note">{ui.unavailable}</p>:!userId?<div className="ms-local-note"><p>{t('Sign in to create group chats and invite participants.')}</p><a className="ms-outline" href="/login">{t('Sign in')}</a></div>:<p className="ms-local-note">{t('Private conversations, separate from Communities.')}<br/>{t('Group chats are stored in Supabase. Message updates refresh every five seconds.')}</p>}
   </div>
  </aside>
  <section className="group-conversation ms-chat">{!selected?<div className="ms-placeholder"><MessageSquare size={40}/>{!supabase?<span>{ui.unavailable}</span>:!userId?<><span>{t('Sign in to create group chats and invite participants.')}</span><a className="ms-outline" href="/login">{t('Sign in')}</a></>:<span>{t('Select a group to view messages.')}</span>}</div>:<>
   <header className="ms-head group-conversation-head"><button type="button" className="icon-button ms-back" onClick={()=>choose(null)} aria-label={t('Back')}><ArrowLeft size={24}/></button><button type="button" className="ms-who" onClick={()=>setShowInfo(!showInfo)} aria-label={t('Info')}><span className="ms-av"><span className="ms-av-logo group-server-avatar">{selected.title.slice(0,1).toUpperCase()}</span></span><span><strong>{selected.title}</strong><small>{t('{n} members',{n:members.length})}</small></span></button><div className="ms-head-actions"><button type="button" className="icon-button" onClick={()=>setShowInfo(!showInfo)} aria-label={t('Info')} aria-expanded={showInfo}><Info size={21}/></button></div></header>
   {errorNotice}
   <div ref={history} className="group-message-history ms-msgs">{conversationLoading&&<p role="status" className="ms-empty">{t('Loading…')}</p>}{hasOlder&&<button type="button" className="outline group-load-older" disabled={olderLoading} onClick={()=>void loadOlder()}>{t(olderLoading?'Loading…':'Load older messages')}</button>}{!conversationLoading&&messages.length===0&&<p className="muted ms-empty">{t('No messages yet. Start the conversation.')}</p>}{messages.map(message=><div className={'group-message '+(message.sender_id===userId?'mine':'other')} key={message.id}><small>{message.sender_id===userId?t('You'):message.sender_id.slice(0,8)}</small><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></div>)}</div>
   <div className="ms-compose"><form className="group-send" onSubmit={sendMessage}><div className="ms-field"><textarea rows={1} value={draft} maxLength={4000} onChange={e=>setDraft(e.target.value)} placeholder={t('Message the group...')} aria-label="Group message" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void sendMessage(e);}}}/></div><button className="ms-send" disabled={busy||!draft.trim()} type="submit" aria-label={t('Send')}><Send size={22}/></button></form></div>
  </>}</section>
  {selected&&showInfo&&<ResizeHandle pane="chatSide" edge="start" anchor="before" container=".ms" label="Resize profile panel" className="pane-wide-only"/>}
  {selected&&showInfo&&<aside className="ms-side group-info"><div className="ms-card group-info-card"><div className="group-info-heading"><h2>{ui.members}</h2><button type="button" className="icon-button" onClick={()=>setShowInfo(false)} aria-label={t('Close')}><X size={20}/></button></div><h3>{selected.title}</h3>{selected.description&&<p className="ms-note">{selected.description}</p>}<div className="group-member-row">{members.map(member=><span key={member.user_id} title={member.user_id}>{member.user_id===userId?t('You'):member.user_id.slice(0,8)} · {member.role}</span>)}</div>
   {members.some(member=>member.user_id===userId&&['owner','admin'].includes(member.role))&&<form className="group-invite" onSubmit={addMember}><label><span>{t('Add members')}</span><input aria-label="User ID to invite" placeholder="Participant UUID (from Supabase Auth)" value={invite} onChange={e=>setInvite(e.target.value)}/></label><button disabled={busy||!invite.trim()} className="ms-outline" type="submit"><UserPlus size={16}/>{t('Add')}</button></form>}
   <p className="ms-local-note">{t('To add a participant, an administrator needs their account UUID. End-to-end encryption is not implemented.')}</p></div></aside>}
  {creating&&<Sheet title={t('Create group')} onClose={()=>setCreating(false)} className="np"><form className="group-create" onSubmit={createGroup}><label>{t('Group name')}<input required minLength={3} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Design team"/></label><label>{t('Description (optional)')}<input maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="group-actions"><button type="button" className="ms-outline" onClick={()=>setCreating(false)}>{t('Cancel')}</button><button type="submit" className="np-cta" disabled={busy||title.trim().length<3}>{t('Create')}</button></div></form></Sheet>}
 </div>;
}
