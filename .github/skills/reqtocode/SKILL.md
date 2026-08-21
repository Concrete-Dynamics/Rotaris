---
name: reqtocode
description: "ReqToCode requirements-to-code traceability and test-portfolio workflow for Rotaris. Load when: implementing or materially changing a requirement, designing or writing tests that cover a requirement, editing files under docs/requirements/, or reacting to any ReqToCode signal."
argument-hint: "Describe the requirement work: implement SWR-<n>, test SWR-<n>, or react to a verifier/meta-test failure"
user-invocable: true
metadata:
  repository: Rotaris
  authoritative_runbook: docs/reference/reqtocode-playbook.md
  blueprint: docs/reference/reqtocode-blueprint.md
---

# ReqToCode — Requirements-to-Code Traceability

This skill routes requirement work to the right flow. It does not restate the
mechanics: the **authoritative runbook** is
[`docs/reference/reqtocode-playbook.md`](../../../docs/reference/reqtocode-playbook.md)
(commands, annotation syntax, baselines, reverse checks, the propagation
procedure); the store format is
[`docs/requirements/README.md`](../../../docs/requirements/README.md); the system
design is `docs/reference/reqtocode-blueprint.md` (§10 = agent workflow). Read the
playbook whenever the flow below says to.

## The principle this enforces

ALL production code and ALL tests trace to a requirement, **bidirectionally**:
requirement → code/test (`@traces`/`@verifies`) and code/test → requirement (the
`SWR-<n>` symbol it references). A gap either way is spec drift. There is no
orphan code: when a change adds code no product requirement covers (helpers,
refactors, plumbing, tooling), author a **technical requirement** — Flow D. The
goal is a spec and a codebase that cannot silently diverge.

## Flow A — Implementing a requirement

1. Read the full requirement file (not just its title/acceptance bullets).
2. Read the
   [product-centred test strategy](../../../docs/testing/test_strategy.md). For a
   product SWR, complete or review its unit/integration/user-flow E2E portfolio
   before implementation.
3. Implement; put `@traces(SWR.SWR_<n>)` on the implementing element.
4. Write/extend tests that exercise **real behavior** of the traced code. Add the
   productive-use docstring and `@verifies(SWR.SWR_<n>)`; confirm every product
   SWR has a qualifying hermetic public-boundary E2E flow. A test that would pass
   without the implementation is a red flag.
5. Set `status: approved` in the requirement's frontmatter **in the same change**
   as the annotations, and update the epic's index table. An approved requirement
   without annotations is a verifier error (unless baselined).
6. Run `check --fix`, then `check`; fix every violation.
7. Commit requirement docs + `swr.py` + baseline + code + tests as **one unit**
   with the requirement id in the message.

## Flow B — Writing tests that cover a requirement

- Follow the
  [product-centred test strategy](../../../docs/testing/test_strategy.md) and the
  repository conventions in [`tests/AGENTS.md`](../../../tests/AGENTS.md).
- Annotate the covering test `@verifies(SWR.SWR_<n>)`; it must exercise the traced
  code's actual behavior.
- Confirm each affected product SWR has a qualifying hermetic user-flow E2E test.
- If you pay off baselined debt, prune it: `check --update-baseline`.

## Flow C — Editing requirements / reacting to a signal

Activates on: verifier errors, failing `tests/unit/reqtocode/` meta-tests,
`AttributeError` on a removed `SWR_<n>` symbol, `DeprecationWarning` on a
reference, a hook-rejected commit, or **any edit under `docs/requirements/`**.

Run `python -m rotaris_core.reqtocode diff` first, then follow the playbook's
§Procedure end to end. Do not improvise a shorter path.

## Flow D — Supplementary code with no product requirement

Triggered when you write code (or a test for it) that no existing `SWR-<n>`
covers: internal helpers, a refactor's new seam, plumbing, tooling, performance
work. Do **not** leave it orphaned or force-fit an unrelated requirement.

1. Identify the **originating** requirement — the product `SWR-<n>` whose work
   made this code necessary. That is the `derived-from` target.
2. Author a **technical requirement** via the `requirement-capture` skill:
   `type: technical`, `derived-from: SWR-<origin>`, next free id in the most
   relevant epic's block, testable statement of *why the code must exist*. Add
   the `Derived from:` body line.
3. **Mirror the link back**: add `Derived requirements: [SWR-<n>](...)` on the
   originating requirement (or its epic index). Bidirectional or it is not done.
4. `@traces` the code, `@verifies` a real test, set `status: approved`, then
   `check --fix` / `check`.
5. Commit requirement + `swr.py` + baseline + code + tests as one unit.

## Hard rules

- Never edit `src/rotaris_core/reqtocode/swr.py` by hand.
- Never leave production code or a test untraced. If no product requirement fits,
  a technical requirement is mandatory (Flow D) — orphan code is spec drift.
- Never silence a violation by deleting annotations, weakening a requirement, or
  adding baseline entries.
- Never bypass the pre-commit hook.
- Never reuse or renumber an `SWR-<n>` id; deprecate instead of deleting.
- pytest regenerates `swr.py` at session start — a requirement edit becomes a
  failing meta-test in the same run; that failure is a work item, not noise.
