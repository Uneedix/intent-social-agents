'use client';
import { Search, X } from 'lucide-react';
import { useI18n } from './I18n';
import { MARKET_CATEGORIES, type MarketCategoryId } from '../lib/market-categories';
import s from './MarketFilters.module.css';

export function MarketCategorySelect({ value, onChange, includeAll = false }: { value: MarketCategoryId | 'all'; onChange: (value: MarketCategoryId | 'all') => void; includeAll?: boolean }) {
  const { lang, t } = useI18n();
  const ru = lang === 'Русский';
  return <label className={s.category}><span>{ru ? 'Категория товара' : t('Item category')}</span>
    <select value={value} onChange={e => onChange(e.target.value as MarketCategoryId | 'all')}>
      {includeAll && <option value="all">{ru ? 'Все категории' : t('All categories')}</option>}
      {MARKET_CATEGORIES.map(c => <option key={c.id} value={c.id}>{ru ? c.ru : t(c.label)}</option>)}
    </select>
  </label>;
}

export function MarketFilters({ query, category, onQuery, onCategory, count }: { query: string; category: MarketCategoryId | 'all'; onQuery: (value: string) => void; onCategory: (value: MarketCategoryId | 'all') => void; count: number }) {
  const { lang, t } = useI18n();
  const ru = lang === 'Русский';
  const label = ru ? 'Поиск товаров' : t('Search items');
  return <section className={s.filters} aria-label={ru ? 'Поиск и категории маркета' : t('Marketplace search and categories')}>
    <div className={s.row}><label className={s.search}><Search size={20} aria-hidden="true" />
      <input type="search" aria-label={label} placeholder={ru ? 'Название, описание или город' : t('Name, description or city')} value={query} onChange={e => onQuery(e.target.value)} />
      {query && <button type="button" onClick={() => onQuery('')} aria-label={ru ? 'Очистить поиск' : t('Clear search')}><X size={16} /></button>}
    </label><MarketCategorySelect value={category} onChange={onCategory} includeAll /></div>
    <p className={s.count} role="status">{ru ? `Найдено товаров: ${count}` : t('Items found: {n}', { n: count })}</p>
    {count === 0 && <p className={s.empty}>{ru ? 'Товары не найдены. Попробуйте другой запрос или категорию.' : t('No items found. Try another search or category.')}</p>}
  </section>;
}
