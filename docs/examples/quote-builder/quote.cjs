const { quote } = require('./price.cjs');
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
function parseMoney(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new RangeError('unit price must be euros with up to two decimal places (for example 50.00)');
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX) throw new RangeError('unit price exceeds safe integer limits');
  return Number(cents);
}
function name(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError(`${field} is required`);
  if (value.trim().length > 120) throw new RangeError(`${field} must be 120 characters or fewer`);
  return value.trim();
}
function buildQuote(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RangeError('quote must be an object');
  const business = name(body.business, 'business name');
  const client = name(body.client, 'client name');
  if (!Array.isArray(body.items) || !body.items.length) throw new RangeError('add at least one service');
  if (body.items.length > 100) throw new RangeError('use 100 services or fewer');
  if (typeof body.discount !== 'string' || body.discount.length > 32 || !/^\d+(?:\.\d+)?$/.test(body.discount)) {
    throw new RangeError('discount must be a percentage from 0 to 100');
  }
  const discountPercent = Number(body.discount);
  if (!Number.isFinite(discountPercent) || discountPercent > 100) throw new RangeError('discount must be a percentage from 0 to 100');
  const items = body.items.map((item, index) => {
    const field = `service ${index + 1}`;
    if (!item || typeof item !== 'object') throw new RangeError(`${field} is required`);
    const service = name(item.service, `${field} name`);
    const unitPriceCents = parseMoney(item.unitPrice);
    if (typeof item.quantity !== 'string' || item.quantity.length > 16 || !/^\d+$/.test(item.quantity)) {
      throw new RangeError(`${field} quantity must be a nonnegative whole number`);
    }
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity)) throw new RangeError(`${field} quantity exceeds safe integer limits`);
    return { service, unitPriceCents, quantity, totalCents: unitPriceCents * quantity };
  });
  const basket = items.map(item => ({ cents: item.unitPriceCents, quantity: item.quantity }));
  const subtotalCents = quote(basket, 0);
  const totalCents = quote(basket, discountPercent);
  return { business, client, currency: 'EUR', items, subtotalCents, discountPercent, discountCents: subtotalCents - totalCents, totalCents };
}
module.exports = { parseMoney, buildQuote };
