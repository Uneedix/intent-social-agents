'use client';
import { useT } from './I18n';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createClient,isSupabaseConfigured} from '../lib/supabase/client';
import {useSession} from './SessionBoundary';
import type {User} from '@supabase/supabase-js';

type Community={id:string;owner_id:string;name:string;description:string;privacy:'public'|'request'|'private';channels_enabled:boolean;posting_permission:'members'|'staff';comments_permission:string;cover_url:string|null;avatar_url:string|null};
type Member={user_id:string;role:string};
type Post={id:string;body:string;author_id:string;created_at:string};
type Channel={id:string;name:string;category:string};
type Msg={id:string;body:string;author_id:string;created_at:string};
type DB = ReturnType<typeof createClient>;
const PAGE_SIZE = 100;
const chronological = (a: Msg, b: Msg) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const mergeMessages = (old: Msg[], next: Msg[]) => [...new Map([...old,...next].map(m=>[m.id,m])).values()].sort(chronological);
export default function Communities() {
 const {user,scope}=useSession();
 const [db]=useState<DB|null>(()=>{try{return isSupabaseConfigured()?createClient():null;}catch{return null;}});
 if(!db)return <p role="alert">Supabase is not configured. Set the public environment variables.</p>;
 return <CommunitiesSession key={scope} db={db} user={user}/>;
}
function CommunitiesSession({db,user}:{db:DB;user:User|null}){
 const t = useT();
 const [items,setItems]=useState<Community[]>([]),[selected,setSelected]=useState<Community|null>(null);
 const [form,setForm]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[privacy,setPrivacy]=useState<Community['privacy']>('public'),[channelsEnabled,setChannelsEnabled]=useState(false),[posting,setPosting]=useState<Community['posting_permission']>('members');
 const [tab,setTab]=useState<'feed'|'channels'|'members'>('feed'),[members,setMembers]=useState<Member[]>([]),[posts,setPosts]=useState<Post[]>([]),[channels,setChannels]=useState<Channel[]>([]),[requests,setRequests]=useState<{user_id:string;status:string}[]>([]),[messageList,setMessageList]=useState<Msg[]>([]);
 const [postDraft,setPostDraft]=useState(''),[channelName,setChannelName]=useState(''),[activeChannel,setActiveChannel]=useState<string|null>(null),[messageDraft,setMessageDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true),[detailsLoading,setDetailsLoading]=useState(false),[messagesLoading,setMessagesLoading]=useState(false),[olderLoading,setOlderLoading]=useState(false),[hasOlder,setHasOlder]=useState(false);
 const selectionVersion=useRef(0);
 const alive=useRef(true),listRequest=useRef(0),detailsRequest=useRef(0),channelRequest=useRef(0);
 const selection=useRef<string|null>(null),channelSelection=useRef<string|null>(null),oldest=useRef<Msg|null>(null),olderBusy=useRef(false);
 useEffect(()=>{const counters=[listRequest,detailsRequest,channelRequest];alive.current=true;return()=>{alive.current=false;counters.forEach(counter=>counter.current++);};},[]);
 const choose=(community:Community|null)=>{
  selectionVersion.current++;selection.current=community?.id||null;channelSelection.current=null;detailsRequest.current++;channelRequest.current++;oldest.current=null;olderBusy.current=false;
  setSelected(community);setMembers([]);setPosts([]);setChannels([]);setRequests([]);setMessageList([]);setActiveChannel(null);setPostDraft('');setChannelName('');setMessageDraft('');setError('');setTab('feed');setHasOlder(false);setOlderLoading(false);setMessagesLoading(false);setDetailsLoading(!!community);setBusy(false);
 };
 const reload=useCallback(async()=>{
  const request=++listRequest.current;setLoading(true);
  try{const {data,error}=await db.from('communities').select('*').order('created_at',{ascending:false}).order('id',{ascending:false});if(!alive.current||request!==listRequest.current)return;if(error)setError(error.message);else setItems(data||[]);}
  catch(e){if(alive.current&&request===listRequest.current)setError(e instanceof Error?e.message:'Could not load communities');}
  finally{if(alive.current&&request===listRequest.current)setLoading(false);}
 },[db]);
 const loadDetails=useCallback(async(c:Community)=>{
  const request=++detailsRequest.current;setDetailsLoading(true);
  const current=()=>alive.current&&selection.current===c.id&&request===detailsRequest.current;
  try{
   const [a,b,d,e]=await Promise.all([db.from('community_members').select('user_id,role').eq('community_id',c.id),db.from('community_posts').select('id,body,author_id,created_at').eq('community_id',c.id).order('created_at',{ascending:false}).order('id',{ascending:false}),db.from('community_channels').select('id,name,category').eq('community_id',c.id),db.from('community_join_requests').select('user_id,status').eq('community_id',c.id).eq('status','pending')]);
   if(!current())return;
   const errors=[a.error,b.error,d.error,e.error].filter(Boolean);
   if(errors.length){setError(errors.map(e=>e!.message).join('; '));setMembers([]);setPosts([]);setChannels([]);setRequests([]);channelSelection.current=null;channelRequest.current++;setMessageList([]);setActiveChannel(null);setMessageDraft('');setHasOlder(false);return;}
   setMembers(a.data||[]);setPosts(b.data||[]);setChannels(d.data||[]);setRequests(e.data||[]);setError('');
  }catch(e){if(current()){setError(e instanceof Error?e.message:'Could not load community details');setMembers([]);setPosts([]);setChannels([]);setRequests([]);channelSelection.current=null;channelRequest.current++;setMessageList([]);setActiveChannel(null);setMessageDraft('');setHasOlder(false);}}
  finally{if(current())setDetailsLoading(false);}
 },[db]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{if(selected)void loadDetails(selected);},[selected,loadDetails]);
 const perform=async(fn:(current:()=>boolean)=>Promise<void>)=>{
  if(busy)return;const id=selection.current,version=selectionVersion.current;const current=()=>alive.current&&selection.current===id&&selectionVersion.current===version;
  setBusy(true);setError('');try{await fn(current);}catch(e){if(current())setError(e&&typeof e==='object'&&'message' in e?String(e.message):'Something went wrong.');}finally{if(current())setBusy(false);}
 };
 const create=()=>perform(async(current)=>{if(!user)throw Error('Log in to create a community');const {data,error}=await db.from('communities').insert({owner_id:user.id,name:name.trim(),description:description.trim(),privacy,channels_enabled:channelsEnabled,posting_permission:posting}).select('*').single();if(!current())return;if(error)throw error;setForm(false);setName('');setDescription('');choose(data);setBusy(false);await reload();});
 const update=async(patch:Partial<Community>)=>perform(async(current)=>{if(!selected)return;const {data,error}=await db.from('communities').update(patch).eq('id',selected.id).select('*').single();if(!current())return;if(error)throw error;setSelected(data);if(!data.channels_enabled){channelSelection.current=null;channelRequest.current++;setActiveChannel(null);setMessageList([]);setMessageDraft('');setHasOlder(false);}await reload();});
 const join=()=>perform(async(current)=>{if(!user||!selected)throw Error('Log in first');if(selected.privacy==='private')throw Error('This community requires an invitation');
  const result=selected.privacy==='public'
   ?await db.from('community_members').insert({community_id:selected.id,user_id:user.id,role:'member'})
   :await db.from('community_join_requests').upsert({community_id:selected.id,user_id:user.id,status:'pending'},{onConflict:'community_id,user_id',ignoreDuplicates:true});
  if(!current())return;if(result.error)throw result.error;await loadDetails(selected);
 });
 const publish=()=>perform(async(current)=>{if(!user||!selected)return;const {error}=await db.from('community_posts').insert({community_id:selected.id,author_id:user.id,body:postDraft.trim()});if(!current())return;if(error)throw error;setPostDraft('');await loadDetails(selected);});
 const createChannel=()=>perform(async(current)=>{if(!selected)return;const {error}=await db.from('community_channels').insert({community_id:selected.id,name:channelName.trim()});if(!current())return;if(error)throw error;setChannelName('');await loadDetails(selected);});
 const approve=(id:string)=>perform(async(current)=>{if(!selected)return;const {error}=await db.rpc('intent_approve_request',{cid:selected.id,applicant:id});if(!current())return;if(error)throw error;await loadDetails(selected);});
 const loadMessages=async(id:string,older=false)=>{
  const communityId=selection.current,cursor=older?oldest.current:null;
  if(older&&(!cursor||olderBusy.current||!hasOlder))return;
  const request=older?channelRequest.current:++channelRequest.current;
  if(older){olderBusy.current=true;setOlderLoading(true);}else {olderBusy.current=false;setOlderLoading(false);setMessagesLoading(true);}
  const current=()=>alive.current&&selection.current===communityId&&channelSelection.current===id&&request===channelRequest.current;
  try{
   let query=db.from('community_messages').select('id,body,author_id,created_at').eq('channel_id',id);
   if(cursor)query=query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
   const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
   if(!current())return;if(error){setError(error.message);return;}
   const next=(data||[]) as Msg[];setMessageList(old=>mergeMessages(old,next));
   if(older||!oldest.current){oldest.current=[...next].sort(chronological)[0]||cursor;setHasOlder(next.length===PAGE_SIZE);}setError('');
  }catch(e){if(current())setError(e instanceof Error?e.message:'Could not load channel messages');}
  finally{if(current()){if(older){olderBusy.current=false;setOlderLoading(false);}else setMessagesLoading(false);}}
 };
 const openChannel=async(id:string)=>{
  channelSelection.current=id;channelRequest.current++;oldest.current=null;olderBusy.current=false;
  setActiveChannel(id);setMessageList([]);setMessageDraft('');setHasOlder(false);setOlderLoading(false);setError('');await loadMessages(id);
 };
 const send=()=>perform(async(current)=>{if(!activeChannel||!user)return;const channel=activeChannel;const request=channelRequest.current;
  const {error}=await db.from('community_messages').insert({channel_id:channel,author_id:user.id,body:messageDraft.trim()});
  if(!current()||channelSelection.current!==channel||request!==channelRequest.current)return;if(error)throw error;setMessageDraft('');await loadMessages(channel);
 });
 const owner=!!user&&selected?.owner_id===user.id,member=members.some(m=>m.user_id===user?.id),staff=members.some(m=>m.user_id===user?.id&&['owner','admin','editor'].includes(m.role));
 return <div className="communities-live"><div className="page-heading"><div><h1>{t("Communities")}</h1><p>{t("Every community has a feed. Channels are optional.")}</p></div><button className="primary" onClick={()=>setForm(!form)}>{t("+ Create")}</button></div>
 {error&&<p role="alert" className="community-error">{error} <button className="outline" onClick={()=>{if(activeChannel)void loadMessages(activeChannel);else if(selected)void loadDetails(selected);else void reload();}}>{t("Retry")}</button></p>}{loading&&<p role="status">{t("Loading...")}</p>}{detailsLoading&&<p role="status">{t("Loading community...")}</p>}
 {form&&<section className="community-panel"><h2>{t("Create a community")}</h2>{!user&&<p><a href="/login">{t('Log in')}</a></p>}<label>{t("Name")}<input maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>{t("Description")}<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>{t("Privacy")}<select value={privacy} onChange={e=>setPrivacy(e.target.value as Community['privacy'])}><option value="public">{t("Open — anyone can join")}</option><option value="request">{t("Approval required")}</option><option value="private">{t("Private — invitation only")}</option></select></label><label>{t("Who can post")}<select value={posting} onChange={e=>setPosting(e.target.value as Community['posting_permission'])}><option value="members">{t("All members")}</option><option value="staff">{t("Administration and editors")}</option></select></label><label className="community-check"><input type="checkbox" checked={channelsEnabled} onChange={e=>setChannelsEnabled(e.target.checked)}/> {t("Enable channels")}</label><button className="primary" disabled={busy||!user||name.trim().length<3} onClick={create}>{t("Create community")}</button></section>}
 {!selected?<div className="community-list">{items.map(c=><button key={c.id} className="community community-select" onClick={()=>choose(c)}><div className="community-icon">{c.name.slice(0,1).toUpperCase()}</div><div><strong>{c.name}</strong><p>{c.description}</p><small>{t(c.privacy==='private'?'Private':c.privacy==='request'?'Approval required':'Open')} · {t('Feed')} {c.channels_enabled?'· '+t('Channels'):''}</small></div><span>{t("Open →")}</span></button>)}{!loading&&items.length===0&&<p className="muted">{t("No communities visible yet. Create the first one.")}</p>}</div>:<><button className="outline" onClick={()=>choose(null)}>{t("← All communities")}</button><section className="community-panel"><div className="community-cover"/><h1>{selected.name}</h1><p>{selected.description}</p><small>{selected.privacy} · {t('{n} members', { n: members.length })}</small>{!member&&user&&selected.privacy!=='private'&&<button className="primary" disabled={busy} onClick={join}>{t(selected.privacy==='request'?'Request to join':'Join community')}</button>}{!user&&<a href="/login">{t("Log in to join")}</a>}
 {owner&&<div className="community-owner"><h3>{t("Community settings")}</h3><label className="community-check"><input type="checkbox" checked={selected.channels_enabled} onChange={e=>void update({channels_enabled:e.target.checked})}/> Enable channels (turning off hides messages, does not delete them)</label><label>{t("Posting permissions")}<select value={selected.posting_permission} onChange={e=>void update({posting_permission:e.target.value as Community['posting_permission']})}><option value="members">{t("All members")}</option><option value="staff">{t("Administration and editors")}</option></select></label><label>{t("Privacy")}<select value={selected.privacy} onChange={e=>void update({privacy:e.target.value as Community['privacy']})}><option value="public">{t("Open")}</option><option value="request">{t("Approval required")}</option><option value="private">{t("Private")}</option></select></label>{requests.map(r=><div key={r.user_id} className="community-request">Join request: {r.user_id.slice(0,8)} <button className="outline" onClick={()=>approve(r.user_id)}>{t("Approve")}</button></div>)}</div>}</section>
 <div className="community-tabs"><button className={tab==='feed'?'selected':''} onClick={()=>setTab('feed')}>{t("Feed")}</button>{selected.channels_enabled&&<button className={tab==='channels'?'selected':''} onClick={()=>setTab('channels')}>{t("Channels")}</button>}<button className={tab==='members'?'selected':''} onClick={()=>setTab('members')}>{t("Members")}</button></div>
 {tab==='feed'&&<div className="community-feed">{member&&(selected.posting_permission==='members'||staff)&&<div className="community-panel"><textarea placeholder={t("Share something with your community...")} value={postDraft} onChange={e=>setPostDraft(e.target.value)} maxLength={10000}/><button className="primary" disabled={busy||!postDraft.trim()} onClick={publish}>{t("Publish")}</button></div>}{posts.map(p=><article className="community-panel" key={p.id}><small>{p.author_id===user?.id?'You':`Member ${p.author_id.slice(0,8)}`} · {new Date(p.created_at).toLocaleString()}</small><p>{p.body}</p></article>)}{!detailsLoading&&posts.length===0&&<p className="muted">{t("No posts yet.")}</p>}</div>}
 {tab==='members'&&<div className="community-panel">{members.map(m=><p key={m.user_id}>{m.user_id===user?.id?'You':m.user_id.slice(0,8)} · {m.role}</p>)}</div>}
 {tab==='channels'&&selected.channels_enabled&&<div className="community-panel">{owner&&<div className="community-inline"><input placeholder={t("Channel name")} value={channelName} onChange={e=>setChannelName(e.target.value)}/><button className="outline" disabled={busy||!channelName.trim()} onClick={createChannel}>{t("Add channel")}</button></div>}{channels.map(ch=><button key={ch.id} className="outline" onClick={()=>openChannel(ch.id)}># {ch.name}</button>)}{activeChannel&&<div className="community-chat">{messagesLoading&&<p role="status">{t("Loading...")}</p>}{hasOlder&&<button className="outline" disabled={olderLoading} onClick={()=>void loadMessages(activeChannel,true)}>{t(olderLoading?"Loading...":"Load older messages")}</button>}{!messagesLoading&&!messageList.length&&<p className="muted">{t("No messages yet.")}</p>}{messageList.map(m=><p key={m.id}><small>{m.author_id===user?.id?'You':m.author_id.slice(0,8)}:</small> {m.body}</p>)}{member&&<div className="community-inline"><input placeholder={t("Message")} value={messageDraft} onChange={e=>setMessageDraft(e.target.value)}/><button className="primary" disabled={busy||!messageDraft.trim()} onClick={send}>{t("Send")}</button></div>}</div>}</div>}
 </>}</div>;
}
