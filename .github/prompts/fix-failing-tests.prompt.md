---
description: "Use when: tests are failing and need diagnosis — fix the code if the feature is broken, fix the test if the test is wrong. Distinguishes code bugs from faulty/incomplete tests."
agent: "Agent+"
argument-hint: "Which tests are failing? (file path, test name, or paste failure output)"
---

You are fixing failing tests in the Rotaris project. Your core principle: **fix the right thing**.

## Decision Rule

| Failure looks like…                                                      | Root cause                        | Action                                                 |
| ------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------ |
| Test assertions don't match actual behavior, but the behavior is correct | Faulty / incomplete test          | **Fix the test**                                       |
| Test assertions are correct, but the code produces wrong output          | Broken feature                    | **Fix the code**                                       |
| Test uses outdated API / changed signature after a refactor              | Stale test                        | **Fix the test** to match current API                  |
| Code raises an exception the test didn't expect                          | Broken feature (or missing guard) | **Fix the code**                                       |
| Test makes unwarranted assumptions about internal state                  | Over-specified test               | **Fix the test** — loosen or remove brittle assertions |

## Workflow

1. **Reproduce**: run the narrowest failing selection, e.g.
   `uv run pytest tests/unit/test_module.py -k "test_name" -v`.
2. **Classify**: Read the test and the code under test. Determine whether the failure is a code bug or a test bug per the table above.
3. **Trace**: For code bugs, trace the root cause through the call chain. For test bugs, identify which assertion is wrong and why.
4. **Fix**: Make the minimal targeted change — one file at a time.
5. **Verify**: Re-run the failing test(s) — still the narrowest selection — and
   iterate there until green. Then, as a single final pass, run the suite that
   owns them (`tests/unit/`, `tests/integration/`, or `apps/rotaris/tests`) plus
   lint, to confirm the fix caused no regressions. Do not use the full suite as
   your debugging loop.

## Project Conventions

Do not work from memory — the conventions live in two files and are not repeated here:

- [`tests/AGENTS.md`](../../tests/AGENTS.md) — test naming, fixtures, mock
  patterns, async mode, and the gotchas (intentional hardcoded secrets,
  `LocalConversation` patch site, `respx`).
- [`AGENTS.md`](../../AGENTS.md) — runtime/orchestration and import-boundary
  rules that a "fix" can easily violate, plus the exact lint, format, typecheck,
  and test commands in [§Commands](../../AGENTS.md#commands).

## Important

- **Never** change both the code and the test at the same time unless you are certain both are wrong in complementary ways. Prefer one fix.
- When a test is over-specified (asserting internal implementation details), loosen it — don't cement the implementation.
- If you cannot determine whether the code or the test is wrong, explain the ambiguity and ask.
- After fixing, always run the lint gate to catch import or style regressions.
