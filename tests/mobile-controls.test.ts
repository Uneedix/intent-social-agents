import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_LAUNCHER, LAUNCHER_SIZE, LONG_PRESS_MS, isLauncherOverTrash,
  launcherPosition, sanitizeLauncher,
} from '../lib/mobile-controls';

test('launcher preferences recover from damaged storage without trusting flags or coordinates', () => {
  for (const raw of [null, undefined, false, 10, 'hidden', [], {}, { version: 2 },
    { version: 1, hidden: 'yes', x: '40', y: {} },
    { version: 1, hidden: false, x: Number.NaN, y: Number.POSITIVE_INFINITY },
  ]) {
    const state = sanitizeLauncher(raw);
    assert.equal(state.version, 1);
    assert.equal(typeof state.hidden, 'boolean');
    assert.ok(state.x === null || Number.isFinite(state.x));
    assert.ok(state.y === null || Number.isFinite(state.y));
    assert.deepEqual(Object.keys(state).sort(), ['hidden', 'version', 'x', 'y']);
  }
  assert.deepEqual(sanitizeLauncher({ version: 1, hidden: true, x: 120, y: 240 }), { version: 1, hidden: true, x: 120, y: 240 });
  const malformed = { version: 1, hidden: 'yes', x: '40', y: false };
  assert.equal(sanitizeLauncher(malformed).hidden, false);
  assert.equal(sanitizeLauncher(malformed).x, null);
  assert.equal(sanitizeLauncher(malformed).y, null);
  assert.deepEqual(malformed, { version: 1, hidden: 'yes', x: '40', y: false }, 'recovery must not mutate caller data');
  assert.equal(LAUNCHER_SIZE, 48);
  assert.equal(LONG_PRESS_MS, 350);
});

test('launcher stays within the resized mobile viewport and above its reserved bottom controls', () => {
  for (const [width, height, bottomInset] of [[390, 844, 88], [320, 568, 88], [768, 1024, 120], [844, 390, 88], [200, 220, 120]]) {
    for (const [x, y] of [[null, null], [0, 0], [-100, -100], [9000, 9000], [140, 280]]) {
      const state = sanitizeLauncher({ version: 1, hidden: false, x, y });
      const point = launcherPosition(state, width, height, bottomInset);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x + LAUNCHER_SIZE <= width, 'horizontal edge never clips the round button');
      assert.ok(point.y >= 0 && point.y + LAUNCHER_SIZE <= height - bottomInset, 'button remains above navigation and creation controls');
    }
  }
  const resized = launcherPosition({ version: 1, hidden: false, x: 740, y: 940 }, 320, 568);
  assert.ok(resized.x + LAUNCHER_SIZE <= 320);
  assert.ok(resized.y + LAUNCHER_SIZE <= 568 - 88);
  for (const [width, height] of [[0, 0], [-100, -100], [Number.NaN, Number.POSITIVE_INFINITY]]) {
    const point = launcherPosition(DEFAULT_LAUNCHER, width, height);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0);
  }
});

test('trash drop tests the launcher center and respects the configured safe-area offset', () => {
  const width = 390, height = 844;
  for (const bottomInset of [88, 120]) {
    const center = { x: width / 2 - LAUNCHER_SIZE / 2, y: height - bottomInset - 44 - LAUNCHER_SIZE / 2 };
    assert.equal(isLauncherOverTrash(center, width, height, bottomInset), true);
    assert.equal(isLauncherOverTrash({ x: center.x + 20, y: center.y + 20 }, width, height, bottomInset), true);
    assert.equal(isLauncherOverTrash({ x: center.x + 100, y: center.y }, width, height, bottomInset), false);
    assert.equal(isLauncherOverTrash({ x: center.x, y: center.y - 100 }, width, height, bottomInset), false);
  }
  assert.equal(isLauncherOverTrash({ x: Number.NaN, y: 20 }, width, height), false);
});
