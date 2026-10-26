# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Context

Part 1 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Context

`REQ-MONITOR-014`, `REQ-MONITOR-300`, `REQ-ORCH-040` and `REQ-ORCH-041` fix the child state set
exactly — `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`,
`waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked` — with the last four terminal
and **absorbing**, a legal-transition table fixed in full, and `REQ-MONITOR-300` designated the
**single definition** of the machine.

`REQ-MONITOR-016` and `REQ-MONITOR-017`: an attempt to move a child into a state not reachable from
its current one must be **rejected with an error naming both states and must leave the record
untouched** — same state, no completion timestamp, and **no state-change event delivered to any
surface**. Entering a terminal state stamps a UTC completion timestamp.

**`REQ-MONITOR-300` as it now stands admits two *settling* paths from every non-terminal state**, and
names them "the only way a state may be reached that this table does not otherwise allow": cancellation
settles any non-terminal child to `cancelled` (`REQ-MONITOR-209`), and run reconciliation settles any
non-terminal child to the terminal state the run's own outcome dictates (`REQ-MONITOR-211`). Both stamp a
completion timestamp exactly as an ordinary terminal transition does. This is read carefully rather than
in passing: it means the sweeps of `REQ-ORCH-052` and `REQ-ORCH-053` are **inside** the table rather than
exceptions to it, and the transition function therefore needs no bypass. `REQ-ORCH-041` says the same
thing from the orchestration side — cancellation settles a child "from whatever state it is in", so the
sweeps "can never fail partway".

`REQ-ORCH-046`, `REQ-ORCH-038` and `REQ-ORCH-024`: spawn admission runs **five checks in a fixed
order**, the first failure rejecting with no child record and no task id — depth (default 3), total
children (20), active children (6), every `depends_on` naming an existing child of the same parent,
and the new edges closing no cycle. Budget clamps from the playbook cell only narrow.

`REQ-ORCH-049`: a child is started **at most once**, however many scheduling passes are in flight; over
the whole run, `child_start` events per task id are exactly one for a child that started and zero for
one that did not; and a suppressed start must be **recorded** — a `child_launch_suppressed` timeline
event plus a `stale_child_launch_claim` issue naming the child.

`REQ-ORCH-050`, `REQ-MONITOR-015`, `REQ-MONITOR-020` and `REQ-MONITOR-021`: a child over the per-model
cap is **created and held**, reported `waiting_on_model_slot`, never rejected; held children are
released **in the order they were held**, exactly one per terminal transition of a child on the same
model key; a held child that has itself gone terminal is dropped; a child in `waiting_on_model_slot`
consumes no active-child allowance.

`REQ-ORCH-047`: a dependent starts only when **all** dependencies reached `succeeded` **and** stored
their report artifact, with the prior-agent-context block prepended exactly once. `REQ-ORCH-048`: on a
dependency reaching `failed` or `cancelled`, every dependent still in a pre-start state moves to
`blocked`, **transitively**, while a dependent already under way is left to run.

`REQ-ORCH-056`: scheduling continues until **three conditions hold simultaneously** — no outstanding
wait, no undelivered completion notification, every startable child started at least once — and must
then leave the parent idle, with an explicit clause that **the loop must not be able to alternate
indefinitely without some child changing state**.

`REQ-ORCH-052` and `REQ-ORCH-053`: an idempotent finalize-incomplete sweep closes every non-terminal
child as `cancelled` through the normal terminal path, re-checking per record because closing one can
cascade-block another; and on session continue, a run that has just acquired the lock settles every
non-terminal child record **read back from the previous run** to `cancelled` before its first
iteration. `REQ-ORCH-053` no longer describes where that record was read from — it says "the previous
run (e.g. after a killed host or hard cancel)" — and the requirement's own reason for not probing
process liveness, that holding the lock is itself proof, is reinforced rather than replaced by **SR-1**
and **SR-2**: there is no second instance that could still be running those children, and a session is
either live in this instance's run host or it is a persisted record.

`REQ-ORCH-062`, `REQ-ORCH-037`, `REQ-TOOLS-153` and `REQ-TOOLS-156`: there is **one** waiting mechanism
in the product; a parent has at most one wait outstanding; a wait carries **no deadline of its own**,
because the child timeout and the sweeps already bound it, and imposing one is explicitly forbidden.
