## Two ask-timeout denials burned 300 s each on one write path

Observed 2026-09-21, run `1ddeb71b` (NodeGrade, `v1-7e814b4aba02273c0589405a68a5fc5c`): two `write_file` calls (tool_calls ord 130–131, status `blocked`) were denied after the full approval wait expired with no answer — issues ord 1–2: `No rule matched; permission mode 'ask' defaults to ask. Denied because no answer arrived within 300 seconds.` The two waits account for ~600 s of the run's wall time (autopsy elapsed sums: `write_file [blocked]`: 2 calls, 600,049.4 ms). The agent rerouted and the run continued.

## Specs

REQ-TOOLS-052 (timeout → deny) and REQ-TOOLS-055 (the shared approval budget) — both fired as specified; recorded here for cost, not contradiction. The design question it leaves: an unattended stretch of a run pays the full wait per ask before failing closed.

## Relevant files

- `packages/agent-tools/src/gate.ts` — the timeout → deny path and the reason text.
- `packages/config/src/sections/runtime.ts` — `approval_timeout_seconds`, the bound both waits burned.

Noticed 2026-09-21 by the run-autopsy of run `1ddeb71b`.

**Raised with the owner, 2026-09-22 — [R-047](../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.
