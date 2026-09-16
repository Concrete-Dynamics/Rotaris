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
- `packages/engine/src/run/aggregates.ts` — `cost`, carried and never changed.
- `packages/engine/src/sessions.ts` — `costLabelOf`, the `unknown` qualifier hardcoded.
- `packages/providers/src/discovery.ts` — `pricing: {}` for every provider but `concrete-cloud`
  (REQ-PROVIDER-072, pinned by `discovery.test.ts`).
- `docs/architecture/adr/0031-money-as-exact-decimal.md`, `docs/architecture/open-questions.md` (OQ-21,
  OQ-62) — what has to be decided before this is built.
