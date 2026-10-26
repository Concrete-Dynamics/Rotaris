[Product directives](../directives.md) › PD-MONITOR-006

<a id="pd-monitor-006"></a>

### PD-MONITOR-006 — a switch of the entry model or reasoning level from the run header holds for its own run

A switch of the run's entry model, or of its entry reasoning level, made from the run header or the inspector while a run
is live (REQ-MONITOR-142) SHALL apply from the run's next iteration for the rest of **that run** only. It SHALL NOT be
carried into the session's next run, and it is not the session-wide runtime model override of REQ-SESSION-026: the next run
starts on the model and reasoning level the composer's selectors choose (REQ-MONITOR-146, REQ-CHAT-006), which name any
session-wide override in force. The system transcript row each switch appends SHALL state the new model or reasoning level,
that it applies for the rest of this run after the iteration in flight, and that the next run starts on the composer's
choice; it SHALL NOT say only that it applies from the next iteration.

A change-model resolution of a provider wait (REQ-ORCH-091 (d)) is not such a switch: its override is session-wide and
reaches every later run, as REQ-SESSION-026 and REQ-NOTIFY-089 say.

**Why, and what it costs.** A switch reaching the next run would sit beside the composer's next-run model chip with no rule
for which wins; one place that chooses the next run's model is simpler, and the build already ended a switch with its run.
The fault was one sentence: the row said the switch "applies from the next iteration", untrue when the run had nothing left
queued, because the user's next prompt starts a new run. The owner ruled the switch stays scoped to its run and the row says
so (OQ-185). What it costs: a user who switches the model in the last iteration of a run and wants it for the next run sets
it again in the composer.

> **Narrows:** REQ-MONITOR-142, REQ-SESSION-026

*Raised by the owner, 2026-10-06, ruling OQ-185 as recommended; logged as [R-071](../requests.md#r-071).*

*Numbered PD-MONITOR-006: first written as PD-MONITOR-003 on its branch; renumbered at the landing rebase, since `main` had meanwhile taken PD-MONITOR-003 to PD-MONITOR-005, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (plan fin21):** the rows read "Entry model switched
> to X; it applies for the rest of this run, after the iteration in flight. The next run starts on the composer's model."
> and "Entry reasoning level switched to L; it applies for the rest of this run, after the iteration in flight. The next run
> starts at the composer's reasoning level." (`Run.setEntryModel`, `Run.setEntryReasoning`). Nothing else changed: the
> switch was already held on its `Run` (`entryOverride`) and a continuation is a new `Run` built from the configuration, so
> the scope the directive states is the one built since fin8. The autopsy readers keep printing `undetermined` for a
> continuation whose snapshot names no entry model after such a switch: the switch did not reach it, but the composer may
> have changed the configuration since the last snapshot, and nothing it records says. **Measured:** the three row cases of
> `ladder.test.ts` (red before, the old sentence), and `resilience-proof`'s `switch-back` and `switch-over-override` on the
> built app reading the new row. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
