# ADR-0010 — Three channels between the run host and its surfaces — Third execution — 2026-09-05, the provider-limit wait's three choices (Part Q)

Part 9 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Third execution — 2026-09-05, the provider-limit wait's three choices (Part Q)

*Recorded under GD-10. A reading against the closed enumeration; found nothing against the channel itself.*

**The reading.** REQ-NOTIFY-263 offers exactly three choices during a quota wait — keep waiting, change model, cancel the
run — "as controls in that header and on no other surface". REQ-MONITOR-004's enumeration of twenty-two operations is closed
and names none of the three by that wording. They are read onto the existing operations, and no operation is added:
(a) **keep waiting is the absence of a decision** — REQ-MONITOR-192 says the wait "continues indefinitely until a person
decides", so keeping waiting is not deciding; the header's control acknowledges ("Still waiting.") and sends nothing over
channel 1; (b) **change model is `setModel`** — REQ-NOTIFY-263 says changing model "opens the model list of REQ-NOTIFY-074 and
pins the chosen model for the session under REQ-NOTIFY-089", which is what `setModel` on a waiting run now does: the parked
agent rebuilds and re-runs at once and the override is persisted (`model_override`); outside a wait `setModel` keeps
REQ-MONITOR-142's next-iteration semantics; (c) **cancel the run is `cancel`**. The result shape is untouched: a `setModel` that
cannot be applied answers `{ok: false}` as REQ-MONITOR-005 allows and the *reason* reaches the user through the record's
`wait.rejection` on the snapshot channel (channel 2), not through a third populated string on channel 1 — REQ-ORCH-091 (d)'s
"the user is told" is met on the surface that already carries the wait. The contracts test that pins twenty-two still pins it.

*Questioned 2026-10-02 (fin10, OQ-188):* reading (a) predates REQ-MONITOR-303, which says keep waiting "resolves the wait as a
retry and returns the status to `running`" in both variants. The reading stands as built until the owner rules; the gap is
recorded in [`keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md`](../../../defects/fixed/keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md),
with what a retry must then count as since the ladder reads the exclusion before every call (REQ-MONITOR-194).

*Ruled 2026-10-06 (OQ-188, [R-071](../../../product/requests.md#r-071), [`PD-MONITOR-004`](../../../product/directives/pd-monitor-004.md#pd-monitor-004) revision 2),
reported back in place:* reading (a) now holds for the timed wait alone — the header acknowledges, sends nothing, and the timer
retries. In the wait that never auto-resumes, keep waiting is read onto (b): the header sends `setModel` with the waiting
pair's key, which the record's `wait` now carries (`modelKey`), and the run's existing quota-retry branch resolves the wait as a
retry on that pair, its exclusion cleared as an explicit choice clears it. No operation was added; the contracts test still
pins twenty-two. Shown by `resilience-proof`'s `keep-waiting` scenario (2026-10-06).

*Corrected the same day (plan fin21's repair round 1), the paragraph above kept as it was first reported:* reading (b) as
first built was wrong in two ways the verifier found. The quota-retry branch is the change-model chooser's path, and it moves
every other parked agent onto the waiting pair with an override standing for the session; and a second press, arriving with
no wait current, was read as a switch of the entry model. Keep waiting now travels on `setModel` marked `keepWaiting` and
naming the wait's `agent` and `attempt`, which `Sessions.control` routes to `Run.keepWaiting`: it answers `{ok: false}` for a
press naming no outstanding out-of-quota wait, and otherwise retries the agents parked on the waiting pair alone, no override
persisted. The arguments stay text, numbers and booleans (REQ-MONITOR-013); the operation count is still twenty-two.

**The wait state on the record, not in a column.** `SessionRecordSchema.wait` (provider, model, exhausted, resumeAt, attempt,
reason, agent, rejection; since 2026-10-02 `excluded` and since 2026-10-06 `modelKey`, the waiting pair's model key) is derived from the live run at every snapshot — ADR-0043's rule that adding a field to the record
adds it to the payload — and the persisted status is REQ-SESSION-073's own `waiting`, presented as `running` (REQ-NOTIFY-049),
so the sessions list and the browser show a waiting session from the status alone; no store migration was written (the plan's
shared-file rule) and no new column exists for it.
