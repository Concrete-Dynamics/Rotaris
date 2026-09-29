## A root resumed under a fallback persona hides its rows from the crash record

When the persona an open iteration's root ran as is no longer configured, the continue that resumes it sets the run up
as the entry role (OQ-97), and the root's transcript rows are written under that role's name. The iteration row keeps
the persona it was opened with (`root_persona`). If that run then dies mid-step, the crash record looks the root's
rows up by `root_persona` (`answerOpenCalls`), finds none, and answers a call that had completed as never started —
the case phase 3's fourth review repaired for every other agent. It needs both a removed persona and a crash. Noticed
by phase 4's third review of `PD-ORCH-005` (2026-09-27), established by reading the code; not driven.

## Specs

`PD-ORCH-005` clause 3 (a call is recorded as interrupted only when it was cut off before its result arrived) and
clause 4 (the root is restored with its identity), which the split between the row's persona and the rows' name
leaves unmet in this one case.

## Relevant files

- `packages/engine/src/run/crash.ts` — `recordCrash`, which passes `root_persona` to `answerOpenCalls`.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun`, the fallback to the entry role.
- `packages/engine/src/run/run.ts` — the root's rows, named by the run's `config.persona`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). The root's rows are now named by the persona its
iteration was opened with: `Run.turn` takes the name `resume.root_persona` for a resumed root and the run's persona for
a fresh one (`rootName`), and uses it wherever the run names its root — the rows `runTurn` writes, the root's tool port,
the rest's and the stop's `answerOpenCalls`, the entry agent's context reading (`entryContext`), the wait whose model
the user replaces, and the `steering_submitted` entry of a steer for the root (`Run.steer`, found by the repair's review:
it still named the run's persona, so the root was announced under one name and injected under another). A root resumed as the entry role because its persona is no longer configured (OQ-97) therefore
keeps writing under the name `recordCrash` looks up (`iterations.root_persona`), and a call of its step that completed
before a crash keeps what it returned. The row's `persona` column still names the persona it runs as. Nothing changes
for a root that resumes as its own persona, whose two names are the same.

Evidence: `packages/engine/src/run/crash.test.ts`, "clauses 3 and 4 with OQ-97: a root resumed as the entry role …":
a crash-left session is continued with the entry role set up in place of `orchestrator`; the resumed root's step
completes one call and hangs in the second; the crash is then recorded from the store. On the code before the repair
the completed call was answered as "not run: it was interrupted by a crash before it started", and its row and the
running one carried the entry role's name; with the repair it keeps "wrote the file" and only the running call is
answered as interrupted, its row settling `failed`. The same case steers the resumed root, and its `steering_submitted`
entry names `orchestrator`; on the first build of the repair it named `coding-agent`. OQ-97's fallback bullet is
reported back in place.
