# Plan 03 — Atomic snapshot for `WorkspaceBoard`

**Status:** Done (2026-08-17) · **Date:** 2026-08-17 · **Source:** review finding F2 (Medium), § 6.3
**Size:** S · **Risk:** Low (structural change inside one class; no behaviour change intended)
**Depends on:** nothing. **Do this first** — Plan 01 builds its evaluate/project
split on the snapshot this plan introduces.
**Touches:** `apps/rotaris/src/rotaris/services/requirements_bridge.py`,
`apps/rotaris/tests/test_requirements_board.py`

---

## 1. Problem

`RequirementsBridge` refuses a second board pass while one is in flight
(`requirements_bridge.py:833–834`) and a second detail pass while one is in
flight (`778–779`) — but a board pass and a detail pass may run
**concurrently**, on two different `QThread`s, against the same
`WorkspaceBoard`:

- `project()` (board worker) reassigns `self._index, self._evidence`
  (`:413`), `self._evaluated` (`:414`) and `self._relations` (`:418`)
  mid-run;
- `project_detail()` (detail worker) reads `self._index`, `self._evidence`,
  `self._relations` as three separate attribute loads (`:477–487`). A detail
  pass that interleaves with a board pass can combine a **new index with old
  evidence** (or any other mixed generation);
- `_opened()` (`:344–376`) lazily constructs the registry and store with a
  check-then-act (`if registry is None or store is None: … build …`). Two
  workers arriving on a cold board can both build a registry — one full source
  read is duplicated and one registry (with its snapshot cache and memory) is
  silently discarded.

Worst realistic outcome is a detail built from a mixed generation or a
duplicated full read — not corruption — but it is a genuine data race that
currently holds on CPython attribute-store atomicity and scheduling luck.

## 2. Goal / non-goals

**Goal.** One immutable snapshot value, swapped atomically through a single
attribute; a lock around the one lazy construction; the class docstring states
the threading contract.

**Non-goals.** Serialising board and detail passes onto one worker slot (the
adoption/verification suite passes share one slot for a different reason —
they mutate the working tree, `requirements_controller.py:229–234`; a detail
read blocked behind a full board pass would be a UX regression for no
correctness gain). Cross-*process* coordination (out of scope here and in F1).
Snapshot reuse across passes for cost (that is Plan 06).

## 3. Design

```python
@dataclass(frozen=True)
class _BoardSnapshot:
    """One pass's coherent read: index, evidence and relations from the same
    moment. Swapped through a single attribute so a concurrent reader sees
    either the previous generation or this one — never a mixture."""
    index: RequirementIndex
    evidence: EvidenceReader
    relations: RelationBlockers
    moves: tuple[str, ...] = ()
```

- `WorkspaceBoard` replaces `_index` / `_evidence` / `_relations` /
  `_evaluated` with one `self._snapshot: _BoardSnapshot | None = None`.
- `project()` builds the whole snapshot locally and assigns it **once**, at
  the point all three values exist (today's lines 413–418 collapse into one
  store). `specification_moves` becomes
  `self._snapshot.moves if self._snapshot else ()`.
- `project_detail()` reads `snapshot = self._snapshot` **once**, then uses
  `snapshot.index` / `.evidence` / `.relations` (or rebuilds all three when
  `snapshot is None`, exactly as its per-field fallbacks do today at
  `477–487` — the fallback becomes all-or-nothing, which is the fix).
- `_opened()` takes a `threading.Lock` held for the check and the
  construction. Construction is once per workspace and cheap to guard; the
  lock is never held during `project()`'s reads (only around the lazy build),
  so no new contention is introduced.
- A single reference assignment to an instance attribute is atomic under the
  GIL and remains a single store under free-threaded builds; the frozen
  dataclass guarantees the fields inside can never be observed half-written.
  Write that reasoning into the class docstring — it is the contract the next
  editor must not break by "just adding one more field" beside the snapshot.

**Alternative considered.** A `threading.RLock` around all reads and writes of
the trio. Rejected: it serialises the passes in practice (the board pass holds
state for its whole duration), and the immutable-swap achieves coherence
without blocking anyone.

## 4. Waves

### Wave 1 — the snapshot and the lock

1. Introduce `_BoardSnapshot`; collapse the four attributes; single-load
   discipline in `project_detail()`; `Lock` in `_opened()`.
2. Tests:
   - **Construction race:** a fake source counting constructor invocations;
     two threads call `_opened()` concurrently (barrier-started); exactly one
     registry/store pair is built.
   - **Coherence:** monkeypatch the evidence sweep to record which index
     generation it was paired with; run board and detail passes concurrently in
     a bounded loop; assert every detail used index and evidence of the same
     generation (the snapshot makes this structural, so the test is a
     regression tripwire, not a probabilistic hunt — keep iterations small).
   - **Attribute inventory:** assert `WorkspaceBoard`'s mutable state is
     exactly `{_workspace, _registry, _store, _source, _snapshot}` (plus the
     lock), so a future field cannot quietly reintroduce the split-brain.
3. Existing behaviour tests (`specification_moves` reporting, detail fallback
   when no board pass ran) must pass unmodified — this wave is
   behaviour-preserving.

### Wave 2 — contract documentation and bridge note

1. Class docstring: the threading contract (who writes the snapshot, who reads
   it, why one attribute).
2. Update the bridge module docstring's failure-shapes section only if wording
   references the old per-field caching (check; likely no change).
3. Hand-off note to Plan 01 in this file: `evaluate()` becomes the snapshot
   *writer* and `project()` its *reader/refresher* — the shape is ready.

## 4a. What landed, and what Plan 01 inherits

Both waves are in. `_BoardSnapshot` is a module-private frozen dataclass in
`requirements_bridge.py`, immediately above `WorkspaceBoard`; the class now holds
exactly `_workspace`, `_registry`, `_store`, `_source`, `_snapshot` and `_lock`.

**For Plan 01.** `evaluate()` becomes the snapshot's *writer* and `project()` its
*reader/refresher*. `moves` already carries a default, so the read phase (index +
evidence + relations) can be published *before* `evaluate_workspace` runs over
it — which is what lets a `RULES_ONLY` or cancelled pass leave a coherent
generation behind. Two constraints the split must keep:

- **The order of the engine calls is load-bearing.** `board_blockers` globs the
  decision store (`change_host.py:915`), which the evaluation's clarification
  pass may have just written into; blockers derived before the evaluation would
  silently drop the questions that evaluation opened. If `evaluate()` publishes
  a pre-evaluation snapshot, the post-evaluation refresh must re-derive
  relations, not carry the earlier ones forward.
- **One load per pass.** A guard test asserts each of `project`,
  `project_detail` and `specification_moves` touches `self._snapshot` exactly
  once; the new methods must hold to the same rule.

**Deviation from § 6, recorded.** The plan called for three tests; four landed.
The concurrency-based coherence test was measured against a mutant that restored
the old shape (staged publication plus three separate loads) and **did not catch
it** — the passes are ~60 ms on a small store, so the threads rarely overlap in
the window that matters. It is kept for what it does prove (the two passes run
concurrently without error, and every detail pass used one published
generation), and the structural half of the property is carried by a fourth,
deterministic test:
`test_each_pass_touches_the_snapshot_once_so_it_cannot_be_read_in_parts`, an AST
guard in the idiom of the file's existing sweeps. That one fails on the mutant.
The construction-race test was likewise verified against a lock-free mutant and
fails on it.

**Pre-existing flake, not caused by this work.**
`test_a_re_evaluation_updates_one_card_and_keeps_selection_and_scroll` aborts the
interpreter during Qt worker teardown (`RequirementsBridge._finished`) at roughly
the same rate with and without this change — measured 8/10 on both, on the clean
baseline commit as well. Worth its own look; it is not this plan's.

## 5. Specification & traceability impact

None. No user-visible behaviour changes; existing `@traces` markers
(`SWR_3311`, `SWR_3502`, `SWR_3313` on the affected methods) stay where they
are. `reqtocode check` must stay green (it will — no spec or marker moves).

## 6. Test strategy

The three wave-1 tests above, in `test_requirements_board.py` beside the
existing bridge tests. Keep the concurrency test deterministic-ish: barriers
for the construction race; a small bounded loop for coherence, asserting a
structural property (same-generation pairing) rather than timing.

## 7. Risks & rollback

- Risk is essentially zero: the change is mechanical and the tests are
  additive. The one subtlety is `project_detail()`'s fallback — it must go
  all-or-nothing (whole snapshot or full rebuild), never per-field.
- Rollback: revert the commit; nothing else depends on `_BoardSnapshot` until
  Plan 01 lands.

## 8. Acceptance criteria

- [ ] `WorkspaceBoard` holds index/evidence/relations/moves as one frozen
      value behind one attribute; a mixed-generation detail is structurally
      impossible.
- [ ] Concurrent first reads build exactly one registry, by test.
- [ ] The attribute-inventory test guards the shape.
- [ ] Full suite green with no behavioural test edited.
