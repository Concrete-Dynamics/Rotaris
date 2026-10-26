# Product-owner decisions on the architecture record — Escalations after the gate — 2026-09-28

Part 13 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Escalations after the gate — 2026-09-28

### ESC-42 — the money rule against the property it is said to guarantee: REQ-SHELL-045's "never rendered as zero" under REQ-PROVIDER-121's four places

**Raised 2026-09-28. RULED 2026-09-29 ([R-067](../../product/requests.md#r-067)): option (b), the floor.** Found while moving `money.ts` into `kernel` for R-049 and recorded as the
open defect note
[`a-cost-below-five-hundred-thousandths-renders-as-zero.md`](../../defects/fixed/a-cost-below-five-hundred-thousandths-renders-as-zero.md);
raised here under [R-062](../../product/requests.md#r-062). Two live requirements state the product's one money
rule, and one of them also states a property the rule cannot deliver.

- **REQ-PROVIDER-121** (domain 04), the rule alone: "Amounts are computed and rendered in exact decimal
  arithmetic, never in binary floating point: a balance is rounded down (toward negative infinity), every
  other amount is rounded half-up, both to 2 decimal places, or to 4 when the magnitude is below $0.01. …
  This is the one money rule for this domain: every monetary amount the domain computes or displays is
  produced under it".
- **REQ-SHELL-045** (domain 12), the rule and a property in one sentence: "The figure is rendered by the
  product's single money rule (REQ-PROVIDER-121) and by no other: exact decimal arithmetic rather than binary
  floating point, rounded half-up, to two decimal places — or to four when the magnitude is below $0.01, **so a
  cost that is small but not nothing is never rendered as zero**."
- Domain 12's resolution record (item 22) repeats the property as the reason the rule was chosen: "two decimal
  places, or four when the magnitude is below $0.01 **so that a small non-zero cost is never rendered as
  zero**".

**Why both cannot hold.** Half-up rounding to four places maps every amount greater than zero and below
0.00005 to `0.0000`. The rule REQ-SHELL-045 cites is therefore the rule that renders such a cost as zero, and
the clause that follows "so" is not a consequence of the rule but a claim against it. The case is reachable,
not hypothetical: under `PD-MONITOR-001` revision 2 a request is priced from configured per-token rates, and
50 tokens at a configured `0.0000001` cost `0.000005`, whose label reads `0.0000 at configured rates` — a
figure that says it was priced and reads as nothing. `REQ-MONITOR-166`'s cost label and `PD-MONITOR-001`'s
label table (`<amount> at configured rates`, `<amount> reported by the provider`, `at least <amount>; some
requests have no price`) all carry the rendered figure, so whatever the rule renders is what every consumer
shows. `REQ-UIBENCH-031` takes the label as an already-rendered string and performs no arithmetic on it, so
it bears on none of the options.

**What the build proceeds under.** REQ-PROVIDER-121's rule as written: `formatAmount`
(`packages/kernel/src/money.ts`) rounds half-up to two places, or four below one hundredth, and
`money.test.ts` pins `formatAmount('0.000001')` at `0.0000`. The module's comment states the contradiction
and cites the defect note; the property of REQ-SHELL-045 is **not implemented and is not treated as a defect
of the code** — it is treated as this escalation. The one rendering site is `formatAmount`, which
`rotaris/money-only-in-money-ts` guarantees (arithmetic on an amount fails `pnpm lint` anywhere else), so
every option below changes one function and the requirements that describe it.

**The options, with their costs.**

- **(a) Amend REQ-SHELL-045 to claim only what the rule delivers.** Strike the "so a cost that is small but
  not nothing is never rendered as zero" clause, or replace it with what the four-place band actually buys
  ("so a cost below one cent keeps two more places"), and correct domain 12's resolution record item 22 with
  it. **Cost:** one amendment round touching one requirement and one resolution record; no code changes, the
  test's name loses the word "never", and the `money.ts` comment cites the ruling instead of the note.
  **What it gives up:** the intent. A run that cost something keeps reading `0.0000 at configured rates`,
  which is the shape of the figure that started R-026 (`cost` = `"0"` beside a metered run), now with a
  qualifier asserting it was priced.
- **(b) Change the rule: a non-zero amount that would round to zero renders as a stated floor.** An amount
  that is not a balance, is not zero, and rounds half-up to `0.0000` renders as `< 0.0001` — with the symbol
  where the currency is known (`< $0.0001`), bare where it is not, per `PD-MONITOR-001`'s narrowing. Zero
  itself still renders `0.00`, so nothing and a small something stay distinguishable at the surface, which is
  the property's whole content. **Cost:** one amendment round touching REQ-PROVIDER-121 (the rule gains the
  floor sentence) and REQ-SHELL-045 (the property stays, and now cites the floor that delivers it), plus
  domain 12's resolution record; `PD-MONITOR-001` takes a **revision 3** for the one label the floor reads
  badly in — `at least <amount>; some requests have no price` becomes `at least < 0.0001` — which the ruling
  fixes with a wording for that cell, and `REQ-MONITOR-166`'s qualifiers are otherwise untouched, since they
  name what a figure *is*, not how it prints. **Code:** the floor branch in `formatAmount`, its test, and a
  case for `sessions.ts`'s `costLabelOf` in `packages/engine/src/run/token-samples.test.ts`, where that function is tested; nothing in the store, since the exact figure is what is
  persisted and the floor is rendering only. **What it gives up:** the rule stops being "round to N places"
  alone, and a balance (rounded down) is deliberately outside the floor — a reading the ruling should say.
- **(c) Extend the rule's own device.** REQ-PROVIDER-121 already answers this problem one order of magnitude
  higher by adding two places below $0.01; repeating it — six places below $0.0001, eight below $0.000001 —
  delivers the property for every amount `money.ts` can carry, because the scaled representation keeps
  whatever scale the operands had. **Cost:** the same amendment round as (b) on REQ-PROVIDER-121 and
  REQ-SHELL-045, but no `PD-MONITOR-001` revision, since every label still shows a plain amount. **What it
  gives up:** bounded width. A configured price of `0.000000001` per token prices one token at nine places,
  and the 26 px status strip (REQ-SHELL-038, REQ-SHELL-047's responsive hiding) and the tokens card were
  drawn for `0.0024`, not `0.000000001`; a cap on the places reintroduces (b)'s floor at a smaller magnitude,
  so (c) is (b) with a wider band and the same open end.

**Recommendation: (b).** The corpus records the property as the *reason* the four-place band exists (domain
12, item 22), so amending the property away under (a) keeps a rule whose stated purpose is gone and leaves
the R-026 shape — a priced run reading as nothing — in the product; and (c) buys the property only until a
cap, at which point it is (b). The floor is what the property asked for, its rendering site is one function
under a lint rule that guarantees it stays one, and its whole record cost is two amended requirements, one
resolution-record correction and one directive revision for one label cell. A rounding-to-zero amount was
never a figure anyone could act on; `< 0.0001` is at least true.

**What the ruling decides.** Whether REQ-SHELL-045's property is withdrawn (a) or delivered (b or c); if
delivered, the exact floor text and its symbol placement, the `incomplete` label's wording under the floor,
and whether a balance rounded down to `0.0000` is inside or outside it. The amendment round the ruling costs
is one round in the shape `specification-gate.md` records: each amended requirement gains an inline amendment
mark, the owning domain's resolution record carries the note, `pnpm symbols` checks the identifiers, and the
built reading reports its first execution into this entry and `first-executions.md`. Until it is ruled the
defect note stays open in `docs/defects/`.

**RULED 2026-09-29 ([R-067](../../product/requests.md#r-067)): option (b), as the escalation recommends.** The owner accepted the
recommendation with seven others ("Accept all eight (Recommended)").

- **The floor.** An amount that is not a balance, is greater than zero, and that REQ-PROVIDER-121's rounding — half-up,
  two decimal places, four when the magnitude is below $0.01 — would render as zero renders as `< 0.0001`. The symbol
  stands where the rule already puts it: `< $0.0001`, `< €0.0001`, `< £0.0001`; any other named currency `< 0.0001 <CODE>`;
  and an amount whose currency the provider does not name (`PD-MONITOR-001`'s narrowing) bare, `< 0.0001`. Zero itself
  still renders `0.00`, so nothing and a small something stay distinguishable at every surface.
- **What option (b) left open, read so that every existing label table stays true.** Option (b) fixes the floor's text
  and its symbol placement; it leaves four details to the ruling, each taken as follows.
  - *A balance is outside the floor*, as option (b) states it ("an amount that is not a balance"). A balance keeps
    REQ-PROVIDER-121's rounding down, so a balance below 0.0001 reads `0.0000`. The credit tile's renderings
    (REQ-PROVIDER-120) are unchanged.
  - *An amount below zero is outside it.* The ruling's words are "greater than zero"; a negative amount is rounded as
    before.
  - *The `incomplete` label keeps its template.* Option (b) had that cell read `at least < 0.0001` and asked the ruling
    for a wording. The reading that keeps `PD-MONITOR-001`'s label table true is the table as written: `<amount>` takes
    the rendered figure, the floor included, so the label reads `at least < 0.0001; some requests have no price`. That is
    true — the priced part is greater than zero and below 0.0001, and the total is at least the priced part — and it
    changes no cell, so `REQ-MONITOR-166`'s qualifiers and the directive's four rows stand as written. `PD-MONITOR-001`
    revision 3 carries the floor into the one sentence that restated the rounding, and nothing else.
  - *The floor is rendering only.* The exact figure is what is persisted, summed and exported; the floor is applied by
    `formatAmount` and nowhere else, which `rotaris/money-only-in-money-ts` keeps true.
- **The amendment round.** `REQ-PROVIDER-121` gains the floor sentence, and domain 04's rendering-formats line with it;
  `REQ-SHELL-045`'s property stays and now cites the floor that delivers it; domain 12's resolution item 22 is corrected
  in place, its stated reason kept beside the correction. Each amended requirement carries the inline mark "accepted
  amendment 2026-09-29, ESC-42", and the resolution records of domains 04 and 12 carry the note. `PD-MONITOR-001` takes
  revision 3, with its back-pointer at `REQ-PROVIDER-121` amended in place.
- **What the ruling does not do.** It builds nothing. `formatAmount` renders `0.0000` for such an amount until the
  repair of [`a-cost-below-five-hundred-thousandths-renders-as-zero.md`](../../defects/fixed/a-cost-below-five-hundred-thousandths-renders-as-zero.md),
  whose first execution reports into this entry, into `PD-MONITOR-001` and into `first-executions.md`.

**First execution, 2026-09-29 — built under R-067, and it found nothing the ruling had not said.** `formatAmount`
(`packages/kernel/src/money.ts`) returns `AMOUNT_FLOOR`, `< 0.0001`, where REQ-PROVIDER-121's half-up rounding brings an
amount greater than zero to zero; only the four-place band can, so the floor covers exactly (0, 0.00005). Zero at any
scale renders `0.00`, a negative amount is rounded as before, and a balance is not rendered by this function. The
floor is bare because no figure the product renders names a currency; the symbol placement the ruling fixes (`< $0.0001`,
`< 0.0001 <CODE>`) has no caller yet and is stated in the function's comment rather than built ahead of one. The
ruling's reading of the `incomplete` label held in the code as on paper: `costLabelOf` did not change, and its three new
cases read the three priced labels with the floor in `<amount>`. The unit cases were red on the code before the repair
(`money.test.ts`, `run/token-samples.test.ts`); the note is at
[`../../defects/fixed/a-cost-below-five-hundred-thousandths-renders-as-zero.md`](../../defects/fixed/a-cost-below-five-hundred-thousandths-renders-as-zero.md).
