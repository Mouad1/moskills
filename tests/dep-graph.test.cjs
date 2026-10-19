const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { scanFileDependencies, resolveAllDependencies } = require('../lib/dep-graph.cjs');

test('Step 1: Lightweight Dependency Graph Scanner', async (t) => {
  await t.test('resolves commonjs require and esm imports recursively', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-test-'));
    try {
      const fileA = path.join(tmpDir, 'a.cjs');
      const fileB = path.join(tmpDir, 'b.cjs');
      const fileC = path.join(tmpDir, 'c.mjs');
      const fileD = path.join(tmpDir, 'd.json');

      fs.writeFileSync(fileD, JSON.stringify({ version: '1.0.0' }));
      fs.writeFileSync(fileC, 'export const val = 42;\n');
      fs.writeFileSync(fileB, 'import { val } from "./c.mjs";\nconst data = require("./d.json");\nmodule.exports = { val, data };\n');
      fs.writeFileSync(fileA, 'const b = require("./b");\nmodule.exports = b;\n');

      const depsA = scanFileDependencies(fileA, { rootDir: tmpDir });
      assert.ok(depsA.has(fileB), 'Should contain b.cjs');
      assert.ok(depsA.has(fileC), 'Should contain c.mjs');
      assert.ok(depsA.has(fileD), 'Should contain d.json');

      const all = resolveAllDependencies([fileA], { rootDir: tmpDir });
      assert.deepEqual(all.sort(), [fileA, fileB, fileC, fileD].sort());
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('handles circular dependencies without infinite loops', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-circ-'));
    try {
      const fileA = path.join(tmpDir, 'a.js');
      const fileB = path.join(tmpDir, 'b.js');

      fs.writeFileSync(fileA, 'const b = require("./b.js");\nmodule.exports = { a: 1 };\n');
      fs.writeFileSync(fileB, 'const a = require("./a.js");\nmodule.exports = { b: 2 };\n');

      const depsA = scanFileDependencies(fileA, { rootDir: tmpDir });
      assert.ok(depsA.has(fileB));
      assert.equal(depsA.size, 1);

      const all = resolveAllDependencies([fileA], { rootDir: tmpDir });
      assert.deepEqual(all.sort(), [fileA, fileB].sort());
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('ignores external node modules and core packages', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-ext-'));
    try {
      const fileA = path.join(tmpDir, 'main.js');
      fs.writeFileSync(fileA, 'const fs = require("node:fs");\nconst path = require("path");\nimport express from "express";\n');

      const deps = scanFileDependencies(fileA, { rootDir: tmpDir });
      assert.equal(deps.size, 0, 'External packages must not be treated as local dependencies');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await t.test('resolves directory index imports', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-graph-idx-'));
    try {
      const subDir = path.join(tmpDir, 'utils');
      fs.mkdirSync(subDir);
      const indexFile = path.join(subDir, 'index.cjs');
      const mainFile = path.join(tmpDir, 'main.cjs');

      fs.writeFileSync(indexFile, 'module.exports = "helper";\n');
      fs.writeFileSync(mainFile, 'const utils = require("./utils");\n');

      const deps = scanFileDependencies(mainFile, { rootDir: tmpDir });
      assert.ok(deps.has(indexFile), 'Should resolve to utils/index.cjs');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
