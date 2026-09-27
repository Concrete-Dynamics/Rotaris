## `delegate` drops `session_id` and `suppress_auto_context`

The `delegate` tool's schema accepts `session_id` and `suppress_auto_context`, and `execute` never forwards either:
`DelegateRequest` has no field for them, and every child runs with `delegationSessionId: null` and the automatic context
it would have got anyway. A caller that sets either is told nothing and gets the default.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-TOOLS-152` lists both as `delegate` fields (`session_id`: "reuse a previous delegation's session for a retry or a
follow-up"). Neither has any effect. What reusing a session would mean is itself undefined; OQ-66 recorded that.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — the schema and `execute`.
- `packages/engine/src/children/delegation.ts` — `DelegateRequest`.
- `packages/engine/src/sessions.ts` — `delegationSessionId: null`.
