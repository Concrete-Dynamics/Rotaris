# Architectural constraints extracted from the specification — Reconciliations recorded

Part 22 of 22 of [the constraints](../constraints.md), which indexes every part.

## Reconciliations recorded

Pairs an implementer will read as contradictory, with the reading that resolves each. Recorded so the
resolution is not re-litigated per component.

1. **U-07 versus U-08.** "No view may slow a run" and "a slow consumer delays the run, bounded at 5 s"
   are **different channels**, resolved by ADR-0010: the event bus is bounded-blocking, the view channel
   is non-blocking, and `REQ-EVENTS-178` confirms the event-bus consumer is the application consuming
   its own runs.
2. **U-15 versus U-16 — no longer a pair, and the record of what it was is kept deliberately.** It was
   resolved **by subject**: the transcript was never followed by timed state reads, while non-transcript
   state for a *foreign* session legitimately was, on a 750 ms poll. Both halves of that reconciliation
   are gone. SR-2 removed the foreign session and SR-3 removed both cadences, so `REQ-SESSION-071`'s rule
   now has no exception and nothing needs reconciling. Retained as a tombstone because the resolution was
   cited by component, and a reader who finds it cited should see that it was dissolved rather than
   forgotten. What replaces it is not a second reading but a mechanism: U-01's sequence number and U-06's
   gap-driven reconcile.
3. **H-12.** The verification-skip path signals the process group; the hook path must not. Both are
   deliberate; they are two execution paths and **must not share a kill implementation**.
4. **P-02 versus P-14.** "A backgrounded run continues in the same process" versus a separate worker
   process being listed among the venues: `REQ-MONITOR-299` **permits** a topology while
   `REQ-SESSION-190` **fixes** the observable. Detaching changes which views follow the run; it does not
   migrate it.
5. **REQ-ORCH-039 versus REQ-ORCH-116.** A delegation to the acceptance role is refused only on a
   `failed` blocking check, while the completion gate is also left unsatisfied by `timeout` and
   `skipped`. **The specification states the asymmetry is deliberate and must be preserved**; recorded so
   it is not "fixed".
6. **M-17.** Unknown fields are accepted on consumed remote payloads and rejected in the persisted
   snapshot. Deliberate, and in opposite directions; the two readers must not share a schema mode.
7. **D-16 versus D-09 — DISSOLVED, not resolved, and the requirement says so itself.** This
   reconciliation recorded a contradiction between "every change is persisted before it is published to
   any view" and "saves for `running`/`idle` are debounced at 10.0 s". **Both premises are gone.**
   `REQ-SESSION-067` withdraws the window outright and gives the same reason this reconciliation reached
   from the other side — the window "was the interval in which a change could be published before it was
   recorded, which persist-before-publish (`REQ-MONITOR-221`) forbids and which now cannot arise" — and
   `REQ-MONITOR-221` now states its own reconciliation with `REQ-MONITOR-218`: it is satisfiable
   alongside it "because persistence carries no delay of its own". There is nothing left to reconcile.

   *A previous pass wrote here that the debounce "narrows to the session record", where
   "`REQ-SESSION-071`'s stated observable of at most twelve writes per minute still holds". **That is now
   wrong on both halves and must not be cited.*** `REQ-SESSION-067` forbids deferring, parking and
   coalescing outright, so there is no narrowed window; and `REQ-SESSION-071` states that "no bound on
   write volume is stated and none is needed", so the observable the narrowing was kept to preserve does
   not exist. Every requested save is durable when it is requested, and two saves requested microseconds
   apart produce two commits.

   *What the dissolution cost, recorded because nothing else records it.* The window bounded exactly one
   thing that is still a file: the human-readable summary. `REQ-SESSION-028` rebuilds it on **every**
   save and calls it "the one part written as a file"; D-06's ladder spends up to about 1.55 s of backoff
   on it; and it is the one write in the product where a foreign handle — anti-malware, or the user's own
   editor reached through `REQ-SESSION-191` — can make a save-caused write take a second. Every other
   document the window bounded became a record; this one did not. It is derived and off the critical path
   (`REQ-SESSION-006`: "it is on no path a run waits for"), so nothing a loader reads is at risk — but
   `REQ-SESSION-028`'s "rebuilt by the same save" also admits a blocking reading, and no requirement
   settles which. ADR-0008 takes the non-blocking one and states the point of wording explicitly.

   *Unchanged, and the part most easily lost:* intra-row growth under U-03's 50 ms tick sits **outside**
   the persist-before-publish rule, because `REQ-EVENTS-052` gives an incrementally produced row two
   events "and none for any state in between", and `REQ-SESSION-196` says why that is conformant rather
   than a gap — partially streamed text is not restored, "because [it] describe[s] a moment rather than
   the session". Commits being cheap is **not** a reason to start committing per tick; per-tick commits
   are forbidden for the same reason `REQ-MONITOR-219` forbids per-token publication. A conformance test
   that diffs a live surface against the session record mid-run fails correctly behaving code.
