// Node fallback for claude-settings.py (same usage, same exit codes).
const fs = require("fs");
const path = require("path");

const [mode, settings, known] = process.argv.slice(2);
const load = (p) =>
  fs.existsSync(p) && fs.statSync(p).size > 0 ? JSON.parse(fs.readFileSync(p, "utf8")) : {};

if (mode === "source") {
  const describe = (s) => `${s.source || ""} ${s.repo || s.url || s.path || ""}`.trim();
  const official = (s) => {
    if (s.source === "github") return String(s.repo || "").toLowerCase() === "mouad1/moskills";
    if (s.source === "git" || s.source === "url") {
      const u = String(s.url || "").toLowerCase().replace(/\/$/, "");
      return u.endsWith("github.com/mouad1/moskills") || u.endsWith("github.com/mouad1/moskills.git");
    }
    return false;
  };
  const picks = [[known, (d) => d.moskills], [settings, (d) => (d.extraKnownMarketplaces || {}).moskills]];
  for (const [p, pick] of picks) {
    let entry;
    try { entry = pick(load(p)) || {}; } catch (e) { continue; }
    if (entry.source && typeof entry.source === "object" && Object.keys(entry.source).length) {
      console.log(describe(entry.source));
      process.exit(official(entry.source) ? 0 : 4);
    }
  }
  process.exit(1);
}

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
