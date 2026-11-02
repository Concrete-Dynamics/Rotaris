## `slash-proof` schedules the model-chip open at the same offset as the usage-notice read, so `evalAt` answers the wrong one

`apps/desktop/scripts/slash-proof.mjs`'s timetable puts `T.usage + 100` (the `readNotice` eval after `/model` is
submitted) and `T.modelsOpen` (the `openChipModels` eval) at the same instant, **5,900 ms**. Both fire, in the order
they were registered — the notice read first — and each logs `capture: eval-at 5900 …`. `evalAt(run, at)` answers the
FIRST eval logged at an offset, so `chipOpened` reads the notice object rather than `"opened"`, and the proof throws
`the model chip did not open its picker: {"title":"Command not run","message":"Usage: /model <name>",…}` at its
REQ-CHAT-032 check — although the chip did open: the very next line at 5,950 ms lists
`["gpt-4o","gpt-4o-mini","scripted","scripted-2"]` from the opened picker.

Both offsets entered together in `eade970` (2026-09-18), when the timetable was renumbered; the check has been red
since, hidden behind the badge assertion that stopped the proof at its first catalogue check from 2026-09-15 to
2026-09-28 ([fixed](slash-proof-expects-every-built-in-to-carry-the-action-badge.md)). Measured 2026-09-28 as
root under Xvfb on Linux: the proof passes the popup's checks (rows, names, badges, focus, geometry, the row texts),
the four token colours and their contrast, Tab completion and the usage notice, and stops here; every check after it
(REQ-CHAT-029..033, REQ-CHAT-159, REQ-LIBRARY-142, REQ-CHAT-042..044, the three later launches) is unmeasured until the
two evals have distinct offsets or `evalAt` selects by expression as well as by time.

## Specs

None contradicted by the product: the picker opened and listed the configured catalogue in its order. The defect is the
proof's — a reader that keys evidence by time alone, and two probes at one time.

## Relevant files

- `apps/desktop/scripts/slash-proof.mjs`: `T.usage`, `T.modelsOpen`, the `ROTARIS_CAPTURE_EVAL_AT` list, `evalAt`.
- `apps/desktop/src/main/capture/seams.ts`: the eval-at seam, which fires every eval at its offset and logs each.

Noticed 2026-09-28 while re-running the proofs on Linux under R-062, once the badge assertion no longer stopped the
proof. Not repaired: outside that item.

## Repaired 2026-09-28 under R-062

**What changed** (the harness only; no product file). Both halves: the usage notice's read moved to its own offset
(`T.usageNotice`, 5,850 ms), and every read names its probe — `evalAt(run, at, expression)` over
`apps/desktop/scripts/lib/capture-evals.mjs`, which keeps the text the seam logs after each offset and returns the answer
of the eval logged at that offset WITH that expression. A read without its expression is refused, and a read that still
matches two logged evals throws instead of choosing. The 47 reads in the proof each pass the expression they scheduled.

Running on showed two more harness reds behind this one, both repaired here:

- **The chip's close.** `closeChipModels` dispatched a synthetic Escape on `document`, which never reaches the picker's
  key handler (it sits on the trigger and the panel), and read the list in the same tick; it returned `false` while the
  picker behaved as specified. The picker is now closed by a real Escape (`ROTARIS_CAPTURE_KEYS` at `T.modelsClose`, into
  the filter the picker focuses) and read until the list is gone, bounded at 400 ms: closed at 0 ms, focus back on the
  trigger.
- **The ground.** The token's ground was read as the input's own `backgroundColor`, which has been `rgba(0, 0, 0, 0)`
  since the composer dock (2026-09-18), and the contrast arithmetic took that for black — the catalogue launch "passed"
  REQ-CHAT-027's floor against a ground nobody sees. `GROUND` now reads the first opaque background from the input
  upwards (the dock's `--rt-surface`), the ratios are measured on it only when it is opaque, and the restart check
  compares like with like.

**The test that pins it.** `apps/desktop/scripts/lib/capture-evals.test.ts`, 7 cases: two probes logged at one offset
each read their own answer (the chip's "opened" and the notice), an expression at another offset is not read, a read
without its expression is refused, one expression logged twice at one offset throws, JSON and non-JSON answers and a
CR-terminated line (which the old pattern could not match at all), an arrow inside an answer, `null` against no answer.

**Measured** as root under Xvfb on Linux, Node 24, after one `pnpm build`, no other Electron process on the host:
`pnpm slash-proof --skip-build` now passes REQ-CHAT-032's chip check and the rest of the popup, colour-weight, Tab and
usage checks, and stops at a **product** red — REQ-CHAT-027's partial shade at **4.06:1** on the ground the dock paints
([note](the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md), recorded, not
repaired then; repaired 2026-09-29 under R-067). A diagnostic run with every check made non-fatal (a copy, not committed) measured the rest: nine failures,
all that one defect (partial on three palettes, unknown on `rotaris-dim`, the ground not `--rt-bg` on three), and every
other check passing — REQ-CHAT-029..033, REQ-CHAT-159, REQ-LIBRARY-142, REQ-CHAT-042..044, the palette launch's weights
and distinct colours, the stored theme, the restart, and the wired launch's `/logout` and REQ-CHAT-028 rebuilds
(ADR-0050's fourth execution).
