## An orderly quit during the background setup warns that the setup's cancellation could not be delivered

When the application quits while the background initialization run's code-intelligence setup is still running, main
logs a `warning`: "initialization: the setup's cancellation could not be delivered (Error: no window holds a workspace
to address the run host through)". It appears after "run host exited (0)" and "quit: exiting with status 0". The order
explains it. The run host's `shutdown` comes first, then the window closes, and only then does
`InitializationCoordinator.close` abort the run. The run's abort asks the setup port to cancel, but no window holds
the workspace by then and the run host has already exited, so `deliverSetupCancel` throws and the coordinator logs the
failure, as its repair intended for a cancellation that is really lost.

The autopsy calls the line noise, of the same class as the fixed
[`an-orderly-quit-logs-the-run-host-gone-at-error.md`](an-orderly-quit-logs-the-run-host-gone-at-error.md).
That rests on the run host's exit ending the setup's step, and the code does not show that. The run host's `shutdown`
ends runs, discovery, MCP connections and terminals, but not a running setup: `cancelSetup` is not called there. The
step's process is spawned undetached with piped stdio, and whether it outlives the run host was not measured. If it
dies with the run host, the warning is noise at an orderly quit. If it does not, the warning is true, and
REQ-WORKSPACE-092's close clause is not met.

Live-run finding: a71-12

The cancellation's delivery and this log line were added by the repair of
[`a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`](a-workspace-switch-never-cancels-the-outgoing-initialization-run.md).
Recorded, not repaired, when it was written; repaired 2026-10-01 (the outcome below).

## Specs

- `REQ-WORKSPACE-092`: "when the application is closed while setup is running, nothing the step launched SHALL still be
  running 5 s later — neither the command the step itself started nor anything descended from it." At an orderly quit,
  no cancellation reaches the step, by either path. Whether the requirement is met depends on the unmeasured question
  above. (The autopsy recorded "Spec: none found".)
- `PD-MONITOR-002` sets the application log's levels. A `warning` at an orderly quit is noise if nothing was left
  running.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored), `sign-in/app.log`: setup
  started at 02:43:06.749 with `create` running. Line 31 is "run host exited (0)" (02:43:15.304), line 33 is "…was
  closed while its run was under way; the run is cancelled", line 35 is "quit: exiting with status 0", and line 36 is
  the warning (02:43:15.311).
- Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/`, `sign-in/app.log`: `index` running from 03:15:32.383. Lines 35
  to 40 show the same sequence, with the warning at 03:15:38.193.
- In both `sign-in` logs it is the only warning line.

## Relevant files

- `apps/desktop/src/main/initialization.ts:245-246` — `onAbort`, which logs the undelivered cancellation at `warn`.
- `apps/desktop/src/main/initialization.ts:63-76` — `deliverSetupCancel`, which throws when no window holds a workspace.
- `apps/desktop/src/main/initialization.ts:306-337` — `close`, reached at quit through `MainWindows`' `workspaceClosed`
  (`apps/desktop/src/main/index.ts:1157`).
- `apps/desktop/src/run-host/dispatch.ts:633-650` — the run host's `shutdown`, which does not cancel a running setup.
- `apps/desktop/src/run-host/mcp.ts:404-408` — `cancelSetup`, the cancellation the quit never reaches.
- `packages/mcp/src/setup.ts:118` — the step's child, spawned without `processGroup` and with piped stdio.

## Outcome — repaired 2026-10-01

**The unmeasured question, measured.** The test was an orderly quit of the built app (`driver.quit()`) while a setup step
ran, as root under Xvfb, Node 24.

- A stand-in `code_intelligence` launch held `project create` and started a descendant. On the build before this repair,
  both were still running 5 s after the application exited, which took 169 ms. The warning was true: REQ-WORKSPACE-092's
  close clause was not met.
- The bundled runtime, quit during `index`, left nothing running on the build before as well. ~~It ends itself when its
  pipes close, which is why the live runs never showed a leftover process.~~

  *Corrected 2026-10-15 (fin47, acceptance finding A5,
  [`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md)):*
  the struck sentence does not hold for an index that pyright serves. `settings-proof` ended two launches through the
  capture seam's immediate exit, which kills the run host without its `shutdown`, while the runtime indexed the
  checkout's `apps/desktop`. The serena `python3` process and `uv` / `pyright-langserver` (with pyright's `node`) were
  still running more than 6 s after the application's group had ended, until `bounded-launch` ended them with SIGKILL.
  That happened in both launches, at `3c03287`. The measurement above was taken before this repair, while the step was
  spawned undetached, and through the orderly quit. It shows what happened then, and the reason it gave for that was not
  measured. Since this repair the step leads a group and session of its own. The orderly quit still ends it through the run host's `shutdown` (`McpHost.endSetup`;
  `workspace-proof` 8f passed at `3c03287`). A run host that ends without its `shutdown` leaves the step running, which
  is OQ-169's ruled case (PD-WORKSPACE-006): "nothing in main ends a lost run host's step processes".

**Repaired** in three places:

- **The step's process group.** `packages/mcp/src/setup.ts` spawns each setup step as the leader of its own process
  group on POSIX. The ask and the force-kill go to the group, and the grace ends when no member of the group still runs.
  Before, the signal reached the step alone, and a process it had started outlived even an ordinary cancellation.
- **The run host's shutdown.** It now calls `McpHost.endSetup`, which stops the step with a 2 s grace
  (`SETUP_SHUTDOWN_GRACE_MS`), shortening a cancellation's grace already under way. The host exits only once the step has
  gone.
- **The coordinator.** While the application is quitting (`QuitState`), it says an undelivered cancellation at `info`.
  It keeps `warn` for one lost while the application stays. Task 1's repair
  (`initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`) addresses the cancellation by the
  run's own workspace, so "no window holds a workspace" can no longer be the reason.

**After the repair**, on the same measurement:

| Step at the orderly quit | What was left 5 s after exit | Quit took |
| --- | --- | --- |
| Stand-in step that ends on SIGTERM | nothing | 419 ms |
| Stand-in step and descendant that both ignore SIGTERM | nothing (both force-killed) | 2234 ms |
| Bundled runtime, during `create` | nothing | 512 ms |
| Bundled runtime, during `index` | nothing | 473 ms |

**Pinned by:**

- `packages/mcp/src/setup.test.ts`, two cases, both red on the code before: a cancelled step's descendant is ended with
  it, and the shutdown's grace shortens a cancellation's.
- `apps/desktop/src/run-host/mcp.test.ts`: `endSetup` ends a stubborn step and its descendant within 5 s and answers once
  they have gone. On the verifier's second round it went red under load (`expected [ +0 ] to deeply equal []`): it read
  the stand-in's pids file as soon as the file existed, a file created and not yet written read as `[0]`, and pid 0
  names the test's own process group. Its stand-in now writes the file whole (a temporary file, then a rename) and the
  case reads it only once it holds two positive pids; with the stand-in writing an empty file first and the pids 100 ms
  later, the old reader failed that way and the new one passes.
- `apps/desktop/src/main/initialization.test.ts`: no warn line at a quit, and a warn line for the same refusal while the
  application stays.
- `apps/desktop/src/run-host/dispatch.test.ts` (added on the verifier's finding): `shutdown` calls `McpHost.endSetup`
  first and neither closes a store nor schedules the exit until the setup has ended. Red with the call replaced by
  `Promise.resolve()`. Before it, nothing reached that one call: the verifier removed it, rebuilt, and nothing in
  `pnpm check`, `workspace-proof` or `init-proof` turned red, while a quit left both processes running.
- `workspace-proof` scenario 8f (added on the same finding): an orderly `driver.quit()` while a stand-in step holds
  `create` with a process of its own, both ignoring SIGTERM. It asserts the quit ends within 5000 ms through the run
  host's shutdown ending the setup, neither process running 5 s after the exit, and no warning that the close's
  cancellation could not be delivered. On the build with the call replaced by `Promise.resolve()` it failed: the quit
  took 138 ms, the shutdown never reached the setup, and both pids were still running 5 s later. On the verifier's second
  round its stand-in writes each pid file whole (a temporary file, then a rename) and the proof reads only a positive
  pid: a file read between its creation and its write gave pid 0, which would have made 8f skip instead of fail and 8e's
  `process.kill(0, 0)` read a stand-in as running.

**Shown by:**

- The live run `--only=ask` against the self-hosted endpoint (`.live-run/runs/2026-10-01T11-23-06-711Z`, PASSED). Its
  `sign-in/app.log` quits during the bundled runtime's `index`, as the 71ad8e8 pack's did, and carries no warning or
  error line; neither does `ask/app.log`.
- `init-proof`, all five scenarios, with the bundle built.
- `workspace-proof`, 44 passed, 0 failed, 2 skipped.
- `workspace-proof` with scenario 8f, on the verifier's round: 46 passed, 0 failed, 2 skipped, in two runs. In 8f the quit
  ended the app in 2411 ms and 2213 ms, through the run host's shutdown ending the setup, and neither process was running
  5 s after the exit. The proof's own `closeAll` used to kill each launch's main process as soon as the driver's quit
  answered, which cut the orderly end short and left 8b's stand-in running past the launch; it now waits for the exit
  first, and the second run left no stand-in behind.

**Raised:** [OQ-172](../../architecture/open-questions.md), on the verifier's finding. At an orderly quit the window's
close cancels the run a few milliseconds before the run host's shutdown arrives, and the shutdown cuts the cancellation's
grace to 2 s, so REQ-MCP-099's 5 s grace is never given at a close. The build reads REQ-WORKSPACE-109's 5000 ms and
REQ-WORKSPACE-092's 5 s as binding there; a ruling decides which governs.

**Not reached:**

- The live run's sign-in launch ends through the capture seam's immediate exit, a verification seam that sends no
  `shutdown`, so its run host is ended by Electron. The step there ended by itself (the bundled runtime) and nothing was
  left. The orderly path is the one the driver's quit measures above.
- A run host killed by a signal still orphans its step's group, which is OQ-169's open part. On POSIX `processGroup` is
  Node's `detached`, so the step also runs in a session of its own: a signal sent to the application's process group (a
  terminal's Ctrl+C on `pnpm dev`, a harness's group kill) no longer reaches it, and only the run host's own ending of
  the setup does. A descendant that calls `setsid()` itself leaves the group too.
- A step that exits by itself and leaves a process it started running in its group. `terminateSetupChild` is reached
  only for a step still running (cancelled or over its budget), and `endSetup` only for a setup still under way, so
  neither a later step nor the quit ends such a process; REQ-WORKSPACE-092's close clause covers "anything descended
  from it". Not measured: neither the bundled runtime's steps nor the stand-ins leave one behind (on the verifier's
  second round).
- Windows was not measured. *Measured 2026-10-20 (the Windows ARM64 session's B8, Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`): `workspace-proof`'s 8f quit the app in 2,706 and 2,713 ms with the step and its descendant gone 5 s after the exit and no "could not be delivered" line, in two runs; nothing they launched was running 10 s later.*
