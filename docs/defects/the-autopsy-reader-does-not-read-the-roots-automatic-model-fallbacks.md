## The autopsy reader does not read the root's automatic model fallbacks

The autopsy reader's per-model-key line prints the entry agent's calls under the keys its own records name
(`entryModelKeys`, `packages/engine/src/autopsy.ts`): its snapshots, its `entry_model_switched` switches and the
session's `model_override` entries for the pair it runs on. Two automatic moves of the root are recorded but not read:

- the same-tier fallback after a rate limit or quota response (REQ-ORCH-091 b, REQ-NOTIFY-082): the ladder sets the
  agent's cell to the candidate and records `quota_fallback_model` with `agent`, `to_provider`, `to_model` and `to_key`;
- the role's fallback after an unresponsive model (REQ-ORCH-090): the ladder sets the cell to the fallback and records
  `llm_unresponsive` with `agent`, `to_provider` and `to_model`, but no key.

The root's cell lives for the run (`rootResilience` in `packages/engine/src/run/run.ts`), so after either move the root
runs on the new model until the run ends or its entry model is switched, while the reader still prints the key it moved
from. In the 2026-10-01 stores no root made either move, so no printed line was wrong. Noticed while repairing the
`model_override` reading of `entryModelKeys` (fin2-log-and-reader, repair round 1); recorded, not fixed.

## Specs

- None; harness reader. The line it prints is the run-autopsy skill's evidence for which model the entry agent ran on.
  Reading the moves needs the root's agent name (the entries name the agent, and the children record names only the
  children) and, for `llm_unresponsive`, a key looked up from the recorded pair in the snapshot's `models:`.

## Relevant files

- `packages/engine/src/autopsy.ts` — `entryModelKeys`, and `readAutopsy`, which knows the children's names.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy of `entryModelKeys`.
- `packages/engine/src/run/ladder.ts` — the `llm_unresponsive` and `quota_fallback_model` entries and the cell moves.
- `packages/engine/src/run/run.ts` — `rootResilience`: the root's cell lives for the run.
