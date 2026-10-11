'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills npm '));
const home = path.join(scratch, 'home');
fs.mkdirSync(home);
const env = { ...process.env, HOME: home, npm_config_cache: path.join(scratch, 'cache'),
  npm_config_userconfig: path.join(scratch, 'npmrc'), npm_config_globalconfig: path.join(scratch, 'global-npmrc'),
  npm_config_audit: 'false', npm_config_fund: 'false', MOSKILLS_NO_LAUNCHCTL: '1' };
fs.writeFileSync(env.npm_config_userconfig, '');
fs.writeFileSync(env.npm_config_globalconfig, '');
function run(cmd, args, cwd = root, extra = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 120000 });
  assert.ifError(r.error);
  return r;
}
function ok(r) { assert.equal(r.status, 0, r.stderr + r.stdout); return r.stdout; }
function pack(cwd) {
  const data = JSON.parse(ok(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch], cwd)))[0];
  return { file: path.join(scratch, data.filename), version: data.version, files: data.files.map(f => f.path) };
}
function project(name) { const p = path.join(scratch, name); fs.mkdirSync(p); return p; }
function assertSetup(p) {
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, '.moskills.json'))).agents, true);
  for (const f of ['AGENTS.md', 'CLAUDE.md', '.agents/skills/diagnose/SKILL.md', '.claude/standard/base.md'])
    assert.ok(fs.statSync(path.join(p, f)).isFile(), f);
  assert.equal(fs.lstatSync(path.join(p, '.agents/skills/diagnose')).isSymbolicLink(), false);
}

test('packed npm installation lifecycle uses durable project copies', async t => {
  const pkg = pack(root);
  await t.test('tarball contains only public runtime assets', () => {
    assert.equal(pkg.version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    for (const field of ['dependencies', 'devDependencies']) assert.equal(Object.keys(metadata[field] || {}).length, 0);
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.ok(!metadata.scripts[hook], hook);
    for (const f of ['package.json', 'bin/moskills.cjs', 'moskills', 'VERSION', 'templates/managed/base.md'])
      assert.ok(pkg.files.includes(f), f);
    assert.ok(!pkg.files.some(f => /^(tasks|tests|\.git|docs\/superpowers)\//.test(f)), pkg.files.join('\n'));
  });
  const prefix = path.join(scratch, 'global prefix');
  const install = file => ok(run('npm', ['install', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', file]));
  install(pkg.file);
  const cli = path.join(prefix, 'bin', 'moskills');
  const call = (args, cwd = root) => run(cli, args, cwd);
  await t.test('help and version are short and usable', () => {
    assert.match(ok(call(['--help'])), /init/);
    assert.equal(ok(call(['--version'])).trim(), fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  });
  const p = project('fresh project with spaces');
  await t.test('fresh init enables both agent entry points without flags', () => {
    const out = ok(call(['init'], p));
    assert.ok(out.trim().split('\n').length <= 4, out);
    assertSetup(p);
    ok(call(['doctor'], p));
  });
  await t.test('repeated init preserves edits and reports warning', () => {
    const f = path.join(p, '.claude/standard/base.md');
    fs.appendFileSync(f, '\nPersonal rule: preserve me.\n');
    const r = call(['init'], p);
    ok(r);
    assert.match(fs.readFileSync(f, 'utf8'), /preserve me/);
    assert.match(r.stdout + r.stderr, /preserv|edited/i);
    assertSetup(p);
    assert.notEqual(call(['doctor'], p).status, 0);
  });
  await t.test('errors retain actionable details and failure status', () => {
    const r = call(['sync'], project('not initialized'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /init/i);
    assert.notEqual(call(['init', '--target']).status, 0);
    const unknown = call(['typo']);
    assert.notEqual(unknown.status, 0);
    assert.ok((unknown.stdout + unknown.stderr).trim().split('\n').length <= 3);
    assert.match(unknown.stderr, /unknown command.*typo/i);
    assert.doesNotMatch(unknown.stdout, /schedule-update|self-update/);
  });
  await t.test('npm-owned lifecycle commands cannot create cache links', () => {
    for (const command of ['setup', 'link', 'unlink', 'uninstall', 'self-update', 'schedule-update']) {
      const r = call([command]);
      assert.notEqual(r.status, 0, command);
      assert.match(r.stderr + r.stdout, /npm/i);
    }
    assert.ok(!fs.existsSync(path.join(home, '.local/bin/moskills')));
  });
  const q = project('npx project');
  await t.test('offline npx setup survives deletion of npm cache', () => {
    const out = ok(run('npx', ['--offline', '--yes', '--package', pkg.file, 'moskills', 'init'], q));
    assert.ok(out.trim().split('\n').length <= 4, out);
    assertSetup(q);
    fs.rmSync(env.npm_config_cache, { recursive: true, force: true });
    assertSetup(q);
    ok(call(['doctor'], q));
  });
  await t.test('local tarball upgrade followed by sync preserves user-owned files', () => {
    const staged = path.join(scratch, 'upgrade source');
    fs.mkdirSync(staged);
    for (const f of ['package.json', 'bin', 'moskills', 'VERSION', 'templates', 'migrations'])
      fs.cpSync(path.join(root, f), path.join(staged, f), { recursive: true });
    const meta = JSON.parse(fs.readFileSync(path.join(staged, 'package.json')));
    meta.version = '0.6.6';
    fs.writeFileSync(path.join(staged, 'package.json'), JSON.stringify(meta));
    fs.writeFileSync(path.join(staged, 'VERSION'), '0.6.6\n');
    fs.appendFileSync(path.join(staged, 'templates/managed/base.md'), '\nUpgrade sentinel.\n');
    const userFile = path.join(q, 'CLAUDE.md');
    fs.appendFileSync(userFile, '\nMy project notes.\n');
    install(pack(staged).file);
    assert.equal(ok(call(['version'])).trim(), '0.6.6');
    ok(call(['sync'], q));
    assert.match(fs.readFileSync(userFile, 'utf8'), /My project notes/);
    assert.match(fs.readFileSync(path.join(q, '.claude/standard/base.md'), 'utf8'), /Upgrade sentinel/);
    ok(call(['doctor'], q));
  });
  await t.test('npm uninstall removes executable while keeping project setup', () => {
    ok(run('npm', ['uninstall', '--global', '--prefix', prefix, '--offline', '--ignore-scripts', 'moskills']));
    assert.ok(!fs.existsSync(cli));
    assertSetup(q);
    assertSetup(p);
  });
});
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
