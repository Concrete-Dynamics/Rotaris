## The autopsy reader attributes the root's tool calls to its children's model key

The product's autopsy reader (`apps/desktop/scripts/autopsy.mjs` over `packages/engine/src/autopsy.ts`) prints "tool
calls per model key (from the children record)". The store records a model key for each child (`children.model_key`)
and none for the run's root, so the reader guesses the root's. When every child shares one key, it gives the root that
key. When there are no children, or they use more than one key, it prints the root under `session`. A root on a model
other than its children's is therefore attributed to the children's model, and the line gives no sign that this is a
guess. In every run of 2026-10-01 the root and the children happened to share one model, so the guess happened to be
right. A run that configures a different model for the entry role would be reported wrongly.

Live-run finding: a71-13

Recorded, not repaired.

## Specs

- None; harness reader. Each live-run scenario's `autopsy.txt` is this reader's output (`AGENTS.md`), and the
  run-autopsy skill reads it.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored): `ask`, `faults-ladder`,
  `faults-stall` and `terminal` (no children) print "session: N calls [orchestrator]". `edit`, `frictions`,
  `requirements` and `resume` print the orchestrator under `openai-compatible--katalyst/qwen3.8-flash-next` beside its
  children, taken from the children's key. Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/`, `duress/autopsy.txt`:
  the same, over 397 calls.

## Relevant files

- `packages/engine/src/autopsy.ts:241-252` — the comment and `entryKey`: the children's one key, else `'session'`.
- `packages/engine/src/autopsy.ts:253-258` — every agent no child names is placed under `entryKey`.
- `apps/desktop/scripts/autopsy.mjs` — the command-line reader that each live-run scenario's `autopsy.txt` comes from.
