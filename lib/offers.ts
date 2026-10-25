// Price offers ("торг") on Market listings. Prices are whole złoty integers — no floats.
// NOTE: the Market is a local demo; this rule is enforced in the browser only. When listings move to
// the database, the same floor must be enforced server-side (e.g. a CHECK / RPC), not just here.
export const OFFER_FLOOR_PERCENT = 50;

/** Lowest allowed offer: 50% of the price, rounded up to a whole złoty. */
export function minOffer(price: number): number {
  if (!Number.isSafeInteger(price) || price <= 0) return 0;
  return Math.ceil((price * OFFER_FLOOR_PERCENT) / 100);
}

export type OfferCheck = { ok: true; amount: number } | { ok: false; reason: 'invalid' | 'too-low' | 'not-lower' };

/** Validates a typed offer. It must be a whole number, at least the floor and below the asking price. */
export function checkOffer(input: string, price: number): OfferCheck {
  const s = input.trim();
  if (!/^\d{1,9}$/.test(s)) return { ok: false, reason: 'invalid' };
  const amount = Number(s);
  if (amount <= 0) return { ok: false, reason: 'invalid' };
  if (amount < minOffer(price)) return { ok: false, reason: 'too-low' };
  if (amount >= price) return { ok: false, reason: 'not-lower' };
  return { ok: true, amount };
}
