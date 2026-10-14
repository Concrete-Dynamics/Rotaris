## The live run's duress section calls itself its only opt-in scenario

`live-run.mjs`'s section 9 opens "OPT-IN, and the only scenario here that is. `--only=duress`." Five scenarios are opt-in:
`OPT_IN` names `duress`, `cutoff`, `rename`, `plan-open` and `empty-answer`, and the header marks each of the other four
``OPT-IN (`--only=…`)`` (its entries 8e, 8i, 8j and 8k). The sentence predates the four. It matters beyond the wording: the
expectations a brief sets for PD-ORCH-009 revisions 3 to 5 (`empty-answer`), PD-ORCH-015 (`plan-open`), PD-MCP-004's rename
(`rename`) and PD-CONFIG-003's cut-off child (`cutoff`) are met only by a run that names those scenarios, and a reader told
duress is the only opt-in one would take a default run for their measurement. Cosmetic (acceptance finding L9,
`harness-defect`). Recorded 2026-10-14 by fin46 (`fin46-accept1-5`). *(As written 2026-10-14; repaired the same day, below.)*

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-5`).** Section 9 now opens "OPT-IN (`--only=duress`), one of five",
names the other four as `OPT_IN` does, says no default run reaches any of them, and names what only they ask: PD-ORCH-009
revisions 3 to 5 (`empty-answer`), PD-ORCH-015 (`plan-open`), PD-MCP-004's cold rename (`rename`), PD-CONFIG-003's cut-off
child (`cutoff`) and the long run. **Pinned by** `apps/desktop/scripts/lib/live-run-opt-in.test.ts`, which reads `OPT_IN` from
the script: every opt-in scenario is marked ``OPT-IN (`--only=<name>`)`` in the header and in its own section, no comment
calls one scenario the only opt-in one, and section 9's opening names the other four (red before the change on the first and
the last two).

## Specs

None: the live harness is verification only.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — section 9's comment (the false sentence) against `OPT_IN` and the header's entries 8e,
  8i, 8j and 8k.
