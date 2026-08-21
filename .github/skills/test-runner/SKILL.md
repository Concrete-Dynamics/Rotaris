---
name: test-runner
description: Design, write, change, review, run, or validate product-centred tests in Rotaris. Use for unit, integration, hermetic user-flow E2E, capability, Rotaris, Textual, ReqToCode test coverage, or test-related validation work.
---

# Test Runner

Follow the [product-centred strategy](../../../docs/testing/test_strategy.md) —
it is canonical policy and owns the workflow for test changes (steps 1–6 at the
end of that document). Take fixtures, locations, naming, and commands from
[test conventions](../../../tests/AGENTS.md). For Textual work also read the
[TUI guide](../../../docs/testing/textualize_testing_guide.md); for Rotaris
desktop work read the [desktop instructions](../../../apps/rotaris/AGENTS.md).

## Copilot execution

Configure the repository Python environment through Copilot's Python tools when
available, then invoke the discovered interpreter with `-m pytest`, `-m ruff`, or
`-m mypy`. Do not embed a checkout-specific path. Run ReqToCode `diff`,
`check --fix`, `check`, and `diff --strict` whenever requirement-store content
changes.
