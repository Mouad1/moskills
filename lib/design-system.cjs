'use strict';
// design.md: the one design file the /design-system skill writes and /preview reads.
// Plain Markdown with a few tables this module parses:
//   ## Tokens            | Token | Light | Dark | Use |
//   ### Contrast pairs   | Text | Background | Min |
//   ## Components        | Component | States | Notes |
//   ## Screens           ### Screen: <name> / Components: a, b / States: x, y
// Usage: node design-system.cjs <init|check|css> [--target <dir>] [--file <path>] [--complete] [--out <path>] [--json]
const fs = require('node:fs');
const path = require('node:path');

const SECTIONS = ['Principles', 'Tokens', 'Shell', 'Components', 'Screens'];

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim().replace(/^`|`$/g, ''));
}
function isRule(line) { return /^\s*\|?\s*:?-{3,}/.test(line); }
function list(text) { return String(text || '').split(',').map(s => s.trim()).filter(Boolean); }

function parseDesign(text) {
  const d = { sections: new Set(), tokens: new Map(), duplicates: [], pairs: [], components: new Map(), screens: [] };
  let section = '';
  let sub = '';
  let header = null;
  let screen = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^##\s+(.+?)\s*$/)) && !line.startsWith('###')) {
      section = m[1]; sub = ''; header = null; screen = null;
      d.sections.add(section);
      continue;
    }
    if ((m = line.match(/^###\s+(.+?)\s*$/))) {
      sub = m[1]; header = null; screen = null;
      const s = sub.match(/^Screen:\s*(.+)$/i);
      if (section === 'Screens' && s) { screen = { name: s[1].trim(), components: [], states: [] }; d.screens.push(screen); }
      continue;
    }
    if (screen) {
      if ((m = line.match(/^Components:\s*(.*)$/i))) screen.components = list(m[1]);
      else if ((m = line.match(/^States:\s*(.*)$/i))) screen.states = list(m[1]);
      continue;
    }
    if (!line.trim().startsWith('|')) { header = null; continue; }
    if (isRule(line)) continue;
    const row = cells(line);
    if (!header) { header = row.map(h => h.toLowerCase()); continue; }
    const get = name => row[header.indexOf(name)] || '';
    if (section === 'Tokens' && /contrast/i.test(sub) && header.includes('text')) {
      const min = parseFloat(get('min'));
      d.pairs.push({ text: get('text'), background: get('background'), min: Number.isFinite(min) ? min : 4.5 });
    } else if (section === 'Tokens' && !sub && header[0] === 'token') {
      const name = row[0];
      if (!name) continue;
      if (d.tokens.has(name)) d.duplicates.push(name);
      d.tokens.set(name, { light: get('light') || get('value'), dark: get('dark'), use: get('use') });
    } else if (section === 'Components' && header[0] === 'component') {
      if (row[0]) d.components.set(row[0], { states: list(get('states')), notes: get('notes') });
    }
  }
  return d;
}

function parseColor(value) {
  const v = String(value).trim().toLowerCase();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/))) {
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  if ((m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/))) {
    const rgb = m.slice(1, 4).map(Number);
    return rgb.every(n => n <= 255) ? rgb : null;
  }
  return null;
}
function luminance(rgb) {
  const [r, g, b] = rgb.map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const la = luminance(parseColor(a));
  const lb = luminance(parseColor(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function checkDesign(d, { complete = false } = {}) {
  const errors = [];
  const warnings = [];
  for (const s of SECTIONS) {
    if (!d.sections.has(s)) (complete && s !== 'Principles' ? errors : warnings).push(`missing section: ${s}`);
  }
  for (const name of new Set(d.duplicates)) errors.push(`${name} is defined twice in Tokens`);
  for (const [name, t] of d.tokens) {
    if (!name.startsWith('color.')) continue;
    for (const mode of ['light', 'dark']) {
      if (t[mode] && !parseColor(t[mode])) errors.push(`${name}: "${t[mode]}" is not a color (use #rgb, #rrggbb or rgb())`);
    }
  }
  for (const p of d.pairs) {
    const unknown = [p.text, p.background].filter(n => !d.tokens.has(n));
    if (unknown.length) { unknown.forEach(n => errors.push(`contrast pair uses unknown token ${n}`)); continue; }
    const tx = d.tokens.get(p.text);
    const bg = d.tokens.get(p.background);
    for (const mode of ['light', 'dark']) {
      if (mode === 'dark' && !tx.dark && !bg.dark) continue;
      const a = mode === 'dark' ? (tx.dark || tx.light) : tx.light;
      const b = mode === 'dark' ? (bg.dark || bg.light) : bg.light;
      if (!parseColor(a) || !parseColor(b)) continue; // reported above
      const ratio = contrastRatio(a, b);
      if (ratio + 1e-9 < p.min) errors.push(`${p.text} on ${p.background} (${mode}): ${ratio.toFixed(2)}:1, needs ${p.min}:1`);
    }
  }
  for (const s of d.screens) {
    for (const c of s.components) if (!d.components.has(c)) errors.push(`Screen ${s.name} uses ${c}, which is not in Components`);
    if (!s.states.length) warnings.push(`Screen ${s.name} lists no states (empty, loading, error, ready)`);
  }
  return { errors, warnings };
}

function cssName(token) { return '--' + token.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function tokensToCss(d) {
  const light = [];
  const dark = [];
  for (const [name, t] of d.tokens) {
    if (t.light) light.push(`${cssName(name)}: ${t.light};`);
    if (t.dark) dark.push(`${cssName(name)}: ${t.dark};`);
  }
  const block = (sel, decls, pad) => `${pad}${sel} {\n${decls.map(x => `${pad}  ${x}`).join('\n')}\n${pad}}`;
  const out = ['/* Generated from design.md by `moskills design css`. Edit design.md, not this file. */', block(':root', light, '')];
  if (dark.length) {
    out.push(`@media (prefers-color-scheme: dark) {\n${block(':root:not([data-theme="light"])', dark, '  ')}\n}`);
    out.push(block(':root[data-theme="dark"]', dark, ''));
  }
  return out.join('\n\n') + '\n';
}

const SKELETON = `# Design system

One file for how the product looks. \`/design-system\` keeps it, \`/preview\` reads it,
and \`moskills design check\` verifies it. Generate CSS variables with \`moskills design css\`.

## Principles

- <three to five rules, e.g. "Calm surfaces; status never shown by color alone">

## Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| color.bg | #ffffff | #0f1115 | page background |
| color.surface | #f5f6f8 | #181b21 | cards, sheets |
| color.text | #1a1d23 | #e8eaed | body text |
| color.muted | #5b6270 | #a3a9b5 | secondary text |
| color.accent | #2457d6 | #7aa2ff | links, primary actions |
| space.1 | 4px | | tight gaps |
| space.2 | 8px | | default gap |
| space.4 | 16px | | page gutter |
| radius.md | 8px | | cards, inputs |
| font.body | 16px/1.5 system-ui, sans-serif | | body text |

### Contrast pairs

| Text | Background | Min |
| --- | --- | --- |
| color.text | color.bg | 4.5 |
| color.muted | color.bg | 4.5 |
| color.accent | color.bg | 3 |

## Shell

<app frame: navigation pattern, header, safe areas, breakpoints>

## Components

| Component | States | Notes |
| --- | --- | --- |

## Screens

<one "### Screen: <name>" block per screen, each with "Components:" and "States:" lines>
`;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--complete' || k === '--json') a[k.slice(2)] = true;
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
    else a._.push(k);
  }
  return a;
}

function main(argv) {
  const a = parseArgs(argv);
  const cmd = a._[0];
  const dir = path.resolve(a.target || '.');
  const file = path.resolve(dir, a.file || 'design.md');
  const rel = path.relative(dir, file) || 'design.md';
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(`moskills design: one design file (design.md), checked and turned into CSS

Commands:
  init                 Write a design.md skeleton (never overwrites)
  check [--complete]   Check tokens, contrast pairs (WCAG) and components used by screens;
                       exit 1 on errors. --complete: missing sections are errors too
  css [--out <file>]   Print CSS variables from the tokens (light, dark media query,
                       data-theme override), or write them to a file

Options:
  --target <dir>       Project directory (default: current)
  --file <path>        Design file (default: design.md)
  --json               check: print the result as JSON
`);
    return 0;
  }
  if (cmd === 'init') {
    if (fs.existsSync(file)) { process.stderr.write(`${rel} already exists; edit it instead.\n`); return 1; }
    fs.writeFileSync(file, SKELETON);
    process.stdout.write(`Wrote ${rel}. Fill in Principles, Shell, Components and Screens, then run: moskills design check\n`);
    return 0;
  }
  if (!fs.existsSync(file)) {
    process.stderr.write(`No ${rel} here. Start one with: moskills design init (or /design-system)\n`);
    return 1;
  }
  const d = parseDesign(fs.readFileSync(file, 'utf8'));
  if (cmd === 'check') {
    const r = checkDesign(d, { complete: a.complete });
    if (a.json) {
      process.stdout.write(JSON.stringify({ file: rel, ...r, tokens: d.tokens.size, pairs: d.pairs.length,
        components: d.components.size, screens: d.screens.length }, null, 2) + '\n');
    } else if (r.errors.length) {
      process.stdout.write(`${rel}: ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}\n` +
        r.errors.map(e => `  - ${e}\n`).join('') + r.warnings.map(w => `  ! ${w}\n`).join(''));
    } else {
      const n = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
      process.stdout.write(`${rel}: OK (${n(d.tokens.size, 'token')}, ${n(d.pairs.length, 'contrast pair')}, ` +
        `${n(d.components.size, 'component')}, ${n(d.screens.length, 'screen')})\n` + r.warnings.map(w => `  ! ${w}\n`).join(''));
    }
    return r.errors.length ? 1 : 0;
  }
  if (cmd === 'css') {
    const css = tokensToCss(d);
    if (a.out) {
      const out = path.resolve(dir, a.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, css);
      process.stdout.write(`Wrote ${path.relative(dir, out)} (${d.tokens.size} tokens).\n`);
    } else process.stdout.write(css);
    return 0;
  }
  process.stderr.write(`Unknown command '${cmd}'. Run: moskills design help\n`);
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { parseDesign, parseColor, contrastRatio, checkDesign, tokensToCss, SKELETON, main };
