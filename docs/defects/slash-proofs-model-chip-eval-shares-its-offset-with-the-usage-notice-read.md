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
2026-09-28 ([fixed](fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md)). Measured 2026-09-28 as
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
