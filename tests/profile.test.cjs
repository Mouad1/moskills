'use strict';
// Plugin profiles: a project names a preset (and overrides) in .moskills.json.
// doctor checks the installed Claude Code plugins against it; sync keeps the
// profile fields and writes enabledPlugins into .claude/settings.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'moskills');
const profile = require(path.join(root, 'lib/profile.cjs'));
const PRESETS = path.join(root, 'templates/profiles');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills profile '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1', MOSKILLS_NO_NOTES: '1', MOSKILLS_CLAUDE: '/nonexistent/claude' };
delete env.MOSKILLS_ROOT;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function dir(name) {
  const d = path.join(scratch, `${++n}-${name}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
// A fake Claude Code config dir with installed plugins: { key: version | [version, scope, projectPath] }.
function claudeConfig(installed) {
  const cfg = dir('claude-config');
  const plugins = {};
  for (const [key, v] of Object.entries(installed)) {
    const [version, scope = 'user', projectPath] = Array.isArray(v) ? v : [v];
    plugins[key] = [{ scope, version, ...(projectPath ? { projectPath } : {}) }];
  }
  write(path.join(cfg, 'plugins/installed_plugins.json'), { version: 2, plugins });
  return cfg;
}
function run(cwd, args, extra = {}) {
  return spawnSync('sh', [cli, ...args], { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60000 });
}
function project(name, manifestExtra) {
  const d = dir(name);
  const r = run(d, ['init', '--target', d, '--no-hooks']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  if (manifestExtra) {
    const file = path.join(d, '.moskills.json');
    write(file, { ...readJson(file), ...manifestExtra });
  }
  return d;
}
const MOSKILLS = 'moskills@moskills';
const VERSION = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();

// ---------- ranges (D4) ----------

test('satisfies: exact, tilde, caret and any', () => {
  assert.equal(profile.satisfies('1.2.3', '1.2.3'), true);
  assert.equal(profile.satisfies('1.2.4', '1.2.3'), false);
  assert.equal(profile.satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(profile.satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(profile.satisfies('1.9.0', '^1.2.3'), true);
  assert.equal(profile.satisfies('2.0.0', '^1.2.3'), false);
  assert.equal(profile.satisfies('1.2.2', '^1.2.3'), false);
  assert.equal(profile.satisfies('0.9.4', '^0.9'), true);
  assert.equal(profile.satisfies('0.10.0', '^0.9'), false, 'caret on 0.x keeps the minor');
  assert.equal(profile.satisfies('anything', '*'), true);
});

test('satisfies: a version that is not semver matches only * or the same string', () => {
  assert.equal(profile.satisfies('84cc3c14fa1e', '84cc3c14fa1e'), true);
  assert.equal(profile.satisfies('84cc3c14fa1e', '*'), true);
  assert.equal(profile.satisfies('84cc3c14fa1e', '^1.0.0'), null, 'null means unversioned');
});

// ---------- presets and resolution (D1) ----------

test('presets web-app, cli and content exist and accept the current moskills version', () => {
  for (const name of ['web-app', 'cli', 'content']) {
    const preset = readJson(path.join(PRESETS, `${name}.json`));
    assert.ok(preset.plugins[MOSKILLS], `${name} lists ${MOSKILLS}`);
    assert.equal(profile.satisfies(VERSION, preset.plugins[MOSKILLS]), true,
      `${name}: range ${preset.plugins[MOSKILLS]} must accept VERSION ${VERSION}; update the preset on release`);
  }
});

test('resolve: preset plus plugins, minus remove', () => {
  const r = profile.resolve({ profile: 'web-app', plugins: { 'impeccable@impeccable': '^2.1', [MOSKILLS]: '~0.9.4' }, remove: [] }, PRESETS);
  assert.deepEqual(r.errors, []);
  assert.equal(r.plugins['impeccable@impeccable'], '^2.1');
  assert.equal(r.plugins[MOSKILLS], '~0.9.4', 'plugins changes the range of a preset plugin');
  const removed = profile.resolve({ profile: 'web-app', remove: [MOSKILLS] }, PRESETS);
  assert.equal(removed.plugins[MOSKILLS], undefined);
});

test('resolve: an unknown preset name is an error', () => {
  const r = profile.resolve({ profile: 'web-ap' }, PRESETS);
  assert.match(r.errors.join('\n'), /unknown profile 'web-ap'.*web-app/);
});

test('resolve: no profile and no plugins means no profile', () => {
  assert.equal(profile.resolve({}, PRESETS), null);
});

// ---------- check ----------

test('check: matching plugins give no issue', () => {
  const p = dir('match');
  const cfg = claudeConfig({ [MOSKILLS]: VERSION, 'telegram@official': '0.0.7' });
  const r = profile.check(p, { manifest: { profile: 'cli' }, configDir: cfg, presetDir: PRESETS });
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.warnings, []);
});

test('check: a missing plugin is an issue', () => {
  const p = dir('missing');
  const cfg = claudeConfig({});
  const r = profile.check(p, { manifest: { profile: 'cli' }, configDir: cfg, presetDir: PRESETS });
  assert.match(r.issues.join('\n'), /missing plugin moskills@moskills/);
});

test('check: a version outside its range is an issue', () => {
  const p = dir('range');
  const cfg = claudeConfig({ [MOSKILLS]: '0.8.1' });
  const r = profile.check(p, { manifest: { profile: 'cli' }, configDir: cfg, presetDir: PRESETS });
  assert.match(r.issues.join('\n'), /moskills@moskills 0\.8\.1 is outside \^0\.9/);
});

test('check: an unversioned plugin is a warning, not an issue', () => {
  const p = dir('unversioned');
  const cfg = claudeConfig({ [MOSKILLS]: VERSION, 'caveman@caveman': '84cc3c14fa1e' });
  const r = profile.check(p, { manifest: { profile: 'cli', plugins: { 'caveman@caveman': '^1.0.0' } }, configDir: cfg, presetDir: PRESETS });
  assert.deepEqual(r.issues, []);
  assert.match(r.warnings.join('\n'), /caveman@caveman 84cc3c14fa1e is unversioned/);
});

test('check: a plugin of another project scope does not count as installed here', () => {
  const p = dir('scope');
  const cfg = claudeConfig({ [MOSKILLS]: [VERSION, 'project', '/somewhere/else'] });
  const r = profile.check(p, { manifest: { profile: 'cli' }, configDir: cfg, presetDir: PRESETS });
  assert.match(r.issues.join('\n'), /missing plugin moskills@moskills/);
  const cfgHere = claudeConfig({ [MOSKILLS]: [VERSION, 'project', p] });
  assert.deepEqual(profile.check(p, { manifest: { profile: 'cli' }, configDir: cfgHere, presetDir: PRESETS }).issues, []);
});

test('check: a plugin enabled in the project settings but not in the profile is extra', () => {
  const p = dir('extra');
  write(path.join(p, '.claude/settings.json'), { enabledPlugins: { [MOSKILLS]: true, 'stray@market': true, 'off@market': false } });
  const cfg = claudeConfig({ [MOSKILLS]: VERSION, 'stray@market': '1.0.0' });
  const r = profile.check(p, { manifest: { profile: 'cli' }, configDir: cfg, presetDir: PRESETS });
  assert.match(r.issues.join('\n'), /extra plugin stray@market/);
  assert.doesNotMatch(r.issues.join('\n'), /off@market/);
});

test('check: an unknown preset is an issue', () => {
  const r = profile.check(dir('unknown'), { manifest: { profile: 'nope' }, configDir: claudeConfig({}), presetDir: PRESETS });
  assert.match(r.issues.join('\n'), /unknown profile 'nope'/);
});

// ---------- proposal ----------

test('propose: web framework or index.html gives web-app', () => {
  const a = dir('web');
  write(path.join(a, 'package.json'), { dependencies: { next: '15.0.0' } });
  assert.equal(profile.propose(a), 'web-app');
  const b = dir('static');
  write(path.join(b, 'index.html'), '<!doctype html>');
  assert.equal(profile.propose(b), 'web-app');
});

test('propose: a bin entry, Cargo.toml or go.mod gives cli', () => {
  const a = dir('bin');
  write(path.join(a, 'package.json'), { bin: { tool: 'bin/tool.js' } });
  assert.equal(profile.propose(a), 'cli');
  const b = dir('go');
  write(path.join(b, 'go.mod'), 'module x\n');
  assert.equal(profile.propose(b), 'cli');
});

test('propose: Markdown and no code manifest gives content; moskills seeds alone give nothing', () => {
  const a = dir('content');
  write(path.join(a, 'posts/hello.md'), '# Hello\n');
  assert.equal(profile.propose(a), 'content');
  const seeded = project('seeded');
  assert.equal(profile.propose(seeded), null);
});

// ---------- doctor ----------

test('doctor: a project without a profile stays OK and gets a proposal', () => {
  const p = project('doctor-none');
  write(path.join(p, 'go.mod'), 'module x\n');
  const r = run(p, ['doctor', '--target', p], { CLAUDE_CONFIG_DIR: claudeConfig({}) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /profile: none \(proposed: cli; add "profile": "cli" to \.moskills\.json\)/);
});

test('doctor: a matching profile is OK', () => {
  const p = project('doctor-ok', { profile: 'cli' });
  const r = run(p, ['doctor', '--target', p], { CLAUDE_CONFIG_DIR: claudeConfig({ [MOSKILLS]: VERSION }) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /profile: cli, 1 plugin\(s\) match/);
});

test('doctor: each mismatch exits 1', () => {
  const cases = [
    ['missing', { profile: 'cli' }, {}, /missing plugin moskills@moskills/],
    ['range', { profile: 'cli' }, { [MOSKILLS]: '0.8.1' }, /outside/],
    ['unknown', { profile: 'web-ap' }, { [MOSKILLS]: VERSION }, /unknown profile 'web-ap'/],
  ];
  for (const [name, extra, installed, re] of cases) {
    const p = project(`doctor-${name}`, extra);
    const r = run(p, ['doctor', '--target', p], { CLAUDE_CONFIG_DIR: claudeConfig(installed) });
    assert.equal(r.status, 1, `${name}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, re);
    assert.doesNotMatch(r.stdout, /\bOK {2}v/, `${name}: no OK line`);
  }
  const p = project('doctor-extra', { profile: 'cli' });
  write(path.join(p, '.claude/settings.json'), { enabledPlugins: { 'stray@market': true } });
  const r = run(p, ['doctor', '--target', p], { CLAUDE_CONFIG_DIR: claudeConfig({ [MOSKILLS]: VERSION }) });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /extra plugin stray@market/);
});

// ---------- sync ----------

test('sync keeps profile, plugins and remove in .moskills.json', () => {
  const extra = { profile: 'web-app', plugins: { 'impeccable@impeccable': '^2.1' }, remove: ['x@y'] };
  const p = project('sync-keep', extra);
  const r = run(p, ['sync', '--target', p]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = readJson(path.join(p, '.moskills.json'));
  assert.equal(m.profile, 'web-app');
  assert.deepEqual(m.plugins, extra.plugins);
  assert.deepEqual(m.remove, extra.remove);
  assert.equal(m.version, VERSION);
});

test('sync writes enabledPlugins and keeps other settings', () => {
  const p = project('sync-settings', { profile: 'web-app', plugins: { 'impeccable@impeccable': '^2.1' }, remove: [] });
  write(path.join(p, '.claude/settings.json'), { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'other@m': true } });
  const r = run(p, ['sync', '--target', p]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s = readJson(path.join(p, '.claude/settings.json'));
  assert.deepEqual(s.permissions, { allow: ['Bash(ls)'] });
  assert.equal(s.enabledPlugins[MOSKILLS], true);
  assert.equal(s.enabledPlugins['impeccable@impeccable'], true);
  assert.equal(s.enabledPlugins['other@m'], true, 'sync does not drop plugins it did not write');
});

test('sync disables a removed plugin that the project settings enabled', () => {
  const p = project('sync-remove', { profile: 'web-app', remove: ['old@m'] });
  write(path.join(p, '.claude/settings.json'), { enabledPlugins: { 'old@m': true } });
  assert.equal(run(p, ['sync', '--target', p]).status, 0);
  assert.equal(readJson(path.join(p, '.claude/settings.json')).enabledPlugins['old@m'], false);
});

test('sync without a profile does not create .claude/settings.json', () => {
  const p = project('sync-none');
  assert.equal(run(p, ['sync', '--target', p]).status, 0);
  assert.equal(fs.existsSync(path.join(p, '.claude/settings.json')), false);
});
