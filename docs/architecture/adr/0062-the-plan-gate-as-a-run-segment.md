# ADR-0062 — The plan gate as a run segment: park rather than block, and three places that enforce it

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-13
- **Origin:** `REQ-ORCH-152`, `REQ-ORCH-153` and `REQ-ORCH-154`, settled by A4's amendment round (merged
  `2dd77e7`) and by five owner rulings recorded in `SPECIFICATION_RESOLUTION_PROGRESS.md` (2026-09-13). The
  rulings are inputs to this record, not decisions it re-takes: **park, do not block**; **the answer is a
  session command, not a control, and there are two of them**; **a plan cycle is not an iteration**; **the
  word `plan` stays as the specification has it**; **the mode is offered in the composer and in the start
  dialog, both writing `runtime.run_start_mode`**.
- **Depends on:** ADR-0013 (the run host's session registry and the control channel's addressing),
  ADR-0014 (the stop request), ADR-0016 (the tool registry's frozen table and its direction-aware,
  fail-closed accessor), ADR-0017 (the one gate every dispatch comes through), ADR-0015 (the hook engine
  and its two tool slots), ADR-0048 (the message-limit pause in its own modal window — the shape precedent
  this record deliberately does **not** follow for placement), ADR-0058 (the workspace database and its
  migration ladder)
- **Requirements:** `REQ-ORCH-152`, `REQ-ORCH-153`, `REQ-ORCH-154`; `REQ-ORCH-016`, `REQ-ORCH-021`,
  `REQ-ORCH-025`, `REQ-ORCH-072`, `REQ-ORCH-087`; `REQ-TOOLS-001`, `REQ-TOOLS-002`, `REQ-TOOLS-010`,
  `REQ-TOOLS-014`; `REQ-HOOKS-004`, `REQ-HOOKS-126`, `REQ-HOOKS-130`; `REQ-SESSION-073`, `REQ-SHELL-048`,
  `REQ-SHELL-055`, `REQ-SHELL-168`; `REQ-NOTIFY-049`, `REQ-NOTIFY-050`; `REQ-CONFIG-476`,
  `REQ-MONITOR-004`, `REQ-MONITOR-301`

## Context

`REQ-ORCH-152` makes a run-start mode persistent and settable to `auto` or `plan`. In `plan` mode
`REQ-ORCH-153` requires a run whose classified intent is outside `REQ-ORCH-021`'s answer group to produce a
plan and **block before any file-modifying work is done**, holding **planning grants** — every agent's
ordinary tool set less every tool the registry declares as writing workspace files or running commands,
with an undeclared name counting as declaring all three. It must wait **indefinitely**, offer **exactly
three** answers, survive an application restart, and raise **no terminal run status and no terminal
result**. `REQ-ORCH-154` makes the plan editable, makes revise unlimited, makes approval one-way, and
requires every cycle and every decision in the session's durable record.

What existed before this record: the configuration key (`runtime.run_start_mode`), its settings control,
the persisted status `awaiting_plan_decision` with its presentation arm, and the two timeline-event names.
Nothing read any of them.

The hard part is not the gate. It is the word **block**. A run is a process holding a session lock, a
writer, a projection owner, a hook attachment and an event-bus subscription; "wait indefinitely" against
that reading means holding all of it open for hours or days, and "survive a restart" means it cannot be
held at all. Ruling 1 resolves it: **park**.

## The decision

**A `plan`-mode run is a sequence of run segments, each an ordinary `Run`.**

| segment | launched with | ends |
| --- | --- | --- |
| plan cycle *n* | `plan: { cycle: n, changes }` | parks at `awaiting_plan_decision` |
| execution | nothing (`plan_released = 1`) | the ordinary run lifecycle |

Each segment is launched through `SessionManager.launchContinuation` — the machinery that already resumes a
message-limit pause. Approval and revise launch the next segment; cancel launches nothing.

This is what `REQ-ORCH-153`'s closing sentence was amended to bless: the run the user answers is the run
that reached the gate "whether or not the process that hosted it outlived the hold".

### 1. The planning phase is a property of a LAUNCH, not mutable mid-run state

A segment's grants are constant for its whole life. That is what makes `REQ-TOOLS-010` survive: the model's
tool listing is computed once at port construction, and if the gate could be released under a running turn
the listing and the callable set would diverge — the model would be told it may write and then refused.
`Run.planHeld` is settled once, after the pre-flight (so the answer group is known) and before the first
thing the gate withholds, and is never cleared in place.

> **Amended by [`PD-ORCH-003`](../../product/directives.md#pd-orch-003) revision 2, 2026-09-28.** A run that resumes
> an iteration a rest left open (`PD-ORCH-005` clause 4) — or, by OQ-104's reading, one a crash left open once the
> crash is recorded (clause 18) — runs it unheld, and when the gate would hold the run it holds once that iteration
> has closed and the stop conditions found work left, before the first new iteration. So a segment boundary can now
> fall inside a run: the resumed iteration is work already under way — usually of an execution that was already
> released, though not always, since a session that never held a release can be switched to `plan` before it is
> continued — and the plan cycle after it is a segment of its own, whose turn builds its ports under the hold. The
> flag is still set once and never cleared in place, and every point that enforces it still reads it live.

The enforcement points nevertheless read it through a **closure** rather than copying a boolean. That costs
nothing and keeps the code honest: if release-in-place is ever adopted, the three points follow the run's
own state rather than a stale copy taken at construction.

### 2. The plan cycle is one turn of the entry role, and its report text IS the plan

No new tool announces a plan. `REQ-TOOLS-002` closes the public tool-name vocabulary, and `REQ-ORCH-153`
asks for "the plan … verbatim as the producing role wrote it" — which is exactly a turn's report text. The
cycle runs through the ordinary `turn()` path, so the root execution record is "created with the entry role
exactly as `REQ-ORCH-072` requires" rather than by a second code path that would drift from the first.

**It runs as iteration 0.** Ruling 3 says a plan cycle is not an iteration: it selects no task, advances no
counter, emits no `iteration.start`/`iteration.end` and resolves none of `REQ-ORCH-074`'s three outcomes.
Numbering it 0 gives it the root id `root:0`, which `isEntryPort` already accepts by depth and by spelling,
and leaves `root:1` upwards to the execution segment so the two segments' child namespaces cannot collide.

A cycle that produces no text ends the run `agent_session_aborted`, the way a failed root iteration does
(`REQ-ORCH-074`). A gate with no plan would offer three answers over an empty surface, and no requirement
asks for that.

### 3. `stop_reason` on a parked segment is EMPTY

`STOP_REASONS` is `REQ-MONITOR-301`'s closed set of nine and nothing in it names a hold. The run did not
stop, so the segment claims no reason and none is added to the set. Cancel uses `user_cancelled`, which the
set already carries. The park otherwise mirrors `pauseAtLimit` exactly — no `result` event, no
`session.end`, no `run_end`, no lock release — which is `REQ-ORCH-153`'s "no terminal run status and no
terminal result" as a property of what is *recorded* rather than a sentence in a comment.

### 4. Planning grants are ONE predicate over the registry, enforced in three places

```ts
export function withheldUnderPlanGate(name: string): boolean {
  return withholdsOn(name, 'writesWorkspaceFiles') || withholdsOn(name, 'runsCommands');
}
```

ADR-0016's direction-aware accessor already delivers `REQ-ORCH-153`'s fail-closed reading: `withholdsOn`
answers `true` for a name outside the frozen table, so **every MCP tool and every plugin name is withheld**
without a second table to keep in step. `readsWorkspaceFiles` is deliberately not consulted — the
requirement names two facets, and a plan is written by reading.

1. **At port construction** (`createToolPort`) the declared set is filtered before `resolveToolSet`, and
   the MCP executors added later in `ready()` are filtered too. One resolution still feeds both the listing
   and the callable set, so a held run is offered exactly what it may call.
2. **At dispatch** (`Gate.dispatch`) a withheld name is refused as `blocked`. This is the authoritative
   line — `REQ-ORCH-153`'s "enforced where a call is dispatched … by whatever route the tool reached that
   role" — and it sits **ahead of the executor lookup, the schema parse and the permission resolution**.
   Ahead of the lookup so a name the narrowing never saw is refused with the gate's reason rather than
   reported unknown; ahead of the permission resolution because `REQ-HOOKS-004`'s order puts `pre_tool`
   hooks after it, so a refused call's tool hooks never fire at all. Meta tools (`REQ-TOOLS-014`) are
   exempt and are checked first; by the predicate alone they would withhold, and a test asserts that, so
   the exemption cannot be dropped quietly.
3. **At child admission** (`IterationChildren.delegate`) a role declaring a withheld tool is refused before
   a record exists. Kept beside (2) rather than replaced by it, because a refusal at admission tells the
   delegating role **why** at the moment it asked, instead of letting a child start and fail on every call
   it was spawned to make. The predicate is injected rather than imported: the declarations live in
   `@rotaris/agent-tools` and the engine does not import it (ADR-0002's boundaries).

`single` is neither exempt nor blocked. `REQ-ORCH-025` grants its entry role the direct-work bundle and
`REQ-ORCH-153` then narrows that bundle "exactly as every other role's set is" — so the union happens first
and the narrowing second, which is the order the code takes.

### 5. Hooks: the second skip reason, per invocation

`HOOK_SKIP_REASONS` becomes `['untrusted_workspace', 'plan_gate']`. At the one point the engine would spawn
a process it instead emits a single `hook.finish` with `skipped: true`, `skip_reason: 'plan_gate'`, null
`exit_code` and `duration_ms`, and the stable id in `hook_name` — `REQ-HOOKS-130`'s second by-design case:
no `hook.start`, no `hook_run` entry, no outcome. **Once per withheld invocation**, not once per session,
because the hold ends when the user answers and the same hook then runs normally.

A blocking `pre_tool` hook that never ran blocks nothing: a withheld invocation produces no outcome and
therefore no verdict. In practice the amendment reaches only the lifecycle points, because enforcement
point (2)'s position keeps a refused call's tool hooks from firing at all.

### 6. The check suite: unreachable rather than guarded

`REQ-ORCH-153` forbids running one while held. A plan-cycle segment parks after a single turn and never
enters the iteration loop, so it never reaches completion judgement and verification is unreachable — a
structural property. It is asserted by test (no `iteration.start` event, `iterations_completed` unmoved)
rather than defended by a branch that could not be exercised.

### 7. The durable half: schema v17

```sql
CREATE TABLE plan_cycles (session_id, cycle, opened_at, plan, intent, todo, changes, edited, decision, decided_at, PRIMARY KEY (session_id, cycle));
ALTER TABLE sessions ADD COLUMN plan_cycle    INTEGER;
ALTER TABLE sessions ADD COLUMN plan_released INTEGER NOT NULL DEFAULT 0;
```

`plan` is the role's text and is never rewritten after the insert; `edited` is the user's and is `NULL`
until they edit. Keeping them apart is what makes `REQ-ORCH-154`'s "editing alone never approves it"
structural — the statement that writes an edit can reach no other column — and what lets a window closed
mid-edit reopen on both.

`sessions.plan_cycle` names the cycle awaiting an answer; with `execution_status = 'awaiting_plan_decision'`
it is what survives a restart, on the same terms as `paused_at_count` does for `REQ-ORCH-087`.
`plan_released` is approval's one-way flag **across a process boundary**: set on approve, read at every
launch, and cleared only by the next user prompt — because `REQ-ORCH-154` says a mode change made while a
run is in flight takes effect only for the next run, and a fresh prompt **is** the next run.

> **Superseded by [`PD-ORCH-003`](../../product/directives.md#pd-orch-003), 2026-09-17 — the clearing rule
> alone.** The sentence above is kept because its reasoning was sound and is why the flag is written the way
> it is. What it got wrong is not the mechanism but **the unit**. A fresh prompt is indeed the next run; the
> directive's point is that the next run is the wrong thing to re-gate, because the unit a person plans is
> the piece of work and a follow-up to a plan they just approved is the same piece of work.
> `SessionWriter.clearPlanRelease` is no longer called from `SessionManager.prompt`; its one caller is
> `SessionManager.planRearm`, reached by the run-start control and by nothing inside a run. Everything else
> in this section holds unchanged — the column, the read at every launch, the process boundary it survives,
> and `plan_cycle` beside `execution_status`.

The gate reaches the surface from the **store**, not from a live run: the deciding surface must find it
after a restart with no process behind it.

### 8. The answers are session commands, not controls

`CONTROL_OPS` is `REQ-MONITOR-004`'s closed enumeration over a **live** run, and a parked run has nothing
live to control. `session.planEdit` and `session.planDecision` join the command schema beside
`session.continue`, which is the same shape for the same reason (ruling 2).

`PD-ORCH-003` adds a third, `session.planRearm`, on the same argument carried one step further: it addresses
a session holding no run at all, live or parked. It refuses while a run is active — what a launch has already
read cannot be changed under it — and re-arming an already-armed session succeeds and does nothing, so the
caller need not read the flag it is about to set.

### 9. The surface is inside the primary view, and no dismissal answers it

`REQ-SHELL-168` hosts the gate inside the primary view that carries the run and says in terms that
window-level Escape (`REQ-SHELL-055`), switching view, closing the view and closing the window all fail to
answer it. So `PauseDialog.tsx` is the right precedent for **shape** — three labelled buttons from
`REQ-SHELL-048`'s vocabulary, keyboard-reachable at the minimum window size — and the wrong one for
**placement**: `PlanGate.tsx` is a region inside `WorkspaceView`, not a modal window, and carries no Escape
handler.

The plan is drawn in a monospace field showing the text verbatim. **No Markdown pass runs over it**, because
rendering Markdown is exactly "re-rendered into another form".

## Decisions taken here that no requirement states

**The composer is locked while the gate holds.** `REQ-ORCH-153` says the answers offered MUST be exactly
three and forbids proceeding "on any default"; an open composer is a fourth exit, because a typed prompt
starts a new run and silently discards the pending plan. The lock names the gate as the reason and points
at it, so the route out is visible.

This is in tension with `REQ-NOTIFY-050`, under which `awaiting_plan_decision` presents as `paused` and is
therefore **not busy** — and a paused session's composer is otherwise open. The tension is stated here
rather than hidden: the lock is the gate's, not the status mapping's, and nothing about the presentation
status was changed to justify it. If the owner prefers the fourth exit, the repair is one condition in
`WorkspaceView` and this paragraph is the record of what it would undo.

**A plan cycle that produces no text ends the run rather than opening an empty gate** (see decision 2).

## Deliberately out of scope

**The root execution record's identity** (a defect note, removed once repaired). That
note says the canonical name and task id are the first thing this Part will need; reading `REQ-ORCH-153`
against the code says otherwise. What the gate requires is that the root execution record is *created with
the entry role*, and the port `turn()` already builds at depth 0 is that record. Nothing in the plan cycle
looks the root up by name. The defect stands and keeps its own commit, where `background_output` and
`wait_for_tasks` resolving the root can be tested as the thing being built.

## Consequences

1. **A plan-mode run appears in the record as more than one segment.** Anything that reasons over "the
   run" by counting `run_start` events, or that assumes one process per run, must read the session rather
   than the process. The message-limit pause already had this shape; the plan gate makes it ordinary.
2. **`run_start_mode` is now read.** A workspace with `plan` set has had no gate until now; from this
   change it holds. The key was validated by the loader from Part I and read by nothing.
3. **Schema v17 is not reversible.** A store opened by this build and then by an older one reads the two
   session columns as unknown; the ladder is forward-only, as ADR-0058 fixed.
4. **`HOOK_SKIP_REASONS` has two members**, and a consumer that treats the field as a constant is wrong.
   `docs/spec/20-event-history-replay-export.md` still restates the one-member claim in two places — a
   defect found by building, recorded in
   a defect note (removed once repaired), and owing an amendment round.
5. **The gate is offered on two surfaces and holds state on neither.** The composer's control and the start
   dialog's both write `runtime.run_start_mode` through the scoped per-field path, so the setting is
   persistent and one value governs whichever surface the user next starts from.

   > **Amended by [`PD-ORCH-003`](../../product/directives.md#pd-orch-003), 2026-09-17.** The composer's
   > control now writes session state as well: choosing `plan` on a session holding an approved release
   > sends `session.planRearm` after the field write, because under the directive the setting alone no
   > longer decides whether that session's next run is held. The start dialog's control does not — it opens
   > a session that holds no release. The two writes are ordered and both are reported: the field is the
   > durable half, and a silent success over a gate that did not re-arm is the outcome the directive exists
   > to prevent. What still holds is the sentence's point — neither surface keeps a mode of its own.

## First execution — 2026-09-13, the plan gate in the built app (`pnpm plan-gate-proof`)

ADR-0062's first execution in the built app proved the plan gate end to end across five launches
(`apps/desktop/scripts/plan-gate-proof.mjs`, schema v17, commit `d9738ece8`):
1. `runtime.run_start_mode: plan` holds a run at the gate — the surface is drawn inside the primary view, the plan is presented verbatim, the composer submit is locked, and the session's persisted status is `awaiting_plan_decision` with a cycle recorded.
2. The user's edit (`session.planEdit`) is written through directly to `plan_cycles.edited` and approves nothing.
3. The pending decision survives the application closing (`REQ-ORCH-153`): the window is closed, the store is inspected directly with the process gone, and a subsequent launch finds the gate and edit intact.
4. Revise (`session.planDecision` with `revise`) starts a further cycle carrying the changes stated by the user.
5. Approve (`session.planDecision` with `approve`) releases execution one way, `plan_released` is set to 1, and the run carries the approved text.
6. The file named in the plan does not exist during the hold and does exist after approval — verifying that execution is blocked before any file-modifying work is done.

**Defects surfaced by the first execution:**
- **Event specification contradiction:** A4 widened `REQ-HOOKS-126` to define `plan_gate` as a valid skip reason. `REQ-EVENTS-047` and the `hook.finish` row in `20-event-history-replay-export.md` still asserted `untrusted_workspace` was the only defined value. Recorded as a defect found by building (a defect note, removed once repaired).
- **Surface layout and reachability:** Scripted clicks on *Approve* initially failed because flex children and layout sums pushed the buttons out of view or under dividers across varying heights. Repaired by making the three answers sticky (`position: sticky; bottom: 0`) inside the block.
- **Synthesized events:** The harness verified that synthetic `blur` does not trigger React's `onBlur` delegation (which listens to `focusout`).

## The first execution's proof on Linux with the code-intelligence bundle present — 2026-09-28 (R-062)

On the Linux sweep, run as root under Xvfb with the bundled runtime in the tree, `pnpm plan-gate-proof` failed twice,
at two different launches. **Neither failure was the gate's.** REQ-ORCH-152, REQ-ORCH-153 and REQ-ORCH-154 held on
every launch that reached the gate.

- **Launch 1 read the gate before the run had reached it.** The proof meant to turn `code_intelligence` off so its
  discovery would not lengthen run starts, but it wrote the switch as a top-level `code_intelligence:` key, which no
  section reads. Every run therefore discovered the server before the entry role's first call. On the sweep host that
  took 11.1 s beside the workspace's background `project create` (10.4 s), and the plan came about a second after
  the proof's fixed 12,000 to 12,400 ms readings. The launch's surface assertion, a test of the log for `plan-gate`,
  could not fail, because the inspection line names the selector either way.
- **Launch 2's relaunch was refused as held by the previous instance's run host.** That is the lock defect `459e7c8`
  repaired on `main` (main exits only after its run host). The sweep tree predated it. On a tree with the repair,
  every launch logs `run host exited` before `main process exiting`.

The proof now disables the server as the configuration spells it (`mcp_servers:` / `code_intelligence: { enabled:
false }`), and launch 1 fails if the server is discovered anyway. Launches 1 and 2 read the gate, its text and the
edit on `@~` deadlines. Their captures wait for the plan and for the edit instead of for a clock. The surface
assertion reads the inspection's matches. Any launch refused as held by another run fails naming the lock note.
Recorded and repaired in
[`plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md`](../../defects/fixed/plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md).
**Found beside it:** with the entry disabled, the workspace's `code-intelligence-setup` still runs, because
applicability is REQ-MCP-037's availability and that rule does not read `enabled` (OQ-109, built as the letter).
**What it could not show:** launches 3 to 6 keep their fixed offsets (the revise at 6,000 and 6,600 ms, the approve
at 6,000, the chip at 10,000 and 11,000, the prompts at 10,000 and 15,000). They were green on every run here and
were not moved. Windows and macOS were not run (IC-3).

## The admission refusal meets an alias on the built-in table's path — 2026-09-30 (R-067)

*Decision (3) above refuses at admission a role that declares a withheld tool. It read the role through
`orchestration.ts`'s `personaOf`, whose path for a run with no configured persona catalogue looked the name up in
`BUILT_IN_PERSONAS` alone and never in `ROLE_ALIASES`, while `ChildLedger.spawn` resolves the same name through
`resolveRole`, which honours the aliases (REQ-ORCH-034). Recorded as
[`delegate-reads-no-alias-on-the-built-in-table.md`](../../defects/fixed/delegate-reads-no-alias-on-the-built-in-table.md),
acceptance finding A27.*

**What the execution found.** A case in `children/children.test.ts` builds `IterationChildren` with no `personas` and a held
gate that withholds `write_file`, `haet_edit`, `haet` and `terminal`. On the unrepaired code `delegate({persona: 'coder'})`
was accepted, `queued`: the alias read as no persona, so `persona?.tools ?? []` held nothing withheld, and the ledger then
recorded a `coding-agent`. The same missing persona recorded the row's `granted_tools` as `[]`. The note also named the
model key; on this path it was not observably wrong, since a built-in persona names no model and `childModelKey` gives the
run's key either way.

**What was changed.** `personaOf` resolves through `resolveRole` on the built-in path, as the ledger does, so admission
reads the role the ledger will spawn: `coder` and `playwright` are refused while the gate holds, naming the withheld tools,
with no record; once released, `coder` is accepted as `coding-agent` with that role's tools. The write-scope refusal's own
alias lookup (PD-TOOLS-006 revision 3) collapses into the same call. The decision is unchanged.

**What was not measured.** The built app: the run host always supplies a configured persona resolver, which resolved
aliases already, so no proof or live-run scenario reaches this path. The row is in
[`../first-executions.md`](../first-executions.md).
