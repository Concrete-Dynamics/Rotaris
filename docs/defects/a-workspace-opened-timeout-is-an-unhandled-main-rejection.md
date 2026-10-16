## A workspace.opened timeout is an unhandled main rejection

While checking PD-ORCH-017 on Windows ARM64, `compression-proof`'s `automatic` launch logged `UNHANDLED rejection in main: Error: no reply to workspace.opened within 5000 ms` at `2026-10-16T08:21:30.637Z`. Its final log then reported skill discovery taking 8,201.5 ms and a presenter-liveness lapse. The proof ended the launch at its 180,000 ms bound; SIGTERM ended it after another 4,526 ms. It never reached the compression measurement.

Evidence: `.proof/compression-proof/automatic.log` in `Rotaris-crw-wt-child-cap`, based on `8080fbda` with the child-cap change. The launch was concurrent with the full test suite. Resource contention is a possible trigger, not an established cause. No reproduction in isolation or repair is claimed.

## Specs

No behavioural requirement identified yet. This is a recorded unhandled rejection and a missing compression reading, not evidence that compression itself failed.

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs` — the bounded `automatic` launch.
- `packages/shell/src/process-link.ts` — request/reply timeouts.
- `apps/desktop/src/main/` — the `workspace.opened` handoff and unhandled-rejection log.
