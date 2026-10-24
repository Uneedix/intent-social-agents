/** Local demo data is isolated by identity. Legacy unscoped keys are never adopted. */
export function storageKey(scope: string, key: string) {
  return `intent:v1:${encodeURIComponent(scope)}:${key}`;
}

function matchesShape(value: unknown, fallback: unknown): boolean {
  if (fallback === null) return value === null || typeof value === 'number';
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every(item => fallback.length === 0 || matchesShape(item, fallback[0]));
  }
  if (typeof fallback === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(fallback).every(([key, sample]) => matchesShape((value as Record<string, unknown>)[key], sample));
  }
  return typeof value === typeof fallback && (typeof value !== 'number' || Number.isFinite(value));
}

export function readStored<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return matchesShape(value, fallback) ? value as T : fallback;
  } catch { return fallback; }
}

export function writeStored(storage: Storage, key: string, value: unknown): boolean {
  try { storage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

export function exportScope(storage: Storage, scope: string): Record<string, unknown> {
  const prefix = storageKey(scope, '');
  const result: Record<string, unknown> = Object.create(null);
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try { result[key.slice(prefix.length)] = JSON.parse(storage.getItem(key) || 'null'); }
    catch { /* Skip damaged values without exposing other scopes. */ }
  }
  return result;
}

export function clearScope(storage: Storage, scope: string) {
  const prefix = storageKey(scope, '');
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}
