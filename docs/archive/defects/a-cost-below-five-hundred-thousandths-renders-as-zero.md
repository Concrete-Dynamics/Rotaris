## A cost below 0.00005 renders as zero, which REQ-SHELL-045 says never happens

`REQ-SHELL-045` states the money rule and the property it is meant to guarantee in one sentence: "rounded
half-up, to two decimal places — or to four when the magnitude is below $0.01, so a cost that is small but not
nothing is never rendered as zero". The rule does not deliver the property. Any amount greater than zero and below
0.00005 rounds to `0.0000`. `formatAmount` (`packages/kernel/src/money.ts`) implements the rule as
`REQ-PROVIDER-121` states it, and `money.test.ts` pins `formatAmount('0.000001')` at `0.0000`. The module's own
comment used to repeat the property as if the rule delivered it; that comment is corrected, and the behaviour is
not changed.

Configured per-token prices (`PD-MONITOR-001` revision 2) make the case reachable. A short run on an inexpensive
model can cost a few millionths: 50 tokens at 0.0000001 is 0.000005, and its label would read
`0.0000 at configured rates`.

Noticed 2026-09-23 while moving `money.ts` into `kernel` for R-049.

**Raised with the owner 2026-09-28 as ESC-42** (`docs/architecture/owner-decisions.md`, under R-062): both requirements
quoted, three options costed, one recommended. The note stays open until the ESC is ruled and built; the code keeps
`REQ-PROVIDER-121`'s rule as written meanwhile.

**Ruled 2026-09-29 ([R-067](../../product/requests.md#r-067)): ESC-42 option (b).** A non-balance amount greater than zero
that the rounding would render as zero renders as `< 0.0001` — `< $0.0001`, `< €0.0001`, `< £0.0001`, `< 0.0001 <CODE>`,
or bare where the currency is not named; zero renders `0.00`; a balance and a negative amount are never floored; the
`incomplete` label keeps its template, `at least < 0.0001; some requests have no price`. `REQ-PROVIDER-121` and
`REQ-SHELL-045` are amended and `PD-MONITOR-001` is at revision 3 (`owner-decisions.md`, ESC-42). The note stays open
until the floor is built in `formatAmount` with its tests, and `costLabelOf`'s case in `run/token-samples.test.ts`.

## Specs

- `REQ-SHELL-045`: "so a cost that is small but not nothing is never rendered as zero". Its own rounding rule
  renders such a cost as zero.
- `REQ-PROVIDER-121`: the rule as the code implements it; it states no such property, so the two requirements
  disagree about what the rule achieves.

## Relevant files

- `packages/kernel/src/money.ts`: `formatAmount`.
- `packages/kernel/src/money.test.ts`: the case pinned at `0.0000`.
- `packages/engine/src/sessions.ts`: `costLabelOf`, which renders the label from `formatAmount`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, as ESC-42's ruling (option (b)) reads. `formatAmount` (`packages/kernel/src/money.ts`)
keeps REQ-PROVIDER-121's half-up rounding and, where that rounding brings an amount greater than zero to zero — only
the four-place band can, so only below 0.00005 — returns the floor `< 0.0001` (`AMOUNT_FLOOR`) instead. Zero at any
scale still renders `0.00`; an amount below zero is rounded as before (`-0.000001` reads `0.0000`, as it did) and never
floored; a balance is outside the floor and is not rendered by this function at all. The floor is bare, because no
figure this product renders names a currency (`PD-MONITOR-001`'s narrowing); where one is one day known, the symbol
stands where the ruling puts it, `< $0.0001` or `< 0.0001 <CODE>`, which the function's comment states. The floor is
rendering only: the stored `cost` stays the exact decimal. `costLabelOf` needed no change — each label template takes
the rendered figure whole, so the four rows of `PD-MONITOR-001`'s table stand as written and read
`< 0.0001 at configured rates`, `< 0.0001 reported by the provider` and `at least < 0.0001; some requests have no price`.

Pinned by `packages/kernel/src/money.test.ts` ("REQ-SHELL-045, REQ-PROVIDER-121 (ESC-42 option b): a cost greater than
zero that four places would render as zero renders as the floor < 0.0001, never as zero", and "ESC-42: zero at any
scale is still 0.00, and an amount below zero is rounded as before and never floored", with the unchanged cases in
"REQ-PROVIDER-121: renders half-up …") and by `costLabelOf`'s three new cases in
`packages/engine/src/run/token-samples.test.ts`; the floor case and the label cases were red on the code before the
repair. ESC-42 and `PD-MONITOR-001` carry the first execution in place, and `first-executions.md` its row.
