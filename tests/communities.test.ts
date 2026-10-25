import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { addTag, assignableRoles, can, canRemove, emptyDraft, filterCards, isMissingSchema, recentlyActive, shouldShowExamples, validateStep, type CardItem, type Community } from '../components/communities/model';
import { createCommunity, deleteCommunity, joinCommunity, schemaOf, type DB } from '../components/communities/api';
import type { Live } from '../components/communities/useLiveCommunity';
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

test('own communities stay in My; joined and example communities never imply ownership', () => {
  const card = (key: string, owned: boolean, demo = false, join: CardItem['join'] = 'member'): CardItem => ({
    key, name: key, owned, demo, join, category: 'business', description: '', tags: [], cover: null, icon: null, members: null, privacy: 'public', avatars: [],
  });
  const cards = [card('owner', true), card('joined', false), card('outsider', false, false, 'none'), card('example', false, true)];
  assert.deepEqual(filterCards(cards, 'mine').map(row => row.key), ['owner']);
  for (const chip of ['foryou', 'trending', 'business']) {
    assert.deepEqual(filterCards(cards, chip).map(row => row.key), ['joined', 'outsider', 'example']);
  }
  assert.deepEqual(filterCards([card('forged-example', true, true)], 'mine'), []);
  const available = { configured: true, loading: false, error: '' };
  assert.equal(shouldShowExamples([{ owner_id: 'me' }], 'me', available), true, 'one own row must not empty discovery');
  assert.equal(shouldShowExamples([{ owner_id: 'me' }, { owner_id: 'other' }], 'me', available), false, 'actual other communities take precedence');
  assert.equal(shouldShowExamples([{ owner_id: 'other' }], null, available), false);
  assert.equal(shouldShowExamples([], 'me', { ...available, error: 'offline' }), false, 'examples do not disguise request errors');
  assert.equal(shouldShowExamples([], 'me', { ...available, loading: true }), false);
  assert.equal(shouldShowExamples([], null, { ...available, configured: false }), true);
});

test('deletion uses only owner RPC and requires the exact server-confirmed id', async () => {
  const id = '23000000-0000-0000-0000-000000000001';
  const calls: unknown[] = [];
  const db = (data: unknown, error: unknown = null) => ({ rpc: async (name: string, args: unknown) => {
    calls.push([name, args]); return { data, error };
  } }) as unknown as DB;
  await deleteCommunity(db(id), id);
  assert.deepEqual(calls, [['delete_community', { cid: id }]]);
  for (const data of [null, true, 1, [], {}, '23000000-0000-0000-0000-000000000002']) {
    await assert.rejects(deleteCommunity(db(data), id), /not confirmed/);
  }
  await assert.rejects(deleteCommunity(db(null, { code: 'PGRST202', message: 'missing RPC' }), id), /needs the database update/);
  await assert.rejects(deleteCommunity(db(null, { code: '42501', message: 'denied' }), id), /Only the community owner/);
  await assert.rejects(deleteCommunity(db(null, { code: '500', message: 'private backend details' }), id), /Could not delete/);
  await assert.rejects(deleteCommunity({ rpc: async () => { throw new Error('private network details'); } } as unknown as DB, id), /Could not delete/);
  const before = calls.length;
  await assert.rejects(deleteCommunity(db(id), 'invalid'), /Invalid community id/);
  assert.equal(calls.length, before, 'invalid ids never reach the RPC');
});

test('Settings deletion is owner-id-only, typed, cancellable, busy-guarded and waits for server result', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = (tag: string) => function TestElement({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) { return createElement(tag, props, children); };
  const css = mock.module('../components/communities/communities.module.css', { cache: true, defaultExport: {} });
  const image = mock.module('../components/ImagePicker.tsx', { cache: true, defaultExport: () => null });
  const ui = mock.module('../components/ui/index.tsx', { cache: true, namedExports: {
    Button: node('button'), Field: node('label'), Choice: node('div'), Toggle: node('button'), Menu: () => null, inputClass: '',
    Modal: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => createElement('div', { role: 'dialog' }, children, footer),
  } });
  const { default: SettingsModal } = await import('../components/communities/SettingsModal');
  const community = { id: '23000000-0000-0000-0000-000000000001', owner_id: 'owner', name: 'Actual community', description: '', privacy: 'public', posting_permission: 'members', comments_permission: 'members', channels_enabled: true, cover_url: null, avatar_url: null, category: 'business', tags: [] } as Community;
  const live = { community, members: [], channels: [], requests: [], busy: false, error: '', needsMigration: false } as unknown as Live;
  let renderer: ReactTestRenderer | undefined;
  const text = (item: ReactTestInstance): string => item.children.map(child => typeof child === 'string' ? child : text(child)).join('');
  const findButton = (label: string) => renderer!.root.findAllByType('button').find(button => text(button).trim() === label)!;
  let calls = 0, completed = false;
  let release: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const onDelete = async () => { calls++; await new Promise<void>((resolve, fail) => { release = resolve; reject = fail; }); completed = true; };
  const render = (userId: string, role: string) => createElement(SettingsModal, { key: userId + role, live, userId, role, onClose: () => {}, onDelete });
  try {
    await act(async () => { renderer = create(render('other-admin', 'admin')); });
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'Delete community' }).length, 0);
    await act(async () => { renderer!.update(render('other-admin', 'owner')); });
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'Delete community' }).length, 0, 'membership owner role is insufficient');
    await act(async () => { renderer!.update(render('owner', 'owner')); });
    await act(async () => { findButton('Delete community').props.onClick(); });
    assert.equal(findButton('Permanently delete community').props.disabled, true);
    await act(async () => { findButton('Cancel').props.onClick(); });
    assert.equal(calls, 0);
    await act(async () => { findButton('Delete community').props.onClick(); });
    const zone = () => renderer!.root.findByProps({ 'aria-label': 'Delete community' });
    await act(async () => { zone().findByType('input').props.onChange({ target: { value: 'wrong' } }); });
    assert.equal(findButton('Permanently delete community').props.disabled, true);
    await act(async () => { zone().findByType('input').props.onChange({ target: { value: community.name } }); });
    const submit = findButton('Permanently delete community').props.onClick;
    await act(async () => { submit(); submit(); });
    assert.equal(calls, 1); assert.equal(completed, false, 'pending request never claims success');
    assert.equal(findButton('Deleting community…').props.disabled, true);
    assert.equal(findButton('Cancel').props.disabled, true);
    assert.equal(findButton('Close').props.disabled, true);
    await act(async () => { reject(new Error('Could not delete the community. Please retry.')); });
    assert.ok(zone().findByProps({ role: 'alert' }));
    assert.equal(completed, false);
    await act(async () => { findButton('Permanently delete community').props.onClick(); });
    assert.equal(calls, 2); assert.equal(completed, false);
    await act(async () => { release(); });
    assert.equal(completed, true, 'only the resolved server operation completes deletion');
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    css.restore(); image.restore(); ui.restore();
  }
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
