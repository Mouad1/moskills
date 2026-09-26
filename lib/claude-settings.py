"""Claude Code auto-update for the moskills marketplace.

usage: claude-settings.py check|enable <settings.json> <known_marketplaces.json>
check:  exit 0 when auto-update is on, 1 when off.
enable: set extraKnownMarketplaces.moskills.autoUpdate = true in the user
        settings, keeping every other key (and an existing moskills source).
Exit 3 when the settings file is not valid JSON: it is never rewritten then.
"""
import json
import os
import sys


def load(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return {}
    with open(path) as f:
        return json.load(f)


def main():
    mode, settings, known = sys.argv[1:4]
    try:
        data = load(settings)
    except ValueError:
        return 3
    if mode == "check":
        entry = (data.get("extraKnownMarketplaces") or {}).get("moskills") or {}
        on = entry.get("autoUpdate") is True
        try:
            on = on or ((load(known).get("moskills") or {}).get("autoUpdate") is True)
        except ValueError:
            pass
        return 0 if on else 1
    entry = data.setdefault("extraKnownMarketplaces", {}).setdefault("moskills", {})
    entry.setdefault("source", {"source": "github", "repo": "Mouad1/moskills"})
    entry["autoUpdate"] = True
    os.makedirs(os.path.dirname(settings) or ".", exist_ok=True)
    tmp = settings + ".moskills.tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, settings)
    return 0


sys.exit(main())
