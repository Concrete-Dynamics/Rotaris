[Product directives](../directives.md) › PD-ORCH-013

<a id="pd-orch-013"></a>

### PD-ORCH-013 — an explicit choice of the entry model wins over an earlier wait's override of that model

When the user explicitly chooses a model for the run's entry agent — a switch of the entry model from the run header or
the inspector (REQ-MONITOR-142), or a choice made on the quota-wait decision surface (REQ-MONITOR-303) — and a
session-wide override that an earlier change-model resolution of a wait set (REQ-ORCH-091 (d), REQ-NOTIFY-089) replaces the
chosen provider-and-model pair, that override SHALL be taken back for the chosen pair, recorded in the session record so
that a reload and every reader of the record replay it, and the entry agent SHALL run on the pair chosen from the moment
the choice applies: the run's next iteration for a switch from the run header or the inspector, at once for a choice on the
wait surface. A switch from the run header or the inspector SHALL also end an automatic move the ladder made of the entry
agent (REQ-ORCH-090, REQ-ORCH-091 (b)); the ladder's once-per-agent budgets are not reset by it.

Every other override in force stands for the rest of the session as REQ-ORCH-091 (d) says. An agent that had already
followed the override taken back stays on the model it moved to; an agent that calls the chosen pair from then on calls it.
A reasoning-level switch is not a model choice and takes nothing back.

**Why, and what it costs.** Before this directive the model the user picked from the run header could quietly fail to run:
the switch ended a ladder move but left an earlier wait's override of the same pair standing, so the entry agent went on
calling the override's model and only a transcript row said so — while a choice made on the wait surface already took such
an override back. The owner ruled that every explicit choice wins (OQ-177). What it costs: REQ-ORCH-091 (d) and
REQ-NOTIFY-089 keep a hand-chosen model "for the rest of the session", and a later explicit choice of the replaced pair now
ends that override early, so later calls in the session may return to a pair the provider once reported out of quota. The
user chose it explicitly, which REQ-MONITOR-194 already lets them do, and a further insufficient-quota answer records it
out of quota again.

> **Narrows:** REQ-ORCH-091, REQ-NOTIFY-089

*Raised by the owner, 2026-10-06, ruling OQ-177 as recommended; logged as [R-071](../requests.md#r-071).*

*Numbered PD-ORCH-013: first written as PD-ORCH-006 on its branch, then PD-ORCH-009 when fin20's directives reached `main`
first and took PD-ORCH-006 to PD-ORCH-008; renumbered PD-ORCH-013 at the landing rebase, since `main` had meanwhile taken
PD-ORCH-009 to PD-ORCH-012, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (plan fin21):** `Run.setEntryModel` takes the
> override back on the header path through the same `takeBackOverrideOf` the wait path uses — a `model_override` entry
> carrying `cleared: true`, `cause: 'superseded'` and `root_cell`, written before the switch's `entry_model_switched`, which
> `ResilienceMemory.rehydrate` and both autopsy readers already replay — and the row's second form, "Entry model switched
> to X, but Y, chosen for P/M during an earlier wait, stands for the rest of the session", is gone because no switch leaves
> such an override standing. It found nothing the record had not said: the readers needed no change. **Measured:**
> `packages/engine/src/run/ladder.test.ts` (a wait choice of c1 over the exhausted a1, then a header switch to a1 while a
> second task is queued: the next iteration's root calls a1, the take-back precedes the switch, the replayed memory holds
> no override and no exclusion of a1, and `entryModelKeys` reads a1, c1, a1 — red before, the third call on c1), and
> `resilience-proof`'s driven `switch-over-override` scenario on the built app (alpha refused on quota, beta chosen in the
> wait, a follow-up queued and the entry model switched back to alpha from the run header: calls alpha, beta, alpha; two
> `model_override` entries, the second the take-back). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
