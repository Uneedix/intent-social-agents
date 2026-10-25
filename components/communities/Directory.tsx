'use client';
import { ChevronDown, Info, Lock, MoreHorizontal, Plus, RefreshCw } from 'lucide-react';
import { Button, Menu } from '../ui';
import { useI18n } from '../I18n';
import { CATEGORY_LABEL, MAIN_CATEGORIES, MORE_CATEGORIES, formatCount, type CardItem } from './model';
import { ExampleBadge, Pic, Stack } from './parts';
import s from './communities.module.css';

export const joinLabel = (c: CardItem) => c.join === 'member' ? 'Joined' : c.join === 'pending' ? 'Requested' : c.privacy === 'private' ? 'Invite only' : c.privacy === 'request' ? 'Request' : 'Join';

type Props = {
  cards: CardItem[]; chip: string; onChip: (c: string) => void; onCreate: () => void; onOpen: (key: string) => void;
  onJoin: (key: string) => void; onHide: (key: string) => void; onReport: () => void; busyKey: string | null;
  loading: boolean; error: string; onRetry: () => void; notice?: string;
};

export default function Directory({ cards, chip, onChip, onCreate, onOpen, onJoin, onHide, onReport, busyKey, loading, error, onRetry, notice }: Props) {
  const { t, lang } = useI18n();
  const locale = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
  const moreActive = (MORE_CATEGORIES as readonly string[]).includes(chip);
  const chips: [string, string][] = [['foryou', 'For you'], ['mine', 'My communities'], ['trending', 'Trending'], ...MAIN_CATEGORIES.map(c => [c, CATEGORY_LABEL[c]] as [string, string])];
  const hasDemo = cards.some(c => c.demo);
  return <section className={s.directory} data-lang={lang}>
    <header className={s.head}>
      <div className={s.headText}><h1>{t('Communities')}</h1><p>{t('Join like-minded people, share your ideas and be part of conversations that matter.')}</p></div>
      <Button variant="primary" className={s.createBtn} onClick={onCreate}><Plus size={18} /> {t('Create community')}</Button>
    </header>
    <div className={s.chipBar}><div className={s.chips} role="tablist" aria-label={t('Categories')}>
      {chips.map(([k, l]) => <button key={k} role="tab" aria-selected={chip === k} className={chip === k ? s.chipOn : s.chip} onClick={() => onChip(k)}>{t(l)}</button>)}</div>
      <Menu align="right" trigger={(open, toggle) => <button className={moreActive ? s.chipOn : s.chip} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{moreActive ? t(CATEGORY_LABEL[chip]) : t('More')} <ChevronDown size={16} /></button>}
        items={MORE_CATEGORIES.map(c => ({ label: t(CATEGORY_LABEL[c]), onSelect: () => onChip(c) }))} />
    </div>
    {notice && <p className={s.notice} role="status"><Info size={16} /> {notice}</p>}
    {error && <p className={s.error} role="alert">{error} <Button size="sm" onClick={onRetry}><RefreshCw size={14} /> {t('Retry')}</Button></p>}
    {loading && !cards.length && <div className={s.grid} aria-busy="true">{[0, 1, 2].map(i => <div key={i} className={s.skeleton} />)}</div>}
    <div className={s.grid}>
      {cards.map(c => <article key={c.key} className={s.card}>
        <button className={s.cardHit} onClick={() => onOpen(c.key)} aria-label={t('Open {name}', { name: c.name })} />
        <Pic src={c.cover} className={s.cover} initial={false} seed={c.name} />{c.demo && <span className={s.coverBadge}><ExampleBadge label={t('Example')} /></span>}
        <div className={s.cardMenu}><Menu trigger={(open, toggle) => <button className={s.dots} aria-label={t('More options')} aria-expanded={open} onClick={toggle}><MoreHorizontal size={18} /></button>}
          items={[{ label: t('Open community'), onSelect: () => onOpen(c.key) }, { label: t('Hide from this list'), onSelect: () => onHide(c.key) }, 'sep', { label: t('Report'), onSelect: onReport, danger: true }]} /></div>
        <div className={s.cardBody}>
          <div className={s.idRow}><Pic src={c.icon} className={s.icon} seed={c.name} />
            <div className={s.idText}><strong title={c.name}>{c.name}</strong>
              <small>{c.members != null ? t('{n} members', { n: formatCount(c.members, locale) }) : t(c.privacy === 'private' ? 'Private' : c.privacy === 'request' ? 'Approval required' : 'Open')}</small></div></div>
          <p className={s.desc}>{c.description || t('No description yet.')}</p>
          <div className={s.tags}>{c.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}{!c.tags.length && <span>{t(CATEGORY_LABEL[c.category] || 'Other')}</span>}</div>
          <div className={s.cardFoot}>
            <Button size="sm" variant={c.join === 'none' ? 'primary' : 'outline'} className={s.joinBtn} disabled={busyKey === c.key || (c.join === 'none' && c.privacy === 'private')} onClick={() => onJoin(c.key)}>
              {c.privacy === 'private' && c.join === 'none' && <Lock size={13} />}{t(joinLabel(c))}</Button>
            {c.avatars.length > 0 && <Stack faces={c.avatars.map(a => ({ src: a, name: '' }))} extra={c.members != null && c.members > c.avatars.length ? '+' + formatCount(c.members - c.avatars.length, locale) : undefined} />}
          </div>
        </div>
      </article>)}
    </div>
    {!loading && !cards.length && <div className={s.empty}><p>{t(chip === 'mine' ? 'You do not own any communities yet.' : 'No communities in this category yet.')}</p><Button variant="primary" onClick={onCreate}><Plus size={16} /> {t('Create the first one')}</Button></div>}
    {hasDemo && <p className={s.footnote}><Info size={14} /> {t('Communities marked “Example” are illustrative: their members, counts and posts are invented and nothing you do there is saved.')}</p>}
  </section>;
}
