'use strict';
// docs/rules.md: the business rules register. People own the table (ID, rule,
// measurable expectation, proof, state, source); run-state owns only the
// generated block between the markers, which shows each rule's proof status.
const fs = require('node:fs');
const path = require('node:path');

const BEGIN = '<!-- moskills:rules:begin -->';
const END = '<!-- moskills:rules:end -->';
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const STATES = ['draft', 'accepted', 'retired'];

const rulesPath = projectDir => path.join(projectDir, 'docs', 'rules.md');
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

// Rows of every table whose header starts with ID, outside the generated block.
// Null when the file does not exist.
function readRules(projectDir) {
  let text;
  try { text = fs.readFileSync(rulesPath(projectDir), 'utf8'); } catch { return null; }
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b !== -1 && e > b) text = text.slice(0, b) + text.slice(e + END.length);
  const rules = [];
  let header = null;
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) { header = null; continue; }
    const row = cells(line);
    if (/^id$/i.test(row[0])) { header = row.map(h => h.toLowerCase()); continue; }
    if (!header || !ID.test(row[0])) continue;
    const get = name => row[header.findIndex(h => h.startsWith(name))] || '';
    const state = get('state').toLowerCase();
    rules.push({ id: row[0], rule: get('rule'), expected: get('expected'), proof: get('proof'),
      state: STATES.includes(state) ? state : 'draft', source: get('source') });
  }
  return rules;
}

// Replace the generated block; append it when the markers are missing.
function writeRulesBlock(projectDir, body) {
  const file = rulesPath(projectDir);
  const text = fs.readFileSync(file, 'utf8');
  const block = `${BEGIN}\n${body}\n${END}`;
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  const next = b !== -1 && e > b
    ? text.slice(0, b) + block + text.slice(e + END.length)
    : `${text.replace(/\n*$/, '\n')}\n## Proof status\n\n${block}\n`;
  if (next !== text) fs.writeFileSync(file, next);
  return next !== text;
}

module.exports = { readRules, writeRulesBlock, rulesPath, BEGIN, END, ID };
