## compression-proof never clicks "Pop out" on Linux and goes red alone

`pnpm compression-proof` ends red at `apps/desktop/scripts/compression-proof.mjs:278`, "the run-level agent was never
popped out of the inspector": the launch's log holds no `clicked "Pop out"` line. Measured 2026-11-20 on Linux 7.0
(X11 session forced, Node 24.18.0), the built app of `origin/main` at `644c73ef`, with `--skip-build` after one
`pnpm build`: red three times of three, once beside seven other proofs and twice alone, each after about 51 s. The
checks before it in the same launch hold (the run completed, one child, two compressions, the aggregate of 2). The
development-time store holds three earlier runs of the proof, all green, so the red is newer than those.

Not examined further: whether the control moved or was renamed by the workspace's one-band header (PD-SHELL-017,
R-107), or whether the capture's click step no longer reaches it.

## Specs

REQ-SESSION-139 is what the launch proves once the agent is popped out; the proof cannot take that reading while its
click finds nothing.

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs` — the root-and-child launch and the check at line 278.
- `packages/ui/src/` — the inspector's pop-out control the capture step looks for.
