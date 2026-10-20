## A live-run launch overrun leaves no results or failed-session export

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
[`the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md`](the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md).
The three earlier scenarios' checks were computed in memory and lost with the throw; their saved summaries read `terminal`
24 tool calls (success 17, soft_pause 4, timeout 1, tool_error 1, one denial), `frictions` 9 (background_running 2,
background_terminal 1), `frictions-cut` 1 (shell_failure 1).
