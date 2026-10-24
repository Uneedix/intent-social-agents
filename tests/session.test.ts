import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { User } from '@supabase/supabase-js';
import { storageKey } from '../lib/storage';

class TestStorage implements Storage {
  private data = new Map<string, string>();
  writes: Array<{ key: string; value: string }> = [];
  failWrites = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { if (this.failWrites) throw new Error('Quota exceeded'); this.data.set(key, value); this.writes.push({ key, value }); }
}

test('session changes remount drafts, isolate hook writes and reject stale initial auth', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const storage = new TestStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  storage.setItem(storageKey('alice', 'draft'), JSON.stringify('saved Alice'));
  storage.setItem(storageKey('bob', 'draft'), JSON.stringify('saved Bob'));
  storage.writes = [];
  let authEvent: (event: string, session: { user: User } | null) => void = () => {};
  let resolveInitial: (data: { data: { user: User | null }; error: null }) => void = () => {};
  const initial = new Promise<{ data: { user: User | null }; error: null }>(resolve => { resolveInitial = resolve; });
  let unsubscribed = false;
  const client = { auth: {
    getUser: () => initial,
    onAuthStateChange: (callback: typeof authEvent) => {
      authEvent = callback;
      return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } };
    },
  } };
  const mocked = mock.module('../lib/supabase/client.ts', {
    cache: true,
    namedExports: { createClient: () => client, isSupabaseConfigured: () => true },
  });
  const { default: SessionBoundary, useSession } = await import('../components/SessionBoundary');
  const { useStored } = await import('../lib/social');
  let setDraft: (value: string) => void = () => {};
  let setEphemeral: (value: string) => void = () => {};
  let snapshot = { scope: '', draft: '', ephemeral: '' };
  let mounts = 0;
  function Probe() {
    const { scope } = useSession();
    const [draft, updateDraft] = useStored('draft', 'empty');
    const [ephemeral, updateEphemeral] = useState('fresh');
    setDraft = updateDraft;
    setEphemeral = updateEphemeral;
    snapshot = { scope, draft, ephemeral };
    useEffect(() => { mounts++; }, []);
    return createElement('span', null, draft);
  }
  let renderer: ReactTestRenderer | undefined;
  const login = (id: string) => authEvent('SIGNED_IN', { user: { id } as User });
  try {
    await act(async () => { renderer = create(createElement(SessionBoundary, null, createElement(Probe))); });
    assert.equal(mounts, 0, 'account UI remains hidden while initial identity is unknown');
    await act(async () => { login('alice'); });
    assert.deepEqual(snapshot, { scope: 'alice', draft: 'saved Alice', ephemeral: 'fresh' });
    assert.equal(storage.writes.some(item => item.key === storageKey('alice', 'draft') && item.value === JSON.stringify('empty')), false, 'hydration must never overwrite saved draft with defaults');
    await act(async () => { setDraft('Alice edited'); setEphemeral('unsaved Alice UI'); });
    await act(async () => { login('bob'); });
    assert.deepEqual(snapshot, { scope: 'bob', draft: 'saved Bob', ephemeral: 'fresh' });
    await act(async () => { setDraft('Bob edited'); });
    assert.equal(storage.getItem(storageKey('alice', 'draft')), JSON.stringify('Alice edited'));
    assert.equal(storage.getItem(storageKey('bob', 'draft')), JSON.stringify('Bob edited'));
    await act(async () => { resolveInitial({ data: { user: { id: 'alice' } as User }, error: null }); });
    assert.equal(snapshot.scope, 'bob', 'late initial getUser must not restore the previous account');
    await act(async () => { authEvent('SIGNED_OUT', null); });
    assert.deepEqual(snapshot, { scope: 'guest', draft: 'empty', ephemeral: 'fresh' });
    assert.equal(mounts, 3);
    let storageErrors = 0;
    events.addEventListener('intent-storage-error', () => { storageErrors++; });
    storage.failWrites = true;
    await act(async () => { setDraft('quota-limited guest draft'); });
    assert.equal(storageErrors, 1, 'hook reports failure instead of silently claiming persisted success');
    assert.equal(storage.getItem(storageKey('guest', 'draft')), JSON.stringify('empty'));
    await act(async () => { renderer?.unmount(); });
    assert.equal(unsubscribed, true);
  } finally {
    if (renderer) await act(async () => { renderer?.unmount(); });
    mocked.restore();
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'window');
  }
});

