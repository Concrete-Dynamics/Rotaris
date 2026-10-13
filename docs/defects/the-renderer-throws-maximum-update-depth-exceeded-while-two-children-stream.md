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

## Read from the code 2026-10-13 (fin35) — no path found; open

One more attempt, by reading rather than driving: every effect, subscription and store selector of the main window's
renderer (`packages/ui/src`, `apps/desktop/src/renderer`) against what React 19.2.8 actually counts. Nothing was changed in the
product.

**What has to happen, read from the shipped `react-dom` (`react-dom-client`, 19.2.8).** At the end of every commit React reads
`root.pendingLanes`; when the commit's lanes are update lanes (mask `261930`) and Sync, InputContinuous or Default work is still
pending (mask `42`) it adds one to `nestedUpdateCount`, otherwise it sets it to 0, and the 52nd update scheduled while the count
is above 50 throws #185 from `getRootForUpdatedFiber`. Three facts of this build narrow what can keep the count rising:

- A sync flush renders every pending Default update with it (`getHighestPriorityLanes` returns `lanes & 42` whole), so a Default
  update pending when a push arrives is consumed by the push's own render; it cannot stay pending across it.
- A Default render is not time-sliced (`performWorkOnRoot` renders concurrently only when `lanes & 127` is 0), so a push cannot
  interrupt and starve a long Default render of the transcript: fin32's "a queue behind a starved default render" is ruled out
  by the scheduler itself, not only by the drive.
- No lane can stay pending suspended: the renderer has no `Suspense`, `lazy`, `use`, `startTransition`, `useTransition` or
  `useDeferredValue` (searched; none outside tests).

So 51 counting commits in a row need every one of them to schedule new work **during its own commit** — a layout effect
(Sync) or a passive effect of a sync commit, which React flushes before the check (`pendingEffectsLanes & 3`), at Default
priority — and the last of them to leave a Default update pending while the next IPC push runs ahead of the scheduler's task.

**Ruled out, effect by effect.** An AST pass over every `useEffect` and `useLayoutEffect` in the two trees listed each direct
call in an effect body (a TypeScript-compiler pass, not kept in the repository); those that run on a push commit:

- `TranscriptPane`'s every-commit layout effect (`measureAtCommit`) schedules `setMeasuredVersion` only while a bound row's
  measurement key is unmeasured AND its height differs from its identity's last; the next commit finds it measured, so the
  chain is bounded by the pool's capacity and its last commit leaves nothing pending. Its re-observing layout effect, its
  table commit and its scroll-restoring layout effect set no state (`scrollSelf` moves `scrollTop`; the scroll event is a later
  task). Its observer delivery renders in `flushSync` and releases the held range by a Default update after it, which the next
  push's sync render consumes — one counting commit at most.
- `WorkspaceView`'s every-commit passive effect calls `registerComposer` with a new object; no subscriber selects `composer`
  (every `useShellState` selector reads one field), so it schedules nothing. `registerOverlay` runs on its own dependencies only.
- `useWorkspaceUsage` re-reads on every change of the session's usage, but its `setUsage` comes in the reply's own task, with
  no commit of its own before the next push consumes it. `useNeedsRecovery`, `useConfigSnapshot`, the Overview and Mission
  configuration reads and the attachment reads set state only from promises, timers or microtasks, and only when a value moved.
- The 1 s clocks (`useElapsedTick`, `RunHeader`, `WorkspaceView`, `TranscriptPane`'s live tick) schedule from timers, outside a
  commit.
- Every store selector reads a field or derives a primitive (`stripModel` returns the model's string); `useTerminalCounts`
  returns a string and `useChatControls` the bound object, both stable between notifications; `displayPrefs` and
  `refreshStats` are selected whole but set only on a preference change or a whole-session reset.

**What this leaves.** The code holds no self-renewing update on a push commit, so the mechanism is not in the main window's
own effects as read. Not covered by this reading: a component library's own effects, and a persona window's renderer (`windows.tsx`),
which D8's pack does not say was open — its replica reaches React through one trailing 120 ms timer (`followCoalesced`), a
Default update outside any commit, so it is the less likely of the two. The discriminating evidence is still the drive fin32 named — a
development build, where #185 names the update's owner, with the `pendingLanes` trap logging, per counting commit, the fibers
holding the pending lanes — or a duress pack whose `app.log` carries the trap's lines. **What a live run should show** is
unchanged: any "Minified React error #185" line in `duress/app.log`, its time against the children's streams.

## The final duress pack at `552d346` (2026-10-13, fin38) — 0 lines; open

**What the live run showed.** The final duress live run at `552d346` (pack `2026-10-13T08-12-41-551Z` of the live worktree,
`live-run PASSED`, 30 PASS, 9 NOTE, 0 FAIL) carried **0** "Minified React error #185" or "Maximum update depth" lines: 0
`capture: renderer console` lines of any kind in `duress/app.log`, `duress/app.filtered.log`, `sign-in/app.log` and
`sign-in/app.filtered.log`, with the relay live (`apps/desktop/src/main/capture/index.ts:30`). It ran **525 s** of two or more
children streaming at once — 08:14:11 to 08:16:11 (119 s; a, b and c) and 08:19:28 to 08:26:16 (407 s; d and e1), d's
138.1 s request 80 overlapping e1's requests 78, 79 and 81 by 40.7, 49.7 and 45.5 s, the shape of the `a68f121` errors, over a
929 kB transcript ([`live-552d346-duress-autopsy.md`](../architecture/live-runs/live-552d346-duress-autopsy.md), finding D8;
the orchestrator's scratchpad copy until 2026-10-13). The default pack of the same build
carried 0 as well, with two children streaming at once in `edit` and `resume`. One more absence does not discharge the note:
the seven errors of `a68f121` were never explained, only not seen again.

**Read from the code again.** The renderer commits since fin35's reading (`40914f9`, the Mission table's persona cell in CSS;
`d15086a` and `b4167e1`, the requirements review pane's owed read) set state only from a read's promise or a user's gesture,
never in a commit a push causes, so they add no self-renewing update to the path fin35 ruled out. No path was found; nothing
in the product was changed.

**The count the note owed.** `live-run.mjs` now counts, for every launch, the relayed renderer console lines naming #185 or
"Maximum update depth" (`apps/desktop/scripts/lib/renderer-console.mjs`, `updateDepthErrors`, pinned by
`renderer-console.test.ts`): the count goes to `results.json` (`scenarioEvidence.<name>.reactUpdateDepthErrors`), and a launch
with any is a NOTE naming each line. **What a live run should show** is unchanged, and is now on the console: no such NOTE, and
`reactUpdateDepthErrors: 0` for `duress`.
