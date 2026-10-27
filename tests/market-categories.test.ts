import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_CATEGORIES, isMarketCategory, marketCategoryOf, matchesMarketItem } from '../lib/market-categories';

test('market category IDs are unique, stable and validated independently from labels', () => {
  assert.ok(MARKET_CATEGORIES.length >= 20);
  assert.equal(new Set(MARKET_CATEGORIES.map(c => c.id)).size, MARKET_CATEGORIES.length);
  assert.ok(MARKET_CATEGORIES.every(c => c.ru && c.label));
  assert.equal(isMarketCategory('computers'), true);
  assert.equal(isMarketCategory('Computers and laptops'), false);
  assert.equal(isMarketCategory('__proto__'), false);
});

test('market search combines query tokens across title, description, city and translated category', () => {
  const item = { name: 'MacBook Air', city: 'Kraków', desc: 'Почти новый, чехол в комплекте', category: 'computers' };
  assert.equal(matchesMarketItem(item, 'KRAKOW чехол ноутбуки', 'computers'), true);
  assert.equal(matchesMarketItem(item, 'чехол', 'shoes'), false);
  assert.equal(matchesMarketItem(item, 'неизвестное слово'), false);
  assert.equal(matchesMarketItem(item, '   '), true);
});

test('legacy listings remain searchable and known demo items have useful categories', () => {
  assert.equal(marketCategoryOf({ name: 'Sony mirrorless camera' }), 'cameras');
  assert.equal(marketCategoryOf({ name: 'New Balance sneakers' }), 'shoes');
  assert.equal(marketCategoryOf({ name: 'Vintage chair' }), 'furniture');
  assert.equal(marketCategoryOf({ name: 'Electric guitar' }), 'instruments');
  assert.equal(marketCategoryOf({ name: 'Old unknown item', category: 'obsolete' }), 'other');
  assert.equal(matchesMarketItem({ name: 'Ёлочная игрушка', city: 'Москва' }, 'елочная москва'), true);
  assert.equal(marketCategoryOf({ name: 'MacBook Air', category: 'art' }), 'art');
});
