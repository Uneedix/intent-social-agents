import type { GroupRole, GroupTopic } from '../../lib/data';

/** Eight avatar/topic colours (index stored as 0–7, also on the server). */
export const GROUP_COLORS: [string, string][] = [
  ['#5ea0ff', '#2f6fe0'], ['#ff8a65', '#e0533a'], ['#b388ff', '#7c4dff'], ['#4dd0a1', '#16a37a'],
  ['#ffca5f', '#e89a1c'], ['#ff6b9a', '#d83a6c'], ['#64d2ff', '#1e9fd6'], ['#a5a5ab', '#5c5c63'],
];
export const colorOf = (i = 0) => GROUP_COLORS[((i % 8) + 8) % 8];
export const gradient = (i = 0) => { const [a, b] = colorOf(i); return `linear-gradient(135deg, ${a}, ${b})`; };
/** Stable colour for a name, used when the creator did not pick one. */
export const colorFor = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8;
export const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map(w => [...w][0]).join('').slice(0, 2).toUpperCase() || '#';

export const TOPIC_ICONS = ['💬', '📣', '🎨', '💡', '📌', '🛠️', '📅', '🎵', '📷', '🎮', '💼', '❓', '🔥', '🚀', '📚', '☕'];
export const GENERAL_ID = 'general';
export const generalTopic = (): GroupTopic => ({ id: GENERAL_ID, title: 'General', icon: '#', color: 7, general: true });

/** General first if no other ordering applies; pinned topics on top, then most recent activity. */
export function sortTopics<T extends { pinned?: boolean; general?: boolean }>(topics: T[], lastAt: (t: T) => number): T[] {
  return [...topics].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || lastAt(b) - lastAt(a) || Number(!!b.general) - Number(!!a.general));
}
/** Topics array that always contains exactly one General topic. */
export function withGeneral(topics: GroupTopic[] | undefined): GroupTopic[] {
  const list = (topics || []).filter(t => t.id !== GENERAL_ID);
  const general = (topics || []).find(t => t.id === GENERAL_ID) || generalTopic();
  return [{ ...general, general: true, closed: false }, ...list];
}
export const canManage = (role?: GroupRole | string | null) => role === 'owner' || role === 'admin';
/** Server-equivalent permission rules, used for local groups and to hide unavailable actions. */
export const canRemove = (me: GroupRole | string | null | undefined, target: GroupRole | string) =>
  target !== 'owner' && (me === 'owner' || (me === 'admin' && target === 'member'));
export const canPost = (topic: Pick<GroupTopic, 'closed'> | undefined) => !topic?.closed;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Per-viewer "last seen" timestamps for topic unread badges (browser storage, optional). */
export function readSeen(scope: string): Record<string, string> {
  try { const v = JSON.parse(globalThis.localStorage?.getItem('intent-group-seen:' + scope) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function writeSeen(scope: string, seen: Record<string, string>) {
  try { globalThis.localStorage?.setItem('intent-group-seen:' + scope, JSON.stringify(seen)); } catch { /* storage blocked: badges reset next visit */ }
}
