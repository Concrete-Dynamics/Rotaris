## A continuation is briefed as if it remembered, and rebuilds its brief from the product's own store

Observed 2026-10-03 by the orchestrator's duress live run of the built product at origin/main `1763f7f` against the
self-hosted endpoint `katalyst` (`qwen3.8-flash-next`), 06:15 to 07:32 UTC, `LIVE_RUN_DURESS_MS=5400000`. The run ended
`live-run PASSED` with 18 checks; this finding passed every check, because no check reads what a continuation was told
or where its calls went. Finding U2 of that run's autopsy.

`PD-ORCH-004` revision 2 assembles a continuation's payload "as any child's is, and nothing of the continued child is
injected into it". Nothing the parent reads says so. The cut-off report's offer says "the remaining work may be
delegated to a new child as a continuation of this one", and `delegate`'s description says "to delegate the remaining
work as its continuation". In this run the parent briefed both continuations as if they remembered:

- tool call #287 (verification, `bg_a6693c7b`): "Continue your verification task. You had already run everything …
  each of the nine claims from your brief adjudicated";
- tool call #170 (reconcile docs, `bg_16548a86`): "You had already read the sources…".

The verification continuation's first request (traffic #190) carried only the workspace root, its write scope, the
sibling index and that text. Its reasoning then read (row 536) "The nine claims from my brief — I don't have the brief
verbatim in context", and (row 541) "The workspace.db contains the run's task texts. It's the app's database, not
workspace content … It's a bit intrusive". It recovered the brief from the product's own session store through its
terminal:

- 31 terminal calls on the product's per-user data directory under the run's sandbox root
  (`…/local/rotaris/data/rotaris/workspaces/v1-…/`): #301 to #328, #341, #342 and #344 (the autopsy counts 30; the
  listed ordinals are 31). First `preferences.json` and a `find`, then `strings` and `grep -a` over `workspace.db` and
  `workspace.db-wal` (#303 to #310), then `python3` `sqlite3` reads (#311 onward).
- #311 and #312 opened the live store without `mode=ro`; every later read used it. Both ran only `SELECT`s. The
  continuation's report says it read the store `mode=ro`.
- #302 ran `grep -rl "nine" local home` through a tree that holds the leased credential file
  (`…/data/rotaris/tokens/openai-compatible--katalyst.json`). Only file names were printed.
- The 146,921 characters of store content it read took its prompt from 22,621 tokens (traffic #198) to 74,608
  (traffic #224). That content was re-sent in each of 33 later requests: about 1.7M input tokens, roughly 18 % of the
  session's 9.28M. The run's largest prompt (117,456 tokens, traffic #257) is mostly this content; without it, about
  65k.
- The orchestrator told the user (row 685): "it disclosed that on resume it recovered its brief by reading this run's
  session database read-only … I'm flagging it because it isn't the method I intended."

The reconcile-docs continuation re-derived what its predecessor knew by reading the workspace instead: 7 min 28 s
before its first edit. Both continuations succeeded.

**Context: the run was unconfined by the harness's choice.** `apps/desktop/scripts/live-run.mjs` writes
`runtime.permission_mode: autonomous` with `runtime.allow_unsandboxed_autonomous: true` (REQ-SANDBOX-052's opt-in) into
the workspace's `agents.yaml`, and leaves `runtime.sandbox_mode` at its shipped default `off` (REQ-SANDBOX-048). The
session row reads `permission_mode autonomous`, `sandbox_mode off`, `sandboxed 0`, although bubblewrap confinement was
available on the host. Under `PD-TOOLS-002` the opt-in key no longer changes the mode, so the requested `autonomous`
applied. Confinement would not have stopped these reads: REQ-SANDBOX-060 leaves a confined command free to read
anywhere. It would have refused a write outside the writable roots.

This is not a defect of the code against a requirement. The continuation's empty payload is what `PD-ORCH-004` revision
2 says, no requirement fixes the wording of the offer or of `delegate`'s description, and REQ-SANDBOX-060 leaves reads
unrestricted. It is a further case of the owner's question "Do the specification's fixed figures still hold when the
model on the critical path reasons before it answers?" in
[`docs/architecture/open-questions.md`](../architecture/open-questions.md). That question already records that a
continuation starts from nothing. This case adds that the parent is not told so, and what the continuation then did. The
build proceeds under the current behaviour, unchanged until the owner rules. No code and no wording is changed here.

## Specs

- `PD-ORCH-004` revision 2: "its payload is assembled as any child's is, and nothing of the continued child is injected
  into it". Met as written.
- REQ-ORCH-088, narrowed by `PD-ORCH-004`: a cut-off child "offers its parent one continuation". No requirement fixes
  the offer's wording or the description of `delegate`'s `continuation_of`, so neither is required to say what a
  continuation is given.
- REQ-SANDBOX-060: reads are intentionally unrestricted, confined or not. REQ-SANDBOX-048 ships `sandbox_mode: off`.
  REQ-SANDBOX-052 is the opt-in the harness sets, narrowed by `PD-TOOLS-002` to have no effect on the mode.
- REQ-PROVIDER-016: credentials are individually protected files in the per-user data directory. Here only their names
  were printed.

## Relevant files

- `packages/engine/src/children/cut-off.ts:106` — the continuation offer's text.
- `packages/agent-tools/src/tools/delegation.ts:47` — `delegate`'s description of `continuation_of`.
- `apps/desktop/scripts/live-run.mjs:1030` — the harness's `runtime:` block (`permission_mode: autonomous`,
  `allow_unsandboxed_autonomous: true`, no `sandbox_mode`).
- Evidence (git-ignored): pack `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-03T06-15-52-273Z/`, store session
  `24cb74e4`: `tool_calls` #170, #287, #301 to #328, #341, #342 and #344; `transcript_rows` 536, 541 and 685;
  `duress/model-traffic.jsonl` lines 190, 198, 224 and 257 (0-based); the pack's `agents.yaml`.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`. Open, the owner's: a ruling on what a
continuation is given and what its parent is told.
