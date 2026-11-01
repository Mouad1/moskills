'use strict';
// Which POSIX shell runs the moskills CLI script. macOS and Linux: `sh`.
// Native Windows: Git for Windows' sh (Claude Code on Windows needs Git for
// Windows too). C:\Windows\System32\bash.exe is skipped: it hands off to WSL,
// where Windows paths and Node differ.
const fs = require('node:fs');
const path = require('node:path');

// Commands implemented in Node; they run without any shell, on every platform.
const NODE_COMMANDS = {
  'run-state': 'run-state-cli.cjs',
  design: 'design-system.cjs',
  dashboard: 'panel-host-cli.cjs',
};

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function findShell({ platform = process.platform, env = process.env, exists = isFile } = {}) {
  if (env.MOSKILLS_SH) return env.MOSKILLS_SH;
  if (platform !== 'win32') return 'sh';
  const win = path.win32;
  const systemRoot = String(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows').toLowerCase();
  const pathVar = env.Path || env.PATH || '';
  const candidates = [];
  for (const dir of pathVar.split(';').filter(Boolean)) {
    if (win.resolve(dir).toLowerCase().startsWith(win.join(systemRoot, 'system32'))) continue;
    candidates.push(win.join(dir, 'sh.exe'), win.join(dir, 'bash.exe'));
  }
  for (const base of [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)'],
    env.LOCALAPPDATA && win.join(env.LOCALAPPDATA, 'Programs')]) {
    if (!base) continue;
    candidates.push(win.join(base, 'Git', 'bin', 'sh.exe'), win.join(base, 'Git', 'usr', 'bin', 'sh.exe'));
  }
  return candidates.find(exists) || null;
}

// How to run one check command (run-state check/wrap/auto-review): `sh -c` where
// a POSIX shell exists, else cmd.exe on Windows. Returns [file, args, extraOptions].
function commandRunner(command, opts) {
  const sh = findShell(opts);
  if (sh) return [sh, ['-c', command], {}];
  const env = (opts && opts.env) || process.env;
  return [env.ComSpec || env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { windowsVerbatimArguments: true }];
}

const NO_SHELL = 'moskills could not find a POSIX shell (sh). On Windows, install Git for Windows ' +
  '(https://git-scm.com/download/win; Claude Code on Windows needs it too), or set MOSKILLS_SH to its sh.exe, ' +
  'or run moskills inside WSL. These work without a shell: moskills run-state, moskills design, moskills dashboard.\n';

module.exports = { findShell, commandRunner, NODE_COMMANDS, NO_SHELL };
