## `layout-proof` reads the strip's path label a fixed 800 ms after each resize, one recompute behind on a loaded host

Found 2026-11-04 landing the consortium branch `claude/busy-noyce-b7b850` ([R-093](../product/requests.md#r-093)) with
`pnpm worktree:land --reviewed --keep`. The gate was green on `9c4d7989` (10m59s, 7,676 passed) and `pnpm layout-proof`
went red on two of its section-7 checks while the host sat at 100 % CPU with 23 node and 13 Electron processes (another
session's landing gate and release guard, and the hardening orchestration's `code-intel-proof` and `exit-trace-proof`):

- at 1180 px, "the shortened label is drawn whole": label content 637 in 421 px — the label read was the 118-character
  form, the width's recompute not yet landed;
- at 1400 px, "the label is recomputed when the width changes — longer than at 1180 px": the label read at 1400 px was
  the 77-character form the 1180 px width produces, shorter than the one read at 1180 px.

Each reading was one recompute behind: the proof saw the wide label at the narrow width and the narrow label at the
wide width. Rerun alone on the same head and the same build in the same landing tree, 19 s, with the host still at
100 %: 28 passed, 0 failed. An hour earlier the same proof had passed in the same tree on `a308c96a` (label content 419
in 419 px at 1180 px). The product is not shown wrong; the harness is.

Section 7 of `apps/desktop/scripts/layout-proof.mjs` resizes and then waits a fixed interval before it reads:
`await d.resize(1180, 800); await sleep(800);` and `await d.resize(1400, 900); await sleep(800);`. The strip's label is
recomputed by the resize observer (`REQ-WORKSPACE-149` rule 2), which on a loaded host lands after the 800 ms. `AGENTS.md`
("Driving the built app") names this shape: a step that needs a condition should `waitFor` it rather than sleep, because
fixed offsets have produced false reds three times before this one. The repair is to wait for the label to settle on a
value consistent with the new width — a `waitFor` on the item's `clientWidth` and the label's length stable across two
frames, or on the label's length having changed since the previous width — before reading, at both widths. Not repaired
here: the consortium branch changes no proof script, and the landing it blocks is a docs-only change.

## Specs

None in `docs/spec/`. A harness defect against the proof registry's own rule that a proof is evidence of the product
(`docs/proofs/README.md`), and `AGENTS.md`'s instruction that a driven step waits for its condition rather than a fixed
offset.

## Relevant files

- `apps/desktop/scripts/layout-proof.mjs` — section 7, the two `resize` + `sleep(800)` pairs and the reads that follow.
- `docs/proofs/README.md` — the registry row for `layout-proof`.
- `docs/defects/the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md` — the same host and the same
  evening's load, for the gate's own timing reds.
