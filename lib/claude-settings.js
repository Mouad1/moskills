// Node fallback for claude-settings.py (same usage, same exit codes).
const fs = require("fs");
const path = require("path");

const [mode, settings, known] = process.argv.slice(2);
const load = (p) =>
  fs.existsSync(p) && fs.statSync(p).size > 0 ? JSON.parse(fs.readFileSync(p, "utf8")) : {};

let data;
try {
  data = load(settings);
} catch (e) {
  process.exit(3);
}

if (mode === "check") {
  let on = ((data.extraKnownMarketplaces || {}).moskills || {}).autoUpdate === true;
  try {
    on = on || ((load(known).moskills || {}).autoUpdate === true);
  } catch (e) {}
  process.exit(on ? 0 : 1);
}

data.extraKnownMarketplaces = data.extraKnownMarketplaces || {};
const entry = (data.extraKnownMarketplaces.moskills = data.extraKnownMarketplaces.moskills || {});
entry.source = entry.source || { source: "github", repo: "Mouad1/moskills" };
entry.autoUpdate = true;
fs.mkdirSync(path.dirname(settings), { recursive: true });
fs.writeFileSync(settings + ".moskills.tmp", JSON.stringify(data, null, 2) + "\n");
fs.renameSync(settings + ".moskills.tmp", settings);
