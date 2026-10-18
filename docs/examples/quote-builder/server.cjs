const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildQuote } = require('./quote.cjs');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" };
function json(res, status, data) {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function handler(req, res) {
  const route = req.url.split('?')[0];
  if (route === '/api/quote') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for quotes' });
    if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') return json(res, 415, { error: 'Send application/json' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 32768) return json(res, 413, { error: 'Quote must be 32 KB or smaller' });
        chunks.push(Buffer.from(chunk));
      }
      let parsed;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'Send valid JSON' }); }
      return json(res, 200, buildQuote(parsed));
    } catch (error) {
      return json(res, error instanceof RangeError ? 400 : 500, { error: error instanceof RangeError ? error.message : 'Quote could not be calculated' });
    }
  }
  const asset = assets.get(route);
  if (!asset) return json(res, 404, { error: 'Page not found' });
  if (req.method !== 'GET') return json(res, 405, { error: 'Use GET for this page' });
  try {
    const content = await fs.readFile(path.join(__dirname, 'public', asset[0]));
    res.writeHead(200, { ...headers, 'Content-Type': asset[1] });
    res.end(content);
  } catch { json(res, 500, { error: 'Page could not be loaded' }); }
}
if (require.main === module) {
  http.createServer(handler).listen(3000, '127.0.0.1', () => console.log('Clearquote running at http://127.0.0.1:3000'));
}
module.exports = { handler };
