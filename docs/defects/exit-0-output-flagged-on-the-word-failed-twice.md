## Exit-0 output flagged on the word FAILED twice in one run

Observed 2026-09-20, run `2e21e324`: two commands that exited 0 were recorded `suspicious_success` on the literal `FAILED ` marker. `tool_calls` ord 114 (`docker info --format …; docker compose version`) warned `Output contains the failure marker 'FAILED'.` on docker's `failed to connect to the docker API` line; ord 229 (`git --no-pager diff -- …`) warned the same on git's `LF will be replaced by CRLF` lines matching `failed` case-insensitively. Timeline ord 7 and 22 filed both as `terminal_suspicious_success` warnings, and transcript row 382 shows the agent explaining one away (`The "FAILED" marker is a false positive`).

## Specs

REQ-TOOLS-113 — literal failure markers searched case-insensitively, `FAILED ` with the trailing space. The warnings fired as specified; recorded here for cost, not contradiction.

## Relevant files

- `packages/agent-tools/src/terminal/classify.ts` — `MARKERS`, `outputWarnings`.
- `packages/agent-tools/src/gate.ts` — the `terminal_suspicious_success` issue on `suspicious_success`.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.
