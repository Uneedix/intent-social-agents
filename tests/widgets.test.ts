import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPreset, createWidget, defaultPanel, LIMITS, moveWidget, pauseFocus,
  remainingFocusSeconds, safeLink, startFocus, validatePanel, validDate, validDateTime,
  WIDGET_TYPES, type PanelState,
} from '../lib/widgets';

const today = '2026-10-24';

function assertSafePanel(value: unknown) {
  const panel = validatePanel(value, today);
  assert.deepEqual(validatePanel(panel, today), panel, 'recovered IDs must remain stable across render and edit normalization');
  assert.equal(panel.version, 1);
  assert.ok(panel.widgets.length <= LIMITS.widgets);
  assert.equal(new Set(panel.widgets.map(item => item.id)).size, panel.widgets.length);
  assert.equal(new Set(panel.widgets.map(item => item.type)).size, panel.widgets.length);
  for (const item of panel.widgets) {
    assert.ok(WIDGET_TYPES.includes(item.type));
    assert.equal(typeof item.collapsed, 'boolean');
    assert.ok(/^[a-zA-Z0-9_-]{1,100}$/.test(item.id));
    switch (item.type) {
      case 'notes': assert.ok(item.data.text.length <= LIMITS.notes); break;
      case 'tasks':
        assert.ok(item.data.items.length <= LIMITS.tasks);
        for (const task of item.data.items) {
          assert.equal(typeof task.done, 'boolean');
          assert.ok(task.text.length <= LIMITS.label);
        }
        break;
      case 'calendar':
        assert.ok(validDate(item.data.date));
        assert.ok(item.data.events.length <= LIMITS.events);
        for (const event of item.data.events) assert.ok(validDate(event.date));
        break;
      case 'countdown': assert.ok(item.data.date === '' || validDateTime(item.data.date)); break;
      case 'focus':
        assert.ok(Number.isFinite(item.data.minutes) && item.data.minutes >= 1 && item.data.minutes <= 90);
        assert.ok(Number.isFinite(item.data.remaining) && item.data.remaining >= 0 && item.data.remaining <= 5400);
        assert.ok(item.data.deadline === null || Number.isFinite(item.data.deadline));
        break;
      case 'links':
        assert.ok(item.data.items.length <= LIMITS.links);
        for (const link of item.data.items) assert.equal(safeLink(link.url), link.url);
        break;
      case 'goals':
        assert.ok(item.data.target >= 1 && item.data.target <= 365);
        assert.ok(item.data.progress >= 0 && item.data.progress <= item.data.target);
        break;
    }
  }
  return panel;
}

test('damaged persisted widget payloads cannot introduce unsupported, duplicate or unbounded state', () => {
  for (const value of [null, undefined, false, 0, '[]', [], {}, { version: 2, widgets: [] }, { version: 1, widgets: {} }]) assertSafePanel(value);
  const huge = 'x'.repeat(12_000);
  const panel = assertSafePanel({ version: 1, widgets: [
    { id: 'same-id', type: 'notes', collapsed: 'yes', data: { text: huge } },
    { id: 'same-id', type: 'tasks', data: { items: Array.from({ length: 100 }, (_, i) => ({ id: `task-${i}`, text: huge, done: 'yes' })) } },
    { id: '<unsafe-id>', type: 'calendar', data: { date: '2025-02-29', events: [{ id: 'bad-date', title: 'bad', date: '2026-02-31' }, { id: 'good', title: huge, date: today }] } },
    { id: 'focus', type: 'focus', data: { minutes: -100, remaining: Number.POSITIVE_INFINITY, deadline: Number.NaN } },
    { id: 'links', type: 'links', data: { items: [
      { id: 'js', title: 'unsafe', url: 'javascript:alert(1)' },
      { id: 'data', title: 'unsafe', url: 'data:text/html,evil' },
      { id: 'good', title: 'safe', url: 'https://example.com/research' },
    ] } },
    { id: 'goals', type: 'goals', data: { title: huge, target: 9, progress: 900 } },
    { id: 'countdown', type: 'countdown', data: { title: huge, date: '2026-10-24T99:99' } },
    { id: 'rates', type: 'rates', data: { base: 'UNSUPPORTED' } },
    { id: 'excess', type: 'notes', data: { text: 'extra' } },
  ] });
  assert.equal(panel.widgets.find(item => item.type === 'notes')?.data.text.length, LIMITS.notes);
  const links = panel.widgets.find(item => item.type === 'links');
  assert.deepEqual(links?.data.items.map(item => item.url), ['https://example.com/research']);
  const calendar = panel.widgets.find(item => item.type === 'calendar');
  assert.deepEqual(calendar?.data.events.map(item => item.id), ['good']);
  const tasks = panel.widgets.find(item => item.type === 'tasks');
  assert.ok(tasks?.data.items.every(item => item.done === false));
  assertSafePanel({ version: 1, widgets: [
    { id: 'a', type: 'notes', data: { text: 'keep' } },
    { id: 'b', type: 'notes', data: { text: 'duplicate' } },
    { id: 'c', type: 'unsupported', data: {} },
    { id: 'd', type: 'tasks', data: null },
  ] });
});

test('presets are additive and retain user notes, completed tasks, identifiers and order', () => {
  const notes = createWidget('notes', today);
  notes.data.text = 'Research notes must survive every preset';
  notes.collapsed = true;
  const tasks = createWidget('tasks', today);
  tasks.data.items = [{ id: 'task-kept', text: 'Preserve completed task', done: true }];
  const original: PanelState = { version: 1, widgets: [notes, tasks] };
  const originalJson = JSON.stringify(original);
  let panel = original;
  for (const preset of ['student', 'research', 'business', 'student'] as const) {
    panel = applyPreset(panel, preset);
    assert.deepEqual(panel.widgets.slice(0, 2), [notes, tasks]);
    assert.equal(new Set(panel.widgets.map(item => item.type)).size, panel.widgets.length);
    assert.ok(panel.widgets.length <= LIMITS.widgets);
  }
  assert.equal(JSON.stringify(original), originalJson, 'preset must not mutate its input');
  assert.deepEqual(applyPreset(panel, 'research'), panel, 'applying an existing preset is idempotent');
});

test('reordering changes only layout, keeps nested data and handles boundary or stale IDs', () => {
  const panel = defaultPanel(today);
  const notes = panel.widgets.find(item => item.type === 'notes');
  assert.ok(notes);
  notes.data.text = 'Retain this note';
  const before = JSON.stringify(panel);
  const moved = moveWidget(panel, notes.id, -1);
  assert.notEqual(moved.widgets.findIndex(item => item.id === notes.id), panel.widgets.findIndex(item => item.id === notes.id));
  assert.deepEqual(moved.widgets.find(item => item.id === notes.id), notes);
  assert.equal(JSON.stringify(panel), before);
  assert.deepEqual(moveWidget(panel, panel.widgets[0].id, -1), panel);
  assert.deepEqual(moveWidget(panel, panel.widgets.at(-1)!.id, 1), panel);
  assert.deepEqual(moveWidget(panel, 'deleted-widget', -1), panel);
});

test('focus timer uses elapsed wall clock across delayed ticks and pause/resume without going negative', () => {
  const initial = { minutes: 25, remaining: 1500, deadline: null };
  const start = 1_000_000;
  const running = startFocus(initial, start);
  assert.equal(remainingFocusSeconds(running, start + 125_000), 1375, 'background drift is measured from the deadline');
  const paused = pauseFocus(running, start + 125_000);
  assert.equal(paused.remaining, 1375);
  assert.equal(paused.deadline, null);
  assert.equal(remainingFocusSeconds(paused, start + 10_000_000), 1375, 'paused time does not elapse');
  const resumed = startFocus(paused, start + 10_000_000);
  assert.equal(remainingFocusSeconds(resumed, start + 10_000_000 + 1375_000), 0);
  assert.equal(remainingFocusSeconds(resumed, start + 99_000_000), 0);
  assert.equal(pauseFocus(resumed, start + 99_000_000).remaining, 0);
  assert.equal(initial.deadline, null, 'timer transitions do not mutate stored input');
});

test('links reject executable schemes, embedded credentials, control characters and oversized URLs', () => {
  for (const url of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>evil</script>',
    'file:///etc/passwd', 'vbscript:evil', '//example.com', '/relative',
    'https://user:password@example.com', 'https://example.com/\nscript',
    'https://example.com/\u0000', 'https://example.com/' + 'a'.repeat(2100),
  ]) assert.equal(safeLink(url), null, JSON.stringify(url));
  assert.equal(safeLink(' https://example.com/research?q=intent#notes '), 'https://example.com/research?q=intent#notes');
  assert.equal(safeLink('http://example.com'), 'http://example.com/');
});

test('calendar and countdown reject rollover dates and invalid clock values', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const date of ['2025-02-29', '2026-02-31', '2026-13-01', '2026-00-01', '2026-10-00', '26-10-24']) assert.equal(validDate(date), false, date);
  assert.equal(validDateTime('2026-10-24T23:59'), true);
  for (const date of ['2026-02-31T12:00', '2026-10-24T24:00', '2026-10-24T12:60', '2026-10-24', 'not-a-date']) assert.equal(validDateTime(date), false, date);
});
