## The autopsy reader attributes the root's tool calls to its children's model key

The product's autopsy reader (`apps/desktop/scripts/autopsy.mjs` over `packages/engine/src/autopsy.ts`) prints "tool
calls per model key (from the children record)". The store records a model key for each child (`children.model_key`)
and none for the run's root, so the reader guesses the root's. When every child shares one key, it gives the root that
key. When there are no children, or they use more than one key, it prints the root under `session`. A root on a model
other than its children's is therefore attributed to the children's model, and the line gives no sign that this is a
guess. In every run of 2026-10-01 the root and the children happened to share one model, so the guess happened to be
right. A run that configures a different model for the entry role would be reported wrongly.

Live-run finding: a71-13


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

## Repaired — 2026-10-01

The entry agent's key is read from what the store records of the entry agent itself, never from its children:
`entryModelKeys` (`packages/engine/src/autopsy.ts`) takes the entry role's resolved `model` from the launch audit's
configuration snapshot (REQ-SESSION-138), then from each continuation's own snapshot (`run_continuation_intent`) and each
switch (`entry_model_switched`, REQ-MONITOR-142), consecutive repeats folded. One key is printed as it is; several are
printed in order joined by `→`, the root's calls kept on that one row rather than split between keys by guess; `session`
is printed only when none of them records a key. A loader-made copy (a slot's or a role's reasoning synthesis,
`__startup_slot__:` / `__persona__:`) reads as the one non-copy `models:` key it was copied from — the key a child on that
model is recorded under (REQ-CONFIG-094) — and as its own recorded name when none or more than one matches, since the
snapshot does not carry the loader's origins. ~~A `model_override` names no agent, so it is not read as the root's.~~
Falsified at the verifier's first repair round, kept here beside its replacement: a `model_override` names no agent, but
it moves every agent on the pair it replaces, the root included. The wait's "change model now" (REQ-MONITOR-303,
REQ-ORCH-091 d) records only `model_override` (the waiting `provider|model` pair, the chosen `model_key` and its
`to_provider|to_model`); the run resolves the root's model through every override of the session
(`ResilienceMemory.effective` in `rootResilience`) and replays them on every later run (`ResilienceMemory.rehydrate`), so a
continuation whose snapshot still names the configured key runs on the override. `entryModelKeys` therefore carries the
root's configured key through the recorded overrides: an override moves the root exactly when it replaces the pair the
root's current key resolves to in the snapshot's `models:` (its sign-in provider, else its family, and its `model_id` —
`providerIdentity`), chains are followed as the run follows them, and a later switch onto an overridden pair reads as the
override. Where the snapshot does not record the pair the root's key resolves to and an override is recorded, the key
from that point on is printed as `undetermined` (`ENTRY_KEY_UNDETERMINED`), never one key given as fact. The automatic
moves of the root (`quota_fallback_model`, `llm_unresponsive`) are not read yet: open note
[the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md](the-autopsy-reader-does-not-read-the-roots-automatic-model-fallbacks.md) (since repaired).
`apps/desktop/scripts/autopsy.mjs` reads the same through `scripts/lib/autopsy-entry-model.mjs`, which mirrors the engine's
function (the script cannot import the engine's TypeScript); the run-autopsy skill's description of the reader says so.

Pinned by:

- `packages/engine/src/autopsy.test.ts` — "the entry agent's model key comes from what the store records of the entry
  agent, never from its children": a root on `root-model` beside two children on `child-model` (red before: all five
  calls under `child-model`), no launch audit (red before: the root under the children's key), a switch and two
  continuations, and a loader copy with one and with two originals; and, under "a \"change model now\" during a wait
  moves the root exactly when it replaces the pair the root runs on", an override of the root's own pair (`root-model →
  spare-model`, kept across a continuation), an override of a child's different pair (root unchanged), a switch onto an
  overridden pair, and an override the snapshot cannot place against the root (`root-model → undetermined`) — the three
  that move or mark the root red before the round-1 repair;
- `apps/desktop/scripts/lib/autopsy-entry-model.test.ts` — the script's copy and the engine's function answer the same
  thirteen cases alike, the round-1 case "an override names no agent, so it is not the root's" replaced by the override
  cases above plus an override chain and an override with no pair recorded (four red before the round-1 repair).

Shown on the 71ad8e8 stores (copies of both packs' `workspace.db`; the packs were not written): every session's root is
now attributed to `openai-compatible--katalyst/qwen3.8-flash-next` from its launch audit. Where children exist the line
reads as before, because the root and its children did share that model; `ask`, `faults-ladder`, `faults-stall` and
`terminal`, which have no children, now print that key where they printed `session`.
The 2026-10-01 stores record no `model_override`, so the reader's output over them is unchanged by the round-1 repair
(re-run over the same copies, line for line).
