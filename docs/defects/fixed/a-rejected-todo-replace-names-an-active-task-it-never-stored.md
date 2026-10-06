## A rejected `todo` `replace` names, as the active task, a task it never stored

A `replace` whose incoming list marks two tasks `IN_PROGRESS` is refused with REQ-TOOLS-145's message, even when no
task is active. The message names an "Active task: <id> (<name>)" that does not exist. It is the first `IN_PROGRESS`
task of the rejected list, under an 8-hex id that the `replace` minted for it, and the rejection then discards the whole
list, that id included. The message's remedy, "Mark it COMPLETED or ABANDONED", sends the agent to a task it cannot
reach: the `update` it asks for is refused with "Unknown task id".

In the default live run's `frictions` scenario the orchestrator's first call was a `replace` on an empty list, with two
tasks `IN_PROGRESS`. It was refused with "Active task: 3c55ec35 (Create friction-probe.txt)". The orchestrator followed
the advice, `update 3c55ec35 COMPLETED`, was told "Unknown task id '3c55ec35'. Available phases: (none)", and then had
to work out that the list was empty.

Live-run finding: a71-7

What the refusal should say when no task is active is not stated by REQ-TOOLS-145 or REQ-TOOLS-146. It is raised as
[OQ-163](../../architecture/open-questions.md). Recorded, not repaired.

## Specs

- `REQ-TOOLS-145`: "At most one task may be `IN_PROGRESS` at a time, enforced both when marking a task and on wholesale
  state changes; the violation message is `Only one task can be IN_PROGRESS at a time. Active task: <id> (<name>). Mark
  it COMPLETED or ABANDONED before moving another task to IN_PROGRESS.`" The message presumes an active task. Here there
  is none.
- `REQ-TOOLS-146`: a `replace` "whose incoming list marks some other task `IN_PROGRESS` while a protected active task
  exists is rejected with the message of REQ-TOOLS-145". This covers the case with an active task, not an incoming list
  that marks two tasks in progress over an empty one.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored), session `fe3884f7`
  (`frictions`):
  - #1, at 02:53:13.291: `todo replace`, phase "Friction probe", with "Create friction-probe.txt" and "Run and SIGINT the
    node timer" both `IN_PROGRESS`. It was refused with "Only one task can be IN_PROGRESS at a time. Active task:
    3c55ec35 (Create friction-probe.txt). …"
  - #8, at 02:53:28.037: `todo update 3c55ec35 COMPLETED`, which got "Unknown task id '3c55ec35'. Available phases:
    (none). Available tasks: (none)."
  - Row 18 (thinking): "The todo list seems empty — the replace operation failed". Issues 1 and 2 are the two
    `tool_error`s.
- Cost: one wasted call and one turn.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts:55` — `singleActive`, REQ-TOOLS-145's sentence.
- `packages/agent-tools/src/tools/todo.ts:139-146` — `next`, where the incoming tasks are given ids (`hexId()`).
- `packages/agent-tools/src/tools/todo.ts:153-154` — the single-active check over `next`, which names `actives[0]` with
  its minted id and returns before `list.phases` is replaced, so nothing of the list is stored.
- `packages/agent-tools/src/tools/todo.ts:133-138` — the other rejection, REQ-TOOLS-146's case, which names a stored
  active task.

Observed again at origin/main 1763f7f (live run 2026-10-03), in the `edit` scenario of the default pack
(`.live-run/runs/2026-10-03T05-56-27-364Z/` of the `accept` worktree, git-ignored; the self-hosted `katalyst` endpoint),
session `4e1ed99c`: #6 (05:57:28.968) was a `replace` marking two tasks `IN_PROGRESS` and got "Only one task can be
IN_PROGRESS at a time. Active task: e6482926 (Implement clearCompleted in src/todos.js). …", an id the rejection never
stored; #13 `update 71a2b58c PENDING` was refused "Unknown task id '71a2b58c'. Available phases: (none)"; row 23 reads
"The replace failed entirely? … so maybe nothing was applied"; #17 re-issued the replace and it succeeded. Cost: two
failed calls, two `tool_error` issues, about 10 s. No code changed: the note waits on the owner's ruling.

## Repaired — 2026-10-06, under the owner's ruling of OQ-163 (fin21)

The owner ruled [OQ-163](../../architecture/open-questions.md) on 2026-10-06 as recommended
([R-071](../../product/requests.md#r-071)), minted as [`PD-TOOLS-008`](../../product/directives.md#pd-tools-008), which
narrows REQ-TOOLS-145 for this case. Such a `replace` is still refused whole, in a sentence of its own: `Only one task can
be IN_PROGRESS at a time. The submitted list marks 2 tasks IN_PROGRESS ('Create friction-probe.txt', 'Run and SIGINT the
node timer'), so the replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS.` It names
no active task and no id (`listMarksSeveralActive`, `packages/agent-tools/src/tools/todo.ts`). REQ-TOOLS-146's case, a list
marking another task while a stored task is active, still answers in REQ-TOOLS-145's sentence.

Pinned by "a replace whose own list marks two tasks IN_PROGRESS while none is active is refused, saying so and that nothing
was saved (PD-TOOLS-008)" in `packages/agent-tools/src/tools/tools.test.ts`, red on the code before the repair. `pnpm
live-run`'s `frictions` and `duress` scenarios now check that no `todo` call is sent to an id a refusal named and never
stored (`apps/desktop/scripts/lib/tool-frictions.mjs`); no live run has met the case since.
