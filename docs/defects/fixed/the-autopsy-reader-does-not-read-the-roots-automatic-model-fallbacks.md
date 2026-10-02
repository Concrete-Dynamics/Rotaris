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
now takes the children's names and reads the ladder's two automatic moves of every other agent an entry names, which is
the root. The names are the children's canonical names (`childModelKeys`, in both copies; `readAutopsy` and
`autopsy.mjs` key each child's `model_key` by it), the name a child's turns run under (`agentName: row.canonical_name`)
and so the name its tool calls and the ladder's entries carry:

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

### Repair round 1 — the children by their canonical names (2026-10-01)

The first repair passed the children record's `given_name`s, but a child's records name it by its canonical name
(REQ-ORCH-044: the model's words with spaces and punctuation made `-`, a reused name given `_<n>`), so a child's own
fallback still read as the root's whenever the two names differed, which is the usual case. The verifier found it on the
branch's own live pack (`.live-run/runs/2026-10-01T17-04-24-814Z`: `given_name` 'Run 13 shell commands verbatim',
`canonical_name` and `tool_calls.agent_name` 'Run-13-shell-commands-verbatim'). The same `given_name` keying, older than
this note, also put such a child's own tool calls under the root's key. Both readers now key the children by
`canonical_name` (`childModelKeys` in `packages/engine/src/autopsy.ts` and `apps/desktop/scripts/lib/autopsy-entry-model.mjs`).
On a copy of that pack's store with the child's `model_key` planted different from the root's, `autopsy.mjs` printed
the child's 14 calls under the root's key with the root's 5 before the repair, and under the child's own key after it.

Pinned by `packages/engine/src/autopsy.test.ts`, "a child is known by the name its own records carry …" (a child given
'Run 13 shell commands verbatim' whose calls and two fallbacks name 'Run-13-shell-commands-verbatim': the root stays on
`root-model` and the child's calls print under `child-model`; before the repair the root read `root-model → spare-model`
with all five calls), and `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`, "knows a child by its canonical name …"
(both copies of `childModelKeys` key by `canonical_name`, and the child's moves leave the root on `root-model`). The
first sizing test's fixture, which planted a child whose calls carried its given name, now carries the product's shape.

A continuation that records no entry model (`config_snapshot: {}`, which `run.ts` writes when the run holds no
configuration snapshot) is still a new run with a new root cell, so it now ends a move as well: the root reads back on
its configured key, or `undetermined` when nothing ever named one. Pinned by "a continuation recording no entry model …"
in `packages/engine/src/autopsy.test.ts` and three rows of the moves table (two fail without it; the third, with no move
in force, guards the other direction). One reading stays coarse and is recorded as its own note:
[the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md](the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md)
(a switch onto the model already configured, which the run does not rebuild the root's cell for).

### Repair round 2 — a collision recorded (2026-10-01)

The canonical-name keying is unique only per parent and per iteration (REQ-ORCH-044), so two children of one session can
share a name: a later run's child reusing an earlier run's child name, or a grandchild named like a child. The reader then
prints both children's calls under the later one's key, and the tool-call record carries no task id to tell them apart.
Recorded as its own note, not repaired here:
[the-autopsy-reader-puts-two-children-sharing-a-canonical-name-under-one-model-key.md](the-autopsy-reader-puts-two-children-sharing-a-canonical-name-under-one-model-key.md).
Both copies' doc comments now also state a second coarse reading: a switch is held on its run alone (`entryOverride` in
`run.ts`; a continuation is a new `Run`), so a later continuation that records no snapshot starts on its configuration's
model, while the reader keeps the switched key as the configured one. Only snapshot-less runs reach it.
