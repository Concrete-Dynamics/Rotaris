## A live-run verdict with no detail prints "undefined"

`live-run.mjs`'s verdict log prints a NOTE or a check whose detail was never given as "… — undefined": at `ce5f952` the `crlf`
scenario's two NOTEs read "crlf: haet_edit near misses 6 (levels 2, 2, 2, 2, 2, 2), retried 1, probed 0 (target 0), ambiguous 0
(target 0) (PD-TOOLS-014)  — undefined" and "crlf: the render.js window edit landed at match level 2, its block at the file's depth
— undefined". `lib/crlf-scenario.mjs` pushes those verdicts with no `detail`, and the printer (`finish`) omits the dash only when
the detail is `null`, not when it is absent. Cosmetic: the verdict itself is right, but a reader of the pack meets a word that
reads like a value the harness lost. Noticed 2026-10-14 by fin43 (`fin43-live-findings`) while reading the `ce5f952` verdict log
for this bundle's findings; recorded, not repaired (outside this bundle's tasks).

## Specs

None: the live harness is verification only.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `finish`, the line printing each check (`c.detail === null ? '' : …`).
- `apps/desktop/scripts/lib/crlf-scenario.mjs` — the `note` verdicts pushed with no `detail`.
