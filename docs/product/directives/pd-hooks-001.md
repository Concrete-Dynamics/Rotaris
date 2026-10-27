[Product directives](../directives.md) › PD-HOOKS-001

<a id="pd-hooks-001"></a>

### PD-HOOKS-001 — `child_completed` fires only while a run's lifecycle hooks are live

`child_completed` SHALL fire for a delegated child that finishes while a run's lifecycle hooks are live: after that run's
`session_start` and before its `session_end` begins, at the place REQ-HOOKS-076's order gives it. A child that finishes
outside that window fires no `child_completed`, then or later, and no later run of the session owes it. Five paths end a
child outside the window, and none fires it:

1. the cancel of one paused child while its session rests (`PD-ORCH-005` clause 16), where no run and no hook port exist;
2. an explicit cancel that lands after its run has come to rest, once the run's `session_end` has fired;
3. the record of an accepted explicit cancel whose run host died, written from the store by a repair, which has no run, or
   by the next continue before its run exists;
4. the stale settle (REQ-ORCH-053) of a run that ends before its `session_start`, a stop requested during its pre-flight or
   a raise before that point;
5. the user's cancel of one paused child (REQ-ORCH-133) accepted while the run's own `session_end` hooks run, or after them
   and before the run has ended. The cancel is still accepted: the child ends `cancelled` with its report, its
   `child_user_cancelled` entry and its teardown.

Every path the specification places inside a run fires it, after the run's `session_start`: the cascade (REQ-ORCH-048),
the finalize sweep (REQ-ORCH-052), the user's cancel of one child in a live run (REQ-ORCH-133), the stale settle of a run
that has started (REQ-ORCH-053), and the decline of a resumable iteration (`PD-ORCH-005` clause 6). Every other event of
REQ-HOOKS-003 fires as that requirement states.

**As built.** `Run`'s teardown awaits the hooks of children that ended outside their execution
(`Run.childCompletionsSettled`) and then calls `IterationChildren.endLifecycle` before `session_end` fires, so from then no
`child_completed` is queued (`packages/engine/src/run/run.ts`, `packages/engine/src/children/orchestration.ts`); pinned by
`children.test.ts`, "REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 …".

**Why, and what it costs.** OQ-154: REQ-HOOKS-003 fires `child_completed` "whatever its final state" and names no
exception, while REQ-HOOKS-076 and REQ-HOOKS-080 place it inside a run, between its `session_start` and its `session_end`.
Firing on the five paths at the moment would run a hook with no `session_start` before it or after the `session_end` it
should precede (REQ-HOOKS-081), or would need a hook port resolved for no run; owing it to the next run would announce,
perhaps much later, a child that run never saw, and never if the session is not continued. The owner accepted the built
behaviour and asked for the specification to say so. What it costs: a hook that counts children on `child_completed`
misses a child that ended on one of the five paths; the child's terminal state, report and timeline entries are recorded
as for any other.

> **Narrows:** REQ-HOOKS-003

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-154.*
