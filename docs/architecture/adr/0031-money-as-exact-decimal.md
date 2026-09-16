# ADR-0031 — Money is an exact-decimal type carried end to end

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-06)
- **Depends on:** ADR-0001
- **Blocked by an open question (OQ-21) that changes a persisted format.**

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
