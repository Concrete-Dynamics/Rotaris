# ADR-0054 — Packaging, the four artifacts, and self-update — Planned, not built — the background download and the next-start apply (2026-10-22, R-084)

Part 22 of 23 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Planned, not built — the background download and the next-start apply (2026-10-22, R-084)

[R-084](../../../product/requests.md#r-084) asks for an update that downloads by itself, waits as a pending update, and is
applied at the next start or by `Restart now`. **This record's decision is unchanged and retained:** Alternative B, the
bespoke main-process updater; `electron-updater` stays refused for the reasons in Alternative A, and its install-at-quit
pattern is not the contract. What the request changes is what the updater does after the digest matches, and it is
recorded where behaviour is recorded: REQ-STARTUP-169 to REQ-STARTUP-181 (minted at the owner's ask, decided rather than
derived), `PD-STARTUP-008` and `PD-SHELL-005` revision 2. The stages that build it, the design they share (the pending
update under the per-user data directory, its re-verification against the running build's keys, the installed flavour's
apply by the launch that holds the instance record, the atomic portable swap) and the twelve decisions reserved to the
owner are in [`../background-update-plan.md`](../../background-update-plan.md). Nothing here is a first execution; each stage
reports into this record when it builds.

**The pending update, built — 2026-11-21 ([R-117](../../../product/requests.md#r-117); the plan's PR-2).** The click flow
still triggers everything; what follows the digest changed. The download streams into `<data>/updates/<version>/<asset>.partial`
(never the temporary directory, which REQ-STARTUP-122's fresh `rotaris-update-` directory was), is renamed only after the
digest matched, and is kept with the exact manifest and signature bytes and one atomically written record,
`pending.json` (`updater/pending.ts`, REQ-STARTUP-171). The portable and, since UD-11, the AppImage replace their artifact
at once and keep `<name>.old` until a launch of the replaced artifact has painted (REQ-STARTUP-176); the installer runs
from the pending directory and the installer hand-off record is no longer written (an earlier build's is still
honoured). `updater/revalidate.ts` re-verifies from the retained bytes alone against the running build's keys
(REQ-STARTUP-172), built and unit-tested, called by no launch yet. **What was executed:** every row of the plan's part 4
that this stage covers, over fakes with the interruption injected at each port call (`updater.interruptions.test.ts`),
and, in the built application on a developer's Ubuntu host, a not-updatable launch leaving a planted pending update
byte-for-byte (`updater-proof`, REQ-STARTUP-173). **What was not:** the real `updates` port against a released artifact —
no packaged build has downloaded into it — and the next-start apply, the automatic trigger and the cancel, which are later
stages.
