'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { BadgeCheck, MoreHorizontal, MoreVertical } from 'lucide-react';
import { useStored } from '../../lib/social';
import s from './explore.module.css';

/**
 * Explore-only local state (account-scoped via useStored). Call once in the page shell
 * and pass to both <ExplorePage> and <ExploreRail> so they stay in sync.
 */
export function useExploreState() {
  const [notInterested, setNotInterested] = useStored<string[]>('explore-not-interested', []);
  const [hiddenTopics, setHiddenTopics] = useStored<string[]>('explore-hidden-topics', []);
  const [hiddenPeople, setHiddenPeople] = useStored<string[]>('explore-hidden-people', []);
  const [likedDemo, setLikedDemo] = useStored<string[]>('explore-demo-liked', []);
  const [savedDemo, setSavedDemo] = useStored<string[]>('explore-demo-saved', []);
  return { notInterested, setNotInterested, hiddenTopics, setHiddenTopics, hiddenPeople, setHiddenPeople, likedDemo, setLikedDemo, savedDemo, setSavedDemo };
}
export type ExploreState = ReturnType<typeof useExploreState>;

export type MenuItem = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean };

/** Small accessible popover menu (Escape / outside click closes). */
export function ExMenu({ label, items, vertical, className }: { label: string; items: MenuItem[]; vertical?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const id = setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', k);
    return () => { clearTimeout(id); window.removeEventListener('click', close); window.removeEventListener('keydown', k); };
  }, [open]);
  return <div className={s.menu + (className ? ' ' + className : '')}>
    <button type="button" className={s.ibtn} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={e => { e.stopPropagation(); setOpen(!open); }}>
      {vertical ? <MoreVertical size={20} /> : <MoreHorizontal size={20} />}
    </button>
    {open && <div className={s.pop} role="menu" onClick={e => e.stopPropagation()}>{items.map(it =>
      <button type="button" role="menuitem" key={it.label} className={it.danger ? s.danger : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.icon}{it.label}</button>)}</div>}
  </div>;
}

export const Verified = ({ size = 16 }: { size?: number }) => <BadgeCheck className={s.vf} size={size} fill="#fff" color="#000" aria-label="Verified" />;

export const compactNum = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Relative time label, translated through `t`. */
export function agoLabel(t: (s: string, v?: Record<string, string | number>) => string, at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 1) return t('just now');
  if (m < 60) return t('{n}m ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('{n}h ago', { n: h });
  return t('{n}d ago', { n: Math.round(h / 24) });
}
