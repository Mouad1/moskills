# Business rules

> One rule per row: what must be true, how we measure it, and the check that proves it. The register is the single source of truth for acceptance; `docs/prd.md` and specs refer to rules by ID.

## How to write a rule

- **ID:** `BR-001`, `BR-002`, ... Never reuse or renumber an ID; retire it instead.
- **Rule:** one behaviour, written in an EARS pattern where it fits:
  - Always: "The system shall ..."
  - When an event happens: "When <trigger>, the system shall ..."
  - While in a state: "While <state>, the system shall ..."
  - Unwanted case: "If <bad condition>, then the system shall ..."
  - Optional feature: "Where <feature is present>, the system shall ..."
- **Expected (measurable):** a number, a threshold, or Given / When / Then that a check can decide. "Fast" is not measurable; "under 1 s with 500 items" is.
- **Proof:** the check that decides it: a test command, a test name, or `visual` / `human` when a person must look.
- **State:** set by the user only. `draft` (proposed), `accepted` (approved, must be proven), `retired` (no longer applies). Changing an accepted rule's meaning puts it back to `draft` until the user approves again.
- **Source:** the PRD section, spec, or decision the rule comes from.

## Rules

| ID | Rule | Expected (measurable) | Proof | State | Source |
| --- | --- | --- | --- | --- | --- |
| BR-001 | | | | draft | |

## Proof status

Generated from run-state by `moskills run-state rules`; do not edit between the markers.

<!-- moskills:rules:begin -->
<!-- moskills:rules:end -->
