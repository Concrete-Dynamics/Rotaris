# Product-owner decisions on the architecture record — Rulings and escalations after the gate — 2026-09-16

Part 10 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in [the archive](../../archive/architecture/owner-decisions/10-rulings-and-escalations-after-the-gate-2026-09.md), one index line each here: ESC-41; ESC-40.

## Rulings and escalations after the gate — 2026-09-16

- ESC-41 — the exit-1 success conventions: REQ-TOOLS-112's test 4 against `git diff`, `diff` and `grep`; ruled 2026-10-06; [archived](../../archive/architecture/owner-decisions/10-rulings-and-escalations-after-the-gate-2026-09.md#esc-41)
- ESC-40 — `session_log_level`'s default and vocabulary: REQ-CLI-065's lowercase `info` against three requirements' uppercase `WARNING`; ruled 2026-09-18; [archived](../../archive/architecture/owner-decisions/10-rulings-and-escalations-after-the-gate-2026-09.md#esc-40)

### OQ-62 — a provider-reported cost, ruled; the other two branches stated and left open

**Ruled 2026-09-16, one branch of three.** OQ-62 asked three separable questions and the owner's answer
to R-026 settles exactly one of them.

- **A provider-reported cost — RULED.** `REQ-MONITOR-166`'s qualifier set gains a fourth member for a
  figure the provider itself computed, and the adapter asks for and reads OpenRouter's `usage.cost`.
  The disposition is **`PD-MONITOR-001`** (`docs/product/directives.md`), not an amendment round,
  because it narrows a requirement the owner is choosing to govern rather than correcting one that is
  wrong. What makes this branch rulable ahead of the other two: carrying a figure the provider computed
  needs **exact decimal addition only and never a multiplication**, so `REQ-PROVIDER-121`'s one money
  rule is met without deciding what a *price* is — which is OQ-21's question and ADR-0031's spike. **Built
  the same day it was ruled** (`packages/model/src/reported-cost.ts`, `packages/engine/src/money.ts`); the
  first execution is reported into the directive and into ADR-0031 in place.
- **Discovery pricing — stated, not ruled.** `REQ-PROVIDER-072` admits pricing "only for
  `concrete-cloud`" and `discovery.ts` returns `pricing: {}` unconditionally, with a test pinning it.
  An amendment would land there. It stays blocked behind **OQ-21**, because carrying a per-token price
  is deciding what a price is.
- **Configured rates — unchanged, and deliberately unbuilt.** `effectivePricing()` has no call sites
  and keeps none until OQ-21 answers and ADR-0031 has had the spike it names. ADR-0031's first accepted
  consequence already rules the interim: if the float typing stands, the exactness is unattainable and
  that is "a specification defect to be recorded rather than a design to be built around".

**What this ruling does not do.** It does not make every run's cost non-zero. A provider that reports no
cost still yields `unknown`, which is what `REQ-MONITOR-166` provides for, and a configured rate still
produces nothing at all. The `0` the owner saw is closed for OpenRouter and open everywhere else.
