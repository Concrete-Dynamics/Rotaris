## A root resumed under a fallback persona hides its rows from the crash record

When the persona an open iteration's root ran as is no longer configured, the continue that resumes it sets the run up
as the entry role (OQ-70), and the root's transcript rows are written under that role's name. The iteration row keeps
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
