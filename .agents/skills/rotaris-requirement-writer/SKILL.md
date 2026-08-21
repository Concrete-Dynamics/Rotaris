---
name: rotaris-requirement-writer
description: Create or refine a Rotaris requirement document from a rough feature description. Use when the user describes a Rotaris feature, bug-driven change, architecture change, UI behavior, provider/model behavior, agent workflow, or follow-up requirement and wants a requirement file for the docs/requirements/ store.
---

# Rotaris Requirement Writer

Requirements live in the **`docs/requirements/` SWR store**, not in a dated
requirement log. Follow the canonical sources rather than inventing a format:

- [`docs/requirements/README.md`](../../../docs/requirements/README.md) — store
  layout, frontmatter fields, epic hundreds-blocks, technical requirements.
- `docs/requirements/TEMPLATE.md` — the structural baseline for a new file, plus
  the product test-portfolio table.
- [`docs/testing/test_strategy.md`](../../../docs/testing/test_strategy.md) —
  model the unit/integration/hermetic user-flow E2E portfolio before implementation.
- [`docs/reference/reqtocode-playbook.md`](../../../docs/reference/reqtocode-playbook.md)
  — every requirement edit creates code obligations; run
  `python -m rotaris_core.reqtocode diff` after writing.

## Operating rules

- Ask at most three focused questions, and only about gaps that change the
  requirement contract: the actor and user-visible outcome, the owning surface
  (desktop, TUI, agent runtime, config, persistence, provider), explicit
  non-goals, what counts as done, and which existing requirement this depends on,
  supersedes, or conflicts with.
- If the user wants momentum, make reasonable choices, state the assumptions, and
  proceed.
- Assign the next free `SWR-<n>` in the target epic's block. Never reuse or
  renumber an id; deprecate instead of deleting.
- New captures are `status: draft`. `status: approved` is reserved for
  requirements whose code already carries `@traces`/`@verifies`.
- Supplementary code with no product requirement gets a technical requirement
  (`type: technical`, `derived-from: SWR-<origin>`) with the `Derived from:` body
  line **and** the reciprocal `Derived requirements:` link on the origin.
- Write the description as a testable statement; keep implementation notes out of
  the requirement statement.

## Output

Show the target path (`docs/requirements/<block>-<epic>/SWR-<n>-<slug>.md`) and
the full file content before writing, then update the parent epic's index table.
Keep commentary outside the artifact so it stays copy-pasteable.
