#!/usr/bin/env node
'use strict';
// STE80 lint: the countable rules of docs/ste80.md, for Markdown files.
// Errors:   S1 numbered step > 20 words, S2 other sentence > 25 words, S7 banned term.
// Warnings: S3 paragraph > 6 sentences, S4 two actions in a step, S5 step not imperative, S6 passive.
// Skips frontmatter, code blocks, tables, quotes, headings, HTML comments, and Why/Rationale sections.
// A code span, link, wikilink or URL counts as one word. Zero dependencies.
const fs = require('node:fs');
const path = require('node:path');

const LIMIT = { step: 20, bullet: 25, para: 25 };
const MAX_SENTENCES = 6;
const NOT_IMPERATIVE = new Set(['the', 'this', 'that', 'these', 'those', 'it', 'you', 'we', 'there', 'a', 'an']);
const NOT_PARTICIPLE = new Set(['often', 'even', 'open', 'seven', 'eleven', 'then', 'when', 'token', 'listen', 'citizen', 'kitten']);
const PARTICIPLE = /^(?:\w+ed|\w+en|made|done|run|set|kept|built|sent|found|given|shown|written|taken|seen|held|put|read|paid|left|told|sold|lost|meant|caught|taught|brought|bought|thought)$/i;
const BE = /\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?([A-Za-z]+)\b/gi;

// replace a match by one word, keeping its line breaks so line numbers stay right
const oneWord = (w) => (m) => w + '\n'.repeat((m.match(/\n/g) || []).length);

function normalize(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, oneWord(' '))
    .replace(/`[^`]*`/g, oneWord('X'))
    .replace(/\[\[[^\]]*\]\]/g, oneWord('X'))
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, oneWord('X'))
    .replace(/https?:\/\/\S+/g, 'X')
    .replace(/<\/?[a-z][^>]*>/gi, oneWord('X'))
    .replace(/\*\*|__|(?<=\s|^)[*_]|[*_](?=\s|$|[.,;:!?])/gm, '')
    .replace(/\b(e\.g|i\.e|vs|etc|cf|approx)\./gi, (m, a) => a.replace(/\./g, ''));
}

// Markdown -> units: { kind: 'step' | 'bullet' | 'para', segs: [{ line, text }] }
function units(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  let fence = null;
  let comment = false;
  let skipLevel = 0;
  let i = 0;
  const flush = () => { cur = null; };
  if (lines[0] === '---') {
    for (i = 1; i < lines.length && lines[i] !== '---'; i++);
    i++;
  }
  for (; i < lines.length; i++) {
    let raw = lines[i];
    const n = i + 1;
    if (fence) { if (raw.trim().startsWith(fence)) fence = null; continue; }
    const f = raw.match(/^\s*(```|~~~)/);
    if (f) { fence = f[1]; flush(); continue; }
    if (comment) { if (raw.includes('-->')) { comment = false; raw = raw.slice(raw.indexOf('-->') + 3); } else continue; }
    raw = raw.replace(/<!--.*?-->/g, ' ');
    if (raw.includes('<!--')) { comment = true; raw = raw.slice(0, raw.indexOf('<!--')); }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && /^(why|rationale)\b/i.test(h[2].replace(/[*_`]/g, '').trim())) skipLevel = level;
      continue;
    }
    if (skipLevel) continue;
    if (!raw.trim()) { flush(); continue; }
    if (/^\s*[|>]/.test(raw)) { flush(); continue; }
    const li = raw.match(/^(\s*)(\d+[.)]|[-*+])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (li) {
      cur = { kind: /\d/.test(li[2]) ? 'step' : 'bullet', segs: [{ line: n, text: li[3] }] };
      out.push(cur);
      continue;
    }
    if (cur && (cur.kind === 'para' || /^\s+/.test(raw))) { cur.segs.push({ line: n, text: raw.trim() }); continue; }
    cur = { kind: 'para', segs: [{ line: n, text: raw.trim() }] };
    out.push(cur);
  }
  return out;
}

// split a unit into sentences, each with the line it starts on.
// The unit's lines are consecutive, so a sentence's line is the first line plus the breaks before it.
const CLOSERS = '"\'\u201d\u2019)]*_';
function sentences(unit) {
  const joined = normalize(unit.segs.map((s) => s.text).join('\n'));
  const first = unit.segs[0].line;
  const lineAt = (pos) => first + (joined.slice(0, pos).match(/\n/g) || []).length;
  const out = [];
  let begin = 0;
  for (let k = 0; k <= joined.length; k++) {
    let stop = k;
    if (k < joined.length) {
      if (!'.!?'.includes(joined[k])) continue;
      while (stop + 1 < joined.length && CLOSERS.includes(joined[stop + 1])) stop++;
      if (stop + 1 < joined.length && !/\s/.test(joined[stop + 1])) continue;
    }
    const textPart = joined.slice(begin, k === joined.length ? k : stop + 1);
    const lead = textPart.length - textPart.trimStart().length;
    const sentence = textPart.trim().replace(/\s+/g, ' ');
    if (/[A-Za-z0-9]/.test(sentence)) out.push({ text: sentence, line: lineAt(begin + lead) });
    begin = stop + 1;
    k = stop;
  }
  return out;
}

const wordCount = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
const excerpt = (s, n = 8) => { const w = s.split(/\s+/); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function lintText(text, opts = {}) {
  const terms = (opts.terms || []).map((t) => ({ ...t, re: new RegExp(`\\b${escapeRe(t.avoid)}\\b`, 'i') }));
  const findings = [];
  const add = (line, rule, level, message) => findings.push({ line, rule, level, message });
  for (const unit of units(text)) {
    const list = sentences(unit);
    if (unit.kind === 'para' && list.length > MAX_SENTENCES) {
      add(unit.segs[0].line, 'S3', 'warning', `${list.length} sentences in one paragraph (max ${MAX_SENTENCES})`);
    }
    list.forEach((s, idx) => {
      const n = wordCount(s.text);
      const max = LIMIT[unit.kind];
      if (n > max) add(s.line, unit.kind === 'step' ? 'S1' : 'S2', 'error', `${n} words (max ${max}): "${excerpt(s.text)}"`);
      if (unit.kind === 'step') {
        if (/,\s*(?:and\s+)?then\s|;\s+\S/i.test(s.text)) add(s.line, 'S4', 'warning', `two actions in one step: "${excerpt(s.text)}"`);
        const first = (s.text.match(/[A-Za-z']+/) || [''])[0].toLowerCase();
        if (idx === 0 && (NOT_IMPERATIVE.has(first) || (first.length > 4 && first.endsWith('ing')) ||
            /\b(?:should|must|can|will|may)\s+be\b/i.test(s.text))) {
          add(s.line, 'S5', 'warning', `not an imperative: "${excerpt(s.text)}"`);
        }
      }
      for (const m of s.text.matchAll(BE)) {
        const word = m[1].toLowerCase();
        if (PARTICIPLE.test(word) && !NOT_PARTICIPLE.has(word)) { add(s.line, 'S6', 'warning', `passive voice: "${m[0]}"`); break; }
      }
      for (const t of terms) if (t.re.test(s.text)) add(s.line, 'S7', 'error', `"${t.avoid}": use "${t.use}"`);
    });
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

function markdownFiles(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const child = path.join(p, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(child));
    else if (e.name.endsWith('.md')) out.push(child);
  }
  return out.sort();
}

const USAGE = `Usage: moskills ste-lint [--warn] [--avoid <term>=<use>]... <file.md|dir>...

Checks the countable STE80 rules (docs/ste80.md).
  Errors:   S1 numbered step over 20 words, S2 other sentence over 25 words, S7 avoided term.
  Warnings: S3 paragraph over 6 sentences, S4 two actions in a step, S5 step not imperative, S6 passive voice.
Skips frontmatter, code blocks, tables, quotes, headings, comments, and Why/Rationale sections.
A directory means every .md file under it.
Exit: 0 clean or --warn, 1 errors, 2 usage or missing file.
`;

function main(argv) {
  let warn = false;
  const terms = [];
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h' || a === 'help') { process.stdout.write(USAGE); return 0; }
    if (a === '--warn') warn = true;
    else if (a === '--avoid') {
      const v = argv[++i] || '';
      const eq = v.indexOf('=');
      if (eq < 1) { process.stderr.write(`ste-lint: --avoid needs <term>=<use>, got '${v}'\n`); return 2; }
      terms.push({ avoid: v.slice(0, eq).trim(), use: v.slice(eq + 1).trim() });
    } else if (a.startsWith('--')) { process.stderr.write(`ste-lint: unknown option ${a}\n${USAGE}`); return 2; }
    else paths.push(a);
  }
  if (!paths.length) { process.stderr.write(USAGE); return 2; }
  const files = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) { process.stderr.write(`ste-lint: not found: ${p}\n`); return 2; }
    files.push(...markdownFiles(p));
  }
  let errors = 0;
  let warnings = 0;
  for (const f of files) {
    for (const x of lintText(fs.readFileSync(f, 'utf8'), { terms })) {
      if (x.level === 'error') errors++; else warnings++;
      process.stdout.write(`${f}:${x.line}: ${x.rule} ${x.level}: ${x.message}\n`);
    }
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  process.stdout.write(`ste-lint: ${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(files.length, 'file')}\n`);
  return errors && !warn ? 1 : 0;
}

module.exports = { lintText, units, sentences };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
