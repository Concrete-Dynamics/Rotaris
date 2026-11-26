[Product directives](../directives.md) › PD-ORCH-021

<a id="pd-orch-021"></a>

### PD-ORCH-021 — a money slider: five stops that choose the strategy, the model tier, the reasoning level and the child limits a user left unset

The product MUST carry one setting, the **money slider**, that states how willing the user is to spend. It is a posture
and never an amount: it MUST NOT state, estimate or enforce a sum in any currency, and it stops no run. It has exactly
five stops, in this order: `money_saver`, `small_budget`, `regular`, `strong_budget`, `token_burner`, shown as "Money
saver", "Small budget", "Regular", "Strong budget" and "Token burner". The shipped default is `regular`.

This directive's case is **a run started, or a child delegated, at a stop other than `regular`, and only for a lever the
user has not set** (clause 2). At `regular` nothing this directive states changes what a run does.

1. **Where it is set.** The default is a configuration key, `rotaris.money_slider`, written from the Settings view's
   Delegation page and read in the global and the workspace scope as every key is. A session MAY hold its own stop,
   chosen in the composer (clause 9); a session that holds none follows the default. A session's stop is the session's
   alone and MUST NOT be written to either scope.
2. **A value the user set is never moved.** The slider moves a lever only while the lever's value is the shipped
   default. A lever whose effective value comes from the global scope, the workspace scope, or a choice made for the
   session is **set**, and the slider MUST leave it exactly as it stands at every stop. The levers are: the delegation
   strategy (`rotaris.delegation_strategy`); each role's model; each role's reasoning level; and the three child limits
   `runtime.max_active_children`, `runtime.max_depth` and `runtime.max_children`. The session-wide model override and
   the session reasoning override (REQ-CONFIG-263) set the entry role's model and reasoning level. No other setting is a
   lever: the helper model slots, the timeouts, the verification settings and the persistence loop are untouched at
   every stop.
3. **What each stop does**, for the levers not set:

   | Stop | Strategy | Model tier | Reasoning level | Child limits (active / depth / total) |
   |---|---|---|---|---|
   | `money_saver` | `single` | the entry role one tier lower | the entry role one level lower | none apply: no child exists |
   | `small_budget` | `lead` (PD-ORCH-019) | the entry role unchanged; every delegated agent one tier lower | unchanged | the shipped defaults |
   | `regular` | the shipped default | unchanged | unchanged | the shipped defaults (6 / 3 / 20) |
   | `strong_budget` | the shipped default | the entry role one tier higher | the entry role one level higher | 8 / 3 / 30 |
   | `token_burner` | the shipped default | every agent one tier higher | every agent one level higher | 12 / 4 / 40 |

4. **The classified intent bounds the stop, both ways.** In a run that classifies its request:
   - where the intent resolves to the **answer**, **clarify** or **micro** group (REQ-ORCH-021), `strong_budget` and
     `token_burner` MUST change nothing: the run's tiers, reasoning levels and child limits are those of `regular`;
   - where the intent resolves to the **large-build** group, `money_saver` MUST leave the entry role's tier and
     reasoning level as configured. The strategy stays `single`.

   A `lead` run classifies nothing (PD-ORCH-019 clause 2), so `small_budget` applies to it whole, whatever was asked.
5. **A tier step.** A role has a tier where it is configured on a tier alias (REQ-CONFIG-070, REQ-CONFIG-071). One tier
   lower or higher is the neighbouring alias in the order small < medium < large, and the role runs on the model that
   slot holds. A role already at the end of the order, a role whose neighbouring slot holds no model, and a role with no
   tier are left as configured.
6. **A reasoning step.** A step is counted along the reasoning levels the role's resulting model offers (PD-CHAT-017,
   PD-CONFIG-007), in their order, and stops at either end. A role whose configured level names no level of its own
   (the role default, the provider default, `auto`) is counted from the middle level the model offers, the lower of the
   two where the count is even. A model that offers no levels is left alone. The tier step is taken first, and the
   reasoning step is counted on the model it yields.
7. **The playbook reads the result.** A role's tier, wherever REQ-ORCH-019, REQ-ORCH-020 and REQ-ORCH-022 read it, is
   the tier its stop yields. The run-configuration record's audit payload (REQ-ORCH-027) MUST state the stop the run
   started at, and for each lever whether the stop moved it or the user had set it.
8. **The budget tier and the limits.** In a run whose intent clause 4 does not hold back, the BUDGET slot's clamp MUST
   be one step wider than the resolved cell states at `strong_budget` (`tight` clamps as `normal`, `normal` as `wide`,
   and `wide` stays `wide`), and MUST be `wide` at `token_burner`, whatever the cell states. At every other stop the
   resolved cell's budget clamps as REQ-ORCH-024 states. The limits of clause 3 are configured limits in REQ-ORCH-024's sense: a clamp narrows them and
   never widens them. At `token_burner`, with `runtime.max_depth` not set, the coordinator's deepest permitted child sits
   at depth 4.
9. **The control.** The composer MUST carry a money-slider chip beside the model and reasoning chips, naming the
   session's stop. It opens, on the terms of PD-CHAT-001, a slider of the five stops, each with one sentence saying what
   it does. For the stop under the pointer or the focus the popover MUST state what the next run would resolve to: the
   strategy, and each role's model and reasoning level, with every lever the user has set marked as set and not moved,
   and with a rule that depends on the intent written as the rule ("one tier lower, except on a large build"). It MUST
   NOT show a figure in any currency or a relative cost. The chip MUST be drawn in the design language's warning state
   at `strong_budget` and `token_burner`. No stop asks for confirmation.
10. **When a move takes effect.** A stop chosen while no run of the session is live governs the next run from its start.
    The chip MUST stay enabled in every run state. A move made while a run is live MUST reach that run in one respect
    only: an agent delegated after the move takes the model tier and the reasoning level the new stop yields, under the
    intent the run holds. The run's strategy, its entry role's model and reasoning level, its child limits and its budget
    clamp stay as the run started, and everything the new stop states governs the next run. While a run is live the
    popover MUST say so. Each delegated agent's record MUST state the stop it was started under.

**Why, and what it costs.** The owner wants one control for the trade every other control here makes piecemeal: "more
means heavier orchestration, stronger models and so on. less means conservative orchestration, heavy models where
needed only." It is a posture because the product cannot price a run: a cost is carried only where the provider reports
one (PD-MONITOR-001), and an endpoint the user hosts reports none, so a slider that promised a sum would be a guess on
half the endpoints it is used with. A set value wins because the slider would otherwise change, without saying so, a
model the user chose by name. The intent bounds the stop so that the low end keeps the heavy model for the work that
needs it and the high end does not spend on a one-line question.

What it costs. The slider does nothing visible for a user who has set every lever, and the preview of clause 9 is the
only thing that says why. `strong_budget` lifts the cell's budget one step because its limits would otherwise reach almost no run: a `normal`
cell holds a run to 4 active, 12 in all and depth 3 (REQ-ORCH-024), under every figure the stop states. The price is
that a cell its author marked `normal` runs unclamped at that stop, and one marked `tight` runs as `normal`, so the
playbook's own judgement of how far a kind of work should fan out is overruled by one step.
`token_burner` lets a run start up to forty agents, twelve at once, on the largest model the user configured, one level
deeper than the coordinator was ever allowed; the total is the one bound left, and nothing asks first. A run may hold
agents chosen under two stops, which is why each record names its own. The owner asked for the chip's warning only where
the endpoint charges; the product holds no fact saying whether an endpoint charges, so the warning is drawn at the two
upper stops on every endpoint until one exists. And the name says money where an endpoint the user hosts spends time and
load instead: the owner chose it over a neutral one.

**It lands after `lead`.** `small_budget` is defined by [`PD-ORCH-019`](pd-orch-019.md#pd-orch-019)'s strategy, and this
directive MUST NOT be built before that strategy is on `main`. *(It is, since 2026-11-24.)*

This directive names `PD-ORCH-019` and [`PD-ORCH-006`](pd-orch-006.md#pd-orch-006), which both narrow REQ-ORCH-029: the
first for a `lead` run, the second for a run whose mapping grants the entry role direct work. In both the entry role is
not held to that requirement's constraints at all, so its depth sentence, the one thing this directive narrows there, has
no reach in either case and the three stay apart. `PD-ORCH-019` also narrows REQ-ORCH-025 with a third override and
extends REQ-ORCH-024; this directive extends the first, choosing among the overrides that exist, and its narrowing of the
second is the clamp at `strong_budget` and `token_burner` alone, which a `lead` run never reads. It names
[`PD-ORCH-005`](pd-orch-005.md#pd-orch-005), whose clause 40 carries a resumed iteration's playbook and budget clamp
unchanged: a resumed iteration keeps the stop it started under on the same terms, and clause 10's move reaches the
agents it delegates afterwards, as it does in any live run. And it names
[`PD-MONITOR-006`](pd-monitor-006.md#pd-monitor-006), whose switch of the entry model or reasoning level from the run
header sets those two levers for its run: clause 2 leaves them as switched.

It names [`PD-ORCH-020`](pd-orch-020.md#pd-orch-020) too, whose `intelligent` value is a fifth value of the strategy lever.
A strategy the user set is set whatever its value, so a workspace on `intelligent` keeps it at every stop and the run chooses
its strategy as that directive states; the stop then reaches the run's other levers under the strategy chosen. The cases
stay apart: that directive's is the strategy's choice, this one's is every lever the user left unset.

**First execution, 2026-11-25.** Built as stated, in two parts. The run reads its stop through a port the run host fills
(`RunSpend`, `packages/engine/src/run/spend.ts`; `apps/desktop/src/run-host/spend.ts`): the strategy at the run's start,
the entry role, the personas, the child limits and the cell's widening once the intent is known, and each delegated agent
records `money_stop` at its admission and runs as the stop then yields (clause 10). The surface is the composer's chip with
its popover preview and the default row under Settings › Delegation, as the [composer brief](../../design/briefs/composer.md)
draws them. Measured: unit tests over the resolution, the run host's reading and a child admitted under two stops; the
chip and popover rendered from their own components in Chromium at the five stops, live and narrow, with focus on the
range at opening and no horizontal overflow. **Not run:** the built application, which would not start as root on the
host this was built on, so the composer and settings proofs have not met the surface; a live run at any stop.

> **Narrows:** REQ-ORCH-019, REQ-ORCH-024, REQ-ORCH-029, REQ-ORCH-046
> **Extends:** REQ-ORCH-025, REQ-ORCH-027, REQ-CONFIG-263, REQ-CHAT-006

*Raised by the owner, 2026-11-24, and settled over sixteen questions asked one at a time; logged as [R-132](../requests.md#r-132).*

*Written as PD-ORCH-019 and R-127 on a branch cut before `main` held them, where the strategy it builds on was `solo` under
PD-ORCH-018; renumbered PD-ORCH-021 and R-132 at its landing, 2026-11-25, with `solo` read as `lead` throughout.*
