## A setup start the run host never answers is reported as a task with no outcome

`code-intelligence-setup`'s `run` reports a start the run host **refuses** as REQ-WORKSPACE-093's retryable failure, in
this domain's summary, but a start that **rejects** — main's `mcp.setup` request with no reply within its 15 s bound, as
when the run host has exited and is never forked again — throws out of the task, and `executeTasks` reports it as a task
that ended without an outcome: "Code intelligence project setup ended without reporting an outcome: Error: no reply to
mcp.setup within 15000 ms", with the generic summary "Code intelligence project setup did not finish. It can be run
again." rather than REQ-WORKSPACE-093's "Code intelligence setup did not complete for this project. It runs again the
next time this workspace is opened.". REQ-WORKSPACE-103's banner carries that summary. Seen in `workspace-proof`'s
scenario 8d on 2026-10-01, while repairing
[`nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`](nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md):
the run queued behind the setup whose run host was killed asked for its own setup's start and failed so 15 s later. The same holds
for the status read the task's applicability makes (`setup.status`), which rejects into the resolution's failure instead.
Recorded, not repaired.

## Specs

- REQ-WORKSPACE-093: a code-intelligence setup's failure reads "{reason}: {detail}" with this domain's summary, and is
  retryable; the failure here is retryable but is in REQ-WORKSPACE-084's generic words for a task with no outcome.
- REQ-WORKSPACE-084: the generic report is that requirement's for a task that ends without an outcome; this task can
  state its own.
- OQ-167 holds the reason for a setup that began no stage; OQ-169 the reading for a run host lost mid-setup.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `codeIntelligenceTask`'s `run`, which handles `started.ok === false` but not
  a `setup.start()` that rejects.
- `apps/desktop/src/main/index.ts` — the coordinator's `SetupPort.start`, whose `runHost.request` rejects on its bound.
- `packages/config/src/init/execute.ts` — `executeTasks`' catch, the generic no-outcome report.

## Outcome — repaired 2026-10-01

**The start.** `codeIntelligenceTask`'s `run` now catches a `setup.start()` that rejects and reports it as it reports a
refused start: a retryable failure in REQ-WORKSPACE-093's summary ("Code intelligence setup did not complete for this
project. It runs again the next time this workspace is opened."), so a background run's REQ-WORKSPACE-103 banner carries
that summary. Its error is "Code intelligence could not complete this project's setup: the run host did not answer the
setup's start ({the request's error})" — the reason is the build's for a setup that began no stage (OQ-167), the detail
the build's (`SETUP_START_UNANSWERED_DETAIL`) with the request's own error in parentheses; the reading is recorded in
[OQ-169](../../architecture/open-questions.md), which stays open. The rejection is said in the log at `warn`, and the
setup turn passes on as after any other end, so a setup queued behind it starts.

**The status read: no defect, and not changed.** The note's last sentence does not hold for the code as it stands. A
`setup.status()` that rejects makes the task's applicability predicate raise, and `isApplicable`
(`packages/config/src/init/registry.ts`) logs it at `warn` and counts the task not applicable — REQ-WORKSPACE-080's own
rule for a predicate that raises, and REQ-WORKSPACE-081's for the sets. The resolution does not fail, no banner is
raised, and nothing about the task is recorded, so a later open whose read answers still owes it. The triage's sketch —
count a rejected read as applicable, so that the task runs and fails in the start's words — was not followed: it would
contradict REQ-WORKSPACE-080/081 in terms and assert REQ-WORKSPACE-090's condition on no evidence. The case is pinned.

Pinned by `apps/desktop/src/main/initialization.test.ts`, "a setup request the run host never answers": "fails a start
that rejects retryably, in REQ-WORKSPACE-093's summary, not as a task with no outcome" (red on the code before: "Code
intelligence project setup ended without reporting an outcome: Error: no reply to mcp.setup within 15000 ms"), "passes
the setup turn on after a start that rejects", and "counts the task not applicable, logged, when the status read rejects".
Shown by `workspace-proof`'s scenario 8d, which now reads the queued run's outcome and its report after the run host is
killed: the log line "→ failure — Code intelligence could not complete this project's setup: the run host did not answer
the setup's start (…)", retryable, REQ-WORKSPACE-093's summary, and no "ended without reporting an outcome" anywhere in
the log. ADR-0064's fourteenth round reports it.
