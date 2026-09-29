## Switching projects routed setup through one global status

Opening project B while project A was still initializing made B's background task fail immediately and raised "Project setup did not finish". The run host held one setup status and refused B's start as though it were a second run for A. Main then mapped that refusal to the unrelated "not a local launch" error. The status push and listener were global too, so A's later steps could be delivered to B. A built-app reproduction switched between two scratch projects while A's `project create` was running and observed exactly that banner.

## Specs

REQ-WORKSPACE-013 requires cancellation of the outgoing workspace without delaying or refusing the replacement's independent resolution. REQ-WORKSPACE-083 starts pending background work on open; REQ-WORKSPACE-103 reserves the failure banner for an actual task failure. REQ-MCP-112's concurrent-run refusal applies to a second start of the same workspace's setup.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts` — setup status, cancellation and start are keyed by workspace root.
- `apps/desktop/src/main/initialization.ts` — setup progress is delivered to the matching workspace task.
- `apps/desktop/src/main/main-windows.ts` and `index.ts` — closing a window cancels that workspace's initialization; publication reaches its own window.
- `packages/contracts/src/process-protocol.ts` — the status event names its workspace root.
