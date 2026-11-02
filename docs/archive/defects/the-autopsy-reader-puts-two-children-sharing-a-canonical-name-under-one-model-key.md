## The autopsy reader puts two children sharing a canonical name under one model key

The autopsy reader keys each child's `model_key` by its canonical name alone (`childModelKeys`, a `Map` from
`canonical_name` to `model_key`), and attributes every tool call to the key its `tool_calls.agent_name` finds there.
A canonical name is unique only among the siblings of one parent in one iteration, plus the session's root names: the
ledger's uniqueness set is the caller's siblings (`childrenOf`, over `all()` = this iteration's tree) and the recorded
roots' names. So two children of one session can share a canonical name: a child of a continued session's second run
that reuses the first run's child name, or a grandchild named like a child of the root. When the two carry different
`model_key`s, the map keeps the later child's key (`childModelKeys([{canonical_name: 'impl', model_key: 'big-model'},
{canonical_name: 'impl', model_key: 'small-model'}])` returns `[['impl', 'small-model']]`), and the reader prints every
call of both children under that one key. The tool-call record cannot tell the two apart either: `tool_calls` carries
`agent_name` and no task id, and the ladder's `quota_fallback_model` and `llm_unresponsive` entries name the agent the
same way. The `given_name` keying this replaced on 2026-10-01 had the same flaw.

Noticed 2026-10-01 while repairing
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md)
(fin3, repair round 1; recorded in repair round 2). Read from the code and reproduced against the script's copy of
`childModelKeys`; no 2026-10-01 live pack holds two children with one canonical name.

## Specs

- None; harness reader. The product meets REQ-ORCH-044 as written: it makes a name unique under its parent, not across
  the session, so the collision is the reader's assumption, not the ledger's fault. The reader's per-model-key line is
  the run-autopsy skill's evidence for which model a child ran on.

## Relevant files

- `packages/engine/src/autopsy.ts` — `childModelKeys`, and `readAutopsy`, which attributes the tool calls through it and
  gives its names to `entryModelKeys`.
- `apps/desktop/scripts/lib/autopsy-entry-model.mjs` — the script's copy of `childModelKeys`.
- `apps/desktop/scripts/autopsy.mjs` — the script's attribution, through the copy.
- `packages/engine/src/children/ledger.ts` — `all()` (one iteration's tree), `childrenOf`, and the `siblingNames` set the
  canonical name is made unique against.
- `packages/store/src/schema.ts` — `tool_calls`, which carries `agent_name` and no task id.

## Outcome — repaired 2026-10-02 (fin5, harness-readers)

Both readers now attribute by name and lifetime instead of by name alone. `childModelKeys` (`packages/engine/src/autopsy.ts`
and its copy in `apps/desktop/scripts/lib/autopsy-entry-model.mjs`) maps each canonical name to every child that carried
it, as `[spawned_at, completed_at]` windows ordered by spawn (open while the child records no completion), and the new
`childKeyAt` gives a record of that name made at an instant (a tool call's `started_at`, a ladder entry's `at`) the key of
the one child alive then, both keys as `ambiguous (<key> | <key>)` when overlapping windows of different keys hold it, and
`null` when no child of that name was alive: the record is the root's. `readAutopsy` and `apps/desktop/scripts/autopsy.mjs`
attribute each tool call that way (the script now reads the children's `spawned_at` and `completed_at`), and
`entryModelKeys` takes the windows and reads a `quota_fallback_model` or `llm_unresponsive` entry as the root's only when
no child of its name was alive at the entry's instant. No migration: the instants were already recorded.

Pinned by:
- `packages/engine/src/autopsy.test.ts`, "two agents sharing a canonical name are told apart by the lifetime …": the note's
  pair (`impl` on `big-model` in the first run, `impl` on `small-model` in the second) prints each child's calls under its
  own key; a root whose persona spells an earlier child's name gets its own calls and its fallback outside that child's
  lifetime; and an overlapping pair prints the call both windows hold as ambiguous. All three failed before the repair
  (the later key took every call; the root's calls and fallback were the child's).
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`: both copies' `childKeyAt` over the note's pair and an overlapping
  pair, and a ladder move of a root named like an earlier child, read as the child's during its lifetime and the root's
  after it; the script's copy had no `childKeyAt` before the repair. The moves table now hands `entryModelKeys` the windows.
- A smoke read of a copied live store (`2026-10-01T03-15-27-194Z`, the acceptance worktree's duress pack, nine children
  and no shared name) prints the same attribution before and after the repair.

What stays open is OQ-158's: two agents of one name alive at once — a child and a root of its name, or two children whose
windows overlap — are not told apart (the overlap prints both keys), and a child that never records a completion keeps its
window open. Only an identity on the rows reaches those.
