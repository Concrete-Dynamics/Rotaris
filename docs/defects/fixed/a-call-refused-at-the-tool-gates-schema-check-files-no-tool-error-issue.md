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

Recorded 2026-10-01 from the live-run autopsy at 71ad8e8.

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

## Repaired — 2026-10-01

`Gate.dispatch` sends its three `invalid_request` refusals — an unknown tool name, arguments unreadable as JSON after
repair, and arguments that fail the tool's schema (with the tool's own `validationError` diagnostic or the gate's
generic text) — through one `refuseInvalid`, which settles the tool-call record exactly as before and then files
REQ-SESSION-136's "any other failure" through the same `outcomeIssues` an executor's observation takes: one `tool_error`
warning referencing `tool_call_evidence#<call id>`, its metadata carrying `failure_kind: invalid_request`. REQ-TOOLS-032's
answer is unchanged: the call is not executed and the model reads the same text. The gate's other refusals — the plan
gate, a write scope, a hook's stop, a withdrawn approval — settle `blocked`, not `failed`, and still file none; a deny
still files its own `permission_denied`.

Pinned in `packages/agent-tools/src/gate.test.ts`: "REQ-SESSION-136: each call the gate refuses as invalid_request files
one tool_error issue referencing its tool-call record" (the duress run's `write_file` without `operation`, a generic
schema refusal, unreadable JSON and an unknown name; red on the code before), and "a refusal that is not a failure — the
plan gate's `blocked` — files no issue".

**Shown live.** The live run gained the check "every call refused at the tool gate as invalid_request filed a tool_error
issue referencing it" in its `frictions` and `duress` scenarios (`apps/desktop/scripts/lib/refusal-issues.mjs`, pinned
against this note's duress pack in `refusal-issues.test.ts`; a run with no such refusal reads as a NOTE). *fin23,
2026-10-06:* since `760394c` the check runs no longer in those two scenarios but once, at the run's end, over every session
the run keeps (`checkToolRecord` in `apps/desktop/scripts/live-run.mjs`, over `runWideReadings`); the default run at
`c2a9444` held such a refusal in its requirements session, ordinal 62, which the two scenarios' check never read
(`docs/defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`). `--only=frictions`
on the built branch against `katalyst` (pack `.live-run/runs/2026-10-01T14-50-35-317Z` of the
`Rotaris-crw-wt-fin1-toolresultsa` worktree; git-ignored) passed it: the child's first `write_file` (ordinal 6, no
`operation`) was refused `invalid_request` and filed issue 6, `tool_error`, `tool_call_evidence#chatcmpl-tool-84787a147482a68c`.
`--only=duress` was not run for this repair: another builder's duress run held the host and the endpoint for its whole
window; the acceptance plan's duress run reads the same check.
