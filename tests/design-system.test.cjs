'use strict';
// design.md is the one design file /design-system writes and /preview reads.
// `moskills design` checks it (tokens, contrast, components used by screens)
// and turns its tokens into CSS variables.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills design '));
const env = { ...process.env, MOSKILLS_NO_UPDATE_CHECK: '1' };
delete env.MOSKILLS_DISTRIBUTION;
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const { parseDesign, contrastRatio, checkDesign, tokensToCss } = require('../lib/design-system.cjs');

const GOOD = `# Design system

## Principles

Calm and clear.

## Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| color.bg | #ffffff | #0f1115 | page background |
| color.text | #1a1d23 | #e8eaed | body text |
| color.muted | #5b6270 | #a3a9b5 | secondary text |
| color.accent | #2457d6 | #7aa2ff | links, primary button |
| space.2 | 8px | | gaps |
| radius.md | 8px | | cards |

### Contrast pairs

| Text | Background | Min |
| --- | --- | --- |
| color.text | color.bg | 4.5 |
| color.muted | color.bg | 4.5 |
| color.accent | color.bg | 3 |

## Shell

Bottom tab bar on phones, side rail from 768px.

## Components

| Component | States | Notes |
| --- | --- | --- |
| Button | default, pressed, focus, disabled, loading | primary uses color.accent |
| RouteCard | default, selected, loading | |

## Screens

### Screen: Home

Components: Button, RouteCard
States: empty, loading, error, ready
`;

function project(name, design) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  if (design !== undefined) fs.writeFileSync(path.join(dir, 'design.md'), design);
  return dir;
}
function cli(dir, args) {
  return spawnSync('sh', [path.join(root, 'moskills'), 'design', ...args, '--target', dir],
    { env, encoding: 'utf8', timeout: 60000 });
}

test('contrast ratio follows WCAG', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 10) / 10, 21);
  assert.equal(contrastRatio('#fff', '#ffffff'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.01);
  assert.ok(Math.abs(contrastRatio('rgb(118, 118, 118)', '#fff') - 4.54) < 0.01);
});

test('parse reads tokens, pairs, components and screens', () => {
  const d = parseDesign(GOOD);
  assert.equal(d.tokens.get('color.bg').light, '#ffffff');
  assert.equal(d.tokens.get('color.bg').dark, '#0f1115');
  assert.equal(d.tokens.get('space.2').dark, '');
  assert.deepEqual(d.pairs[2], { text: 'color.accent', background: 'color.bg', min: 3 });
  assert.deepEqual(d.components.get('Button').states, ['default', 'pressed', 'focus', 'disabled', 'loading']);
  assert.deepEqual(d.screens[0], { name: 'Home', components: ['Button', 'RouteCard'], states: ['empty', 'loading', 'error', 'ready'] });
  assert.deepEqual([...d.sections].sort(), ['Components', 'Principles', 'Screens', 'Shell', 'Tokens']);
});

test('a well-formed design passes', () => {
  const r = checkDesign(parseDesign(GOOD), { complete: true });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('check reports failing contrast in light and dark', () => {
  const bad = GOOD.replace('| color.muted | #5b6270 | #a3a9b5 |', '| color.muted | #b0b0b0 | #3a3d44 |');
  const r = checkDesign(parseDesign(bad));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /color\.muted on color\.bg \(light\): [0-9.]+:1, needs 4\.5:1/);
  assert.match(r.errors[1], /\(dark\)/);
});

test('check reports bad values, duplicates, unknown tokens and undeclared components', () => {
  const bad = GOOD
    .replace('| color.accent | #2457d6 |', '| color.accent | blue-ish |')
    .replace('| space.2 | 8px | | gaps |', '| space.2 | 8px | | gaps |\n| space.2 | 12px | | again |')
    .replace('| color.accent | color.bg | 3 |', '| color.accent | color.bg | 3 |\n| color.link | color.bg | 4.5 |')
    .replace('Components: Button, RouteCard', 'Components: Button, RouteCard, MapView');
  const errors = checkDesign(parseDesign(bad)).errors.join('\n');
  assert.match(errors, /color\.accent: "blue-ish" is not a color/);
  assert.match(errors, /space\.2 is defined twice/);
  assert.match(errors, /contrast pair uses unknown token color\.link/);
  assert.match(errors, /Screen Home uses MapView, which is not in Components/);
});

test('missing sections are warnings, or errors with --complete', () => {
  const partial = GOOD.slice(0, GOOD.indexOf('## Shell'));
  assert.deepEqual(checkDesign(parseDesign(partial)).errors, []);
  assert.match(checkDesign(parseDesign(partial)).warnings.join('\n'), /missing section: Shell/);
  assert.match(checkDesign(parseDesign(partial), { complete: true }).errors.join('\n'), /missing section: Components/);
});

test('css output has light tokens, a dark media query and a data-theme override', () => {
  const css = tokensToCss(parseDesign(GOOD));
  assert.match(css, /:root \{\n  --color-bg: #ffffff;/);
  assert.match(css, /--space-2: 8px;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme="light"\]\) \{\n    --color-bg: #0f1115;/);
  assert.match(css, /:root\[data-theme="dark"\] \{\n  --color-bg: #0f1115;/);
  assert.doesNotMatch(css, /--space-2: ;/);
});

test('cli: init writes a skeleton once, check gates, css writes a file', () => {
  const dir = project('cli');
  let r = cli(dir, ['init']);
  assert.equal(r.status, 0, r.stderr);
  const skeleton = fs.readFileSync(path.join(dir, 'design.md'), 'utf8');
  for (const h of ['## Principles', '## Tokens', '### Contrast pairs', '## Shell', '## Components', '## Screens'])
    assert.ok(skeleton.includes(h), h);
  assert.equal(cli(dir, ['init']).status, 1, 'init must not overwrite');
  assert.equal(cli(dir, ['check']).status, 0, 'the skeleton itself passes');

  fs.writeFileSync(path.join(dir, 'design.md'), GOOD.replace('#5b6270', '#d0d0d0'));
  r = cli(dir, ['check']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /design\.md: 1 error/);

  fs.writeFileSync(path.join(dir, 'design.md'), GOOD);
  r = cli(dir, ['check', '--complete']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /design\.md: OK \(6 tokens, 3 contrast pairs, 2 components, 1 screen\)/);

  r = cli(dir, ['css', '--out', 'src/tokens.css']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(dir, 'src/tokens.css'), 'utf8'), /--color-accent: #2457d6;/);
});

test('cli: check without design.md says how to start', () => {
  const r = cli(project('none'), ['check']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No design\.md.*moskills design init/);
});

test('design-system skill ships and preview reads design.md', () => {
  const skill = fs.readFileSync(path.join(root, 'templates/claude/skills/design-system/SKILL.md'), 'utf8');
  assert.match(skill, /^name: design-system$/m);
  assert.match(skill, /Primary goal: Keep one design file/);
  for (const needle of ['design.md', 'tokens', 'shell', 'components', 'screen', 'moskills design check', 'moskills design css', '/preview'])
    assert.ok(skill.includes(needle), needle);
  assert.match(fs.readFileSync(path.join(root, 'templates/claude/commands/design-system.md'), 'utf8'), /`design-system` skill/);
  assert.match(fs.readFileSync(path.join(root, 'templates/claude/skills/preview/SKILL.md'), 'utf8'), /design\.md/);
});
