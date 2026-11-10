"""Claude Code auto-update for the moskills marketplace.

usage: claude-settings.py check|enable|source <settings.json> <known_marketplaces.json>
check:  exit 0 when auto-update is on, 1 when off.
enable: set extraKnownMarketplaces.moskills.autoUpdate = true in the user
        settings, keeping every other key (and an existing moskills source).
source: print where the moskills marketplace installs from ("github Mouad1/moskills",
        "directory <path>", "git <url>"); exit 0 for the GitHub repository,
        4 for anything else, 1 when no moskills marketplace is registered.
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


def describe(src):
    kind = src.get("source", "")
    where = src.get("repo") or src.get("url") or src.get("path") or ""
    return ("%s %s" % (kind, where)).strip()


def official(src):
    kind = src.get("source")
    if kind == "github":
        return (src.get("repo") or "").lower() == "mouad1/moskills"
    if kind in ("git", "url"):
        url = (src.get("url") or "").lower().rstrip("/")
        return url.endswith("github.com/mouad1/moskills") or url.endswith("github.com/mouad1/moskills.git")
    return False


def source(settings, known):
    """The registered marketplace wins; settings only declare one to add."""
    for path, pick in ((known, lambda d: d.get("moskills")),
                       (settings, lambda d: (d.get("extraKnownMarketplaces") or {}).get("moskills"))):
        try:
            entry = pick(load(path)) or {}
        except ValueError:
            continue
        src = entry.get("source")
        if isinstance(src, dict) and src:
            print(describe(src))
            return 0 if official(src) else 4
    return 1


def main():
    mode, settings, known = sys.argv[1:4]
    if mode == "source":
        return source(settings, known)
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
