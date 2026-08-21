---
name: requirement-capture
description: Turn a rough feature idea into a finished requirements-store entry and product-centred test portfolio for this repo. Use when the user wants to describe, create, or materially change an SWR requirement, define acceptance criteria, or plan how a requirement will be tested.
---

# Requirement Capture

Use this skill when someone wants to turn an informal feature idea into a structured requirement document for this repository.

## Goal

Produce requirement files that match the repository's requirements-store format (YAML-frontmatter `SWR-<n>` files inside an epic folder, plus an epic index update) and can be added directly under `docs/requirements/`. See `docs/requirements/README.md`.

## Two kinds of requirement

- **Product requirement** — a user-facing behavior or constraint. The default.
- **Technical requirement** — supplementary code no product requirement covers on
  its own (helpers, refactors, plumbing, tooling) but that some product
  requirement *needs*. Under ReqToCode such code is never left orphaned. Its
  frontmatter fields and the mandatory bidirectional link are specified in
  [README §"Technical requirements"](../../../docs/requirements/README.md#technical-requirements-derived--supplementary);
  follow that section rather than reconstructing it.

## Workflow

1. Start from the repo template and the closest existing requirement examples.
2. Read the
   [product-centred test strategy](../../../docs/testing/test_strategy.md).
3. Restate the feature in plain language and identify the minimum set of unknowns.
4. Ask only the clarifying questions needed to finish the requirement cleanly.
5. Model the productive unit/integration/user-flow E2E portfolio before implementation.
6. After each answer, tighten the draft and keep the structure aligned to the template.
7. Finish with a requirement document that is ready to save, review, or copy into the repo.

## Clarify These Areas

Ask about the parts that affect the requirement text and acceptance criteria:

- The user-facing outcome or problem being solved
- Scope boundaries and explicit non-goals
- Who the feature is for
- Whether the requirement is new (`draft`), implemented (`approved`), or superseded (`deprecated`)
- Success criteria and observable behavior
- Edge cases, error handling, and compatibility constraints
- Dependencies, follow-up work, or known tradeoffs
- How the requirement should be verified

If the feature is still vague, ask the smallest question that unlocks the next draft rather than a long questionnaire.

## Drafting Rules

- Use the repository's requirement template structure.
- Keep the title short and specific.
- Write the description as a testable statement, not a marketing sentence.
- Take ID assignment, frontmatter field semantics, and `status` honesty from
  [README §ID convention / §Frontmatter / §Lifecycle](../../../docs/requirements/README.md).
  New captures are `draft` — `approved` is only for code that already carries
  `@traces`/`@verifies`.
- Put implementation notes in notes, not in the requirement statement.
- Separate facts from assumptions. If something is inferred, say so.
- Include acceptance criteria that can be observed or tested, and a definition of
  done that reflects the repo's workflow.
- Fill the test-portfolio table from `TEMPLATE.md` per
  [README §Product test portfolios](../../../docs/requirements/README.md#product-test-portfolios).
- Every requirement edit creates code obligations enforced by
  `python -m rotaris_core.reqtocode check` (see `docs/reference/reqtocode-playbook.md`).
  Name the touched `SWR-<n>` ids in your final output.

## Output Shape

When the requirement is ready, provide:

- The finished requirement content in the repo's format
- Any open questions that remain unresolved
- A short note on which epic the requirement belongs to and its frontmatter `status`

## Quality Check

Before finishing, confirm that:

- The problem statement is clear
- The scope is bounded
- The requirement rows are testable
- The acceptance criteria are observable
- Productive action, expected outcome, exercised boundaries, and E2E flow are explicit
- The frontmatter `status` matches the actual maturity of the feature
- Nothing important is left implicit
