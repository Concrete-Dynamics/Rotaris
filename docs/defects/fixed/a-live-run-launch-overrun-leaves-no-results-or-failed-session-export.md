## A live-run launch overrun leaves no results or failed-session export

## Outcome (2026-10-20, loc1 `loc1-live-evidence`, task 1): repaired

Three parts, none of them Windows-specific; the orphaned processes themselves stay the Windows session's
([`the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`](../the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md)),
not repaired here.

- **(a) Whatever ends the run, the pack gets its results.** `apps/desktop/scripts/lib/run-ending.mjs`'s `createRunEnding` is the
  one ending `finish`, the fatal handlers and the signal handlers of `live-run.mjs` all go through: the end-of-run readings, the
  store copied into the pack, `results.json` with every check computed so far (and `ended`, naming what ended the run:
  `completion`, `stop`, `launch-failure` with its scenario, or `error`), the evidence manifest after it, and only then the
  sandbox's removal and the exit. A step that throws is reported and the next still runs; a `results.json` that could not be
  written exits 1. A launch that overran or exited non-zero (or left no screenshot) is a FAILED check of its scenario,
  "`<name>`: the launch ended by itself inside its bound, with status 0", with the reason as its detail (`launchFailure`).
  Before, the throw reached the fatal handler, which deleted the sandbox and exited with nothing written.
- **(b) The failed scenario's session is preserved as a completed one's is.** `launch` reads the store's session ids before it
  starts; on a failure `launchFailure` preserves the newest session the launch created (else the newest the store holds, for a
  launch that continued one) through `preserveRun` — `autopsy.txt`, `session.log`, `summary.md`, `transcript.md` — before the
  throw, and the ending copies `workspace.db` before the sandbox goes. `lib/crlf-scenario.mjs` keeps the fixture's bytes
  (`crlf/files/`) in its `finally`, so a launch that throws no longer removes them unread.
- **(c) The launch's bound ends the wait.** `runElectron` settles through `apps/desktop/scripts/lib/settle-launch.mjs`: on the
  main process's `exit`, then at most 5 s for the pipes to close; whatever still holds them is let go and named
  (`pipesHeldAfterExit` in the scenario's evidence, a warning line), and a SIGKILL never reported as an exit is given 10 s and
  reported. Before, it resolved on `close`, which the dead main's surviving processes held off for eight hours.

Pinned by `apps/desktop/scripts/lib/settle-launch.test.ts` (real children: a child that exits, or overruns and is killed, while
a detached grandchild keeps its pipes for 60 s settles within the drain; each red at 40 s when the wait is `close` alone),
`apps/desktop/scripts/lib/run-ending.test.ts` (a stub launch that throws ends the run with the three earlier checks, the failed
check of its scenario, its session preserved first, `results.json` then the manifest, and the sandbox removed last; and
`live-run.mjs`'s fatal and signal handlers, `finish` and `launch` held to that ending), and
`apps/desktop/scripts/lib/crlf-scenario.test.ts` ("a launch that throws still leaves the files the run wrote in the pack", red
without the `finally`'s copy). `apps/desktop/scripts/lib/launch-sites.test.ts` keeps `runElectron` among its three named
exemptions, its reason updated.

**Shown live, the passing path only:** `timeout 3600 node <tree>/apps/desktop/scripts/live-run.mjs --confirm --skip-build
--only=shell` in the bundle's tree at 2026-10-20 14:05 UTC (endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node
24.18.0 arm64; CPU load 77 %, no other tree's Electron running) passed, its pack `2026-10-20T14-05-51-115Z` holding
`results.json` with 18 checks and `ended: { by: 'completion' }`, and `pnpm evidence verify` passing over its 12 files; neither
launch's pipes were held past its exit (`pipesHeldAfterExit` absent). **Not shown live:** a launch that overruns or throws.
The brief's single-command form for a builder's live check carries no environment variable that would shorten a launch's bound
below the application's own life, so the failure path is shown by the stub and real-child tests above, not by a live run.

## The defect, as recorded

The Windows ARM64 live run at `8080fbda`, pack `2026-10-15T15-16-50-373Z` in the `Rotaris-crw-wt-arm64` worktree, selected `terminal,frictions,crlf`. The first three run launches (`frictions`, `frictions-cut`, `terminal`) saved autopsies and transcripts and each recorded `completed / tasks_complete`. The later `crlf` launch threw from `launch` after SIGKILL at its 522,320 ms harness bound. No final `results.json` was written, and the failed scenario retained only application logs, traffic and two intermediate screenshots: no autopsy, transcript, session export or fixture bytes. The temporary sandbox no longer existed when examined on 2026-10-16.

The surviving traffic contains 25 complete HTTP 200 responses, one aborted response and three unreachable records; two name `getaddrinfo ENOTFOUND`. This does not establish the cause of the launch overrun. The missing store prevents reading its final child state, tool outcomes or stop coherence. The successful scenarios' saved session statuses cannot substitute for the missing suite verdicts.

Found while resuming the owner's unfinished live-run session, 2026-10-16. The scratch launch log is `logs/lr1.log` under that session's scratchpad; the durable evidence pack is `.live-run/runs/2026-10-15T15-16-50-373Z` in the ARM64 worktree. No rerun or repair is claimed.

## Specs

No product requirement contradicted by this observation: the defect is in preservation of verification evidence. The evidence for PD-TOOLS-014 through PD-TOOLS-018 remains incomplete.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `launch` throws before final results are written.
- `apps/desktop/scripts/lib/crlf-scenario.mjs` — preservation follows the awaited launch, so an exception skips it.
- `apps/desktop/scripts/lib/sandbox-sweep.mjs` — temporary stores do not provide a durable substitute for an evidence export.

## Addendum, 2026-10-20 — what the overrun was

Read from the same pack's `crlf/model-traffic.jsonl` and the session's process snapshots. The overrun was not a stall: one
streamed model call, begun at 15:28:52 UTC, carried reasoning deltas only (425,505 bytes, ending mid-sentence) and ran
7,273 s, until the upstream reset it at 17:30:05 UTC; the `ENOTFOUND` records are two new requests 1–3 s later, after the
machine had lost its network. The harness's SIGKILL at the bound (about 15:34 UTC) ended main alone, and `runElectron`,
which resolves on `close`, returned only at 23:33 UTC, when the throw above was printed; two utility processes of the dead
main were still running after that. Those are recorded in
[`the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`](../the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md).
The three earlier scenarios' checks were computed in memory and lost with the throw; their saved summaries read `terminal`
24 tool calls (success 17, soft_pause 4, timeout 1, tool_error 1, one denial), `frictions` 9 (background_running 2,
background_terminal 1), `frictions-cut` 1 (shell_failure 1).
