[Product directives](../directives.md) › PD-MONITOR-001

<a id="pd-monitor-001"></a>

### PD-MONITOR-001 — a cost the provider reported is carried and shown under its own qualifier

*Revision 3 (2026-09-29, [R-067](../requests.md#r-067)) — **the floor**: ESC-42's ruling carried into the rendering of a
figure with no currency, below. The label table is unchanged.*

*Revision 2 (2026-09-23, [R-049](../requests.md#r-049)) — **configured rates price a request the provider did
not**, below. Revision 1 (2026-09-16, [R-026](../requests.md#r-026)) is quoted where it is replaced, never
deleted. A changed directive takes a revision and never a new number ([`README.md`](../README.md)).*

**The rule — revision 2.** Where a provider's own protocol defines a way for a request to ask for the
cost of that request, the product SHALL ask, and SHALL carry the figure the provider answers with.
Every completed provider request of the run, whichever agent made it, is then priced by the first of
these that applies:

1. **Reported.** The provider reported a cost for the request: that figure.
2. **Configured.** The model the request was sent to has both `input_cost_per_token` and
   `output_cost_per_token` set (`REQ-CONFIG-088`): the request's input tokens multiplied by the input
   price, plus its output tokens multiplied by the output price, computed in exact decimal arithmetic
   (`REQ-PROVIDER-121`) with no rounding before display.
3. **Unpriced.** Otherwise the request has no figure. None is estimated or invented for it.

A price SHALL be taken as the decimal its configuration states, read from the text as written, so a
price never passes through binary floating point on its way in. A run's cost total is the **exact
decimal sum** of its requests' figures. `REQ-MONITOR-166`'s cost label SHALL carry a fourth qualifier,
**`reported`**, and the four qualifiers and their labels SHALL be:

| The run's requests | Qualifier | Label |
|---|---|---|
| none has a figure | `unknown` | `price not established` |
| some have a figure, some do not | `incomplete` | `at least <amount>; some requests have no price` |
| every one has a figure, and every figure was reported | `reported` | `<amount> reported by the provider` |
| every one has a figure, and at least one was configured | `configured` | `<amount> at configured rates` |

The qualifier is recorded with the total, so a label read back later is the label the run earned.

> **Revision 1 said, and no longer governs:** "A run's cost total is the **exact decimal sum** of the
> per-request figures it received and of nothing else: no rate is multiplied, no figure is estimated,
> and no figure is invented for a request the provider priced at nothing it reported.
> `REQ-MONITOR-166`'s cost label SHALL carry a fourth qualifier, **`reported`**, for a total reached this
> way, and a run holding no reported figure SHALL keep the `unknown` qualifier and the label it has today."
> It forbade multiplying a rate because the representation that makes the multiplication exact was
> undecided (OQ-21, ADR-0031). Both are now decided: prices are decimal strings, and multiplying a decimal
> by a whole token count is exact in `money.ts`'s representation with no library.

A figure whose currency the provider does not name SHALL be rendered as the amount alone, under
`REQ-PROVIDER-121`'s rule — half-up, two decimal places, four below one hundredth, and the floor `< 0.0001` for an
amount greater than zero that would otherwise read as zero — and SHALL NOT be given a currency symbol the product
chose for it (revision 3). The floor fills a label's `<amount>` as any rendered figure does, so the table above is
unchanged: a run whose priced requests came to more than zero and less than 0.00005 reads `< 0.0001 at configured
rates`, `< 0.0001 reported by the provider`, or `at least < 0.0001; some requests have no price`, and each of those is
true. The figure recorded with the qualifier is the exact one; the floor is rendering only.

> **Revision 2 said, and no longer governs:** "A figure whose currency the provider does not name SHALL be rendered as
> the amount alone, under the rounding of `REQ-PROVIDER-121` — half-up, two decimal places, four below one hundredth —
> and SHALL NOT be given a currency symbol the product chose for it." Under that rounding a run priced at more than
> zero and less than 0.00005 read `0.0000 at configured rates`: a figure that says it was priced and reads as nothing,
> which `REQ-SHELL-045` says never happens. ESC-42 was ruled option (b) on 2026-09-29, and `REQ-PROVIDER-121` now
> carries the floor this sentence restates.

**Why.** Observed live 2026-09-16, run `a26918e8` (logged as [R-026](../requests.md#r-026)): a whole run
against a metered provider, `cost` = `"0"`, the label reading *"price not established"*. That is
[OQ-62](../../architecture/open-questions.md), which names four routes to a figure. Three of them are
blocked and stay blocked: each one **multiplies** a per-token price by a token count, `REQ-PROVIDER-121`
forbids computing an amount in binary floating point, and the representation that would make the
multiplication exact is ADR-0031's — proposed, unspiked, and blocked by OQ-21, which changes a
persisted format.

The fourth route is not blocked, and the difference is arithmetic rather than appetite: a figure the
provider computed needs **addition only**. Adding two decimal strings exactly says nothing about what
a price is, chooses no representation for a rate, and pre-empts neither OQ-21 nor the spike ADR-0031
requires. The one route that was always available was left unbuilt because it sat in the same open
question as the three that were not.

The corpus had already assumed this figure exists. `REQ-SHELL-045` fixes the workspace strip's cost
item as *"the model provider's reported cost for this workspace's runs so far"*, with a tooltip that
says *"Reported by the model provider"* — a requirement written for a figure nothing in the product
could produce and no qualifier could describe.

**Why a directive and not a repair.** `REQ-MONITOR-166`'s qualifier set is a closed three — *"an
unknown price, an incomplete price, and a price derived from configured rates"* — and a figure the
provider computed is none of them. Naming a fourth is a change to a requirement that is not wrong,
which is a directive rather than an escalation (`README.md`: a request contradicting a faithful
requirement is a directive). `REQ-PROVIDER-121` is narrowed for the same reason and no further: its
symbol table is written for an amount whose currency is known, and an amount reported without one is
outside what it decides rather than in conflict with it.

Two requirements the mechanism touches are **not** governed, and reading them is what settled that.
`REQ-EVENTS-053`'s `usage.update` already carries `cost.total` and already fires on the completed
provider request — the payload gains a figure where it carried `"0"`, and not one clause of the
requirement changes. `REQ-ORCH-142` says provider-reported totals *"are cumulative and MUST be
replaced, never summed"*, which reads at first like a prohibition on adding them: it is about a total
a provider reports **for the run**, and what is added here is what a provider reports **for one
request**. Two requests are two purchases. Within a single request the rule is honoured literally —
where a provider repeats the field mid-stream, the last reading replaces the earlier one rather than
adding to it.

**What it costs.**

- **One endpoint today.** The ask is a body field the endpoint defines, and sending it to an endpoint
  that does not define it is not free: a strict OpenAI-shaped API answers an unrecognised field with a
  400. So the product asks only where the protocol says to, which today is OpenRouter's `usage.include`
  — one entry in a table of hosts, data rather than code. Every other provider's cost keeps reading
  `"0"` under the `unknown` qualifier, exactly as before.
- **The figure crosses JSON as a number.** It arrives as a double whatever the provider computed it
  in. That is the protocol's doing and it is where this product's exactness begins: nothing rounds,
  scales or multiplies it, and it is added to the total as the decimal it reads back as.
- **No currency.** The product has no currency type anywhere, and this directive does not introduce
  one. A total is shown bare rather than under a symbol the product guessed. Where a provider names a
  currency, carrying it is ordinary future work against `REQ-PROVIDER-121`'s own table.
- **Not per agent.** `REQ-MONITOR-102` persists a per-agent cost. This carries the run's total only;
  the per-agent figure stays as it is, owed rather than quietly filled.

**What revision 2 costs.**

- **Cached input is charged at the full input price.** The product's usage record has no cached-token
  figure, so on a provider that discounts cached input a configured figure is higher than the provider's
  charge. A reported figure, where there is one, takes precedence and carries the discount.
- **Image pricing is not included.** `REQ-PROVIDER-150`'s image token cost is outside this revision.
- **A mixed run reads `configured`.** One configured figure among reported ones makes the whole total
  partly an estimate, and the label says so.
- **Discovery prices are not read.** Whether a price may come from a provider's model list is the first
  half of OQ-62 and stays open.
- **Children must be counted.** A delegated child's requests are the run's requests. The repair of
  [`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](../../defects/fixed/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md)
  is part of building this revision.

> **Narrows:** REQ-MONITOR-166, REQ-PROVIDER-121

*Raised by the owner, 2026-09-16; logged as [R-026](../requests.md#r-026). Revised 2026-09-23; logged as
[R-049](../requests.md#r-049). Revision 3, 2026-09-29, logged as [R-067](../requests.md#r-067) with the ruling of ESC-42.*

> **First execution, 2026-09-16, the day it was raised:** it found the reading half harder than the
> asking half, and the corpus friendlier than expected. The SDK's usage mapping keeps the token fields
> and **drops every other**, so `usage.cost` reaches nothing above it however the request is made —
> `metadataExtractor`, the seam the SDK provides for exactly this, is what carries the raw chunk over
> before that mapping happens, and the figure rides out on the port's existing `usage` part rather than
> on a new channel. Two nearby requirements looked like obstacles and were not: `REQ-ORCH-142`'s
> "replaced, never summed" is about a run total and not a request's own figure, and `REQ-SHELL-045`
> turned out to require the provider-reported cost outright, which is a requirement the product could
> not meet until this directive. The exact-decimal addition is thirty lines of `bigint` in
> `packages/engine/src/money.ts`, scale-free so no place is truncated, and it is reported into ADR-0031
> in place: it is not that decision's `Money` type, its library or its lint rule, all of which stay
> blocked on OQ-21. The account is in `docs/architecture/first-executions.md`.

> **First execution of revision 2, 2026-09-23, the day it was ruled:** the rule held as written, and building it
> found three things the text did not say. (1) **A failed attempt is not a request with a price.** The ladder
> observes every attempt, including one that failed before the provider counted a token; read literally, such an
> attempt is a request with no figure, and one transient retry would have made every run read `incomplete`. A request
> that counted no tokens and reported no figure is therefore none of the three, and one with tokens but no figure is
> unpriced as the rule says. (2) **"The model the request was sent to" is the ladder's to know.** After a fallback it
> is not the agent's model, so the price is resolved at the ladder cell, and a test prices a quota fallback at the
> fallback's rates. (3) **The qualifier needs no history of its own.** The recorded qualifier and the run's token
> totals together determine everything a continuation needs to count on, so `sessions.cost_qualifier` (v21) is the
> only new column. The prices arrive exact because the loader reads each from the YAML scalar's source text, and
> the snapshot is read the same way. In the built product, `pnpm overview-proof` ran a scripted run whose entry agent
> and child are both priced at `3e-6` and `0.000015`: 162 and 129 tokens stored as `0.002421`, exactly, labelled
> `0.0024 at configured rates`. A cost below 0.00005 still renders `0.0000`, which contradicts REQ-SHELL-045's
> own promise and is recorded in `docs/defects/`. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First execution of revision 3, 2026-09-29, the day it was ruled:** the floor held as written. `formatAmount`
> returns `< 0.0001` for an amount greater than zero that the half-up rounding brings to zero, and `costLabelOf`
> needed no change, because each label takes the rendered figure whole: `< 0.0001 at configured rates`,
> `< 0.0001 reported by the provider`, `at least < 0.0001; some requests have no price` — the table above, unchanged.
> The stored figure is the exact one. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
