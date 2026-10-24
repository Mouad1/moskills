'use strict';
// moskills dashboard — start the panel host with the core panels plus any --panels folders.
const path = require('node:path');
const { startPanelHost } = require('./panel-host.cjs');

const HELP = `Usage: moskills dashboard [--target <dir>] [--panels <dir>]... [--port <n>] [--title <text>] [--no-core]

Local dashboard (127.0.0.1 only) made of plug-in panels. A panel is a folder with
panel.json + a module exporting render(ctx). See docs/panel-host.md.

  --target <dir>   project the panels read (default: current folder)
  --panels <dir>   extra panels: a panel folder, or a folder of panel folders (repeatable)
  --port <n>       port (default 4050; 0 = any free port)
  --title <text>   page title (default: "Dashboard")
  --no-core        skip the built-in moskills panels (runs)
`;

function parse(argv) {
  const opts = { target: process.cwd(), panels: [], port: 4050, title: 'Dashboard', core: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--target') opts.target = path.resolve(next());
    else if (a === '--panels') opts.panels.push(path.resolve(next()));
    else if (a === '--port') opts.port = Number.parseInt(next(), 10);
    else if (a === '--title') opts.title = next();
    else if (a === '--no-core') opts.core = false;
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) throw new Error('--port must be 0–65535');
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parse(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }
  const panelDirs = [...(opts.core ? [path.join(__dirname, 'panels')] : []), ...opts.panels];
  const host = await startPanelHost({ targetDir: opts.target, panelDirs, port: opts.port, title: opts.title });
  process.stdout.write(`Dashboard: http://127.0.0.1:${host.port}/  (${host.panels.length} panels)\n`);
  for (const s of host.skipped) process.stderr.write(`  skipped ${s.panel}: ${s.reason}\n`);
  const stop = () => host.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  process.stderr.write(`Dashboard error: ${err.message}\n`);
  process.exit(1);
});
