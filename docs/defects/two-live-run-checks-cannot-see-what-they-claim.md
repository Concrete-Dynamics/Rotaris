## Two live-run checks cannot see what they claim

- **"the ladder retried past the refusals rather than giving up"** counts proxy traffic only: more calls than injected
  refusals passes. The model client's own dispatch-layer retries satisfy it without the ladder being reached, which is
  what happened (L3).
- **"the agent ran the suite through the terminal tool"** passes on any agent's `terminal` call. The prompt asks the
  orchestrator to run `node --test` "yourself", which REQ-TOOLS-006's `coordinator_only` control makes impossible — the
  orchestrator holds no terminal — so the check passes on the children's calls while the thing it names never happens.

Live-run finding: H3 (live runs of 2026-09-29)

**Ruled in part 2026-09-29 — [OQ-110](../architecture/open-questions.md), [R-067](../product/requests.md#r-067):** the dispatch layer's retries come
first, as the specification states, and "the live run's ladder check says what it can see". The first check's repair is
to claim only that the run survived the refusals, or to read the ladder's own trace (an issue, a wait, a timeline entry,
or OQ-110's session-log line) before claiming the ladder handled them.

## Specs

- None; harness. OQ-110 (`REQ-CONFIG-086` before `REQ-ORCH-091/092`); `REQ-TOOLS-006`.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `474a2d22` (`faults-ladder`): the check passed on 5 calls for 2 refusals, all retried by the SDK.
  Session `ccc662d9` (`edit`): the orchestrator answered "Run node --test yourself"; the check passed on the children's
  calls.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1584` — the ladder check.
- `apps/desktop/scripts/live-run.mjs:1106` — the prompt's "yourself"; `:1118` — the terminal check.
