'use client';
// Tiny shared store so the right rail (rendered by page.tsx as a sibling) shows the same
// cards and triggers the same actions as the Communities page.
import { useSyncExternalStore } from 'react';
import type { CardItem } from './model';

export type RailState = { items: CardItem[]; open: (key: string) => void; join: (key: string) => void; create: () => void; discover: () => void; busyKey: string | null };
const noop = () => {};
let state: RailState = { items: [], open: noop, join: noop, create: noop, discover: noop, busyKey: null };
const listeners = new Set<() => void>();
export function setRailState(next: Partial<RailState>) { state = { ...state, ...next }; listeners.forEach(l => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const get = () => state;
export const useRailState = () => useSyncExternalStore(subscribe, get, get);
