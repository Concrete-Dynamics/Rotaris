## A setup start the run host never answers is reported as a task with no outcome

`code-intelligence-setup`'s `run` reports a start the run host **refuses** as REQ-WORKSPACE-093's retryable failure, in
this domain's summary, but a start that **rejects** — main's `mcp.setup` request with no reply within its 15 s bound, as
when the run host has exited and is never forked again — throws out of the task, and `executeTasks` reports it as a task
that ended without an outcome: "Code intelligence project setup ended without reporting an outcome: Error: no reply to
mcp.setup within 15000 ms", with the generic summary "Code intelligence project setup did not finish. It can be run
again." rather than REQ-WORKSPACE-093's "Code intelligence setup did not complete for this project. It runs again the
next time this workspace is opened.". REQ-WORKSPACE-103's banner carries that summary. Seen in `workspace-proof`'s
scenario 8d on 2026-10-01, while repairing
[`nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`](fixed/nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md):
the run queued behind the setup whose run host was killed asked for its own setup's start and failed so 15 s later. The same holds
for the status read the task's applicability makes (`setup.status`), which rejects into the resolution's failure instead.
Recorded, not repaired.

## Specs

- REQ-WORKSPACE-093: a code-intelligence setup's failure reads "{reason}: {detail}" with this domain's summary, and is
  retryable; the failure here is retryable but is in REQ-WORKSPACE-084's generic words for a task with no outcome.
- REQ-WORKSPACE-084: the generic report is that requirement's for a task that ends without an outcome; this task can
  state its own.
- OQ-167 holds the reason for a setup that began no stage; OQ-168 the reading for a run host lost mid-setup.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `codeIntelligenceTask`'s `run`, which handles `started.ok === false` but not
  a `setup.start()` that rejects.
- `apps/desktop/src/main/index.ts` — the coordinator's `SetupPort.start`, whose `runHost.request` rejects on its bound.
- `packages/config/src/init/execute.ts` — `executeTasks`' catch, the generic no-outcome report.
