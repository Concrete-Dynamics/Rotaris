## The run-level agent's inspector is absent in compression-, plan-gate- and resilience-proof on Linux

Three proofs that read the run-level agent's inspector fail on `main` at `2f2ce96e`, on the Linux agent host under
`xvfb-run` with `WAYLAND_DISPLAY` unset, each beside the others and again alone, with the same reading each time:

- `compression-proof`: "the run-level agent was never popped out of the inspector".
- `plan-gate-proof`: "at the gate the run-level agent's chips do not mark the plan cycle root's glob call used
  (REQ-MONITOR-060): [] (inspector shows null)".
- `resilience-proof`: `next-run-choice` "the inspector's Model field was absent during the run, so its options were never
  read"; `quota-retry` and `two-waits` find no `[role="option"]` for the model they pick.

Measured 2026-11-24 while landing PR 119 (Rotaris Cloud, PD-PROVIDER-004): the rebased head `4f00234` read the same
four reds (the fourth, `linux-acceptance-proof`, only lacks a built AppImage), and `2f2ce96e` without that change read
them identically, so the change did not cause them. The common reading is an inspector that is not drawn, or not found
by the proofs' selectors, for the run-level agent. The commits on `main` just before (`3e02073a`, the requirements
board header and cards, R-122..R-124; `c794d73e`, the capture seams holding page focus) are the first places to look;
the cause was not established.

## Specs

REQ-MONITOR-060 (the plan cycle root's tool chips at the gate), if the inspector is truly absent; none, if the proofs'
selectors are what drifted.

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs`: the pop-out of the run-level agent's inspector
- `apps/desktop/scripts/plan-gate-proof.mjs`: the chips read at the gate
- `apps/desktop/scripts/resilience-proof.mjs`: `next-run-choice`, `quota-retry`, `two-waits`
