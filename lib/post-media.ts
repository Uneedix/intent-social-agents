import { storageKey } from './storage';

export type PostMediaAttachment = { id: string; kind: 'audio' | 'video'; name: string; mime: string; size: number };
export const POST_MEDIA_LIMIT = { audio: 25 * 1024 * 1024, video: 50 * 1024 * 1024 };
export const POST_MEDIA_ACCOUNT_LIMIT = 200 * 1024 * 1024;
const AUDIO = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/flac']);
const VIDEO = new Set(['video/mp4', 'video/webm', 'video/ogg']);
export const POST_MEDIA_ACCEPT = { audio: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac,.mp3,.wav,.ogg,.m4a,.flac', video: 'video/mp4,video/webm,video/ogg,.mp4,.webm,.ogv' };
const DB = 'intent-post-media-v1', STORE = 'attachments';
export function validatePostMedia(file: Pick<File, 'type' | 'size' | 'name'>, expected?: 'audio' | 'video'): 'audio' | 'video' {
  const kind = AUDIO.has(file.type) ? 'audio' : VIDEO.has(file.type) ? 'video' : null;
  if (!kind || expected && kind !== expected) throw new Error('Unsupported media format. Use MP3, WAV, OGG, M4A, FLAC, MP4 or WebM.');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The file is empty.');
  if (file.size > POST_MEDIA_LIMIT[kind]) throw new Error(kind === 'audio' ? 'Audio must be 25 MB or smaller.' : 'Video must be 50 MB or smaller.');
  return kind;
}
export function mediaStorageKey(scope: string, id: string) {
  if (!scope || scope.length > 200 || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid media identity.');
  return storageKey(scope, 'post-media:' + id);
}
export async function validatePostMediaContent(file: Blob & { type: string }) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  const type = file.type;
  const ok = type === 'audio/mpeg' || type === 'audio/mp3' ? text(0, 3) === 'ID3' || b[0] === 255 && (b[1] & 224) === 224
    : type === 'audio/wav' || type === 'audio/x-wav' ? text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE'
    : type === 'audio/ogg' || type === 'video/ogg' ? text(0, 4) === 'OggS'
    : type === 'audio/flac' ? text(0, 4) === 'fLaC'
    : type === 'audio/mp4' || type === 'video/mp4' ? text(4, 8) === 'ftyp'
    : type === 'video/webm' ? b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163 : false;
  if (!ok) throw new Error('This file does not match its media format. Choose a valid audio or video file.');
}
function open(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) { const store = req.result.createObjectStore(STORE, { keyPath: 'key' }); store.createIndex('scope', 'scope'); } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('Media storage is unavailable. Check browser storage permissions.'));
    req.onblocked = () => reject(new Error('Close other INTENT tabs and try again.'));
  });
}
type StoredMedia = { key: string; scope: string; attachment: PostMediaAttachment; blob: Blob };
/** Only blob metadata goes into posts/localStorage. The actual bytes stay in IndexedDB. */
export async function savePostMedia(scope: string, file: File, expected?: 'audio' | 'video'): Promise<PostMediaAttachment> {
  const kind = validatePostMedia(file, expected);
  await validatePostMediaContent(file);
  const id = crypto.randomUUID();
  const key = mediaStorageKey(scope, id);
  const attachment: PostMediaAttachment = { id, kind, name: file.name.slice(0, 200), mime: file.type, size: file.size };
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
      let quota = false;
      const all = store.index('scope').getAll(scope);
      all.onsuccess = () => {
        const used = (all.result as StoredMedia[]).filter(x => x.scope === scope).reduce((n, x) => n + x.blob.size, 0);
        if (used + file.size > POST_MEDIA_ACCOUNT_LIMIT) { quota = true; tx.abort(); return; }
        store.put({ key, scope, attachment, blob: file } satisfies StoredMedia);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error(quota ? 'Local media storage limit reached (200 MB). Remove unused attachments or free browser storage.' : 'Could not save the media file. Browser storage may be full.'));
    });
    return attachment;
  } finally { db.close(); }
}
export async function readPostMedia(scope: string, attachment: PostMediaAttachment): Promise<Blob | null> {
  const db = await open();
  try { return await new Promise<Blob | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(mediaStorageKey(scope, attachment.id));
    req.onsuccess = () => { const row = req.result as StoredMedia | undefined; resolve(row?.scope === scope && row.attachment.id === attachment.id ? row.blob : null); };
    req.onerror = () => reject(new Error('Could not read this media file.'));
  }); } finally { db.close(); }
}
export async function deletePostMedia(scope: string, id: string): Promise<void> {
  const key = mediaStorageKey(scope, id), db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error('Could not remove the media file.'));
  }); } finally { db.close(); }
}
