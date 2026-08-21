# Plan 06 — The board pass at scale

**Status:** Implemented (waves re-scoped; see § 9) · **Date:** 2026-08-17, revised 2026-08-18 · **Source:** review finding F6 (L→M) + the SWR-3123 revision-cost note, § 6.6
**Size:** M–L (waves 3–4 deliberately gated) · **Risk:** Medium (cache-invalidation territory — every shortcut here must be provably safe)
**Depends on:** Plan 01 and Plan 03 for waves 3–4 (the pass kinds and the
snapshot are where the memo lives); SWR-3123 merged for wave 2.
**Touches:** `src/rotaris_core/requirements/delivery/projection.py`,
`src/rotaris_core/requirements/sources/generated.py`,
`apps/rotaris/src/rotaris/services/requirements_bridge.py`,
`apps/rotaris/src/rotaris/services/requirements_controller.py`, benchmarks

---

## 1. Problem

Two read-cost floors, both invisible today and both linear in store size:

1. **Every accepted action re-reads the whole board.**
   `RequirementsController._finish` triggers a full `refresh()` on every
   accepted action (`requirements_controller.py:1197–1201`), and
   `BoardProjector.inputs()` rebuilds evidence and execution for **every**
   requirement on every call (`projection.py:2355–2410`: `evidence_for` and
   `execution_for` run per requirement, unconditionally; only the deep views
   honour `req_ids`). On the module's own target number — "the fifteen
   hundred" (`requirements_bridge.py:36`) — a queue-drain of several accepts
   stacks several full passes. The projection itself is delta-friendly
   (SWR-3312 diffs, SWR-3317 virtualizes); the **inputs** are not.
2. **The generated parser's revision reads every watched byte, every refresh.**
   `GeneratedParserSource.revision()` (`generated.py:521–539`, pre-merge
   worktree) digests the full content of the parser plus every watched file on
   every registry refresh. Correct and simple — and it makes the board's
   per-refresh floor O(store bytes) even when nothing changed, before the
   parser is ever considered. SWR-3116's point ("did anything change,
   answerable without running the parser") deserves to also be cheap.

The review's verdict stands: **acceptable today**. This plan designs the seams
now — while the code is fresh and the insertion points are clean — and gates
the expensive waves behind measurement, so the work starts from numbers rather
than from a hunch. SWR-3317 ("board scales to a large store", approved) is the
spec anchor for the board-side budgets.

## 2. Goal / non-goals

**Goal.** (1) A benchmark harness that states the current cost per stage over
a parameterised synthetic store. (2) A per-file digest memo that makes
`revision()` cost stat-calls when nothing changed, without altering the token.
(3) A designed — and, when triggered, implemented — incremental-inputs path
keyed on what actually moved. (4) Evidence reuse across the one window where
it is provably safe.

**Non-goals.** Persisting caches across process restarts (in-memory per
session only — the registry's cross-session memory (SWR-3119) exists for
identity, not for cost, and a persisted evidence cache is a correctness
liability nobody has priced yet). Changing projection semantics or any
freshness rule (SWR-3209). Optimising the deep-view/detail pass (already
narrowed via `req_ids`).

## 3. Design

### 3.1 Trigger for waves 3–4

Implement waves 3–4 when **either** holds on the wave-1 benchmarks or a real
workspace: full board pass > ~1.5 s at the 1 500-requirement reference size,
or a user-visible complaint about post-action refresh latency. Until then the
seams stay designed-but-dormant. Record the trigger evaluation in this file
when it happens.

### 3.2 Wave 2 — revision digest memo (engine, independent)

The token stays **byte-identical** — same sha256 over the same content
stream — so nothing downstream (snapshot keying, SWR-3116 semantics) can
observe the change. Only the *re-reading* is skipped:

```python
#: path → (size, mtime_ns, content_sha). Consulted per file; a stat match
#: reuses the recorded content hash, a miss re-reads and re-records.
self._digest_memo: dict[str, tuple[int, int, str]] = {}
```

`revision()` keeps its structure (sorted relative paths, `\0` separators,
pinned hash first) and swaps `path.read_bytes()` for memo-or-read. Honest
residual: an in-place edit that preserves size **and** `mtime_ns` defeats the
memo. Real editors and git checkouts bump mtime; document the residual in the
docstring, and keep the memo in-instance only (a fresh session always
re-reads once). No config switch — if the residual ever bites, the fix is
deleting the memo, not a mode.

### 3.3 Wave 3 — incremental inputs

The changed-set already exists; nothing needs to guess:

- `registry.last_refresh` (`registry.py:442`) reports which artefacts each
  refresh actually re-read (`RefreshReport.artifacts_read`, `:245–265`), and
  the index maps artefacts to requirement ids.
- Plan 01's `EvaluationOutcome.moves` names what the propagation pass moved.
- The accepted action's own `req_id` names what the user touched.

Seam:

```python
def inputs(self, *, req_ids=None,
           previous: BoardInputs | None = None,
           changed: Collection[str] | None = None) -> BoardInputs:
```

Semantics: with `previous` and `changed`, evidence and execution entries for
requirements **not** in `changed` are carried over from `previous`; `index`
and `delivery` are always read fresh (the store read is cheap and is where
accepted actions land); `changed=None` or `previous=None` means full rebuild —
the default, and the answer whenever the caller is unsure. `WorkspaceBoard`
assembles the changed-set (union of the three sources above) and holds
`previous` on the Plan 03 snapshot; **any** git event (`store.git_changed`,
the same signal that drives SWR-3312) unconditionally drops it — repository
motion invalidates evidence wholesale, no cleverness.

### 3.4 Wave 4 — evidence reuse window

`WorkspaceEvidence.for_repository` is rebuilt per pass by design ("its
freshness memo must not answer from before the merge that just happened",
`requirements_bridge.py:405–408`). The **provably safe reuse window** is
exactly: passes between which no `git_changed` event arrived and no evaluation
wrote delivery records for evidence-bearing requirements. Honest scoping: the
highest-value accepted actions (ACCEPT merges a run's branch) *move the
repository* and therefore invalidate — the win is real only for the
non-moving actions (HOLD, RETURN, SEND_BACK, queue controls, review
send-backs). Implement as: the snapshot keeps the `WorkspaceEvidence`
instance; `_finish`-triggered `EVALUATE` passes reuse it when the
invalidation flag is clean; everything else rebuilds. If wave 1's numbers show
evidence is not the dominant term, **skip this wave** — record the decision
here.

### 3.5 Alternative considered

A persistent evidence cache keyed on `(commit, layout)` (the review floated
it). Rejected for now: cross-session correctness (dirty worktrees, tool
version drift) costs more design than the in-session window, and wave 1 will
show whether the in-session window already clears the budget.

## 4. Waves

### Wave 1 — measure (land now)

1. A synthetic-store fixture: generator producing N requirements (default
   1 500) with realistic epic nesting, traces and a delivery store; N
   parameterised.
2. Benchmarks (pytest-benchmark, as `apps/rotaris/tests/test_benchmark.py`
   already models): registry refresh cold/warm · `WorkspaceEvidence.for_repository`
   · `BoardProjector.inputs` · `project_board` · full `WorkspaceBoard.project()`.
3. Record the baseline table **in this plan file**; add loose regression
   budgets (×3 headroom) so a future change that quintuples a stage fails a
   test instead of a user.
4. Gate: benchmarks runnable in CI-quiet mode; no production code touched.

### Wave 2 — revision memo (land now; needs SWR-3123 merged)

1. The memo per 3.2; docstring states token-identity and the residual.
2. Tests: token equality memo-on vs memo-off over the same tree; a touched
   file re-reads (token moves); an unchanged tree re-stats only (assert via a
   counting `read_bytes` monkeypatch); memory bounded by watched-file count.
3. Gate: engine suite green; `reqtocode check` green (work lands under
   SWR-3116 + SWR-3123's existing traces).

### Wave 3 — incremental inputs (gated on 3.1)

1. `inputs(previous=, changed=)` per 3.3 with property tests: incremental
   result equals full rebuild for arbitrary changed-subsets over the synthetic
   store (the equality oracle is the full rebuild — cheap to assert, decisive).
2. `WorkspaceBoard` changed-set assembly + git-event invalidation;
   `_finish`-path uses it (Plan 01's `EVALUATE` kind).
3. Benchmark delta recorded here. Spec check: SWR-3116 (registry
   incrementality) and SWR-3216 (projection completeness — "the board itself
   is always complete", `projection.py:2361–2363`, still holds: only *input
   assembly* is incremental, the projection stays total).

### Wave 4 — evidence window (gated on 3.1 + wave 3's numbers)

Per 3.4, or a recorded skip decision.

## 5. Specification & traceability impact

No new ids expected: wave 2 lands under SWR-3116/SWR-3123, wave 3 under
SWR-3116/SWR-3216/SWR-3317 traces, and none changes user-visible behaviour —
only cost. If wave 3's equality property ever needs weakening (it must not),
that is the signal a spec conversation is due, not a code comment. Add the
benchmark budgets to SWR-3317's test portfolio table when wave 1 lands.

## 6. Test strategy

The oracle pattern carries this plan: every incremental path is asserted
**equal to the full rebuild** it replaces (wave 2: token bytes; wave 3:
`BoardInputs`; wave 4: projection output with reused vs fresh evidence over an
unmoved repository). Where equality cannot be asserted, the optimisation is
not safe and does not ship.

## 7. Risks & rollback

- **Stale-cache bugs** are the whole risk class. Mitigations are structural:
  identical tokens (wave 2), equality oracles (waves 3–4), and wholesale
  invalidation on the git signal rather than fine-grained cleverness.
- **Interaction with Plan 01/03 drift** — waves 3–4 assume the snapshot and
  pass kinds; re-verify their landed shape first.
- Rollback per wave: every memo/seam degrades to `previous=None` /
  memo-empty, which is today's behaviour.

## 8. Acceptance criteria

- [ ] A baseline cost table exists in this file, from the wave-1 harness.
- [ ] `revision()` over an unchanged watched tree performs zero content reads
      while producing the identical token, by test.
- [ ] (When triggered) an accepted non-moving action's refresh cost no longer
      scales with store size in the inputs stage, and incremental inputs are
      proven equal to full rebuilds.
- [ ] Every wave's decision (implemented / skipped, and why) is recorded here.

---

## 9. What the measurement said, and what was built (2026-08-18)

Wave 1 landed first, as designed, and it changed the rest of the plan. This
section is the § 3.1 trigger evaluation and the § 8 record of every wave's
decision.

### 9.1 The baseline

Measured over this repository's own store — **1527 requirements**, the reference
size — by `tests/unit/requirements/board_scale.py`, warm, reading only:

| Stage | Before | After | |
|---|---|---|---|
| `registry.refresh` (cold / warm) | 0.539s / 0.102s | 0.537s / 0.092s | |
| `WorkspaceEvidence.for_repository` | **0.922s** | **0.660s** | wave 3 |
| — `evidence_for` × 1527 | 0.033s | 0.030s | |
| — `execution_for` × 1527 | 0.102s | 0.093s | |
| `BoardProjector.inputs` | 0.151s | 0.128s | |
| `project_board` | **1.459s** | **0.313s** | wave 2 |
| **warm pass total** | **2.633s** | **1.192s** | |

Synthetic store, n=1500: 1.667s → 0.652s. `reqtocode check`, which every gate
run pays: 2.23s → 1.89s.

**The § 3.1 trigger fired** — 2.633s against a 1.5s budget — and it fired on
stages this plan's waves 3 and 4 barely touch. After the work below the pass is
**1.19s, inside the budget**, so the gated waves stay closed.

### 9.2 Where the cost actually was

§ 1 named `BoardProjector.inputs` and its per-requirement `evidence_for` /
`execution_for` loops. Those loops cost **0.135s of a 2.633s pass**. The two
dominant terms were the projection itself — which § 2 lists as a non-goal — and
the evidence sweep. Profiling both found three scans, none of them a caching
problem:

| Hot spot | Cost | What it did |
|---|---|---|
| `RelationGraph.outgoing`/`incoming` | 0.56s | filtered every edge, per query, 15 270 queries per pass |
| `RequirementIndex.by_id()` | 0.19s | rebuilt a 1527-entry dict on each of 3054 calls |
| `conventions.line_of` | 0.35s | counted newlines from position 0, once per each of 29 639 annotations |

All three are frozen values or pure functions, so the fix is a *shape*, not a
memo with a lifetime — which is what made them safe to change and cheap to
prove. That is the opposite risk profile from the incremental-inputs design this
plan spent § 3.3 on.

### 9.3 Waves as built

| Wave | Decision |
|---|---|
| 1 — measure | **Built.** Synthetic-store generator and per-stage harness, runnable over a real workspace. Guards count and compare rather than time; the one timed assertion is a ratio with hundredfold headroom. |
| 2 — the two projection lookups *(new)* | **Built.** Grouped edge index and cached id map. Projection proven byte-identical against the implementations replaced, in-process, over both stores. |
| 3 — the annotation sweep *(new)* | **Built.** `LineIndex` replaces counting from zero. Compared at every position of 120 real files — 1 252 333 of them; `reqtocode check` output byte-identical. |
| 4 — revision digest memo *(this plan's wave 2)* | **Built.** Per-file `(size, mtime_ns, sha)` memo. 48 MB watched tree: 64ms → 18ms. The token is now a digest over content *hashes*, not bytes — see 9.4. |
| — incremental inputs *(this plan's wave 3)* | **Deferred, measured.** See 9.5. |
| — evidence reuse window *(this plan's wave 4)* | **Deferred.** See 9.5. |

New requirement: **SWR-3223** (technical, derived from SWR-3216) — the engine
half of what SWR-3317 states for the widget side. § 5 predicted no new ids; the
prediction assumed no behaviour or contract worth stating would change, and a
cost property that three commits now depend on is worth stating.

### 9.4 One promise this plan made that could not be kept

§ 3.2 asked for a **byte-identical token** *and* a memo holding `content_sha`.
Those conflict: reproducing the old byte stream means feeding raw content, which
means keeping the whole watched tree resident in order to avoid reading it — 48
MB of memory to save 46 ms, trading the cost this removes for a worse one.

The token is therefore a digest over the files' content hashes. Its *meaning* is
unchanged — it moves exactly when the watched content, the parser, or the pin
moves — and the one-time cost is that a baseline written by an older version
(SWR-3119) is not recognised, so the first refresh re-reads. That is what a
genuinely changed file does: self-healing, one extra evaluation, nothing wrong
in the meantime.

### 9.5 Why waves 3 and 4 of this plan stay closed

**Incremental inputs (§ 3.3).** It targets 0.135s of what was a 2.633s pass and
is now a 1.19s one — under 12% of the original, for the plan's whole
cache-invalidation risk class. It also collides with two guards Plan 01 landed
after this plan was written: `test_the_board_keeps_a_pass_in_one_value_and_nothing_beside_it`
pins `WorkspaceBoard`'s attribute inventory to six names, and
`test_each_pass_touches_the_snapshot_once_so_it_cannot_be_read_in_parts` pins the
snapshot to one load per method. A `previous: BoardInputs` field is exactly the
"fifth mutable field" the first forbids, and moving it inside `_BoardSnapshot`
would make `project()` a writer, which its own docstring forbids. The design
needs rethinking; the numbers say it need not be rethought yet.

**Evidence reuse window (§ 3.4).** Wave 3 took 0.26s of the sweep's 0.92s for
free and without an invalidation rule. What remains is the ReqToCode coverage
sweep reading 992 source files, whose cost is a function of the *codebase*
rather than the store — so it does not grow with the requirement count SWR-3317
is about. If it is ever worth attacking, attack the sweep, not the freshness
memo: reusing a `WorkspaceEvidence` across passes buys 0.66s and costs a
correctness rule about when the repository moved, and the sweep itself can
probably be made cheaper with neither.

**Re-evaluate** § 3.1 if a real workspace exceeds 1.5s again, or a user reports
post-action latency. The harness is in the repository; start from a number.
