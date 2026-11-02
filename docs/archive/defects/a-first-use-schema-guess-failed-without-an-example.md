## A first-use schema guess failed with the field list but no example to copy

Observed live 2026-09-18, run `cc6191a2` (logged as R-039): the run's first uses of `ask_questions`
(`questions` instead of `steps`), `write_file` (missing `operation`), and `haet_edit` (missing `path`)
each failed schema validation and self-recovered on the retry — three wasted model turns carrying the
same shape information twice.

The gate is faithful — REQ-TOOLS-032's repair-then-refuse stands — and what was missing is only what the
refusal carries: the `validationError` hook now returns the expected shape WITH a minimal example for
exactly the mistake made (the `questions`→`steps` redirect names the old field; the write-file refusal
lists the per-operation fields; the haet refusal shows the 64-hex hash), so the retry is a copy rather
than a second guess.

## Specs

No requirement contradicted — a refusal-shape improvement inside the REQ-TOOLS-032 contract.

## Relevant files

- `packages/agent-tools/src/tools/questions.ts` — `askQuestionsTool.validationError`.
- `packages/agent-tools/src/tools/files.ts` — `writeFileTool`/`haetEditTool.validationError`.
- `packages/agent-tools/src/gate.test.ts`, `questions.test.ts`, `tools.test.ts` — the hook tests.

Noticed 2026-09-18 by the run-autopsy of run `cc6191a2`; repaired on the same branch.

*Confirmed landed and filed 2026-09-22: `askQuestionsTool.validationError` is in
`packages/agent-tools/src/tools/questions.ts:202`, with the write-file and haet hooks beside it in
`files.ts`. The note recorded its own repair and was never moved.*
