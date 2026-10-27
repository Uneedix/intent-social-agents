'use client';
import { ArrowRight, MoreHorizontal, Users } from 'lucide-react';
import { Button, Menu } from '../ui';
import { useT } from '../I18n';
import { formatCount, type CardItem } from './model';
import { joinLabel } from './Directory';
import { ExampleBadge, Pic } from './parts';
import { useRailState } from './store';
import s from './communities.module.css';

function Row({ c, onOpen, onJoin, busy }: { c: CardItem; onOpen: () => void; onJoin: () => void; busy: boolean }) {
  const t = useT();
  const locale = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
  return <div className={s.railRow}>
    <button className={s.railHit} onClick={onOpen} aria-label={t('Open {name}', { name: c.name })}><Pic src={c.icon || c.cover} className={s.thumb} seed={c.name} />
      <span className={s.railText}><strong>{c.name}</strong><small>{c.members != null ? <><Users size={12} /> {formatCount(c.members, locale)}</> : t('Your community')}</small></span></button>
    <Button size="sm" variant={c.join === 'none' ? 'outline' : 'ghost'} className={s.railJoin} disabled={busy || (c.join === 'none' && c.privacy === 'private')} onClick={onJoin}>{t(joinLabel(c))}</Button>
    <Menu trigger={(open, toggle) => <button className={s.dots} aria-label={t('More options')} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} /></button>}
      items={[{ label: t('Open community'), onSelect: onOpen }]} />
  </div>;
}

/** Right rail for the Communities section: popular, suggested and a promo card. */
export default function CommunitiesRail() {
  const t = useT();
  const { items, open, join, discover, busyKey } = useRailState();
  const discoverable = items.filter(c => !c.owned);
  const popular = [...discoverable].sort((a, b) => (b.members ?? -1) - (a.members ?? -1)).slice(0, 5);
  const shown = new Set(popular.map(c => c.key));
  const suggested = discoverable.filter(c => !shown.has(c.key) && c.join === 'none').slice(0, 5);
  return <div className={s.rail}>
    {popular.length > 0 && <section className={s.railCard}><div className={s.railHead}><strong>{t('Popular communities')}</strong>{popular.some(c => c.demo) && <ExampleBadge label={t('Example')} />}</div>
      {popular.map(c => <Row key={c.key} c={c} busy={busyKey === c.key} onOpen={() => open(c.key)} onJoin={() => join(c.key)} />)}</section>}
    {suggested.length > 0 && <section className={s.railCard}><div className={s.railHead}><strong>{t('Suggested for you')}</strong>{suggested.some(c => c.demo) && <ExampleBadge label={t('Example')} />}</div>
      {suggested.map(c => <Row key={c.key} c={c} busy={busyKey === c.key} onOpen={() => open(c.key)} onJoin={() => join(c.key)} />)}</section>}
    <section className={s.promo}><span className={s.globe} aria-hidden="true" /><strong>{t('Find communities that inspire you.')}</strong>
      <button className={s.promoBtn} onClick={discover} aria-label={t('Discover communities')}><ArrowRight size={18} /></button></section>
  </div>;
}
