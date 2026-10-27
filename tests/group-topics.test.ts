import assert from 'node:assert/strict';
import { test, mock, after } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { canRemove, canManage, withGeneral, sortTopics, GENERAL_ID, initialsOf, colorFor } from '../components/groups/model';

test('group permission helpers mirror the server rules', () => {
  assert.equal(canManage('owner'), true); assert.equal(canManage('admin'), true); assert.equal(canManage('member'), false); assert.equal(canManage(null), false);
  assert.equal(canRemove('owner', 'admin'), true);
  assert.equal(canRemove('admin', 'member'), true);
  assert.equal(canRemove('admin', 'admin'), false, 'only the owner removes admins');
  assert.equal(canRemove('owner', 'owner'), false, 'nobody removes the owner');
  assert.equal(canRemove('member', 'member'), false);
});

test('topics always include one open General topic and sort pinned, then recent', () => {
  const list = withGeneral([{ id: 'a', title: 'A', icon: '💬', color: 1 }, { id: GENERAL_ID, title: 'General', icon: '#', color: 7, closed: true }]);
  assert.equal(list.filter(t => t.general).length, 1);
  assert.equal(list[0].closed, false, 'General can never be closed');
  assert.equal(withGeneral(undefined)[0].id, GENERAL_ID);
  const at: Record<string, number> = { x: 5, y: 9, z: 1 };
  const sorted = sortTopics([{ id: 'x' }, { id: 'y' }, { id: 'z', pinned: true }], t => at[t.id]);
  assert.deepEqual(sorted.map(t => t.id), ['z', 'y', 'x']);
  assert.equal(initialsOf('design team'), 'DT');
  assert.ok(colorFor('abc') >= 0 && colorFor('abc') < 8);
});

type Row = Record<string, unknown>;
type Call = { table: string; select?: string; eq: Record<string, string>; insert?: Row; rpc?: string; args?: Row };

function harness(opts: { legacy?: boolean }) {
  const calls: Call[] = [];
  const created_at = '2026-10-25T10:00:00.000Z';
  const group = { id: 'g1', title: 'Design team', description: '', created_by: 'alice', created_at, avatar_url: null, avatar_color: 2, topics_enabled: true };
  const topics = [
    { id: 't-general', title: 'General', icon: '#', color: 7, is_general: true, closed: false, pinned: false },
    { id: 't-closed', title: 'Archive', icon: '📌', color: 1, is_general: false, closed: true, pinned: false },
  ];
  const messages = [
    { id: 'm1', sender_id: 'bob', body: 'hello general', created_at, topic_id: 't-general' },
    { id: 'm2', sender_id: 'bob', body: 'old archive note', created_at, topic_id: 't-closed' },
  ];
  const client = {
    rpc(name: string, args: Row) { calls.push({ table: 'rpc', rpc: name, args, eq: {} }); return Promise.resolve({ data: null, error: null }); },
    from(table: string) {
      const call: Call = { table, eq: {} };
      const q = {
        select(cols: string) { call.select = cols; return q; },
        eq(k: string, v: string) { call.eq[k] = v; return q; },
        order() { return q; }, or() { return q; }, limit() { return q; },
        insert(v: Row) { call.insert = v; return q; },
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          calls.push(call);
          let result: { data: unknown; error: { code: string; message: string } | null };
          if (table === 'message_groups') {
            result = opts.legacy && call.select?.includes('avatar_url') ? { data: null, error: { code: '42703', message: 'column message_groups.avatar_url does not exist' } }
              : { data: [opts.legacy ? { ...group, avatar_url: undefined, avatar_color: undefined, topics_enabled: undefined } : group], error: null };
          } else if (table === 'message_group_members') result = { data: [{ user_id: 'alice', role: 'member' }, { user_id: 'bob', role: 'owner' }], error: null };
          else if (table === 'message_group_topics') result = { data: topics, error: null };
          else if (call.insert) result = { data: null, error: null };
          else result = { data: messages.filter(m => !call.eq.topic_id || m.topic_id === call.eq.topic_id), error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, calls };
}

// Modules are mocked once; each test swaps the backing fake client.
let current: ReturnType<typeof harness> | null = null;
let mocks: { restore(): void }[] | null = null;
after(() => mocks?.forEach(m => m.restore()));
async function mount(opts: { legacy?: boolean }) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const h = harness(opts); current = h;
  mocks ??= [
    mock.module('../lib/supabase/client.ts', { cache: true, namedExports: { createClient: () => current!.client, isSupabaseConfigured: () => true } }),
    mock.module('../components/SessionBoundary.tsx', { cache: true, namedExports: { useSession: () => ({ user: { id: 'alice' }, scope: 'alice' }) } }),
    ...['../components/groups/groups.module.css', '../components/ui/ui.module.css', '../components/TranslationControls.module.css'].map(path => mock.module(path, { cache: true, defaultExport: {} })),
  ];
  const { default: GroupMessages } = await import('../components/GroupMessages');
  let r: ReactTestRenderer | undefined;
  await act(async () => { r = create(createElement(GroupMessages)); });
  const text = (n: ReactTestInstance): string => n.children.map(c => typeof c === 'string' ? c : text(c)).join('');
  const all = () => text(r!.root);
  const click = async (pred: (n: ReactTestInstance) => boolean) => { const b = r!.root.findAll(n => n.type === 'button' && pred(n))[0]; assert.ok(b, 'button not found'); await act(async () => { b.props.onClick(); }); };
  return { h, r: r!, all, click, text, cleanup: async () => { await act(async () => { r?.unmount(); }); } };
}

test('Supabase groups without the topics migration show an honest notice and keep basic chat', async () => {
  const m = await mount({ legacy: true });
  try {
    assert.match(m.all(), /database upgrade that has not been applied yet/);
    await m.click(n => n.props.className?.startsWith('group-list-item'));
    assert.match(m.all(), /hello general/, 'legacy conversation loads all messages');
    assert.equal(m.h.calls.some(c => c.table === 'message_group_topics'), false, 'no topic queries without the migration');
  } finally { await m.cleanup(); }
});

test('topic-enabled Supabase group lists topics, filters messages by topic and blocks posting in a closed topic', async () => {
  const m = await mount({});
  try {
    await m.click(n => n.props.className?.startsWith('group-list-item'));
    const out = m.all();
    assert.match(out, /General/); assert.match(out, /Archive/);
    const bubbles = () => m.r.root.findAll(n => n.type === 'div' && String(n.props.className || '').startsWith('group-message ')).map(n => m.text(n.findByType('p')));
    assert.deepEqual(bubbles(), ['hello general'], 'only the active topic\'s messages are shown');
    assert.ok(m.h.calls.some(c => c.table === 'message_group_messages' && c.eq.topic_id === 't-general'));
    // send in General carries topic_id
    await act(async () => { m.r.root.findByProps({ 'aria-label': 'Group message' }).props.onChange({ target: { value: 'hi topic' } }); });
    await act(async () => { await m.r.root.findByProps({ className: 'group-send' }).props.onSubmit({ preventDefault() {} }); });
    assert.deepEqual(m.h.calls.find(c => c.insert)?.insert, { group_id: 'g1', body: 'hi topic', topic_id: 't-general' });
    // open the closed topic: history shown, composer replaced by a notice; members (role member) cannot reopen
    await m.click(n => m.text(n).includes('Archive'));
    assert.deepEqual(bubbles(), ['old archive note']);
    assert.match(m.all(), /This topic is closed/);
    assert.equal(m.r.root.findAll(n => n.props.className === 'group-send').length, 0);
    assert.equal(m.r.root.findAll(n => n.type === 'button' && m.text(n).includes('Reopen')).length, 0, 'ordinary members get no admin controls');
    assert.equal(m.r.root.findAll(n => n.type === 'button' && m.text(n).includes('New topic')).length, 0);
  } finally { await m.cleanup(); }
});
