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

## Specs

- `REQ-SHELL-045`: "so a cost that is small but not nothing is never rendered as zero". Its own rounding rule
  renders such a cost as zero.
- `REQ-PROVIDER-121`: the rule as the code implements it; it states no such property, so the two requirements
  disagree about what the rule achieves.

## Relevant files

- `packages/kernel/src/money.ts`: `formatAmount`.
- `packages/kernel/src/money.test.ts`: the case pinned at `0.0000`.
- `packages/engine/src/sessions.ts`: `costLabelOf`, which renders the label from `formatAmount`.
