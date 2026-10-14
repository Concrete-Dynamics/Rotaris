## terminal-proof's packaged launch drives seams a packaged build compiles out

`apps/desktop/scripts/terminal-proof/packaged.mjs` (Part T2: `runtime.terminal_stream_enabled: false` measured in the PACKAGED
application, REQ-TOOLS-126/127) launches `release/win-unpacked/Rotaris.exe` with `ROTARIS_MODEL_DIALECT=scripted` and
`ROTARIS_SCRIPT=git` (lines 87 and 88) to have the scripted model take one `git status` terminal step, and reads the renderer
through `ROTARIS_CAPTURE_EVAL_AT` (lines 15 and 92). A packaged build (`ROTARIS_BUILD=package`, `__ROTARIS_SEAMS__` false) compiles
every one of those out: `_EVAL_AT` since fin43 (`scripts/lib/seam-check.mjs` forbids it), the dialect switch and the script
variables since fin45, and since fin46 the scripted model client itself, which a packaged build no longer carries at all
([OQ-312](../architecture/open-questions.md#oq-312), ruled 2026-10-14 under R-072). Against a seam-free package the launch's
model is the workspace's configured one (none in its scratch workspace, so no run), and the probe line it waits for is never
logged, so the proof cannot measure what it exists to measure: it fails, or would read nothing, on every package `pnpm package`
can now produce. Read from the code on 2026-10-14 by fin46 (`fin46-accept1-11`) while building OQ-312; not run (the proof needs a
Windows package). Recorded and not repaired: outside OQ-312's repair.

A repair may reuse `scripts/lib/stub-model-endpoint.mjs` (the loopback OpenAI-compatible stub ADR-0056 rule 4 (b) now runs
against, which answers a tools request with one `git status` call) for the model, and needs another reading of the renderer than
`_EVAL_AT` — or a ruling on how a packaged build's surface may be observed at all.

## Specs

ADR-0056 (a packaged build carries no verification seam; rule 4 (b) re-based by OQ-312) and ADR-0021's Part T2 measurement,
which this proof was the packaged execution of; REQ-TOOLS-126 and REQ-TOOLS-127, whose packaged reading it owes. No requirement is
contradicted: the defect is that the evidence for them can no longer be taken this way.

## Relevant files

- `apps/desktop/scripts/terminal-proof/packaged.mjs` — the launch's environment (lines 87 to 92) and the `capture: eval-at` read.
- `apps/desktop/scripts/lib/seam-check.mjs` — `FORBIDDEN`, which names `ROTARIS_CAPTURE_EVAL_AT`, the scripted client's variables
  and its log line.
- `apps/desktop/scripts/lib/stub-model-endpoint.mjs` — the stub a repair may reuse.
- `apps/desktop/src/run-host/host.ts`, `apps/desktop/src/run-host/configuration.ts` — the scripted client built and answered only
  behind `__ROTARIS_SEAMS__`.
