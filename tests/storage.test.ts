import {sampleChats} from '../lib/data';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearScope, exportScope, readStored, storageKey, writeStored } from '../lib/storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('account and guest storage remain isolated across account switches', () => {
  const storage = new MemoryStorage();
  const guest = storageKey('guest', 'chats');
  const alice = storageKey('alice', 'chats');
  const bob = storageKey('bob', 'chats');
  assert.equal(writeStored(storage, alice, ['private draft']), true);
  assert.deepEqual(readStored(storage, bob, [] as string[]), []);
  assert.deepEqual(readStored(storage, guest, [] as string[]), []);
  assert.equal(writeStored(storage, bob, ['different draft']), true);
  assert.deepEqual(readStored(storage, alice, [] as string[]), ['private draft']);
  assert.deepEqual(readStored(storage, bob, [] as string[]), ['different draft']);
});

test('scope encoding prevents collisions and legacy data is not adopted', () => {
  const storage = new MemoryStorage();
  storage.setItem('intent-profile-v1', JSON.stringify({ name: 'Old account' }));
  assert.notEqual(storageKey('a:b', 'c'), storageKey('a', 'b:c'));
  assert.equal(storageKey('a:b', 'c'), 'intent:v1:a%3Ab:c');
  assert.deepEqual(readStored(storage, storageKey('guest', 'profile'), { name: '' }), { name: '' });
});

test('malformed JSON and incompatible runtime shapes use the fallback', () => {
  const storage = new MemoryStorage();
  const fallback = { name: '', enabled: true, tags: [] as string[] };
  for (const raw of ['{broken', 'null', '42', '[]', '"oops"', '{"name":17,"enabled":true,"tags":[]}', '{"name":"A","enabled":"yes","tags":[]}']) {
    storage.setItem('profile', raw);
    assert.deepEqual(readStored(storage, 'profile', fallback), fallback, raw);
  }
  storage.setItem('profile', JSON.stringify({ name: 'Alice', enabled: false, tags: ['design'] }));
  assert.deepEqual(readStored(storage, 'profile', fallback), { name: 'Alice', enabled: false, tags: ['design'] });
});

test('scope export and reset affect only the selected account', () => {
  const storage = new MemoryStorage();
  writeStored(storage, storageKey('alice', 'profile'), { name: 'Alice' });
  writeStored(storage, storageKey('alice', 'chats'), ['draft']);
  writeStored(storage, storageKey('alice-other', 'profile'), { name: 'Other' });
  writeStored(storage, storageKey('bob', 'profile'), { name: 'Bob' });
  storage.setItem('sb-session', 'untouched');
  storage.setItem('intent-profile-v1', 'legacy');
  assert.deepEqual({ ...exportScope(storage, 'alice') }, { profile: { name: 'Alice' }, chats: ['draft'] });
  clearScope(storage, 'alice');
  assert.deepEqual({ ...exportScope(storage, 'alice') }, {});
  assert.deepEqual({ ...exportScope(storage, 'alice-other') }, { profile: { name: 'Other' } });
  assert.deepEqual({ ...exportScope(storage, 'bob') }, { profile: { name: 'Bob' } });
  assert.equal(storage.getItem('sb-session'), 'untouched');
  assert.equal(storage.getItem('intent-profile-v1'), 'legacy');
});

test('persisted nonempty collection schemas reject invalid nested items', () => {
  const storage = new MemoryStorage();
  const fallback = [{ id: 1, body: '', sender: { name: '' } }];
  storage.setItem('messages', JSON.stringify([{ id: 'wrong', body: 'hello', sender: { name: 'Alice' } }]));
  assert.deepEqual(readStored(storage, 'messages', fallback), fallback);
  storage.setItem('messages', JSON.stringify([{ id: 2, body: 'hello', sender: null }]));
  assert.deepEqual(readStored(storage, 'messages', fallback), fallback);
  storage.setItem('messages', '[]');
  assert.deepEqual(readStored(storage, 'messages', fallback), []);
});

test('export skips damaged values while preserving valid data in the scope', () => {
  const storage = new MemoryStorage();
  storage.setItem(storageKey('alice', 'broken'), '{bad');
  writeStored(storage, storageKey('alice', 'draft'), 'hello');
  assert.deepEqual({ ...exportScope(storage, 'alice') }, { draft: 'hello' });
});

test('blocked storage reads fall back and quota failures are reported', () => {
  class BlockedStorage extends MemoryStorage {
    getItem(): string | null { throw new Error('Storage blocked'); }
    setItem(): void { throw new Error('Quota exceeded'); }
  }
  const storage = new BlockedStorage();
  assert.equal(readStored(storage, 'key', 'fallback'), 'fallback');
  assert.equal(writeStored(storage, 'key', 'draft'), false);
});


test('heterogeneous chat history retains grouped pins across reloads',()=>{
 const storage=new MemoryStorage();const initial=sampleChats();const chats=structuredClone(initial);
 chats[1].pinnedMessages=[{messageId:chats[1].messages[0].id,scope:'self'},{messageId:chats[1].messages[1].id,scope:'everyone'}];
 const key=storageKey('alice','intent-chats-v2');writeStored(storage,key,chats);
 const restored=readStored(storage,key,initial);
 assert.deepEqual(restored[1].pinnedMessages,chats[1].pinnedMessages);
 assert.deepEqual(restored,chats);
});
