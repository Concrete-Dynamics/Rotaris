## The renderer throws "Maximum update depth exceeded" while two children stream

While two children of one run streamed reasoning at the same time, the renderer threw React error #185 ("Maximum update
depth exceeded") seven times in 46 s. Each was uncaught, raised inside the callback of a pushed IPC event — the preload's
subscription handler `(_e, payload) => fn(payload)` — so the update that crossed React's nested-update limit was scheduled by
a push, not by a person's action. The screens recovered and the counts matched the rows; which component's update loop it
was is not named by the minified message.

Live-run finding: D8 of the final duress live run at `a68f121` (2026-10-07, pack `2026-10-07T07-09-30-708Z` of the live
worktree, session `e6747bd0`, the self-hosted endpoint).

- `duress/app.log` lines 163 to 174: "capture: renderer console: Uncaught Error: Minified React error #185" at 07:19:40.057,
  07:19:46.552, 07:19:54.266, 07:20:00.497, 07:20:11.135, 07:20:20.633 and 07:20:26.467, each located at
  `out/preload/index.cjs:8840`, the IPC subscription handler (`apps/desktop/src/preload/index.ts:12`).
- At every instant d's req 98 (113 s, about 34 kB of reasoning) and e's req 101 were streaming reasoning in parallel; the
  capture was idle, its last action before 07:10.
- 0 occurrences in the eight earlier packs of the live worktree, among them the `a68f121` default pack and both 2026-10-06
  duress packs. The live harness reads the line at `info` and passes.

## Specs

- None found: the specification states no renderer-error budget. The live transcript surfaces (domain 03, REQ-CHAT) are where
  the pushes land.

## Relevant files

- `apps/desktop/src/preload/index.ts:12` — `subscribe`, where the error surfaces.
- `packages/ui/src/` — the components that take the pushed transcript increments and session snapshots (the throwing one is
  not identified from the minified message).
- `apps/desktop/src/renderer/shell.ts` — the two push handlers that apply to the replica, whose store notifies its
  `useSyncExternalStore` subscribers synchronously.
- `apps/desktop/src/run-host/scripted-client.ts` — `think:<deltas>:<ms>`, the scripted long deliberation the investigation
  drove (verification only).

## Investigated 2026-10-07 (fin32) — not reproduced; open

**What the error means here.** React 19.2's #185 is thrown by `getRootForUpdatedFiber` when an update is *scheduled* while
`nestedUpdateCount` exceeds 50, and that count rises at the end of every commit whose committed lanes are sync, input,
default or transition and which leaves sync, input-continuous or default work pending on the root (it resets at any commit
that leaves none). The error surfacing in the preload's handler means the push's own update — `replica.applyIncrement` or
`applySnapshot` notifying the zustand store, whose `useSyncExternalStore` subscribers force a sync re-render — was the first
update scheduled after 51 such commits in a row. So the loop is not a component setting state on its own push: it is a run of
51 commits each leaving work pending, ended by the next push.

**What was driven.** The built app (`pnpm build`, production React) through `pnpm app:drive`, on a scratch workspace in
`autonomous` mode with the scripted dialect, a coordinator delegating two, then four, background children each scripted
with the new verification-only step `think:<deltas>:<ms>` (`apps/desktop/src/run-host/scripted-client.ts`; up to 100,000
reasoning deltas, one every 3 to 15 ms), on the Workspace view with the Inspector following, at host load 13 to 16. A trap on
the React root's `pendingLanes`, installed through the driver's `eval`, counted the commits that left work pending and named
the fibers holding it. Over about 3,700 commits and 2,400 applied increments (about 15 a second): no #185, no uncaught
error, and never two such commits in a row (the simulated count's maximum was 1). The work left pending was the App's 1 s
clock and, once each at mount, three `SearchableSelect` instances — each cleared by the next default render. Holding the
renderer's main thread for 4 s while two children streamed queued no backlog: main coalesces publications while the window
is busy (six commits followed the hold), so a queue of pushes behind a starved default render is not the mechanism either.

**What a reproduction still needs.** The conditions this drive did not have: the duress session's 1 MB transcript of long
Markdown rows, real deliberations whose rows grow, the live capture's seams, and the self-hosted model's pacing. A drive of a
development build would name the throwing update's owner in the component stack; the `pendingLanes` trap above would name
the fibers holding the pending work on each of the 51 commits. Nothing was repaired.

**What a live run should show.** The next duress run's `duress/app.log`: any "capture: renderer console: Uncaught Error:
Minified React error #185" line, its time against the children's streams. The harness reads the line at `info` and passes; a
count of them in the live run's NOTE lines is owed to whoever takes this note next.
