---
name: project-dna
description: "Record significant implementation decisions and reproducible feature/configuration steps when requested or when durable project context changes. Save local evidence and a replay prompt; this does not authorize Git or external actions."
---

# Project DNA Skill

Captures implementation knowledge as reproducible entries. Each entry is a complete, standalone recipe for reimplementing one feature, config, or decision.

---

## Trigger Modes

### Manual trigger
User says: `"track this"`, `"log this"`, `"DNA this"`, `"save this feature"`, `"wrap this up"`, etc.

### Auto trigger
Record significant decisions or implementation changes locally as part of authorized work, including before an authorized commit or push when useful. Do not add a redundant documentation approval prompt. This trigger does not authorize commit, push, merge, deployment, or other external actions; obtain the required user permission before those actions.

---

## Step 1 — Locate or Initialize the DNA File

1. Reuse the project's existing `PROJECT-DNA.md` or an explicitly configured location. Default to `.claude/PROJECT-DNA.md` when none exists; do not ask the user to choose a default path.
2. Do not search nearby unrelated vaults or write outside the project without authorization. A configured external destination still needs permission for external writes unless the user already authorized them.
3. If creating fresh, initialize with the file header (see `references/templates.md` → `FILE_HEADER`).

---

## Step 2 — Gather Entry Information

Before writing, collect all of the following. Pull from conversation history and observed evidence first. Leave unavailable facts explicit; ask only about missing consequential information that blocks a useful entry.

### Required fields

| Field | How to collect |
|---|---|
| **Feature/Task name** | From user's description or last few messages |
| **Context** | Why was this needed? What problem does it solve? |
| **Decisions made** | What alternatives were considered? What was chosen and why? |
| **Validations / ACs** | What confirmed it works? Tests passed, manual checks, output seen |
| **Steps** | Exact ordered sequence of actions taken (see Step 3) |
| **Configs** | Env vars, config file values, flags, secrets (redact actual secret values, keep key names) |
| **Outputs** | Files created/modified, endpoints exposed, commands that now work |
| **Dependencies** | npm/pip/cargo packages added, with versions |

### Optional but valuable
- Gotchas or traps encountered
- What was explicitly *not* done (and why)
- Links to docs/issues consulted

---

## Step 3 — Reconstruct the Steps

Steps must be **precise enough that a fresh agent with zero context could follow them**. For each step:

- State the action in imperative form ("Create file X at path Y")
- Include exact file paths (relative to project root)
- Include exact commands with flags
- Include exact config values (redact secrets)
- Include the **reason** if non-obvious

Use this step format:
```
### Step N — [Action Title]
**What:** [what was done]
**Why:** [why this was necessary]
**How:**
```[language]
[exact command or code block]
```
**Result:** [what happened / what to verify]
```

---

## Step 4 — Write the Entry

Append to `PROJECT-DNA.md` using the entry template from `references/templates.md` → `ENTRY_TEMPLATE`.

Entry structure:
```
context → decisions → validations/ACs → steps → configs → outputs → replay prompt
```

Each entry is self-contained. A reader should never need to look at another entry to understand this one. Include a relevant, simple diagram in the documentation artifact, using Mermaid by default for its flow, structure, or dependencies.

---

## Step 5 — Generate the Replay Prompt (ALWAYS)

Every entry ends with a `## Replay Prompt` section. This is a single Claude prompt that:

1. Gives full context (stack, project structure, what already exists)
2. States exactly what needs to be built/configured
3. Lists all constraints and decisions already made
4. Includes all relevant config values (redacted secrets as `[SECRET_NAME]`)
5. Asks the agent to follow the exact steps

Format:
```markdown
## 🔁 Replay Prompt

> Paste this into a fresh Claude session to reimplement this feature from scratch.

---
**Context:** [project name, stack, relevant existing files/services]

**Task:** Implement [feature name].

**Constraints & decisions already made:**
- [decision 1]
- [decision 2]

**Steps to follow:**
1. [step 1]
2. [step 2]
...

**Config required:**
- `ENV_VAR_NAME` = `[REDACTED]` (purpose: ...)
- File: `path/to/config.json` → set `key` to `value`

**Done when:** [validation criteria / acceptance conditions]
---
```

---

## Step 6 — Report the Saved Entry

Give a concise summary and the file/entry link. Include the replay prompt in the file rather than repeating the entire entry in chat. Apply any user corrections without requiring a routine confirmation round. State missing evidence or unresolved decisions plainly.

---

## DNA File Conventions

- Preserve an existing entry order; otherwise append chronologically with newest at bottom. Follow a known user preference without asking about routine ordering.
- Each entry has a unique ID: `DNA-YYYY-MM-DD-NNN` (NNN = sequence number that day)
- File includes a `## Index` section at the top that auto-updates with entry IDs + one-line summaries
- Use `---` horizontal rules between entries
- Secrets: NEVER write actual values. Write `[SECRET: VAR_NAME]` as placeholder.

---

## Edge Cases

**User says "track this" mid-conversation with no clear boundary:**
→ Use the most recent clearly bounded feature or decision when context identifies it. Ask only if selecting a boundary would materially change the requested record.

**Multiple features were built in one session:**
→ Create one local entry per independent feature without a redundant split confirmation when scope is already clear.

**The feature spans multiple files with large diffs:**
→ Don't paste full file contents. Instead: file path + what changed (added/modified/deleted) + key code snippets only if critical to reproduction.

**Before an authorized Git action:**
→ Record proportionate local context without an extra mode-selection prompt. Do not execute Git or other external actions merely because a DNA entry was saved.

---

## Reference Files

- `references/templates.md` — FILE_HEADER and ENTRY_TEMPLATE in copy-paste form
