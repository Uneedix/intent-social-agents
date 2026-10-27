// Pure Communities model: types, permissions (UI hints only — RLS is the authority),
// validation and schema feature-detection. No React, no network.

export type Privacy = 'public' | 'request' | 'private';
export type Role = 'owner' | 'admin' | 'moderator' | 'editor' | 'member';
export type Threshold = 'admin' | 'moderator';
export type Community = {
  id: string; owner_id: string; name: string; description: string; privacy: Privacy;
  channels_enabled: boolean; posting_permission: 'members' | 'staff'; comments_permission: string;
  cover_url: string | null; avatar_url: string | null; created_at?: string;
  // Present only once 20261025100000_community_roles.sql is applied.
  category?: string; tags?: string[];
  manage_channels_role?: Threshold; approve_requests_role?: Threshold; remove_members_role?: Threshold;
};
export type Member = { user_id: string; role: Role | string };
export type Post = { id: string; body: string; author_id: string; created_at: string };
export type ChannelKind = 'text' | 'voice';
export type VoiceAccess = 'open' | 'closed';
// kind/access/max_participants exist only once 20261025140000_voice_channels.sql is applied.
export type Channel = { id: string; name: string; category: string; kind?: ChannelKind; access?: VoiceAccess; max_participants?: number };
export type Msg = { id: string; body: string; author_id: string; created_at: string };
export type JoinState = 'none' | 'member' | 'pending';

/** One card in the directory/rail: a real community or an illustrative example. */
export type CardItem = {
  key: string; name: string; description: string; category: string; tags: string[];
  cover: string | null; icon: string | null; members: number | null; privacy: Privacy;
  demo: boolean; join: JoinState; avatars: string[]; owned?: boolean;
};

export const MAIN_CATEGORIES = ['business', 'technology', 'lifestyle', 'self-improvement', 'travel', 'creative'] as const;
export const MORE_CATEGORIES = ['finance', 'health', 'music', 'photography', 'city', 'other'] as const;
export const CATEGORIES = [...MAIN_CATEGORIES, ...MORE_CATEGORIES];
export const CATEGORY_LABEL: Record<string, string> = {
  business: 'Business', technology: 'Technology', lifestyle: 'Lifestyle', 'self-improvement': 'Self-improvement',
  travel: 'Travel', creative: 'Creative', finance: 'Finance', health: 'Health & fitness', music: 'Music',
  photography: 'Photography', city: 'City life', other: 'Other',
};

export const NAME_MIN = 3, NAME_MAX = 100, DESCRIPTION_MAX = 500, TAG_MAX = 24, TAGS_MAX = 5, CHANNEL_MAX = 80;

const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, editor: 2, member: 1 };
export const rank = (role?: string | null) => (role && RANK[role]) || 0;
/** Display role: legacy 'editor' rows are shown as moderators. */
export const displayRole = (role?: string | null) => (role === 'editor' ? 'moderator' : role || 'member');

export type Action = 'post' | 'manage_channels' | 'approve' | 'remove' | 'roles' | 'settings' | 'moderate';
/** Mirrors the SQL policies so the UI only offers what the server will allow. */
export function can(c: Pick<Community, 'posting_permission' | 'manage_channels_role' | 'approve_requests_role' | 'remove_members_role'>, role: string | null | undefined, action: Action) {
  const r = rank(role);
  switch (action) {
    case 'post': return r >= (c.posting_permission === 'staff' ? 2 : 1);
    case 'manage_channels': return r >= rank(c.manage_channels_role || 'admin');
    case 'approve': return r >= rank(c.approve_requests_role || 'admin');
    case 'remove': return r >= rank(c.remove_members_role || 'admin');
    case 'roles': return r >= 3;
    case 'settings': return r >= 4;
    case 'moderate': return r >= 2;
  }
}
/** Roles the actor may assign to a target (server: intent_set_member_role). */
export function assignableRoles(actor: string | null | undefined, target: string): Role[] {
  const a = rank(actor);
  if (a < 3 || rank(target) >= a) return [];
  return (['admin', 'moderator', 'member'] as Role[]).filter(r => rank(r) < a);
}
export const canRemove = (c: Parameters<typeof can>[0], actor: string | null | undefined, target: string) => can(c, actor, 'remove') && rank(target) < rank(actor);

/** True when an error means the v0.7 migration (columns/RPCs) is not applied yet. */
export function isMissingSchema(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  if (e.code && ['42703', '42883', 'PGRST202', 'PGRST204'].includes(e.code)) return true;
  return /(column .* does not exist|could not find the .*(column|function)|function .* does not exist)/i.test(e.message || '');
}
export const errorText = (e: unknown, fallback = 'Something went wrong.') => e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : fallback;

export const normalizeTag = (s: string) => s.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, TAG_MAX);
export function addTag(tags: string[], raw: string) {
  const tag = normalizeTag(raw);
  if (!tag || tags.length >= TAGS_MAX || tags.some(t => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}
export const VOICE_MIN = 2, VOICE_MAX = 99, VOICE_DEFAULT = 10;
export const channelKind = (c: Pick<Channel, 'kind'>): ChannelKind => (c.kind === 'voice' ? 'voice' : 'text');
/** Whole number clamped to 2..99 (server CHECK + RPC validate the same range). */
export const clampCapacity = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(VOICE_MAX, Math.max(VOICE_MIN, v)) : VOICE_DEFAULT; };
/** 'open' = every member, 'closed' = owner/admin/moderator. UI hint only. */
export const canJoinVoice = (access: VoiceAccess | undefined, role: string | null | undefined) => rank(role) >= (access === 'closed' ? 2 : 1);
export const normalizeVoiceName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, CHANNEL_MAX);
export const normalizeChannel = (s: string) => s.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase().slice(0, CHANNEL_MAX);

export type Draft = {
  name: string; description: string; category: string; tags: string[]; cover: string; icon: string;
  privacy: Privacy; posting: 'members' | 'staff'; channelsEnabled: boolean; channels: string[];
};
export const emptyDraft = (): Draft => ({ name: '', description: '', category: '', tags: [], cover: '', icon: '', privacy: 'public', posting: 'members', channelsEnabled: true, channels: ['general', 'introductions'] });

/** Returns an English error key (translated by the caller) or '' when the step is valid. */
export function validateStep(step: number, d: Draft): string {
  if (step === 0) {
    const n = d.name.trim().length;
    if (n < NAME_MIN) return 'Name must be at least 3 characters.';
    if (n > NAME_MAX) return 'Name must be at most 100 characters.';
    if (d.description.length > DESCRIPTION_MAX) return 'Description is too long.';
    if (!d.category) return 'Choose a category.';
  }
  if (step === 3 && d.channelsEnabled) {
    const names = d.channels.map(normalizeChannel);
    if (names.some(n => !n)) return 'Channel names cannot be empty.';
    if (new Set(names).size !== names.length) return 'Channel names must be unique.';
  }
  return '';
}

export function formatCount(n: number, locale = 'en') {
  try { return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n); }
  catch { return String(n); }
}
export const shortId = (id: string) => id.replace(/-/g, '').slice(0, 6).toUpperCase();

/** Distinct authors active within `windowMs` — the honest "recently active" signal. */
export function recentlyActive(items: { author_id: string; created_at: string }[], now: number, windowMs = 24 * 3600e3) {
  const seen = new Map<string, number>();
  for (const it of items) { const at = Date.parse(it.created_at); if (now - at <= windowMs && (seen.get(it.author_id) ?? 0) < at) seen.set(it.author_id, at); }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Real communities always come first, then examples; filtered by chip. */
export function filterCards(cards: CardItem[], chip: string, interests: string[] = []) {
  const words = interests.map(i => i.toLowerCase());
  const score = (c: CardItem) => words.filter(w => c.category.includes(w) || c.tags.some(t => t.toLowerCase().includes(w)) || c.name.toLowerCase().includes(w)).length;
  // Ownership comes exclusively from a real row's owner_id, never join/role hints.
  let list = cards.filter(c => chip === 'mine' ? !c.demo && c.owned === true : !c.owned);
  if (!['foryou', 'trending', 'mine'].includes(chip)) list = list.filter(c => c.category === chip);
  const real = list.filter(c => !c.demo), demo = list.filter(c => c.demo);
  if (chip === 'trending') demo.sort((a, b) => (b.members ?? 0) - (a.members ?? 0));
  if (chip === 'foryou') demo.sort((a, b) => score(b) - score(a));
  return [...real, ...demo];
}

/** Own rows must not hide discovery examples when no other real community exists. */
export function shouldShowExamples(rows: Pick<Community, 'owner_id'>[], userId: string | null,
  state: { configured: boolean; loading: boolean; error: string }): boolean {
  return !state.configured || (!state.loading && !state.error && !rows.some(row => row.owner_id !== userId));
}
