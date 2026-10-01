## A child's recorded MCP grant keeps a tool a mid-run list update withdrew

A child's row records its MCP grant once, when its tool port is ready (`ChildLedger.recordGrant`). When a server then
changes its tool list mid-run, REQ-MCP-060 recomputes and only narrows: the port deletes the withdrawn tool's executor
from the callable map and logs the withdrawal (`McpHost.executorsFor`'s `onToolsChanged`, `remove`). The row's
`granted_mcp` is never rewritten, so the inspector (REQ-MCP-114) and the persona window (REQ-MCP-100) still list the
withdrawn tool as granted for the rest of the run and for the finished run. The prompt is deliberately not re-rendered
(REQ-MCP-060); the record is a different reader.

Noticed 2026-10-01 while repairing `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md` (fin2).
Not reproduced in a built app (mcp-proof's launch 4 narrows the run-level agent, whose grant is not recorded on a row).

**Open with the owner as OQ-174** (raised 2026-10-01, fin3): whether the recorded grant keeps a tool a server withdrew
mid-run, drops it, or marks it withdrawn is the owner's to rule, since the specification says "granted" for what
configuration allows and "callable" for what an update leaves. The build proceeds under the grant at readiness, the
behaviour this note describes ([`open-questions.md`](../architecture/open-questions.md), OQ-174). The note stays open
until that ruling is built.

## Specs

- `REQ-MCP-065`: a child's persisted state records its granted MCP tools per server. A tool REQ-MCP-060 withdrew is no
  longer callable. Whether "granted" means the grant at readiness or the grant still in force is not stated. The reading
  that the record follows what the agent can call would rewrite the row on a withdrawal.
- `REQ-MCP-060`: a mid-run update may only remove a callable name; the prompt is not re-rendered.
- `REQ-MCP-114`: the inspector's per-server list is sourced from the run's recorded evidence.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts`: `executorsFor`'s `watch`/`onToolsChanged`, which calls `remove` and logs.
- `apps/desktop/src/run-host/tools.ts`: `createToolPort`'s `remove` and `grant`, set once in `ready()`.
- `packages/engine/src/children/orchestration.ts`: `recordGrant`, once per execution.
