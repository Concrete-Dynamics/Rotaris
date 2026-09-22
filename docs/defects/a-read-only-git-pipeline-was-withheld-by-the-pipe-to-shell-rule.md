## A read-only git pipeline was withheld by the pipe-to-shell rule

Observed 2026-09-20, run `2e21e324`: `tool_calls` ord 330 (status `blocked`) — `git status --porcelain; echo ---- ; git ls-files tests | powershell -NoProfile -Command "$input | Select-Object -First 20"` — was denied by `starter:deny-pipe-to-shell` (`pipe to shell`). It is the single deny among 340 permission decisions. The transcript shows the agent rerouting at row 585 (`Let me use simpler commands without pipes`) and succeeding at row 586 with bare `git status --porcelain`.

## Specs

REQ-TOOLS-036/038 — the pipe-to-shell matcher and the `starter:deny-pipe-to-shell` deny. The matcher fired as specified (a `|` segment feeding a shell name); recorded here for cost, not contradiction.

## Relevant files

- `packages/agent-tools/src/policy.ts` — `starter:deny-pipe-to-shell`, the pipe-to-shell matcher.
- `packages/agent-tools/src/tools/files.ts` — no twin read path was offered; the agent fell back to a bare `terminal` call.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.

**Raised with the owner, 2026-09-22 — [R-047](../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.
