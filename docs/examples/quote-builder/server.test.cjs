const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { handler } = require('./server.cjs');
async function request(method, url, body = '', headers = {}) {
  const req = Readable.from(Array.isArray(body) ? body : [Buffer.from(body)]);
  Object.assign(req, { method, url, headers });
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  await handler(req, res);
  return res;
}
test('only explicit public assets served; source, logs and traversal denied', async () => {
  for (const path of ['/', '/app.js', '/style.css']) assert.equal((await request('GET', path)).status, 200);
  for (const path of ['/price.cjs', '/red.log', '/.private/design.md', '/../price.cjs', '/%2e%2e/price.cjs']) {
    assert.equal((await request('GET', path)).status, 404);
  }
});
test('quote endpoint returns canonical integer cents', async () => {
  const result = await request('POST', '/api/quote', JSON.stringify({ business: 'Studio', client: 'Avery', discount: '10', items: [
    { service: 'Photography', unitPrice: '200', quantity: '1' }, { service: 'Editing', unitPrice: '100', quantity: '1' }
  ] }), { 'content-type': 'application/json' });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).totalCents, 27000);
});
test('bad JSON, invalid fields and wrong content type have explicit errors', async () => {
  assert.equal((await request('POST', '/api/quote', '{', { 'content-type': 'application/json' })).status, 400);
  const bad = await request('POST', '/api/quote', '{}', { 'content-type': 'application/json' });
  assert.equal(bad.status, 400);
  assert.match(JSON.parse(bad.body).error, /business name is required/);
  assert.equal((await request('POST', '/api/quote', '{}')).status, 415);
});
test('oversized request rejected and unsupported methods have no side effects', async () => {
  assert.equal((await request('POST', '/api/quote', ' '.repeat(32769), { 'content-type': 'application/json' })).status, 413);
  assert.equal((await request('DELETE', '/api/quote')).status, 405);
  assert.equal((await request('POST', '/style.css')).status, 405);
});
test('UTF-8 client name survives an HTTP chunk split inside accented character', async () => {
  const body = Buffer.from(JSON.stringify({ business: 'Studio', client: 'Zoë', discount: '0', items: [{ service: 'Portrait', unitPrice: '50', quantity: '1' }] }));
  const split = body.indexOf(Buffer.from('ë')) + 1;
  const result = await request('POST', '/api/quote', [body.subarray(0, split), body.subarray(split)], { 'content-type': 'application/json' });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.body).client, 'Zoë');
});
