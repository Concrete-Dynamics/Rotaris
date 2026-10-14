## The live run's duress section calls itself its only opt-in scenario

`live-run.mjs`'s section 9 opens "OPT-IN, and the only scenario here that is. `--only=duress`." Five scenarios are opt-in:
`OPT_IN` names `duress`, `cutoff`, `rename`, `plan-open` and `empty-answer`, and the header marks each of the other four
``OPT-IN (`--only=…`)`` (its entries 8e, 8i, 8j and 8k). The sentence predates the four. It matters beyond the wording: the
expectations a brief sets for PD-ORCH-009 revisions 3 to 5 (`empty-answer`), PD-ORCH-015 (`plan-open`), PD-MCP-004's rename
(`rename`) and PD-CONFIG-003's cut-off child (`cutoff`) are met only by a run that names those scenarios, and a reader told
duress is the only opt-in one would take a default run for their measurement. Cosmetic (acceptance finding L9,
`harness-defect`). Recorded 2026-10-14 by fin46 (`fin46-accept1-5`).

## Specs

None: the live harness is verification only.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — section 9's comment (the false sentence) against `OPT_IN` and the header's entries 8e,
  8i, 8j and 8k.
