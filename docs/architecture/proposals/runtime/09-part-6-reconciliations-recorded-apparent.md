# RUNTIME slice — architecture proposals — Part 6 — Reconciliations recorded (apparent conflicts that are not)

Part 9 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 6 — Reconciliations recorded (apparent conflicts that are not)

These are pairs an implementer will read as contradictory. Each is recorded with the reading that
resolves it, so the resolution is not re-litigated per component.

1. **C5.7 vs C5.8** — "no view may slow a run" (REQ-MONITOR-232) versus "a slow consumer delays the
   run, bounded at 5 s" (REQ-EVENTS-165). Different channels, resolved by ADR-RUNTIME-02: the event
   bus is bounded-blocking, the view channel is non-blocking, and REQ-EVENTS-178 confirms the
   event-bus consumer is the application consuming its own runs.
2. **C5.15 vs C2.7** — "re-reading persisted state on a timer is not a supported way to follow a
   run" (REQ-SESSION-071) versus "everything other than the transcript reaches an out-of-process
   viewer by a whole-state read every 750 ms" (REQ-MONITOR-246). Resolved by subject: the
   *transcript* is never followed by timed state reads; non-transcript state legitimately is.
3. **C1.5 vs C8.3** — a verification-check skip signals the **process group** and tears down the
   terminal session (REQ-ORCH-128); a hook timeout terminates **only the started process** and must
   not widen to the group (REQ-HOOKS-033). Both are deliberate; they are two execution paths and
   must not share a kill implementation.
4. **C1.2 vs C1.10** — "a backgrounded run continues in the same process" (REQ-SESSION-190) versus
   "a background run" listed among the separate-worker-process venues (REQ-MONITOR-299,
   REQ-SESSION-159). Resolved by reading REQ-MONITOR-299 as *permitting* a topology and
   REQ-SESSION-190 as *fixing* the observable: detaching changes which views follow the run and
   writes `background` to the status; it does not migrate the run.
5. **REQ-ORCH-039 vs REQ-ORCH-116** — a delegation to the acceptance role is refused only on a
   `failed` blocking check, while the completion gate is also left unsatisfied by `timeout` and
   `skipped`. The specification states the asymmetry is deliberate and must be preserved; recorded
   here so it is not "fixed".

---
