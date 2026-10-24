'use strict';
// Guards for local-only HTTP tools (dashboards). Zero dependencies.
// - Host must be a loopback name (blocks DNS rebinding from web pages).
// - State-changing requests must come from a local origin and carry JSON
//   (a cross-site HTML form can only send form/text bodies, never application/json).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostname(value) {
  if (!value) return '';
  const v = String(value).trim().toLowerCase();
  if (v.startsWith('[')) return v.slice(0, v.indexOf(']') + 1);
  return v.split(':')[0];
}

function isLocalHostHeader(host) {
  return LOCAL_HOSTS.has(hostname(host));
}

function isLocalOrigin(origin) {
  if (!origin) return true; // same-origin navigation and non-browser clients send no Origin
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase()); // URL keeps IPv6 brackets: "[::1]"
  } catch {
    return false;
  }
}

function deny(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
  return false;
}

/** Returns true when the request may continue; otherwise answers 403 and returns false. */
function checkLocalRequest(req, res) {
  if (!isLocalHostHeader(req.headers.host)) return deny(res, 403, 'Forbidden host');
  return true;
}

/** For POST/PUT/DELETE: local origin + JSON body required. */
function checkLocalWrite(req, res) {
  if (!isLocalOrigin(req.headers.origin)) return deny(res, 403, 'Forbidden origin');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return deny(res, 415, 'Content-Type must be application/json');
  return true;
}

module.exports = { checkLocalRequest, checkLocalWrite, isLocalHostHeader, isLocalOrigin, LOCAL_HOSTS };
