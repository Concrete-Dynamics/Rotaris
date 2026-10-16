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
