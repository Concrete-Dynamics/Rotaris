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

## Outcome

**Repaired 2026-11-24: neither the product nor the proofs' selectors — the screen the proofs ran on.** The runs that met
these reds wrapped the proofs in `xvfb-run -a` with no `-s`, which gives Xvfb's default 1280×1024 screen. The main window
opens 1440 px wide (`mainWindowOptions`), the screen clamped it to 1280, and below 1400 px (`BOTH_DOCKED_FROM`,
PD-SHELL-017 revision 2, since `fa6d97fc`) the inspector is a drawer, closed until it is toggled. The capture of
`root-and-child` shows exactly that: a 1280-px window, the inspector toggle unpressed, and the three
`[data-testid="inspector-…"]` probes reading `[]`. Neither `3e02073a` nor `c794d73e` was involved.

Every record already names the screen the proofs need (`xvfb-run -a -s "-screen 0 1600x1000x24"`: the orchestrated
build's profile, `pnpm preflight`'s own advice, three scripts' headers); the invocation dropped it. Under that screen the
same build at `c1ea7d40` ran `compression-proof` and `plan-gate-proof` green, and `resilience-proof` green but for
`quota-retry`.

`quota-retry`'s red was a second, harness cause, and timing-dependent: its launch's "No model provider is authenticated
yet" banner arrived in the same millisecond `choose` (`apps/desktop/scripts/lib/driver.mjs`) pressed the wait header's
model chooser, the banner moved the header down, and the press opened the band's prompt stash instead, so no
`[role="option"]` ever appeared. `choose` pressed with a plain `click`; it now presses the trigger and the option through
`clickLanded` (settled, retried when it meets something else). With it, all 23 of `resilience-proof`'s scenarios ran
green.

The guard: `pnpm preflight`'s display check now reads a reached display's screen with `xdpyinfo` (where installed) and
fails one narrower than 1400 px (`PROOF_SCREEN_MIN_WIDTH`, held equal to `BOTH_DOCKED_FROM` by `preflight.test.ts`),
naming the screen and the wrapper to use. `pnpm worktree:land` runs that preflight before its proofs, so a landing under a
too-small screen stops there with that reason instead of meeting these reds.
