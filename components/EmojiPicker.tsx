'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Car, Clock, Coffee, Flag, Heart, Lightbulb, PawPrint, Plus, Search, Smile, Trophy, X, type LucideIcon } from 'lucide-react';
import { useT } from './I18n';
import { useStored } from '../lib/social';
import {
  DEFAULT_QUICK_REACTIONS, EMOJI_CATEGORIES, EMOJI_CATEGORY_LABELS, SKIN_TONE_SAMPLES, isSkinTone, loadEmojiCatalog,
  pushRecentEmoji, searchEmoji, withTone, type EmojiCatalog, type EmojiCategory, type SkinTone,
} from '../lib/emoji';
import s from './EmojiPicker.module.css';

type Section = EmojiCategory | 'recent';
const ICONS: Record<Section, LucideIcon> = {
  recent: Clock, people: Smile, nature: PawPrint, food: Coffee, activity: Trophy,
  travel: Car, objects: Lightbulb, symbols: Heart, flags: Flag,
};
export const RECENT_EMOJI_KEY = 'emoji-recent';
export const SKIN_TONE_KEY = 'emoji-skin-tone';

export type EmojiPickerProps = {
  onPick: (emoji: string) => void;
  onClose?: () => void;
  /** 'auto' = popover on desktop, bottom sheet under 560px. */
  variant?: 'auto' | 'popover' | 'sheet' | 'inline';
  autoFocus?: boolean;
  /** Keep the panel open after a pick (composer). Default true; reactions usually pass false. */
  keepOpen?: boolean;
  className?: string;
};

/** Telegram-like emoji panel. All ~1,900 Unicode emoji are lazy-loaded on first open. */
export function EmojiPicker({ onPick, onClose, variant = 'auto', autoFocus = true, keepOpen = true, className }: EmojiPickerProps) {
  const t = useT();
  const [catalog, setCatalog] = useState<EmojiCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [recentRaw, setRecent] = useStored<string[]>(RECENT_EMOJI_KEY, []);
  const [toneRaw, setTone] = useStored<number>(SKIN_TONE_KEY, 0);
  const tone: SkinTone = isSkinTone(toneRaw) ? toneRaw : 0;
  const recent = useMemo(() => recentRaw.filter(e => typeof e === 'string' && e.length <= 32).slice(0, 32), [recentRaw]);
  const [toneOpen, setToneOpen] = useState(false);
  const [active, setActive] = useState<Section>('people');
  const [rendered, setRendered] = useState(2); // chunked: first categories now, the rest after paint
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Partial<Record<Section, HTMLElement | null>>>({});
  const pendingJump = useRef<Section | null>(null);
  const [jumpTick, setJumpTick] = useState(0);

  const load = useCallback(() => {
    setFailed(false);
    let alive = true;
    loadEmojiCatalog().then(c => { if (alive) setCatalog(c); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (autoFocus) searchRef.current?.focus({ preventScroll: true }); }, [autoFocus]);
  useEffect(() => {
    if (!catalog || rendered >= EMOJI_CATEGORIES.length) return;
    const id = window.setTimeout(() => setRendered(n => n + 3), 60);
    return () => window.clearTimeout(id);
  }, [catalog, rendered]);
  useEffect(() => { if (recent.length) setActive(a => (a === 'people' ? 'recent' : a)); }, [recent.length]);

  const results = useMemo(() => (catalog && query.trim() ? searchEmoji(catalog, query) : null), [catalog, query]);
  const sections: Section[] = useMemo(() => [...(recent.length ? ['recent' as const] : []), ...EMOJI_CATEGORIES], [recent.length]);

  const pick = (emoji: string) => {
    setRecent(list => pushRecentEmoji(Array.isArray(list) ? list : [], emoji));
    onPick(emoji);
    if (!keepOpen) onClose?.();
  };

  const jump = (sec: Section) => {
    setQuery('');
    setActive(sec);
    setRendered(EMOJI_CATEGORIES.length);
    pendingJump.current = sec;
    setJumpTick(n => n + 1);
  };
  // Scroll after the target section (and everything above it) has been committed with real heights.
  useLayoutEffect(() => {
    const sec = pendingJump.current;
    const el = sec && sectionRefs.current[sec];
    if (!sec || !el || !scrollRef.current) return;
    pendingJump.current = null;
    scrollRef.current.scrollTop = el.offsetTop;
  }, [jumpTick, rendered, query]);

  const onScroll = () => {
    const box = scrollRef.current;
    if (!box || results) return;
    const top = box.scrollTop + 8;
    let current: Section = sections[0];
    for (const sec of sections) {
      const el = sectionRefs.current[sec];
      if (el && el.offsetTop <= top) current = sec;
    }
    setActive(current);
  };

  /** Roving arrow-key navigation across all rendered emoji buttons. */
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const idx = Number(target.dataset.idx);
    if (!Number.isInteger(idx)) return;
    const box = scrollRef.current!;
    const cell = target.getBoundingClientRect().width || 40;
    const cols = Math.max(1, Math.floor((box.clientWidth - 12) / cell));
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -idx, End: 1e6 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const buttons = box.querySelectorAll<HTMLButtonElement>('button[data-idx]');
    if (e.key === 'ArrowUp' && idx - cols < 0) { searchRef.current?.focus(); return; }
    const next = Math.min(buttons.length - 1, Math.max(0, idx + delta));
    buttons[next]?.focus();
    buttons[next]?.scrollIntoView({ block: 'nearest' });
  };

  const onRootKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (toneOpen) setToneOpen(false); else if (query) setQuery(''); else onClose?.();
    }
  };
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      scrollRef.current?.querySelector<HTMLButtonElement>('button[data-idx="0"]')?.focus();
    } else if (e.key === 'Enter' && results?.[0]) {
      e.preventDefault();
      pick(withTone(results[0], tone));
    }
  };

  let counter = 0;
  const cellFor = (emoji: string, label: string) => {
    const idx = counter++;
    return (
      <button key={`${idx}-${emoji}`} type="button" className={s.cell} data-idx={idx} tabIndex={idx === 0 ? 0 : -1}
        aria-label={label} title={label} onClick={() => pick(emoji)}>{emoji}</button>
    );
  };
  const nameOf = (emoji: string) => catalog?.lookup.get(emoji)?.name ?? emoji;

  return (
    <div className={[s.root, s[variant], className].filter(Boolean).join(' ')} role="dialog" aria-label={t('Emoji')} onKeyDown={onRootKey}>
      <div className={s.top}>
        <label className={s.search}>
          <Search size={15} aria-hidden />
          <span className={s.srOnly}>{t('Search emoji')}</span>
          <input ref={searchRef} type="search" value={query} maxLength={64} placeholder={t('Search emoji')} onChange={e => setQuery(e.target.value)}
            onKeyDown={onSearchKey} autoComplete="off" spellCheck={false} enterKeyHint="search" />
          {query && <button type="button" className={s.clear} aria-label={t('Clear search')} onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={14} /></button>}
        </label>
        <div className={s.toneWrap}>
          <button type="button" className={s.toneButton} aria-haspopup="true" aria-expanded={toneOpen} aria-label={t('Skin tone')}
            title={t('Skin tone')} onClick={() => setToneOpen(o => !o)}>{SKIN_TONE_SAMPLES[tone]}</button>
          {toneOpen && (
            <div className={s.tonePop} role="group" aria-label={t('Skin tone')}>
              {SKIN_TONE_SAMPLES.map((sample, i) => (
                <button key={sample} type="button" aria-pressed={tone === i} aria-label={i === 0 ? t('Default skin tone') : t('Skin tone {n}', { n: i })}
                  onClick={() => { setTone(i); setToneOpen(false); }}>{sample}</button>
              ))}
            </div>
          )}
        </div>
        {onClose && variant !== 'inline' && <button type="button" className={s.close} aria-label={t('Close')} onClick={onClose}><X size={16} /></button>}
      </div>

      <div ref={scrollRef} className={s.scroll} onScroll={onScroll} onKeyDown={onGridKey}>
        {failed ? (
          <div className={s.state}><p>{t("Couldn't load emoji.")}</p><button type="button" onClick={load}>{t('Try again')}</button></div>
        ) : !catalog ? (
          <div className={s.state} aria-live="polite">{t('Loading emoji…')}</div>
        ) : results ? (
          <section aria-label={t('Search results')}>
            <h3 className={s.heading}>{t('Search results')}</h3>
            {results.length
              ? <div className={s.grid} role="group">{results.map(e => cellFor(withTone(e, tone), e.name))}</div>
              : <p className={s.state}>{t('No emoji found')}</p>}
          </section>
        ) : sections.map(sec => {
          const catIdx = EMOJI_CATEGORIES.indexOf(sec as EmojiCategory);
          if (catIdx >= rendered) return <section key={sec} ref={el => { sectionRefs.current[sec] = el; }} className={s.placeholder} aria-hidden />;
          return (
            <section key={sec} ref={el => { sectionRefs.current[sec] = el; }} className={s.section} aria-label={t(EMOJI_CATEGORY_LABELS[sec])}>
              <h3 className={s.heading}>{t(EMOJI_CATEGORY_LABELS[sec])}</h3>
              <div className={s.grid} role="group">
                {sec === 'recent'
                  ? recent.map(e => cellFor(e, nameOf(e)))
                  : catalog.byCategory[sec].map(e => cellFor(withTone(e, tone), e.name))}
              </div>
            </section>
          );
        })}
      </div>

      <nav className={s.tabs} aria-label={t('Emoji categories')}>
        {sections.map(sec => {
          const Icon = ICONS[sec];
          return (
            <button key={sec} type="button" className={s.tab} aria-label={t(EMOJI_CATEGORY_LABELS[sec])} title={t(EMOJI_CATEGORY_LABELS[sec])}
              aria-current={!results && active === sec ? 'true' : undefined} onClick={() => jump(sec)}><Icon size={18} aria-hidden /></button>
          );
        })}
      </nav>
    </div>
  );
}

export type QuickReactionsProps = {
  onPick: (emoji: string) => void;
  reactions?: readonly string[];
  /** Emoji the current user already reacted with (shown pressed). */
  selected?: readonly string[];
  className?: string;
};

/** Compact reaction bar for messages; "+" opens the full picker as a popover/bottom sheet. */
export function QuickReactions({ onPick, reactions = DEFAULT_QUICK_REACTIONS, selected = [], className }: QuickReactionsProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={[s.quick, className].filter(Boolean).join(' ')} role="group" aria-label={t('Reactions')}>
      {reactions.map(r => (
        <button key={r} type="button" aria-pressed={selected.includes(r)} aria-label={t('React with {emoji}', { emoji: r })} onClick={() => onPick(r)}>{r}</button>
      ))}
      <button type="button" className={s.more} aria-label={t('More reactions')} aria-expanded={open} onClick={() => setOpen(o => !o)}><Plus size={16} /></button>
      {open && (
        <div className={s.quickPop}>
          <EmojiPicker keepOpen={false} onPick={e => { onPick(e); setOpen(false); }} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
