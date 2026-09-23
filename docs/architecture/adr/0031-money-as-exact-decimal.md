# ADR-0031 — Money is an exact-decimal type carried end to end

- **Status:** accepted, narrowed — 2026-09-23 (R-049; see "Accepted, narrowed" at the end). Proposed 2026-08-31.
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-06)
- **Depends on:** ADR-0001
- ~~**Blocked by an open question (OQ-21) that changes a persisted format.**~~ OQ-21 ruled 2026-09-23: prices are decimal strings.

## Context

`REQ-PROVIDER-121` states one money rule for the whole domain: amounts are computed and rendered in
**exact decimal arithmetic, never in binary floating point**; balances are rounded **down** toward
negative infinity and every other amount **half-up**; both to 2 decimal places, or 4 when the magnitude
is below one hundredth of a unit; currency symbols for three currencies and `<amount> <CODE>`
otherwise. The rule covers **the per-token pricing carried through discovery** and any image pricing a
model entry declares (`REQ-PROVIDER-150`). "No amount is computed in binary floating point anywhere."

`REQ-PROVIDER-130`: the balance is `balance_atomic` divided by `atomic_scale` in exact decimal
arithmetic, with a non-number and a non-positive scale each a named error. The scale is
**provider-supplied**, so the product cannot fix one of its own.

`REQ-MONITOR-102` persists cost per agent and `REQ-EVENTS-053` carries cumulative cost on
`usage.update`, so the representation must survive persistence and the event stream.

`REQ-PROVIDER-127` is a separate, simpler rule: percentages clamp to 0–100 then round half-up to a
whole number, one rule for every percentage the domain displays; reset labels have fixed formats; and
the numeric parser accepts integers, floats and comma-grouped strings and **rejects booleans**.

## Alternatives considered

**A — Compute in the language's own number type, round at the edges.**

*For:* nothing to add; the type is exact for integers up to a large bound and the amounts are small.
*Against:* it is prohibited in terms, and for a reason that shows up immediately here. Per-token prices
are of the order of one part in a million to one in a hundred million; multiplying such a price by a
token count and accumulating over thousands of calls is precisely where binary representation error
becomes visible, and cumulative cost is displayed to two or four decimal places. A rounding rule that
**distinguishes floor from half-up** is also unreliable in binary: a value that is mathematically
exactly `x.005` may be stored as slightly less, and half-up then rounds the wrong way. The rule exists
because this is a real failure mode.

**B — A `Decimal` value type from an arbitrary-precision library, with a `Money` wrapper carrying a
currency, used from the point a price or an amount enters the product to the point it is rendered.**
Chosen.

**C — Integer minor units, or integer nano-units, throughout.**

*For:* no dependency; exact; fast.
*Against:* per-token prices are far below a minor unit, so the scale has to be picked in advance, and a
provider reporting a price finer than the chosen scale is **silently truncated** — which
`REQ-PROVIDER-151`'s "shall not be repaired by guessing" refuses. `REQ-PROVIDER-130`'s balance is
already given as an atomic value with a **provider-supplied** scale, so the product cannot fix one. It
also makes the four-decimals-below-a-hundredth rule and the two rounding modes hand-written integer
arithmetic, which is exactly the kind of code that hides an off-by-one.

## Decision

**Alternative B.** Adopt an arbitrary-precision decimal library, chosen by a spike confirming it
supports both floor and half-up rounding explicitly and is stable under ADR-0054's packaging. Define:

- `Decimal` for unitless exact numbers — per-token prices, the atomic scale.
- `Money = { amount: Decimal, currency: string }`, with the currency carried in the **type** so
  `REQ-PROVIDER-121`'s symbol table is a property of the value rather than of the formatter.
- Two formatters: `formatBalance` (floor) and `formatAmount` (half-up), each choosing 2 or 4 places by
  magnitude, and a **separate** `formatPercent` implementing `REQ-PROVIDER-127` — percentages are not
  money and must not share the money formatter.
- **Persisted and event-carried monetary fields are strings** in their canonical decimal form, so
  `REQ-EVENTS-017`'s typed-field rule is satisfied by a string-typed cost field and an accidental
  numeric fails a schema check rather than passing quietly.

A **lint rule bans arithmetic operators on the branded type**. It is the load-bearing part of this
decision: without it the discipline decays, and a single numeric conversion re-introduces the defect
silently.

The status strip, the KPI surfaces and every other renderer take money already formatted by this layer
and never re-implement the rule (`REQ-PROVIDER-121` is cited by the UI slice as a dependency, not
restated).

## Blocking open question

**`REQ-PROVIDER-072` maps the hosted provider's decimal-string per-token prices "to floating-point
input/output cost per token", and the snapshot format types those two fields as floats — while
`REQ-PROVIDER-121` states that no monetary amount, "including the per-token pricing carried through
discovery", is computed in binary floating point anywhere.** The same format block already types image
cost per image as a **decimal string**.

**Recommended reading, subject to confirmation:** the price is carried and persisted as a decimal
string like the image price, and the float typing is the defect — because a value that has already been
through a binary float cannot afterwards be made exact. **Confirm before implementation; this changes a
persisted format.** See OQ-21.

## Consequences accepted

1. This decision is coherent only if per-token prices are persisted as decimal strings. If the float
   typing is confirmed as written, the exactness `REQ-PROVIDER-121` demands is **unattainable for any
   amount derived from a persisted price**, and that is a specification defect to be recorded rather
   than a design to be built around.
2. A dependency and a lint rule.
3. Comparisons and equality on money go through the type, so tests compare canonical strings rather
   than numbers.

## Revisit if

OQ-21 is resolved toward floats; or a provider begins reporting prices in a form the decimal parser
cannot accept without loss, which would be a `REQ-PROVIDER-151` read failure rather than a silent
conversion.

## Asked for by a run — 2026-09-16

*Not a first execution: nothing here has been built. Recorded because the decision now blocks something a
user can see, which it did not when it was written.*

A full run against a priced provider (OpenRouter, session `6696f6ed`) persisted `cost = "0"` and showed
"price not established" from start to finish. Reading back to why: `effectivePricing()` — `REQ-CONFIG-088`'s
both-or-neither rule, correctly implemented — has **no callers**, `Aggregates` has no mutator for cost, and
`costLabelOf` returns the `unknown` qualifier unconditionally. `REQ-MONITOR-166`'s `configured` qualifier has
no producer anywhere in the product.

So the question this decision is blocked on is no longer only about a persisted format. Until OQ-21 answers,
**a user who configures both per-token prices gets the same zero as a user who configures neither**, and the
product cannot say the rates were ignored, because no surface has a way to say it.

The gap is recorded as an open defect note (`docs/defects/configured-per-token-prices-take-no-effect.md`) and
not built around, which is what consequence 1 above rules for exactly this case. The two routes that are not
covered at all — a price read from any provider's discovery payload, and a provider-reported per-request cost
with no qualifier in `REQ-MONITOR-166`'s closed set — are **OQ-62**, raised the same day.

## Part of it was built without it — 2026-09-16 (`PD-MONITOR-001`)

*The first execution of this decision's arithmetic, and not of this decision. Reported in place, as the
standing policy requires, including what it did not settle.*

The owner ruled one branch of OQ-62 the same day: a cost the **provider** computed is carried and shown
under a fourth qualifier (`PD-MONITOR-001`). Carrying it needs addition and never multiplication, so it is
buildable while OQ-21 is open — nothing has to decide what a price *is* to add two amounts a provider
stated. What was built is `packages/engine/src/money.ts`: decimal strings parsed to a scaled `bigint`,
added at the wider of the two scales with no scale fixed in advance, and rendered by `REQ-PROVIDER-121`'s
rule for an amount — half-up, two places, four below one hundredth.

**What that does and does not settle for this decision.**

- **The representation question is untouched.** No library is chosen, no spike is discharged, and nothing
  is persisted in a new format: the `cost` column and `usage.update`'s `cost.total` were already decimal
  strings, which is this decision's own persistence clause and the reason the figure fits at all.
- **Alternative C's objection is respected rather than reopened.** The scale is the operands', never a
  scale picked in advance, so a provider reporting more places than expected loses none — which is why
  fixed minor units were refused.
- **The lint rule is still owed, and the risk it names is now real.** There is a money path in the product
  and no rule guarding it. Consequence 2 stands; `money.ts` is the one place arithmetic on an amount may
  live until the branded type exists, and it does no multiplication at all.
- **The float typing is untouched.** Consequence 1 still rules the three routes through a rate, which stay
  unbuilt and still read `"0"` under the `unknown` qualifier.

One reading in the section above is falsified by the build and kept beside its replacement: *"`Aggregates`
has no mutator for cost"*. It has one — `addCost` — reached only by a figure a provider reported. The
sentence was true of every route this decision was blocking and was never true of the route it was not.

## Accepted, narrowed — 2026-09-23 (R-049)

*A ruling, not a first execution: nothing new is built by it.*

OQ-21 is answered as consequence 1 needed: prices are carried and persisted as decimal strings. The owner
accepted this decision with its representation narrowed to what is already built and what pricing needs.

- **The Decimal is `money.ts`'s representation**: a decimal string parsed to a scaled `bigint`, at the
  operand's own scale, with no scale fixed in advance. Alternative B's library is **not adopted for pricing**.
  Alternative C's objection still holds, because no scale is fixed in advance.
- **Pricing needs one operation beyond addition**: exact multiplication of a Decimal by a non-negative
  integer token count. That is exact in this representation, so pricing needs no library and no spike.
- **The lint rule of consequence 2 is built with the pricing work**, and `money.ts` stays the one place
  arithmetic on an amount lives.
- **Still open under this decision**: the balance of `REQ-PROVIDER-130`, `balance_atomic` divided by a
  provider-supplied `atomic_scale`. Division by an arbitrary integer is the one operation that may need a
  library, and the spike this decision names is now scoped to it alone.

The sections above are kept as written. The reading "No library is chosen, no spike is discharged" is still
true, and the spike now prices only the balance.

## First execution — 2026-09-23 (R-049 built)

*Reported in place, as a first execution must be.*

- **The representation held.** Multiplying a decimal by a whole token count is `units × count` at the price's own
  scale: `multiplyAmount` is four lines, and no library was needed. A configured price reaches it as the decimal its
  text states. `amountFromText` shifts an exponent within the digit string (`3e-6` → `0.000003`), and the config
  loader hands it each price scalar's YAML source text before the plain value's double is used.
- **`money.ts` moved to `kernel`.** A price is read in `config` and summed in `engine`, and `config` may not import
  `engine`, so the one money module had to sit below both. `model/reported-cost.ts` now expands a reported figure
  through the same reader rather than its own copy of the exponent expansion.
- **The lint rule is syntactic, by the owner's choice** (R-049's build). The repository lints without type
  information, so "arithmetic operators on the branded type" became two halves:
  - No bigint anywhere but `money.ts`, which is exact: there was none elsewhere.
  - No arithmetic operator, numeric conversion or compound assignment on a value NAMED `cost`, `price` or `amount`,
    which is a heuristic that a renamed money value escapes.

  No branded type was introduced. Amounts stay canonical decimal strings, because a brand would have needed a cast
  at every persisted and event-carried boundary while the syntactic rule cannot read types anyway.
- **What the rule found on its first run:** three hits, all false positives on the name — an edit-distance `cost`
  in `kernel/similarity.ts` and a colour-blend `amount` in `ui/slash/highlight.ts` (twice). They were renamed
  (`substitution`, `fraction`) rather than disabled. The rule's own tests pin one case of each shape it reports.
- **The balance's division (REQ-PROVIDER-130) is still not here**, and the spike this decision names still prices
  only that.

The row is in [`../first-executions.md`](../first-executions.md).

