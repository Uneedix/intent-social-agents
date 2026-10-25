import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSignals, diversify, emptySignals, hashtags, inferTopics, isExcluded, parseInterests, postTime, rankForYou, rankTrending,
  masonry, scoreForYou, trendingScore, HALF_LIFE_H, type RecItem, type Ranked,
} from '../lib/explore-recs';
import { DICT } from '../lib/i18n-dict';
import { DICT_EXTRA } from '../lib/i18n-extra';
import { DICT_EXPLORE, EXPLORE_I18N_KEYS } from '../lib/i18n-explore';

const NOW = Date.UTC(2026, 9, 25, 12);
const H = 3600_000;
const item = (key: string, o: Partial<RecItem> = {}): RecItem => ({ key, author: 'a-' + key, topics: [], text: '', createdAt: NOW - 2 * H, likes: 100, comments: 10, ...o });
const keys = (r: Ranked[]) => r.map(x => x.item.key);

test('hashtags, interests and topic inference are normalized', () => {
  assert.deepEqual(hashtags('Hi #Warsaw and #warsaw #Kraków!'), ['warsaw', 'kraków']);
  assert.deepEqual(parseInterests(' Technology, Music ,, #Travel'), ['technology', 'music', 'travel']);
  assert.deepEqual(inferTopics('Found a spot in Warsaw #coffee', ['warsaw', 'tech']), ['coffee', 'warsaw']);
});

test('postTime prefers createdAt and parses relative labels', () => {
  assert.equal(postTime('2h', 123, NOW), 123);
  assert.equal(postTime('2h', undefined, NOW), NOW - 2 * H);
  assert.equal(postTime('1d', undefined, NOW), NOW - 24 * H);
  assert.equal(postTime('now', undefined, NOW), NOW);
});

test('cold start (no signals) falls back to trending order', () => {
  const items = [item('old-big', { likes: 50_000, createdAt: NOW - 60 * H }), item('fresh', { likes: 2000, createdAt: NOW - 1 * H }), item('mid', { likes: 500, createdAt: NOW - 10 * H })];
  const s = emptySignals();
  assert.deepEqual(keys(rankForYou(items, s, NOW)), keys(rankTrending(items, NOW, s)));
  assert.equal(rankForYou(items, s, NOW)[0].item.key, 'fresh');
});

test('trending uses velocity and puts items older than the window last', () => {
  const items = [item('ancient', { likes: 1e6, createdAt: NOW - 200 * H }), item('a', { likes: 1000, createdAt: NOW - 3 * H }), item('b', { likes: 1000, createdAt: NOW - 30 * H })];
  assert.deepEqual(keys(rankTrending(items, NOW)), ['a', 'b', 'ancient']);
  assert.ok(trendingScore(items[1], NOW) > trendingScore(items[2], NOW));
});

test('interest match, follows and interactions raise scores with readable reasons', () => {
  const posts = [item('liked', { postId: 1, author: 'sofia', topics: ['travel'] })];
  const s = buildSignals({ interests: 'Tech', following: ['luca'], reactions: { 1: '❤️' }, saved: [], commentedPostIds: [], posts });
  const base = item('x', { topics: ['food'] });
  const tech = scoreForYou(item('t', { topics: ['technology'] }), s, NOW);
  const followed = scoreForYou(item('f', { author: 'luca', authorName: 'Luca', topics: ['food'] }), s, NOW);
  const interacted = scoreForYou(item('i', { author: 'sofia', topics: ['food'] }), s, NOW);
  const travel = scoreForYou(item('tr', { topics: ['travel'] }), s, NOW);
  const plain = scoreForYou(base, s, NOW);
  for (const r of [tech, followed, interacted, travel]) assert.ok(r.score > plain.score, r.item.key);
  assert.deepEqual(tech.reason, { key: 'Matches your interest in #{t}', vars: { t: 'technology' } });
  assert.deepEqual(followed.reason, { key: 'Because you follow {name}', vars: { name: 'Luca' } });
  assert.equal(travel.reason.key, 'Because you liked posts about #{t}');
  assert.deepEqual(plain.reason, { key: 'Popular in #{t}', vars: { t: 'food' } });
});

test('followed people topics count as interest; own posts are not signals', () => {
  const s = buildSignals({ me: 'you', interests: '', following: ['maria'], reactions: { 9: '❤️' }, saved: [], commentedPostIds: [], posts: [item('mine', { postId: 9, author: 'you', topics: ['cars'] })], peopleTopics: { maria: ['travel'] } });
  assert.deepEqual(s.engagedTopics, {});
  assert.equal(s.followedTopics.travel, 1);
  assert.equal(scoreForYou(item('t', { topics: ['travel'] }), s, NOW).reason.key, 'Popular with people you follow: #{t}');
});

test('freshness halves every half-life', () => {
  const s = buildSignals({ interests: 'x', following: [], reactions: {}, saved: [], commentedPostIds: [], posts: [] });
  const f0 = scoreForYou(item('a', { createdAt: NOW }), s, NOW).parts!.freshness;
  const f1 = scoreForYou(item('a', { createdAt: NOW - HALF_LIFE_H * H }), s, NOW).parts!.freshness;
  assert.ok(Math.abs(f1 - f0 / 2) < 1e-9);
});

test('exclusions: not interested, hidden posts/authors/topics, muted users, hidden words', () => {
  const s = { ...emptySignals(), notInterested: ['n'], hiddenPostIds: [7], hiddenAuthors: ['ha'], hiddenTopics: ['cars'], muted: ['mu'], hiddenWords: ['spoiler'] };
  assert.ok(isExcluded(item('n'), s));
  assert.ok(isExcluded(item('p', { postId: 7 }), s));
  assert.ok(isExcluded(item('a', { author: 'ha' }), s));
  assert.ok(isExcluded(item('t', { topics: ['cars'] }), s));
  assert.ok(isExcluded(item('m', { author: 'mu' }), s));
  assert.ok(isExcluded(item('w', { text: 'Big SPOILER here' }), s));
  assert.ok(!isExcluded(item('ok'), s));
  const items = [item('n'), item('ok'), item('m', { author: 'mu' })];
  assert.deepEqual(keys(rankTrending(items, NOW, s)), ['ok']);
  assert.deepEqual(keys(rankForYou(items, { ...s, following: ['someone'] }, NOW)), ['ok']);
});

test('diversity: never more than 2 consecutive items from one author or primary topic when avoidable', () => {
  const ranked: Ranked[] = ['a1', 'a2', 'a3', 'a4', 'b1', 'c1'].map((k, i) => ({ item: item(k, { author: k[0], topics: [k[0] === 'a' ? 'x' : k] }), score: 10 - i, reason: { key: 'Popular right now', vars: {} } }));
  const out = keys(diversify(ranked));
  assert.deepEqual(out, ['a1', 'a2', 'b1', 'a3', 'a4', 'c1']);
  const runs = (f: (k: string) => string) => { let max = 1, n = 1; for (let i = 1; i < out.length; i++) { n = f(out[i]) === f(out[i - 1]) ? n + 1 : 1; max = Math.max(max, n); } return max; };
  assert.ok(runs(k => k[0]) <= 2);
});

test('ranking is deterministic and stable for ties', () => {
  const s = buildSignals({ interests: 'travel', following: [], reactions: {}, saved: [], commentedPostIds: [], posts: [] });
  const items = ['z', 'y', 'x'].map(k => item(k, { topics: ['travel'], author: 'a' + k }));
  const a = keys(rankForYou(items, s, NOW)); const b = keys(rankForYou([...items].reverse(), s, NOW));
  assert.deepEqual(a, b);
  assert.deepEqual(a, ['x', 'y', 'z']);
});

test('masonry keeps every item once and balances column heights', () => {
  const items = [1.45, 1.07, 1.07, 0.6, 0.95, 0.95, 1.07, 0.95, 1.07, 1.45, 0.95, 0.6].map((ratio, i) => ({ ratio, i }));
  for (const n of [2, 3]) {
    const cols = masonry(items, n);
    assert.equal(cols.flat().length, items.length);
    const h = cols.map(c => c.reduce((a, x) => a + x.ratio, 0));
    assert.ok(Math.max(...h) - Math.min(...h) <= 1.5, `cols=${n} heights ${h}`);
  }
});

test('every Explore interface string is translated into all 7 languages', () => {
  for (const k of EXPLORE_I18N_KEYS) {
    const row = DICT[k] || DICT_EXTRA[k] || DICT_EXPLORE[k];
    assert.ok(row, `missing translation: ${k}`);
    assert.equal(row.length, 7, k);
    row.forEach((v, i) => assert.ok(v.trim(), `${k} [${i}] empty`));
    const vars = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
    row.forEach(v => assert.equal(vars(v), vars(k.split('|')[0]), `placeholders differ for ${k}: ${v}`));
  }
});
