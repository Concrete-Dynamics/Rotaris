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
it still named the run's persona, so the root was announced under one name and injected under another). A run built to
resume an open iteration takes that name when it is built, not only when its first turn begins, so a steer submitted
before the resumed root's first step — during the pre-flight or the `session_start` hook — is announced under it too
(found by the repair's second review). A root resumed as the entry role because its persona is no longer configured (OQ-97) therefore
keeps writing under the name `recordCrash` looks up (`iterations.root_persona`), and a call of its step that completed
before a crash keeps what it returned. The row's `persona` column still names the persona it runs as. Nothing changes
for a root that resumes as its own persona, whose two names are the same.

What the rename meant elsewhere, found by the repair's fourth review: the surfaces knew the run-level agent by the entry
persona alone, so a root whose rows carry another name fell outside it. When the surface's entry persona is the entry
role, the root's rows were missing from "This task" and from its persona window, while the inspector followed them to it
(REQ-CHAT-069, REQ-MONITOR-071, REQ-MONITOR-053). `Run.entryTools`, read under the run's persona, missed every call the
root dispatched under its own name (REQ-MONITOR-060). The first statement of this repair said nothing of either. Both are
repaired by [`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md):
the session names its roots (`SessionRecord.entryRoots`), the run-level agent owns the rows each root's name carries, and
`entryTools` reads under `rootName`. The same review noted, as a lesser finding, that the warning the stop's grace writes
when it gives a root up named the entry role too; it names `rootName` now, pinned by "clause 4 with OQ-97
(REQ-SESSION-092) …" in `packages/engine/src/run/crash.test.ts`, whose warning named `coding-agent` before.

Evidence: `packages/engine/src/run/crash.test.ts`, "clauses 3 and 4 with OQ-97: a root resumed as the entry role …":
a crash-left session is continued with the entry role set up in place of `orchestrator`; the resumed root's step
completes one call and hangs in the second; the crash is then recorded from the store. On the code before the repair
the completed call was answered as "not run: it was interrupted by a crash before it started", and its row and the
running one carried the entry role's name; with the repair it keeps "wrote the file" and only the running call is
answered as interrupted, its row settling `failed`. The same case steers the resumed root, and its `steering_submitted`
entry names `orchestrator`; on the first build of the repair it named `coding-agent`. A second case, "a steer for a root resumed as the entry role,
submitted before its first step …", holds the continue's `session_start` hook and steers the root there: its
`steering_submitted` entry named `coding-agent` until the run took the name when built, and names `orchestrator` now, as
its `steering_injected` entry does. OQ-97's fallback bullet is
reported back in place.
