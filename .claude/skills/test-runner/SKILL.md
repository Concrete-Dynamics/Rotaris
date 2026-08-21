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

## Claude execution

Use `uv run` from the repository root for Python tools unless
`tests/AGENTS.md` specifies a narrower command. Run ReqToCode `diff`,
`check --fix`, `check`, and `diff --strict` whenever requirement-store content
changes.

Default to a **focused selection while developing a slice** — the test file,
node id, or `-k` expression covering the requirement in hand — and iterate
there. Run the **full suite once as a final pass**, after the slice is
otherwise complete and before reporting it done; if it fails, debug against a
focused re-run rather than the whole suite. The rule and its rationale live in
the [strategy](../../../docs/testing/test_strategy.md#focused-during-development-full-suite-as-the-final-pass);
the selections are in [test conventions](../../../tests/AGENTS.md#selecting-a-focused-run).
