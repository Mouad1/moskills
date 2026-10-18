const test = require('node:test');
const assert = require('node:assert/strict');
const { discountedPrice, quote } = require('./price.cjs');
test('20% off 1000 cents leaves 800 cents', () => {
  assert.equal(discountedPrice(1000, 20), 800);
});

test('discountedPrice contract: boundaries, fractions, and rounding', () => {
  assert.equal(discountedPrice(1000, 0), 1000);
  assert.equal(discountedPrice(1000, 100), 0);
  assert.equal(discountedPrice(0, 50), 0);
  assert.equal(discountedPrice(1000, 12.5), 875);
  assert.equal(discountedPrice(1000, 33.33), 667);
});

test('discountedPrice contract: invalid cents throws RangeError', () => {
  assert.throws(() => discountedPrice(-1, 20), RangeError);
  assert.throws(() => discountedPrice(10.5, 20), RangeError);
  assert.throws(() => discountedPrice(Number.MAX_SAFE_INTEGER + 1, 20), RangeError);
  assert.throws(() => discountedPrice('1000', 20), RangeError);
  assert.throws(() => discountedPrice(NaN, 20), RangeError);
  assert.throws(() => discountedPrice(Infinity, 20), RangeError);
  assert.throws(() => discountedPrice(null, 20), RangeError);
});

test('discountedPrice contract: invalid percent throws RangeError', () => {
  assert.throws(() => discountedPrice(1000, -0.1), RangeError);
  assert.throws(() => discountedPrice(1000, 100.1), RangeError);
  assert.throws(() => discountedPrice(1000, NaN), RangeError);
  assert.throws(() => discountedPrice(1000, Infinity), RangeError);
  assert.throws(() => discountedPrice(1000, -Infinity), RangeError);
  assert.throws(() => discountedPrice(1000, '20'), RangeError);
  assert.throws(() => discountedPrice(1000, null), RangeError);
});

test('quote: two 500-cent items at 20% returns 800', () => {
  // Two 500-cent items (as two separate items or quantity 2)
  const basket1 = [
    { cents: 500, quantity: 1 },
    { cents: 500, quantity: 1 }
  ];
  assert.equal(quote(basket1, 20), 800);

  const basket2 = [
    { cents: 500, quantity: 2 }
  ];
  assert.equal(quote(basket2, 20), 800);
});

test('quote: empty basket returns 0', () => {
  assert.equal(quote([], 20), 0);
  assert.equal(quote([], 0), 0);
  assert.equal(quote([], 100), 0);
});

test('quote: invalid items or inputs throw RangeError', () => {
  assert.throws(() => quote(null, 20), RangeError);
  assert.throws(() => quote('not-an-array', 20), RangeError);
  assert.throws(() => quote([null], 20), RangeError);
  assert.throws(() => quote([{ cents: -1, quantity: 1 }], 20), RangeError);
  assert.throws(() => quote([{ cents: 100, quantity: -1 }], 20), RangeError);
  assert.throws(() => quote([{ cents: 100.5, quantity: 1 }], 20), RangeError);
  assert.throws(() => quote([{ cents: 100, quantity: 1.5 }], 20), RangeError);
  assert.throws(() => quote([{ cents: '100', quantity: 1 }], 20), RangeError);
  assert.throws(() => quote([{ cents: 100, quantity: '1' }], 20), RangeError);
  assert.throws(() => quote([], -5), RangeError);
});

test('quote: unsafe totals throw RangeError', () => {
  const hugeItems = [
    { cents: Number.MAX_SAFE_INTEGER, quantity: 1 },
    { cents: 1, quantity: 1 }
  ];
  assert.throws(() => quote(hugeItems, 0), RangeError);

  const hugeMultiplier = [
    { cents: Number.MAX_SAFE_INTEGER, quantity: 2 }
  ];
  assert.throws(() => quote(hugeMultiplier, 0), RangeError);
});

test('challenger review: non-array iterables, zero quantity, and basket discount bounds', () => {
  // Set iterable
  const setBasket = new Set([
    { cents: 300, quantity: 1 },
    { cents: 200, quantity: 2 } // 300 + 400 = 700
  ]);
  assert.equal(quote(setBasket, 10), 630); // 700 - 70 = 630

  // Generator iterable
  function* itemGen() {
    yield { cents: 250, quantity: 2, sku: 'item-1' }; // 500, extra prop ignored
    yield { cents: 1000, quantity: 0, sku: 'item-2' }; // 0
  }
  assert.equal(quote(itemGen(), 50), 250); // 500 - 250 = 250

  // Basket bounds: 0% and 100%
  const basket = [{ cents: 1000, quantity: 1 }];
  assert.equal(quote(basket, 0), 1000);
  assert.equal(quote(basket, 100), 0);
});



test('discountedPrice: exact rounding across valid safe-integer amounts', () => {
  const cases = [
    [9007199254740990, 100, 0],
    [9007199254740985, 100, 0],
    [9007199254740987, 20, 7205759403792790],
    [9007199254740981, 50, 4503599627370490],
    [7, 7.142857142857142, 7],
    [1, 50, 0],
    [3, 50, 1],
    [1000, 0.15, 998],
    [1000000000, 1e-7, 999999999],
    [Number.MAX_SAFE_INTEGER, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER]
  ];
  for (const [cents, percent, expected] of cases) {
    assert.equal(discountedPrice(cents, percent), expected, `${cents} at ${percent}%`);
  }
});

test('quote: large and near-half discounts inherit exact pricing', () => {
  const cases = [
    [9007199254740990, 100, 0],
    [9007199254740985, 100, 0],
    [9007199254740987, 20, 7205759403792790],
    [9007199254740981, 50, 4503599627370490],
    [7, 7.142857142857142, 7]
  ];
  for (const [cents, percent, expected] of cases) {
    assert.equal(quote([{ cents, quantity: 1 }], percent), expected);
  }
});

test('quote: malformed iterator protocols throw RangeError', () => {
  const invalid = [
    { [Symbol.iterator]: () => null },
    { [Symbol.iterator]: () => ({}) },
    { [Symbol.iterator]: () => ({ next: () => null }) },
    { [Symbol.iterator]: () => ({ next: () => 1 }) }
  ];
  for (const items of invalid) assert.throws(() => quote(items, 20), RangeError);
});

test('quote: preserves iterator cleanup and original iteration errors', () => {
  let closed = false;
  function* invalidItem() {
    try { yield { cents: -1, quantity: 1 }; }
    finally { closed = true; }
  }
  assert.throws(() => quote(invalidItem(), 20), RangeError);
  assert.equal(closed, true);
  const failure = new Error('iteration failed');
  function* failingItems() { throw failure; }
  assert.throws(() => quote(failingItems(), 20), error => error === failure);
});
