## workspace-proof's unanswered setup start ends as "the run host has stopped" on this host

`pnpm workspace-proof`'s check for REQ-WORKSPACE-084 / 093 / 103 ("a setup start the run host never answers fails retryably in
REQ-WORKSPACE-093's summary, not as a task with no outcome") fails. The queued run ends
`initialization: code-intelligence-setup → failure — … The run host has stopped; no run can start until the application is
restarted`, while the report reads `retryable true` and the summary REQ-WORKSPACE-093 asks for. So the run host stops rather than
leaving the start unanswered, and the check reads the run's ending rather than the summary. Which side is wrong is not established.
Measured 2026-11-21 on the Linux agent host with the code-intelligence bundle present: 62 passed, 2 failed, 2 skipped, identically
on `origin/main` (`de844b71`, a detached probe tree) and on the updater branch `auto-update-pending`, which does not touch this path.

## Specs

REQ-WORKSPACE-084, REQ-WORKSPACE-093, REQ-WORKSPACE-103.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs`: the unanswered setup-start scenario
- `apps/desktop/src/main/` and `apps/desktop/src/run-host/`: where a setup start the run host does not answer is ended
