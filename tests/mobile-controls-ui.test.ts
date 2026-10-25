import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { DEFAULT_LAUNCHER, LAUNCHER_SIZE, LONG_PRESS_MS, launcherPosition, sanitizeLauncher, type LauncherState } from '../lib/mobile-controls';
import { storageKey } from '../lib/storage';
import type { Chat } from '../lib/data';

class MemoryStorage implements Storage {
  private rows = new Map<string, string>();
  get length() { return this.rows.size; }
  clear() { this.rows.clear(); }
  getItem(key: string) { return this.rows.get(key) ?? null; }
  key(index: number) { return [...this.rows.keys()][index] ?? null; }
  removeItem(key: string) { this.rows.delete(key); }
  setItem(key: string, value: string) { this.rows.set(key, value); }
}
let scope = 'alice';
const words = (node: ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : words(child)).join('');

test('mobile widget launcher distinguishes taps from long-press drag, cancels safely and hides only the current account button', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  scope = 'alice';
  const storage = new MemoryStorage();
  const win = Object.assign(new EventTarget(), { innerWidth: 390, innerHeight: 844 });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const session = mock.module('../components/SessionBoundary.tsx', { cache: true, namedExports: {
    useSession: () => ({ scope, user: scope === 'guest' ? null : { id: scope } }),
  } });
  const css = mock.module('../components/FloatingWidgetLauncher.module.css', { cache: true, defaultExport: {} });
  const { default: FloatingWidgetLauncher } = await import('../components/FloatingWidgetLauncher');
  const { useStored } = await import('../lib/social');
  const logicalKey = 'intent-widget-launcher-v1';
  const widgetData = JSON.stringify({ version: 1, widgets: [{ id: 'private-note', type: 'notes', data: { text: 'Keep this content when hiding the launcher' } }] });
  storage.setItem(storageKey('alice', 'intent-widget-panel-v1'), widgetData);
  const updates: LauncherState[] = [];
  let opens = 0;
  const captures = new Set<number>();
  const target = {
    setPointerCapture(id: number) { captures.add(id); },
    hasPointerCapture(id: number) { return captures.has(id); },
    releasePointerCapture(id: number) { captures.delete(id); },
  };
  function Harness() {
    const [state, setState] = useStored<LauncherState>(logicalKey, DEFAULT_LAUNCHER);
    return createElement('div', null,
      createElement(FloatingWidgetLauncher, { state, onChange: next => { updates.push(next); setState(next); }, onOpen: () => { opens++; } }),
      createElement('button', { 'aria-label': 'Restore widgets', onClick: () => setState({ ...DEFAULT_LAUNCHER }) }, 'Restore widgets'));
  }
  let renderer: ReactTestRenderer | undefined;
  const launcher = () => renderer!.root.findByProps({ 'aria-label': 'My widgets' });
  const trash = () => renderer!.root.findAllByProps({ 'data-widget-trash': 'true' });
  const saved = (identity = scope) => sanitizeLauncher(JSON.parse(storage.getItem(storageKey(identity, logicalKey))!));
  const tick = async (ms: number) => { await act(async () => { t.mock.timers.tick(ms); }); };
  const pointer = async (name: string, id: number, x: number, y: number, button = 0, isPrimary = true) => {
    await act(async () => { launcher().props[name]({ pointerId: id, clientX: x, clientY: y, button, isPrimary, currentTarget: target, preventDefault() {} }); });
  };
  const center = () => ({ x: launcher().props.style.left + LAUNCHER_SIZE / 2, y: launcher().props.style.top + LAUNCHER_SIZE / 2 });
  const startHold = async () => { const point = center(); await pointer('onPointerDown', 7, point.x, point.y); await tick(LONG_PRESS_MS); return point; };
  try {
    await act(async () => { renderer = create(createElement(Harness, { key: scope })); });
    assert.equal(launcher().props.type, 'button'); assert.equal(launcher().props['aria-haspopup'], 'dialog');
    await act(async () => { launcher().props.onClick({ detail: 1 }); }); assert.equal(opens, 1);
    await act(async () => { launcher().props.onClick({ detail: 0 }); }); assert.equal(opens, 2, 'keyboard activation opens the widget panel');
    let point = center();
    await pointer('onPointerDown', 7, point.x, point.y, 2); assert.equal(captures.size, 0);
    await pointer('onPointerDown', 7, point.x, point.y, 0, false); assert.equal(captures.size, 0);
    await pointer('onPointerDown', 7, point.x, point.y);
    await pointer('onPointerMove', 7, point.x + 30, point.y);
    await tick(LONG_PRESS_MS);
    assert.equal(trash().length, 0, 'scroll-sized movement before long press does not start dragging');
    await pointer('onPointerUp', 7, point.x + 30, point.y);
    await act(async () => { launcher().props.onClick({ detail: 1 }); }); assert.equal(opens, 2, 'cancelled drag cannot accidentally open the panel');
    assert.equal(updates.length, 0); assert.equal(captures.size, 0);
    await tick(401);
    point = center(); await pointer('onPointerDown', 7, point.x, point.y);
    await tick(LONG_PRESS_MS - 1); assert.equal(trash().length, 0);
    await tick(1); assert.equal(trash().length, 1);
    await pointer('onPointerDown', 8, point.x, point.y);
    assert.ok(captures.has(7) && !captures.has(8), 'another primary pointer cannot replace an active drag');
    await pointer('onPointerMove', 8, 0, 0); assert.equal(updates.length, 0);
    await pointer('onPointerCancel', 8, 0, 0); assert.equal(trash().length, 1);
    await pointer('onLostPointerCapture', 8, 0, 0); assert.equal(trash().length, 1);
    await pointer('onPointerMove', 7, -500, 10_000);
    assert.ok(launcher().props.style.left >= 0 && launcher().props.style.top + LAUNCHER_SIZE <= 844 - 88);
    assert.equal(updates.length, 0, 'moving previews geometry without persisting until drop');
    await pointer('onPointerUp', 7, -500, 10_000);
    assert.equal(updates.length, 1); assert.equal(saved().hidden, false); assert.equal(captures.size, 0);
    await act(async () => { launcher().props.onClick({ detail: 1 }); }); assert.equal(opens, 2, 'drag-end click is suppressed');
    const persisted = storage.getItem(storageKey('alice', logicalKey));
    point = await startHold(); await pointer('onPointerMove', 7, point.x + 90, point.y - 100);
    await act(async () => { launcher().props.onKeyDown({ key: 'Escape', preventDefault() {} }); });
    assert.equal(trash().length, 0); assert.equal(captures.size, 0);
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), persisted, 'Escape cancels without writing new coordinates');
    point = await startHold(); await pointer('onPointerMove', 7, point.x + 50, point.y - 80);
    await pointer('onPointerCancel', 7, point.x, point.y);
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), persisted, 'pointer cancellation never persists a preview');
    point = await startHold(); await pointer('onLostPointerCapture', 7, point.x, point.y);
    assert.equal(trash().length, 0); assert.equal(captures.size, 0);
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), persisted);
    await startHold(); await pointer('onPointerMove', 7, 390 / 2, 844 - 88 - 44);
    assert.equal(trash().length, 1); await pointer('onPointerUp', 7, 390 / 2, 844 - 88 - 44);
    assert.equal(saved('alice').hidden, true);
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'My widgets' }).length, 0);
    assert.equal(storage.getItem(storageKey('alice', 'intent-widget-panel-v1')), widgetData, 'hiding only affects the button, never widget contents');
    const hiddenAlice = storage.getItem(storageKey('alice', logicalKey));
    scope = 'bob'; await act(async () => { renderer!.update(createElement(Harness, { key: scope })); });
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'My widgets' }).length, 1, 'another account retains its own launcher');
    await act(async () => { renderer!.root.findByProps({ 'aria-label': 'Restore widgets' }).props.onClick(); });
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), hiddenAlice, 'restoring Bob cannot reset Alice preferences');
    scope = 'alice'; await act(async () => { renderer!.update(createElement(Harness, { key: scope })); });
    assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'My widgets' }).length, 0);
    await act(async () => { renderer!.root.findByProps({ 'aria-label': 'Restore widgets' }).props.onClick(); });
    assert.equal(saved().hidden, false); assert.equal(renderer!.root.findAllByProps({ 'aria-label': 'My widgets' }).length, 1);
    assert.equal(storage.getItem(storageKey('alice', 'intent-widget-panel-v1')), widgetData);
    const beforeResize = storage.getItem(storageKey('alice', logicalKey));
    win.innerWidth = 320; win.innerHeight = 568;
    await act(async () => { win.dispatchEvent(new Event('resize')); });
    const expected = launcherPosition(saved(), 320, 568);
    assert.equal(launcher().props.style.left, expected.x); assert.equal(launcher().props.style.top, expected.y);
    assert.equal(storage.getItem(storageKey('alice', logicalKey)), beforeResize, 'viewport changes do not rewrite account preferences');
    await startHold();
    const updateCount = updates.length;
    await act(async () => { renderer!.unmount(); }); renderer = undefined;
    assert.equal(captures.size, 0); await tick(LONG_PRESS_MS + 1); assert.equal(updates.length, updateCount);
  } finally {
    await act(async () => { renderer?.unmount(); });
    css.restore(); session.restore(); t.mock.timers.reset();
    Reflect.deleteProperty(globalThis, 'window'); Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
