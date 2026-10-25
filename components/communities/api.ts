// Supabase calls for Communities. Every permission is enforced by RLS/RPCs on the server;
// these helpers only add schema feature-detection so the UI degrades honestly.
import type { createClient } from '../../lib/supabase/client';
import { isMissingSchema, normalizeChannel, type Community, type Draft, type JoinState } from './model';

export type DB = ReturnType<typeof createClient>;
export type Schema = 'v2' | 'legacy' | 'unknown';
type Mine = Record<string, { join: JoinState; role?: string }>;

export const schemaOf = (rows: Community[], current: Schema): Schema => rows.length ? ('category' in rows[0] ? 'v2' : 'legacy') : current;

/** Communities visible to the caller, with member counts when the caller may read them. */
export async function loadDirectory(db: DB, userId: string | null) {
  let counts: Record<string, number> | null = null;
  let rows: Community[] = [];
  if (userId) {
    const withCounts = await db.from('communities').select('*, community_members(count)').order('created_at', { ascending: false }).order('id', { ascending: false });
    if (!withCounts.error) {
      counts = {};
      for (const r of (withCounts.data || []) as (Community & { community_members?: { count: number }[] })[]) {
        counts[r.id] = r.community_members?.[0]?.count ?? 0;
        const rest: Community & { community_members?: unknown } = { ...r }; delete rest.community_members; rows.push(rest);
      }
    }
  }
  if (!counts) {
    const plain = await db.from('communities').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
    if (plain.error) throw plain.error;
    rows = (plain.data || []) as Community[];
  }
  const mine: Mine = {};
  if (userId) {
    const [m, r] = await Promise.all([
      db.from('community_members').select('community_id,role').eq('user_id', userId),
      db.from('community_join_requests').select('community_id,status').eq('user_id', userId).eq('status', 'pending'),
    ]);
    for (const x of (r.data || []) as { community_id: string }[]) mine[x.community_id] = { join: 'pending' };
    for (const x of (m.data || []) as { community_id: string; role: string }[]) mine[x.community_id] = { join: 'member', role: x.role };
  }
  return { rows, counts, mine };
}

/** Creates the community and its starter channels. Falls back to the pre-v0.7 columns. */
export async function createCommunity(db: DB, userId: string, d: Draft, schema: Schema) {
  const base: Record<string, unknown> = { owner_id: userId, name: d.name.trim(), description: d.description.trim(), privacy: d.privacy, channels_enabled: d.channelsEnabled, posting_permission: d.posting, cover_url: d.cover || null, avatar_url: d.icon || null };
  let legacy = schema === 'legacy';
  let res = await db.from('communities').insert(legacy ? base : { ...base, category: d.category, tags: d.tags }).select('*').single();
  if (res.error && !legacy && isMissingSchema(res.error)) { legacy = true; res = await db.from('communities').insert(base).select('*').single(); }
  if (res.error) throw res.error;
  const community = res.data as Community;
  let channelError = '';
  const names = d.channelsEnabled ? [...new Set(d.channels.map(normalizeChannel).filter(Boolean))] : [];
  if (names.length) {
    const ch = await db.from('community_channels').insert(names.map(name => ({ community_id: community.id, name })));
    if (ch.error) channelError = ch.error.message;
  }
  return { community, legacy, channelError };
}

export async function joinCommunity(db: DB, userId: string, c: Pick<Community, 'id' | 'privacy'>): Promise<JoinState> {
  if (c.privacy === 'private') throw new Error('This community is invitation only.');
  const result = c.privacy === 'public'
    ? await db.from('community_members').insert({ community_id: c.id, user_id: userId, role: 'member' })
    : await db.from('community_join_requests').upsert({ community_id: c.id, user_id: userId, status: 'pending' }, { onConflict: 'community_id,user_id' });
  if (result.error) throw result.error;
  return c.privacy === 'public' ? 'member' : 'pending';
}

export async function leaveCommunity(db: DB, userId: string, communityId: string, pending: boolean) {
  const result = pending
    ? await db.from('community_join_requests').delete().eq('community_id', communityId).eq('user_id', userId)
    : await db.from('community_members').delete().eq('community_id', communityId).eq('user_id', userId);
  if (result.error) throw result.error;
}

/** Owner authorization and cascades happen in the server RPC, never client DELETE. */
export async function deleteCommunity(db: DB, communityId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(communityId)) {
    throw new Error('Invalid community id.');
  }
  let result;
  try { result = await db.rpc('delete_community', { cid: communityId }); }
  catch { throw new Error('Could not delete the community. Please retry.'); }
  const { data, error } = result;
  if (error) {
    if (isMissingSchema(error)) throw new Error('Community deletion needs the database update. Ask the project owner to apply it.');
    if (error.code === '42501') throw new Error('Only the community owner can delete it, or it no longer exists.');
    throw new Error('Could not delete the community. Please retry.');
  }
  if (typeof data !== 'string' || data.toLowerCase() !== communityId.toLowerCase()) {
    throw new Error('Deletion was not confirmed by the server. Reload before trying again.');
  }
}
