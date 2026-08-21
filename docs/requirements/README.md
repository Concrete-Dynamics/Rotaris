# Requirements Store

Structured requirement store following `docs/reference/reqtocode-blueprint.md` (§2).
One epic file per feature area, one subfolder per epic, one file per requirement.

## The ReqToCode principle — no orphan code, no spec drift

**Every line of production code and every test must trace to a requirement, and
every requirement must be reachable from the code that satisfies it.** The link
is **bidirectional and mandatory**: requirement → code/test (via `@traces` /
`@verifies`) and code/test → requirement (via the `SWR-<n>` symbol it
references). Neither direction is optional. This is what keeps the spec and the
code from drifting apart: if code exists with no requirement, the spec is
incomplete; if a requirement exists with no code, the implementation is
incomplete. Both are defects the verifier is meant to surface.

There is **no such thing as untraceable code**. When you write code that no
existing product requirement covers — helpers, refactors, plumbing, internal
tooling, performance work, glue between subsystems — you do **not** get to leave
it orphaned. You create a **technical requirement** (below) that captures *why
that code has to exist* and links back to the product requirement where the need
arose. Supplementary code without a technical requirement is spec drift by
definition.

This is **machine-enforced** in both directions. Forward: an approved
`trace: required` requirement with no `@traces` is a verifier error. Reverse:
every production module under `src/rotaris_core/` and `apps/rotaris/src/` must carry
≥1 `@traces()` reference, or it is an **orphan-code** error — trace it, or mark a
genuinely trace-free module `# reqtocode: exempt` (`__init__.py` and the
generated `swr.py` are auto-excused). Pre-existing untraced modules are recorded
once in the shrink-only `orphan-baseline.txt`; new orphans are always errors.
Deleting a requirement that leaves its module untraced surfaces as an orphan —
so deletions propagate to the code.

The same reverse enforcement applies to tests: every `test_*` function under
`tests/` and `apps/rotaris/tests/` must carry a `@verifies()` (or the
transitional `# @req:` comment), or it is an **orphan-test** error — a test
that verifies nothing is spec drift in the other direction. Excused:
`tests/capability/` (optional live-provider confidence, not tied to one
requirement), functions marked `# reqtocode: exempt`, and pre-existing
unannotated tests recorded once in the shrink-only `orphan-test-baseline.txt`.
This matches the [test strategy](../testing/test_strategy.md)'s prospective
policy: existing tests are grandfathered via the baseline, but every new or
materially changed test must carry its `@verifies`.

## Technical requirements (derived / supplementary)

A **technical requirement** documents supplementary code — code that is not a
product-facing behavior on its own but is *needed to satisfy* one. It carries a
`derived-from` frontmatter field naming the requirement(s) where the need
originated, and the relationship is bidirectional:

| Field | On | Meaning |
| --- | --- | --- |
| `type: technical` | the derived requirement | Marks it as supplementary, not product-facing |
| `derived-from: SWR-<n>` (or a list) | the derived requirement | The originating requirement(s) where the need arose |

**Bidirectional linkage is machine-enforced:**

1. `derived-from:` in the frontmatter is the **single source of truth** for the
   forward link. The verifier checks it: a `type: technical` requirement must
   declare a `derived-from`, `derived-from` may appear only on a technical
   requirement, and every id it names must resolve to a real, non-self
   requirement (a dangling or self origin is a build error; a deprecated origin
   warns). Because the reverse direction is computed from these forward links,
   it cannot silently drift.
2. Add a human-readable `Derived from: [SWR-<n>](...)` line in the body, and a
   reciprocal `Derived requirements: [SWR-<n>](...)` note on the originating
   requirement (or its epic index), so a reader can navigate both ways. These
   prose links are convenience; `derived-from` frontmatter is what tooling
   enforces.

A technical requirement is a real `SWR-<n>` entry: it gets its own id in the
most relevant epic's hundreds-block, its `@traces`/`@verifies` obligations, and
`status: approved` when implemented. It never reuses or renumbers an id. Use it
whenever the honest answer to "which requirement does this code serve?" is "a
new supporting one" — not to relax traceability, but to make supplementary code
first-class in the spec.

```
docs/requirements/
  <block>-<epic-slug>.md            # epic (req-id SWR-<block>, e.g. SWR-1500)
  <block>-<epic-slug>/
    SWR-<n>-<slug>.md               # one requirement per file (SWR-<block+1> ...)
```

## Frontmatter

Every epic and requirement file starts with YAML frontmatter. Files without
frontmatter are ignored by tooling (analysis notes may live alongside).

| Field | Values | Meaning |
| --- | --- | --- |
| `req-id` | `SWR-<number>`, globally unique, **stable forever** | Becomes the generated code symbol `SWR_<number>` |
| `status` | `draft` \| `approved` \| `deprecated` | Lifecycle (blueprint §4/§5) |
| `trace` | `required` (default) \| `optional` | Must implementation reference it? |
| `test` | `required` (default) \| `optional` | Must a test reference it? |
| `title` | free text | Short label |
| `type` | `product` (default, omit) \| `technical` | `technical` marks a derived/supplementary requirement |
| `derived-from` | `SWR-<n>` or a list | On `type: technical` only — the originating requirement(s); **required** for technical requirements |

Optional provenance fields: `legacy-id` (pre-migration REQ-/FR-/NFR- id; **not
unique** across files — same-day ids were reused historically), `priority`,
`epic` (parent epic req-id), `date`, `source` (original requirement-log path,
preserved in git history only).

### Multi-ID spec files

`req-id` may instead be a bracketed list — `req-id: [SWR-101, SWR-102]` —
declaring several requirements in one file (a "spec") instead of one file per
requirement. Every id in the list needs a matching `## SWR-<n> — Title`
heading in the body; the heading text becomes that id's title. `status`,
`trace`, `test`, and `legacy-id` lines directly under a heading override the
frontmatter defaults for that one id — anything not overridden falls back to
the shared frontmatter value. All ids in a spec file share one
`content_hash`, so editing any part of the file affects baseline debt for
every id it declares. See `SWR-2330` (`2300-traceability/`).

## ID convention

- `x00` = epic (`trace`/`test` optional — realized through its sub-requirements)
- `x01+` = individual requirements; one hundreds-block per epic
- New requirements: append the next free number inside the epic's block.
  New epics: claim the next free hundreds-block (see the highest existing block).
- Never renumber or reuse an id. Deleted requirements leave a gap.

## Lifecycle

- `draft` — planned/not started/partial; nothing enforced.
- `approved` — implemented; once ReqToCode is built, `trace: required` demands a
  `Traces` reference and `test: required` a `Verifies` test reference.
- `deprecated` — superseded/removed behavior; references produce warnings.

When a requirement's implementation status changes, update `status` in its file
(this replaces the old `done/` / `partial/` / `unresolved/` folder buckets).

## Code and test annotations (ReqToCode)

The store is compiled into `src/rotaris_core/reqtocode/swr.py` (generated — never
edit by hand): one `SWR.SWR_<n>` enum member per requirement plus `META`
metadata. Link code to requirements with real symbol references:

```python
from rotaris_core.reqtocode import SWR, traces, verifies

@traces(SWR.SWR_103)        # on the implementing class/function (src roots)
def dedupe_child_names(...): ...

@verifies(SWR.SWR_103)      # on the covering test (test roots)
def test_duplicate_names_rejected(): ...
```

Enforcement: `python -m rotaris_core.reqtocode check` (also run by the pre-commit
hook, a CI workflow, and the `tests/unit/reqtocode/` meta-tests; pytest
regenerates `swr.py` at session start). `approved` + `trace: required` demands
≥1 `traces` reference; `test: required` demands ≥1 covering test reference.
Pre-existing debt is recorded in `traceability-baseline.txt` (shrink-only —
never add entries; prune paid debt with `check --update-baseline`).

Transitional: `# @req: SWR-<n>` comments in tests still count as coverage
(legacy `REQ-`/`FR-`/`NFR-` ids resolve via `legacy-id`); prefer `verifies` for
new tests. On any requirement change, follow
`docs/reference/reqtocode-playbook.md`.

## Product test portfolios

New or materially changed product requirements must model their test portfolio
before implementation, using the table in `TEMPLATE.md`. The canonical
[Product-Centred Test Strategy](../testing/test_strategy.md) defines the levels
and productive-use contract.

- Include unit and integration rows when applicable; write a reason with every
  `N/A`.
- Include at least one hermetic user-flow E2E test through the real public
  product boundary, carrying `@verifies` for the product SWR.
- A shared E2E flow may cover several SWRs only when it makes meaningful
  assertions for each and names them all in `@verifies`.
- Technical requirements describe seam-appropriate unit/integration coverage
  and connect to the originating product flow through `derived-from`; they do
  not need a separate E2E test.

Test level and productive intent are review-enforced. `@verifies` remains the
machine-readable ReqToCode coverage link.

Epic files end with a **History** section preserving the Description /
Implementation Notes / Acceptance Criteria of the original requirement-log
documents that were merged into the epic (migrated 2026-07-18; originals
remain in git history under `docs/requirement-log/`).
