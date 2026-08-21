# Requirements Area — Architecture & Code Review

**Date:** 2026-08-17 · **Reviewer:** Claude (Fable 5), session-driven full read
**Scope:** the Requirements tab (desktop) and the requirement engine behind it — epics
SWR-3100 · SWR-3200 · SWR-3300 · SWR-3400 · SWR-3500 · SWR-3600, plus the SWR-3123
generated-parser runtime reviewed pre-merge from
`.claude/worktrees/feat+swr-3123-generated-parser-runtime`.

---

## 1. Scope and method

Read in full, at implementation depth:

- **Engine:** `src/rotaris_core/requirements/model.py`, `registry.py`, `sources/base.py`,
  `delivery/state.py`, `delivery/projection.py` (the SWR-3216 board projection API), the
  `delivery/__init__.py` seam surface, and the incoming `sources/generated.py` +
  `sources/parser_host.py` with the `discovery.py` / launcher diffs.
- **Desktop:** `services/requirements_bridge.py`, `requirements_controller.py`,
  `requirements_actions.py`, `models/requirements_state.py`, `views/requirements.py`,
  `requirement_detail.py`, `requirement_graph.py`, `requirement_queue.py`,
  `requirement_review.py`, `widgets/requirement_editor.py`, plus the `main_window.py` and
  `models/store.py` wiring.
- **Specifications:** the six epic indexes, the Zielbild
  (`docs/plans/2026-08-14-requirements-board.md`), the open-items plan
  (`2026-08-15-requirements-board-open-items.md`), and the three draft requirements in this
  area (SWR-3118, SWR-3122, SWR-3123).

The review focuses on architectural design and extendability — especially against the
requirements that are specified but not yet implemented — and on refactoring angles that
would harden the area for what is coming. Findings are ranked by consequence, each with
evidence and a concrete recommendation.

---

## 2. Architecture summary

The area is built as **one read seam, one write seam, and a UI that derives nothing**:

```text
Project's own store(s)                 Rotaris' operational state
  ReqToCode / declarative /              DeliveryStore · SatisfiedLog · AuditStore
  generated parser (SWR-3123)            UnitStore · ExecutionHistory · VerificationStore
        │  RequirementSource protocol          │
        ▼  (capabilities declared, SWR-3105)   │
  RequirementRegistry ──────► RequirementIndex │
        │   (collisions, tombstones,           │
        │    incremental refresh, memory)      │
        ▼                                      ▼
  BoardProjector.inputs() ─── reader ports: EvidenceReader / ExecutionReader / DetailReader
        │
        ▼
  project_board(BoardInputs) ── pure, deterministic ──► BoardProjection (SWR-3216)
        │
        ▼  QThread worker (RequirementsBridge)
  build_board_state() ──► RequirementsBoardState + BoardDelta (SWR-3312)
        │
        ▼
  RequirementsController (SWR-3315 composition root)
        │  VIEW_SIGNALS / ACTION_SIGNALS tables · attach_pane extension point
        ▼
  RequirementsView (kanban, virtualized SWR-3317) + detail / evidence / graph /
  review / queue / editor / blockers panes (SWR-3316, installed on first use)

  Writes: every gesture ──► RequirementActions.perform() ──► TransitionPort
          (ExecutionTransitions: matrix + completion gate + specification guard)
          — the single door (SWR-3609/3610); the UI can never force Done.
```

Load-bearing properties, all held by tests rather than convention:

- The desktop **never derives a verdict** (SWR-3311) — enforced by an AST sweep over
  `apps/rotaris/src` that refuses process launches and re-derivation
  (`test_requirements_board.py:483–680`).
- The write path **refuses an unguarded writer** at construction
  (`requirements_actions.py:749`, `test_requirements_board_actions.py:925`).
- The projection shape was **declared ahead of the execution slice** and defaults to
  empty (`NoExecution`, `NoEvidence`, `NoDetails`), which is what let the board and the
  engine land in parallel and still compose.
- `main_window.py` touches the feature exactly three times (construct controller,
  register surface, name it in view order — `main_window.py:202–224`); everything else
  attaches through the controller.

**Overall verdict:** this is an unusually disciplined subsystem. The seams named in the
requirements exist in the code as importable objects, the invariants live in docstrings
*and* in guard tests, and the SWR-3123 branch demonstrates the payoff: a whole new source
kind lands behind `RequirementSource` with zero edits in the registry, projection, or UI
(`discovery.py` diff: config-kind dispatch only). The findings below are mostly tensions
and hardening opportunities, not structural defects.

---

## 3. What holds up well

1. **The canonical model is a real wall.** `CanonicalRequirement` is frozen, re-validated
   on every derivation, normalises text before hashing, and `DELIVERY_FIELD_NAMES`
   (`model.py:176`) makes "no operational state on the specification" a testable property
   instead of a convention. `SourceRead._stamp_provenance` (`base.py:267`) guarantees a
   read and its revision can never be observed out of step.

2. **The two-axis model is enforced where values are built.** Lifecycle never persists,
   delivery never writes back, `DeliveryStatus._coherent` (`delivery/state.py:292`)
   refuses incoherent records, and the single permitted coupling (deprecated ⇒ not
   schedulable) is one derived property (`DeliveryView.schedulable`).

3. **The projection is genuinely pure and complete.** `project_board` takes data, returns
   a value, and the reader ports keep I/O at the edge. Epic status is computed in a second
   pass so a column, badge, and aggregate cannot disagree (`projection.py:1597–1662`), and
   the model validator makes that unrepresentable rather than unlikely.

4. **Failure taxonomy is consistently three-state.** Unavailable / failed / busy on the
   bridge; missing / stale / failed evidence; "no history" vs "history unreadable" vs
   "history pending" (SWR-3313). Empty states are sentences everywhere. This discipline is
   rare and worth protecting in review of future changes.

5. **The write door is one door.** `BoardAction` is a closed enum, every action is
   attributed, refusals carry the engine's own sentences, `NO_OVERRIDE_REASON` states why
   no Done override exists, and review decisions, queue holds, blocker answers, proposal
   and change-work acceptance all route through `RequirementActions.perform`.

6. **Threading is treated as a first-class design problem.** Board pass, detail pass,
   review reads, and the adoption/verification suite passes each run on workers with
   explicit lifetime notes (the PySide 6.8 `deleteLater` fault is documented at
   `requirements_bridge.py:843–849`); `DeferredReviews` supersedes stale requests
   (`requirement_review.py:730–793`); the evaluator coalesces git-event bursts instead of
   dropping them (`requirements_controller.py:1361–1437`).

7. **Scale work is measured, not hoped.** Column virtualization with recycling and
   settling passes (SWR-3317), delta-driven repaints (SWR-3312), debounced search, and a
   deliberate split of deep views out of the board pass (`req_ids` narrowing in
   `BoardProjector.inputs`).

8. **The SWR-3123 branch fits the architecture.** Pin-then-admit-then-run ordering,
   re-admission inside the child process (closing the parent/child TOCTOU race,
   `parser_host.py:72–104`), unclaimed documents surfaced as `SourceIssue`s, revision
   digest that never executes the parser (SWR-3116 preserved), and a frozen-binary
   re-exec sentinel that keeps Qt out of the child. Consumers needed no changes.

---

## 4. Findings

Severity: **H** = should be addressed deliberately soon · **M** = worth a decision ·
**L** = hygiene / opportunistic.

### F1 (H) — The read port's contract and its production implementation disagree

`BoardSource.project()` promises "Reads only; never writes (SWR-3216)"
(`requirements_bridge.py:200–202`). The production implementation deliberately runs the
propagation pass first: `WorkspaceBoard.project()` calls `evaluate_workspace`, which
applies system-actor transitions and writes delivery records
(`requirements_bridge.py:378–414`, documented as "the one write on this path"). The
behaviour is required by SWR-3502/SWR-3515 — but three consequences deserve attention:

- **The port lies.** A test double or alternative `BoardSource` written against the
  Protocol docstring will behave differently from production in exactly the dimension
  (writes) the seam exists to control.
- **Every refresh can consult a model.** The evaluation includes agentic impact analysis
  (SWR-3503). `ProjectionReviews`' own docstring (`requirement_review.py:602–626`)
  explains why that is unacceptable on the Qt thread — "three sequential analyses with a
  frozen window" — but the same unbounded provider latency now sits inside every board
  refresh on the bridge worker, including refreshes triggered by a background commit. The
  board stays responsive (worker thread), but "Evaluating requirements…" can silently
  mean "waiting on an LLM", with no distinct state and no cancel.
- **Reads race across processes.** A headless propagation pass (SWR-3515) or a second
  Rotaris instance evaluating the same workspace relies entirely on store-level locking;
  the port gives no signal that a refresh is also a writer.

**Recommendation.** Split the seam into what it actually is: `evaluate()` (writes, may
consult a model, cancellable, reports moves) and `project()` (pure read), with the bridge
orchestrating "evaluate then project" and surfacing a distinct "analysing changes (may
take minutes)" state. Short of that, at minimum correct the Protocol docstring and gate
the model-consulting analyses behind the evaluator's trigger policy rather than every
`refresh()` — a manual "Re-evaluate" whose tooltip says "Runs nothing and measures
nothing" (`views/requirements.py:1117–1119`) currently *can* run impact analyses; the
tooltip and the behaviour should be reconciled in whichever direction is intended.

### F2 (M) — Board pass and detail pass share mutable state across two threads

`RequirementsBridge` refuses a second board pass while one is in flight and a second
detail pass while one is in flight — but a board pass and a detail pass may run
**concurrently**, and both use the same `WorkspaceBoard`, whose `project()` reassigns
`_index`, `_evidence`, `_relations` mid-run while `project_detail()` reads them
(`requirements_bridge.py:413–418` vs `476–487`), and whose `_opened()` lazily constructs
the registry/store without synchronisation. Worst realistic outcome is a detail built
from a mixed generation (new index, old evidence) or a duplicated full source read — not
corruption — but it is a genuine data race on CPython-atomicity luck.

**Recommendation.** Capture `(index, evidence, relations)` as one immutable tuple swapped
atomically (single attribute), or serialise board and detail passes on one worker slot
the way adoption/verification already share one (`requirements_controller.py:229–234`).

### F3 (M) — SWR-3123 static admission is evadable by indirection, and one docstring claim is wrong

The admission check judges literal names only (`generated.py:252–320`). Two concrete
gaps, both passing `admit_parser` today:

- `getattr` is not banned. `getattr(path, "write_text")("…")` performs a refused write;
  `getattr(x, "__globals__")` bypasses the banned-attribute check. The outer call's
  `func` is a `Call` node, which `_check_call` does not inspect.
- `sys.modules["os"].system("…")` contains no banned name: `modules` is a subscript,
  `system` is neither in `_BANNED_NAMES` nor `_WRITE_METHODS`. The comment at
  `generated.py:92–93` — "``sys.modules`` tricks requires calls the banned-name check
  refuses" — is not true as written; `os` is inevitably imported in the child before the
  parser runs.

The trust model still holds — the parser is reviewed, committed, and hash-pinned, so this
is defense-in-depth rather than an open door — but SWR-3123's acceptance criteria promise
that "a parser … making a network, write, subprocess or clock call is refused before
execution", and the check as merged will not keep that promise against a parser written
to evade it (including a *generated* parser that stumbles into these forms innocently).

**Recommendation.** Ban `getattr`/`setattr`/`delattr` (or admit only
literal-string `getattr` and route it through the same attribute judgement), refuse
attribute/subscript reach into `sys.modules`, and consider dropping `sys` from
`ALLOWED_IMPORTS` by passing the root as a plain injected variable and reading the
contract's output from the namespace instead of stdout. Alternatively, soften the spec's
stated guarantee to match the check ("refuses the constructs a generated parser plausibly
produces"). Either the wall or the claim should move; today they disagree.

### F4 (M) — The controller↔view contract is structural but untyped

`RequirementsController` reaches its view exclusively through `getattr` probes and
signal-name tables (`requirements_controller.py:164–195`, `363–371`, `1505–1515`,
`_pane_missing` at 1052). The design intent is good (views may implement a subset;
`connected_signals` reports reality), but the contract now spans ~20 members
(`set_board`, `set_actions`, `set_queue`, `set_move_options`, `show_detail`,
`show_board`, `show_pane`, `attach_pane`, `panes`, plus two signal tables), and only
tests catch a rename. mypy strict is already on in this repo and would catch drift for
free if the contract were a `Protocol`.

**Recommendation.** Declare a `RequirementsBoardViewLike` Protocol (methods plus
`ClassVar` signal attributes) in `models/` or `services/`, type `attach_view` against it,
and keep the getattr-with-degradation behaviour for optional members. The tables stay;
the names stop being strings only.

### F5 (M) — Write-path services live under `widgets/`

`RequirementEditing`, `creation_sources`, and `preview_target` — the text-write seam over
`RequirementWriteBack` — are defined in `widgets/requirement_editor.py:139–560`, and
`services/requirements_actions.workspace_editing()` imports *up* from widgets
(`requirements_actions.py:1959–1978`). Two additional couplings hide there:

- `preview_target` hard-codes the built-in Markdown store layout
  (`MarkdownStoreLayout`, `allocate_requirement_id`) behind a
  `getattr(source, "store_path")` probe (`requirement_editor.py:226–272`). Every future
  source (declarative, generated, tracker) answers "location not known" — an honest
  fallback, but the preview capability is really an **adapter** concern.
- `_location_of` uses the same structural probe (`requirement_editor.py:181–189`).

**Recommendation.** Move `RequirementEditing` (and the preview/creation-source helpers)
into `services/`, and consider promoting creation preview to an optional adapter
capability (`preview_create(draft) -> CreationTarget` beside `provides_history`), so
SWR-3606's "the adapter creates the native artefact" stays true as sources multiply.
Purely mechanical; no behaviour change.

### F6 (L→M) — Every accepted action re-reads the whole board

`RequirementsController._finish` triggers a full `refresh()` on every accepted action
(`requirements_controller.py:1197–1201`), and with F1 that refresh includes the
evaluation pass. On the target store size ("fifteen hundred", the module's own number)
a queue-drain of several accepts stacks several full passes (the bridge's busy-refusal
drops the extras, but each surviving pass is still full-cost). The projection is already
delta-friendly; the *inputs* are not.

**Recommendation.** Acceptable today; when store sizes grow, add an incremental input
path — e.g. `BoardProjector.inputs(changed=…)` reusing the previous `BoardInputs` for
untouched requirements (the registry already knows what moved via `RefreshReport`), or a
persistent evidence cache keyed on `(commit, layout)`. Design the seam before it is
needed; the pure `project_board` makes this a contained change.

### F7 (L) — The board's own kanban vocabulary is spelled in three places

`COLUMN_ORDER`/`COLUMN_HINTS` (`views/requirements.py:148–165`), `_MOVES`/`_TARGETS`
(`requirements_actions.py:296–401`), and the move combo's item list each restate the
delivery states. Runtime honesty is preserved (every move still asks `is_legal`, and
`move_options` derives reachability from the matrix), but adding a delivery state — or
renaming a token — touches five UI sites plus `theme.delivery_color`. The equivalence
test that exists for the grouping axis (`test_requirements_board.py:2350` asserts
`card_axis_value == entry.axis_value`) has no sibling for column order or for the
duplicated natural-sort key (`views/requirements.py:311` vs `model.py:201`).

**Recommendation.** One conformance test: `COLUMN_ORDER == tuple(DeliveryState) minus
blocked`, `_TARGETS` targets are all parseable states, and the two `requirement_sort_key`
implementations agree on a generative sample. Cheap insurance for a vocabulary that will
move (see SWR-3118 below).

### F8 (L) — Graph depth beyond 1 is epic-edges only

`build_neighbourhood` expands the centre's full relation set from its detail, but deeper
levels use only the epic fact the cards carry (`requirement_graph.py:279–304` — honestly
documented). The Zielbild's graph (§37: epic → product → technical → code → test over
*relations*) will need non-parent edges at depth ≥ 2. `RequirementCard` deliberately
drops `RelationsView`.

**Recommendation.** When the graph grows, prefer a projection-side slice (a
`neighbourhood(req_id, depth)` reader beside the detail pass) over fattening every card
with relations the board never renders — the per-card facts mechanism is the wrong
vehicle for graph data.

### F9 (L) — Small seam hygiene

- `_git()` subprocess helper and `FlowRunStarter._head` live app-side
  (`requirements_actions.py:2166–2189`, `2691–2695`) under the "one exemption" to the
  no-process rule; `_head_commit` (3085) already shows the better shape (ask the engine's
  `GitWorktreeInspector`). Shrinking the exemption to the agent host alone would let the
  SWR-3311 guard sweep get stricter.
- `WorkspaceBoard._opened` caches registry/source forever; a *changed*
  `requirement-source.json` mid-session is not picked up until restart
  (`requirements_bridge.py:344–376`). Adoption of a *first* mapping works (the cache is
  only set on success). Worth a revision check or an explicit "reload sources" path when
  source editing becomes a UI feature.
- `RequirementsView._details` caches details per requirement and serves them stale on
  re-activation until the deep read lands (`views/requirements.py:995`, `2277–2283`) —
  self-healing, but a generation stamp would make staleness testable.
- The queue placeholder under-count for multi-unit splits is a **decided** gap, recorded
  with its re-open condition at `requirements_actions.py:2024–2042` — exemplary; nothing
  to do, listed here so it is not re-litigated.

---

## 5. Extendability against the planned, not-yet-implemented requirements

### SWR-3118 — a source reports its own delivery state (draft)

The one open requirement that *touches the board's data model directly*. Assessment:

- **What is ready:** the capability mechanism (SWR-3105) extends by adding an enum member
  gated behind `.can()`; the origin vocabulary exists (`DeliveryOrigin.external`,
  SWR-3219); the card's `facts`/`alerts` mechanism absorbs a "Source state: In Progress"
  line without layout work; `axis_value`/filters extend the same way grouping did.
- **The real decision:** `DELIVERY_FIELD_NAMES` (`model.py:176`) deliberately bans
  `delivery_state`/`state` from `CanonicalRequirement` — the wall that keeps Rotaris'
  axis its own. A source-reported state therefore **cannot ride on the canonical
  requirement** without weakening the area's central invariant. It needs its own channel:
  either a sidecar on `SourceRead` (e.g. `reported_states: Mapping[req_id, str]` stamped
  like provenance), or a capability-gated adapter method the registry folds into the
  index. The projection then carries it as a third, clearly-labelled fact on
  `BoardEntry` (`external_state` + `external_state_source`), never merged into
  `DeliveryStatus`, with a notice when the two disagree (the requirement's explicit ask).
- **Recommendation:** when 3118 is picked up, write the channel decision down *first*
  (SourceRead sidecar is the smaller change and keeps `_stamp_provenance` symmetry), and
  extend F7's conformance test so the external vocabulary never leaks into column
  membership.

### SWR-3122 — sectioned requirement documents (draft, deferred behind 3123)

Seam-ready. `RequirementArtifact.requirement_ids` already models several ids per artefact
(`base.py:180–200`), and the registry's partial-read path already keys carried
requirements by artefact (`registry.py:799–858`) — the multi-id case is exercised by the
built-in ReqToCode source today. The work is contained inside `DeclarativeSource`: a
split rule plus two-level field resolution. One watch item: per-section `current_hash`
must be computed over the *section's* canonical content (the model already guarantees
this once the adapter yields per-section descriptions), and the split must feed
`artifact_requirements` so incremental refresh stays per-document.

### SWR-3123 — generated parser (merging now)

Reviewed above (§3.8 strengths, F3 gap). Architecturally it *validates* the source seam:
`JsonProposalStore` gained a `kind` key with backward-compatible absence, `SourceLoad`
dispatches on config type, and nothing downstream changed. Two forward notes:

- `GeneratedParserSource.revision()` reads **every watched file's bytes** on every
  registry refresh (`generated.py:521–539`). Correct and simple; on a large watched tree
  this makes the board's per-refresh floor O(store bytes) even when nothing changed.
  A `(size, mtime_ns)` digest with a content fallback would keep SWR-3116's spirit at
  scale — worth doing before pointing it at repositories with thousands of documents.
- Discovery's proposal flow now has three outcomes (declarative, sectioned-later,
  programmatic); the board's offer surface (`SourceProposalOffer`) renders a config
  document generically, so the parser path inherits the accept-flow for free — good.
  The acceptance dialog should surface `ParserAdmission.describe()` alongside the
  config so "reviewed" means the user saw the verdict, not only the code.

### Adjacent drafts that will feed this area

- **SWR-2608–2618 (completion-verifier gate lifecycle, drafts):** land engine-side behind
  `EvidenceReader`/`VerificationStore`; the ring and verification section read projected
  obligations and records, so no structural UI change is expected. The one UI-visible
  draft, SWR-2609 (live verification visibility), already has a surface precedent
  (`test_verifier_activity_ui.py`).
- **SWR-2318 (store-side retired-id register):** the seam is already stubbed —
  `RequirementRegistry.retired_recorder` with `NullRetiredIdRecorder`
  (`registry.py:408–454`) — a textbook example of the area's declare-the-seam-first
  habit. Blocked on the 2300-file status-splitting issue noted in the open-items plan.
- **Zielbild horizon (Jira/GitHub adapters, multiple sources per workspace):** the
  registry, collision reporting, and attribution already handle N sources
  (SWR-3115), but the *desktop composition* pins one:
  `requirement_source_for` returns a single source, and `WorkspaceBoard` builds
  `Registry([source])` (`requirements_bridge.py:362–374`). When the second source
  arrives, the change concentrates in exactly two functions (`requirement_source_for` →
  `requirement_sources_for`, plus the write-path's source selection in
  `WorkspaceProposals.accept`/`workspace_editing`) — a deliberate, small bottleneck.
  Flagging it now so nobody grows a parallel config path instead.

---

## 6. Recommended refactors, prioritized

> **Implementation plans:** each item below has a sliced plan (design, waves,
> spec impact, tests) under
> [`docs/plans/2026-08-17-requirements-refactors/`](../plans/2026-08-17-requirements-refactors/README.md).

1. **Split evaluate from project on the board seam** (F1). Biggest honesty and
   operability win: a truthful port contract, a visible "analysing changes" state, a
   cancel path, and manual re-paint that costs no model call. Contained in
   `requirements_bridge.py` + one bridge state.
2. **Close or re-scope the SWR-3123 admission gaps** (F3) before the parser path is
   offered to real foreign repositories — ban `getattr`-family and `sys.modules` reach,
   or amend the requirement's stated guarantee. Small, self-contained, high
   promise-keeping value.
3. **Atomic snapshot for `WorkspaceBoard`** (F2). A three-line structural fix
   (one tuple attribute) removes the only real data race found.
4. **Type the view contract** (F4) and **add the vocabulary conformance test** (F7).
   Both are pure hardening; together they make the two seams that will be edited by
   future slices (view surface, delivery vocabulary) rename-safe.
5. **Relocate `RequirementEditing` to services; make creation-preview an adapter
   capability** (F5). Do it before SWR-3122/3118 add more source kinds so the editor
   does not accrete more `store_path` probes.
6. **Plan the incremental-inputs seam** (F6) and the **revision-digest cheapening**
   (SWR-3123 note) as one "board pass at scale" work item — both are read-cost, both are
   invisible until a large store arrives, and both have clean insertion points today.

Not recommended: restructuring the controller or the view files for size alone. Both are
big (1.8k / 2.4k lines) but cohesive, navigable, and their extension points
(`attach_pane`, signal tables, worker slots) are where new code lands anyway. The
pass-workers (`_AdoptionWorker`, `_VerificationWorker`, `_SourceAdoptionWorker`) are the
one natural extraction if the controller grows again.

---

## 7. Closing assessment

The Requirements area is the strongest-architected subsystem in this codebase: the
engine/UI seam is real and test-enforced, state machines and hashes make the product's
central promises (no forced Done, no second engine, no second requirement repository)
structural, and the deferred requirements were anticipated well — SWR-3122 and the
multi-source future need no seam work at all, and SWR-3123 landed as a pure plug-in.
The material findings are three: the read-port that quietly writes and can quietly wait
on a model (F1), a benign-but-real thread race on the shared board reader (F2), and an
admission check whose guarantees currently outrun its implementation (F3). All three are
contained, none blocks the drafts in flight, and the refactor list above is ordered so
each step pays for itself before the next planned requirement touches the area.
