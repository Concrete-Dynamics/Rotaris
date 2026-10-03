## A child moved by a fallback is drawn on its configured model

A delegated child whose ladder cell moves off its configured pair — a same-tier fallback after a quota or rate-limit answer
(REQ-NOTIFY-082, REQ-ORCH-091 b), a pre-call move off a pair the session holds out of quota (REQ-MONITOR-194), an
unresponsive-model fallback (REQ-ORCH-090) or the REQ-ORCH-088 timeout's fallback — keeps being projected with its configured
`children.model_key`: the inspector's Model field and the persona window's read-only model name the configured key, and its
context ring's limit is that key's maximum input (`contextLimitFor(c.model_key)`), while every call goes to the candidate. The
run-level agent has the same fault
([`the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`](the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md));
a child's cell is built per execution by the run's `resilience.forChild` with no name to find it by, so the projection has no
live key to read. Found by fin11's triage of open notes (code reading, not driven). Not repaired: the repair keys each child's
cell by its canonical name in the run (beside `forChild` in `packages/engine/src/run/run.ts` and its caller in
`packages/engine/src/children/`), exposes the live key to `toAgentRecord`, and reads both the model and the limit from it. Size
S to M.

## Specs

- REQ-MONITOR-052 / REQ-MONITOR-069 — the inspector's model selector and the instance card's read-only model value name the
  agent's model.
- REQ-MONITOR-049 — "the context limit is the model's maximum input tokens": the model the agent runs on, which the run-level
  agent already follows.
- REQ-MONITOR-066 — the selector names the agent's current model "rather than showing a wrong or blank one".

## Relevant files

- `packages/engine/src/sessions.ts` — `toAgentRecord`: `model: c.model_key` and `contextLimit: facts.contextLimitFor?.(c.model_key)`.
- `packages/engine/src/run/run.ts` — `resilience.forChild`, which builds each child's cell (`agentCell`) unnamed.
- `packages/engine/src/run/ladder.ts` — `limitPath` and the unresponsive and timeout paths, which change `cell.model` and no
  record field.
