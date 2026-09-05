# ADR-0028 — Providers are a frozen data catalogue plus capability registries, not a class hierarchy

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-03)
- **Depends on:** ADR-0026

## Context

`REQ-PROVIDER-001` and `REQ-PROVIDER-007`: exactly six providers, fixed identifiers, fixed display
names, fixed enumeration order with the hosted provider first; an unknown id is an error.
`REQ-PROVIDER-006`: the catalogue is **build data, not runtime state** — nothing in the running product
writes the availability attribute, and the "coming soon" marking is never flipped by a health check, a
remote flag, configuration or a user action. That forbids a catalogue loaded from a mutable file or
synchronised from a server, and makes it a frozen module-level constant with a compile-time-checkable
shape.

`REQ-PROVIDER-002`, `REQ-PROVIDER-003` and `REQ-PROVIDER-004`: each entry carries a **closed attribute
set**, and integrity rules are enforced as **errors rather than warnings** — every entry declares a
connection mode; hosted and direct entries must yield a non-empty destination host from their base URL;
a local-runtime entry must declare *neither* a discovery endpoint nor a base URL; a custom-mode entry
must not declare a fixed operator; an unavailable entry must supply a reason. **A build that violates
any of these is rejected.**

`REQ-PROVIDER-005`: absence must be representable distinctly from emptiness. For `claude-code` both the
discovery URL and the base URL "are absent rather than holding a placeholder string"; asking for one
yields nothing, and a code path that requires one must fail **before opening any connection** rather
than falling back to another entry's value. A design modelling these as strings with the empty string
as the absent case cannot produce the required failure.

Providers differ irreducibly: three sign-in methods (`REQ-PROVIDER-008`, `REQ-PROVIDER-148`), five
discovery behaviours (`REQ-PROVIDER-047`, `REQ-PROVIDER-069`, `REQ-PROVIDER-070`, `REQ-PROVIDER-076`),
five status-classification rules (`REQ-PROVIDER-024`, `REQ-PROVIDER-027`, `REQ-PROVIDER-034`,
`REQ-PROVIDER-045`, `REQ-PROVIDER-050`), two bridge-artifact shapes (`REQ-PROVIDER-061`), three usage
endpoints with three payload shapes (`REQ-PROVIDER-123`), and one provider with no endpoint at all.

Some per-provider knowledge is explicitly **build data that may change without changing behaviour**:
the Copilot payload key paths (`REQ-PROVIDER-073`), the known-limits table rows (`REQ-PROVIDER-079`) and
the tier preference fragment lists (`REQ-PROVIDER-081`). The specification fixes what is done with each
value, not where it is found.

A user-supplied compatible instance is **not** a provider entry: it carries its own endpoint and base
URL, leaves the catalogue entry it was seeded from unchanged, and the generic family id is never itself
credentialed (`REQ-PROVIDER-135`).

## Alternatives considered

**A — A `Provider` interface with six implementing classes**, each carrying its own sign-in, refresh,
status, discovery, usage and bridge-staging methods.

*For:* obvious and familiar; each provider's oddities sit together.
*Against:* it hides the catalogue's frozen-data nature behind behaviour, which makes
`REQ-PROVIDER-006`'s "nothing writes availability" and `REQ-PROVIDER-003`'s build-time integrity checks
awkward to state and easy to violate. It forces every provider to answer every method — including usage
for a provider that supports none, and discovery for one that makes no request — so the interface fills
with unsupported-operation stubs. And the user-supplied compatible instances, which are many and
dynamic, do not fit an enumerated class set.

**B — One frozen catalogue record per entry, plus small capability registries selected by a declared
field.** Chosen.

**C — A table-driven interpreter: one generic engine parameterised entirely by per-provider declarative
descriptors.**

*For:* maximum uniformity; adding a provider is adding data. `REQ-PROVIDER-073`'s "the payload key paths
are build data" and `REQ-PROVIDER-151`'s "following a provider's payload change costs a build's mapping
data and no behaviour" read like an invitation to exactly this.
*Against:* it does not survive contact with the actual differences. `REQ-PROVIDER-074`'s endpoint
normalisation and route choice, `REQ-PROVIDER-025`'s session exchange with its 401/404-versus-everything
else split, `REQ-PROVIDER-032`'s three-way claim ladder and `REQ-PROVIDER-078`'s acceptability predicate
(booleans excluded whatever their numeric value, integral floats accepted) are **algorithms, not
mappings**. A descriptor language rich enough to express them is a programming language with worse
tooling.

## Decision

**Alternative B**, taking from C only what the specification actually calls data — key paths, tables,
preference lists — and leaving the algorithms as code.

- **The catalogue** is a frozen array of six records, with a `validateCatalog()` run both in a
  build-time test **and** at process start, implementing `REQ-PROVIDER-003`'s integrity rules exactly.
  Discovery URL and base URL are typed as an **explicit optional**, so `REQ-PROVIDER-005`'s "yields
  nothing" is the type's answer, and the accessor a request path uses returns a discriminated result
  rather than a string.
- **Authenticator registry** keyed by `REQ-PROVIDER-148`'s sign-in method token — `device-code`,
  `browser-pkce`, `api-key` — with the flows' provider-specific parameters passed in as data from the
  catalogue.
- **Discovery registry**: a generic HTTP discoverer implementing `REQ-PROVIDER-069`, `REQ-PROVIDER-071`
  and `REQ-PROVIDER-072`, plus three strategy overrides — Copilot, codex, and the offline
  fixed-catalogue case that makes no network call and has no HTTP status.
- **Usage-reader registry** over exactly the three providers `REQ-PROVIDER-123` names, and a
  **bridge-writer registry** over exactly the two `REQ-PROVIDER-061` names. A registry that is empty for
  the others is the honest encoding rather than a stub.
- **Data modules** for the known-limits table, the tier preference fragments, the Copilot payload key
  paths and the shipped model-capability metadata (OQ-18), each a plain module with a shape test and
  each an **input** to the pure functions of ADR-0032 rather than a global reached into.
- **Instance records** for user-supplied compatible providers are constructed from the family entry
  plus the stored base URL, and the family id itself is excluded from every credentialed path.

The registries are keyed by the **declared attribute**, not by the provider id, because
`REQ-PROVIDER-148` already keys behaviour on the sign-in method token and `REQ-PROVIDER-123` and
`REQ-PROVIDER-061` already enumerate exactly which providers have a reader and a writer.

## Consequences accepted

1. Reading one provider end to end means visiting several files. Mitigated by a per-provider
   documentation page that indexes them, and by naming each registry after the requirement that
   enumerates its members.
2. Adding a seventh provider is a catalogue record plus at most one entry in each registry, plus
   amendments to `REQ-PROVIDER-001` and this record.
3. **The catalogue's attribute set is declared closed and three other requirements add to it.**
   `REQ-CONFIG-370` names `service_name`, `operator_name` and `destination_host` as catalogue fields and
   spells the hosted connection mode differently from `REQ-PROVIDER-002`; `REQ-CONFIG-371` requires a
   quick-start URL on the entry and branches on the connection-mode spelling; `REQ-MONITOR-021` makes
   concurrency-quota sharing a declared property of the entry. The set must be extended and one
   spelling made canonical before the catalogue is written. See OQ-6.

## Revisit if

The catalogue stops being build data — for instance if OQ-6 is answered by making availability or a
quick-start URL server-driven, which would break `REQ-PROVIDER-006` and change this decision's premise.

## First execution — 2026-09-05, the catalogue and one registry entry of each kind (Part K)

*Recorded under GD-10. Found nothing in the catalogue; one finding on the build data.*

**Built and run** (`packages/providers/src/catalogue.ts`, `limits.data.ts`, `tiers.data.ts`): the six frozen records
with the fixed order, display names, endpoints and the hosted entry's "coming soon"; `validateCatalog()` run in the
build's test **and** at main's process start (a violating build throws before a window exists); discovery and base
URLs typed as explicit `null` so `claude-code` answers nothing and a path that needs one fails before any
connection; `destinationHost`, the sign-in-method mapping with REQ-PROVIDER-009's family rule, the three labels of
REQ-PROVIDER-148, the instance id and base-URL normalisation of 051/053, the destination hints of 117. The
registries hold what the slice needs and nothing more, and the absence is the honest encoding this record asked
for: **one authenticator (`api-key`)**, serving `deepseek` and every `openai-compatible--<slug>` instance; **one
discoverer** (the generic HTTP one of REQ-PROVIDER-069/071/072); no usage reader, no bridge writer. A sign-in to a
provider whose method is not registered ends in REQ-PROVIDER-012's single failure outcome naming the method's label.
The three data modules ship with shape tests: the known-limits table (REQ-PROVIDER-079, with its `deepseek/` row),
the tier preference fragments (REQ-PROVIDER-081), and — **empty** — the shipped model-capability metadata of OQ-18,
so every discovered model exposes no reasoning levels (REQ-PROVIDER-137's "unknown models expose no levels") and
the slots grid offers the five levels for a configured model as it did before. A proposed record, now executed in
its structural part; the device-code and PKCE authenticators, Copilot's and codex's discovery strategies, the usage
readers and the bridge writers are owed.

**Found, in the build data rather than the mechanism:** the first tier-preference lists put `sonnet` before `gpt-4o`
for the large tier, which is a choice and not a defect, but the test written against them assumed the reverse and
was corrected — the lists are not normative and the test now asserts the invariants (no `mini`/`nano` as large,
the three picks distinct, the lowest qualified id on a tie, determinism under a shuffled catalogue) and the picks
only where the data forces them.

**Consequence 3 / OQ-6 stands unresolved and did not block:** the catalogue's attribute set is the one
REQ-PROVIDER-002 declares; `service_name`, the quick-start URL and the quota property are not on it.
