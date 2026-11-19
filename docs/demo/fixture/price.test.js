const test = require('node:test');
const assert = require('node:assert');
const { total } = require('./price');
test('10% off over 100', () => assert.equal(total(300), 270));
