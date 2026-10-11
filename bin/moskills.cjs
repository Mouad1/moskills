#!/usr/bin/env node
'use strict';
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const input = process.argv.slice(2);
const args = [];
let verbose = false;
for (let i = 0; i < input.length; i++) {
  if (input[i] === '--verbose') verbose = true;
  else {
    args.push(input[i]);
    if (['--target', '--all'].includes(input[i]) && i + 1 < input.length) args.push(input[++i]);
  }
}
const help = `moskills — structured agent work, short answers.

  moskills init     Set up this project for Claude Code, Codex and compatible agents.
  moskills doctor   Check installed files and project readiness.
  moskills sync     Update project setup; preserve personal edits.
  moskills version  Show installed version.

Options: --target <path>, --with-hooks, --force, --verbose.
After setup, open your agent in this project and ask normally: "Fix this bug."
Update CLI: npm install -g moskills@latest. Remove CLI: npm uninstall -g moskills.
`;
if (!args.length || ['help', '--help', '-h'].includes(args[0]) || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(help);
  process.exit(0);
}
if (['--version', '-v'].includes(args[0])) args[0] = 'version';
if (process.platform === 'win32') {
  process.stderr.write('moskills needs a POSIX shell. Run Node/npm inside WSL, then run moskills init.\n');
  process.exit(1);
}
const command = args[0];
const blocked = ['setup', 'link', 'unlink', 'uninstall', 'self-update', 'schedule-update'];
if (blocked.includes(command)) {
  process.stderr.write(`moskills ${command} is unavailable in npm installs. Use moskills init for project setup; npm install -g moskills@latest to update; npm uninstall -g moskills to remove CLI.\n`);
  process.exit(1);
}
if (!['init', 'sync', 'doctor', 'notice', 'version'].includes(command)) {
  process.stderr.write(`moskills: unknown command '${command}'. Run moskills --help.\n`);
  process.exit(1);
}
if (['init', 'sync'].includes(command) && !args.includes('--agents')) args.push('--agents');
const result = spawnSync('sh', [path.join(__dirname, '..', 'moskills'), ...args], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  env: { ...process.env, MOSKILLS_DISTRIBUTION: 'npm' }
});
if (result.error) {
  process.stderr.write(`moskills could not start its shell: ${result.error.message}\n`);
  process.exit(1);
}
if (result.stderr) process.stderr.write(result.stderr);
if (verbose || result.status !== 0 || !['init', 'sync'].includes(command)) {
  if (result.stdout) process.stdout.write(result.stdout);
} else {
  const warnings = result.stdout.split('\n').filter(line => /^WARN:/.test(line));
  if (warnings.length) process.stdout.write(warnings.join('\n') + '\n');
  process.stdout.write(command === 'init'
    ? 'moskills ready. Open your agent in this project; ask normally.\n'
    : 'moskills synced. Run moskills doctor to check readiness.\n');
}
process.exitCode = result.status ?? (128 + (os.constants.signals[result.signal] || 1));
