# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — First execution — 2026-09-09 (Part AK)

Part 6 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## First execution — 2026-09-09 (Part AK)

*Recorded under GD-10. One defect of ADR-0058 consequence 17's pattern, the forty-sixth; the ordinals continue
from the forty-fifth (ADR-0060, Part AH). Two readings corrected before the first commit are kept beside their
replacements. The exports of `REQ-TRACE-514` and `REQ-LIBRARY-176` are not in this part and were not executed.*

**Built and run:** store **v15** — `delivery` (the record's own `schema_version` uncoerced, the opaque `body`,
the two hashes, `return_to`, the `transitions_ever` counter of commitment 3), `delivery_history` (the 200-entry
prune as a `DELETE`), `delivery_audit` (append-only by trigger, one workspace-wide series), `delivery_runs`,
`delivery_worktrees`, `delivery_blockers`, `delivery_tombstones`; the DAL's one write unit `transition()` carrying
the state, the history entry, the prune, the counter, the run row a start writes with its session id
(`REQ-TRACE-464`), the blocker a hold raises and the answers a resume gives, **in one `BEGIN IMMEDIATE`
transaction**; the two handle types with the reader a closure over the DAL and the writer built from the reader
plus the transition function; the pure `decide` over the fourteen actions, the nine transitions, the fixed targets
and `REQ-TRACE-385`'s table, with reachability as the same function asked without writing; the single-flight
admission; the release gate and blocker chain over an injected dependency map; the restart reap; the projection as
one deep-frozen value; the pure display mapping in `ui-core`; the `requirements.*` command family, channel 10 and
the relay in main that stamps the actor. Eighty-six tests in nine files; `pnpm delivery-proof` twice, 5 390 ms
then 5 728 ms, printing its nine assertions each with a verdict — the plan's seven, the reap's "interrupted, work
retained", and the regression of defect (1) below — all green (`.delivery-proof/results.json`). The store's own
suite moved its two schema pins to v15 and narrowed its cascade premise: `delivery_runs.session_id` names a
session as a fact about the run and carries no foreign key, because a requirement's run history outlives the
session it names (`REQ-TRACE-405`, `REQ-TRACE-476`); `delivery.test.ts` proves the row survives the delete.

**Found (1) — the forty-sixth: reachability's refusal recursed into itself.** `REQ-TRACE-391` wants a refused
move to carry "the engine's own words unchanged, including its enumeration of what the source column can reach",
and this record's reading — reachability is `decide` asked without writing — was built literally: a refusal
enumerated the reachable targets by asking `decide` about each, and each of those refusals enumerated the
reachable targets in turn. The first refused probe overflowed the stack. The enumeration is now a probe
(`decide(…, { probe: true })`) whose refusals carry the reason and no enumeration, and `reachableFromSource` is
computed once per answer. The reading stands; what it omitted is that an answer which describes its
alternatives cannot be composed of answers that each describe theirs. No reading of the requirement or of this
record would have caught it; the first test did.

**Reading corrected (a) — the queue's two persisted controls are not a store table.** The first draft of v15
carried a `delivery_queue` table for `REQ-TRACE-480`'s `automatic` and `concurrency`, on the ground that the
delivery store already held the rows those controls schedule. `REQ-TRACE-480` names the **workspace
configuration** — `requirements.scheduling.*`, which `REQ-CONFIG-196` registers and which no part has registered
yet — and the plan's rule that no part adds configuration keys outside its row applies. The table was withdrawn
before the migration was committed; the settings live in memory in the service at the schema's defaults
(`manual`, 2) until Part AP registers the keys, and the schema comment says so. A stop is persisted nowhere, by
requirement.

**Reading corrected (b) — an epic owes no evidence.** The first projection made an approved epic owe
`verification` (approved, and a report present) and reported it `incomplete-traceability`. `REQ-TRACE-281` and
`REQ-TRACE-284` make an epic a grouping element whose state is derived from its children; it owes no evidence of
its own and its indicator is empty with the stated reason. Kept in `owedObligations`.

**Readings recorded, for the parts that follow.**

- *The requirement document format declares no dependency.* Spec 08's frontmatter has `epic` and `derived-from`
  and nothing else relational, so of `REQ-TRACE-274`'s twelve relation tokens the projection emits four
  (`parent`, `children`, `derived-from`, `derived-requirements`) and the other eight have no data source in this
  product. The release gate (`REQ-TRACE-455..462`) is therefore a pure function over a dependency map fed from
  recorded `dependency` blockers' `blocking_ids` — the one place a dependency can exist — and is empty until an
  engine analysis raises one. `superseded` health is in the closed set and unreachable from store data.
- *`Reachability.reachableFromSource` is typed over the delivery columns* and cannot name the blocked condition,
  which every column reaches by `hold`; the enumeration lists stages, as the seam types it.
- *The system's two moves are not board actions.* Nothing in the closed fourteen enters `running` or leaves it;
  `recordRunStarted` and `recordRunEnded` write history entries `run-started` / `run-ended` by the `system` actor,
  interleaved in the store as `REQ-TRACE-405` asks, and the detail's history lists the fourteen while `runs` lists
  those. A failed or interrupted run holds the requirement with a `run-failure` blocker returning to `ready`
  (`REQ-TRACE-407` lets a pass move a requirement into the blocked condition; `REQ-TRACE-463` fixes the return).
- *The reap's live set at workspace open is empty* under SR-2: nothing older than this instance's run host is
  owned. Part AP hands in the run host's actual live set when it re-runs the reap after a run-host exit.
- *`edit`, `create`, `accept-proposal` and `accept-change-work` are stated refusals* with the reason named
  (`REQ-TRACE-498` "the control explains why"); the first two are Part AP's source write, the last two wait on
  OQ-45. `keep-worktree` returns `historyEntry: 0` and writes nothing, as `REQ-TRACE-383` says it should.

**Not built here, stated:** the persistence of `REQ-TRACE-480`'s two controls (above); a run starting from a
release (`REQ-TRACE-387`'s second half, `464..475` — Part AP; the writer's `beforeCommit` is the slot it fills);
the offers of `409..416`, the source revisions of `278..280`, the graph of `322..333`; the queue's `start`, which
the seam's `requirements.queue.set` has no field for (raised in the handoff, additive for AP); the two exports.
`REQ-TRACE-239`'s 100 ms is not measured here — no board is drawn until Part AK′, and this record's "Revisit if"
still says no such measurement exists.

**What the merge must do:** replace `ENGINE_NOT_MERGED` in `apps/desktop/src/workspace-service/index.ts`'s
`requirements.command` case with Part AJ's factory; until then the board reports `source: none` with the cause in
`parseErrors`, and the tests fake the engine around `fixture-store.ts`.

**Merge 1's proof pass — 2026-09-09, the sixtieth defect.** The narrowing above — the cascade premise is "the tables
whose `session_id` REFERENCES `sessions`" — was applied to the store's own suite and ruled into the plan, and nothing
carried it to the proof that executes the cascade against the running product: `pnpm sessions-proof` (Part U) pinned
the count of tables carrying a `session_id` at fifteen and asserted every one of them empty after the delete, so v15's
`delivery_runs` failed the pin on the merged main while every branch and the store's tests were green — the same class
as the fifty-ninth, a bound only the merged arrangement exercises. The proof now reads the premise from the schema
(`pragma_foreign_key_list`: the fourteen that reference `sessions`, plus the parent), asserts that `delivery_runs` is
the ONE table carrying the column as a fact, plants a run row naming the session about to be deleted and asserts it
survives — REQ-TRACE-476 executed against the product rather than against the DAL alone: `pnpm sessions-proof` alone on the merged main, 146 s, PASS — fifteen cascaded, `delivery_runs` the one fact-table, the planted run row 1 before and 1 after the delete. The reading
stands; what it omitted is that a premise narrowed in one suite is a pin left standing in every other, so a ruling that
narrows a premise must name the proofs that pinned the old one, and the merge's proof pass is where such pins are found.
