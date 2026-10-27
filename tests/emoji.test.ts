import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMOJI_COUNT, EMOJI_RAW } from '../lib/emoji-data';
import { EMOJI_CATEGORIES, EMOJI_CATEGORY_LABELS, parseEmojiCatalog, pushRecentEmoji, searchEmoji, withTone, loadEmojiCatalog } from '../lib/emoji';
import { DICT_MEDIA } from '../lib/i18n-media';

const catalog = parseEmojiCatalog(EMOJI_RAW);

test('catalog contains the full Unicode set incl. flags, ZWJ sequences and skin tones', () => {
  assert.ok(EMOJI_COUNT >= 1900, `count ${EMOJI_COUNT}`);
  assert.equal(catalog.all.length, EMOJI_COUNT);
  for (const c of EMOJI_CATEGORIES) assert.ok(catalog.byCategory[c].length > 50, c);
  assert.ok(catalog.byCategory.flags.some(e => e.emoji === '🇵🇱'));
  assert.ok(catalog.byCategory.flags.some(e => e.emoji === '🇺🇦'));
  assert.ok(catalog.lookup.has('👩‍💻'), 'ZWJ sequence');
  assert.ok(catalog.lookup.has('❤️‍🔥'));
  assert.equal(new Set(catalog.all.map(e => e.emoji)).size, catalog.all.length, 'no duplicates');
  const wave = catalog.lookup.get('👋')!;
  assert.equal(wave.tones?.length, 5);
  assert.equal(withTone(wave, 0), '👋');
  assert.equal(withTone(wave, 3), '👋🏽');
  assert.equal(withTone(catalog.lookup.get('🍕')!, 4), '🍕', 'no tones -> unchanged');
  assert.equal(catalog.lookup.get('👋🏿'), wave);
});

test('search ranks name matches first and uses keywords', () => {
  assert.equal(searchEmoji(catalog, 'pizza')[0].emoji, '🍕');
  assert.equal(searchEmoji(catalog, 'Grinning face')[0].emoji, '😀');
  assert.ok(searchEmoji(catalog, 'hello').some(e => e.emoji === '👋'), 'keyword');
  assert.ok(searchEmoji(catalog, 'flag poland').some(e => e.emoji === '🇵🇱'), 'multi-term');
  assert.deepEqual(searchEmoji(catalog, '   '), []);
  assert.deepEqual(searchEmoji(catalog, 'zzzqqqxx'), []);
  assert.ok(searchEmoji(catalog, 'a', 10).length <= 10);
});

test('lazy loader resolves the same catalog', async () => {
  const lazy = await loadEmojiCatalog();
  assert.equal(lazy.all.length, EMOJI_COUNT);
  assert.equal(await loadEmojiCatalog(), lazy, 'cached');
});

test('recent list dedupes, caps and rejects junk', () => {
  assert.deepEqual(pushRecentEmoji(['😀', '🍕'], '🍕'), ['🍕', '😀']);
  assert.equal(pushRecentEmoji(Array.from({ length: 40 }, (_, i) => String(i)), '🔥').length, 32);
  assert.deepEqual(pushRecentEmoji(['😀'], 'x'.repeat(100)), ['😀']);
});

test('every category label is translated into all 7 languages', () => {
  for (const label of Object.values(EMOJI_CATEGORY_LABELS)) {
    const row = DICT_MEDIA[label];
    assert.ok(row && row.length === 7 && row.every(v => typeof v === 'string' && v.length > 0), label);
  }
});

test('every UI string in the new pickers has a translation row', async () => {
  const { readFileSync } = await import('node:fs');
  const { DICT } = await import('../lib/i18n-dict');
  const { DICT_EXTRA } = await import('../lib/i18n-extra');
  for (const file of ['components/EmojiPicker.tsx', 'components/GifPicker.tsx', 'components/GifView.tsx']) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/(?<![\w.])t\((['"])((?:(?!\1).)+)\1/g)) {
      const key = m[2].replace(/\\'/g, "'");
      assert.ok(DICT[key] || DICT_EXTRA[key] || DICT_MEDIA[key], `${file}: missing translation for "${key}"`);
    }
  }
});
