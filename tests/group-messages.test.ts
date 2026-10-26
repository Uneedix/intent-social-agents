import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

type Message = { id: string; sender_id: string; body: string; created_at: string };
type Result = { data: unknown; error: null };

test('group chat keeps new messages after 200, pages timestamp ties and ignores stale selections', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const created_at = '2026-10-24T12:00:00.000Z';
  const messages: Message[] = Array.from({ length: 250 }, (_, i) => ({
    id: String(i + 1).padStart(8, '0'), sender_id: 'alice', body: `message-${i + 1}`, created_at,
  }));
  const groups = ['alpha', 'beta'].map(id => ({ id, title: id, description: '', created_by: 'alice', created_at }));
  const requests: Array<{ table: string; orders: string[]; filter: string; limit: number }> = [];
  let releaseBeta: (result: Result) => void = () => {};
  let holdBeta = false;
  const client = {
    from(table: string) {
      const equalities: Record<string, string> = {};
      const orders: string[] = [];
      let filter = '';
      let limit = Number.POSITIVE_INFINITY;
      let inserted: { body: string } | undefined;
      const query = {
        select() { return query; },
        eq(key: string, value: string) { equalities[key] = value; return query; },
        order(key: string, options: { ascending: boolean }) { orders.push(`${key}:${options.ascending}`); return query; },
        or(value: string) { filter = value; return query; },
        limit(value: number) { limit = value; return query; },
        insert(value: { body: string }) { inserted = value; return query; },
        then(resolve: (value: Result) => void, reject: (reason: unknown) => void) {
          requests.push({ table, orders, filter, limit });
          let result: Result | Promise<Result>;
          if (table === 'message_groups') result = { data: groups, error: null };
          else if (table === 'message_group_members') result = { data: [{ user_id: 'alice', role: 'member' }], error: null };
          else if (inserted) {
            messages.push({ id: '00000251', sender_id: 'alice', body: inserted.body, created_at });
            result = { data: null, error: null };
          } else if (equalities.group_id === 'beta' && holdBeta) {
            result = new Promise<Result>(finish => { releaseBeta = finish; });
          } else {
            let rows = equalities.group_id === 'alpha' ? [...messages] : [];
            if (filter) {
              const cursor = /id\.lt\.([^)]+)/.exec(filter)?.[1];
              assert.ok(cursor, 'pagination must include a tie-breaking id cursor');
              assert.ok(filter.includes(`created_at.eq.${created_at}`));
              rows = rows.filter(row => row.id < cursor);
            }
            // Emulate PostgreSQL ordering to catch a return to oldest-first + LIMIT.
            rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            if (orders[0] === 'created_at:false') rows.reverse();
            result = { data: rows.slice(0, limit), error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const mockedClient = mock.module('../lib/supabase/client.ts', { cache: true, namedExports: {
    createClient: () => client, isSupabaseConfigured: () => true,
  } });
  const mockedSession = mock.module('../components/SessionBoundary.tsx', { cache: true, namedExports: {
    useSession: () => ({ user: { id: 'alice' }, scope: 'alice' }),
  } });
  const mockedCss = ['../components/groups/groups.module.css', '../components/ui/ui.module.css', '../components/TranslationControls.module.css'].map(path => mock.module(path, { cache: true, defaultExport: {} }));
  const { default: GroupMessages } = await import('../components/GroupMessages');
  let renderer: ReactTestRenderer | undefined;
  const bodies = () => renderer!.root.findAll(node => node.type === 'div' && typeof node.props.className === 'string' && node.props.className.startsWith('group-message ')).map(node => node.findByType('p').children.join(''));
  const choose = async (id: string) => {
    await act(async () => {
      const button = renderer!.root.findAllByType('button').find(node => node.props.className?.startsWith('group-list-item') && node.findByType('strong').children.join('') === id);
      assert.ok(button); button.props.onClick();
    });
  };
  const older = async () => {
    await act(async () => {
      const button = renderer!.root.findAllByType('button').find(node => node.children.join('') === 'Load older messages');
      assert.ok(button); button.props.onClick();
    });
  };
  try {
    await act(async () => { renderer = create(createElement(GroupMessages)); });
    await choose('alpha');
    assert.equal(bodies().length, 100);
    assert.equal(bodies().at(-1), 'message-250', 'initial page contains newest messages even beyond 200');
    await older();
    assert.equal(bodies().length, 200);
    await act(async () => {
      renderer!.root.findByProps({ 'aria-label': 'Group message' }).props.onChange({ target: { value: 'new-message-251' } });
    });
    await act(async () => { await renderer!.root.findByProps({ className: 'group-send' }).props.onSubmit({ preventDefault() {} }); });
    assert.equal(bodies().at(-1), 'new-message-251', 'sending after 200 must reveal the new message');
    assert.equal(bodies().length, 201, 'refresh preserves previously paginated history');
    await older();
    assert.equal(bodies().length, 251);
    assert.equal(new Set(bodies()).size, 251, 'page boundaries do not duplicate messages');
    assert.equal(bodies()[0], 'message-1');
    for (const request of requests.filter(item => item.table === 'message_group_messages' && item.orders.length)) {
      assert.deepEqual(request.orders, ['created_at:false', 'id:false']);
      assert.equal(request.limit, 100);
    }
    holdBeta = true;
    await choose('beta');
    await choose('alpha');
    await act(async () => { releaseBeta({ data: [{ id: 'beta-stale', sender_id: 'bob', body: 'must-not-appear', created_at }], error: null }); });
    assert.equal(bodies().includes('must-not-appear'), false, 'response for an old selection cannot overwrite current history');
    assert.equal(bodies().at(-1), 'new-message-251');
  } finally {
    await act(async () => { renderer?.unmount(); });
    mockedSession.restore(); mockedClient.restore(); mockedCss.forEach(css => css.restore());
  }
});
