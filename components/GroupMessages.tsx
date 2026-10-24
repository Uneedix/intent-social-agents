'use client';
import { useT } from './I18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';
import { useSession } from './SessionBoundary';
import { Plus, Send, Users, UserPlus, ArrowLeft, RefreshCw } from 'lucide-react';
type Group = { id:string; title:string; description:string|null; created_by:string; created_at:string };
type Member = { user_id:string; role:string };
type Message = { id:string; sender_id:string; body:string; created_at:string };
type DB = ReturnType<typeof createClient>;
const PAGE_SIZE = 100;
const chronological = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const mergeMessages = (old: Message[], next: Message[]) => [...new Map([...old, ...next].map(m => [m.id, m])).values()].sort(chronological);
export default function GroupMessages() {
 const {user,scope} = useSession();
 const [db] = useState<DB | null>(() => { try { return isSupabaseConfigured() ? createClient() : null; } catch { return null; } });
 if (!db) return <p role="alert">Supabase is not configured. Set the public environment variables.</p>;
 return <GroupMessagesSession key={scope} supabase={db} userId={user?.id || null} />;
}
function GroupMessagesSession({ supabase, userId }: { supabase: DB; userId: string | null }) {
 const t = useT();
 const [groups,setGroups]=useState<Group[]>([]);
 const [selected,setSelected]=useState<Group|null>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(!!userId);
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
 useEffect(() => { alive.current = true; return () => { alive.current = false; groupRequest.current++; conversationRequest.current++; }; }, []);
 const choose = (group: Group | null) => {
  selectionVersion.current++; selection.current = group?.id || null; conversationRequest.current++; olderBusy.current = false; oldest.current = null;
  setSelected(group); setMembers([]); setMessages([]); setDraft(''); setInvite(''); setError(''); setHasOlder(false); setOlderLoading(false); setConversationLoading(!!group); setBusy(false);
 };
 const refreshGroups=useCallback(async()=>{
  const request = ++groupRequest.current; setLoading(true);
  try {
   const {data,error}=await supabase.from('message_groups').select('id,title,description,created_by,created_at').order('created_at',{ascending:false}).order('id',{ascending:false});
   if (!alive.current || request !== groupRequest.current) return;
   if(error) setError(error.message); else setGroups((data||[]) as Group[]);
  } catch(e) { if (alive.current && request === groupRequest.current) setError(e instanceof Error ? e.message : 'Could not load groups'); }
  finally { if (alive.current && request === groupRequest.current) setLoading(false); }
 },[supabase]);
 const refreshConversation=useCallback(async(id:string)=>{
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
  if (!selected || !oldest.current || olderBusy.current || !hasOlder) return;
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
  e.preventDefault();if(title.trim().length < 3 || busy)return;
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
 async function addMember(e:React.FormEvent){e.preventDefault();if(!selected||!invite.trim()||busy)return;
  const id=selected.id;
  await mutate(()=>supabase.rpc('add_message_group_member',{p_group_id:id,p_user_id:invite.trim()}), async()=>{setInvite('');await refreshConversation(id);});
 }
 async function sendMessage(e:React.FormEvent){e.preventDefault();if(!selected||!draft.trim()||busy)return;
  const id=selected.id;
  await mutate(()=>supabase.from('message_group_messages').insert({group_id:id,body:draft.trim()}),async()=>{setDraft('');await refreshConversation(id);});
 }
 if(!userId)return <div className="group-messages"><h2>{t("Group chats")}</h2><p className="muted">{t("Sign in to create group chats and invite participants.")}</p><a href="/login" className="primary" style={{display:'inline-block',padding:'10px 16px',textDecoration:'none'}}>{t("Sign in")}</a></div>;
 return <div className="group-messages">
  <div className="group-messages-header"><div><h2><Users size={21}/> {t("Group chats")}</h2><p className="muted">{t("Private conversations, separate from Communities.")}</p></div><button className="primary" onClick={()=>setCreating(!creating)}><Plus size={17}/> {t("New group")}</button></div>
  {error&&<div role="alert" className="group-error">{error} <button onClick={()=>{setError('');if(selected)void refreshConversation(selected.id);else void refreshGroups();}}>{t("Retry")}</button> <button onClick={()=>setError('')}>{t("Dismiss")}</button></div>}
  {creating&&<form className="group-create" onSubmit={createGroup}><h3>{t("Create group")}</h3><label>{t("Group name")}<input required minLength={3} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Design team"/></label><label>{t("Description (optional)")}<input maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="group-actions"><button type="button" className="outline" onClick={()=>setCreating(false)}>{t("Cancel")}</button><button className="primary" disabled={busy||title.trim().length<3}>{t("Create")}</button></div></form>}
  <div className="group-messages-grid"><aside className="group-list"><div className="group-list-head"><strong>{t("Your groups")}</strong><button className="icon-button" onClick={()=>void refreshGroups()} aria-label="Refresh groups"><RefreshCw size={16}/></button></div>{loading?<p role="status">{t("Loading…")}</p>:groups.length===0?<p className="muted">{t("No groups yet. Create your first group.")}</p>:groups.map(g=><button key={g.id} className={'group-list-item '+(selected?.id===g.id?'current':'')} onClick={()=>choose(g)}><span className="group-avatar"><Users size={20}/></span><span><strong>{g.title}</strong><small>{g.description||t('Group conversation')}</small></span></button>)}</aside>
  <section className="group-conversation">{!selected?<div className="group-empty"><Users size={36}/><p>{t("Select a group to view messages.")}</p></div>:<><header className="group-conversation-head"><div><strong>{selected.title}</strong><small>{t('{n} members', { n: members.length })}</small></div><button className="outline" onClick={()=>choose(null)}><ArrowLeft size={16}/> {t("Back")}</button></header><div className="group-member-row">{members.map(m=><span key={m.user_id} title={m.user_id}>{m.user_id===userId?'You':m.user_id.slice(0,8)} · {m.role}</span>)}</div>{(members.some(m=>m.user_id===userId&&(m.role==='owner'||m.role==='admin')))&&<form className="group-invite" onSubmit={addMember}><UserPlus size={17}/><input aria-label="User ID to invite" placeholder="Participant UUID (from Supabase Auth)" value={invite} onChange={e=>setInvite(e.target.value)}/><button disabled={busy||!invite.trim()} className="outline">{t("Add")}</button></form>}
  <div className="group-message-history">{conversationLoading&&<p role="status">{t("Loading…")}</p>}{hasOlder&&<button className="outline" disabled={olderLoading} onClick={()=>void loadOlder()}>{t(olderLoading ? "Loading…" : "Load older messages")}</button>}{!conversationLoading&&messages.length===0&&<p className="muted">{t("No messages yet. Start the conversation.")}</p>}{messages.map(m=><div key={m.id} className={'group-message '+(m.sender_id===userId?'mine':'other')}><small>{m.sender_id===userId?'You':m.sender_id.slice(0,8)}</small><p>{m.body}</p><time>{new Date(m.created_at).toLocaleString()}</time></div>)}</div><form className="group-send" onSubmit={sendMessage}><input value={draft} maxLength={4000} onChange={e=>setDraft(e.target.value)} placeholder={t("Message the group...")} aria-label="Group message"/><button disabled={busy||!draft.trim()} type="submit" aria-label={t("Send")}><Send size={19}/></button></form></>}</section></div>
  <p className="disclaimer">Group chats are stored in Supabase and restricted to members by RLS. To add a participant in this first version, an administrator needs their account UUID. Message updates refresh every five seconds. End-to-end encryption is not implemented.</p>
 </div>;
}
