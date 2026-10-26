'use client';
import MessageListHeader from './MessageListHeader';
import {GroupPins} from './MessagePins';
import { useT } from './I18n';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '../lib/supabase/client';
import { useSession } from './SessionBoundary';
import ResizeHandle from './ResizeHandle';
import { Plus, Send, Users, UserPlus, ArrowLeft, RefreshCw, Info, Search } from 'lucide-react';
import { Button } from './ui';
import CreateGroupModal, { AddMembersModal, type GroupDraft } from './groups/CreateGroupModal';
import GroupInfoModal, { type InfoMember, type GroupProfile } from './groups/GroupInfoModal';
import { TopicList, TopicBar, TopicModal, ClosedTopic, type TopicRow } from './groups/Topics';
import { GroupAvatar } from './groups/parts';
import { canManage, readSeen, writeSeen, sortTopics } from './groups/model';
import type {Chat} from '../lib/data';
import type { GroupRole } from '../lib/data';
import gs from './groups/groups.module.css';
type Group = { id:string; title:string; description:string|null; created_by:string; created_at:string; avatar_url?:string|null; avatar_color?:number|null; topics_enabled?:boolean|null };
type Member = { user_id:string; role:string };
type Message = { id:string; sender_id:string; body:string; created_at:string; topic_id?:string|null };
type Topic = { id:string; title:string; icon:string; color:number; is_general:boolean; closed:boolean; pinned:boolean };
type DB = ReturnType<typeof createClient>;
type Schema = 'unknown' | 'v2' | 'legacy';
const PAGE_SIZE = 100;
const OVERVIEW_SIZE = 300;
const GROUP_COLUMNS = 'id,title,description,created_by,created_at';
const GROUP_COLUMNS_V2 = GROUP_COLUMNS + ',avatar_url,avatar_color,topics_enabled';
const chronological = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const mergeMessages = (old: Message[], next: Message[]) => [...new Map([...old, ...next].map(m => [m.id, m])).values()].sort(chronological);
/** The 20261025110000 migration adds columns/tables; until it is applied PostgREST reports them missing. */
const missingSchema = (e: { code?: string; message?: string } | null | undefined) => !!e && (['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST202'].includes(e.code || '') || /does not exist|schema cache|could not find/i.test(e.message || ''));
const short = (id: string) => id.slice(0, 8);

type Props={modeSwitch?:ReactNode;onHome?:()=>void;localGroups?:Chat[];onOpenLocalGroup?:(id:string)=>void};
export default function GroupMessages({modeSwitch,onHome,localGroups,onOpenLocalGroup}:Props={}) {
 const {user,scope} = useSession();
 const [db] = useState<DB | null>(() => { try { return isSupabaseConfigured() ? createClient() : null; } catch { return null; } });
 if (!db) return <GuestGroups modeSwitch={modeSwitch} onHome={onHome} localGroups={localGroups} onOpenLocalGroup={onOpenLocalGroup}/>;
 return <GroupMessagesSession key={scope} supabase={db} userId={user?.id || null} modeSwitch={modeSwitch} onHome={onHome} localGroups={localGroups} onOpenLocalGroup={onOpenLocalGroup} />;
}
function GroupMessagesSession({ supabase, userId, modeSwitch, onHome, localGroups=[], onOpenLocalGroup }: { supabase: DB; userId: string | null }&Props) {
 const t = useT();
 const [groups,setGroups]=useState<Group[]>([]);
 const [schema,setSchema]=useState<Schema>('unknown');
 const [selected,setSelected]=useState<Group|null>(null);
 const [members,setMembers]=useState<Member[]>([]);
 const [topics,setTopics]=useState<Topic[]>([]);
 const [overview,setOverview]=useState<Message[]>([]);
 const [topic,setTopic]=useState<string|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(!!userId);
 const [conversationLoading,setConversationLoading]=useState(false);
 const [olderLoading,setOlderLoading]=useState(false);
 const [hasOlder,setHasOlder]=useState(false);
 const [error,setError]=useState('');
 const [modalError,setModalError]=useState('');
 const [creating,setCreating]=useState(false);
 const [info,setInfo]=useState(false);
 const [adding,setAdding]=useState(false);
 const [topicEdit,setTopicEdit]=useState<TopicRow|'new'|null>(null);
 const [find,setFind]=useState<string|null>(null);
 const [pinTarget,setPinTarget]=useState<Message|null>(null);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [seen,setSeen]=useState<Record<string,string>>({});
 const [phone,setPhone]=useState(false);
 const alive = useRef(true);
 const groupRequest = useRef(0);
 const conversationRequest = useRef(0);
 const metaRequest = useRef(0);
 const selection = useRef<string | null>(null);
 const selectionVersion = useRef(0);
 const olderBusy = useRef(false);
 const oldest = useRef<Message | null>(null);
 const topicKey = useRef<string | null>(null);
 useEffect(() => { const counters=[groupRequest,conversationRequest,metaRequest];alive.current = true; return () => { alive.current = false; counters.forEach(counter=>counter.current++); }; }, []);
 useEffect(() => { if (userId) setSeen(readSeen(userId)); }, [userId]);
 useEffect(() => { const mq = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 900px)') : undefined; if (!mq) return; const on = () => setPhone(mq.matches); on(); mq.addEventListener?.('change', on); return () => mq.removeEventListener?.('change', on); }, []);
 const v2 = schema === 'v2';
 const topicsOn = v2 && !!selected?.topics_enabled;
 const general = topics.find(x => x.is_general) || null;
 const activeTopicId = topicsOn ? (topics.some(x => x.id === topic) ? topic : general?.id || null) : null;
 const activeTopic = topics.find(x => x.id === activeTopicId) || null;
 const myRole = (members.find(m => m.user_id === userId)?.role || null) as GroupRole | null;
 const admin = canManage(myRole);
 const upgradeNote = t('Group photos, topics and member management need a database upgrade that has not been applied yet. Basic group chats keep working.');

 const resetConversation = () => { conversationRequest.current++; olderBusy.current = false; oldest.current = null; setMessages([]); setHasOlder(false); setOlderLoading(false); setFind(null); };
 const choose = (group: Group | null) => {
  selectionVersion.current++; selection.current = group?.id || null; metaRequest.current++; topicKey.current = null; resetConversation();
  setPinTarget(null);setSelected(group); setMembers([]); setTopics([]); setOverview([]); setTopic(null); setDraft(''); setError(''); setConversationLoading(!!group); setBusy(false); setInfo(false); setAdding(false); setTopicEdit(null);
 };
 const refreshGroups=useCallback(async(selectId?: string)=>{
  const request = ++groupRequest.current; setLoading(true);
  try {
   const load = async (columns: string) => { const r = await supabase.from('message_groups').select(columns).order('created_at',{ascending:false}).order('id',{ascending:false}); return { data: r.data as unknown as Group[] | null, error: r.error }; };
   let result = await load(GROUP_COLUMNS_V2);
   let detected: Schema = 'v2';
   if (result.error && missingSchema(result.error)) { detected = 'legacy'; result = await load(GROUP_COLUMNS); }
   if (!alive.current || request !== groupRequest.current) return;
   if(result.error) setError(result.error.message); else {
    const list = result.data||[]; setSchema(detected); setGroups(list);
    // keep the open group's profile (name/photo/topics flag) fresh after edits
    setSelected(cur => cur ? list.find(g => g.id === cur.id) || cur : cur);
    if (selectId) { const g = list.find(x => x.id === selectId); if (g) choose(g); }
   }
  } catch(e) { if (alive.current && request === groupRequest.current) setError(e instanceof Error ? e.message : 'Could not load groups'); }
  finally { if (alive.current && request === groupRequest.current) setLoading(false); }
 },[supabase]); // eslint-disable-line react-hooks/exhaustive-deps

 /** Members, plus topics and a recent overview (last message / unread per topic) when topics are on. */
 const refreshMeta=useCallback(async(group: Group, withTopics: boolean)=>{
  const id = group.id, request = ++metaRequest.current;
  const current = () => alive.current && selection.current === id && request === metaRequest.current;
  try {
   const [p,tp,ov]=await Promise.all([
    supabase.from('message_group_members').select('user_id,role').eq('group_id',id),
    withTopics ? supabase.from('message_group_topics').select('id,title,icon,color,is_general,closed,pinned').eq('group_id',id) : Promise.resolve({data:null,error:null}),
    withTopics ? supabase.from('message_group_messages').select('id,sender_id,body,created_at,topic_id').eq('group_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(OVERVIEW_SIZE) : Promise.resolve({data:null,error:null}),
   ]);
   if (!current()) return;
   const failure = p.error || tp.error || ov.error;
   if (failure) { if (missingSchema(failure)) setSchema('legacy'); setError(failure.message); return; }
   setMembers((p.data||[]) as Member[]);
   if (withTopics) { setTopics((tp.data||[]) as Topic[]); setOverview((ov.data||[]) as Message[]); }
  } catch(e) { if(current()) setError(e instanceof Error ? e.message : 'Could not load conversation'); }
 },[supabase]);

 const refreshConversation=useCallback(async(id:string, topicId: string | null)=>{
  const request = ++conversationRequest.current;
  const current = () => alive.current && selection.current === id && topicKey.current === topicId && request === conversationRequest.current;
  try {
   let query = supabase.from('message_group_messages').select(topicId ? 'id,sender_id,body,created_at,topic_id' : 'id,sender_id,body,created_at').eq('group_id',id);
   if (topicId) query = query.eq('topic_id', topicId);
   const m = await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
   if (!current()) return;
   if(m.error) { setError(m.error.message); setMessages([]);oldest.current=null;setHasOlder(false); return; }
   const next = (m.data || []) as unknown as Message[];
   setMessages(old => mergeMessages(old, next));
   if (!oldest.current) { oldest.current = [...next].sort(chronological)[0] || null; setHasOlder(next.length === PAGE_SIZE); }
   setError('');
  } catch(e) { if(current()) setError(e instanceof Error ? e.message : 'Could not load conversation'); }
  finally { if(current()) setConversationLoading(false); }
 },[supabase]);
 async function loadOlder() {
  if (!selected || !oldest.current || olderBusy.current || !hasOlder) return;
  const id = selected.id, topicId = topicKey.current, cursor = oldest.current, version = selectionVersion.current; olderBusy.current = true; setOlderLoading(true);
  const current = () => alive.current && selection.current === id && topicKey.current === topicId && selectionVersion.current === version && oldest.current === cursor;
  try {
   let query = supabase.from('message_group_messages').select('id,sender_id,body,created_at').eq('group_id',id);
   if (topicId) query = query.eq('topic_id', topicId);
   const { data, error } = await query
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
 useEffect(()=>{if(!selected)return;void refreshMeta(selected,topicsOn);
  const timer=setInterval(()=>{void refreshMeta(selected,topicsOn)},5000);
  return()=>clearInterval(timer);
 },[selected,topicsOn,refreshMeta]);
 // Messages for the open conversation (the active topic when topics are on).
 const convKey = selected ? (topicsOn ? (activeTopicId ? selected.id + '|' + activeTopicId : null) : selected.id) : null;
 useEffect(()=>{
  if(!selected||!convKey)return;
  const topicId = topicsOn ? activeTopicId : null;
  if (topicKey.current !== topicId) { topicKey.current = topicId; resetConversation(); }
  void refreshConversation(selected.id, topicId);
  const timer=setInterval(()=>{void refreshConversation(selected.id, topicId)},5000);
  return()=>clearInterval(timer);
 },[convKey,refreshConversation]); // eslint-disable-line react-hooks/exhaustive-deps
 // Remember what this viewer has read in each topic (unread badges; browser storage only).
 const newest = messages[messages.length - 1]?.created_at;
 useEffect(()=>{
  // On phones the topic list hides the chat, so nothing counts as read until a topic is opened.
  if(!userId||!activeTopicId||!newest||(phone&&topic===null))return;
  setSeen(cur=>{ if((cur[activeTopicId]||'')>=newest)return cur; const next={...cur,[activeTopicId]:newest}; writeSeen(userId,next); return next; });
 },[userId,activeTopicId,newest,topic,phone]);

 async function mutate(action: () => PromiseLike<{error: {message:string} | null}>, after: () => Promise<void> | void, target: 'page' | 'modal' = 'page') {
  const id = selection.current, version = selectionVersion.current; setBusy(true); setError(''); setModalError('');
  const fail = target === 'modal' ? setModalError : setError;
  try { const { error } = await action(); if (!alive.current || selection.current !== id || selectionVersion.current !== version) return; if(error) throw Error(error.message); await after(); }
  catch(e) { if(alive.current && selection.current === id && selectionVersion.current === version) fail(e instanceof Error ? e.message : 'Operation failed'); }
  finally { if(alive.current && selection.current === id && selectionVersion.current === version) setBusy(false); }
 }
 async function createGroup(d: GroupDraft){
  if(d.name.length < 3 || busy)return;
  const version=selectionVersion.current;setBusy(true);setModalError('');
  try {
   const ids = d.members.map(m => m.id);
   let newId: string;
   if (v2) {
    const {data,error}=await supabase.rpc('create_message_group_v2',{p_title:d.name,p_description:d.description,p_avatar_url:d.avatar||null,p_avatar_color:d.color,p_topics_enabled:d.topics,p_member_ids:ids});
    if(error)throw Error(error.message); newId = data as string;
   } else {
    const {data,error}=await supabase.rpc('create_message_group',{p_title:d.name,p_description:d.description});
    if(error)throw Error(error.message); newId = data as string;
    for (const uid of ids) { const r = await supabase.rpc('add_message_group_member',{p_group_id:newId,p_user_id:uid}); if (r.error) throw Error(r.error.message); }
   }
   if(!alive.current||version!==selectionVersion.current)return;
   setCreating(false); await refreshGroups(newId);
  }catch(e){if(alive.current&&version===selectionVersion.current)setModalError(e instanceof Error?e.message:'Could not create group');}
  finally{if(alive.current)setBusy(false);}
 }
 async function sendMessage(e:React.FormEvent){e.preventDefault();if(!selected||!draft.trim()||busy||activeTopic?.closed)return;
  const id=selected.id, topicId = topicsOn ? activeTopicId : null;
  await mutate(()=>supabase.from('message_group_messages').insert(topicId ? {group_id:id,body:draft.trim(),topic_id:topicId} : {group_id:id,body:draft.trim()}),async()=>{setDraft('');await refreshConversation(id, topicId); if (topicsOn) await refreshMeta(selected, true);});
 }
 const saveProfile = async (pr: GroupProfile) => { if (selected) await mutate(() => supabase.rpc('update_message_group', { p_group_id: selected.id, p_title: pr.name, p_description: pr.description, p_avatar_url: pr.avatar || null, p_avatar_color: pr.color, p_topics_enabled: pr.topicsEnabled }), async () => { await refreshGroups(); }, 'modal'); };
 const saveTopic = (v: { title: string; icon: string; color: number }) => { if (!selected) return;
  const editing = topicEdit && topicEdit !== 'new' ? topics.find(x => x.id === topicEdit.id) : null;
  void mutate(() => editing ? supabase.rpc('update_message_group_topic', { p_topic_id: editing.id, p_title: v.title, p_icon: v.icon, p_color: v.color, p_closed: editing.closed, p_pinned: editing.pinned })
   : supabase.rpc('create_message_group_topic', { p_group_id: selected.id, p_title: v.title, p_icon: v.icon, p_color: v.color }), async () => { setTopicEdit(null); await refreshMeta(selected, true); }, 'modal'); };
 const patchTopic = (x: Topic, patch: Partial<Pick<Topic,'closed'|'pinned'>>) => selected && void mutate(() => supabase.rpc('update_message_group_topic', { p_topic_id: x.id, p_title: x.title, p_icon: x.icon, p_color: x.color, p_closed: patch.closed ?? x.closed, p_pinned: patch.pinned ?? x.pinned }), () => refreshMeta(selected, true));

 const topicRows: TopicRow[] = useMemo(() => sortTopics(topics.map(x => {
  const inTopic = overview.filter(m => m.topic_id === x.id);
  const last = inTopic[0]; const lastSeen = seen[x.id] || '';
  return { id: x.id, title: x.title, icon: x.icon, color: x.color, general: x.is_general, closed: x.closed, pinned: x.pinned,
   last: last?.body, lastWho: last ? (last.sender_id === userId ? t('You') : short(last.sender_id)) : undefined, lastAt: last ? Date.parse(last.created_at) : undefined,
   unread: inTopic.filter(m => m.sender_id !== userId && m.created_at > lastSeen && x.id !== activeTopicId).length };
 }), r => r.lastAt || 0), [topics, overview, seen, userId, activeTopicId, t]);
 const infoMembers: InfoMember[] = members.map(m => ({ id: m.user_id, name: m.user_id === userId ? t('You') : short(m.user_id), sub: m.user_id, role: (m.role as GroupRole) || 'member', you: m.user_id === userId }));
 const [query,setQuery]=useState('');
 const shown = find ? messages.filter(m => m.body.toLowerCase().includes(find.toLowerCase())) : messages;

 const [groupFilter,setGroupFilter]=useState<'all'|'created'>('all');
 const heading=<MessageListHeader modeSwitch={modeSwitch} onHome={onHome} onNew={()=>{setModalError('');setCreating(true);}} newLabel={t('New group')} disabled={!userId}/>;
 const localList=localGroups.length>0&&<div className="group-local-list"><small>{t('On this device')}</small>{localGroups.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())).map(g=><button type="button" className="group-list-item ms-item" key={g.id} onClick={()=>onOpenLocalGroup?.(g.id)}><GroupAvatar name={g.name} src={g.avatar} color={g.color} size={52}/><span className="ms-mid"><strong>{g.name}</strong><small>{t('On this device')}</small></span></button>)}</div>;
 if(!userId)return <GuestGroups modeSwitch={modeSwitch} onHome={onHome} localGroups={localGroups} onOpenLocalGroup={onOpenLocalGroup}/>;
 const history = <>
  {selected&&<GroupPins key={selected.id} db={supabase} groupId={selected.id} userId={userId} admin={admin} target={pinTarget} onClose={()=>setPinTarget(null)} onOpen={(id,targetTopic)=>{if(targetTopic)setTopic(targetTopic);document.getElementById('group-message-'+id)?.scrollIntoView({block:'center',behavior:'smooth'});}}/>}
  {find!=null&&<div className="ms-find gm-find"><input autoFocus value={find} onChange={e=>setFind(e.target.value)} placeholder={t(topicsOn?'Search in this topic':'Search in this chat')} aria-label={t(topicsOn?'Search in this topic':'Search in this chat')}/><span>{find?shown.length:''}</span><Button variant="ghost" size="sm" onClick={()=>setFind(null)}>{t('Close')}</Button></div>}
  <div className="group-message-history ms-msgs">{conversationLoading&&<p role="status">{t("Loading…")}</p>}{hasOlder&&<Button size="sm" disabled={olderLoading} onClick={()=>void loadOlder()} className="gm-older">{t(olderLoading ? "Loading…" : "Load older messages")}</Button>}{!conversationLoading&&shown.length===0&&<p className="muted gm-empty">{t(find?'No messages match your search.':"No messages yet. Start the conversation.")}</p>}{shown.map(m=><div id={"group-message-"+m.id} key={m.id} className={'group-message '+(m.sender_id===userId?'mine':'other')}><small>{m.sender_id===userId?t('You'):short(m.sender_id)}</small><p>{m.body}</p><button type="button" className="group-pin-action" aria-label={t("Pin")} onClick={()=>setPinTarget(m)}>⌖</button><time>{new Date(m.created_at).toLocaleString()}</time></div>)}</div>
  {activeTopic?.closed ? <ClosedTopic manage={admin} onReopen={()=>patchTopic(activeTopic,{closed:false})}/> : <div className="ms-compose"><form className="group-send" onSubmit={sendMessage}><div className="ms-field"><input value={draft} maxLength={4000} onChange={e=>setDraft(e.target.value)} placeholder={t(topicsOn?"Message the topic...":"Message the group...")} aria-label="Group message"/></div><button className="ms-send" disabled={busy||!draft.trim()} type="submit" aria-label={t("Send")}><Send size={19}/></button></form></div>}
 </>;
 return <div className="group-messages gm-unified">
  {schema==='legacy'&&<p className="gm-upgrade" role="status">{upgradeNote}</p>}
  {error&&<div role="alert" className="group-error">{error} <button onClick={()=>{setError('');if(selected)void refreshMeta(selected,topicsOn);else void refreshGroups();}}>{t("Retry")}</button> <button onClick={()=>setError('')}>{t("Dismiss")}</button></div>}
  <div className={'ms ms-groups group-messages-grid'+(selected?' gm-has-group has-chat':'')}><aside className="group-list ms-list"><ResizeHandle pane="groupList" edge="end" container=".group-messages-grid" label="Resize group list" />{heading}
   <div className="ms-search-row"><label className="ms-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Search messages...')} aria-label={t('Search groups')}/></label><button type="button" className="ms-new ms-hide-m" onClick={()=>{setModalError('');setCreating(true);}} aria-label={t('New group')}><Plus size={21}/></button></div>
   <div className="ms-chips gm-list-filters"><button type="button" className={groupFilter==='all'?'on':''} onClick={()=>setGroupFilter('all')}>{t('All')}</button><button type="button" className={groupFilter==='created'?'on':''} onClick={()=>setGroupFilter('created')}>{t('Created by me')}</button><button type="button" className="icon-button gm-refresh" onClick={()=>void refreshGroups()} aria-label={t('Refresh groups')}><RefreshCw size={16}/></button></div>
   <div className="ms-chats">{loading?<p role="status">{t('Loading…')}</p>:groups.length===0?<p className="muted ms-note">{t('No groups yet. Create your first group.')}</p>:groups.filter(g=>(groupFilter==='all'||g.created_by===userId)&&g.title.toLowerCase().includes(query.toLowerCase())).map(g=><button key={g.id} className={'group-list-item ms-item '+(selected?.id===g.id?'current on':'')} onClick={()=>choose(g)}><GroupAvatar name={g.title} src={g.avatar_url} color={g.avatar_color} size={52}/><span className="ms-mid"><strong>{g.title}</strong><small>{g.description||t(g.topics_enabled?'Group with topics':'Group conversation')}</small></span></button>)}{localList}</div><p className="ms-local-note gm-storage-note">{t('Group messages sync between members. End-to-end encryption is not available.')}</p></aside>
  <section className="group-conversation ms-chat">{!selected?<div className="group-empty ms-placeholder"><Users size={36}/><p>{t("Select a group to view messages.")}</p></div>:<>
   <header className="group-conversation-head ms-head">
    <button className="gm-back ms-back icon-button" onClick={()=>choose(null)} aria-label={t("Back")}><ArrowLeft size={18}/></button>
    <button className="gm-who ms-who" onClick={()=>{setModalError('');setInfo(true);}} aria-label={t('Group info')}><GroupAvatar name={selected.title} src={selected.avatar_url} color={selected.avatar_color} size={44}/><span><strong>{selected.title}</strong><small>{t('{n} members', { n: members.length })}{topicsOn?' · '+t('{n} topics',{n:topics.length}):''}</small></span></button>
    <span className="gm-head-actions ms-head-actions">
     {!topicsOn&&<Button variant="ghost" icon onClick={()=>setFind(find==null?'':null)} aria-label={t('Search in this chat')}><Search size={19}/></Button>}
     {admin&&<Button variant="ghost" icon onClick={()=>{setModalError('');setAdding(true);}} aria-label={t('Add members')}><UserPlus size={19}/></Button>}
     <Button variant="ghost" icon onClick={()=>{setModalError('');setInfo(true);}} aria-label={t('Group info')}><Info size={19}/></Button>
    </span>
   </header>
   {topicsOn ? <div className={gs.split+(topic===null?' '+gs.listMode:'')}>
     <div className={gs.rail}><TopicList topics={topicRows} active={topic===null?null:activeTopicId} onOpen={id=>{setTopic(id);}} manage={admin} onNew={()=>{setModalError('');setTopicEdit('new');}}/></div>
     <div className={gs.pane}>{activeTopic&&<TopicBar topic={topicRows.find(x=>x.id===activeTopic.id)||{...activeTopic,general:activeTopic.is_general}} onBack={()=>setTopic(null)} manage={admin} onEdit={()=>{setModalError('');setTopicEdit(topicRows.find(x=>x.id===activeTopic.id)||null);}} onClosed={closed=>patchTopic(activeTopic,{closed})} onPin={pinned=>patchTopic(activeTopic,{pinned})} onSearch={()=>setFind('')}/>}{activeTopic ? history : <p className="muted gm-empty" role="status">{t('Loading…')}</p>}</div>
    </div> : history}
  </>}</section></div>

  {creating&&<CreateGroupModal candidates={[]} manual minMembers={0} busy={busy} error={modalError} unavailable={v2?undefined:upgradeNote} onClose={()=>setCreating(false)} onCreate={createGroup}
   note={t('Your account ID (share it so others can add you): {id}',{id:userId})}/>}
  {adding&&selected&&<AddMembersModal candidates={[]} manual exclude={members.map(m=>m.user_id)} busy={busy} error={modalError} onClose={()=>setAdding(false)}
   onAdd={people=>mutate(async()=>{for(const p of people){const r=await supabase.rpc('add_message_group_member',{p_group_id:selected.id,p_user_id:p.id});if(r.error)return r;}return{error:null};},async()=>{setAdding(false);await refreshMeta(selected,topicsOn);},'modal')}/>}
  {info&&selected&&<GroupInfoModal name={selected.title} description={selected.description||''} avatar={selected.avatar_url||''} color={selected.avatar_color??0} topicsEnabled={!!selected.topics_enabled} myRole={myRole} members={infoMembers}
   busy={busy} error={modalError} unavailable={v2?undefined:upgradeNote} note={v2?undefined:upgradeNote}
   onClose={()=>setInfo(false)}
   onSave={v2&&admin?saveProfile:undefined}
   onAddMembers={admin?()=>{setInfo(false);setAdding(true);}:undefined}
   onInvite={()=>{void navigator.clipboard?.writeText(userId).catch(()=>{});setModalError(t('Invite links are not available yet. Your account ID was copied — participants share theirs with an admin, who adds them.'));}}
   onRole={v2?(m,role)=>void mutate(()=>supabase.rpc('set_message_group_member_role',{p_group_id:selected.id,p_user_id:m.id,p_role:role}),()=>refreshMeta(selected,topicsOn),'modal'):undefined}
   onRemove={v2?m=>{if(confirm(t('Remove {name} from the group?',{name:m.name})))void mutate(()=>supabase.rpc('remove_message_group_member',{p_group_id:selected.id,p_user_id:m.id}),()=>refreshMeta(selected,topicsOn),'modal');}:undefined}
   onLeave={v2?()=>{if(confirm(t('Leave this group? You will lose access to its messages.')))void mutate(()=>supabase.rpc('leave_message_group',{p_group_id:selected.id}),async()=>{choose(null);await refreshGroups();},'modal');}:undefined}
   onDelete={v2?()=>{if(confirm(t('Delete this group for all members? This cannot be undone.')))void mutate(()=>supabase.rpc('delete_message_group',{p_group_id:selected.id}),async()=>{choose(null);await refreshGroups();},'modal');}:undefined}/>}
  {topicEdit&&selected&&<TopicModal initial={topicEdit==='new'?undefined:topicEdit} busy={busy} error={modalError} onClose={()=>setTopicEdit(null)} onSave={saveTopic}/>}
 </div>;
}

function GuestGroups({modeSwitch,onHome,localGroups=[],onOpenLocalGroup}:Props){
 const t=useT();const[query,setQuery]=useState('');
 return <div className="group-messages gm-unified"><div className="ms ms-groups group-messages-grid"><aside className="group-list ms-list"><MessageListHeader modeSwitch={modeSwitch} onHome={onHome} onNew={()=>{}} newLabel={t('New group')} disabled/>
  <div className="ms-search-row"><label className="ms-search"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('Search messages...')} aria-label={t('Search groups')}/></label><a className="ms-new ms-hide-m" href="/login" aria-label={t('New group')}><Plus size={21}/></a></div>
  <div className="ms-chips"><button type="button" className="on">{t('All')}</button></div><div className="ms-chats">{localGroups.filter(g=>g.name.toLowerCase().includes(query.toLowerCase())).map(g=><button type="button" className="group-list-item ms-item" key={g.id} onClick={()=>onOpenLocalGroup?.(g.id)}><GroupAvatar name={g.name} src={g.avatar} color={g.color} size={52}/><span className="ms-mid"><strong>{g.name}</strong><small>{t('On this device')}</small></span></button>)}<p className="muted ms-note">{t('Sign in to create group chats and invite participants.')}</p><a href="/login" className="pill-btn">{t('Sign in')}</a></div>
 </aside><section className="group-conversation ms-chat"><div className="group-empty ms-placeholder"><Users size={36}/><p>{t('Select a group to view messages.')}</p></div></section></div></div>;
}
