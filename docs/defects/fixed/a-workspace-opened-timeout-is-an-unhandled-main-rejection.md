## A workspace.opened timeout is an unhandled main rejection

### Outcome: repaired 2026-10-20 (plan `loc1`, bundle `main-rejection`)

**Why the rejection reached no handler.** `openWorkspaceInner` (`apps/desktop/src/main/index.ts`) awaited
`runHost.request({ kind: 'workspace.opened', … }, 5 000 ms)` bare. `ProcessLink.request` (`packages/shell/src/process-link.ts`)
rejects at its bound by design (ADR-0002 consequence 11). The rejection went up through `MainWindows.open` and
`MainWindows.launch` into `main()`, which awaits the launch. `main()` is started as `void main()`, so the rejection reached
only `process.on('unhandledRejection')`. Main's start-up stopped at the launch: the driver seam, the hand-overs and the capture
seams after it never ran, which is why the proof never reached its measurement. A `workspace.open` request to the workspace
service that got no reply in its 10 s bound took the same path.

**What changed.** `apps/desktop/src/main/workspace-handoff.ts` (`handOffOpenedWorkspace`) makes the hand-off. A reply missed
within the bound, or a link closed first, is one `warn` line ("the run host did not acknowledge workspace.opened (…)"). The
hand-off answers unacknowledged, and the open goes on as it already did for any reply that is not `workspace.ack`. The window
keeps the workspace the service opened, and the open's slot (initialization resolution, the board's queue, the hook review,
the configuration's load) is not scheduled. `MainWindows.launch` now catches any other rejection of the launch's open, logs
it, and leaves the window standing with no workspace open, as a refused open does. The specification does not say what else
a missed hand-off owes, so that is raised as
[OQ-386](../../architecture/open-questions.md#oq-386). The build proceeds under the reading above.

**What pins it.** `apps/desktop/src/main/workspace-handoff.test.ts` runs the hand-off over main's own `ProcessLink` against a
run host that never answers. At the bound it resolves unacknowledged and writes the warning, with no rejection (vitest fails
a file with an unhandled one). A late reply changes nothing, and a closed link is handled the same way. Both cases are red
when the catch rethrows. `apps/desktop/src/main/main-windows.test.ts` ("a launch whose workspace open rejects …") was red
before the change: the launch rejected with the open's error. Now the launch resolves, the window stands with no workspace
id, the line is logged and the readiness is settled. Built-app evidence at the bundle's head, on Windows 11 ARM64, CPU load
43 to 68 %, with other trees' Electron running (`loc1-terminalkill-base`, `loc1-confinementr`, `loc1-rename`):
`compression-proof` passed all eight launches (exit 0, `automatic` included), with no `UNHANDLED` line in any launch log.
`workspace-proof` passed 50, failed 0 and skipped 5 (the platform's own skips). Neither run missed a reply, so the built app
shows the ordinary path unchanged; the missed reply itself is pinned by the unit cases.

**The likely trigger, recorded and not repaired.** The run host warms its skill catalogue in a microtask that runs before its
reply is posted. A slow discovery (8,201.5 ms here) is therefore a slow reply:
[`the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md`](../the-run-hosts-skill-discovery-at-a-workspace-open-runs-before-its-workspace-opened-reply.md).
This bundle's proof logs show the order: "skills: 1 discovered" before "run host: workspace.ack", in the same millisecond.

While checking PD-ORCH-017 on Windows ARM64, `compression-proof`'s `automatic` launch logged `UNHANDLED rejection in main: Error: no reply to workspace.opened within 5000 ms` at `2026-10-16T08:21:30.637Z`. Its final log then reported skill discovery taking 8,201.5 ms and a presenter-liveness lapse. The proof ended the launch at its 180,000 ms bound; SIGTERM ended it after another 4,526 ms. It never reached the compression measurement.

Evidence: `.proof/compression-proof/automatic.log` in `Rotaris-crw-wt-child-cap`, based on `8080fbda` with the child-cap change. The launch was concurrent with the full test suite. Resource contention is a possible trigger, not an established cause. No reproduction in isolation or repair is claimed.

## Specs

No behavioural requirement identified yet. This is a recorded unhandled rejection and a missing compression reading, not evidence that compression itself failed.

## Relevant files

- `apps/desktop/scripts/compression-proof.mjs` — the bounded `automatic` launch.
- `packages/shell/src/process-link.ts` — request/reply timeouts.
- `apps/desktop/src/main/` — the `workspace.opened` handoff and unhandled-rejection log.
