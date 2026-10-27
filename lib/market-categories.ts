/** Stable IDs are persisted in local listings; labels can change independently. */
export const MARKET_CATEGORIES = [
  { id: 'electronics', label: 'Electronics', ru: 'Электроника', terms: 'гаджеты техника устройства electronics gadgets' },
  { id: 'computers', label: 'Computers and laptops', ru: 'Компьютеры и ноутбуки', terms: 'ноутбук компьютер macbook laptop pc' },
  { id: 'phones', label: 'Phones and tablets', ru: 'Телефоны и планшеты', terms: 'смартфон телефон планшет iphone android tablet' },
  { id: 'cameras', label: 'Cameras and photography', ru: 'Фотоаппараты и фототехника', terms: 'камера фотоаппарат объектив camera lens photography' },
  { id: 'audio', label: 'Audio equipment', ru: 'Аудиотехника', terms: 'наушники колонки усилитель headphones speakers audio' },
  { id: 'instruments', label: 'Musical instruments', ru: 'Музыкальные инструменты', terms: 'гитара пианино синтезатор guitar piano music' },
  { id: 'clothing', label: 'Clothing', ru: 'Одежда', terms: 'куртка платье брюки shirt dress clothing' },
  { id: 'shoes', label: 'Shoes', ru: 'Обувь', terms: 'кроссовки ботинки туфли sneakers boots shoes' },
  { id: 'accessories', label: 'Accessories and bags', ru: 'Аксессуары и сумки', terms: 'сумка рюкзак ремень bag backpack accessories' },
  { id: 'jewellery', label: 'Jewellery and watches', ru: 'Украшения и часы', terms: 'часы кольцо браслет watch ring jewellery' },
  { id: 'furniture', label: 'Furniture', ru: 'Мебель', terms: 'стол стул диван chair desk sofa furniture' },
  { id: 'home', label: 'Home and decor', ru: 'Дом и декор', terms: 'дом декор лампа посуда decor home kitchen' },
  { id: 'appliances', label: 'Household appliances', ru: 'Бытовая техника', terms: 'холодильник стиральная пылесос бытовая appliance vacuum' },
  { id: 'garden', label: 'Garden and plants', ru: 'Сад и растения', terms: 'сад растения цветы garden plants' },
  { id: 'tools', label: 'Tools and renovation', ru: 'Инструменты и ремонт', terms: 'дрель инструмент ремонт tools renovation drill' },
  { id: 'sports', label: 'Sports and fitness', ru: 'Спорт и фитнес', terms: 'спорт фитнес тренажер sport fitness' },
  { id: 'outdoors', label: 'Tourism and outdoor gear', ru: 'Туризм и отдых', terms: 'палатка поход туризм camping tent outdoor' },
  { id: 'bicycles', label: 'Bicycles and scooters', ru: 'Велосипеды и самокаты', terms: 'велосипед самокат bicycle bike scooter' },
  { id: 'vehicles', label: 'Vehicles and parts', ru: 'Транспорт и запчасти', terms: 'авто машина запчасти car vehicle parts' },
  { id: 'books', label: 'Books and stationery', ru: 'Книги и канцелярия', terms: 'книга учебник канцелярия book stationery' },
  { id: 'games', label: 'Games and consoles', ru: 'Игры и приставки', terms: 'игры приставка консоль playstation xbox console gaming' },
  { id: 'toys', label: 'Toys and children', ru: 'Детские товары и игрушки', terms: 'детские игрушка коляска toy baby children' },
  { id: 'beauty', label: 'Beauty and care', ru: 'Красота и уход', terms: 'красота уход косметика beauty care' },
  { id: 'pets', label: 'Pet supplies', ru: 'Товары для животных', terms: 'животные питомцы корм pet supplies' },
  { id: 'art', label: 'Art and handmade', ru: 'Искусство и ручная работа', terms: 'искусство картина рукоделие art handmade' },
  { id: 'collectibles', label: 'Collectibles and antiques', ru: 'Коллекции и антиквариат', terms: 'коллекция антиквариат монета collectible antique' },
  { id: 'office', label: 'Office and business', ru: 'Офис и бизнес', terms: 'офис бизнес оборудование office business' },
  { id: 'other', label: 'Other goods', ru: 'Другие товары', terms: 'другое прочее other' },
] as const;
export type MarketCategoryId = typeof MARKET_CATEGORIES[number]['id'];
export type MarketItem = { name: string; city: string; desc?: string; category?: string };
export function isMarketCategory(value: unknown): value is MarketCategoryId {
  return typeof value === 'string' && MARKET_CATEGORIES.some(c => c.id === value);
}
export function normalizeMarketText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/ё/g, 'е').trim();
}
/** Old demo listings predate categories. Keep them visible and classify known item names. */
export function marketCategoryOf(item: Pick<MarketItem, 'name' | 'category'>): MarketCategoryId {
  if (isMarketCategory(item.category)) return item.category;
  const n = normalizeMarketText(item.name);
  const rules: [MarketCategoryId, RegExp][] = [
    ['computers', /macbook|laptop|ноутбук|компьютер/], ['phones', /iphone|tablet|смартфон|планшет/],
    ['cameras', /camera|mirrorless|фотоаппарат|объектив/], ['audio', /headphone|speaker|наушник|колонк/],
    ['instruments', /guitar|piano|гитар|пианино/], ['shoes', /sneaker|shoe|кроссов|ботин/],
    ['furniture', /chair|sofa|desk|стул|диван|стол/],
  ];
  return rules.find(([, pattern]) => pattern.test(n))?.[0] || 'other';
}
export function matchesMarketItem(item: MarketItem, query: string, category: MarketCategoryId | 'all' = 'all'): boolean {
  const id = marketCategoryOf(item);
  if (category !== 'all' && id !== category) return false;
  const c = MARKET_CATEGORIES.find(c => c.id === id)!;
  const searchable = normalizeMarketText([item.name, item.city, item.desc || '', c.label, c.ru, c.terms].join(' '));
  return normalizeMarketText(query).split(/\s+/).filter(Boolean).every(term => searchable.includes(term));
}
