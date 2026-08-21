# Product-Centred Test Strategy

This document is the canonical testing policy for Rotaris. Tests begin with
productive user intent, then use the cheapest combination of unit, integration,
and hermetic end-to-end coverage that gives confidence in the requirement.

The policy applies prospectively to new tests and to tests or requirements that
are materially changed. Existing untouched tests and approved requirements are
grandfathered; they do not need a mechanical migration.

## Start from productive use

Before choosing fixtures, mocks, or assertions, state:

- the actor;
- the productive action they need to complete; and
- the user-observable result, or the enabling invariant that makes that result
  possible.

Every new or materially changed test starts with this docstring:

```python
"""Productive use: <actor> can <productive action>.
Expected outcome: <user-observable result or enabling invariant>."""
```

For low-level tests, the expected outcome may be a technical invariant, but the
productive-use line must connect it to the originating product requirement.
Avoid tests whose only purpose is to reproduce the implementation's internal
steps.

## Test levels and responsibilities

| Level | Responsibility | Boundary and fakes |
| --- | --- | --- |
| **Unit** | Decisions, invariants, transformations, and failure branches in isolation | Exercise a focused unit; replace collaborators when isolation is the point |
| **Integration** | Real collaboration across modules, persistence, configuration, concurrency, SDK, or UI/service seams | Use real in-process collaborators and hermetic filesystem/state where practical |
| **User-flow E2E** | A productive flow through a real public product boundary and real internal wiring to a user-observable result | Fake only external systems such as LLM providers, OAuth services, and networks |
| **Capability** | Optional confidence that a live provider and the complete deployed stack cooperate | May use live external systems; complements but never replaces deterministic E2E coverage |

A public product boundary is the interface the actor actually uses: the Rotaris
desktop UI, the Textual TUI, or a public CLI/API entry point. Calling an internal
helper directly is not a user-flow E2E test.

Hermetic E2E tests must be deterministic, run without credentials or network
access, and exercise the real internal wiring for the flow. External fakes
should preserve the contract relevant to the scenario rather than bypassing the
seam under test.

## Requirement test portfolios

Every new or materially changed **product** SWR must model its test portfolio
before implementation with this table:

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | ... | ... | ... |
| Integration | ... | ... | ... |
| User-flow E2E | ... | ... | ... |

Unit and integration rows are required when applicable. Write `N/A — <reason>`
when a level would not add meaningful confidence; a bare `N/A` is insufficient.

Every product SWR must have at least one hermetic user-flow E2E test carrying
`@verifies(SWR.SWR_<n>)`. One flow may verify several SWRs only when it makes
meaningful assertions for each requirement and names every covered requirement
in `@verifies`.

A **technical** SWR receives unit and/or integration coverage appropriate to its
seam. It identifies its originating product flow through `derived-from` and
does not require a separate E2E flow. Its requirement text must still explain
how the seam enables that originating flow.

ReqToCode remains the machine-readable link: production implementations carry
`@traces`, and covering tests carry `@verifies`. Productive intent and test
level are review-enforced metadata, not new markers or parser inputs. Follow the
[ReqToCode propagation playbook](../reference/reqtocode-playbook.md) whenever a
requirement changes.

## Product boundaries

For desktop behavior, drive Rotaris as the primary user boundary and use
pytest-qt to assert the observable UI state plus the real store/service seam.
Do not substitute a Textual flow for a Rotaris requirement.

Use the Textual TUI when it owns the behavior. Its user-flow portfolio must also
follow the [TUI testing standards](textualize_testing_guide.md), including full,
alternative, and random interaction coverage.

For behavior owned by a CLI or public API, invoke that public entry point and
assert its user-visible output, exit behavior, or durable artifact.

## Workflow for test changes

1. Read the relevant SWR and state the productive action and expected outcome.
2. Design the unit, integration, and user-flow E2E portfolio before test
   mechanics; document justified `N/A` levels in the SWR.
3. Write focused tests at the responsible boundaries. Keep external systems
   fake in deterministic suites.
4. Add `@verifies` and the productive-use docstring to every new or materially
   changed test.
5. Confirm each affected product SWR has a qualifying hermetic E2E flow.
6. Iterate on the focused selection for the slice; run the full suite once as a
   final pass (see below).

## Focused during development, full suite as the final pass

While a slice is being implemented, run **only the tests that cover that slice**
— the specific test files, node ids, or `-k` selection for the requirement you
are working on, plus the module's immediate neighbours when the change could
move them. Iterate there until they are green. A full-suite run per edit costs
minutes, buries the one failure that matters in unrelated output, and its
flakes and standing environment failures get misread as your breakage.

"The slice" is the requirement or sub-requirement currently in hand, not the
whole epic. When several slices land in one change, widen the selection to the
union of their tests, not to the whole suite.

Run the **full suite once, as a single pass on the merged result** — after the
branch has gone into `master` ([AGENTS.md
§ Workflow](../../AGENTS.md#workflow--worktree-merge-verify-fix-forward)), and
before declaring the work done or reporting gates green. Its job is to catch
what a focused run structurally cannot: regressions in modules you did not
touch, cross-suite interference, and collection or import errors. It is a gate,
not an iteration loop; if it fails, go back to a focused run against the
failures — on a short-lived `fix/…` branch — rather than re-running everything.
It runs after the merge on purpose: it takes minutes, and the next slice is not
allowed to wait on it.

The full pass covers the boundaries the change touched: the root suite for
`rotaris_core`, the Rotaris desktop suite for `apps/rotaris`, and both when the
change spans packages. Judge it against the pre-existing baseline — a test that
already fails on `master` is not your breakage, and saying so explicitly is
part of the report.

Executable repository conventions, fixtures, locations, and commands live in
[`tests/AGENTS.md`](../../tests/AGENTS.md).
