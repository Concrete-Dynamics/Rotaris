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
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](fixed/the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md)
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
