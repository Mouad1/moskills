'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXTENSIONS = [
  '',
  '.js',
  '.cjs',
  '.mjs',
  '.json',
  '/index.js',
  '/index.cjs',
  '/index.mjs',
  '/index.json'
];

/**
 * Remove comments from code so commented out imports/requires are ignored
 */
function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
}

/**
 * Resolve a relative specifier against the source file's directory
 */
function resolveRelativeImport(sourceFile, specifier, rootDir) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null; // External npm or Node core module
  }

  const dir = path.dirname(sourceFile);
  const basePath = path.resolve(dir, specifier);

  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const resolved = path.resolve(candidate);
        if (rootDir) {
          const rootResolved = path.resolve(rootDir);
          if (!resolved.startsWith(rootResolved)) {
            return null; // Outside project root boundary
          }
        }
        return resolved;
      }
    } catch {
      // Ignore stat or access errors
    }
  }

  return null;
}

/**
 * Extract all require and import specifiers from source content
 */
function extractSpecifiers(content) {
  const clean = stripComments(content);
  const specifiers = new Set();

  // CommonJS: require('...')
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = cjsRegex.exec(clean)) !== null) {
    specifiers.add(match[1]);
  }

  // Dynamic import: import('...')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(clean)) !== null) {
    specifiers.add(match[1]);
  }

  // Static ESM import / export: import ... from '...' or export ... from '...'
  const esmRegex = /(?:import|export)\s*(?:(?:\{[^}]*\}|\*\s*as\s*[^;]+|[\w$]+)\s*from\s*)?['"]([^'"]+)['"]/g;
  while ((match = esmRegex.exec(clean)) !== null) {
    specifiers.add(match[1]);
  }

  return Array.from(specifiers);
}

/**
 * Recursively scan all local dependencies of a file
 * @param {string} filePath - Absolute or relative path to the entry file
 * @param {Object} options - { rootDir?: string, visited?: Set<string> }
 * @returns {Set<string>} - Set of absolute file paths
 */
function scanFileDependencies(filePath, options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : null;
  const visited = options.visited || new Set();
  const results = new Set();

  const absPath = path.resolve(filePath);
  if (visited.has(absPath)) {
    return results;
  }
  visited.add(absPath);

  if (!fs.existsSync(absPath)) {
    return results;
  }

  try {
    if (!fs.statSync(absPath).isFile()) {
      return results;
    }
  } catch {
    return results;
  }

  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return results;
  }

  const specifiers = extractSpecifiers(content);
  for (const spec of specifiers) {
    const resolved = resolveRelativeImport(absPath, spec, rootDir);
    if (resolved && !visited.has(resolved)) {
      results.add(resolved);
      const childDeps = scanFileDependencies(resolved, { rootDir, visited });
      for (const cd of childDeps) {
        results.add(cd);
      }
    } else if (resolved) {
      results.add(resolved);
    }
  }

  // Ensure a file is not considered its own dependency
  results.delete(absPath);
  return results;
}

/**
 * Resolve all local dependencies for a list of entry files, including the files themselves
 * @param {string[]} filePaths - Array of entry file paths
 * @param {Object} options - { rootDir?: string }
 * @returns {string[]} - Sorted list of deduplicated absolute file paths
 */
function resolveAllDependencies(filePaths = [], options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : null;
  const all = new Set();
  const visited = new Set();

  for (const f of filePaths) {
    const abs = path.resolve(f);
    if (fs.existsSync(abs)) {
      try {
        if (fs.statSync(abs).isFile()) {
          all.add(abs);
          const deps = scanFileDependencies(abs, { rootDir, visited });
          for (const d of deps) {
            all.add(d);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return Array.from(all).sort();
}

module.exports = {
  scanFileDependencies,
  resolveAllDependencies,
  extractSpecifiers,
  resolveRelativeImport
};
