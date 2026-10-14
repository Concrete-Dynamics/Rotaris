## A live-run verdict with no detail prints "undefined"

`live-run.mjs`'s verdict log prints a NOTE or a check whose detail was never given as "… — undefined": at `ce5f952` the `crlf`
scenario's two NOTEs read "crlf: haet_edit near misses 6 (levels 2, 2, 2, 2, 2, 2), retried 1, probed 0 (target 0), ambiguous 0
(target 0) (PD-TOOLS-014)  — undefined" and "crlf: the render.js window edit landed at match level 2, its block at the file's depth
— undefined". `lib/crlf-scenario.mjs` pushes those verdicts with no `detail`, and the printer (`finish`) omits the dash only when
the detail is `null`, not when it is absent. Cosmetic: the verdict itself is right, but a reader of the pack meets a word that
reads like a value the harness lost. Noticed 2026-10-14 by fin43 (`fin43-live-findings`) while reading the `ce5f952` verdict log
for this bundle's findings; recorded, not repaired (outside this bundle's tasks). *(As written 2026-10-14; repaired the same day,
below.)*

**Outcome: repaired 2026-10-14 by fin44 (`fin44-improvement-failures`).** The line is printed by `verdictLine`
(`apps/desktop/scripts/lib/verdict-line.mjs`), which treats an absent detail and a null one alike and prints no dash for either.
`live-run.mjs`'s `noted` stores an absent detail as null, as `check` already did, so `results.json` carries `null` too. **Pinned
by** `lib/verdict-line.test.ts`: a NOTE with no detail prints no dash, a falsy detail still prints, and `live-run.mjs` prints
through `verdictLine` with `noted` normalising (red before the change). The `crlf` scenario's notes are left as they are: a note
with nothing more to say is a fair verdict, and the printer is where the word came from.

## Specs

None: the live harness is verification only.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `finish`, the line printing each check (`c.detail === null ? '' : …`).
- `apps/desktop/scripts/lib/crlf-scenario.mjs` — the `note` verdicts pushed with no `detail`.
