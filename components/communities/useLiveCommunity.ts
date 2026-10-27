'use client';
// Live community detail: members, feed, channels, request queue and channel chat.
// Every async result is ignored when the selection/channel changed in the meantime.
import { useCallback, useEffect, useRef, useState } from 'react';
import {loadTranslationHistory} from '../../lib/translation-history';
import type { User } from '@supabase/supabase-js';
import type { DB } from './api';
import { channelKind, clampCapacity, errorText, isMissingSchema, normalizeChannel, normalizeVoiceName, type Channel, type VoiceAccess, type Community, type Member, type Msg, type Post } from './model';

const PAGE_SIZE = 100;
const POLL_MS = 8000;
const chronological = (a: Msg, b: Msg) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const mergeMessages = (old: Msg[], next: Msg[]) => [...new Map([...old, ...next].map(m => [m.id, m])).values()].sort(chronological);
/** Thrown for RPCs that exist only after the v0.7 migration. */
export const NEEDS_MIGRATION = 'NEEDS_MIGRATION';

export function useLiveCommunity(db: DB, initial: Community, user: User | null, onChanged: () => void) {
  const [community, setCommunity] = useState(initial);
  const [members, setMembers] = useState<Member[]>([]), [posts, setPosts] = useState<Post[]>([]), [channels, setChannels] = useState<Channel[]>([]);
  const [requests, setRequests] = useState<{ user_id: string; status: string; created_at?: string }[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]), [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false), [olderLoading, setOlderLoading] = useState(false), [hasOlder, setHasOlder] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  // null = unknown yet; false = voice migration (kind/access/max_participants) not applied.
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null), [voiceNeedsMigration, setVoiceNeedsMigration] = useState(false);
  const voiceRef = useRef<boolean | null>(null), channelsRef = useRef<Channel[]>([]);
  const alive = useRef(true), detailsRequest = useRef(0), channelRequest = useRef(0), channelSelection = useRef<string | null>(null);
  const oldest = useRef<Msg | null>(null), olderBusy = useRef(false), busyRef = useRef(false);
  useEffect(() => { alive.current = true; const d = detailsRequest, c = channelRequest; return () => { alive.current = false; d.current++; c.current++; }; }, []);

  const resetChat = () => { channelSelection.current = null; channelRequest.current++; oldest.current = null; setActiveChannel(null); setMessages([]); setHasOlder(false); };
  const loadChannels = useCallback(async () => {
    const q = (cols: string) => db.from('community_channels').select(cols).eq('community_id', initial.id).order('created_at', { ascending: true });
    if (voiceRef.current !== false) {
      const r = await q('id,name,category,kind,access,max_participants');
      if (!r.error || !isMissingSchema(r.error)) { if (!r.error) { voiceRef.current = true; setVoiceReady(true); } return r; }
      voiceRef.current = false; setVoiceReady(false);
    }
    return q('id,name,category');
  }, [db, initial.id]);
  const load = useCallback(async () => {
    const request = ++detailsRequest.current; setLoading(true);
    const current = () => alive.current && request === detailsRequest.current;
    try {
      const [a, b, d, e] = await Promise.all([
        db.from('community_members').select('user_id,role').eq('community_id', initial.id),
        db.from('community_posts').select('id,body,author_id,created_at').eq('community_id', initial.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
        loadChannels(),
        user ? db.from('community_join_requests').select('user_id,status,created_at').eq('community_id', initial.id).eq('status', 'pending') : Promise.resolve({ data: [], error: null }),
      ]);
      if (!current()) return;
      // Anonymous visitors have no member-list privilege; that is not an error worth showing.
      const errors = [user ? a.error : null, b.error, d.error, e.error].filter(Boolean);
      if (errors.length) { setError(errors.map(x => x!.message).join('; ')); return; }
      setMembers((a.data || []) as Member[]); setPosts((b.data || []) as Post[]); { const ch = (d.data || []) as unknown as Channel[]; channelsRef.current = ch; setChannels(ch); } setRequests((e.data || []) as typeof requests); setError('');
    } catch (x) { if (current()) setError(errorText(x, 'Could not load community details')); }
    finally { if (current()) setLoading(false); }
  }, [db, initial.id, user, loadChannels]);
  useEffect(() => { void load(); }, [load]);

  const perform = async (fn: () => Promise<void>) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { await fn(); return true; }
    catch (x) { if (alive.current) { if (x instanceof Error && x.message === NEEDS_MIGRATION) setNeedsMigration(true); else setError(errorText(x)); } return false; }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  };
  const rpc = async (name: string, args: Record<string, string | number>) => {
    const { error } = await db.rpc(name, args);
    if (error) throw isMissingSchema(error) ? new Error(NEEDS_MIGRATION) : error;
  };

  const update = (patch: Partial<Community>) => perform(async () => {
    const { data, error } = await db.from('communities').update(patch).eq('id', community.id).select('*').single();
    if (error) throw isMissingSchema(error) ? new Error(NEEDS_MIGRATION) : error;
    if (!alive.current) return;
    setCommunity(data as Community); if (!(data as Community).channels_enabled) resetChat(); else void load();
    onChanged();
  });
  const publish = (body: string) => perform(async () => {
    if (!user) throw new Error('Log in first');
    const { error } = await db.from('community_posts').insert({ community_id: community.id, author_id: user.id, body: body.trim() });
    if (error) throw error; await load(); onChanged();
  });
  const deletePost = (id: string) => perform(async () => { const { error } = await db.from('community_posts').delete().eq('id', id); if (error) throw error; await load(); });
  const createChannel = (name: string, voice?: { access: VoiceAccess; max: number }) => perform(async () => {
    if (voice && voiceRef.current === false) { setVoiceNeedsMigration(true); return; }
    const row: Record<string, unknown> = voice ? { community_id: community.id, name: normalizeVoiceName(name), kind: 'voice', access: voice.access, max_participants: clampCapacity(voice.max) }
      : { community_id: community.id, name: normalizeChannel(name) };
    const { error } = await db.from('community_channels').insert(row);
    if (error) { if (voice && isMissingSchema(error)) { voiceRef.current = false; setVoiceReady(false); setVoiceNeedsMigration(true); return; } throw error; }
    await load();
  });
  const updateVoiceChannel = (id: string, patch: { name: string; access: VoiceAccess; max: number }) => perform(async () => {
    const { error } = await db.rpc('intent_update_voice_channel', { chid: id, new_name: normalizeVoiceName(patch.name), new_access: patch.access, new_max: clampCapacity(patch.max) });
    if (error) { if (isMissingSchema(error)) { setVoiceNeedsMigration(true); return; } throw error; }
    await load();
  });
  const deleteChannel = (id: string) => perform(async () => {
    const { error } = await db.from('community_channels').delete().eq('id', id);
    if (error) throw isMissingSchema(error) ? new Error(NEEDS_MIGRATION) : error;
    if (channelSelection.current === id) resetChat(); await load();
  });
  const approve = (id: string) => perform(async () => { await rpc('intent_approve_request', { cid: community.id, applicant: id }); await load(); onChanged(); });
  const decline = (id: string) => perform(async () => { await rpc('intent_decline_request', { cid: community.id, applicant: id }); await load(); });
  const setRole = (id: string, role: string) => perform(async () => { await rpc('intent_set_member_role', { cid: community.id, target: id, new_role: role }); await load(); });
  const removeMember = (id: string) => perform(async () => { await rpc('intent_remove_member', { cid: community.id, target: id }); await load(); onChanged(); });

  const loadMessages = useCallback(async (id: string, mode: 'open' | 'older' | 'poll' = 'open') => {
    const cursor = mode === 'older' ? oldest.current : null;
    if (mode === 'older' && (!cursor || olderBusy.current)) return;
    const request = mode === 'open' ? ++channelRequest.current : channelRequest.current;
    if (mode === 'older') { olderBusy.current = true; setOlderLoading(true); } else if (mode === 'open') setMessagesLoading(true);
    const current = () => alive.current && channelSelection.current === id && request === channelRequest.current;
    try {
      let query = db.from('community_messages').select('id,body,author_id,created_at').eq('channel_id', id);
      if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
      if (!current()) return;
      // No read access (e.g. signed out / not a member) is expected, not an error to show.
      if (error) { if (error.code === '42501') { setMessages([]); setHasOlder(false); return; } if (mode !== 'poll') setError(error.message); return; }
      const next = (data || []) as Msg[]; setMessages(old => mergeMessages(old, next));
      if (mode !== 'poll' && (mode === 'older' || !oldest.current)) { oldest.current = [...next].sort(chronological)[0] || cursor; setHasOlder(next.length === PAGE_SIZE); }
    } catch (x) { if (current() && mode !== 'poll') setError(errorText(x, 'Could not load channel messages')); }
    finally { if (current()) { if (mode === 'older') { olderBusy.current = false; setOlderLoading(false); } else if (mode === 'open') setMessagesLoading(false); } }
  }, [db]);
  const loadAllHistory=async(signal:AbortSignal)=>{
    if(!activeChannel||!oldest.current||!hasOlder)return {complete:!hasOlder,pages:0,loaded:0};
    if(olderBusy.current)throw new Error('history_busy');
    const id=activeChannel,request=channelRequest.current;olderBusy.current=true;setOlderLoading(true);
    const current=()=>alive.current&&channelSelection.current===id&&channelRequest.current===request;
    try{return await loadTranslationHistory({cursor:oldest.current,signal,current,
      fetchPage:async cursor=>{const result=await db.from('community_messages').select('id,body,author_id,created_at').eq('channel_id',id).or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);if(result.error)throw new Error('history_unavailable');return (result.data||[]) as Msg[];},
      commit:(rows,more)=>{setMessages(old=>mergeMessages(old,rows));oldest.current=[...rows].sort(chronological)[0]||oldest.current;setHasOlder(more);},
    });}finally{if(current()){olderBusy.current=false;setOlderLoading(false);}}
  };
  const openChannel = (id: string) => {
    channelSelection.current = id; channelRequest.current++; oldest.current = null; olderBusy.current = false;
    setActiveChannel(id); setMessages([]); setHasOlder(false); setOlderLoading(false); setMessagesLoading(false); setError('');
    // Voice channels have no message history (the server rejects inserts there).
    if (channelKind(channelsRef.current.find(c => c.id === id) || {}) === 'text') void loadMessages(id);
  };
  // Live conversation without a realtime socket: light polling while a channel is open and visible.
  useEffect(() => {
    if (!activeChannel || channelKind(channelsRef.current.find(c => c.id === activeChannel) || {}) === 'voice') return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void loadMessages(activeChannel, 'poll'); }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeChannel, loadMessages]);
  const send = (body: string) => perform(async () => {
    if (!activeChannel || !user) return; const channel = activeChannel;
    const { error } = await db.from('community_messages').insert({ channel_id: channel, author_id: user.id, body: body.trim() });
    if (error) throw error; if (channelSelection.current === channel) await loadMessages(channel, 'poll');
  });

  return {
    community, members, posts, channels, requests, messages, activeChannel, error, busy, loading, needsMigration, voiceReady, voiceNeedsMigration,
    messagesLoading, olderLoading, hasOlder, setError, setCommunity,
    reload: load, update, publish, deletePost, createChannel, updateVoiceChannel, deleteChannel, approve, decline, setRole, removeMember,
    openChannel, loadAllHistory, loadOlder: () => activeChannel && loadMessages(activeChannel, 'older'), send, perform,
  };
}
export type Live = ReturnType<typeof useLiveCommunity>;
