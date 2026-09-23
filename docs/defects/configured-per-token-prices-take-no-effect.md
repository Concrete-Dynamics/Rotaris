## `input_cost_per_token` and `output_cost_per_token` are read, validated, and used by nothing

`REQ-CONFIG-088` fixes two model-entry fields and the condition under which they apply: pricing "only
takes effect when both are set". The configuration reader reads them, the validator bounds them at
zero, and `effectivePricing(entry)` implements the both-or-neither rule exactly —
`packages/config/src/sections/models.ts`. It has **no callers**. A user who sets both figures gets the
same `cost` of `"0"` and the same "price not established" label as a user who sets neither, and no
surface anywhere says the rates were ignored.

The rest of the pipe is absent for the same reason: `Aggregates` carries `cost` as a decimal string,
rehydrates it, copies it into every save and onto every `usage.update` (REQ-EVENTS-053), and has no
mutator for it — the class comment says so ("zero until pricing exists"). `costLabelOf` returns the
`unknown` qualifier unconditionally, which is truthful today and cannot become `configured` while
nothing computes a figure.

> **Narrowed by the build, 2026-09-16 (`PD-MONITOR-001`).** The paragraph above is kept as written and is
> now half true. `Aggregates` has a mutator — `addCost` — and `costLabelOf` has a second answer, but both
> are reached only by a figure a **provider reported** for a request it completed. Nothing about the
> configured rates changed: `effectivePricing()` still has no callers, `configured` still has no producer,
> and a user who sets both figures still gets the same `"0"` as a user who sets neither. This note stays
> open for that reason, and the label such a user sees is still `price not established`.

Observed on 2026-09-16, session `6696f6ed`: a whole run against a priced provider, `cost` = `"0"`.

## Specs

- `REQ-CONFIG-088` — the two fields take effect when both are set. They do not.
- `REQ-MONITOR-166` — the cost label carries one of three qualifiers so no view invents a description.
  Only `unknown` is ever produced; `configured` has no producer.
- `REQ-PROVIDER-121` — the one money rule: no amount is computed in binary floating point anywhere.
  This is why the repair is not a multiplication.

## Why this is recorded rather than repaired

The arithmetic is governed by **ADR-0031**, which is **proposed**, requires a spike it has not had,
and is **blocked by OQ-21** — the two fields are float-typed at their source while the rule that
consumes them demands exactness. That decision's first accepted consequence rules on this exact
situation: if the float typing stands, the exactness is unattainable "and that is a specification
defect to be recorded rather than a design to be built around". Building a BigInt or library path here
would choose the representation before OQ-21 answers, and would add the second money path ADR-0031's
lint rule exists to prevent.

The two further routes to a non-zero figure — a price read from any provider's discovery payload, and
a provider-reported per-request cost — are not covered at all; they are **OQ-62**.

## Relevant files

- `packages/config/src/sections/models.ts` — `effectivePricing`, correct and uncalled.
- `packages/engine/src/run/aggregates.ts` — `cost`, changed by `addCost` and by nothing a rate reaches.
- `packages/engine/src/sessions.ts` — `costLabelOf`, the `unknown` qualifier hardcoded.
- `packages/providers/src/discovery.ts` — `pricing: {}` for every provider but `concrete-cloud`
  (REQ-PROVIDER-072, pinned by `discovery.test.ts`).
- `docs/architecture/adr/0031-money-as-exact-decimal.md`, `docs/architecture/open-questions.md` (OQ-21,
  OQ-62) — what has to be decided before this is built.

**Confirmed still blocked, 2026-09-22 — [R-047](../product/requests.md#r-047).** Re-read against the code
under the instruction that every open defect be repaired. The block named above has not moved, and nothing
in this note can be built without pre-empting it.

**Proposed 2026-09-23, not ruled — [R-048](../product/requests.md#r-048).** Put to the owner and held back from the ruling: answer OQ-21 as it
recommends (prices carried and persisted as decimal strings, read from the YAML scalar's source text so they
never pass through a binary float), accept ADR-0031 with scaled-integer arithmetic in one money module, and
feed `effectivePricing()` into `Aggregates.addCost` under the `configured` qualifier, a provider-reported
figure taking precedence. OQ-62's discovery-pricing branch was offered as a separate, lower-ranked source.
Nothing about the block described above has moved.

## Design proposed 2026-09-23, awaiting the owner's ruling

Worked out after the proposal above and put to the owner. **Not ruled**; recorded so it is not lost. It takes three records.

1. **OQ-21 answered as it recommends.** This is an amendment round, because REQ-PROVIDER-072 and REQ-PROVIDER-121
   contradict each other. REQ-CONFIG-088 becomes a decimal ≥ 0, written as a YAML number or a quoted string;
   REQ-PROVIDER-072 and the two snapshot format blocks carry prices as decimal strings.
2. **ADR-0031 accepted in narrowed form.** The Decimal is `money.ts`'s scaled `bigint`, with no scale fixed in
   advance. Pricing adds one operation: exact multiplication by a non-negative integer token count. The lint
   rule banning arithmetic on the type is built with it. The library question stays open only for the balance
   division of REQ-PROVIDER-130; pricing needs no spike.
3. **`PD-MONITOR-001` revision 2.** A revision rather than a new directive, because only one directive may
   narrow REQ-MONITOR-166.
   - Prices are read from the YAML scalar's source text (the node's range), so `0.000003`, `3e-6` and
     `"0.000003"` arrive exact. The snapshot layer is read the same way.
   - Per request: the provider-reported figure if there is one. Otherwise, if the request's model has both
     prices: input tokens × input price + output tokens × output price, exact. Otherwise the request is unpriced.
   - The run's qualifier: none priced → `unknown` ("price not established"); some unpriced → `incomplete`
     ("at least $X; some requests have no price"); all priced and all reported → `reported`; all priced with
     any configured → `configured` ("$X at configured rates").
   - Build: the price is resolved at the ladder cell, where the request's model is known. `Usage` carries the
     figure and its source. The session gains a `cost_qualifier` column in an appended migration, because
     `costLabelOf` currently derives the label from the cost string alone.
   - Cost: cached input is charged at the full input price, because `Usage` has no cached-token field.
     Image pricing (REQ-PROVIDER-150) is excluded.

**Prerequisite:** [`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](a-delegated-childs-provider-requests-never-reach-the-runs-totals.md).
Without that repair, configured prices would miss every delegated child's requests.

Open forks put to the owner: a reported-plus-configured mix reads `configured` (proposed: yes); OpenRouter
discovery prices, OQ-62's first half (proposed: deferred).
