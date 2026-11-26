'use strict';
// moskills ste-lint: checks the countable STE80 rules (docs/ste80.md) in Markdown.
// Errors: S1 (20 words per numbered step), S2 (25 words per other sentence), S7 (banned term).
// Warnings: S3 (6 sentences per paragraph), S4 (two actions), S5 (not imperative), S6 (passive).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { lintText } = require('../lib/ste-lint.cjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'moskills ste lint '));
test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const words = (n, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const rules = (text, opts) => lintText(text, opts).map((f) => `${f.line}:${f.rule}:${f.level}`);

test('S1: a numbered step has 20 words or fewer', () => {
  assert.deepEqual(rules(`1. Run ${words(19)}.\n`), []);
  assert.deepEqual(rules(`\n1. Run ${words(20)}.\n`), ['2:S1:error']);
  assert.match(lintText(`1. Run ${words(20)}.\n`)[0].message, /21 words \(max 20\)/);
});

test('S2: any other sentence has 25 words or fewer, bullets included', () => {
  assert.deepEqual(rules(`It ${words(24)}.\n`), []);
  assert.deepEqual(rules(`It ${words(25)}.\n`), ['1:S2:error']);
  assert.deepEqual(rules(`- It ${words(22)}.\n`), [], 'a bullet is a description: 23 words pass');
  assert.deepEqual(rules(`- It ${words(25)}.\n`), ['1:S2:error']);
});

test('sentences split at end punctuation; a code span, link or URL counts as one word', () => {
  assert.deepEqual(rules(`1. Run ${words(14)}. Then check ${words(14)}.\n`), []);
  assert.deepEqual(rules(`1. Run \`${words(30, 'x')}\` now.\n`), []);
  assert.deepEqual(rules(`1. Read [${words(30, 'x')}](https://a.test/b) now.\n`), []);
  assert.deepEqual(rules(`1. Open https://a.test/${words(3, 'p')} now.\n`), []);
  assert.deepEqual(rules(`1. Use e.g. this and i.e. that, not vs. ${words(10)}.\n`), [], 'abbreviations do not end a sentence');
});

test('skips frontmatter, code blocks, tables, quotes, headings and comments', () => {
  const long = `It ${words(30)}.`;
  const text = [
    '---', `description: "${long}"`, '---',
    `# ${long}`,
    '```', long, '```',
    `| ${long} | x |`,
    `> ${long}`,
    `<!-- ${long} -->`,
    '<!--', long, '-->',
  ].join('\n');
  assert.deepEqual(rules(text), []);
});

test('skips Why and Rationale sections until the next heading of the same or higher level', () => {
  const long = `It ${words(30)}.`;
  const text = `## Why\n\n${long}\n\n### Detail\n\n${long}\n\n## Steps\n\n${long}\n`;
  assert.deepEqual(rules(text), ['11:S2:error']);
  assert.deepEqual(rules(`## Rationale\n\n${long}\n`), []);
});

test('S3: a paragraph has 6 sentences or fewer, across wrapped lines', () => {
  const s = 'It is short.';
  assert.deepEqual(rules(`${s} ${s} ${s}\n${s} ${s} ${s}\n`), []);
  assert.deepEqual(rules(`${s} ${s} ${s}\n${s} ${s} ${s}\n${s}\n`), ['1:S3:warning']);
});

test('S4: a numbered step with two actions is a warning', () => {
  assert.deepEqual(rules('1. Run the tests, then commit the change.\n'), ['1:S4:warning']);
  assert.deepEqual(rules('1. Run the tests; commit the change.\n'), ['1:S4:warning']);
  assert.deepEqual(rules('1. Run the tests.\n'), []);
});

test('S5: a numbered step that is not an imperative is a warning', () => {
  assert.deepEqual(rules('1. Running the tests first.\n'), ['1:S5:warning']);
  assert.deepEqual(rules('1. You open the file.\n'), ['1:S5:warning']);
  assert.ok(rules('1. The tests should be run.\n').includes('1:S5:warning'));
});

test('S6: a passive sentence is a warning', () => {
  assert.deepEqual(rules('The file is written by the hook.\n'), ['1:S6:warning']);
  assert.deepEqual(rules('The hook writes the file.\n'), []);
});

test('S7: a term from the avoid list is an error, outside code spans only', () => {
  const terms = [{ avoid: 'session', use: 'run' }];
  assert.deepEqual(rules('Start a new Session now.\n', { terms }), ['1:S7:error']);
  assert.match(lintText('Start a new session now.\n', { terms })[0].message, /"session".*"run"/);
  assert.deepEqual(rules('Start `session` now. Obsessions stay.\n', { terms }), []);
});

function cli(args, opts = {}) {
  const r = spawnSync(process.execPath, [path.join(root, 'lib/ste-lint.cjs'), ...args],
    { encoding: 'utf8', timeout: 60000, cwd: opts.cwd || scratch });
  assert.ifError(r.error);
  return r;
}

test('CLI: prints path:line findings and a summary; errors exit 1, --warn exits 0', () => {
  const file = path.join(scratch, 'a.md');
  fs.writeFileSync(file, `1. Run ${words(25)}.\n\nThe file is written by the hook.\n`);
  const r = cli(['a.md']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^a\.md:1: S1 error: 26 words \(max 20\)/m);
  assert.match(r.stdout, /^a\.md:3: S6 warning:/m);
  assert.match(r.stdout, /^ste-lint: 1 error, 1 warning in 1 file$/m);
  assert.equal(cli(['--warn', 'a.md']).status, 0);
});

test('CLI: --avoid adds a banned term; a clean file exits 0', () => {
  const file = path.join(scratch, 'b.md');
  fs.writeFileSync(file, 'Start a session.\n');
  assert.equal(cli(['b.md']).status, 0);
  const r = cli(['--avoid', 'session=run', 'b.md']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /S7 error/);
});

test('CLI: no file or a missing file exits 2 with usage', () => {
  assert.equal(cli([]).status, 2);
  const r = cli(['nope.md']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nope\.md/);
});

test('moskills ste-lint runs the same checker', () => {
  fs.writeFileSync(path.join(scratch, 'c.md'), `1. Run ${words(25)}.\n`);
  const r = spawnSync('sh', [path.join(root, 'moskills'), 'ste-lint', 'c.md'], { cwd: scratch, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /c\.md:1: S1 error/);
});

// Warning mode for the repo: errors in the skills and the standard may not grow.
// Step 3 of the STE80 plan rewrites them and sets this to 0, then the lint turns strict.
const BASELINE_ERRORS = require('./ste-lint-baseline.json').errors;
test(`repo skills and managed standard: STE80 errors stay at or below the baseline`, () => {
  const dirs = ['templates/claude/skills', 'templates/managed'];
  const files = [];
  for (const d of dirs) {
    for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const f = path.join(d, entry.name, 'SKILL.md');
        if (fs.existsSync(path.join(root, f))) files.push(f);
      } else if (entry.name.endsWith('.md')) files.push(path.join(d, entry.name));
    }
  }
  assert.ok(files.length >= 15, `expected the skills and the standard, got ${files.length}`);
  let errors = 0;
  for (const f of files) errors += lintText(fs.readFileSync(path.join(root, f), 'utf8')).filter((x) => x.level === 'error').length;
  assert.ok(errors <= BASELINE_ERRORS, `STE80 errors grew: ${errors} > baseline ${BASELINE_ERRORS}. Run: moskills ste-lint ${dirs.join(' ')}`);
});
