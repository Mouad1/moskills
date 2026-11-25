'use strict';
// Plugin profiles. A project names a preset (templates/profiles/<name>.json)
// and its overrides in .moskills.json:
//   { "profile": "web-app", "plugins": { "name@market": "^1.2" }, "remove": ["name@market"] }
// doctor checks the installed Claude Code plugins against the resolved set;
// sync keeps these fields and writes enabledPlugins into .claude/settings.json.
// No dependencies: Node.js 18+ only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROFILE_FIELDS = ['profile', 'plugins', 'remove'];
const DEFAULT_PRESETS = path.join(__dirname, '..', 'templates', 'profiles');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// ---------- ranges: exact 1.2.3, ~1.2.3 (patch), ^1.2.3 (minor and patch), * ----------

const SEMVER = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/;
function parse(v) {
  const m = SEMVER.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}
function cmp(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }

// true or false; null when the installed version is not semver (a git SHA)
// and the range is not '*' or that same string.
function satisfies(version, range) {
  range = String(range).trim();
  if (range === '*' || range === String(version)) return true;
  const v = parse(version);
  if (!v) return null;
  const op = range[0] === '^' || range[0] === '~' ? range[0] : '';
  const r = parse(op ? range.slice(1) : range);
  if (!r) return false;
  if (!op) return cmp(v, r) === 0;
  if (cmp(v, r) < 0) return false;
  if (op === '~') return v[0] === r[0] && v[1] === r[1];
  if (r[0] > 0) return v[0] === r[0];
  return v[0] === 0 && v[1] === r[1];
}

// ---------- presets and resolution ----------

function presetNames(presetDir) {
  try {
    return fs.readdirSync(presetDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  } catch { return []; }
}

// null when the manifest declares no profile; else { name, plugins: {key: range}, errors: [] }
function resolve(manifest, presetDir = DEFAULT_PRESETS) {
  manifest = manifest || {};
  const own = manifest.plugins && typeof manifest.plugins === 'object' ? manifest.plugins : {};
  if (!manifest.profile && !Object.keys(own).length) return null;
  const errors = [];
  let plugins = {};
  if (manifest.profile) {
    const names = presetNames(presetDir);
    if (!names.includes(manifest.profile)) {
      errors.push(`unknown profile '${manifest.profile}' (known: ${names.join(', ')})`);
    } else {
      const preset = readJson(path.join(presetDir, `${manifest.profile}.json`), {});
      plugins = { ...(preset.plugins || {}) };
    }
  }
  Object.assign(plugins, own);
  for (const key of Array.isArray(manifest.remove) ? manifest.remove : []) delete plugins[key];
  return { name: manifest.profile || '(custom)', plugins, errors };
}

// ---------- what is installed and enabled ----------

function configDirDefault() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}
function samePath(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return path.resolve(a) === path.resolve(b); }
}

// { key: version } for user-scope installs and installs scoped to this project
function installed(projectDir, configDir = configDirDefault()) {
  const data = readJson(path.join(configDir, 'plugins', 'installed_plugins.json'), {});
  const out = {};
  for (const [key, entries] of Object.entries(data.plugins || {})) {
    for (const e of Array.isArray(entries) ? entries : [entries]) {
      if (!e || typeof e !== 'object') continue;
      const here = e.scope === 'user' || !e.scope || (e.projectPath && samePath(e.projectPath, projectDir));
      if (here) { out[key] = String(e.version || ''); break; }
    }
  }
  return out;
}

function settingsFile(projectDir) { return path.join(projectDir, '.claude', 'settings.json'); }

function enabled(projectDir) {
  const s = readJson(settingsFile(projectDir), {});
  return Object.entries(s.enabledPlugins || {}).filter(([, on]) => on === true).map(([k]) => k);
}

// ---------- check ----------

function check(projectDir, { manifest, configDir, presetDir = DEFAULT_PRESETS } = {}) {
  if (!manifest) manifest = readJson(path.join(projectDir, '.moskills.json'), {});
  const result = { profile: null, issues: [], warnings: [], matched: 0, proposal: null };
  const r = resolve(manifest, presetDir);
  if (!r) {
    result.proposal = propose(projectDir);
    return result;
  }
  result.profile = r.name;
  result.issues.push(...r.errors);
  if (r.errors.length) return result;
  const have = installed(projectDir, configDir);
  for (const [key, range] of Object.entries(r.plugins)) {
    if (!(key in have)) { result.issues.push(`missing plugin ${key} (${range}); install: /plugin install ${key}`); continue; }
    const ok = satisfies(have[key], range);
    if (ok === true) result.matched++;
    else if (ok === null) result.warnings.push(`${key} ${have[key]} is unversioned; cannot check ${range}`);
    else result.issues.push(`${key} ${have[key]} is outside ${range}`);
  }
  for (const key of enabled(projectDir)) {
    if (!(key in r.plugins)) result.issues.push(`extra plugin ${key}: enabled in .claude/settings.json, not in the profile`);
  }
  return result;
}

// ---------- preset proposal ----------

const WEB_DEPS = ['react', 'next', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'vite', 'astro', '@angular/core', 'solid-js', 'remix', '@remix-run/react'];
const SEEDS = new Set(['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'docs/prd.md', 'docs/rules.md', 'design.md']);
const SKIP_DIRS = new Set(['.git', '.claude', '.agents', '.moskills', 'node_modules', 'tasks']);

function markdownFiles(dir, rel = '', depth = 0, out = []) {
  if (depth > 3 || out.length > 0) return out;
  let entries;
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) markdownFiles(dir, r, depth + 1, out); }
    else if (e.name.endsWith('.md') && !SEEDS.has(r)) out.push(r);
    if (out.length) break;
  }
  return out;
}

// 'web-app' | 'cli' | 'content' | null
function propose(projectDir) {
  const has = f => fs.existsSync(path.join(projectDir, f));
  const pkg = readJson(path.join(projectDir, 'package.json'), null);
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  if (WEB_DEPS.some(d => d in deps) || has('index.html') || has('public/index.html')) return 'web-app';
  if ((pkg && pkg.bin) || has('Cargo.toml') || has('go.mod')) return 'cli';
  if (pkg || has('pyproject.toml') || has('requirements.txt') || has('Gemfile') || has('pom.xml')) return null;
  return markdownFiles(projectDir).length ? 'content' : null;
}

// ---------- writes (sync) ----------

// Copy the profile fields of the old manifest into the new one (sync rewrites the rest).
function mergeManifest(oldFile, newFile) {
  const old = readJson(oldFile, {});
  const next = readJson(newFile, null);
  if (!next) throw new Error(`cannot read ${newFile}`);
  for (const f of PROFILE_FIELDS) if (f in old) next[f] = old[f];
  fs.writeFileSync(newFile, JSON.stringify(next, null, 2) + '\n');
}

// Set enabledPlugins for the resolved profile; disable removed plugins; keep everything else.
function writeSettings(projectDir, presetDir = DEFAULT_PRESETS) {
  const manifest = readJson(path.join(projectDir, '.moskills.json'), {});
  const r = resolve(manifest, presetDir);
  if (!r) return { written: false };
  if (r.errors.length) throw new Error(r.errors.join('; '));
  const file = settingsFile(projectDir);
  let data = {};
  if (fs.existsSync(file)) {
    data = readJson(file, undefined);
    if (data === undefined) throw new Error(`${file} is not valid JSON; fix it, then run moskills sync`);
  }
  data.enabledPlugins = data.enabledPlugins || {};
  for (const key of Object.keys(r.plugins)) data.enabledPlugins[key] = true;
  for (const key of Array.isArray(manifest.remove) ? manifest.remove : []) {
    if (data.enabledPlugins[key] === true) data.enabledPlugins[key] = false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.moskills.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.moskills.tmp', file);
  return { written: true, plugins: Object.keys(r.plugins) };
}

// ---------- CLI (called by the moskills shell script) ----------
// check <target>           prints "profile: ..." lines; exit 1 on an issue
// merge-manifest <old> <new>
// settings <target>        exit 1 with a message when it cannot write

function main(argv) {
  const [cmd, a, b] = argv;
  if (cmd === 'check') {
    const r = check(path.resolve(a || '.'));
    if (!r.profile) {
      console.log(r.proposal
        ? `profile: none (proposed: ${r.proposal}; add "profile": "${r.proposal}" to .moskills.json)`
        : 'profile: none');
      return 0;
    }
    for (const i of r.issues) console.log(`profile: ${i}`);
    for (const w of r.warnings) console.log(`profile: warning: ${w}`);
    if (!r.issues.length) console.log(`profile: ${r.profile}, ${r.matched} plugin(s) match`);
    return r.issues.length ? 1 : 0;
  }
  if (cmd === 'merge-manifest') { mergeManifest(a, b); return 0; }
  if (cmd === 'settings') {
    try {
      const r = writeSettings(path.resolve(a || '.'));
      if (r.written) console.log(`Profile: enabledPlugins written to .claude/settings.json (${r.plugins.length} plugin(s))`);
      return 0;
    } catch (e) { console.log(`WARN: profile: ${e.message}`); return 1; }
  }
  console.error('usage: profile.cjs check <target> | merge-manifest <old> <new> | settings <target>');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { satisfies, resolve, installed, enabled, check, propose, mergeManifest, writeSettings, presetNames };
