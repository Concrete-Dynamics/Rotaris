# Plan 04 — Type the view contract; test the board vocabulary

**Status:** Proposed · **Date:** 2026-08-17 · **Source:** review findings F4 + F7, § 6.4
**Size:** S–M · **Risk:** Low (tests and typing only; zero runtime behaviour change)
**Depends on:** nothing.
**Touches:** new `apps/rotaris/src/rotaris/models/requirements_view.py`,
`apps/rotaris/src/rotaris/services/requirements_controller.py` (types only),
`apps/rotaris/tests/test_requirements_board.py` (or a new sibling test module)

---

## 1. Problem

**F4 — the controller↔view contract is structural but untyped.**
`RequirementsController` reaches its view exclusively through signal-name
tables and `getattr` probes. The full contract, enumerated from the code:

- **View signals** (`VIEW_SIGNALS`, `requirements_controller.py:164–169`):
  `refresh_requested`, `requirement_selected`, `requirement_activated`,
  `scroll_changed`.
- **Action signals** (`ACTION_SIGNALS`, `:179–195`): `move_requested`,
  `action_requested`, `feedback_dismissed`, `edit_requested`,
  `create_requested`, `blocker_answered`, `open_file_requested`,
  `queue_requested`, `review_requested`, `blockers_requested`,
  `open_run_requested`, `open_commit_requested`, `adoption_requested`,
  `adoption_dismissed`, `verification_requested`.
- **Probed members**: `set_board` (`:1513`), `set_actions` (`:1234`, `:1290`),
  `set_queue` (`:1079`, `:1293`), `set_move_options` (`:1254`),
  `show_detail` (`:530`), `show_board` (`:949`), `show_pane` (`:984`),
  `attach_pane` (`:467`), `panes` (`:1061`).

That is ~28 named members held together by strings. The degradation design is
good — a view may implement a subset, `connected_signals` /
`connected_action_signals` report reality — but only tests catch a rename, and
mypy strict (already on in this repo) would catch drift for free if the
contract were a `Protocol`.

**F7 — the kanban vocabulary is spelled in three places.**
`COLUMN_ORDER` / `COLUMN_HINTS` (`views/requirements.py:148–165`),
`_TARGETS` (`requirements_actions.py:296–304`) and `_MOVES` (`:395–401`)
each restate delivery-state tokens by hand. Runtime honesty is preserved
(every move still asks the matrix — `move_options`,
`requirements_actions.py:456`), but adding or renaming a state touches five UI
sites plus `theme.delivery_color`, and nothing asserts the spellings agree
with `DeliveryState` (`delivery/state.py:65–78`). The natural-sort key is also
implemented twice — `model.py:201–216` (chunk-based) vs
`views/requirements.py:311–325` (character-based) — with no equivalence test.

## 2. Goal / non-goals

**Goal.** (a) A `RequirementsBoardViewLike` Protocol that mypy checks the
shipped view against, so a rename is a type error before it is a broken
connection. (b) One conformance test module that pins the vocabulary tables to
the `DeliveryState` enum and the two sort keys to each other.

**Non-goals.** Changing the runtime attach behaviour — the tables stay, the
`getattr`-with-degradation stays, minimal test fakes keep working. Deriving
`COLUMN_ORDER` from the enum at runtime (considered, rejected: the column
order and the per-column sentences are deliberate UI copy; the test is the
synchronisation mechanism, the copy stays hand-written and reviewable).

## 3. Design

### 3.1 The Protocol

New module `apps/rotaris/src/rotaris/models/requirements_view.py` (models, not
services, so it can be imported by controller, views and tests without cycles):

```python
class RequirementsBoardViewLike(Protocol):
    """What the controller can use when a view provides all of it.

    Runtime attachment stays structural and degradable (SWR-3315); this
    Protocol exists so mypy — not a failing signal connection — reports a
    renamed member. Static contract, dynamic tolerance.
    """
    # -- view signals (VIEW_SIGNALS) --
    refresh_requested: SignalInstance
    requirement_selected: SignalInstance
    # … all 19 signals …
    # -- pushed state --
    def set_board(self, state: RequirementsBoardState, delta: BoardDelta | None) -> None: ...
    def set_actions(self, pending: tuple[PendingAction, ...], feedback: tuple[ActionFeedback, ...]) -> None: ...
    def set_queue(self, queue: QueueState) -> None: ...
    def set_move_options(self, options: Mapping[str, tuple[MoveOption, ...]]) -> None: ...
    # -- navigation / composition --
    def show_detail(self, detail: RequirementDetail) -> None: ...
    def show_board(self) -> None: ...
    def show_pane(self, key: str) -> bool: ...
    def attach_pane(self, ...) -> ...:   # copy the exact signature from RequirementsView
    @property
    def panes(self) -> Iterable[str]: ...
```

Signal attribute typing: `SignalInstance` (PySide6) under `TYPE_CHECKING`;
the exact `attach_pane` signature is copied from `RequirementsView` at
implementation time — the Protocol documents, it does not redesign.

**Enforcement is a function, not a cast.** In the same module (or the test
module):

```python
def _conforms(view: RequirementsView) -> RequirementsBoardViewLike:
    return view   # mypy strict fails here on any drift
```

`attach_view(view: QWidget)` keeps its runtime signature — partial views and
test fakes remain first-class. Optionally annotate the controller's private
push helpers (`_push_to_view` etc.) against the Protocol via a narrowing
helper, but only where it costs no runtime change.

### 3.2 The conformance tests

One test module, table-driven:

1. **Columns are the enum.**
   `COLUMN_ORDER == tuple(s.value for s in DeliveryState if s is not DeliveryState.BLOCKED)`
   (enum declaration order matches SWR-3302's stated order today — the test
   makes that a fact), and `BLOCKED_COLUMN == DeliveryState.BLOCKED.value`.
2. **Hints cover exactly the columns.**
   `set(COLUMN_HINTS) == set(COLUMN_ORDER) | {BLOCKED_COLUMN}`.
3. **Targets parse.** Every value of `_TARGETS` and every state token in
   `_MOVES` keys round-trips through `DeliveryState(value)`.
4. **Moves and targets agree.** For every `(source, target) → action` in
   `_MOVES` where the action has a `_TARGETS` entry:
   `_TARGETS[action] == target` (`RELEASE` appears twice with the same target
   — the mapping, not the pair, is asserted).
5. **Signal tables are real.** Every name in `VIEW_SIGNALS` / `ACTION_SIGNALS`
   exists on `RequirementsView`, and every slot name exists and is callable on
   `RequirementsController`. (Complements the existing `connected_signals`
   reporting: that asserts per-instance wiring; this pins the class-level
   vocabulary.)
6. **Sort keys agree.** The two `requirement_sort_key` implementations produce
   the **same ordering** (compare `sorted(corpus, key=…)` results, not key
   tuples — the tuples legitimately differ, chunk vs character). Corpus: a
   hand-picked edge set (`SWR-9`/`SWR-10`/`SWR-3123`, `a2c`/`a10b`, pure text,
   trailing digits, case pairs, hyphen runs, a casefold-sensitive pair) plus
   ~500 ids from `random.Random(3309)` over `[A-Za-z0-9-]`. Seeded, so a
   divergence reproduces.
7. **Theme coverage** (cheap extra): every `DeliveryState` value resolves a
   colour in `theme.delivery_color` without falling through to a default —
   include only if the theme exposes this without contortion.

## 4. Waves

### Wave 1 — vocabulary conformance tests

Land tests 1–4 and 6–7. These may **catch something** (the sort keys have
never been compared); if they do, fix the divergence in the same slice —
`model.py`'s implementation is the engine's and wins (SWR-3311 direction:
the desktop copies, the engine decides).
Gate: suite green, `reqtocode check` green.

### Wave 2 — the Protocol

1. Write `requirements_view.py`; `_conforms` enforcement; test 5.
2. Type-only edits in the controller where free (no behaviour change; the
   tables keep driving runtime wiring).
3. Gate: `mypy` strict green across `apps/rotaris`; suite green. Verify a
   deliberately renamed signal on a scratch branch fails **mypy**, not only
   the runtime test — that is the deliverable.

## 5. Specification & traceability impact

None mandatory. The tests trace naturally to existing requirements: column
vocabulary → `@verifies(SWR_3302, SWR_3201)`, signal tables → `SWR_3315`,
sort key → `SWR_3309`; use `@verifies` markers as the suite's convention has
them. No spec text changes; no new ids. When SWR-3118 lands later, extend
test 1's family so the *external* state vocabulary can never leak into column
membership (the review's § 5 note) — leave a comment anchor for it.

## 6. Test strategy

The plan **is** tests; the only design risk is over-pinning. Rule: pin
*agreement between copies*, never *specific copy content* (the hint sentences'
wording stays free; only their key set is pinned).

## 7. Risks & rollback

- Wave 1 may reveal a real sort divergence — that is a payoff, not a risk;
  budget the fix into the wave.
- mypy Protocol vs PySide6 signal descriptors can be finicky
  (`Signal` at class level vs `SignalInstance` on instances). If stubs fight,
  type signals as `Any`-free `ClassVar[Signal]` in the Protocol and keep the
  runtime test as the backstop for signals specifically — do not ship a
  Protocol that needs `# type: ignore` at its use site.
- Rollback: delete the test module / Protocol module; nothing depends on them.

## 8. Acceptance criteria

- [ ] Renaming any of the ~28 contract members breaks mypy or a named
      conformance test (verified once by deliberate mutation).
- [ ] `COLUMN_ORDER`, `_TARGETS`, `_MOVES`, `COLUMN_HINTS` are pinned to
      `DeliveryState` by tests.
- [ ] The two sort keys are proven order-equivalent over the corpus.
- [ ] No runtime behaviour changed: minimal fake views still attach with
      partial contracts, `connected_signals` still reports reality.
