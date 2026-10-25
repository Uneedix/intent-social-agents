import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOffer, minOffer } from '../lib/offers';

test('offer floor is 50% rounded up to whole złoty', () => {
  assert.equal(minOffer(100), 50);
  assert.equal(minOffer(99), 50);
  assert.equal(minOffer(1), 1);
  assert.equal(minOffer(0), 0);
});

test('offers below the floor, at/above price, or malformed are rejected', () => {
  assert.deepEqual(checkOffer('49', 100), { ok: false, reason: 'too-low' });
  assert.deepEqual(checkOffer('50', 100), { ok: true, amount: 50 });
  assert.deepEqual(checkOffer('99', 100), { ok: true, amount: 99 });
  assert.deepEqual(checkOffer('100', 100), { ok: false, reason: 'not-lower' });
  for (const bad of ['', '12.5', '-5', 'abc', '1e3', '0']) assert.equal(checkOffer(bad, 100).ok, false, bad);
});
