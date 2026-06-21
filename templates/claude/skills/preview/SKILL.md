---
name: preview
description: "Use when: turning a vague idea into a concrete design before coding. Runs before /align-intent. Explores scope, approaches, and tradeoffs through dialogue, then produces a written spec."
---

# Preview

Primary goal: Crystallise an idea into an approved spec before any code is written.

<HARD-GATE>
Do NOT write code, invoke implementation skills, or scaffold anything until the user has approved the design. No exceptions for "simple" requests.
</HARD-GATE>

## Steps

1. **Explore context** — read project files, docs, recent commits.
2. **Detect frontend** — check rules below; start Visual Companion if triggered.
3. **Ask clarifying questions** — one at a time, max five. Prefer multiple choice.
4. **Propose 2–3 approaches** — with tradeoffs; lead with your recommendation.
5. **Present design** — section by section, get approval after each section.
6. **Write spec** — save to `docs/specs/YYYY-MM-DD-<topic>.md` and commit.
7. **Self-review spec** — scan for placeholders, contradictions, ambiguity, scope creep; fix inline.
8. **User reviews spec** — wait for approval before proceeding.
9. **Hand off** — invoke `/align-intent` to lock intent before coding starts.

## Visual Companion

Requires Node.js. Scripts are bundled in `.claude/skills/preview/scripts/` — no external plugin needed.

### When to auto-start (no consent)

**Start automatically when ANY is true:**

- Project has: `*.component.ts`, `*.html`, `*.css`, `*.scss`, `angular.json`, `tailwind.config.*`, or `package.json` with Angular / React / Vue dependency
- Working directory has: `src/app/`, `src/pages/`, `src/components/`
- Request mentions: UI, page, component, layout, design, mockup, wireframe, dashboard, form, navigation, theme, interface, frontend

For pure backend / CLI / infra: offer once with consent, do not auto-start.

### Session resume — check BEFORE starting a new server

```bash
# 1. Find existing session
SERVER_INFO_PATH=$(find .preview/ -name "server-info" 2>/dev/null | sort -r | head -1)
```

If found:

```bash
# 2. Read port
PORT=$(grep -o '"port":[0-9]*' "$SERVER_INFO_PATH" | grep -o '[0-9]*')

# 3. Check liveness
curl -s --max-time 2 "http://localhost:${PORT}/health" || echo "dead"
```

- **Alive** → resume. Parse `screen_dir` and `state_dir` from the same JSON. List `$SCREEN_DIR/*.html` sorted by mtime. Tell user: `"Active session at http://localhost:<port>. Previous mockups: [list]"`. Read `$STATE_DIR/events` to restore context.
- **Dead but file exists** → restart (mockups preserved in `.preview/`):
  ```bash
  sh .claude/skills/preview/scripts/start-server.sh --project-dir "$(pwd)"
  ```
  Then show summary.
- **No file found** → start fresh.

### Start server (fresh)

```bash
sh .claude/skills/preview/scripts/start-server.sh --project-dir "$(pwd)"
# Returns JSON: {"port":52341,"url":"http://localhost:52341",
#   "screen_dir":"<project>/.preview/<id>/content",
#   "state_dir":"<project>/.preview/<id>/state"}
```

Save `screen_dir` and `state_dir`. Tell user to open the URL.

### Write a mockup

Write an HTML fragment (not a full document) to `$SCREEN_DIR/<name>.html`. The server wraps it with chrome and reloads the browser automatically.

```html
<!-- example fragment -->
<div style="display:flex;gap:24px;padding:24px">
  <div class="option" data-choice="A" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Side panel</h3><p>Nav on left, content right.</p></div>
  </div>
  <div class="option" data-choice="B" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content"><h3>Full-width</h3><p>Top nav, full content below.</p></div>
  </div>
</div>
```

Only write a full `<!DOCTYPE html>` document when complete control over the page is required.

### Read user selections

```bash
cat "$STATE_DIR/events" 2>/dev/null | tail -5
```

### Stop server when done

```bash
# SESSION_DIR is the parent of state_dir
SESSION_DIR=$(dirname "$STATE_DIR")
sh .claude/skills/preview/scripts/stop-server.sh "$SESSION_DIR"
```

### Per-question rule

Active server ≠ use browser for everything. For each question: would the user understand this better by seeing it?

- **Browser**: mockups, layout comparisons, architecture diagrams, side-by-side previews
- **Terminal**: requirements questions, tradeoff lists, conceptual choices, scope decisions

"What personality should it have?" → terminal. "Which of these layouts feels right?" → browser.

## Spec Format

```text
Date:
Topic:
Chosen Approach:
Architecture:
Components:
Data Flow:
Error Handling:
Testing:
Non-goals:
Open Questions:
```

## STATE.md Update

After spec is approved, append to `.claude/STATE.md` under `Preview`:

```text
Date:
Spec: docs/specs/YYYY-MM-DD-<topic>.md
Approach:
Non-goals:
```

## Rules

- One question per message.
- Never start coding during this workflow.
- Never batch unrelated concerns into one spec.
- YAGNI: cut any feature not needed for the stated goal.
- Do not propose unrelated refactors.
- Fix spec issues inline — no re-review cycle.
- After user approval, next step is always `/align-intent`, never a direct implementation skill.
- If scope spans multiple independent subsystems, decompose first; run one sub-project through preview at a time.
- Stop the Visual Companion server when the brainstorming session ends.
