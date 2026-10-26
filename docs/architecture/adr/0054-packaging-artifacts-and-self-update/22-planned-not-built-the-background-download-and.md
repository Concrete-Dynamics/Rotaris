# ADR-0054 — Packaging, the four artifacts, and self-update — Planned, not built — the background download and the next-start apply (2026-10-22, R-084)

Part 22 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

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
