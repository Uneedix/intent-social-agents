/**
 * Explore recommendations — computed locally on this device.
 *
 * Pure and deterministic: every function takes `now` explicitly and never reads
 * storage, the clock or randomness. Signals come from local state the app already
 * keeps (reactions, saved, comments, following, hidden, muted, hidden words,
 * profile interests). There is no server-side model and no cross-user data.
 */

export type RecItem = {
  key: string;
  /** Canonical author handle (the one used by "following"/"muted"). */
  author: string;
  /** Display name of the author, used in "Why am I seeing this?" lines. */
  authorName?: string;
  /** Lower-case topics without '#'. */
  topics: string[];
  text: string;
  createdAt: number;
  likes: number;
  comments: number;
  reposts?: number;
  /** Real post id when the item is a real local post. */
  postId?: number;
};

export type Signals = {
  interests: string[];
  /** topic -> weight from posts the user reacted to / saved / commented on. */
  engagedTopics: Record<string, number>;
  /** topic -> weight from posts by people the user follows. */
  followedTopics: Record<string, number>;
  following: string[];
  /** author -> number of interactions (reactions, saves, comments). */
  interactedAuthors: Record<string, number>;
  notInterested: string[];
  hiddenPostIds: number[];
  hiddenAuthors: string[];
  hiddenTopics: string[];
  muted: string[];
  hiddenWords: string[];
};

export type Reason =
  | { key: 'Because you follow {name}'; vars: { name: string } }
  | { key: 'Because you interacted with @{h}'; vars: { h: string } }
  | { key: 'Matches your interest in #{t}'; vars: { t: string } }
  | { key: 'Because you liked posts about #{t}'; vars: { t: string } }
  | { key: 'Popular with people you follow: #{t}'; vars: { t: string } }
  | { key: 'Popular in #{t}'; vars: { t: string } }
  | { key: 'Popular right now'; vars: Record<string, never> };

export type Ranked = { item: RecItem; score: number; reason: Reason; parts?: ScoreParts };
export type ScoreParts = { interest: number; affinity: number; freshness: number; popularity: number };

/** Weights for the "For you" score. Exported so tests and docs stay in sync. */
export const WEIGHTS = {
  profileInterest: 1.0, // per matching profile interest
  engagedTopic: 0.6, // per unit of engaged-topic weight (capped at 3 per topic)
  followedTopic: 0.4, // per unit of followed-people topic weight (capped at 3 per topic)
  interestCap: 3, // max raw interest before the multiplier
  interest: 1.2, // multiplier on the capped interest term
  followed: 2.0, // author is followed
  interacted: 0.5, // per interaction with the author (capped at 4)
  freshness: 1.5, // max freshness bonus, halves every HALF_LIFE_H
  popularity: 0.35, // × log10(1 + likes + 2·comments + 3·reposts)
} as const;
export const HALF_LIFE_H = 24;
export const TRENDING_WINDOW_H = 72;
export const TRENDING_GRAVITY = 1.5;

const H = 3600_000;
const norm = (s: string) => s.trim().replace(/^#/, '').toLowerCase();

/** Hashtags in text, lower-cased without '#'. Unicode-aware. */
export function hashtags(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map(norm))];
}

/** Parse profile interests ("Technology, Music") into normalized topics. */
export function parseInterests(s: string): string[] {
  return [...new Set(s.split(',').map(norm).filter(Boolean))];
}

/** Best-effort timestamp from a post's createdAt or relative label ('now', '5m', '2h', '1d', '3w'). */
export function postTime(time: string, createdAt: number | undefined, now: number): number {
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) return createdAt;
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d|w)/i.exec(time.trim());
  if (!m) return now;
  const n = Number(m[1]); const u = m[2].toLowerCase();
  return now - n * (u === 'm' ? 60_000 : u === 'h' ? H : u === 'd' ? 24 * H : 7 * 24 * H);
}

/** Topic match: equal, or one is a prefix of the other when both have ≥4 chars (tech ↔ technology). */
export function topicMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

export const engagement = (i: RecItem) => i.likes + 2 * i.comments + 3 * (i.reposts || 0);
export const ageHours = (i: RecItem, now: number) => Math.max(0, (now - i.createdAt) / H);

export type SignalInput = {
  interests: string;
  following: string[];
  /** postId -> reaction emoji */
  reactions: Record<number, string>;
  saved: number[];
  /** postIds the current user commented on */
  commentedPostIds: number[];
  /** All real posts (used to resolve ids to topics/authors). */
  posts: RecItem[];
  /** Extra liked/saved demo items (keys). */
  engagedKeys?: string[];
  /** Demo/real items available for key lookup. */
  items?: RecItem[];
  /** Extra topics known for followed people (e.g. demo profiles). */
  peopleTopics?: Record<string, string[]>;
  notInterested?: string[];
  hiddenPostIds?: number[];
  hiddenAuthors?: string[];
  hiddenTopics?: string[];
  muted?: string[];
  hiddenWords?: string[];
  me?: string;
};

/** Collect signals from local state. */
export function buildSignals(input: SignalInput): Signals {
  const engagedTopics: Record<string, number> = {};
  const followedTopics: Record<string, number> = {};
  const interactedAuthors: Record<string, number> = {};
  const byId = new Map(input.posts.filter(p => p.postId != null).map(p => [p.postId!, p]));
  const byKey = new Map([...(input.items || []), ...input.posts].map(p => [p.key, p]));
  const engage = (p: RecItem | undefined, w: number) => {
    if (!p || p.author === input.me) return;
    p.topics.forEach(t => { engagedTopics[t] = (engagedTopics[t] || 0) + w; });
    interactedAuthors[p.author] = (interactedAuthors[p.author] || 0) + 1;
  };
  Object.keys(input.reactions).forEach(id => { if (input.reactions[Number(id)]) engage(byId.get(Number(id)), 1); });
  input.saved.forEach(id => engage(byId.get(id), 1.5));
  input.commentedPostIds.forEach(id => engage(byId.get(id), 1));
  (input.engagedKeys || []).forEach(k => engage(byKey.get(k), 1));
  const following = [...new Set(input.following)];
  input.posts.filter(p => following.includes(p.author)).forEach(p => p.topics.forEach(t => { followedTopics[t] = (followedTopics[t] || 0) + 1; }));
  following.forEach(h => (input.peopleTopics?.[h] || []).forEach(t => { followedTopics[t] = (followedTopics[t] || 0) + 1; }));
  return {
    interests: parseInterests(input.interests), engagedTopics, followedTopics, following, interactedAuthors,
    notInterested: input.notInterested || [], hiddenPostIds: input.hiddenPostIds || [], hiddenAuthors: input.hiddenAuthors || [],
    hiddenTopics: (input.hiddenTopics || []).map(norm), muted: input.muted || [], hiddenWords: (input.hiddenWords || []).map(w => w.toLowerCase()).filter(Boolean),
  };
}

export const emptySignals = (): Signals => ({ interests: [], engagedTopics: {}, followedTopics: {}, following: [], interactedAuthors: {}, notInterested: [], hiddenPostIds: [], hiddenAuthors: [], hiddenTopics: [], muted: [], hiddenWords: [] });

export function hasSignals(s: Signals) {
  return s.interests.length > 0 || s.following.length > 0 || Object.keys(s.engagedTopics).length > 0 || Object.keys(s.interactedAuthors).length > 0;
}

/** Items the user asked not to see: Not interested, hidden posts/authors/topics, muted users, hidden words. */
export function isExcluded(i: RecItem, s: Signals): boolean {
  if (s.notInterested.includes(i.key)) return true;
  if (i.postId != null && s.hiddenPostIds.includes(i.postId)) return true;
  if (s.hiddenAuthors.includes(i.author) || s.muted.includes(i.author)) return true;
  if (i.topics.some(t => s.hiddenTopics.includes(t))) return true;
  const text = i.text.toLowerCase();
  return s.hiddenWords.some(w => text.includes(w));
}

const sumMatch = (topics: string[], weights: Record<string, number>) => {
  let best = 0; let top = '';
  for (const t of topics) for (const [k, w] of Object.entries(weights)) if (topicMatches(t, k)) { const v = Math.min(3, w); if (v > best) { best = v; top = t; } }
  return { value: best, topic: top };
};

export function scoreForYou(i: RecItem, s: Signals, now: number): Ranked {
  const prof = i.topics.filter(t => s.interests.some(x => topicMatches(t, x)));
  const eng = sumMatch(i.topics, s.engagedTopics);
  const fol = sumMatch(i.topics, s.followedTopics);
  const rawInterest = WEIGHTS.profileInterest * prof.length + WEIGHTS.engagedTopic * eng.value + WEIGHTS.followedTopic * fol.value;
  const interest = WEIGHTS.interest * Math.min(WEIGHTS.interestCap, rawInterest);
  const followed = s.following.includes(i.author);
  const inter = Math.min(4, s.interactedAuthors[i.author] || 0);
  const affinity = (followed ? WEIGHTS.followed : 0) + WEIGHTS.interacted * inter;
  const freshness = WEIGHTS.freshness * Math.pow(0.5, ageHours(i, now) / HALF_LIFE_H);
  const popularity = WEIGHTS.popularity * Math.log10(1 + engagement(i));
  const parts = { interest, affinity, freshness, popularity };
  const score = interest + affinity + freshness + popularity;
  // Reason = the strongest personal contributor, else popularity.
  const cands: [number, Reason][] = [];
  if (followed) cands.push([WEIGHTS.followed, { key: 'Because you follow {name}', vars: { name: i.authorName || '@' + i.author } }]);
  if (inter) cands.push([WEIGHTS.interacted * inter, { key: 'Because you interacted with @{h}', vars: { h: i.author } }]);
  if (prof.length) cands.push([WEIGHTS.interest * WEIGHTS.profileInterest * prof.length, { key: 'Matches your interest in #{t}', vars: { t: prof[0] } }]);
  if (eng.value) cands.push([WEIGHTS.interest * WEIGHTS.engagedTopic * eng.value, { key: 'Because you liked posts about #{t}', vars: { t: eng.topic } }]);
  if (fol.value) cands.push([WEIGHTS.interest * WEIGHTS.followedTopic * fol.value, { key: 'Popular with people you follow: #{t}', vars: { t: fol.topic } }]);
  cands.sort((a, b) => b[0] - a[0]);
  return { item: i, score, parts, reason: cands[0]?.[1] || popularReason(i) };
}

const popularReason = (i: RecItem): Reason => i.topics[0] ? { key: 'Popular in #{t}', vars: { t: i.topics[0] } } : { key: 'Popular right now', vars: {} };

/** Stable order: score desc, then newer, then key. */
const byScore = (a: Ranked, b: Ranked) => b.score - a.score || b.item.createdAt - a.item.createdAt || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0);

/**
 * Greedy diversity re-rank: never more than `maxRun` consecutive items from the same
 * author or with the same primary topic, unless nothing else is left.
 */
export function diversify(ranked: Ranked[], maxRun = 2): Ranked[] {
  const left = [...ranked]; const out: Ranked[] = [];
  const runOf = (f: (r: Ranked) => string | undefined, v: string | undefined) => {
    if (!v) return 0; let n = 0;
    for (let k = out.length - 1; k >= 0 && f(out[k]) === v; k--) n++;
    return n;
  };
  const author = (r: Ranked) => r.item.author; const topic = (r: Ranked) => r.item.topics[0];
  while (left.length) {
    let idx = left.findIndex(r => runOf(author, author(r)) < maxRun && runOf(topic, topic(r)) < maxRun);
    if (idx < 0) idx = 0;
    out.push(left.splice(idx, 1)[0]);
  }
  return out;
}

/** Engagement velocity: log engagement / (age + 2h)^gravity. */
export function trendingScore(i: RecItem, now: number): number {
  return Math.log10(1 + engagement(i)) / Math.pow(ageHours(i, now) + 2, TRENDING_GRAVITY);
}

/** Trending: items from the last few days by velocity; older items follow, also by velocity. */
export function rankTrending(items: RecItem[], now: number, s: Signals = emptySignals()): Ranked[] {
  const list = items.filter(i => !isExcluded(i, s)).map(item => ({ item, score: trendingScore(item, now), reason: popularReason(item) }));
  const recent = list.filter(r => ageHours(r.item, now) <= TRENDING_WINDOW_H).sort(byScore);
  const older = list.filter(r => ageHours(r.item, now) > TRENDING_WINDOW_H).sort(byScore);
  return [...recent, ...older];
}

/** "For you": personal score + diversity. Cold start (no signals) → trending. */
export function rankForYou(items: RecItem[], s: Signals, now: number): Ranked[] {
  if (!hasSignals(s)) return diversify(rankTrending(items, now, s));
  return diversify(items.filter(i => !isExcluded(i, s)).map(i => scoreForYou(i, s, now)).sort(byScore));
}

/** Rank topics by summed trending velocity of their items (for "Trending now"). */
export function trendingTopics(items: RecItem[], now: number, s: Signals = emptySignals()): { topic: string; score: number; count: number }[] {
  const m = new Map<string, { score: number; count: number }>();
  for (const r of rankTrending(items, now, s)) for (const t of r.item.topics) {
    const v = m.get(t) || { score: 0, count: 0 }; v.score += r.score; v.count++; m.set(t, v);
  }
  return [...m.entries()].map(([topic, v]) => ({ topic, ...v })).sort((a, b) => b.score - a.score || (a.topic < b.topic ? -1 : 1));
}

/** Topics for a real post: its hashtags plus known topic words that appear in the text. */
export function inferTopics(text: string, vocabulary: string[]): string[] {
  const words = new Set((text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []));
  return [...new Set([...hashtags(text), ...vocabulary.map(norm).filter(v => words.has(v))])];
}

/** Shortest-column-first placement → balanced masonry with equal-width columns (order kept per column). */
export function masonry<T extends { ratio: number }>(items: T[], n: number): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => []); const h = new Array(n).fill(0);
  for (const it of items) { const i = h.indexOf(Math.min(...h)); cols[i].push(it); h[i] += it.ratio + 0.04; }
  return cols;
}
