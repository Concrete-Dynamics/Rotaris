## workspace-proof's squeezed label checks went red once, with the label not elided

One `pnpm workspace-proof` run failed three REQ-WORKSPACE-149 rule 2 checks (the squeezed budget, the never-clipped label, the
stale span): the label stayed the whole path at 260, 90 and 46 px. The rerun on the same head was green, 50 passed, as was a
control run at `c6110962`. Seen 2026-11-01 on Windows 11 ARM64 on `fix/workspace-open-warmup-off-the-loop`, the run being the last
of five proofs in sequence. The cause is unknown. Neither the proof's timing nor the label's measurement was examined, and one
red in the few runs made gives no rate.

## Specs

REQ-WORKSPACE-149, if the product rather than the proof is at fault; that is not established.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs`: the three checks.
- `packages/ui/src/workspace-label.ts`: `elideMiddle`.
