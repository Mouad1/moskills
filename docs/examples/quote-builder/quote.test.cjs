const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMoney, buildQuote } = require('./quote.cjs');
const input = (overrides = {}) => ({ business: 'North Studio', client: 'Avery', discount: '10', items: [
  { service: 'Photography', unitPrice: '200', quantity: '1' },
  { service: 'Editing', unitPrice: '100', quantity: '1' }
], ...overrides });

test('€200 plus €100 with 10% discount returns €270; discount applied once', () => {
  const result = buildQuote(input());
  assert.equal(result.subtotalCents, 30000);
  assert.equal(result.discountCents, 3000);
  assert.equal(result.totalCents, 27000);
});
test('quantity 2 times €50 returns €100', () => {
  const result = buildQuote(input({ discount: '0', items: [{ service: 'Session', unitPrice: '50', quantity: '2' }] }));
  assert.equal(result.items[0].totalCents, 10000);
  assert.equal(result.totalCents, 10000);
});
test('money parses decimals exactly without floating conversion', () => {
  assert.equal(parseMoney('0.29'), 29);
  assert.equal(parseMoney('12.3'), 1230);
  assert.equal(parseMoney('90071992547409.91'), Number.MAX_SAFE_INTEGER);
});
test('blank, negative, exponent, comma, malformed and overprecision money rejected', () => {
  for (const value of ['', ' ', '-1', '1e2', '1,20', '€12', '1.001', '.50', '1.', null, 12]) {
    assert.throws(() => parseMoney(value), RangeError, String(value));
  }
});
test('empty item collection and missing names rejected', () => {
  assert.throws(() => buildQuote(input({ items: [] })), /at least one service/);
  for (const overrides of [{ business: '' }, { client: '  ' }, { items: [{ service: '', unitPrice: '1', quantity: '1' }] }]) {
    assert.throws(() => buildQuote(input(overrides)), /required/);
  }
});
test('quantity requires nonnegative safe integer; zero allowed', () => {
  for (const quantity of ['', '-1', '1.5', '1e2', '9007199254740992', null]) {
    assert.throws(() => buildQuote(input({ items: [{ service: 'Session', unitPrice: '1', quantity }] })), /quantity/);
  }
  assert.equal(buildQuote(input({ items: [{ service: 'Session', unitPrice: '50', quantity: '0' }] })).totalCents, 0);
});
test('discount range inclusive with fractional rates and half-up discount rounding', () => {
  const tiny = { items: [{ service: 'Tiny', unitPrice: '0.01', quantity: '1' }] };
  assert.equal(buildQuote(input({ ...tiny, discount: '50' })).totalCents, 0);
  assert.equal(buildQuote(input({ discount: '100' })).totalCents, 0);
  assert.equal(buildQuote(input({ discount: '12.5' })).totalCents, 26250);
  for (const discount of ['', '-1', '100.01', 'NaN', 'Infinity', '1e2', null]) {
    assert.throws(() => buildQuote(input({ discount })), /discount/);
  }
});
test('unsafe money, line multiplication and subtotal rejected before discount', () => {
  assert.throws(() => parseMoney('90071992547409.92'), /safe/);
  assert.throws(() => buildQuote(input({ discount: '100', items: [{ service: 'Huge', unitPrice: '90071992547409.91', quantity: '2' }] })), /safe/);
  assert.throws(() => buildQuote(input({ items: [
    { service: 'Huge', unitPrice: '90071992547409.91', quantity: '1' },
    { service: 'Extra', unitPrice: '0.01', quantity: '1' }
  ] })), /safe/);
});
test('output trims names, preserves service text and gives canonical item cents', () => {
  const result = buildQuote(input({ business: '  North Studio ', items: [{ service: '<Photography>', unitPrice: '0.29', quantity: '3' }] }));
  assert.equal(result.business, 'North Studio');
  assert.equal(result.items[0].service, '<Photography>');
  assert.equal(result.items[0].unitPriceCents, 29);
  assert.equal(result.items[0].totalCents, 87);
});
test('malformed body and excessive collection rejected', () => {
  for (const body of [null, [], {}, input({ items: {} }), input({ items: Array(101).fill({ service: 'X', unitPrice: '1', quantity: '1' }) })]) {
    assert.throws(() => buildQuote(body), RangeError);
  }
});
