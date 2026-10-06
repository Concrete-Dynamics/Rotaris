/**
 * The live run's reading of REQ-SESSION-136 for the calls the tool gate refuses before any executor runs them
 * (`apps/desktop/scripts/live-run.mjs`, over every session the run keeps since fin23, through `runWideReadings` in
 * `lib/tool-frictions.mjs`; before, the `frictions` and `duress` scenarios only). An unknown tool name, arguments that
 * cannot be read as JSON, and arguments that fail the tool's schema are each settled `failed`, `is_error`,
 * `failure_kind: invalid_request` (REQ-TOOLS-032), which makes each REQ-SESSION-136's "any other failure": it files a
 * `tool_error` issue referencing its tool-call record, `tool_call_evidence#<call id>`.
 *
 * The duress run of 2026-10-01 (pack `.live-run/runs/2026-10-01T03-15-27-194Z`, session `57095770`) held two such
 * calls, ordinals 126 and 244, and no issue named either (live-run finding a71-6,
 * `docs/defects/fixed/a-call-refused-at-the-tool-gates-schema-check-files-no-tool-error-issue.md`).
 *
 * Nothing here is product code. It runs only from the live run.
 */

/**
 * The gate's `invalid_request` refusals among `calls`, and those of them no `tool_error` issue references. A call is
 * `{ ordinal, tool_name, status, callId, failureKind }` as `readToolCalls` reads it; an issue is `{ kind, evidence_ref }`.
 */
export function refusalIssues(calls, issues) {
  const filed = new Set(issues.filter((issue) => issue.kind === 'tool_error').map((issue) => String(issue.evidence_ref ?? '')));
  const refused = calls.filter((call) => call.failureKind === 'invalid_request' && call.status === 'failed');
  const unfiled = refused.filter((call) => typeof call.callId !== 'string' || !filed.has(`tool_call_evidence#${call.callId}`));
  return { refused, unfiled };
}
