import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampWidth, fitChatWidths, fitFeedWidths } from '../lib/panel-layout';

const damaged: unknown[] = [undefined, null, {}, [], true, '900', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

test('persisted panel widths reject nonfinite or nonnumeric values and clamp to real bounds', () => {
  for (const value of damaged) assert.equal(clampWidth(value, 240, 520, 360), 360);
  assert.equal(clampWidth(-10, 240, 520, 360), 240);
  assert.equal(clampWidth(10_000, 240, 520, 360), 520);
  assert.equal(clampWidth(400, 240, 520, 360), 400);
  assert.equal(clampWidth(undefined, 240, 520, 900), 520, 'even the fallback must obey the available bounds');
  assert.equal(clampWidth(undefined, 240, 520, -100), 240);
});

test('desktop feed resizing preserves a readable main column without overflowing the grid', () => {
  for (const container of [1051, 1080, 1200, 1390, 1710, 2200]) {
    for (const preferred of [...damaged, -1, 240, 325, 520, 100_000]) {
      const result = fitFeedWidths(container, preferred);
      assert.equal(result.enabled, true);
      assert.ok(Number.isFinite(result.rail) && result.rail >= 240 && result.rail <= 520);
      assert.ok(result.main >= 360, `main remains readable at ${container}px`);
      assert.ok(286 + 32 * 2 + result.rail + result.main <= container + 0.01, 'nav, gaps, rail and feed fit the parent width');
    }
  }
  const narrow = fitFeedWidths(1051, 520);
  const wide = fitFeedWidths(1710, 520);
  assert.ok(narrow.rail < wide.rail, 'requested rail gives space back to the feed on smaller desktops');
  assert.equal(wide.rail, 520);
});

test('mobile and corrupt feed measurements disable desktop resizing without negative geometry', () => {
  for (const container of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 320, 690, 1050]) {
    const result = fitFeedWidths(container, 520);
    assert.equal(result.enabled, false);
    assert.ok(Number.isFinite(result.main) && result.main >= 0);
    assert.ok(Number.isFinite(result.rail) && result.rail >= 0);
  }
  const result = fitFeedWidths(1200, 520, 230, 18);
  assert.ok(230 + 18 * 2 + result.rail + result.main <= 1200 + 0.01, 'compact navigation and spacing participate in the geometry');
});

test('chat desktop columns shrink to fit while keeping the conversation usable', () => {
  for (const container of [636, 700, 891, 892, 1000, 1200, 1700]) {
    for (const showInfo of [false, true]) {
      for (const list of [...damaged, 260, 360, 520, 50_000]) {
        for (const info of [undefined, Number.NaN, 240, 300, 400, 50_000]) {
          const result = fitChatWidths(container, list, info, showInfo);
          assert.equal(result.resizable, true);
          assert.equal(result.inlineInfo, showInfo && container >= 892);
          assert.ok(Number.isFinite(result.list) && result.list >= 260 && result.list <= 520);
          assert.ok(Number.isFinite(result.conversation) && result.conversation >= 360);
          assert.ok(Number.isFinite(result.info) && result.info >= 0 && result.info <= 400);
          const sum = result.list + result.conversation + 16 + (result.inlineInfo ? result.info + 16 : 0);
          assert.ok(sum <= container + 0.01, `chat columns fit ${container}px without squeezing the conversation`);
          if (result.inlineInfo) assert.ok(result.info >= 240);
        }
      }
    }
  }
});

test('stacked chats reuse available width instead of summing overlapping mobile panels', () => {
  for (const container of [0, 200, 320, 500, 635]) {
    const result = fitChatWidths(container, 520, 400, true);
    assert.equal(result.resizable, false);
    assert.equal(result.inlineInfo, false);
    assert.equal(result.list, container);
    assert.equal(result.conversation, container);
    assert.ok(result.info >= 0 && result.info <= container);
  }
  for (const container of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const result = fitChatWidths(container, 'bad', null, true);
    assert.deepEqual(result, { list: 0, info: 0, conversation: 0, inlineInfo: false, resizable: false });
  }
});
