## The inspector names the configured model while the root runs on a same-tier candidate

After the ladder moves the root to a same-tier candidate (REQ-ORCH-091 b, REQ-NOTIFY-082) — after a quota answer, or since
fin10 before its first call when the session holds the configured pair out of quota — the inspector's Model field for the
run-level agent still names the configured key. Seen 2026-10-03 (fin10, quota-exclusions-and-choices) in
`resilience-proof`'s `next-run-choice` launch (`.proof/resilience-proof/next-run-choice-run-header.png`): with alpha
excluded, the held prompt's root ran on `scripted-b/beta` (the scripted client logged `scripted/beta`, and the
`quota_fallback_model` entry carries `pre_call: true`) while the inspector read "Model alpha". The run-level agent's model
is the entry role's (`entryRole` / `modelInForce` in `packages/ui/src/agents.ts`), which follows a session-wide override
(`SessionRecord.modelOverrides`) but not a per-agent ladder move, which is no override. With the pre-call read, every run of
a session whose configured model is excluded now runs on the candidate, so the mismatch shows on every such run, not only
after a failure in the run. Not repaired (outside the task that saw it).

## Specs

- REQ-MONITOR-066 — the model selector names the agent's current model "rather than showing a wrong or blank one".
- REQ-NOTIFY-082 — the move to the same-tier candidate is transparent ("without asking the user"); it does not say the
  surfaces keep naming the pair left behind.

## Relevant files

- `packages/ui/src/agents.ts` — `entryRole` and `modelInForce`: the run-level agent's model from the configured key and the
  overrides in force.
- `packages/ui/src/Inspector.tsx` — the Model field (`inspector-model`), whose value is the shown agent's `model`.
- `packages/engine/src/run/ladder.ts` — the same-tier move (`limitPath`), which changes the root's cell and no record field.
