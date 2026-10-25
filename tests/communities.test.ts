import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addTag, assignableRoles, can, canRemove, emptyDraft, filterCards, isMissingSchema, recentlyActive, validateStep, type CardItem } from '../components/communities/model';
import { createCommunity, joinCommunity, schemaOf, type DB } from '../components/communities/api';
import { DICT_COMMUNITIES } from '../lib/i18n-communities';

const base = { posting_permission: 'members' as const };

test('UI permission hints mirror the SQL thresholds', () => {
  assert.equal(can(base, 'member', 'post'), true);
  assert.equal(can({ posting_permission: 'staff' }, 'member', 'post'), false);
  assert.equal(can({ posting_permission: 'staff' }, 'moderator', 'post'), true);
  assert.equal(can({ posting_permission: 'staff' }, 'editor', 'post'), true, 'legacy editor equals moderator');
  assert.equal(can(base, 'moderator', 'approve'), false, 'default approval threshold is admin');
  assert.equal(can({ ...base, approve_requests_role: 'moderator' }, 'moderator', 'approve'), true);
  assert.equal(can(base, 'admin', 'settings'), false, 'only the owner edits settings');
  assert.equal(can(base, null, 'post'), false);
});

test('role assignment never reaches equal or higher ranks', () => {
  assert.deepEqual(assignableRoles('owner', 'member'), ['admin', 'moderator', 'member']);
  assert.deepEqual(assignableRoles('admin', 'member'), ['moderator', 'member']);
  assert.deepEqual(assignableRoles('admin', 'admin'), []);
  assert.deepEqual(assignableRoles('moderator', 'member'), []);
  assert.deepEqual(assignableRoles('owner', 'owner'), []);
  assert.equal(canRemove({ ...base, remove_members_role: 'moderator' }, 'moderator', 'member'), true);
  assert.equal(canRemove({ ...base, remove_members_role: 'moderator' }, 'moderator', 'moderator'), false);
  assert.equal(canRemove(base, 'admin', 'owner'), false);
});

test('wizard validation, tags and schema detection', () => {
  const d = emptyDraft();
  assert.equal(validateStep(0, d), 'Name must be at least 3 characters.');
  assert.equal(validateStep(0, { ...d, name: 'Hikers' }), 'Choose a category.');
  assert.equal(validateStep(0, { ...d, name: 'Hikers', category: 'travel' }), '');
  assert.equal(validateStep(3, { ...d, channels: ['general', ' General '] }), 'Channel names must be unique.');
  assert.equal(validateStep(3, { ...d, channelsEnabled: false, channels: [''] }), '');
  let tags: string[] = [];
  for (const t of ['#AI', 'ai', 'Machine learning', 'a', 'b', 'c', 'd']) tags = addTag(tags, t);
  assert.deepEqual(tags, ['AI', 'Machine-learning', 'a', 'b', 'c']);
  assert.equal(isMissingSchema({ code: 'PGRST204', message: "Could not find the 'category' column" }), true);
  assert.equal(isMissingSchema({ code: '42501', message: 'permission denied' }), false);
  assert.equal(schemaOf([{ id: '1' } as never], 'unknown'), 'legacy');
  assert.equal(schemaOf([], 'v2'), 'v2');
});

test('real communities always come before examples; activity is honest', () => {
  const card = (key: string, demo: boolean, members: number, category = 'travel'): CardItem => ({ key, name: key, description: '', category, tags: [], cover: null, icon: null, members, privacy: 'public', demo, join: 'none', avatars: [] });
  const list = filterCards([card('demo-big', true, 9000), card('mine', false, 1), card('demo-small', true, 10)], 'trending');
  assert.deepEqual(list.map(c => c.key), ['mine', 'demo-big', 'demo-small']);
  assert.deepEqual(filterCards([card('a', false, 1, 'music'), card('b', false, 1)], 'music').map(c => c.key), ['a']);
  const now = Date.parse('2026-10-25T12:00:00Z');
  assert.deepEqual(recentlyActive([{ author_id: 'x', created_at: '2026-10-25T11:00:00Z' }, { author_id: 'y', created_at: '2026-10-23T11:00:00Z' }, { author_id: 'z', created_at: '2026-10-25T11:30:00Z' }], now), ['z', 'x']);
});

type Call = { table: string; op: string; value?: unknown };
function fakeDb(opts: { legacy?: boolean; channelError?: string } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      let op = 'select', value: unknown;
      const q = {
        insert(v: unknown) { op = 'insert'; value = v; return q; },
        upsert(v: unknown) { op = 'upsert'; value = v; return q; },
        select() { return q; }, single() { return q; },
        then(resolve: (r: unknown) => void) {
          calls.push({ table, op, value });
          const v = value as Record<string, unknown>;
          if (table === 'communities' && opts.legacy && v && 'category' in v) return resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'category' column of 'communities' in the schema cache" } });
          if (table === 'communities') return resolve({ data: { id: 'c1', ...v }, error: null });
          if (table === 'community_channels' && opts.channelError) return resolve({ data: null, error: { message: opts.channelError } });
          resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as DB, calls };
}

test('create uses v0.7 columns, falls back honestly, and adds starter channels', async () => {
  const draft = { ...emptyDraft(), name: '  Weekend Hikers ', category: 'travel', tags: ['tatra'], channels: ['general', '#Introductions'] };
  const ok = fakeDb();
  const r = await createCommunity(ok.db, 'u1', draft, 'unknown');
  assert.equal(r.legacy, false);
  assert.deepEqual(ok.calls.map(c => c.table + ':' + c.op), ['communities:insert', 'community_channels:insert']);
  assert.equal((ok.calls[0].value as { name: string }).name, 'Weekend Hikers');
  assert.deepEqual((ok.calls[1].value as { name: string }[]).map(c => c.name), ['general', 'introductions']);

  const old = fakeDb({ legacy: true, channelError: 'denied' });
  const r2 = await createCommunity(old.db, 'u1', draft, 'unknown');
  assert.equal(r2.legacy, true);
  assert.equal(r2.channelError, 'denied');
  assert.equal('category' in (old.calls[1].value as object), false, 'retry omits unknown columns');

  const none = fakeDb();
  await createCommunity(none.db, 'u1', { ...draft, channelsEnabled: false }, 'v2');
  assert.equal(none.calls.length, 1, 'no channels when disabled');
});

test('joining follows privacy: insert, request upsert (retryable) or refuse', async () => {
  const f = fakeDb();
  assert.equal(await joinCommunity(f.db, 'u1', { id: 'c', privacy: 'public' }), 'member');
  assert.equal(await joinCommunity(f.db, 'u1', { id: 'c', privacy: 'request' }), 'pending');
  assert.deepEqual(f.calls.map(c => c.table + ':' + c.op), ['community_members:insert', 'community_join_requests:upsert']);
  await assert.rejects(joinCommunity(f.db, 'u1', { id: 'c', privacy: 'private' }));
});

test('every Communities translation row has 7 languages and matching placeholders', () => {
  for (const [key, row] of Object.entries(DICT_COMMUNITIES)) {
    assert.equal(row.length, 7, key);
    const want = (key.match(/\{\w+\}/g) || []).sort().join();
    for (const cell of row) { assert.ok(cell.trim(), key); assert.equal((cell.match(/\{\w+\}/g) || []).sort().join(), want, `${key} → ${cell}`); }
  }
});
