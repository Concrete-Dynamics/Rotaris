## `plan-gate-proof` turns code intelligence off with a key nothing reads, then reads the gate at a fixed offset

`apps/desktop/scripts/plan-gate-proof.mjs` writes this into its global `agents.yaml`, with a comment saying it turns
`code_intelligence` off "because this proof measures run starts and its discovery costs about 4.5 s of each one":

```yaml
code_intelligence:
  enabled: false
```

No section of the configuration is named `code_intelligence`. The server is an entry under `mcp_servers:`, and every
other proof that turns it off writes `mcp_servers:` / `code_intelligence: { enabled: false }` (`artifacts-proof`,
`chat-controls-proof`, `composer-proof`, `compression-proof`). The top-level key is kept as an unknown key and does
nothing. Every run the proof starts therefore discovers the built-in `code_intelligence` server before the entry
role's first model call.

The first launch ("held") reads the gate at fixed offsets: `inspect-at` at 12,000 and 12,200 ms, and `text-at` at
12,400 ms. On the Linux sweep of 2026-09-28 (the bundled runtime present, a quiet host), the workspace's background
`code-intelligence-setup` ran `project create` for 10.4 s. The run's discovery of the same server took 11.1 s, and
the orchestrator's first scripted call came at 23:40:35.061, after all three readings. The readings found no gate,
and the proof threw "the session is running, not awaiting_plan_decision". In a tree where discovery took 2.3 s, the
same launch reached the gate with 9 s to spare. The second launch reads "Plan ready for your decision" at a fixed
6,000 ms and edits the plan at a fixed 7,000 ms, the same shape.

The first launch's surface assertion, `/plan-gate/.test(log1)`, cannot fail. The log always carries the `inspect-at`
line, and that line names the selector `[data-testid="plan-gate"]` whether it matched or not.

The sweep's second run failed differently, and that failure is not this note's. The relaunch was refused with
"Session … is held by another run in this application (pid 1360)", pid 1360 being the previous instance's run host.
The sweep tree (392f681) predates `459e7c8`, which makes main exit only after its run host
([the note](fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
On a tree with that repair, every launch of this proof logs `run host exited` before `main process exiting`.

## Specs

The product contradicts none. The proof stands for REQ-ORCH-152, REQ-ORCH-153 and REQ-ORCH-154, and each of them held
on every run that reached the gate. The fault is the harness's: a stale configuration key, fixed offsets, and one
assertion that can never fail.

Beside it, an unanswered reading. With `code_intelligence` disabled, `code-intelligence-setup` is still applicable
and still runs in the background. REQ-WORKSPACE-090 makes applicability exactly REQ-MCP-037's availability rule,
and that rule never mentions `enabled`. Raised as an open question, not changed here.

## Relevant files

- `apps/desktop/scripts/plan-gate-proof.mjs`: `GLOBAL`'s `code_intelligence:` key; launch 1's `INSPECT_AT` and
  `TEXT_AT` offsets and its `/plan-gate/` assertion; launch 2's `TEXT_AT` and `EVAL_AT` offsets.
- `packages/config/src/mcp/defaults.ts`: the built-in `code_intelligence` entry under `mcp_servers`.
- `apps/desktop/src/run-host/mcp.ts`: `setupApplicable`, the availability verdict, which ignores `enabled`.
- `apps/desktop/src/main/capture/seams.ts`: `INSPECT_AT` and `EVAL_AT` take the `@~` deadline form, and `TEXT_AT` does not.

Noticed and diagnosed 2026-09-28, by the Linux proof sweep under R-062.
