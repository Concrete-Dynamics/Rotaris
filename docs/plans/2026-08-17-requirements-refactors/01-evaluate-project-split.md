# Plan 01 — Split evaluate from project on the board seam

**Status:** Done (2026-08-18) — waves 1–2, then 3–4 · **Date:** 2026-08-17 · **Source:** review finding F1 (High), § 6.1
**Size:** L · **Risk:** Medium (touches the engine's propagation entry point, the bridge, and the board UI)
**Depends on:** Plan 03 (the `WorkspaceBoard` snapshot is the substrate both stages share)
**Touches:** `src/rotaris_core/requirements/change_host.py`,
`apps/rotaris/src/rotaris/services/requirements_bridge.py`,
`apps/rotaris/src/rotaris/services/requirements_controller.py`,
`apps/rotaris/src/rotaris/models/requirements_state.py`,
`apps/rotaris/src/rotaris/views/requirements.py`, two new spec files

---

## 1. Problem

The board's read port promises purity and its production implementation is a
writer that can wait on a language model:

- `BoardSource.project()` documents itself as "Reads only; never writes
  (SWR-3216)" (`requirements_bridge.py:200–201`). SWR-3216 itself says the
  projection API "is side-effect free".
- The production implementation, `WorkspaceBoard.project()`
  (`requirements_bridge.py:378–446`), deliberately runs the propagation pass
  first: `_evaluate` (lines 269–308) calls
  `evaluate_workspace` (`change_host.py:2585`), which **applies system-actor
  transitions and writes delivery records**. The behaviour is required — SWR-3502
  demands that a delivered requirement whose text moved reaches `Needs Update`
  on evaluation without user action — but the seam does not say it.
- `evaluate_workspace` defaults `analysts` to "resolve the workspace's
  configured persona" (`change_host.py:2616`), so **every refresh can consult a
  model**: the impact analysis (step 4, `change_host.py:2640–2653`), the
  clarification pass (`2678–2689`), the migration planner (`2690–2698`) and the
  removal analysis (`2699–2712`) all sit inside every board refresh — including
  refreshes triggered by a background commit. The only UI state is `loading`
  (`requirements_state.py:885`); "Evaluating requirements…" can silently mean
  "waiting on an LLM", with no distinct state and no cancel.
- The review-panel fallback `lambda _req_id: source.project()`
  (`requirements_controller.py:1023`) makes even a review read a writer.
- The manual **Re-evaluate** button's tooltip says "Read the sources and stores
  again. Runs nothing and measures nothing."
  (`views/requirements.py:1115–1121`) — untrue on both counts: it can run
  model analyses and it moves cards.

Three consequences (review F1): the port lies to every test double and future
implementation; unbounded provider latency hides inside a state that looks like
a file read; and a cross-process evaluation (headless SWR-3515, second Rotaris
instance) gets no signal that a "read" is also a writer.

## 2. Goal / non-goals

**Goal.**

1. `project()` is a pure read again, and the Protocol docstring is true.
2. Evaluation is a **distinct stage** with a stated depth: deterministic rules
   always, model-consulting analyses only where the trigger policy asks for
   them.
3. The analysing stage is **visible** ("Analysing changes — this may take
   minutes") and **cancellable**.
4. The Re-evaluate control's words and behaviour agree.

**Non-goals.** Changing any propagation rule or its order (SWR-3515); changing
the evaluator's trigger policy semantics (SWR-3210/SWR-3117); cross-process
locking for concurrent evaluations (store-level locking stays as is; this plan
only makes the seam say which calls write); incremental input reuse (Plan 06).

## 3. Design

### 3.1 Engine: a stated depth and a cancellation seam

`evaluate_workspace` gains two parameters:

```python
class EvaluationDepth(StrEnum):
    RULES_ONLY = "rules-only"   # steps 1–2: specification pass, evidence loss
    FULL = "full"               # everything, as today

def evaluate_workspace(
    workspace: Path, *,
    requirements, current_for, swept, version_at=None, tombstones=(),
    at=None, analysts=None, policy=None,
    depth: EvaluationDepth = EvaluationDepth.FULL,
    cancel: CancelToken | None = None,
) -> PropagationReport: ...
```

- `RULES_ONLY` skips the analyst-touching steps: impact analysis, the
  clarification pass, migration planning, removal analysis. It is **not** the
  same as `ChangePolicy(analyze_changes=False)` — the policy is the workspace's
  standing declaration; the depth is per-pass, and the two compose (a policy
  that disables a rule disables it at every depth).
- `cancel` reuses the existing `CancelToken`
  (`registry.py:113` — already "checked between sources and between
  artefacts"). It is checked **between per-requirement analyses**, so the cost
  of a cancel is bounded by one analysis. Deterministic steps 1–2 are not
  cancellation points: they are fast, and a half-applied rule pass is worse
  than a completed one.
- `PropagationReport` gains two fields:

```python
cancelled: bool = False
#: Requirement ids step 1 moved whose impact analysis did not run
#: (depth, policy, or cancellation). The caller decides how to catch up.
unanalysed: tuple[str, ...] = ()
```

**The stranded-analysis question.** Step 4 analyses "what step 1 moved" in the
*same* pass (`change_host.py:2639–2653`). A `RULES_ONLY` or cancelled pass
therefore moves a requirement to `Needs Update` whose impact analysis never
ran, and the next pass's step 1 finds nothing newly moved. Wave 1 must
establish by test what already happens in this case under
`ChangePolicy(analyze_changes=False)` (the switch exists today,
`change_host.py:188`): if the change-offer surface analyses on demand when a
review is opened, nothing is stranded and `unanalysed` is informational; if it
does not, the controller re-submits an evaluation event for the stranded ids so
the next `FULL` pass picks them up (wave 3). Do not skip this question — it is
the one place the split could silently weaken SWR-3503.

### 3.2 Workspace board: two methods, one shared snapshot

```python
@runtime_checkable
class BoardEvaluation(Protocol):
    """The write half of the seam — the one call on this path that writes."""
    def evaluate(self, *, depth: EvaluationDepth,
                 cancel: CancelToken | None = None) -> EvaluationOutcome: ...

class BoardSource(Protocol):
    def project(self) -> BoardProjection: ...   # docstring now true
```

- `WorkspaceBoard.evaluate()` performs the read phase (registry refresh +
  evidence sweep), stores it as the Plan 03 snapshot, then runs
  `evaluate_workspace` over it. Returns `EvaluationOutcome` (frozen:
  `moves: tuple[str, ...]`, `cancelled: bool`, `unanalysed: tuple[str, ...]`,
  `depth`).
- `WorkspaceBoard.project()` loses the `_evaluate` call. It serves from the
  snapshot when the registry reports the same generation (the same
  revision-keyed caching discipline `SourceSnapshot` already follows,
  `registry.py:268–285`), otherwise re-reads. Delivery records are **not** part
  of the snapshot — `BoardProjector` reads the store fresh on every projection,
  which is how a projection issued right after `evaluate()` shows the moves it
  made.
- `specification_moves` keeps its name and meaning, now filled by `evaluate()`.
- The bridge probes `isinstance(source, BoardEvaluation)` exactly as it probes
  `DetailSource` today (`requirements_bridge.py:761–764`). A test double that
  implements only `BoardSource` gets a pure read — which is the point.
- `ProjectionReviews`' fallback (`requirements_controller.py:1023`) becomes a
  pure read with no code change — record that in its docstring.

### 3.3 Bridge: one worker run, two stages, one new state

`RequirementsBridge.refresh()` gains a depth:

```python
class RefreshKind(StrEnum):
    REPAINT = "repaint"       # project only — no write, no rule
    EVALUATE = "evaluate"     # RULES_ONLY evaluate, then project
    ANALYSE = "analyse"       # FULL evaluate, then project
```

The existing `_ProjectionWorker` runs both stages in one thread run (evaluate,
then project), so `busy` keeps meaning "a pass is in flight" and the
one-in-flight refusal is unchanged. New surface:

- signal `analysing_changed(bool)` — true only while the model-consulting
  stage runs; distinct from `busy_changed`.
- `cancel_analysis()` — sets the pass's `CancelToken`. Cancelling never
  abandons the pass: rules are already applied, the projection still runs, and
  the board lands on the truth.
- `RequirementsBoardState` gains `analysing: bool = False`; the surface's
  status line renders it as its own sentence ("Analysing changes — this may
  take minutes") with a Cancel control, instead of overloading `loading`.

**Call-site policy** (the table the controller owns):

| Trigger | Kind | Why |
|---|---|---|
| Evaluator burst due (`_evaluation_due`, `requirements_controller.py:1425`) | `ANALYSE` | SWR-3210's triggers are the declared moments for model-consulting analysis |
| Accepted action (`_finish` → refresh, `:1197–1201`) | `EVALUATE` | the rules must run so an accepted EDIT reaches `Needs Update` (SWR-3502); no model |
| Manual Re-evaluate button | `EVALUATE` | matches the reconciled tooltip |
| First open of the view (`_active_view_changed`, `:1350–1359`) | `EVALUATE` | the board must open on propagated truth without paying a model call |
| Review / detail reads | pure `project()` / `project_detail()` — no kind at all |

### 3.4 UI truth

Re-evaluate tooltip becomes accurate, e.g.:

> "Re-read the sources and stores and apply the propagation rules.
> Consults no model and measures nothing; cards a rule moves will move."

The analysing state gets its own sentence and a Cancel button; both get
accessible names (SWR-3314 discipline).

### 3.5 Alternatives considered

- **Only fix the docstring** (review's minimum). Rejected as the plan's end
  state: it leaves unbounded provider latency inside every background refresh
  and the tooltip still lying. It is, however, a legitimate wave-0 stopgap if
  this plan is deferred.
- **Two worker threads (evaluate worker, project worker).** Rejected: the
  stages are strictly sequential per pass; a second thread buys nothing and
  doubles the lifetime bookkeeping the PySide 6.8 note
  (`requirements_bridge.py:843–849`) exists for.
- **Gate analyses via `ChangePolicy` mutation per call.** Rejected: the policy
  is the workspace's persistent declaration (SWR-3117); a per-pass depth is a
  different axis and mixing them makes "which pass may analyse" unreadable.

## 4. Waves

### Wave 1 — engine: depth + cancellation (engine-only, no UI change)

1. Draft the propagation-side spec (allocate an SWR-35xx id): *an evaluation
   pass has a stated depth; a cancelled or rules-only pass reports what it did
   not analyse*. Status `draft`.
2. Add `EvaluationDepth`, `depth`, `cancel` to `evaluate_workspace`; thread the
   token into the per-requirement analysis loops; add
   `PropagationReport.cancelled` / `.unanalysed`.
3. Tests (`tests/unit/requirements/` beside the existing change-host tests):
   scripted `Analysts` counting invocations — `RULES_ONLY` makes zero analyst
   calls; `FULL` matches today; cancellation after analysis *k* stops before
   *k+1* and reports the remainder in `unanalysed`; policy switches still
   dominate at every depth.
4. **Answer the stranded-analysis question** with a test against the offer
   surface (see 3.1) and write the answer into this plan file.
5. Flip the spec to `approved`. Gate: full suite + `reqtocode check` green;
   `rotaris-cli requirements evaluate` still runs `FULL` (add a regression
   test — the CLI is the other consumer named at `change_host.py:2599–2601`).

### Wave 2 — workspace board: the split itself

1. Add `BoardEvaluation` protocol + `EvaluationOutcome`; implement
   `WorkspaceBoard.evaluate()`; strip `_evaluate` from `project()`; snapshot
   reuse per 3.2. Correct the `BoardSource.project()` docstring.
2. Tests: `project()` over a workspace with a moved delivered spec **does not
   transition** (assert on the delivery store, not a mock); `evaluate()` does
   and reports the move; `evaluate()`-then-`project()` shows the move;
   project-only path performs no store write (spy/read-only store fixture).
3. Gate: suite green. The board still behaves identically end-to-end because
   the bridge (unchanged until wave 3) is adjusted in the same slice to call
   `evaluate()` + `project()` back-to-back with `FULL` — behaviour-preserving.

### Wave 3 — bridge staging and call-site policy

1. `RefreshKind`, staged worker, `analysing_changed`, `cancel_analysis()`,
   `RequirementsBoardState.analysing`.
2. Apply the call-site table (controller `_finish`, `_evaluation_due`, button,
   first-open). If wave 1 found stranded analyses are real, re-submit
   evaluation events for `unanalysed` ids here.
3. Tests: fake `BoardSource`+`BoardEvaluation` with scripted latency asserting
   the state sequence (`busy` → `analysing` → `busy` → `evaluated`); cancel
   mid-analysis lands a complete board and clears `analysing`; controller
   policy-table test (each trigger produces its kind).

### Wave 4 — UI truth and the board-side spec

1. Draft + approve the board-side spec (allocate an SWR-33xx id): *the board
   states when an evaluation is analysing changes and offers cancel; manual
   re-evaluation consults no model*.
2. Status sentence, Cancel control, tooltip rewrite, accessible names;
   `test_requirements_board.py` assertions for all three; a11y sweep entry.

## 4a. What landed in waves 1–2, and the answer to § 3.1

**The stranded-analysis question is answered, and it was the bad branch.** The
offer surface does not analyse on demand: `pending_change_work`
(`change_host.py:1422`) is "cheap on purpose … no model" and returns `None` when
the analysis log holds no IMPACT record, so a stranded requirement sits in
`Needs Update` carrying no offer — indistinguishable from "nothing to do".

**The fix is the state-derived worklist, not `unanalysed` + re-submission.** The
plan's mechanism would have put the catch-up in the desktop, where a crash, a
restart or a headless caller loses it. Instead step 4's input stops being "what
step 1 moved": `run_specification_pass` already assesses *every* delivery record,
and one already in `Needs Update` and still divergent comes back as `STEADY`
asking for no transition, with both hashes and the retained delivery on it
(`change/detection.py:797–800`). `impact_worklist` reads that and subtracts the
versions already judged, keyed on the record's `after_hash` — the analysed
requirement's own content hash (`change/impact.py:355`). The dedupe is
load-bearing: records append (SWR-3514), so without it every pass re-analyses
every card at a model call each.

This fixes a hole that was **already open** with no depth involved — a workspace
with `analyze_changes` off, or one whose persona did not resolve, stranded
requirements the same way. It is a change to an engine rule, which § 2 listed
under non-goals: a deliberate, recorded deviation.

**Allocated:** SWR-3519 (approved). SWR-3515's first acceptance criterion gained
a clause naming full depth as the default, since a rules-only call does not run
every rule; its body sentence about the analysis seeing "only what step 1 moved"
was corrected. SWR-3503 needed no amendment — it constrains *that* the analysis
happens, never *when*.

**Wave 2 is behaviour-preserving by construction:** `_ProjectionWorker.run`
calls `evaluate()` then `project()`, so the board does exactly what it did. Three
test harnesses that modelled "one board read, evaluation included" were updated
to the two stages — they emulate the desktop's pass, and the pass now has two
names. Every assertion was measured against a mutant: restoring the moved-only
rule fails the three catch-up tests, dropping the dedupe fails four, and making
`project()` evaluate again fails the seam-honesty test.

## 4b. What landed in waves 3–4, and what the plan got wrong

**Allocated:** SWR-3319 (approved), *The board says when it is analysing changes,
and lets you stop*, derived from SWR-3312. SWR-3519 gained one reporting clause
(below). Nothing else needed amending.

**The call-site table became a default plus two opt-ins.** § 3.3 wrote it as a
row per trigger, which would need keeping in step with ten call sites.
`RequirementsController.refresh` defaults to `EVALUATE` instead, so every trigger
that says nothing costs nothing, and exactly two places name `ANALYSE`:
`_evaluation_due` (SWR-3210's declared moments) and `analyse()` (the control a
user presses). A test reads those two names off the module's AST, so a new site
cannot start spending model calls unasked.

**`RefreshKind` has two members, not three.** `REPAINT` was dropped: nothing
called it, and a projection with no evaluation is already reachable by holding a
plain `BoardSource` — which is what `ProjectionReviews`' fallback does.

**One engine field the plan did not foresee: `PropagationReport.analysis_enabled`.**
`unanalysed` alone cannot drive an offer. A workspace with `analyze_changes: false`
reports a permanently non-empty worklist, and a control that ran a full pass
against it would do nothing, forever. Inferring the switch from the *shape* of the
result was rejected — a failed analysis leaves exactly the same evidence
(SWR-3503), so the board would report a broken provider as a settings choice. The
pass says it instead, read from the policy, and SWR-3519 gained the clause.

**The user chose the affordance and kept the automatic passes.** A rules-only
manual refresh alone would leave a card in `Needs Update` with no offer and no way
to ask for one, so `unanalysed` became a visible **Analyse changes (N)** control —
which is also what makes the analysing state reachable by intent instead of only
by a background commit. Repository events keep analysing automatically: SWR-3210
declares them, and the review's objection was the hiding, not the spending.

**The 1000×680 fit test changed the design, twice.** § 3.3 put the new controls in
the board view's own header beside `Re-evaluate`. Two buttons there put the view's
minimum width at 983 against a pane of 884; collapsing them into one control
(start and stop are the same button, as `_render_verify` does for Verify) still
left 929. Both now live on the **area header**, beside the status sentence they
act on — which is the better home anyway: "3 awaiting analysis" and "Analysing
changes…" are said there. Consequence: no new view signals and no `VIEW_SIGNALS`
rows, so § 3.3's hand-off to Plan 04 is moot.

**Both refresh controls were lying, not one.** § 1 named the board's
`Re-evaluate` ("Runs nothing and measures nothing"). The area's own `Refresh
requirements` promised "Re-evaluate every requirement in this workspace", which
the cheap pass does not do either — untrue in the opposite direction. They now
carry one shared sentence.

**A follow-up closed three gaps and found a fourth.** The first three were
SWR-3319's own acceptance criteria, half-covered: the new control's fit at
1000×680 lost its test when the control moved to the area header, the a11y sweep
fixtures the board view and so never saw it, and `STOP_ANALYSING_TOOLTIP` was the
one new sentence with nothing behind it. All three are covered now, by one sweep
over `controller.surface` in each of its four analysis states.

The fourth was a real defect, found because one of the new tests was itself
flaky (1 failure in 3 full-suite runs). `RequirementsBridge._finished` cleared
`_thread`, `_worker` and `_cancel` unconditionally, but `QThread.finished` is
delivered as a queued call — and `busy` reads `isRunning()`, which goes false the
moment the thread stops. A refresh issued in that window had its bookkeeping
cleared by its predecessor: `busy` then read false during a live pass, so a third
refresh could start beside it, and `cancel_analysis` had no token while an
analysis ran. The slot now asks the signal which thread finished, through
`QObject.sender`, and returns early if it is not the current one.

**Not** by binding the thread into the connection, which was the first attempt and
was worse than the bug: a connection holding its own reference to the `QThread`
outlives the `deleteLater` it schedules, and PySide faults on the stale wrapper
during teardown — a deterministic segfault, 0/10 where the same test had been
10/10. Measured, reverted, redone.

The test reproduces the window with `QThread.wait`, which blocks without pumping
the event loop, so the stale `finished` is provably still queued rather than
merely assumed to be. `_RecordingSource` gained a gate for the same reason: the
neighbouring test asserting a second pass is refused mid-flight was asserting a
race, and a fake that fast can finish between two lines of the test observing it.

**And it was the flake.** Every slice of this plan reported
`test_a_re_evaluation_updates_one_card_and_keeps_selection_and_scroll` as a
pre-existing Qt teardown crash, measured at 3/10 against a 4/10 clean baseline
and set aside as environmental. It was neither environmental nor unrelated: it
was this defect. Retiring a live pass's thread is exactly the double-free the
teardown was dying on. After the fix that test runs **10/10**, and the whole
board file — which used to segfault reliably in a single process — runs **5/5**.
The desktop suite is 959 passed across four consecutive runs, in 41s where the
crashing runs took 50–85s: an xdist worker that segfaults takes down whatever it
was running, which is where the wandering failures in neighbouring files came
from.

**Verified live, offscreen, over real workspaces.** A cheap refresh over this
repository reads 1527 requirements in 3.9s and reaches **no analyst**; the
analysing state renders its own sentence, the control becomes the stop, and
stopping lands the board with all 1527 cards. The offer path needed a second
workspace — this repository has no delivery records at all, so nothing in it can
diverge — and over a real git checkout with one delivered requirement edited, a
cheap refresh moves the card to `Needs Update`, reports `('SWR-6200',)` awaiting
analysis, and renders "Analyse changes (1)", enabled.

**Windows CI rejected the fit assertion, and it was right to.** The sweep added
above measured the *area's* minimum size against 1000px. On `windows-latest` that
is 1052px — and it failed in the state where the new control is **hidden**, which
Qt excludes from layout sizing entirely. So the assertion was never measuring the
control; on Linux it was measuring the board (826px, unmoved by anything in the
header) and only fired once a mutant pushed the header past *that*. It now
measures the header row, which needs 367–515px and is the thing the test is
about. The 1052px area minimum is a real pre-existing Windows defect against the
documented 1000×680 floor, untouched by this PR, and is written up in
`docs/bug/2026-08-18-requirements-area-exceeds-minimum-width-on-windows.md`
rather than absorbed into a widened assertion.

**Windows CI found a second thing, and the first fix for it was wrong too.**
`test_a_re_evaluation_updates_one_card_and_keeps_selection_and_scroll` timed out
there waiting for a second `evaluated`: `evaluated` is emitted from the worker's
*result*, which reaches the main thread while the worker's thread may still be
winding down, and a refresh is refused outright while one is in flight. Measured
on Linux, the bridge is still busy when `evaluated` arrives **29 times in 40** —
`settle()` merely happened to cover the gap here, and does not on Windows.

The first attempt made the bridge reap a stopped-but-unretired pass. That was
aimed at the wrong window — `busy` reads `isRunning()`, which is already false
there — and no test could demonstrate it, so it was reverted rather than kept as
surface nobody can justify. The guarantee that a refresh is refused mid-flight is
deliberate (a board is never assembled from two evaluations at once), and the
caller that must not lose an event already re-arms a timer. So the fix is in the
tests: every one that runs two passes now waits for the bridge to go idle,
including the two pre-existing ones that had the same race and had simply been
lucky.

**Shipped as one commit, not two.** The controller carries both halves, and a
wave-3-only commit would have been a product that lost the impact analysis with
no control to ask for it back. Every assertion was measured against a mutant: the
manual refresh defaulting expensive, `analysing` firing for every pass, a stop
throwing the board away, the offer ignoring the policy, the status line losing its
own sentence, and the control never stopping anything — each fails at least one
test.

## 5. Specification & traceability impact

- **New:** one SWR-35xx (depth + cancel, wave 1), one SWR-33xx (visible +
  cancellable analysing state, wave 4). Draft first, approve in-slice.
- **Unchanged but re-read at implementation:** SWR-3216 (the projection API
  stays side-effect free — this plan aligns the desktop seam with it),
  SWR-3502 (rules still run on every evaluating refresh), SWR-3503 (impact
  analysis timing moves to trigger-gated passes — confirm the spec text
  tolerates that; if it says "on every evaluation", amend it in wave 1's spec
  slice), SWR-3210/3117 (trigger policy untouched), SWR-3515 (headless entry
  point keeps `FULL`).
- Existing `@traces` on `_evaluate`/`project` move with the code.

## 6. Test strategy

Beyond the per-wave tests above: the guard sweep
(`test_requirements_board.py:483–680`) must stay green untouched — nothing in
this plan adds a process launch or a derived verdict app-side. Add one
**seam-honesty test** that outlives the refactor: instantiate every production
`BoardSource` the app composes and assert `project()` writes nothing (delivery
store mtime/content unchanged) — the executable form of the docstring.

## 7. Risks & rollback

- **Stranded analyses** (3.1) — the one behavioural risk; wave 1 resolves it
  before any UI change.
- **Offer timing shifts**: change-work offers may now appear after triggered
  passes rather than after any manual refresh. This is the intended behaviour;
  state it in the wave-4 spec so it is a decision, not a surprise.
- **Rollback**: wave 3's bridge can revert to composing `evaluate(FULL)` +
  `project()` unconditionally (wave 2's end state) without touching the engine;
  the engine additions are parameter-additive with defaults preserving today's
  behaviour.

## 8. Acceptance criteria

- [ ] `BoardSource.project()`'s docstring is true, and a test enforces it.
- [ ] No model call can be reached from a manual Re-evaluate, an accepted
      action's refresh, or the first open of the view.
- [ ] A commit-triggered pass that consults a model shows "analysing" as its
      own state and can be cancelled; cancellation still lands a truthful board.
- [ ] No requirement is left permanently unanalysed by a rules-only or
      cancelled pass (mechanism per wave 1's answer).
- [ ] The Re-evaluate tooltip describes exactly what the control does.
- [ ] Both new spec files are `approved`; `reqtocode check` passes.
