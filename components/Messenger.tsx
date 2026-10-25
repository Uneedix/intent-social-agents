'use client';
import {PinDialog,PinnedList,type PinScope} from './MessagePins';
import { useT, useI18n } from './I18n';
import {normalizeFolderOrder,moveFolder,reorderFolder} from '../lib/chat-folders';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';
import { Search, Pin, PinOff, Send, Paperclip, Smile, X, Reply, Pencil, Trash2, Forward, Copy, BellOff, Bell, Check, CheckCheck, MoreHorizontal, Eraser, CornerUpLeft, Video, Phone, MapPin, BadgeCheck, Mic, Pause, Play, Download, FileText, Link2, Plus, Briefcase, Handshake, MessageSquare, Archive, ArchiveRestore, ListPlus, Star, CircleCheck, SquarePen, Camera, Image as ImageIcon, Clapperboard, UserRound, BarChart3, Target, Music, Users, ChevronRight, ChevronLeft, Heart, Info, Settings, Lock, UserPlus, MailOpen, Mail, Share } from 'lucide-react';
import { chatProfiles, type Chat, type ChatMsg, type ChatFile, type ChatCategory, type GroupRole } from '../lib/data';
import { compressImage, uid, useStored } from '../lib/social';
import { Avatar, VoicePlayer, Sheet } from './MsgParts';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker, toGifAttachment } from './GifPicker';
import { GifView } from './GifView';
import ResizeHandle from './ResizeHandle';
import CreateGroupModal, { AddMembersModal, type GroupDraft } from './groups/CreateGroupModal';
import GroupInfoModal, { type InfoMember } from './groups/GroupInfoModal';
import { TopicList, TopicBar, TopicModal, ClosedTopic, topicTitle, type TopicRow } from './groups/Topics';
import { GENERAL_ID, withGeneral, sortTopics } from './groups/model';
import gs from './groups/groups.module.css';

const QUICK = ['❤️', '👍', '🔥', '😂', '😮', '😢'];
const BASE_FOLDERS = [['all', 'All'], ['unread', 'Unread'], ['job', 'Jobs'], ['collab', 'Collaborations'], ['group', 'Groups'], ['other', 'Other'], ['archived', 'Archived']] as const;
const TAG: Record<ChatCategory, string> = { job: 'Job', collab: 'Collab', other: '' };
const MAX_FILE = 2 * 1024 * 1024; // chats live in this browser's storage, so files must stay small
const MAX_VOICE_S = 60;
const MAX_PINS = 5;
const DAY = 86400000;
type Person = { name: string; handle: string; avatar: string };
type ChatList = { id: string; name: string; chats: string[] };

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const startOf = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysAgo = (t: number) => Math.round((startOf(Date.now()) - startOf(t)) / DAY);
const size = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const URL_RE = /https:\/\/[^\s<>"']+/g;
const categoryOf = (c: Chat): ChatCategory => c.category || chatProfiles[c.handle]?.category || 'other';
const isPdf = (f: ChatFile) => /pdf/i.test(f.type + f.name);
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** Long press on touch, right click on desktop. */
function usePress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e: RPointerEvent) => { if (e.pointerType === 'mouse') return; fired.current = false; clear(); timer.current = setTimeout(() => { fired.current = true; onLong(); }, 480); },
    onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLong(); },
    wasLong: () => { const f = fired.current; fired.current = false; return f; }
  };
}

function ListItem({ active, onOpen, onMenu, label, children }: { c: Chat; active: boolean; onOpen: () => void; onMenu: () => void; label: string; children: ReactNode }) {
  const press = usePress(onMenu);
  return <button className={'ms-item ' + (active ? 'on' : '')} aria-label={label} onClick={() => { if (!press.wasLong()) onOpen(); }}
    onPointerDown={press.onPointerDown} onPointerUp={press.onPointerUp} onPointerLeave={press.onPointerLeave} onPointerCancel={press.onPointerCancel} onContextMenu={press.onContextMenu}>{children}</button>;
}

type Props = { chats: Chat[]; setChats: (c: Chat[]) => void; active: string | null; setActive: (id: string | null) => void; toast: (m: string) => void; modeSwitch?: ReactNode; onHome?:()=>void; people?: [string, string, string][]; onViewProfile?: (handle: string) => void; onShareIntention?: () => void; onCommunities?: () => void };

export default function Messenger({ chats, setChats, active, setActive, toast, modeSwitch, onHome, people = [], onViewProfile, onShareIntention }: Props) {
  const t = useT();
  const {lang}=useI18n();
  const ui=lang==='Русский'?{left:'Переместить влево',right:'Переместить вправо',options:'Настроить папку',selected:'Выбранные участники',search:'Поиск людей…',group:'Создать группу',hint:'Папки можно перетаскивать или перемещать через меню.'}:lang==='Polski'?{left:'Przenieś w lewo',right:'Przenieś w prawo',options:'Opcje folderu',selected:'Wybrane osoby',search:'Szukaj osób…',group:'Utwórz grupę',hint:'Przeciągnij folder lub przesuń go w menu.'}:{left:'Move left',right:'Move right',options:'Folder options',selected:'Selected people',search:'Search people…',group:'Create group',hint:'Drag folders or move them using their menu.'};
  const [folderOrder,setFolderOrder]=useStored<string[]>('intent-chat-folder-order',[]);
  const [folderMenu,setFolderMenu]=useState<string|null>(null);
  const draggingFolder=useRef<string|null>(null);
  const [lists, setLists] = useStored<ChatList[]>('intent-chat-lists', []);
  const [folder, setFolder] = useState<string>('all');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [pinTarget,setPinTarget]=useState<{chatId:string;messageId:number}|null>(null);
  const [msgMenu, setMsgMenu] = useState<number | null>(null);
  const [rxPicker, setRxPicker] = useState(false);
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [optionsSheet, setOptionsSheet] = useState(false);
  const [forward, setForward] = useState<ChatMsg[] | null>(null);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [side, setSide] = useState(false);
  const [find, setFind] = useState<string | null>(null);
  const [image, setImage] = useState('');
  const [file, setFile] = useState<ChatFile | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [mediaTab, setMediaTab] = useState<'media' | 'links' | 'files' | 'starred' | null>(null);
  const [newChat, setNewChat] = useState<'people' | 'groups' | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [pickQ, setPickQ] = useState('');
  const [wizard, setWizard] = useState(false);
  const [addMembers, setAddMembers] = useState(false);
  const [groupInfo, setGroupInfo] = useState(false);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicEdit, setTopicEdit] = useState<TopicRow | 'new' | null>(null);
  const [listEdit, setListEdit] = useState<ChatList | null>(null);
  const [listPick, setListPick] = useState<string | null>(null);
  const [contactPick, setContactPick] = useState(false);
  const [pollDraft, setPollDraft] = useState<{ q: string; o: string[] } | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const [rec, setRec] = useState<{ secs: number; paused: boolean; levels: number[] } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recClock = useRef({ acc: 0, since: 0 });
  const analyser = useRef<AnalyserNode | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelRec = useRef(false);
  const slide = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const inputs = { file: useRef<HTMLInputElement>(null), camera: useRef<HTMLInputElement>(null), gallery: useRef<HTMLInputElement>(null), video: useRef<HTMLInputElement>(null) };
  const input = useRef<HTMLTextAreaElement>(null);
  const listSearch = useRef<HTMLInputElement>(null);
  const chat = chats.find(c => c.id === active) || null;
  const prof = chat ? chatProfiles[chat.handle] : undefined;
  const isGroup = chat?.kind === 'group';

  const update = (id: string, fn: (c: Chat) => Chat) => setChats(chats.map(c => c.id === id ? fn(c) : c));
  const last = (c: Chat) => [...c.messages].reverse().find(m => !m.deleted);
  const preview = (m?: ChatMsg | null) => !m ? t('No messages yet') : m.text || (m.voice ? '🎤 ' + t('Voice message') : m.poll ? '📊 ' + m.poll.question : m.contact ? '👤 ' + m.contact.name : m.location ? '📍 ' + t('Location') : m.file ? '📎 ' + m.file.name : m.gif ? 'GIF' : '📷 ' + t('Photo'));
  const listTime = (ts: number) => { const d = daysAgo(ts); return d <= 0 ? hhmm(ts) : d === 1 ? t('Yesterday') : d < 7 ? t('{n} days ago', { n: d }) : new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const dayLabel = (ts: number) => { const d = daysAgo(ts); return d <= 0 ? t('Today') : d === 1 ? t('Yesterday') : new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'long' }); };
  const chatTitle = (c: Chat) => c.kind === 'saved' ? t(c.name) : c.name;
  const status = (c: Chat) => c.kind === 'saved' ? t('Only you can see this chat') : c.kind === 'group' ? t('{n} members', { n: (c.members?.length || 0) + 1 }) : t(c.online ? 'Online' : 'last seen recently');

  useEffect(() => { setSide(window.matchMedia('(min-width: 1280px)').matches); }, []);
  useEffect(() => {
    if (msgMenu == null) return;
    const down = (e: PointerEvent) => { const el = e.target as HTMLElement; if (!el.closest?.('.ms-inl-bar,.ms-inl-rx,.ms-bub-wrap.on')) { setMsgMenu(null); setRxPicker(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMsgMenu(null); setRxPicker(false); } };
    const tm = setTimeout(() => { document.addEventListener('pointerdown', down); document.querySelector('.ms-inl-bar')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(tm); document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [msgMenu]);
  // ⌘K / Ctrl+K focuses the chat search while Messages is open
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); listSearch.current?.focus(); } };
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true);
  }, []);
  // Read the latest chat data without treating incoming messages as a new selection.
  const openState=useRef({chat,chats,setChats});
  useEffect(()=>{openState.current={chat,chats,setChats};},[chat,chats,setChats]);
  useEffect(()=>{
    const {chat:opened,chats:currentChats,setChats:saveChats}=openState.current;
    if(!opened)return;
    if(opened.unread)saveChats(currentChats.map(c=>c.id===opened.id?{...c,unread:0}:c));
    setDraft(opened.draft||'');setTopicId(null);setTopicEdit(null);setGroupInfo(false);setReplyTo(null);setEditing(null);setFind(null);setImage('');setFile(null);setHeadMenu(false);setSelected(null);
  },[active]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [active, chat?.messages.length, topicId]);
  useEffect(() => () => { cancelRec.current = true; recorder.current?.stream.getTracks().forEach(tr => tr.stop()); void audioCtx.current?.close(); }, []);

  /* ---------- people & folders ---------- */
  const contacts = useMemo<Person[]>(() => {
    const m = new Map<string, Person>();
    people.forEach(([name, handle, avatar]) => m.set(handle, { name, handle, avatar }));
    chats.forEach(c => { if (c.kind !== 'saved' && c.kind !== 'group' && !m.has(c.handle)) m.set(c.handle, { name: c.name, handle: c.handle, avatar: c.avatar }); });
    return [...m.values()];
  }, [people, chats]);
  const availableFolders: [string,string][]=[...BASE_FOLDERS.map(f=>[f[0],t(f[1])] as [string,string]),...lists.map(l=>['list:'+l.id,l.name] as [string,string])];
  const folderIds=availableFolders.map(([id])=>id);
  const orderedIds=normalizeFolderOrder(folderOrder,folderIds);
  const folders=orderedIds.map(id=>availableFolders.find(([key])=>key===id)!);
  const moveFolderInMenu=(direction:-1|1)=>{if(folderMenu)setFolderOrder(current=>moveFolder(current,folderIds,folderMenu,direction));};
  const inFolder = (c: Chat, f: string) => {
    if (f === 'archived') return !!c.archived;
    if (c.archived) return false;
    if (f === 'all') return true; if (f === 'unread') return (c.unread || 0) > 0; if (f === 'group') return c.kind === 'group';
    if (f.startsWith('list:')) return !!lists.find(l => 'list:' + l.id === f)?.chats.includes(c.id);
    return c.kind !== 'group' && categoryOf(c) === f;
  };
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return chats.filter(c => inFolder(c, folder) && (!s || c.name.toLowerCase().includes(s) || c.handle.toLowerCase().includes(s) || c.messages.some(m => m.text.toLowerCase().includes(s))))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (last(b)?.at || 0) - (last(a)?.at || 0));
  }, [chats, folder, q, lists]); // eslint-disable-line react-hooks/exhaustive-deps
  const unreadCount = chats.filter(c => c.unread && !c.archived).length;
  const pinCount = chats.filter(c => c.pinned && c.kind !== 'saved').length;

  const togglePin = (c: Chat) => {
    if (!c.pinned && c.kind !== 'saved' && pinCount >= MAX_PINS) { toast(t('You can pin up to {n} chats. Unpin one first.', { n: MAX_PINS })); return; }
    update(c.id, x => ({ ...x, pinned: !x.pinned }));
  };
  const toggleArchive = (c: Chat) => { update(c.id, x => ({ ...x, archived: !x.archived, pinned: x.archived ? x.pinned : false })); if (active === c.id && !c.archived) setActive(null); toast(t(c.archived ? 'Chat unarchived' : 'Chat archived')); };
  const deleteChat = (c: Chat) => { if (c.kind === 'saved') return; if (!confirm(t('Delete this chat and its messages from this device?'))) return; setChats(chats.filter(x => x.id !== c.id)); setLists(lists.map(l => ({ ...l, chats: l.chats.filter(id => id !== c.id) }))); if (active === c.id) setActive(null); };
  const openPerson = (p: Person) => {
    const ex = chats.find(c => c.handle === p.handle && c.kind !== 'group' && c.kind !== 'saved');
    if (ex) { if (ex.archived) update(ex.id, x => ({ ...x, archived: false })); setActive(ex.id); return; }
    const c: Chat = { id: p.handle + '-' + uid(), name: p.name, handle: p.handle, avatar: p.avatar, kind: 'personal', messages: [] };
    setChats([c, ...chats]); setActive(c.id);
  };
  const createGroup = (d: GroupDraft) => {
    const name = d.name.slice(0, 60); const ids = d.members.map(m => m.id); const members = contacts.filter(p => ids.includes(p.handle));
    if (name.length < 2 || members.length < 1) return;
    const c: Chat = { id: 'g-' + uid(), name, handle: 'group', avatar: d.avatar, kind: 'group', members, description: d.description || undefined, color: d.color,
      topicsEnabled: d.topics, topics: d.topics ? withGeneral([]) : undefined, roles: Object.fromEntries(members.map(m => [m.handle, 'member' as GroupRole])),
      messages: [{ id: uid(), from: 'system', text: t('You created the group “{name}”', { name }), at: Date.now() }] };
    setChats([c, ...chats]); setActive(c.id); setWizard(false); toast(t('Group created on this device'));
  };
  const closeNew = () => { setNewChat(null); setPick([]); setPickQ(''); };

  /* ---------- topics (local groups) ---------- */
  const topicsOn = !!(isGroup && chat?.topicsEnabled);
  const topicList = topicsOn ? withGeneral(chat!.topics) : [];
  const curTopicId = topicsOn ? (topicList.some(x => x.id === topicId) ? topicId! : GENERAL_ID) : undefined;
  const curTopic = topicList.find(x => x.id === curTopicId);
  const inTopic = (m: ChatMsg, id: string) => (m.topicId && topicList.some(x => x.id === m.topicId) ? m.topicId : GENERAL_ID) === id;
  const nameOf = (h: string) => h === 'me' ? t('You') : chat?.members?.find(p => p.handle === h)?.name || h;
  const topicRows: TopicRow[] = topicsOn ? sortTopics(topicList.map(x => { const lm = [...chat!.messages].reverse().find(m => !m.deleted && inTopic(m, x.id));
    return { ...x, last: lm ? preview(lm) : undefined, lastWho: lm && lm.from !== 'system' ? nameOf(lm.from) : undefined, lastAt: lm?.at }; }), r => r.lastAt || 0) : [];
  const setTopics = (fn: (list: ReturnType<typeof withGeneral>) => ReturnType<typeof withGeneral>) => chat && update(chat.id, c => ({ ...c, topics: fn(withGeneral(c.topics)) }));
  const openTopic = (id: string) => { setTopicId(id); setFind(null); setReplyTo(null); setEditing(null); setTopics(list => list.map(x => x.id === id ? { ...x, unread: 0 } : x)); };
  const saveTopic = (v: { title: string; icon: string; color: number }) => {
    if (!chat) return;
    if (topicEdit === 'new') { const id = 't-' + uid(); update(chat.id, c => ({ ...c, topics: [...withGeneral(c.topics), { id, ...v, createdAt: Date.now() }], messages: [...c.messages, { id: uid(), from: 'system', text: t('You created the topic “{name}”', { name: v.title }), at: Date.now(), topicId: id }] })); setTopicId(id); }
    else if (topicEdit) setTopics(list => list.map(x => x.id === topicEdit.id ? { ...x, ...v, title: x.general ? x.title : v.title } : x));
    setTopicEdit(null);
  };
  const myRole: GroupRole = 'owner'; // local groups: the creator on this device is always the owner

  /* ---------- sending ---------- */
  function push(msg: Partial<ChatMsg>, target = chat) {
    if (!target) return;
    const m: ChatMsg = { id: uid(), from: 'me', text: '', at: Date.now(), read: target.kind === 'saved', ...(target.id === chat?.id && curTopicId ? { topicId: curTopicId } : {}), ...msg };
    setChats(chats.map(c => c.id === target.id ? { ...c, draft: '', messages: [...c.messages, m] } : c));
  }
  function send() {
    if (!chat) return; const text = draft.trim(); if (!text && !image && !file) return; if (topicsOn && curTopic?.closed) return;
    if (editing) { update(chat.id, c => ({ ...c, draft: '', messages: c.messages.map(m => m.id === editing.id ? { ...m, text, edited: true } : m) })); setEditing(null); setDraft(''); return; }
    push({ text, replyTo: replyTo?.id, image: image || undefined, file: file || undefined });
    setDraft(''); setReplyTo(null); setImage(''); setFile(null); setEmoji(false);
  }
  const patchMsg = (ids: number[], fn: (m: ChatMsg) => ChatMsg) => chat && update(chat.id, c => ({ ...c, messages: c.messages.map(m => ids.includes(m.id) ? fn(m) : m) }));
  const react = (m: ChatMsg, e: string) => patchMsg([m.id], x => { const r = { ...(x.reactions || {}) }; const had = (r[e] || []).includes('me');
    Object.keys(r).forEach(k => { r[k] = r[k].filter(u => u !== 'me'); if (!r[k].length) delete r[k]; }); if (!had) r[e] = [...(r[e] || []), 'me']; return { ...x, reactions: r }; });
  const removeMsgs = (ids: number[]) => chat && update(chat.id, c => ({ ...c, pinnedMsg: c.pinnedMsg && ids.includes(c.pinnedMsg) ? undefined : c.pinnedMsg, pinnedMessages:(c.pinnedMessages||[]).filter(p=>!ids.includes(p.messageId)), messages: c.messages.map(x => ids.includes(x.id) ? { ...x, deleted: true, text: '', image: undefined, file: undefined, voice: undefined, poll: undefined, contact: undefined, location: undefined } : x) }));
  const readData = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error(t('Could not read the file.'))); r.readAsDataURL(f); });
  async function pickFile(f?: File, el?: HTMLInputElement | null) {
    setAttachOpen(false);
    if (!f) return;
    try {
      if (f.type.startsWith('image/')) { setImage(await compressImage(f, 1400)); setFile(null); }
      else { if (f.size > MAX_FILE) throw new Error(t('Files up to {n} can be sent for now.', { n: size(MAX_FILE) })); setFile({ name: f.name.slice(0, 120), size: f.size, type: f.type || 'application/octet-stream', data: await readData(f) }); setImage(''); }
    } catch (e) { toast(e instanceof Error ? e.message : t('Upload failed')); }
    finally { if (el) el.value = ''; }
  }
  const shareLocation = () => {
    setAttachOpen(false);
    if (!navigator.geolocation) { toast(t('Location is not available in this browser.')); return; }
    if (!confirm(t('Send your current location to this chat? It will be visible to everyone in the chat.'))) return;
    navigator.geolocation.getCurrentPosition(p => push({ location: { lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4 } }), () => toast(t('Location access was blocked.')), { timeout: 10000 });
  };
  const sendPoll = () => { if (!pollDraft) return; const opts = pollDraft.o.map(o => o.trim()).filter(Boolean); if (!pollDraft.q.trim() || opts.length < 2) return; push({ poll: { question: pollDraft.q.trim().slice(0, 140), options: opts.slice(0, 6).map(o => ({ text: o.slice(0, 60), votes: [] })) } }); setPollDraft(null); };
  const vote = (m: ChatMsg, i: number) => patchMsg([m.id], x => x.poll ? { ...x, poll: { ...x.poll, options: x.poll.options.map((o, k) => ({ ...o, votes: k === i ? (o.votes.includes('me') ? o.votes.filter(v => v !== 'me') : [...o.votes, 'me']) : o.votes.filter(v => v !== 'me') })) } } : x);

  /* ---------- voice recording ---------- */
  const recSecs = () => recClock.current.acc + (recorder.current?.state === 'recording' ? (Date.now() - recClock.current.since) / 1000 : 0);
  async function startRec() {
    setAttachOpen(false);
    if (!chat || rec) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast(t('Voice messages are not supported in this browser.')); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); chunks.current = []; cancelRec.current = false;
      try { const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an); audioCtx.current = ctx; analyser.current = an; } catch { analyser.current = null; }
      const target = chat; const voiceTopic = curTopicId;
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop()); void audioCtx.current?.close(); audioCtx.current = null; analyser.current = null;
        const secs = recClock.current.acc; setRec(null);
        if (cancelRec.current || secs < 0.6) return;
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        if (blob.size > MAX_FILE) { toast(t('This voice message is too long to save.')); return; }
        const data = await readData(blob);
        setChatsRef.current(cur => cur.map(c => c.id === target.id ? { ...c, messages: [...c.messages, { id: uid(), from: 'me', text: '', at: Date.now(), voice: { data, duration: Math.round(secs) }, ...(voiceTopic ? { topicId: voiceTopic } : {}) }] } : c));
      };
      recorder.current = r; recClock.current = { acc: 0, since: Date.now() }; r.start(); setRec({ secs: 0, paused: false, levels: [] });
    } catch { toast(t('Microphone access was blocked.')); }
  }
  // latest chats for async voice callback
  const chatsRef = useRef(chats); chatsRef.current = chats;
  const setChatsRef = useRef((fn: (c: Chat[]) => Chat[]) => setChats(fn(chatsRef.current)));
  setChatsRef.current = (fn: (c: Chat[]) => Chat[]) => setChats(fn(chatsRef.current));
  useEffect(() => {
    if (!rec) return;
    const buf = new Uint8Array(256);
    const id = setInterval(() => {
      const s = recSecs(); let lvl = 0;
      if (analyser.current && recorder.current?.state === 'recording') { analyser.current.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2; lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4); }
      setRec(r => r && { ...r, secs: s, levels: recorder.current?.state === 'recording' ? [...r.levels, lvl].slice(-36) : r.levels });
      if (s >= MAX_VOICE_S) stopRec(false);
    }, 100);
    return () => clearInterval(id);
  }, [!!rec]); // eslint-disable-line react-hooks/exhaustive-deps
  function stopRec(cancel: boolean) {
    const r = recorder.current; cancelRec.current = cancel;
    if (r && r.state !== 'inactive') { if (r.state === 'recording') recClock.current.acc += (Date.now() - recClock.current.since) / 1000; r.stop(); } else setRec(null);
  }
  function pauseRec() {
    const r = recorder.current; if (!r) return;
    if (r.state === 'recording') { r.pause(); recClock.current.acc += (Date.now() - recClock.current.since) / 1000; setRec(x => x && { ...x, paused: true }); }
    else if (r.state === 'paused') { r.resume(); recClock.current.since = Date.now(); setRec(x => x && { ...x, paused: false }); }
  }
  useEffect(() => { if (!rec) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') stopRec(true); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [!!rec]); // eslint-disable-line react-hooks/exhaustive-deps

  const doForward = (to: Chat) => { if (!forward) return; const src = chat?.kind === 'saved' ? t('Saved Messages') : chat?.name;
    setChats(chats.map(c => c.id === to.id ? { ...c, messages: [...c.messages, ...forward.map(f => ({ id: uid(), from: 'me', text: f.text, image: f.image, file: f.file, voice: f.voice, poll: f.poll, contact: f.contact, location: f.location, at: Date.now(), forwardedFrom: f.from === 'me' ? t('You') : src }))] } : c));
    setForward(null); setSelected(null); toast(t('Forwarded to {name}', { name: chatTitle(to) })); };
  const notYet = () => toast(t('Calls are not available yet — they need a calling service to be connected.'));
  const setCategory = (cat: ChatCategory) => { if (!chat) return; update(chat.id, c => ({ ...c, category: cat })); setHeadMenu(false); setOptionsSheet(false); toast(t('Chat moved to {f}', { f: t(BASE_FOLDERS.find(f => f[0] === cat)![1]) })); };
  const saveList = () => { if (!listEdit || !listEdit.name.trim()) return; const l = { ...listEdit, name: listEdit.name.trim().slice(0, 24) }; setLists(lists.some(x => x.id === l.id) ? lists.map(x => x.id === l.id ? l : x) : [...lists, l]); setFolder('list:' + l.id); setListEdit(null); };
  const delList = (id: string) => { setLists(lists.filter(l => l.id !== id)); if (folder === 'list:' + id) setFolder('all'); setListEdit(null); };
  const toggleSel = (id: number) => setSelected(s => s ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]);

  /* ---------- derived ---------- */
  const localPins=(c:Chat)=>{const pins=c.pinnedMessages||[];return c.pinnedMsg&&!pins.some(p=>p.messageId===c.pinnedMsg)?[{messageId:c.pinnedMsg,scope:'self' as const},...pins]:pins;};
  const pinRows=chat?localPins(chat).filter(p=>chat.messages.some(m=>m.id===p.messageId&&!m.deleted)).map(p=>({id:String(p.messageId),scope:p.scope,text:preview(chat.messages.find(m=>m.id===p.messageId)!)})):[];
  const unpinMessage=(id:string,scope:PinScope)=>chat&&update(chat.id,c=>({...c,pinnedMsg:undefined,pinnedMessages:localPins(c).filter(p=>!(p.messageId===Number(id)&&p.scope===scope))}));
  const shown = chat ? chat.messages.filter(m => !m.deleted && (!curTopicId || inTopic(m, curTopicId)) && (!find || m.text.toLowerCase().includes(find.toLowerCase()))) : [];
  const live = chat ? chat.messages.filter(m => !m.deleted) : [];
  const images = live.filter(m => m.image);
  const files = live.filter(m => m.file);
  const links = live.flatMap(m => (m.text.match(URL_RE) || []).map((u, i) => ({ key: m.id + '-' + i, url: u, m })));
  const starred = live.filter(m => m.starred);
  const sharedTop = [...files.map(m => ({ k: 'f' + m.id, at: m.at, m, url: '' })), ...links.map(l => ({ k: 'l' + l.key, at: l.m.at, m: l.m, url: l.url }))].sort((a, b) => b.at - a.at);
  const menuMsg = msgMenu != null ? chat?.messages.find(m => m.id === msgMenu) : null;
  const closeMenu = () => { setMsgMenu(null); setRxPicker(false); };
  const msgQuick = (m: ChatMsg) => <div className="ms-inl-rx" onClick={e => e.stopPropagation()}>{QUICK.map(e => <button key={e} type="button" onClick={() => { react(m, e); closeMenu(); }}>{e}</button>)}<button type="button" className="more" onClick={() => setRxPicker(!rxPicker)} aria-label={t('More reactions')}><Plus size={18} /></button></div>;
  const msgBar = (m: ChatMsg) => chat && <div className="ms-inl-bar" role="toolbar" onClick={e => e.stopPropagation()}>
    {rxPicker && <div className="ms-inl-pick"><EmojiPicker variant="inline" keepOpen={false} onPick={e => { react(m, e); closeMenu(); }} onClose={() => setRxPicker(false)} /></div>}
    <div className="ms-inl-acts">
      <button type="button" title={t('Reply')} aria-label={t('Reply')} onClick={() => { setReplyTo(m); setEditing(null); closeMenu(); input.current?.focus(); }}><Reply size={18} /></button>
      {m.text && <button type="button" title={t('Copy')} aria-label={t('Copy')} onClick={() => { void navigator.clipboard?.writeText(m.text).then(() => toast(t('Copied'))); closeMenu(); }}><Copy size={18} /></button>}
      {m.from === 'me' && m.text && <button type="button" title={t('Edit')} aria-label={t('Edit')} onClick={() => { setEditing(m); setReplyTo(null); setDraft(m.text); closeMenu(); input.current?.focus(); }}><Pencil size={18} /></button>}
      <button type="button" title={t('Pin')} aria-label={t('Pin')} onClick={()=>{setPinTarget({chatId:chat.id,messageId:m.id});closeMenu();}}><Pin size={18}/></button>
      <button type="button" title={t('Forward')} aria-label={t('Forward')} onClick={() => { setForward([m]); closeMenu(); }}><Forward size={18} /></button>
      <button type="button" title={t(m.starred ? 'Unstar' : 'Star')} aria-label={t(m.starred ? 'Unstar' : 'Star')} onClick={() => { patchMsg([m.id], x => ({ ...x, starred: !x.starred })); closeMenu(); }}><Star size={18} fill={m.starred ? 'currentColor' : 'none'} /></button>
      <button type="button" title={t('Select')} aria-label={t('Select')} onClick={() => { setSelected([m.id]); closeMenu(); }}><CircleCheck size={18} /></button>
      <span className="ms-inl-sep" />
      <button type="button" className="danger" title={t('Delete')} aria-label={t('Delete')} onClick={() => { removeMsgs([m.id]); closeMenu(); }}><Trash2 size={18} /></button>
    </div>
  </div>;
  const itemChat = itemMenu ? chats.find(c => c.id === itemMenu) : null;
  const viewMsg = viewer != null ? images.find(m => m.id === viewer) : null;
  const jump = (id: number) => { setMediaTab(null); setViewer(null); if (window.matchMedia('(max-width: 1050px)').matches) setSide(false); setTimeout(() => document.getElementById('m' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); };
  const memberOf = (h: string) => chat?.members?.find(p => p.handle === h);
  const sender = (m: ChatMsg) => m.from === 'me' ? null : isGroup ? (memberOf(m.from) || { name: m.from, handle: m.from, avatar: '' }) : chat;

  const options = (close: () => void) => chat && <div className="ms-menu-list">
    <button onClick={() => { setFind(''); close(); }}><Search size={18} /> {t('Search in this chat')}</button>
    {chat.kind !== 'saved' && <button onClick={() => { update(chat.id, c => ({ ...c, muted: !c.muted })); close(); }}>{chat.muted ? <><Bell size={18} /> {t('Unmute')}</> : <><BellOff size={18} /> {t('Mute')}</>}</button>}
    <button onClick={() => { togglePin(chat); close(); }}>{chat.pinned ? <><PinOff size={18} /> {t('Unpin chat')}</> : <><Pin size={18} /> {t('Pin chat')}</>}</button>
    <button onClick={() => { setListPick(chat.id); close(); }}><ListPlus size={18} /> {t('Add to list')}</button>
    {chat.kind !== 'saved' && <button onClick={() => { close(); toggleArchive(chat); }}>{chat.archived ? <><ArchiveRestore size={18} /> {t('Unarchive')}</> : <><Archive size={18} /> {t('Archive')}</>}</button>}
    {chat.kind !== 'saved' && chat.kind !== 'group' && <><p className="ms-menu-label">{t('Move to folder')}</p>
      <button className={categoryOf(chat) === 'job' ? 'on' : ''} onClick={() => setCategory('job')}><Briefcase size={18} /> {t('Jobs')}</button>
      <button className={categoryOf(chat) === 'collab' ? 'on' : ''} onClick={() => setCategory('collab')}><Handshake size={18} /> {t('Collaborations')}</button>
      <button className={categoryOf(chat) === 'other' ? 'on' : ''} onClick={() => setCategory('other')}><MessageSquare size={18} /> {t('Other')}</button></>}
    <button className="danger" onClick={() => { close(); if (confirm(t('Clear all messages in this chat on this device?'))) update(chat.id, c => ({ ...c, messages: [], pinnedMsg: undefined, pinnedMessages: [] })); }}><Eraser size={18} /> {t('Clear history')}</button>
    {chat.kind !== 'saved' && <button className="danger" onClick={() => { close(); deleteChat(chat); }}><Trash2 size={18} /> {t(isGroup ? 'Delete group' : 'Delete chat')}</button>}
  </div>;

  const peoplePicker = (multi: boolean, exclude: string[] = []) => {
    const s = pickQ.trim().toLowerCase();
    const ppl = contacts.filter(p => !exclude.includes(p.handle) && (!s || p.name.toLowerCase().includes(s) || p.handle.includes(s)));
    return <div className="np-list">{ppl.map(p => { const on = pick.includes(p.handle);
      return <button type="button" aria-pressed={on} key={p.handle} className={'np-row ' + (on ? 'on' : '')} onClick={() => setPick(multi ? (on ? pick.filter(x => x !== p.handle) : [...pick, p.handle]) : (on ? [] : [p.handle]))}>
        <Avatar chat={{ kind: 'personal', avatar: p.avatar, name: p.name, online: chats.find(c => c.handle === p.handle)?.online }} size={44} dot />
        <span><b>{p.name}</b><small>@{p.handle}</small></span><i className="np-check">{on && <Check size={15} strokeWidth={3} />}</i></button>; })}
      {!ppl.length && <p className="muted ms-note">{t('No people found.')}</p>}</div>;
  };

  const attachItems: [string, typeof Camera, () => void][] = [
    ['Photo', Camera, () => inputs.camera.current?.click()], ['Video', Clapperboard, () => inputs.video.current?.click()], ['Gallery', ImageIcon, () => inputs.gallery.current?.click()],
    ['Voice', Mic, () => void startRec()], ['File', FileText, () => inputs.file.current?.click()], ['Location', MapPin, shareLocation],
    ['Contact', UserRound, () => { setAttachOpen(false); setContactPick(true); }], ['Poll', BarChart3, () => { setAttachOpen(false); setPollDraft({ q: '', o: ['', ''] }); }], ['Intentions', Target, () => { setAttachOpen(false); onShareIntention?.(); }]];

  /* ---------- message body ---------- */
  const body = (m: ChatMsg, mine: boolean) => <>
    {m.forwardedFrom && <span className="ms-fwd">{t('Forwarded from {name}', { name: m.forwardedFrom })}</span>}
    {isGroup && !mine && m.from !== 'system' && <span className="ms-sender">{sender(m)?.name}</span>}
    {m.replyTo != null && (() => { const rq = chat!.messages.find(x => x.id === m.replyTo); return rq && <span className="ms-rq"><b>{rq.from === 'me' ? t('You') : sender(rq)?.name}</b>{rq.deleted ? t('Deleted message') : preview(rq)}</span>; })()}
    {m.gif && <GifView gif={m.gif} maxWidth={280} />}
    {m.image && <img src={m.image} alt={t('Photo')} onClick={e => { e.stopPropagation(); if (!selected) setViewer(m.id); }} />}
    {m.file && (m.file.type.startsWith('video/') ? <video className="ms-video" src={m.file.data} controls preload="metadata" onClick={e => e.stopPropagation()} />
      : m.file.type.startsWith('audio/') ? <span className="ms-music"><Music size={18} /><span className="ms-file-txt"><b>{m.file.name}</b><audio controls preload="metadata" src={m.file.data} onClick={e => e.stopPropagation()} /></span></span>
      : <span className="ms-file"><span className={'ms-file-ic ' + (isPdf(m.file) ? 'pdf' : '')}>{isPdf(m.file) ? 'PDF' : <FileText size={22} />}</span><span className="ms-file-txt"><b>{m.file.name}</b><small>{size(m.file.size)}</small></span>
        <a href={m.file.data} download={m.file.name} onClick={e => e.stopPropagation()} aria-label={t('Download {name}', { name: m.file.name })}><Download size={22} /></a></span>)}
    {m.voice && <VoicePlayer src={m.voice.data} duration={m.voice.duration} seed={m.id} />}
    {m.poll && <span className="ms-poll" onClick={e => e.stopPropagation()}><b>{m.poll.question}</b><small>{t('Poll · {n} votes', { n: m.poll.options.reduce((a, o) => a + o.votes.length, 0) })}</small>
      {m.poll.options.map((o, i) => { const total = m.poll!.options.reduce((a, x) => a + x.votes.length, 0) || 1; const on = o.votes.includes('me');
        return <button key={i} className={on ? 'on' : ''} onClick={() => vote(m, i)}><i style={{ width: `${o.votes.length / total * 100}%` }} /><span>{on && <Check size={14} />}{o.text}</span><em>{o.votes.length}</em></button>; })}</span>}
    {m.contact && <span className="ms-contact"><Avatar chat={{ kind: 'personal', avatar: m.contact.avatar, name: m.contact.name }} size={42} /><span className="ms-file-txt"><b>{m.contact.name}</b><small>@{m.contact.handle}</small></span>
      <button className="ms-outline sm" onClick={e => { e.stopPropagation(); openPerson(m.contact!); }}>{t('Message')}</button></span>}
    {m.location && <a className="ms-location" href={`https://www.openstreetmap.org/?mlat=${m.location.lat}&mlon=${m.location.lon}#map=16/${m.location.lat}/${m.location.lon}`} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()}>
      <span className="ms-file-ic link"><MapPin size={20} /></span><span className="ms-file-txt"><b>{t('Location')}</b><small>{m.location.lat}, {m.location.lon} · {t('Open map')}</small></span></a>}
    {m.deleted ? <i>{t('Message deleted')}</i> : m.text && <span className="ms-text">{m.text}</span>}
  </>;

  return <div className={'ms ' + (chat ? 'has-chat ' : '') + (chat && side && !topicsOn ? 'side-open' : '')}>
    {/* ---------- chat list ---------- */}
    <aside className="ms-list">
      <ResizeHandle pane="chatList" edge="end" container=".ms" label="Resize chat list" />
      <div className="ms-title"><h1>{t('Messages')}</h1><button type="button" className="ms-logo ms-home-logo" onClick={onHome} aria-label={t('Home')}>intent<span>.</span></button><span className="ms-title-tools">{modeSwitch}<button className="icon-button ms-show-m" onClick={() => setNewChat('people')} aria-label={t('New chat')}><SquarePen size={22} /></button></span></div>
      <div className="ms-search-row"><label className="ms-search"><Search size={20} /><input ref={listSearch} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search messages...')} aria-label={t('Search messages...')} /></label>
        <button className="ms-new ms-hide-m" onClick={() => setNewChat('people')} aria-label={t('New chat')} title={t('New chat')}><SquarePen size={20} /></button></div>
      <div className="ms-chips ms-folder-tabs" role="tablist" aria-label={t('Chats')} title={ui.hint}>{folders.map(([k,l])=><span className={'ms-folder-chip '+(folder===k?'active':'')} key={k} draggable onDragStart={e=>{draggingFolder.current=k;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',k);}} onDragEnd={()=>{draggingFolder.current=null;}} onDragOver={e=>{if(draggingFolder.current&&draggingFolder.current!==k){e.preventDefault();e.dataTransfer.dropEffect='move';}}} onDrop={e=>{e.preventDefault();const source=draggingFolder.current;if(source)setFolderOrder(current=>reorderFolder(current,folderIds,source,k));draggingFolder.current=null;}} onContextMenu={e=>{e.preventDefault();setFolderMenu(k);}}>
        <button type="button" role="tab" aria-selected={folder===k} className={folder===k?'on':''} onClick={()=>setFolder(k)}>{l}{k==='unread'&&unreadCount>0&&<em>{unreadCount}</em>}</button>
        <button type="button" className="ms-folder-options" aria-label={`${ui.options}: ${l}`} aria-haspopup="dialog" onClick={()=>setFolderMenu(k)}><MoreHorizontal size={13}/></button>
      </span>)}<button type="button" className="ms-chip-add" onClick={()=>setListEdit({id:String(uid()),name:'',chats:[]})} aria-label={t('New chat list')}><Plus size={16}/></button></div>
      <div className="ms-chats">{list.map(c => { const l = last(c); const cat = categoryOf(c); const p = chatProfiles[c.handle];
        return <ListItem key={c.id} c={c} active={active === c.id} onOpen={() => setActive(c.id)} onMenu={() => setItemMenu(c.id)} label={chatTitle(c)}>
          <Avatar chat={c} size={52} dot />
          <span className="ms-mid"><b><span className="ms-name">{chatTitle(c)}</span>{p?.verified && <BadgeCheck size={17} className="ms-verified" fill="#fff" color="#000" />}{c.kind !== 'group' && TAG[cat] && <span className="ms-tag">{t(TAG[cat])}</span>}{c.muted && <BellOff size={13} className="ms-dim" />}</b>
            <small>{c.topicsEnabled && l ? <span className="ms-topic-tag">{(() => { const tp = withGeneral(c.topics).find(x => x.id === (l.topicId || GENERAL_ID)) || withGeneral(c.topics)[0]; return (tp.icon === '#' ? '# ' : tp.icon + ' ') + topicTitle(t, tp); })()}</span> : null}{l?.from === 'me' && c.kind !== 'saved' ? t('You: ') : ''}{preview(l)}</small></span>
          <span className="ms-end"><small>{l ? listTime(l.at) : ''}</small>{c.unread ? <em className={c.muted ? 'muted' : ''}>{c.unread}</em> : c.pinned ? <Pin size={14} className="ms-dim" /> : l?.from === 'me' && c.kind !== 'saved' ? (l.read ? <CheckCheck size={16} className="ms-read" /> : <Check size={16} className="ms-dim" />) : null}</span>
        </ListItem>; })}
        {!list.length && <p className="muted ms-empty">{t(folder.startsWith('list:') ? 'This list is empty. Long-press a chat and choose “Add to list”.' : 'No chats found.')}</p>}
        <p className="ms-local-note">{t('Direct chats and groups — including group photos, topics and roles — are stored on this device only and are not delivered to other people yet.')}</p></div>
    </aside>

    {/* ---------- conversation ---------- */}
    <section className="ms-chat">{!chat ? <div className="ms-placeholder"><MessageSquare size={40} /><span>{t('Select a chat to start messaging')}</span></div> : <>
      {selected ? <header className="ms-head ms-selbar">
        <button className="icon-button" onClick={() => setSelected(null)} aria-label={t('Cancel')}><X /></button><b>{t('{n} selected', { n: selected.length })}</b>
        <div className="ms-head-actions">
          <button className="icon-button" disabled={!selected.length} onClick={() => { const txt = live.filter(m => selected.includes(m.id) && m.text).map(m => m.text).join('\n'); void navigator.clipboard?.writeText(txt).then(() => toast(t('Copied'))); }} aria-label={t('Copy')}><Copy size={22} /></button>
          <button className="icon-button" disabled={!selected.length} onClick={() => { patchMsg(selected, m => ({ ...m, starred: true })); setSelected(null); toast(t('Added to starred')); }} aria-label={t('Star')}><Star size={22} /></button>
          <button className="icon-button" disabled={!selected.length} onClick={() => setForward(live.filter(m => selected.includes(m.id)))} aria-label={t('Forward')}><Forward size={22} /></button>
          <button className="icon-button danger" disabled={!selected.length} onClick={() => { removeMsgs(selected); setSelected(null); }} aria-label={t('Delete')}><Trash2 size={22} /></button>
        </div></header>
      : <header className="ms-head">
        <button className="icon-button ms-back" onClick={() => setActive(null)} aria-label={t('Back')}><ChevronLeft size={28} /></button>
        <button className={'ms-who' + (isGroup ? ' ms-who-group' : '')} onClick={() => isGroup ? setGroupInfo(true) : setSide(!side)} aria-label={t(isGroup ? 'Group info' : 'Info')}>
          <Avatar chat={chat} size={60} dot />
          <span><b>{chatTitle(chat)}{prof?.verified && <BadgeCheck size={20} className="ms-verified" fill="#fff" color="#000" />}</b><small className={chat.online ? 'online' : ''}>{status(chat)}</small></span>
        </button>
        <div className="ms-head-actions">
          {chat.kind !== 'saved' && <><button className="icon-button ms-hide-m" onClick={notYet} aria-label={t('Start video call')}><Video size={26} /></button>
            <button className="icon-button" onClick={notYet} aria-label={t('Start voice call')}><Phone size={24} /></button>
            <button className="icon-button ms-show-m" onClick={notYet} aria-label={t('Start video call')}><Video size={24} /></button></>}
          <div className="ms-pop-wrap"><button className="icon-button" onClick={() => setHeadMenu(!headMenu)} aria-label={t('More options')} aria-expanded={headMenu}><MoreHorizontal size={24} /></button>
            {headMenu && <div className="ms-pop" onMouseLeave={() => setHeadMenu(false)}>{options(() => setHeadMenu(false))}</div>}</div>
        </div>
      </header>}
      {(prof?.title || prof?.location) && !selected && <div className="ms-sub">{prof.title && <p>{prof.title}</p>}{prof.location && <small><MapPin size={16} /> {prof.location}</small>}</div>}
      <div className={topicsOn ? gs.split + (topicId === null ? ' ' + gs.listMode : '') : 'gt-contents'}>
      {topicsOn && <div className={gs.rail}><TopicList topics={topicRows} active={topicId === null ? null : curTopicId!} onOpen={openTopic} manage onNew={() => setTopicEdit('new')} /></div>}
      <div className={topicsOn ? gs.pane : 'gt-contents'}>
      {topicsOn && curTopic && !selected && <TopicBar topic={topicRows.find(x => x.id === curTopic.id) || curTopic} onBack={() => setTopicId(null)} manage onEdit={() => setTopicEdit(curTopic)}
        onClosed={closed => { setTopics(list => list.map(x => x.id === curTopic.id ? { ...x, closed } : x)); toast(t(closed ? 'Topic closed' : 'Topic reopened')); }}
        onPin={pinned => setTopics(list => list.map(x => x.id === curTopic.id ? { ...x, pinned } : x))} onSearch={() => setFind('')} />}
      {find != null && <div className="ms-find"><Search size={16} /><input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder={t(topicsOn ? 'Search in this topic' : 'Search in this chat')} /><span>{find ? shown.length : ''}</span><button className="icon-button" onClick={() => setFind(null)} aria-label={t('Close')}><X size={16} /></button></div>}
      <PinnedList rows={pinRows} onRemove={unpinMessage} onOpen={id=>{const m=chat.messages.find(x=>x.id===Number(id));if(topicsOn&&m)openTopic(m.topicId||GENERAL_ID);jump(Number(id));}}/>

      <div className="ms-msgs" ref={box}>
        {shown.map((m, i) => { const prevM = shown[i - 1]; const showDay = !prevM || startOf(prevM.at) !== startOf(m.at); const mine = m.from === 'me'; const s = sender(m);
          if (m.from === 'system') return <div key={m.id}>{showDay && <div className="ms-day"><span>{dayLabel(m.at)}</span></div>}<div className="ms-day sys"><span>{m.text}</span></div></div>;
          const meta = <span className="ms-meta">{m.starred && <Star size={12} fill="currentColor" />}{m.edited && t('edited') + ' '}{hhmm(m.at)}{mine && chat.kind !== 'saved' && (m.read ? <CheckCheck size={16} className="ms-read" /> : <Check size={16} />)}</span>;
          const media = !!(m.gif || m.image || m.voice || m.poll || m.contact || m.location || m.file);
          return <div key={m.id}>{showDay && <div className="ms-day"><span>{dayLabel(m.at)}</span></div>}
            <MsgRow m={m} mine={mine} selecting={!!selected} sel={!!selected?.includes(m.id)} onTap={() => selected ? toggleSel(m.id) : !m.deleted && setMsgMenu(m.id)} onLong={() => !m.deleted && setMsgMenu(m.id)} onDouble={() => !m.deleted && react(m, '❤️')}>
              {!mine && s && <Avatar chat={{ kind: 'personal', avatar: s.avatar, name: s.name, online: 'online' in s ? !!s.online : false }} size={42} dot />}
              <div className="ms-stack">
                {menuMsg?.id === m.id && msgQuick(m)}
                <div className={'ms-bub-wrap' + (menuMsg?.id === m.id ? ' on' : '')}>
                  <div className={'ms-bub ' + (m.deleted ? 'del ' : '') + (media && !m.text ? 'media ' : '') + (m.image && !m.text ? 'photo' : '')}>{body(m, mine)}{mine && meta}</div>
                </div>
                {m.reactions && Object.keys(m.reactions).length > 0 && <span className="ms-rx">{Object.entries(m.reactions).map(([e, u]) => <button key={e} className={u.includes('me') ? 'on' : ''} onClick={ev => { ev.stopPropagation(); react(m, e); }}>{e}{u.length > 1 ? ' ' + u.length : ''}</button>)}</span>}
                {menuMsg?.id === m.id && msgBar(m)}
              </div>
              {!m.deleted && !selected && menuMsg?.id !== m.id && <button type="button" className="ms-reply-btn" onClick={e => { e.stopPropagation(); setReplyTo(m); setEditing(null); input.current?.focus(); }} aria-label={t('Reply')} title={t('Reply')}><Reply size={16} /></button>}
              {!mine && meta}
            </MsgRow></div>; })}
        {!shown.length && <p className="muted ms-empty">{t(find ? 'No messages match your search.' : 'No messages yet. Say hi 👋')}</p>}
      </div>

      {topicsOn && curTopic?.closed ? <ClosedTopic manage onReopen={() => setTopics(list => list.map(x => x.id === curTopic.id ? { ...x, closed: false } : x))} /> : <div className="ms-compose">
        {(replyTo || editing) && <div className="ms-ctx">{editing ? <Pencil size={16} /> : <CornerUpLeft size={16} />}<span><b>{editing ? t('Edit message') : t('Reply to {name}', { name: replyTo!.from === 'me' ? t('yourself') : sender(replyTo!)?.name || '' })}</b><small>{preview(editing || replyTo)}</small></span><button className="icon-button" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setDraft(''); } }} aria-label={t('Cancel')}><X size={16} /></button></div>}
        {(image || file) && <div className="ms-attach">{image ? <img src={image} alt={t('Photo')} /> : file && <span className="ms-file"><span className="ms-file-ic"><FileText size={20} /></span><span className="ms-file-txt"><b>{file.name}</b><small>{size(file.size)}</small></span></span>}<button className="icon-button" onClick={() => { setImage(''); setFile(null); }} aria-label={t('Remove')}><X size={16} /></button></div>}
        {emoji && <EmojiPicker onPick={e => setDraft(d => d + e)} onClose={() => setEmoji(false)} />}
        {gifOpen && <GifPicker onPick={g => { push({ gif: toGifAttachment(g) }); setGifOpen(false); }} onClose={() => setGifOpen(false)} />}
        <form className="ms-form" onSubmit={e => { e.preventDefault(); send(); }}>
          <button type="button" className="ms-clip" onClick={() => setAttachOpen(!attachOpen)} aria-label={t('Attach')} aria-expanded={attachOpen} disabled={!!editing}><Paperclip size={22} className="ms-hide-m" /><Plus size={24} className="ms-show-m" /></button>
          <div className="ms-field">
            <textarea ref={input} rows={1} value={draft} maxLength={4000} placeholder={t('Type a message...')} aria-label={t('Message')}
              onChange={e => { setDraft(e.target.value); update(chat.id, c => ({ ...c, draft: e.target.value })); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'Escape') { setReplyTo(null); setEditing(null); } if (e.key === 'ArrowUp' && !draft) { const lm = [...chat.messages].reverse().find(x => x.from === 'me' && !x.deleted && x.text); if (lm) { setEditing(lm); setDraft(lm.text); } } }} />
            <button type="button" className="icon-button" onClick={() => { setGifOpen(false); setEmoji(!emoji); }} aria-label={t('Emoji')}><Smile size={24} /></button>
            <button type="button" className="icon-button ms-gif-btn" onClick={() => { setEmoji(false); setGifOpen(!gifOpen); }} aria-label="GIF">GIF</button>
            <button type="button" className="icon-button" onClick={() => void startRec()} disabled={!!editing} aria-label={t('Record voice message')}><Mic size={24} /></button>
          </div>
          <button type="submit" className="ms-send" disabled={!draft.trim() && !image && !file} aria-label={t(editing ? 'Save' : 'Send')}>{editing ? <Check size={22} /> : <Send size={22} />}</button>
        </form>
        {attachOpen && <div className="ms-attach-bd" onClick={() => setAttachOpen(false)} />}
        {attachOpen && <div className="ms-attach-pop">{attachItems.map(([l, Icon, fn]) => <button key={l} onClick={fn}><span><Icon size={24} /></span>{t(l)}</button>)}</div>}
        <input ref={inputs.file} type="file" hidden onChange={e => void pickFile(e.target.files?.[0], e.target)} />
        <input ref={inputs.camera} type="file" accept="image/*" capture="environment" hidden onChange={e => void pickFile(e.target.files?.[0], e.target)} />
        <input ref={inputs.gallery} type="file" accept="image/*,video/*" hidden onChange={e => void pickFile(e.target.files?.[0], e.target)} />
        <input ref={inputs.video} type="file" accept="video/*" hidden onChange={e => void pickFile(e.target.files?.[0], e.target)} />
      </div>}
      </div></div>

      {rec && <div className="ms-rec">
        <div className="ms-rec-stage">
          <div className={'ms-rec-ring ' + (rec.paused ? 'paused' : '')} style={{ ['--lvl' as string]: String(rec.levels[rec.levels.length - 1] || 0) }}>
            <button onClick={pauseRec} aria-label={t(rec.paused ? 'Resume recording' : 'Pause recording')}>{rec.paused ? <Play size={34} fill="currentColor" /> : <Pause size={34} fill="currentColor" />}</button>
          </div>
          <b className="ms-rec-time">{mmss(rec.secs)}</b>
          <div className="ms-rec-wave">{Array.from({ length: 36 }, (_, i) => rec.levels[i - (36 - rec.levels.length)] ?? 0).map((l, i) => <i key={i} style={{ height: `${8 + l * 92}%` }} />)}</div>
          <small className="muted">{t('Up to {n} seconds', { n: MAX_VOICE_S })}</small>
        </div>
        <div className="ms-rec-bar">
          <button className="ms-rec-del" onClick={() => stopRec(true)} aria-label={t('Cancel')}><Trash2 size={22} /></button>
          <span className="ms-rec-hint" onPointerDown={e => { slide.current = e.clientX; (e.target as HTMLElement).setPointerCapture(e.pointerId); }} onPointerMove={e => { if (slide.current != null && slide.current - e.clientX > 110) { slide.current = null; stopRec(true); } }} onPointerUp={() => { slide.current = null; }}>
            <ChevronLeft size={16} /> <span className="ms-show-m">{t('Slide to cancel')}</span><span className="ms-hide-m">{t('Esc to cancel')}</span></span>
          <button className="ms-rec-send" onClick={() => stopRec(false)} aria-label={t('Send voice message')}><Send size={22} /></button>
        </div>
      </div>}
    </>}</section>

    {/* ---------- profile side panel ---------- */}
    {chat && side && !topicsOn && <ResizeHandle pane="chatSide" edge="start" anchor="before" container=".ms" label="Resize profile panel" className="pane-wide-only" />}
    {chat && side && !topicsOn && <aside className="ms-side">
      {/* desktop */}
      <div className="ms-side-desk">
        <button className="icon-button ms-side-close" onClick={() => setSide(false)} aria-label={t('Close')}><X /></button>
        <div className="ms-card ms-profile">
          <div className="ms-cover" style={prof?.cover ? { backgroundImage: `url(${prof.cover})` } : undefined} />
          <div className="ms-profile-av"><Avatar chat={chat} size={100} dot /></div>
          <h3>{chatTitle(chat)}{prof?.verified && <BadgeCheck size={22} className="ms-verified" fill="#fff" color="#000" />}</h3>
          {chat.kind !== 'saved' && !isGroup && <p className="ms-handle">@{chat.handle}</p>}
          {isGroup && <p className="ms-handle">{status(chat)}</p>}
          {isGroup && chat.description && <p className="ms-role ms-group-desc">{chat.description}</p>}
          {prof?.title && <p className="ms-role">{prof.title}</p>}
          {prof?.location && <p className="ms-loc"><MapPin size={16} /> {prof.location}</p>}
          <div className="ms-profile-btns">
            {isGroup ? <button className="ms-outline" onClick={() => setGroupInfo(true)}><Info size={16} /> {t('Group info')}</button>
              : chat.kind !== 'saved' && <button className="ms-outline" onClick={() => onViewProfile?.(chat.handle)}>{t('View profile')}</button>}
            <button className="ms-outline" onClick={() => setOptionsSheet(true)}>{t('More options')} <MoreHorizontal size={16} /></button>
          </div>
        </div>
        {isGroup && <div className="ms-card"><div className="ms-card-head"><b>{t('Members')}</b><button onClick={() => setAddMembers(true)}><UserPlus size={14} /> {t('Add')}</button></div>{members(chat)}</div>}
        <div className="ms-card">
          <div className="ms-card-head"><b>{t('Shared')}</b>{(sharedTop.length + images.length) > 0 && <button onClick={() => setMediaTab(files.length ? 'files' : links.length ? 'links' : 'media')}>{t('View all')}</button>}</div>
          {sharedTop.slice(0, 4).map(s => s.url ? <a key={s.k} className="ms-shared" href={s.url} target="_blank" rel="noopener noreferrer nofollow"><span className="ms-file-ic link"><Link2 size={18} /></span><span className="ms-file-txt"><b>{host(s.url)}</b><small>{s.url.replace(/^https:\/\//, '')}</small></span></a>
            : <div key={s.k} className="ms-shared"><span className={'ms-file-ic ' + (isPdf(s.m.file!) ? 'pdf' : '')}>{isPdf(s.m.file!) ? 'PDF' : <FileText size={18} />}</span><span className="ms-file-txt"><b>{s.m.file!.name}</b><small>{size(s.m.file!.size)}</small></span><a href={s.m.file!.data} download={s.m.file!.name} aria-label={t('Download {name}', { name: s.m.file!.name })}><Download size={18} /></a></div>)}
          {images.length > 0 && <div className="ms-thumbs">{images.slice(-4).reverse().map(m => <button key={m.id} onClick={() => setViewer(m.id)}><img src={m.image} alt="" /></button>)}</div>}
          {!sharedTop.length && !images.length && <p className="muted ms-note">{t('Files, photos and links from this chat appear here.')}</p>}
        </div>
        {chat.kind !== 'saved' && <div className="ms-card">
          <div className="ms-card-head"><b>{t('Quick actions')}</b></div>
          <button className="ms-action" onClick={notYet}><Video size={20} /> {t('Start video call')}</button>
          <button className="ms-action" onClick={notYet}><Phone size={20} /> {t('Start voice call')}</button>
          <button className="ms-action" onClick={() => onShareIntention?.()}><Plus size={20} /> {t('Share intention')}</button>
        </div>}
      </div>

      {/* phone */}
      <div className="ms-side-mob">
        <div className="ms-mob-top"><button className="icon-button" onClick={() => setSide(false)} aria-label={t('Back')}><ChevronLeft size={28} /></button>{isGroup && <button className="ms-link" onClick={() => setGroupInfo(true)}>{t('Edit')}</button>}</div>
        <div className="ms-mob-hero"><Avatar chat={chat} size={112} dot /><h3>{chatTitle(chat)}</h3>{chat.kind !== 'saved' && !isGroup && <p>@{chat.handle}</p>}<small className={chat.online ? 'online' : ''}>{status(chat)}</small></div>
        <div className="ms-mob-actions">
          {chat.kind !== 'saved' && <><button onClick={notYet}><span><Phone size={20} /></span>{t('Call')}</button><button onClick={notYet}><span><Video size={20} /></span>{t('Video')}</button></>}
          <button onClick={() => { setSide(false); setFind(''); }}><span><Search size={20} /></span>{t('Search')}</button>
          {chat.kind !== 'saved' && <button onClick={() => update(chat.id, c => ({ ...c, muted: !c.muted }))}><span>{chat.muted ? <BellOff size={20} /> : <Bell size={20} />}</span>{t(chat.muted ? 'Unmute' : 'Mute')}</button>}
        </div>
        <div className="ms-mob-card">
          <div className="ms-card-head"><b>{t('Media, Links and Files')}</b><button onClick={() => setMediaTab('media')}>{t('See all')} <ChevronRight size={14} /></button></div>
          {images.length ? <div className="ms-thumbs">{images.slice(-3).reverse().map(m => <button key={m.id} onClick={() => setViewer(m.id)}><img src={m.image} alt="" /></button>)}{images.length > 3 && <button className="more" onClick={() => setMediaTab('media')}>+{images.length - 3}</button>}</div> : <p className="muted ms-note">{t('Photos you share appear here.')}</p>}
          <button className="ms-row-btn" onClick={() => setMediaTab('links')}><Link2 size={18} /> {t('Shared Links')}<em>{links.length}</em><ChevronRight size={16} /></button>
          <button className="ms-row-btn" onClick={() => setMediaTab('files')}><FileText size={18} /> {t('Shared Files')}<em>{files.length}</em><ChevronRight size={16} /></button>
          <button className="ms-row-btn" onClick={() => setMediaTab('starred')}><Star size={18} /> {t('Starred Messages')}<em>{starred.length}</em><ChevronRight size={16} /></button>
        </div>
        {isGroup && <div className="ms-mob-card"><div className="ms-card-head"><b>{t('Members')}</b><button onClick={() => setAddMembers(true)}><UserPlus size={14} /> {t('Add')}</button></div>{members(chat)}</div>}
        <div className="ms-mob-card">
          {chat.kind !== 'saved' && <div className="ms-row-btn"><Bell size={18} /> {t('Notifications')}<button className={'toggle ' + (chat.muted ? '' : 'on')} onClick={() => update(chat.id, c => ({ ...c, muted: !c.muted }))} aria-label={t('Notifications')} aria-pressed={!chat.muted} /></div>}
          <button className="ms-row-btn" onClick={() => setOptionsSheet(true)}><Settings size={18} /> {t('Chat Settings')}<ChevronRight size={16} /></button>
          <button className="ms-row-btn" onClick={() => setPrivacy(true)}><Lock size={18} /> {t('Privacy')}<ChevronRight size={16} /></button>
        </div>
      </div>
    </aside>}

    {/* ---------- overlays ---------- */}
    {itemChat && <Sheet title={<span className="sh-who"><Avatar chat={itemChat} size={36} /> {chatTitle(itemChat)}</span>} onClose={() => setItemMenu(null)}>
      <div className="ms-menu-list">
        <button onClick={() => { togglePin(itemChat); setItemMenu(null); }}>{itemChat.pinned ? <><PinOff size={18} /> {t('Unpin')}</> : <><Pin size={18} /> {t('Pin to top')} <small className="muted">{pinCount}/{MAX_PINS}</small></>}</button>
        <button onClick={() => { update(itemChat.id, c => ({ ...c, unread: c.unread ? 0 : 1 })); setItemMenu(null); }}>{itemChat.unread ? <><MailOpen size={18} /> {t('Mark as read')}</> : <><Mail size={18} /> {t('Mark as unread')}</>}</button>
        {itemChat.kind !== 'saved' && <button onClick={() => { update(itemChat.id, c => ({ ...c, muted: !c.muted })); setItemMenu(null); }}>{itemChat.muted ? <><Bell size={18} /> {t('Unmute')}</> : <><BellOff size={18} /> {t('Mute')}</>}</button>}
        <button onClick={() => { setListPick(itemChat.id); setItemMenu(null); }}><ListPlus size={18} /> {t('Add to list')}</button>
        {itemChat.kind !== 'saved' && <button onClick={() => { toggleArchive(itemChat); setItemMenu(null); }}>{itemChat.archived ? <><ArchiveRestore size={18} /> {t('Unarchive')}</> : <><Archive size={18} /> {t('Archive')}</>}</button>}
        {itemChat.kind !== 'saved' && <button className="danger" onClick={() => { setItemMenu(null); deleteChat(itemChat); }}><Trash2 size={18} /> {t(itemChat.kind === 'group' ? 'Delete group' : 'Delete chat')}</button>}
      </div>
    </Sheet>}

    {optionsSheet && chat && <Sheet title={t('Chat Settings')} onClose={() => setOptionsSheet(false)}>{options(() => setOptionsSheet(false))}</Sheet>}

    {privacy && chat && <Sheet title={t('Privacy')} onClose={() => setPrivacy(false)}>
      <p className="sh-text">{t('This chat is stored only in this browser on this device. It is not sent to other people or to our servers yet.')}</p>
      <p className="sh-text">{t('End-to-end encryption is not implemented. Do not share passwords, card numbers or other sensitive data in chats.')}</p>
      <div className="ms-menu-list"><button className="danger" onClick={() => { setPrivacy(false); if (confirm(t('Clear all messages in this chat on this device?'))) update(chat.id, c => ({ ...c, messages: [], pinnedMsg: undefined, pinnedMessages: [] })); }}><Eraser size={18} /> {t('Clear history')}</button></div>
    </Sheet>}

    {pinTarget&&<PinDialog local onClose={()=>setPinTarget(null)} onChoose={scope=>{const target=chats.find(c=>c.id===pinTarget.chatId);if(target&&target.messages.some(m=>m.id===pinTarget.messageId&&!m.deleted))update(target.id,c=>({...c,pinnedMsg:undefined,pinnedMessages:[...localPins(c).filter(p=>!(p.messageId===pinTarget.messageId&&p.scope===scope)),{messageId:pinTarget.messageId,scope}]}));setPinTarget(null);}}/>}
    {folderMenu&&<Sheet title={`${ui.options} · ${folders.find(([id])=>id===folderMenu)?.[1]||''}`} onClose={()=>setFolderMenu(null)}><div className="ms-menu-list"><button type="button" disabled={orderedIds.indexOf(folderMenu)<=0} onClick={()=>moveFolderInMenu(-1)}><ChevronLeft size={18}/>{ui.left}</button><button type="button" disabled={orderedIds.indexOf(folderMenu)>=orderedIds.length-1} onClick={()=>moveFolderInMenu(1)}><ChevronRight size={18}/>{ui.right}</button>{folderMenu.startsWith('list:')&&<button type="button" onClick={()=>{const item=lists.find(list=>'list:'+list.id===folderMenu);if(item)setListEdit(item);setFolderMenu(null);}}><Pencil size={18}/>{t('Edit list')}</button>}</div></Sheet>}

    {newChat && <Sheet title={t('New chat')} onClose={closeNew} className="np">
      <label className="ms-search sm"><Search size={18}/><input autoFocus value={pickQ} onChange={e=>setPickQ(e.target.value)} placeholder={ui.search} aria-label={ui.search}/></label>
      <div className="ms-chips np-tabs"><button type="button" className="on">{t('People')}</button><button type="button" onClick={()=>{setNewChat(null);setWizard(true);}}>{t('New group')}</button></div>
      {pick.length>0&&<div className="np-selected" aria-label={ui.selected}>{pick.map(handle=>{const person=contacts.find(p=>p.handle===handle);return person&&<button type="button" key={handle} onClick={()=>setPick(current=>current.filter(id=>id!==handle))} aria-label={`${t('Remove')} ${person.name}`}><span>{person.name}</span><X size={13}/></button>;})}</div>}
      {peoplePicker(true)}<button type="button" className="np-cta" disabled={!pick.length} onClick={()=>{if(pick.length>=2){setNewChat(null);setWizard(true);return;}const person=contacts.find(p=>p.handle===pick[0]);if(person)openPerson(person);closeNew();}}>{pick.length>=2?<><Users size={18}/>{ui.group} · {pick.length}</>:<><MessageSquare size={18}/>{t('Start chat')}</>}</button>
      <p className="ms-local-note">{t('Only people from this device are listed until public profiles are connected.')}</p>
    </Sheet>}

    {wizard && <CreateGroupModal candidates={contacts.map(p => ({ id: p.handle, name: p.name, sub: '@' + p.handle, avatar: p.avatar }))} minMembers={1} minName={2} initialMembers={contacts.filter(p=>pick.includes(p.handle)).map(p=>({id:p.handle,name:p.name,sub:"@"+p.handle,avatar:p.avatar}))}
      onClose={() => {setWizard(false);setPick([]);}} onCreate={createGroup} note={t('This group, its photo, topics and roles are saved on this device only. Members are not notified yet.')} />}

    {addMembers && chat && isGroup && <AddMembersModal candidates={contacts.map(p => ({ id: p.handle, name: p.name, sub: '@' + p.handle, avatar: p.avatar }))} exclude={chat.members?.map(p => p.handle) || []}
      onClose={() => setAddMembers(false)} onAdd={people => { const ids = people.map(x => x.id); const add = contacts.filter(p => ids.includes(p.handle));
        update(chat.id, c => ({ ...c, members: [...(c.members || []), ...add], roles: { ...(c.roles || {}), ...Object.fromEntries(add.map(p => [p.handle, 'member' as GroupRole])) }, messages: [...c.messages, { id: uid(), from: 'system', text: t('You added {names}', { names: add.map(p => p.name).join(', ') }), at: Date.now() }] })); setAddMembers(false); }} />}

    {groupInfo && chat && isGroup && <GroupInfoModal name={chat.name} description={chat.description || ''} avatar={chat.avatar} color={chat.color ?? 0} topicsEnabled={!!chat.topicsEnabled} myRole={myRole}
      members={[{ id: 'me', name: t('You'), role: 'owner', you: true } as InfoMember, ...(chat.members || []).map(p => ({ id: p.handle, name: p.name, sub: '@' + p.handle, avatar: p.avatar, role: chat.roles?.[p.handle] || 'member' } as InfoMember))]}
      onClose={() => setGroupInfo(false)}
      onSave={pr => update(chat.id, c => ({ ...c, name: pr.name.slice(0, 60), description: pr.description || undefined, avatar: pr.avatar, color: pr.color, topicsEnabled: pr.topicsEnabled, topics: pr.topicsEnabled ? withGeneral(c.topics) : c.topics }))}
      onAddMembers={() => { setGroupInfo(false); setAddMembers(true); }}
      onInvite={() => toast(t('Invite links need a server connection. Device-only groups cannot be joined from other devices yet.'))}
      onRole={(m, role) => update(chat.id, c => ({ ...c, roles: { ...(c.roles || {}), [m.id]: role }, messages: [...c.messages, { id: uid(), from: 'system', text: t(role === 'admin' ? '{name} is now an admin' : '{name} is no longer an admin', { name: m.name }), at: Date.now() }] }))}
      onRemove={m => update(chat.id, c => ({ ...c, members: c.members?.filter(x => x.handle !== m.id), messages: [...c.messages, { id: uid(), from: 'system', text: t('You removed {name}', { name: m.name }), at: Date.now() }] }))}
      onDelete={() => { setGroupInfo(false); deleteChat(chat); }}
      note={t('Photo, description, topics and roles of this group are stored on this device only.')} />}

    {topicEdit && chat && <TopicModal initial={topicEdit === 'new' ? undefined : topicRows.find(x => x.id === topicEdit.id) || topicEdit} onClose={() => setTopicEdit(null)} onSave={saveTopic} />}

    {listEdit && <Sheet title={t(lists.some(l => l.id === listEdit.id) ? 'Edit list' : 'New chat list')} onClose={() => setListEdit(null)} className="np">
      <input className="np-name" autoFocus value={listEdit.name} maxLength={24} onChange={e => setListEdit({ ...listEdit, name: e.target.value })} placeholder={t('List name, e.g. Family')} aria-label={t('List name')} />
      <p className="muted ms-note">{t('Chats in this list · {n}', { n: listEdit.chats.length })}</p>
      <div className="np-list">{chats.filter(c => !c.archived).map(c => { const on = listEdit.chats.includes(c.id);
        return <button key={c.id} className={'np-row ' + (on ? 'on' : '')} onClick={() => setListEdit({ ...listEdit, chats: on ? listEdit.chats.filter(x => x !== c.id) : [...listEdit.chats, c.id] })}><Avatar chat={c} size={40} /><span><b>{chatTitle(c)}</b><small>{status(c)}</small></span><i className="np-check">{on && <Check size={15} strokeWidth={3} />}</i></button>; })}</div>
      <div className="np-row-btns">{lists.some(l => l.id === listEdit.id) && <button className="ms-outline danger" onClick={() => delList(listEdit.id)}><Trash2 size={16} /> {t('Delete list')}</button>}
        <button className="np-cta" disabled={!listEdit.name.trim()} onClick={saveList}>{t('Save')}</button></div>
    </Sheet>}

    {listPick && <Sheet title={t('Add to list')} onClose={() => setListPick(null)}>
      <div className="ms-menu-list">{lists.map(l => { const on = l.chats.includes(listPick);
        return <button key={l.id} onClick={() => setLists(lists.map(x => x.id === l.id ? { ...x, chats: on ? x.chats.filter(c => c !== listPick) : [...x.chats, listPick] } : x))}><i className={'np-check ' + (on ? 'on' : '')}>{on && <Check size={14} strokeWidth={3} />}</i> {l.name}</button>; })}
        <button onClick={() => { setListEdit({ id: String(uid()), name: '', chats: [listPick] }); setListPick(null); }}><Plus size={18} /> {t('New chat list')}</button></div>
    </Sheet>}

    {contactPick && <Sheet title={t('Share contact')} onClose={() => { setContactPick(false); setPick([]); }} className="np">
      {peoplePicker(false)}
      <button className="np-cta" disabled={pick.length !== 1} onClick={() => { const p = contacts.find(x => x.handle === pick[0]); if (p) push({ contact: p }); setContactPick(false); setPick([]); }}><Send size={18} /> {t('Send')}</button>
    </Sheet>}

    {pollDraft && <Sheet title={t('New poll')} onClose={() => setPollDraft(null)}>
      <input className="np-name" autoFocus value={pollDraft.q} maxLength={140} onChange={e => setPollDraft({ ...pollDraft, q: e.target.value })} placeholder={t('Ask a question')} aria-label={t('Question')} />
      {pollDraft.o.map((o, i) => <div key={i} className="np-opt"><input className="np-name" value={o} maxLength={60} onChange={e => setPollDraft({ ...pollDraft, o: pollDraft.o.map((x, k) => k === i ? e.target.value : x) })} placeholder={t('Choice {n}', { n: i + 1 })} />{pollDraft.o.length > 2 && <button className="icon-button" onClick={() => setPollDraft({ ...pollDraft, o: pollDraft.o.filter((_, k) => k !== i) })} aria-label={t('Remove')}><X size={16} /></button>}</div>)}
      {pollDraft.o.length < 6 && <button className="ms-outline" onClick={() => setPollDraft({ ...pollDraft, o: [...pollDraft.o, ''] })}><Plus size={16} /> {t('Add choice')}</button>}
      <button className="np-cta" disabled={!pollDraft.q.trim() || pollDraft.o.filter(o => o.trim()).length < 2} onClick={sendPoll}>{t('Send poll')}</button>
    </Sheet>}

    {mediaTab && chat && <Sheet title={t('Media, Links and Files')} onClose={() => setMediaTab(null)} className="np">
      <div className="ms-chips np-tabs">{(['media', 'links', 'files', 'starred'] as const).map(k => <button key={k} className={mediaTab === k ? 'on' : ''} onClick={() => setMediaTab(k)}>{t(k === 'media' ? 'Media' : k === 'links' ? 'Links' : k === 'files' ? 'Files' : 'Starred')}</button>)}</div>
      {mediaTab === 'media' && (images.length ? <div className="ms-grid">{[...images].reverse().map(m => <button key={m.id} onClick={() => { setMediaTab(null); setViewer(m.id); }}><img src={m.image} alt="" /></button>)}</div> : <p className="muted ms-note">{t('Photos you share appear here.')}</p>)}
      {mediaTab === 'links' && <div className="np-list">{links.map(l => <a key={l.key} className="ms-shared" href={l.url} target="_blank" rel="noopener noreferrer nofollow"><span className="ms-file-ic link"><Link2 size={18} /></span><span className="ms-file-txt"><b>{host(l.url)}</b><small>{l.url.replace(/^https:\/\//, '')}</small></span></a>)}{!links.length && <p className="muted ms-note">{t('No links yet.')}</p>}</div>}
      {mediaTab === 'files' && <div className="np-list">{files.map(m => <div key={m.id} className="ms-shared"><span className={'ms-file-ic ' + (isPdf(m.file!) ? 'pdf' : '')}>{isPdf(m.file!) ? 'PDF' : <FileText size={18} />}</span><span className="ms-file-txt"><b>{m.file!.name}</b><small>{size(m.file!.size)} · {listTime(m.at)}</small></span><a href={m.file!.data} download={m.file!.name} aria-label={t('Download {name}', { name: m.file!.name })}><Download size={18} /></a></div>)}{!files.length && <p className="muted ms-note">{t('No files yet.')}</p>}</div>}
      {mediaTab === 'starred' && <div className="np-list">{starred.map(m => <button key={m.id} className="ms-shared" onClick={() => jump(m.id)}><span className="ms-file-ic"><Star size={18} /></span><span className="ms-file-txt"><b>{preview(m)}</b><small>{listTime(m.at)}</small></span></button>)}{!starred.length && <p className="muted ms-note">{t('Long-press a message and choose “Star” to keep it here.')}</p>}</div>}
    </Sheet>}

    {viewMsg && chat && <div className="ms-viewer" role="dialog" aria-modal="true" aria-label={t('Photo')}>
      <div className="ms-viewer-top"><button className="icon-button" onClick={() => setViewer(null)} aria-label={t('Back')}><ChevronLeft size={28} /></button>
        {(() => { const s = sender(viewMsg); const who = viewMsg.from === 'me' ? { name: t('You'), avatar: '' } : { name: s?.name || '', avatar: s?.avatar || '' };
          return <span className="ms-viewer-who"><Avatar chat={{ kind: 'personal', avatar: who.avatar, name: who.name }} size={40} /><span><b>{who.name}</b><small>{dayLabel(viewMsg.at)}, {hhmm(viewMsg.at)}</small></span></span>; })()}</div>
      <div className="ms-viewer-img"><img src={viewMsg.image} alt="" /></div>
      <div className="ms-viewer-strip">{images.map(m => <button key={m.id} className={m.id === viewMsg.id ? 'on' : ''} onClick={() => setViewer(m.id)}><img src={m.image} alt="" /></button>)}<button className="add" onClick={() => { setViewer(null); inputs.gallery.current?.click(); }} aria-label={t('Add photo')}><Plus size={22} /></button></div>
      <div className="ms-viewer-bar">
        <a href={viewMsg.image} download="intent-photo.jpg" aria-label={t('Save photo')}><Share size={22} /></a>
        <button onClick={() => react(viewMsg, '❤️')} aria-label={t('Like')}><Heart size={22} fill={viewMsg.reactions?.['❤️']?.includes('me') ? '#ff3040' : 'none'} color={viewMsg.reactions?.['❤️']?.includes('me') ? '#ff3040' : 'currentColor'} /></button>
        <button onClick={() => jump(viewMsg.id)} aria-label={t('Show in chat')}><Info size={22} /></button>
        <button onClick={() => { const id = viewMsg.id; const rest = images.filter(m => m.id !== id); removeMsgs([id]); setViewer(rest.length ? rest[rest.length - 1].id : null); }} aria-label={t('Delete')}><Trash2 size={22} /></button>
      </div>
    </div>}

    {forward && <Sheet title={t('Forward to…')} onClose={() => setForward(null)} className="np">
      <div className="np-list">{chats.filter(c => !c.archived).map(c => <button key={c.id} className="np-row" onClick={() => doForward(c)}><Avatar chat={c} size={40} /><span><b>{chatTitle(c)}</b><small>{status(c)}</small></span><ChevronRight size={16} /></button>)}</div>
    </Sheet>}
  </div>;

  function members(c: Chat) {
    return <div className="ms-members">
      <div className="ms-member"><Avatar chat={{ kind: 'personal', avatar: '', name: t('You') }} size={36} /><span><b>{t('You')}</b><small>{t('Owner')}</small></span></div>
      {c.members?.map(p => <div key={p.handle} className="ms-member"><Avatar chat={{ kind: 'personal', avatar: p.avatar, name: p.name }} size={36} /><span><b>{p.name}</b><small>@{p.handle}{c.roles?.[p.handle] === 'admin' ? ' · ' + t('Admin') : ''}</small></span>
        <button className="icon-button" onClick={() => update(c.id, x => ({ ...x, members: x.members?.filter(m => m.handle !== p.handle), messages: [...x.messages, { id: uid(), from: 'system', text: t('You removed {name}', { name: p.name }), at: Date.now() }] }))} aria-label={t('Remove {name}', { name: p.name })}><X size={16} /></button></div>)}
    </div>;
  }
}

function MsgRow({ m, mine, selecting, sel, onTap, onLong, onDouble, children }: { m: ChatMsg; mine: boolean; selecting: boolean; sel: boolean; onTap: () => void; onLong: () => void; onDouble: () => void; children: ReactNode }) {
  const press = usePress(onLong);
  // Only the message bubble itself opens the menu (the whole row still works in multi-select mode).
  const onBubble = (e: { target: EventTarget }) => !!(e.target as HTMLElement).closest?.('.ms-bub');
  const tap = useCallback((e: React.MouseEvent) => { if (press.wasLong()) return; if (selecting || onBubble(e)) onTap(); }, [onTap, press, selecting]);
  return <div id={'m' + m.id} className={'ms-row ' + (mine ? 'mine ' : '') + (selecting ? 'selecting ' : '') + (sel ? 'sel' : '')} onClick={tap} onDoubleClick={e => { if (onBubble(e)) onDouble(); }}
    onPointerDown={e => { if (onBubble(e)) press.onPointerDown(e); }} onPointerUp={press.onPointerUp} onPointerLeave={press.onPointerLeave} onPointerCancel={press.onPointerCancel} onContextMenu={e => { if (onBubble(e)) press.onContextMenu(e); }}>
    {selecting && <i className={'np-check ' + (sel ? 'on' : '')}>{sel && <Check size={14} strokeWidth={3} />}</i>}
    {children}
  </div>;
}
