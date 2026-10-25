/** Emoji catalog helpers. The ~117 KB data file is only loaded through loadEmojiCatalog() (dynamic import). */
export const EMOJI_CATEGORIES = ['people', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags'] as const;
export type EmojiCategory = typeof EMOJI_CATEGORIES[number];
export type EmojiEntry = { emoji: string; name: string; keywords: string; tones?: readonly string[]; category: EmojiCategory };
export type EmojiCatalog = { byCategory: Record<EmojiCategory, EmojiEntry[]>; all: EmojiEntry[]; lookup: Map<string, EmojiEntry> };

/** UI labels (English source strings, translated via useT). */
export const EMOJI_CATEGORY_LABELS: Record<EmojiCategory | 'recent', string> = {
  recent: 'Recent', people: 'Smileys & People', nature: 'Animals & Nature', food: 'Food & Drink',
  activity: 'Activity', travel: 'Travel & Places', objects: 'Objects', symbols: 'Symbols', flags: 'Flags',
};

/** 0 = default yellow, 1..5 = Fitzpatrick light..dark. */
export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5;
export const SKIN_TONE_SAMPLES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'] as const;
export const isSkinTone = (v: unknown): v is SkinTone => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5;

export function parseEmojiCatalog(raw: Record<EmojiCategory, string>): EmojiCatalog {
  const byCategory = {} as Record<EmojiCategory, EmojiEntry[]>;
  const all: EmojiEntry[] = [];
  const lookup = new Map<string, EmojiEntry>();
  for (const category of EMOJI_CATEGORIES) {
    byCategory[category] = (raw[category] || '').split('\n').filter(Boolean).map(line => {
      const [emoji, name = '', keywords = '', tones = ''] = line.split('|');
      const toneList = tones ? tones.split(' ') : undefined;
      const entry: EmojiEntry = { emoji, name, keywords, category, ...(toneList?.length === 5 ? { tones: toneList } : {}) };
      all.push(entry);
      lookup.set(emoji, entry);
      entry.tones?.forEach(t => lookup.set(t, entry));
      return entry;
    });
  }
  return { byCategory, all, lookup };
}

let catalogPromise: Promise<EmojiCatalog> | null = null;
export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  catalogPromise ??= import('./emoji-data').then(m => parseEmojiCatalog(m.EMOJI_RAW)).catch(error => {
    catalogPromise = null; // allow retry after a chunk load failure
    throw error;
  });
  return catalogPromise;
}

export function withTone(entry: EmojiEntry, tone: SkinTone): string {
  return tone && entry.tones ? entry.tones[tone - 1] : entry.emoji;
}

/** Ranked search: name prefix > name word prefix > keyword prefix > substring. */
export function searchEmoji(catalog: Pick<EmojiCatalog, 'all'>, query: string, limit = 200): EmojiEntry[] {
  const q = query.trim().toLowerCase().slice(0, 64);
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored: { e: EmojiEntry; s: number; i: number }[] = [];
  catalog.all.forEach((e, i) => {
    const name = e.name.toLowerCase();
    const hay = `${name} ${e.keywords}`;
    if (!terms.every(t => hay.includes(t))) return;
    let s = 4;
    if (name === q) s = 0;
    else if (name.startsWith(q)) s = 1;
    else if (name.split(/[\s:,]+/).some(w => w.startsWith(terms[0]))) s = 2;
    else if (e.keywords.split(' ').some(w => w.startsWith(terms[0]))) s = 3;
    scored.push({ e, s, i });
  });
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).slice(0, limit).map(x => x.e);
}

export const MAX_RECENT_EMOJI = 32;
/** Moves the picked emoji to the front; keeps only plausible short strings. */
export function pushRecentEmoji(list: readonly string[], emoji: string, max = MAX_RECENT_EMOJI): string[] {
  if (typeof emoji !== 'string' || !emoji || emoji.length > 32) return [...list];
  return [emoji, ...list.filter(e => e !== emoji && typeof e === 'string' && e.length <= 32)].slice(0, max);
}

export const DEFAULT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'] as const;
