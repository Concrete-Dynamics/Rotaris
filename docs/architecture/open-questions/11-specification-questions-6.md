# Open questions — Specification questions (6 of 27)

Part 11 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-62; OQ-53 – OQ-61 archived in [the archive](../../archive/architecture/open-questions/11-specification-questions-6.md).

- OQ-53 — Which event reports a compression, given a closed catalogue?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-53)
- OQ-54 — The user-terminal audit entry's `decision` and `source` fall outside the closed permission vocabularies; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-54)
- OQ-55 — Decision closed, 2026-09-11; closed 2026-09-11; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-55)
- OQ-56 — The adopted `--rt-text-disabled` misses `REQ-SHELL-145`'s 3:1 floor on every surface but the page ground; ruled 2026-09-18; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-56)
- OQ-57 — Decision closed, 2026-09-13; closed 2026-09-13; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-57)
- OQ-57 — The product draws checkboxes and the adopted design language has none; closed 2026-09-13; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-57)
- OQ-58 — "the current session" has no referent while a workspace has several; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-58)
- OQ-59 — REQ-WORKSPACE-151's chooser asks for a file; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-59)
- OQ-60 — What summary does a session carry when the run that owned it died without a teardown?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-60)
- OQ-61 — May an isolated run read the repository metadata of the worktree it is working in?; ruled 2026-09-18; [archived](../../archive/architecture/open-questions/11-specification-questions-6.md#oq-61)

**OQ-62 — May a price come from a provider's discovery payload, and may a provider-reported cost be shown under its own qualifier? PARTLY RULED 2026-09-16 — the second half is answered, the first is not.** *(REQ-PROVIDER-072, REQ-MONITOR-166, REQ-CONFIG-088, with ADR-0031 and OQ-21; raised 2026-09-16 from a run whose cost read `0` throughout.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

Every run's `cost` column reads `"0"` and every cost label reads "price not established". That is not a
defect of the aggregate: `Aggregates` has no mutator for cost because there is nothing to feed one.
Four routes to a figure exist and three of them need a ruling.

**Discovery drops the prices it is given.** `REQ-PROVIDER-072` admits pricing "only for
`concrete-cloud`", so `describeModel` returns `pricing: {}` for every other provider and a test pins
it. OpenRouter publishes per-token prices in the same payload, as decimal strings, and they are
discarded on the way past.

**A provider-reported per-request cost has nowhere to land.** OpenRouter answers `usage.cost` when the
request asks for it; the adapter neither asks nor reads it. `REQ-MONITOR-166` fixes the cost label's
qualifier as one of three — `unknown`, `incomplete`, `configured` — and a figure the provider itself
computed is none of them. A fourth would have to be named.

**Configured rates are covered in principle and blocked in practice.** `REQ-CONFIG-088`'s
`input_cost_per_token` / `output_cost_per_token` take effect only when both are set — and today they
take effect never: `effectivePricing()` has no callers at all. Multiplying them is where this stops.
`REQ-PROVIDER-121` states the one money rule, that no amount is computed in binary floating point
anywhere; ADR-0031 is the decision that carries it out, and it is **proposed**, names a spike it has
not had, and is blocked by **OQ-21** — the same two fields are float-typed at their source
(`REQ-CONFIG-088`, `REQ-PROVIDER-072`) and exact in the rule that consumes them. ADR-0031's first
accepted consequence settles what to do meanwhile in terms: if the float typing stands, the exactness
is unattainable and "that is a specification defect to be recorded rather than a design to be built
around".

**What the build proceeds under.** Nothing was built for this, deliberately. Cost stays `"0"` and the
label stays `price not established` under the `unknown` qualifier, which `REQ-MONITOR-166` provides
for. Writing the arithmetic now would choose ADR-0031's representation before OQ-21 answers and before
the spike that decision requires, and a second money path is precisely what the lint rule in that
decision exists to prevent. The gap is recorded as an open defect note instead.

**What a ruling decides.** Whether discovery carries per-token prices for every provider (as decimal
strings, extending OQ-21's own recommended reading, which would amend `REQ-PROVIDER-072`'s
`concrete-cloud` clause); whether `REQ-MONITOR-166`'s qualifier set gains a fourth member for a price
the provider computed rather than the product; and whether configured rates are meant to produce a
figure at all — which cannot be built until OQ-21 says what a price is.

> **Disposition, 2026-09-16 (R-026).** One of the three is ruled and the other two are not, so the paragraphs
> above stay as written rather than being edited to match the answer.
>
> **Ruled:** the provider-reported cost. `REQ-MONITOR-166`'s qualifier set gains a fourth member for a figure
> the provider computed, and the adapter asks for and reads it — `PD-MONITOR-001`, a directive rather than an
> amendment round, because the owner is choosing to narrow a requirement that is not wrong. The sentence above
> that says "a fourth would have to be named" is **falsified and kept**: it is what the record said before the
> owner named one. What made this branch rulable while the other two are blocked is that carrying a figure the
> provider computed is exact decimal **addition** and never a multiplication, so `REQ-PROVIDER-121`'s money
> rule is met without saying what a price is. See `owner-decisions.md`, "OQ-62 — a provider-reported cost,
> ruled".
>
> **Still open:** discovery pricing, which is blocked behind OQ-21 for the reason stated above, and configured
> rates, which stay unbuilt. The paragraph "What the build proceeds under" continues to hold for both: cost
> reads `"0"` under the `unknown` qualifier wherever no provider-reported figure exists, which after the
> ruling is every provider but OpenRouter.
>
> **Configured rates ruled, 2026-09-23 (R-049).** With OQ-21 answered, the third branch is ruled by
> `PD-MONITOR-001` revision 2: a request the provider did not price is priced from the model's configured rates
> where both are set, exactly, under the `configured` qualifier, and `incomplete` marks a total some requests
> could not contribute to. **Discovery pricing stays open**: the owner deferred it, so `REQ-PROVIDER-072`'s
> `concrete-cloud`-only clause still governs.
>
> **Built the same day.** The ruled branch is no longer only ruled: the adapter asks OpenRouter for the figure
> and reads it back, `Aggregates.addCost` adds it in exact decimal arithmetic, and the label carries the fourth
> qualifier. The two open branches were not touched by that work and are not unblocked by it — what made this
> one buildable was addition, and neither of theirs is addition. The account is in
> `docs/architecture/first-executions.md`, and the arithmetic is reported back into ADR-0031 in place.
