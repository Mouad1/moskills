# Trigger evals

moskills only helps if the agent reaches for the right skill on its own. The
cases in [`evals/triggers/`](../evals/triggers/) measure that with
`claude plugin eval`. Each case sends one plain request to a fresh Claude Code
session that has only the moskills plugin loaded, then checks which skill was
called (or that none was). Evals load no `CLAUDE.md`, so they measure the skill
descriptions alone.

## Results

Claude Code 2.1.326, model `claude-opus-5-5`, plugin 0.9.3, 3 runs per case.

| Group | Example request | Expected | Passed |
|---|---|---|---|
| diagnose, direct (3 cases) | "The build broke right after my last change and I do not know why." | `diagnose` fires | 9 / 9 |
| diagnose, indirect | "Customers say checkout charges the wrong total since this morning..." | `diagnose` fires | 3 / 3 |
| gatekeeper, direct (3 cases) | "I think the feature is finished. Is it ready to ship?" | `gatekeeper` fires | 9 / 9 |
| gatekeeper, indirect | "I think we are good here. Anything left before I tell the team it works?" | `gatekeeper` fires | 3 / 3 |
| handoff, direct (3 cases) | "I have to stop for today. Hand this off so I can continue tomorrow." | `handoff` fires | 9 / 9 |
| handoff, indirect | "My laptop battery is about to die, save where we are." | `handoff` fires | 3 / 3 |
| quiet (3 cases) | typo fix, git question, plain question | no moskills skill | 9 / 9 |
| neighbour: feature, not diagnose | "Add a 10% discount on orders over 100 dollars." | `diagnose` stays quiet | 3 / 3 |
| neighbour: list, not handoff | "Continue this list with three more fruits..." | `handoff` stays quiet | 3 / 3 |
| neighbour: question, not gatekeeper | "In moskills, what does the word done mean for a run?" | `gatekeeper` stays quiet | 1 / 3 → **3 / 3** |
| tdd, direct | "Add a function that gives a 10% discount on orders over 100 euros." | `tdd` fires | 0 / 3 → **3 / 3** |
| tdd, after a plan | "Plan approved: a function that gives 10% off orders over 100 euros, in discount.js. Build it." | `tdd` fires | 0 / 3 → **3 / 3** |
| evolvebook, direct | "Create an evolvebook for my weekly newsletter." | `evolvebook` fires | 3 / 3 |
| evolvebook, indirect | "This is the third LinkedIn post I write with you this month. Keep a guide..." | `evolvebook` fires | 3 / 3 |
| neighbour: README example, not evolvebook | "Add the parseDate function as a usage example in the README." | `evolvebook` stays quiet | 3 / 3 |
| **Total, first run** | 18 cases | | **52 / 54** |
| **Total, 2026-11-20** | 20 cases | | **60 / 60** |

The first suite run (2026-11-17) passed 52 of 54 runs: the 12 direct and quiet
cases 36 of 36 ($2.81), the 6 indirect and neighbour cases 16 of 18 ($1.37).
The only miss: a plain question about the word "done" fired `gatekeeper` in 2 of 3
runs. The gatekeeper description now ends with "Not for questions about what
done means or how moskills works; answer those directly." A re-run on
2026-11-18 passed that case 3 of 3 and the four gatekeeper trigger cases 12 of
12 ($1.26). That description change is on `main` (Unreleased) and is not in the
0.9.3 package.

The two tdd cases came from live test 6, where "build it" after an approved
plan never reached `tdd`. Against the old tdd description they fired 0 of 6
runs: the agent wrote the code itself. The description now says to use tdd
"whenever code is about to be written, even if the user never mentions tests".
A full run on 2026-11-20 passed all 20 cases, 60 of 60 runs ($5.74). That
description change is on `main` (Unreleased).

The 3 `evolvebook` cases were added on 2026-11-20 with the rewritten
description (it now leads with what the skill does) and passed 9 of 9 runs
($1.17, `--tag evolvebook`). They are not in the totals above.

Draft rules MSK-020 to MSK-023 in [`docs/rules.md`](rules.md) set the pass
rate these cases must hold.

## Run them

```sh
claude plugin eval . --tag triggers --ablation none --runs 3 --max-cost-usd 8
```

Add `--tag harder` for only the indirect and neighbour cases. A full run costs
about $6 on Opus 5.5. Results land in `evals/results/` (gitignored).

## What they do not cover

- Only 5 of the 18 skills (`diagnose`, `gatekeeper`, `handoff`, `tdd`, `evolvebook`)
  have trigger cases.
- They check that a skill fires, not how well it does the job once it runs.
- With a project `CLAUDE.md` and the moskills standard loaded, as in a real
  install, routing gets extra hints these evals leave out.
