## Two ask-timeout denials burned 300 s each on one write path

Observed 2026-09-21, run `1ddeb71b` (NodeGrade, `v1-7e814b4aba02273c0589405a68a5fc5c`): two `write_file` calls (tool_calls ord 130–131, status `blocked`) were denied after the full approval wait expired with no answer — issues ord 1–2: `No rule matched; permission mode 'ask' defaults to ask. Denied because no answer arrived within 300 seconds.` The two waits account for ~600 s of the run's wall time (autopsy elapsed sums: `write_file [blocked]`: 2 calls, 600,049.4 ms). The agent rerouted and the run continued.

## Specs

REQ-TOOLS-052 (timeout → deny) and REQ-TOOLS-055 (the shared approval budget) — both fired as specified; recorded here for cost, not contradiction. The design question it leaves: an unattended stretch of a run pays the full wait per ask before failing closed.

## Relevant files

- `packages/agent-tools/src/gate.ts` — the timeout → deny path and the reason text.
- `packages/config/src/sections/runtime.ts` — `approval_timeout_seconds`, the bound both waits burned.

Noticed 2026-09-21 by the run-autopsy of run `1ddeb71b`.

**Raised with the owner, 2026-09-22 — [R-047](../../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

**Ruled 2026-09-23 — [`PD-TOOLS-005`](../../product/directives.md#pd-tools-005), [R-048](../../product/requests.md#r-048).** After one approval
wait in a run ends by timeout, the run treats the user as away and resolves every further ask at once under
`runtime.headless_approval_policy`, until the user next sends input to the session. In this run the second
`write_file` ask would have been refused without its 300-second wait. The note stays open until the
directive is built.

**Repaired 2026-09-28 under [R-062](../../product/requests.md#r-062)** — `PD-TOOLS-005` built. The gate
(`packages/agent-tools/src/gate.ts`) marks the run's `UserPresence` (`packages/engine/src/run/presence.ts`, one holder
per run, handed to every agent's port through `ToolPortContext.presence`) when a brokered wait ends by timeout, and while
it is marked resolves every further ask that would prompt at once under `runtime.headless_approval_policy`, with the
decision source `headless-policy` and a reason naming the timeout that expired; the user returns on their first input
to the session (`packages/engine/src/sessions.ts` — the top of `control` and its `clearTranscript` branch,
`controlAsync`, the id-routed answers). In
this run the second `write_file` ask would have been refused at once: two unanswered asks cost one timeout, not two.
Pinned by `packages/agent-tools/src/gate.test.ts` ("PD-TOOLS-005: … the first ask waits the full timeout … the second
resolves at once with the directive's reason" — still waiting at 4,999 ms, marked at 5,000, the second ask with no wait
and no dialog), `apps/desktop/src/run-host/tools.test.ts` ("PD-TOOLS-005: the run's away holder reaches the gate" — the
configured 300 s wait through the real port) and `packages/engine/src/children/children.test.ts` ("PD-TOOLS-005: … a
child's ask in an away run reads the mark the root's expired wait set"). The relative links above are as the note was
written in `docs/defects/`, re-based on the move to `fixed/`.
