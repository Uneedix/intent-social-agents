import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampPane, DEFAULT_PANE_SIZES, hasCustomPaneSizes, PANE_STORAGE_KEY, PANES, paneKeyStep, paneLimit, sanitizePaneSizes, withPaneSize, type PaneSizes,
} from '../lib/pane-sizes';
import { clearScope, readStored, storageKey, writeStored } from '../lib/storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const load = (storage: Storage, scope: string) => sanitizePaneSizes(readStored(storage, storageKey(scope, PANE_STORAGE_KEY), DEFAULT_PANE_SIZES));

test('pane widths clamp to their designed range and to the space left for the neighbour', () => {
  const list = PANES.chatList;
  assert.equal(clampPane(list, 100), list.min);
  assert.equal(clampPane(list, 9999), list.max);
  assert.equal(clampPane(list, 401.6), 402);
  assert.equal(clampPane(list, Number.NaN), list.min);
  assert.equal(clampPane(list, 500, 450), 450, 'limit narrower than max wins');
  assert.equal(clampPane(list, 500, 100), list.min, 'pane minimum beats an impossible limit');
  assert.equal(clampPane(list, 500, Number.NaN), 500, 'unknown limit falls back to the pane maximum');
  // Feed column keeps at least 520px next to the widget rail.
  assert.equal(paneLimit(PANES.widgetRail, 280, 554), 314);
  assert.equal(clampPane(PANES.widgetRail, 520, paneLimit(PANES.widgetRail, 280, 554)), 314);
  assert.equal(paneLimit(PANES.widgetRail, 280, 0), PANES.widgetRail.max, 'no rendered neighbour: only the pane maximum applies');
  for (const spec of Object.values(PANES)) {
    assert.ok(spec.min < spec.max && spec.step < spec.bigStep, spec.id);
    assert.match(spec.cssVar, /^--pane-/);
  }
});

test('keyboard steps follow the divider direction, Shift takes bigger steps and Enter resets', () => {
  const list = PANES.chatList; // pane left of the handle grows to the right
  assert.equal(paneKeyStep(list, 400, 'ArrowRight', false, 'right'), 400 + list.step);
  assert.equal(paneKeyStep(list, 400, 'ArrowLeft', true, 'right'), 400 - list.bigStep);
  const rail = PANES.widgetRail; // pane right of the handle grows to the left
  assert.equal(paneKeyStep(rail, 325, 'ArrowLeft', false, 'left'), 325 + rail.step);
  assert.equal(paneKeyStep(rail, 400, 'ArrowRight', true, 'left'), 400 - rail.bigStep);
  assert.equal(paneKeyStep(rail, 325, 'ArrowRight', true, 'left'), rail.min);
  assert.equal(paneKeyStep(rail, 510, 'ArrowLeft', true, 'left'), rail.max);
  assert.equal(paneKeyStep(rail, 300, 'ArrowLeft', true, 'left', 320), 320, 'viewport limit applies to keyboard steps');
  assert.equal(paneKeyStep(rail, 300, 'Home', false, 'left'), rail.min);
  assert.equal(paneKeyStep(rail, 300, 'End', false, 'left'), rail.max);
  assert.equal(paneKeyStep(rail, 300, 'Enter', false, 'left'), null);
  assert.equal(paneKeyStep(rail, 300, 'a', false, 'left'), undefined);
});

test('stored sizes are validated: unknown panes, wrong types and out-of-range values never apply', () => {
  assert.deepEqual(sanitizePaneSizes(null), DEFAULT_PANE_SIZES);
  assert.deepEqual(sanitizePaneSizes([400]), DEFAULT_PANE_SIZES);
  assert.deepEqual(sanitizePaneSizes({ chatList: '400', chatSide: true, widgetRail: 9000, groupList: -5, evil: 1 }),
    { chatList: null, chatSide: null, widgetRail: PANES.widgetRail.max, groupList: PANES.groupList.min });
  const sizes = withPaneSize(DEFAULT_PANE_SIZES, 'chatList', 1000);
  assert.equal(sizes.chatList, PANES.chatList.max);
  assert.equal(DEFAULT_PANE_SIZES.chatList, null, 'defaults are not mutated');
  assert.equal(hasCustomPaneSizes(DEFAULT_PANE_SIZES), false);
  assert.equal(hasCustomPaneSizes(sizes), true);
  assert.equal(hasCustomPaneSizes(withPaneSize(sizes, 'chatList', null)), false, 'per-pane reset returns to the CSS default');
});

test('pane sizes persist per account scope and reset only the current account', () => {
  const storage = new MemoryStorage();
  const alice: PaneSizes = withPaneSize(withPaneSize(DEFAULT_PANE_SIZES, 'chatList', 480), 'widgetRail', 400);
  assert.equal(writeStored(storage, storageKey('alice', PANE_STORAGE_KEY), alice), true);
  assert.deepEqual(load(storage, 'alice'), alice);
  assert.deepEqual(load(storage, 'bob'), DEFAULT_PANE_SIZES, 'another account never inherits the layout');
  assert.deepEqual(load(storage, 'guest'), DEFAULT_PANE_SIZES);
  storage.setItem(PANE_STORAGE_KEY, JSON.stringify({ chatList: 500 }));
  assert.deepEqual(load(storage, 'guest'), DEFAULT_PANE_SIZES, 'legacy unscoped key is not adopted');
  storage.setItem(storageKey('bob', PANE_STORAGE_KEY), '{broken');
  assert.deepEqual(load(storage, 'bob'), DEFAULT_PANE_SIZES);
  writeStored(storage, storageKey('alice', PANE_STORAGE_KEY), { ...DEFAULT_PANE_SIZES });
  assert.deepEqual(load(storage, 'alice'), DEFAULT_PANE_SIZES, 'Reset layout writes the defaults');
  writeStored(storage, storageKey('alice', PANE_STORAGE_KEY), alice);
  clearScope(storage, 'alice');
  assert.deepEqual(load(storage, 'alice'), DEFAULT_PANE_SIZES, 'deleting local account data removes the layout');
});
