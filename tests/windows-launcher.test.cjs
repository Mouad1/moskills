'use strict';
// Native Windows: the npm launcher finds Git for Windows' sh, never WSL's
// System32 bash, and runs the Node-only commands without any shell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { findShell, NODE_COMMANDS } = require('../lib/find-shell.cjs');

const has = (...files) => p => files.map(f => f.toLowerCase()).includes(p.toLowerCase());

test('macOS and Linux use sh', () => {
  assert.equal(findShell({ platform: 'linux', env: {} }), 'sh');
  assert.equal(findShell({ platform: 'darwin', env: {} }), 'sh');
});

test('MOSKILLS_SH wins everywhere', () => {
  assert.equal(findShell({ platform: 'win32', env: { MOSKILLS_SH: 'D:\\tools\\sh.exe' } }), 'D:\\tools\\sh.exe');
});

test('windows: sh on PATH is used, System32 bash (WSL) is skipped', () => {
  const env = { SystemRoot: 'C:\\Windows', Path: 'C:\\Windows\\System32;C:\\Tools\\Git\\usr\\bin' };
  assert.equal(findShell({ platform: 'win32', env, exists: has('C:\\Windows\\System32\\bash.exe', 'C:\\Tools\\Git\\usr\\bin\\sh.exe') }),
    'C:\\Tools\\Git\\usr\\bin\\sh.exe');
  assert.equal(findShell({ platform: 'win32', env, exists: has('C:\\Windows\\System32\\bash.exe') }), null);
});

test('windows: standard Git for Windows folders are found without PATH', () => {
  const env = { Path: '', ProgramFiles: 'C:\\Program Files' };
  assert.equal(findShell({ platform: 'win32', env, exists: has('C:\\Program Files\\Git\\bin\\sh.exe') }), 'C:\\Program Files\\Git\\bin\\sh.exe');
  const user = { Path: '', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
  assert.equal(findShell({ platform: 'win32', env: user, exists: has('C:\\Users\\a\\AppData\\Local\\Programs\\Git\\bin\\sh.exe') }),
    'C:\\Users\\a\\AppData\\Local\\Programs\\Git\\bin\\sh.exe');
});

test('node-only commands map to files that exist', () => {
  for (const file of Object.values(NODE_COMMANDS)) assert.ok(fs.existsSync(path.join(root, 'lib', file)), file);
});

test('npm launcher runs node-only commands with no shell available', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills noshell '));
  try {
    // A shell that does not exist: anything needing it would fail.
    const env = { ...process.env, MOSKILLS_SH: path.join(dir, 'missing-sh'), MOSKILLS_NO_UPDATE_CHECK: '1' };
    const run = args => spawnSync(process.execPath, [path.join(root, 'bin/moskills.cjs'), ...args], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
    let r = run(['run-state', 'init', '--goal', 'g', '--tasks', 'one']);
    assert.equal(r.status, 0, r.stderr);
    r = run(['run-state', 'list']);
    assert.match(r.stdout, /default\s+not done\s+0\/1/);
    r = run(['design', 'init']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(run(['design', 'check']).stdout, /design\.md: OK/);
    r = run(['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not find a POSIX shell|could not start its shell/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('check commands use sh -c, or cmd.exe on Windows without a POSIX shell', () => {
  const { commandRunner } = require('../lib/find-shell.cjs');
  assert.deepEqual(commandRunner('npm test', { platform: 'linux', env: {} }), ['sh', ['-c', 'npm test'], {}]);
  const [file, args, extra] = commandRunner('npm test', { platform: 'win32', env: { Path: '', ComSpec: 'C:\\Windows\\system32\\cmd.exe' }, exists: () => false });
  assert.equal(file, 'C:\\Windows\\system32\\cmd.exe');
  assert.deepEqual(args, ['/d', '/s', '/c', '"npm test"']);
  assert.equal(extra.windowsVerbatimArguments, true);
});
