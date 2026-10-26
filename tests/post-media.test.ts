import test from 'node:test';
import assert from 'node:assert/strict';
import { deletePostMedia, mediaStorageKey, POST_MEDIA_ACCOUNT_LIMIT, POST_MEDIA_LIMIT, readPostMedia, savePostMedia, validatePostMedia, validatePostMediaContent } from '../lib/post-media';

test('post attachments enforce separate audio/video formats and file limits', () => {
  assert.equal(validatePostMedia({ name: 'track.mp3', type: 'audio/mpeg', size: 100 }, 'audio'), 'audio');
  assert.equal(validatePostMedia({ name: 'clip.mp4', type: 'video/mp4', size: POST_MEDIA_LIMIT.video }, 'video'), 'video');
  assert.throws(() => validatePostMedia({ name: 'script.mp3', type: 'text/html', size: 100 }), /Unsupported/);
  assert.throws(() => validatePostMedia({ name: 'clip.mp4', type: 'video/mp4', size: 100 }, 'audio'), /Unsupported/);
  assert.throws(() => validatePostMedia({ name: 'huge.mp3', type: 'audio/mpeg', size: POST_MEDIA_LIMIT.audio + 1 }), /25 MB/);
  assert.throws(() => validatePostMedia({ name: 'empty.mp3', type: 'audio/mpeg', size: 0 }), /empty/);
  assert.throws(() => mediaStorageKey('user', '../another-account'), /identity/);
  assert.notEqual(mediaStorageKey('guest', 'same-id'), mediaStorageKey('user', 'same-id'));
});
test('media signatures reject files disguised as audio or video', async () => {
  await validatePostMediaContent(new Blob(['ID3test'], { type: 'audio/mpeg' }));
  await validatePostMediaContent(new Blob([new Uint8Array([0, 0, 0, 24]), 'ftypisom'], { type: 'video/mp4' }));
  await validatePostMediaContent(new Blob(['RIFF1234WAVEdata'], { type: 'audio/wav' }));
  await assert.rejects(validatePostMediaContent(new Blob(['<script>bad</script>'], { type: 'video/mp4' })), /does not match/);
});
test('IndexedDB blob records survive reads, isolate accounts and enforce quota before writes', async () => {
  const rows = new Map<string, { key: string; scope: string; attachment: { id: string }; blob: Blob }>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  function transaction() {
    let aborted = false;
    const tx = { oncomplete: null as null | (() => void), onabort: null as null | (() => void), onerror: null as null | (() => void),
      abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
      objectStore() { return {
        index() { return { getAll(scope: string) { const request = { result: [] as unknown[], onsuccess: null as null | (() => void) }; queueMicrotask(() => { request.result = [...rows.values()].filter(r => r.scope === scope); request.onsuccess?.(); if (!aborted) queueMicrotask(() => tx.oncomplete?.()); }); return request; } }; },
        put(row: { key: string; scope: string; attachment: { id: string }; blob: Blob }) { rows.set(row.key, row); },
        get(key: string) { const request = { result: undefined as unknown, onsuccess: null as null | (() => void), onerror: null }; queueMicrotask(() => { request.result = rows.get(key); request.onsuccess?.(); }); return request; },
        delete(key: string) { rows.delete(key); queueMicrotask(() => tx.oncomplete?.()); },
      }; },
    }; return tx;
  }
  const db = { objectStoreNames: { contains: () => true }, transaction, close() {} };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { const req = { result: db, onsuccess: null as null | (() => void), onerror: null, onblocked: null, onupgradeneeded: null }; queueMicrotask(() => req.onsuccess?.()); return req; } } });
  try {
    const file = new File(['ID3music'], 'music.mp3', { type: 'audio/mpeg' });
    const media = await savePostMedia('alice', file, 'audio');
    assert.equal(rows.size, 1);
    assert.equal(JSON.stringify(media).includes('ID3music'), false, 'posts contain metadata, never encoded media bytes');
    assert.equal(await (await readPostMedia('alice', media))?.text(), 'ID3music');
    assert.equal(await readPostMedia('bob', media), null);
    await deletePostMedia('bob', media.id);
    assert.equal(rows.size, 1, 'another account cannot delete the blob');
    rows.set(mediaStorageKey('alice', 'quota'), { key: mediaStorageKey('alice', 'quota'), scope: 'alice', attachment: { id: 'quota' }, blob: { size: POST_MEDIA_ACCOUNT_LIMIT } as Blob });
    await assert.rejects(savePostMedia('alice', file), /200 MB/);
    assert.equal(rows.size, 2, 'quota failure writes no attachment');
    await deletePostMedia('alice', media.id);
    assert.equal(await readPostMedia('alice', media), null);
  } finally { if (original) Object.defineProperty(globalThis, 'indexedDB', original); else Reflect.deleteProperty(globalThis, 'indexedDB'); }
});
