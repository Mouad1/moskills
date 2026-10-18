function discountedPrice(cents, percent) {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('cents must be a nonnegative safe integer');
  }
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError('percent must be finite and between 0 and 100');
  }
  // Treat the rate's shortest decimal representation as exact. Round the
  // discount half up, then subtract, without floating-point intermediates.
  const [mantissa, exponent = '0'] = percent.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let numerator = BigInt(whole + fraction);
  const scale = Number(exponent) - fraction.length;
  let denominator = 100n;
  if (scale >= 0) numerator *= 10n ** BigInt(scale);
  else denominator *= 10n ** BigInt(-scale);

  const amount = BigInt(cents);
  const discount = (amount * numerator + denominator / 2n) / denominator;
  return Number(amount - discount);
}
function quote(items, percent) {
  const getIterator = items == null ? undefined : items[Symbol.iterator];
  if (typeof getIterator !== 'function') {
    throw new RangeError('items must be an iterable collection');
  }
  const iterator = getIterator.call(items);
  if (iterator == null || (typeof iterator !== 'object' && typeof iterator !== 'function')) {
    throw new RangeError('items must provide an iterator object');
  }
  const next = iterator.next;
  if (typeof next !== 'function') {
    throw new RangeError('items iterator must provide next()');
  }
  // Validate protocol results without hiding errors thrown by user iterators.
  // Forward return() so for-of still closes generators on invalid basket items.
  const checkedItems = {
    [Symbol.iterator]() {
      return {
        next() {
          const step = next.call(iterator);
          if (step == null || (typeof step !== 'object' && typeof step !== 'function')) {
            throw new RangeError('items iterator must return an object');
          }
          return step;
        },
        get return() {
          const close = iterator.return;
          return typeof close === 'function' ? close.bind(iterator) : close;
        }
      };
    }
  };

  let totalCents = 0;
  for (const item of checkedItems) {
    if (!item || typeof item !== 'object') {
      throw new RangeError('each item must be an object');
    }
    const { cents, quantity } = item;
    if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) {
      throw new RangeError('item cents must be a nonnegative safe integer');
    }
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0) {
      throw new RangeError('item quantity must be a nonnegative safe integer');
    }

    const lineTotal = cents * quantity;
    if (!Number.isSafeInteger(lineTotal)) {
      throw new RangeError('line total exceeds safe integer limits');
    }

    totalCents += lineTotal;
    if (!Number.isSafeInteger(totalCents)) {
      throw new RangeError('total amount exceeds safe integer limits');
    }
  }

  return discountedPrice(totalCents, percent);
}

module.exports = { discountedPrice, quote };
