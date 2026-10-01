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

## Repaired — 2026-10-01

`entryModelKeys` (`packages/engine/src/autopsy.ts`, and its copy in `apps/desktop/scripts/lib/autopsy-entry-model.mjs`)
now takes the children's names (`readAutopsy` and `autopsy.mjs` pass the children record's `given_name`s) and reads the
ladder's two automatic moves of every other agent an entry names, which is the root:

- `quota_fallback_model` (REQ-ORCH-091 b, REQ-NOTIFY-082) moves the root to its `to_key`, read as a label as every other
  key is (a loader-made copy reads as its one original);
- `llm_unresponsive` (REQ-ORCH-090), which records no key, moves the root to the one `models:` key of the snapshot in
  force that resolves to the recorded `to_provider|to_model` pair, and to the pair itself (`provider/model`) when no key
  or more than one resolves to it, never one key given as fact.

After either move the root's pair is the new one, so a later `model_override` of that pair moves it on, a later
`entry_model_switched` replaces it, and the next continuation's snapshot (a new run, a new root cell) ends it. A move that
names a child, or that records no agent or no pair, leaves the root where it is.

Pinned by (each fails without the repair, ten in all; the child and the skipped-entry cases pass both ways and guard the
other direction):
- `packages/engine/src/autopsy.test.ts`, "the ladder's automatic moves of the root …": a planted session whose root's
  same-tier fallback prints `root-model → spare-model`, an unresponsive fallback onto a keyed pair the same, onto an
  unkeyed pair `root-model → mistral/x`, a child's moves leave `root-model`, and a continuation after the move prints
  `root-model → spare-model → root-model`.
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, the moves table: the script's copy and the engine's function
  give the same keys on the same timelines, including two keys resolving to one pair and an override following a fallback.

No live run shows it: a pack's `autopsy.txt` prints a move only when a root falls back, and none did in the
2026-10-01 runs; the tests are the evidence.
