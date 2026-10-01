## A call the tool gate refuses before execution files no `tool_error` issue

The gate can refuse a tool call before any executor sees it, in three cases: the tool name is unknown, the arguments
cannot be read as JSON even after repair, or they fail the tool's schema (with or without the tool's own diagnostic).
Each such call is settled `failed`, `is_error`, `failure_kind: invalid_request` in the tool-call record, but no issue
is filed for it. All four returns go through `finish`, which settles the evidence record and nothing more.
REQ-SESSION-136's outcome-driven issues are filed by `outcomeIssues`, which runs only after an executor has produced
an observation. A failure an executor raises files `tool_error`, and a policy denial files `permission_denied`
(REQ-TOOLS-081). The gate's own refusals are therefore the only failures missing from the run's issue record, and from
every surface that reads it.

Live-run finding: a71-6

Recorded, not repaired.

## Specs

- `REQ-SESSION-136`: "Outcome-driven automatic issues MUST be filed: … any other failure → `tool_error` (warning); each
  referencing the tool-call record." These calls are failures in the record (`status failed`, `is_error 1`), and no
  issue references them.
- `REQ-TOOLS-032` is met as it stands: the payload is returned as a recoverable error naming the tool and the
  violation, and the call is not executed. The requirement says nothing about the issue record, so it does not except
  these calls from REQ-SESSION-136.

## Evidence

- Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/` (the `accept` worktree; git-ignored), session `57095770`: #126
  (design-decisions, `write_file`, 03:23:41.766) and #244 (verify-result, `write_file`, 04:03:17.261) are each `failed`,
  `is_error 1`, `failure_kind invalid_request`, refused with "write_file requires an operation…". The `issues` table holds
  19 rows and none references either call. Executor-raised failures in the same run each have one: issues 2, 4, 5, 12,
  and 14 to 19 are `tool_error`.
- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/`, session `fe3884f7` (`frictions`): the `todo` failures #1 and
  #8, raised by the executor, filed issues 1 and 2 (`tool_error`).

## Relevant files

- `packages/agent-tools/src/gate.ts:235-239` — `finish`: settles the tool-call record and files no issue.
- `packages/agent-tools/src/gate.ts:287-288` — the unknown-tool refusal.
- `packages/agent-tools/src/gate.ts:290-291` — the unreadable-JSON refusal.
- `packages/agent-tools/src/gate.ts:294-303` — the schema refusal, with the executor's `validationError` diagnostic
  (`:296-301`) or without it (`:303`).
- `packages/agent-tools/src/gate.ts:347-356` — a policy denial, which files `permission_denied` before it returns.
- `packages/agent-tools/src/gate.ts:402` — `outcomeIssues` is called only on the executor's path.
- `packages/agent-tools/src/gate.ts:419-428` — `outcomeIssues`, REQ-SESSION-136's mapping, with `tool_error` at `:427`.
