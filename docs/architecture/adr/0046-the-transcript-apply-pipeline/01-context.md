# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — Context

Part 1 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## Context

`REQ-MONITOR-214`: every publication on either channel carries a sequence number from one per-session
counter; a surface begins from a whole-session update, counts on from the number that update carried,
and knows at every moment the number the next publication must bear. `REQ-MONITOR-226`: a surface
receiving any other number **has missed an update** and must record a diagnostic, stop consuming
increments, and re-render from a whole read — *"on the publication that reveals the gap rather than
after any delay"*. That is the whole of how a lost update is caught; `REQ-MONITOR-288`'s reconcile poll
is withdrawn and `REQ-MONITOR-223` forbids any timer that exists to discover whether a session has
changed.

`REQ-MONITOR-215`, `REQ-MONITOR-229`: a row already delivered may change only through a later update
whose earliest-changed index is at or below it; nothing may mutate in place a row a view already holds;
a shrunk transcript publishes earliest-changed index 0. `REQ-MONITOR-224`, `REQ-MONITOR-226` and
`REQ-CHAT-052`: a view that cannot correctly apply an increment must **decline** it, record a
diagnostic, stop consuming increments, and re-render from a whole read; it must never render a result
that differs from what a whole read would produce; and declining must not interrupt the user or blank
the transcript. `REQ-SESSION-161` adds the positive form of that last rule — *"the rows on display MUST
be unchanged by the increment that was declined"* — which is where the withdrawn re-seed rule's real
content came to rest.

**`REQ-MONITOR-223` is the cost constraint, and it is stated against an empty session, not against a
large one.** For the same update content, an update to a session holding at least 10,000 recorded
transcript rows must cost no more than **twice** the same update to a session holding **none**, at the
95th percentile, measured from the run emitting the change to the surface showing it — so this stage is
inside the measurement, not outside it. `REQ-MONITOR-222` adds a 250 ms p95 that must hold at zero rows
and at thousands; `docs/spec/resolutions/02-run-monitoring-steering.md` row 23 records that the
10,000-row point was chosen so the two performance requirements are measured on comparable material,
which is why neither can be satisfied by pointing at the other. `REQ-CHAT-055`, `REQ-CHAT-154` and
`REQ-CHAT-157` require update cost to depend on visible and changed rows and never on the transcript's
length. `REQ-SESSION-192` is the product's single definition of transcript residency and fixes it at
**the 5000 most recent rows**, evicting older ones in whole pages of 50; `REQ-CHAT-165` states no bound
of its own and defers to it. **The resident window is therefore constant in the length of the session —
but 5000 is not within a factor of two of nothing, so constancy alone does not discharge
`REQ-MONITOR-223`.**

`REQ-MONITOR-230` and `REQ-CHAT-051`: trailer rows — a pending question, pending approvals — are **not
recorded history**: they are computed from what is pending at that moment, always follow every recorded
row, and are appended identically by the whole-state and incremental paths.

`REQ-CHAT-046`, `REQ-CHAT-047`: the row-category vocabulary is **closed** at twelve members; the row-role
vocabulary is **open** — five named roles project to their own kind, any other role projects to a
message row carrying that role as its display name. `REQ-CHAT-064` to `REQ-CHAT-066`: folding is
deterministic and content-derived — two or more consecutive same-agent rows whose tool names map to the
same family fold, four named families plus "a tool name outside those lists forms a family of its own",
any intervening row of another kind ends the run, group headers carry a searchable member blob capped at
2000 characters, and structured-question rows and unsettled live terminal rows never fold.
`REQ-CHAT-046`, `REQ-CHAT-061` and `REQ-CHAT-166`: the row model retains **untruncated** tool input and
output; display caps affect only what is drawn; expansion always shows the untruncated value; a cap
change takes effect immediately on rows already on screen. `REQ-CHAT-074`: search is case-folded
substring **over displayed rows**, recomputed automatically whenever rows change while the panel is
open.

**`REQ-UIBENCH-064`, `REQ-UIBENCH-083` and `REQ-UIBENCH-099` are the determinism constraint.** The view
must own an explicit transcript apply/diff stage producing six cumulative counters — `noop`, `insert`,
`remove`, `update`, `refused`, `reset` — classified by **comparing the state being applied with the
state currently displayed**, monotonically non-decreasing across an iteration's seven records, and
**byte-identical across iterations in fresh processes** replaying the same fixture. `refused` and `noop`
are distinguished by whether the application was **valid**, not by whether anything visibly changed.
The counter set is **exactly six** and the totals must be "a function of the sequence of transcript
states applied and nothing else". Timings and memory are explicitly **not** required to be reproducible;
only the structural counters and the invariants are.
