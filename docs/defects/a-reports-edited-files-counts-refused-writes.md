## A report's edited files counts write calls that were refused

`editedFilesFrom` (`packages/engine/src/children/report.ts`) lists the path of every `write_file`, `haet_edit` or `haet`
CALL in the child's transcript, and never reads the result that answered it. A write refused by a sibling's
write-scope claim (`PD-TOOLS-006`), by the permission gate, or a `haet_edit` whose find text matched nothing, still puts
its path in the report's `edited_files` and in the fallback report's "Files touched". Since OQ-111's repair the same list is handed to the summarising pass as the facts, with the
instruction that the summary "must agree with them and never deny them", so a refused write can be pressed into the
summary as work done: the inverse of the denial D1 recorded.

Noticed 2026-09-29 by the verification of the D1 repair (branch `fix-child-report`); recorded, not repaired.

## Specs

- The specification's child-report schema (`docs/spec/01-run-orchestration.md`, "edited files (path, change type,
  commit hash)"): a file the child tried and failed to write was not edited.
- `REQ-ORCH-108` (parents consume the report in place of the transcript) and `REQ-ORCH-109` (the report's facts are
  runner-owned): a parent reading the report is told of an edit that did not happen.
- `OQ-111`'s ruling, "a report never denies work the record shows": the record shows the refusal too.

## Relevant files

- `packages/engine/src/children/report.ts` — `editedFilesFrom`, which reads calls and not results; `reportFacts`, which
  hands its list to the pass; `fallbackReport`, which lists it as "Files touched".
- `packages/engine/src/children/write-scope.ts` — `WriteClaims.refusalFor`, one source of a refused write.
