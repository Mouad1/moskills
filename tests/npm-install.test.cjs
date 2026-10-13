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
  npm_config_audit: 'false', npm_config_fund: 'false', MOSKILLS_NO_LAUNCHCTL: '1',
  XDG_CONFIG_HOME: path.join(scratch, 'config'), CLAUDE_CONFIG_DIR: path.join(scratch, 'claude'),
  EVOLVEBOOKS_HOME: '', MOSKILLS_NO_UPDATE_CHECK: '1' };
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
  await t.test('tarball includes evolvebook docs, diagrams, and settings helpers', () => {
    for (const f of ['lib/claude-settings.js', 'lib/claude-settings.py', 'docs/evolvebook.md',
      'docs/diagrams/evolvebook-anatomy.mmd', 'docs/diagrams/evolvebook-anatomy.svg',
      'docs/diagrams/evolvebook-anatomy.png', 'docs/architecture.md', 'docs/architecture.canvas',
      'templates/claude/skills/evolvebook/scripts/evolvebook.sh'])
      assert.ok(pkg.files.includes(f), f);
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
  await t.test('evolvebook aliases keep helper help', () => {
    for (const args of [['evolvebook', 'help'], ['evolvebooks', '--help']])
      assert.match(ok(call(args)), /repeat <name> key=value/);
  });
  await t.test('packed evolvebook supports isolated project-only setup and export', () => {
    const bookProject = project('book project with spaces');
    fs.mkdirSync(path.join(bookProject, '.agents/skills'), { recursive: true });
    ok(call(['evolvebook', 'setup', '--project-only'], bookProject));
    ok(call(['evolvebook', 'new', 'release-guide', '--project', '--purpose', 'Release guide',
      '--use-when', 'shipping code', '--choices', 'topic,format'], bookProject));
    const book = path.join(bookProject, '.evolvebooks/release-guide');
    for (const f of ['SKILL.md', 'brief.md', 'examples.md', 'choices.md', 'never.md', 'check.md',
      'done.md', 'mistakes.md', 'toolbox/README.md']) assert.ok(fs.statSync(path.join(book, f)).isFile(), f);
    assert.match(ok(call(['evolvebooks', 'repeat', 'release-guide', 'topic=runtime', 'format=guide'], bookProject)), /PASS/);
    ok(call(['evolvebook', 'link'], bookProject));
    for (const dir of ['.claude/skills', '.agents/skills']) {
      const link = path.join(bookProject, dir, 'release-guide');
      assert.equal(fs.readlinkSync(link), '../../.evolvebooks/release-guide');
      assert.equal(fs.realpathSync(link), fs.realpathSync(book));
    }
    const exported = path.join(bookProject, '--verbose');
    ok(call(['evolvebook', 'export', 'release-guide', '--out', '--verbose'], bookProject));
    assert.match(fs.readFileSync(exported, 'utf8'), /<!-- file: choices.md -->/);
    assert.ok(!fs.existsSync(path.join(home, '.evolvebooks')));
  });
  await t.test('packed plugin-autoupdate check loads helpers without changing settings', () => {
    fs.mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
    const settings = path.join(env.CLAUDE_CONFIG_DIR, 'settings.json');
    const original = JSON.stringify({ theme: 'dark', extraKnownMarketplaces: { moskills: { autoUpdate: true } } });
    fs.writeFileSync(settings, original);
    const result = call(['plugin-autoupdate', '--check']);
    assert.match(ok(result), /auto-update for moskills: on/);
    assert.doesNotMatch(result.stdout + result.stderr, /unknown|not valid|No such file/);
    assert.equal(fs.readFileSync(settings, 'utf8'), original);
  });
  const p = project('fresh project with spaces');
  await t.test('fresh init enables both agent entry points without flags', () => {
    const out = ok(call(['init'], p));
    assert.ok(out.trim().split('\n').length <= 4, out);
    assertSetup(p);
    ok(call(['doctor'], p));
  });
  await t.test('packed preview documented commands launch and stop with a POSIX caller', async () => {
    const skill = fs.readFileSync(path.join(p, '.claude/skills/preview/SKILL.md'), 'utf8');
    const start = skill.match(/^(?:sh|bash) \.claude\/skills\/preview\/scripts\/start-server\.sh --project-dir "\$\(pwd\)"$/m)?.[0];
    const stop = skill.match(/^(?:sh|bash) \.claude\/skills\/preview\/scripts\/stop-server\.sh "\$SESSION_DIR"$/m)?.[0];
    assert.ok(start && stop, 'documented preview commands must be runnable');
    const callerEnv = {};
    const dash = spawnSync('sh', ['-c', 'command -v dash'], { encoding: 'utf8' });
    if (dash.status === 0) {
      const bin = path.join(scratch, 'POSIX shell bin');
      fs.mkdirSync(bin);
      fs.symlinkSync(dash.stdout.trim(), path.join(bin, 'sh'));
      callerEnv.PATH = bin + path.delimiter + env.PATH;
    }
    const stale = path.join(p, '.preview/stale session');
    fs.mkdirSync(path.join(stale, 'state'), { recursive: true });
    fs.writeFileSync(path.join(stale, 'state/server.pid'), '999999999\n');
    const stopped = run('sh', ['-c', stop], p, { ...callerEnv, SESSION_DIR: stale });
    assert.equal(stopped.stderr, '', stopped.stderr);
    assert.equal(JSON.parse(ok(stopped)).status, 'stopped');
    assert.ok(!fs.existsSync(path.join(stale, 'state/server.pid')));
    const launched = run('sh', ['-c', start + ' --background'], p, callerEnv);
    assert.equal(launched.stderr, '', launched.stderr);
    const info = JSON.parse(ok(launched));
    const session = path.dirname(info.state_dir);
    try {
      assert.equal(fs.realpathSync(path.dirname(session)), fs.realpathSync(path.join(p, '.preview')));
      const response = await fetch(`http://${info.host}:${info.port}/health`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.status, 'ok');
      assert.equal(health.pid, Number(fs.readFileSync(path.join(info.state_dir, 'server.pid'), 'utf8').trim()));
      assert.ok(fs.existsSync(path.join(info.state_dir, 'server.pid')));
      const result = run('sh', ['-c', stop], p, { ...callerEnv, SESSION_DIR: session });
      assert.equal(result.stderr, '', result.stderr);
      assert.equal(JSON.parse(ok(result)).status, 'stopped');
      assert.throws(() => process.kill(health.pid, 0), { code: 'ESRCH' });
      assert.ok(!fs.existsSync(path.join(info.state_dir, 'server.pid')));
      assert.ok(fs.existsSync(info.screen_dir), 'project preview content remains after stop');
    } finally {
      const pidFile = path.join(info.state_dir, 'server.pid');
      if (fs.existsSync(pidFile)) {
        try { process.kill(Number(fs.readFileSync(pidFile, 'utf8').trim()), 'SIGTERM'); } catch {}
      }
    }
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
    const sourceMeta = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    for (const f of ['package.json', ...sourceMeta.files])
      fs.cpSync(path.join(root, f), path.join(staged, f), { recursive: true });
    const meta = JSON.parse(fs.readFileSync(path.join(staged, 'package.json')));
    const sourceVersion = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    const parts = sourceVersion.split('.').map(Number);
    parts[2] += 1;
    const upgradeVersion = parts.join('.');
    meta.version = upgradeVersion;
    fs.writeFileSync(path.join(staged, 'package.json'), JSON.stringify(meta));
    fs.writeFileSync(path.join(staged, 'VERSION'), upgradeVersion + '\n');
    fs.appendFileSync(path.join(staged, 'templates/managed/base.md'), '\nUpgrade sentinel.\n');
    const userFile = path.join(q, 'CLAUDE.md');
    fs.appendFileSync(userFile, '\nMy project notes.\n');
    install(pack(staged).file);
    assert.equal(ok(call(['version'])).trim(), upgradeVersion);
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
test('documented preview stop preserves temp project content and removes only default sessions', () => {
  const tmpProject = fs.mkdtempSync('/tmp/moskills preview cleanup ');
  const helper = path.join(tmpProject, '.claude/skills/preview/scripts/stop-server.sh');
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.copyFileSync(path.join(root, 'templates/claude/skills/preview/scripts/stop-server.sh'), helper);
  const skill = fs.readFileSync(path.join(root, 'templates/claude/skills/preview/SKILL.md'), 'utf8');
  const stop = skill.match(/^bash \.claude\/skills\/preview\/scripts\/stop-server\.sh "\$SESSION_DIR"$/m)?.[0];
  assert.ok(stop, 'documented stop command must be runnable');
  const stamp = Date.now();
  const ephemeral = [`/tmp/preview-${process.pid}-${stamp}`];
  if (process.platform === 'darwin') ephemeral.push(`/private/tmp/preview-${process.pid}-${stamp + 1}`);
  const persistent = path.join(tmpProject, '.preview', `preview-${process.pid}-${stamp}`);
  const nested = path.join(ephemeral[0], '.preview', 'session with spaces');
  try {
    for (const session of [persistent, nested, ...ephemeral]) {
      fs.mkdirSync(path.join(session, 'state'), { recursive: true });
      fs.mkdirSync(path.join(session, 'content'), { recursive: true });
      fs.writeFileSync(path.join(session, 'state/server.pid'), '999999999\n');
      fs.writeFileSync(path.join(session, 'content/screen.html'), '<p>Keep this preview</p>');
      const result = run('sh', ['-c', stop], tmpProject, { SESSION_DIR: session });
      assert.equal(result.stderr, '', result.stderr);
      assert.equal(JSON.parse(ok(result)).status, 'stopped');
      assert.ok(!fs.existsSync(path.join(session, 'state/server.pid')));
      if ([persistent, nested].includes(session)) {
        assert.equal(fs.readFileSync(path.join(session, 'content/screen.html'), 'utf8'), '<p>Keep this preview</p>');
      } else {
        assert.ok(!fs.existsSync(session), 'default ephemeral session is removed');
      }
    }
  } finally {
    fs.rmSync(tmpProject, { recursive: true, force: true });
    for (const session of ephemeral) fs.rmSync(session, { recursive: true, force: true });
  }
});
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
