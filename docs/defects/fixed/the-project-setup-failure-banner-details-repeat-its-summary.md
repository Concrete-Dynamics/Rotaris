## The project-setup failure banner's Details area repeats its summary

A failed background project setup raised "Project setup did not finish" with REQ-WORKSPACE-093's fixed summary ("Code
intelligence setup did not complete for this project. It runs again the next time this workspace is opened.") in the banner's
**Details** area, and nothing in the banner's message row. The summary names no stage, no reason and no output, so opening
Details told the user nothing that was not already known. The failure's real content — the task's `error`
("{reason}: {detail}") and each finished step's own detail — reached the log only. The "Project setup could not be checked"
banner and the run-broke-down banner had the same shape: a fixed sentence in the detail slot, the cause (`String(cause)`) only
in the log.

Repaired: the coordinator's `banner` dependency now takes `(headline, message, detail)`. The summary is the banner's message
row, and the detail is the task's error followed by one line per finished step (`Symbol indexing: failed — <last 400 bytes of
its output>`), or the cause for a resolution or run that broke down (`failureDetail` in `apps/desktop/src/main/initialization.ts`).

## Specs

REQ-NOTIFY-005 (stack traces, subprocess output appear in the separate detail area), REQ-NOTIFY-037/038 (the detail row is the
technical text and is copyable), REQ-WORKSPACE-092/093/095 (per-stage reason, last 400 bytes of output, audit trail),
REQ-WORKSPACE-103 (the banner carries the task's own summary).

## Relevant files

- `apps/desktop/src/main/initialization.ts` — the three `banner` calls and `failureDetail`.
- `apps/desktop/src/main/index.ts` — the `banner` dependency, which now reports `message` and `detail` separately.
- `apps/desktop/src/main/initialization.test.ts` — the banner assertions.
