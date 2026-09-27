## Hook faults reach only the session log, at a level it drops by default

The hook engine reduces a fault that has no warning of its own to a log entry through its `log` sink, and both
ports that carry that sink say where it goes: `HookSinks.log` (`packages/hooks/src/engine.ts`) and
`HookPortContext.log` (`packages/engine/src/hooks-port.ts`) are documented "The application log only." `Sessions`
wires it to neither. At both run-construction sites (`packages/engine/src/sessions.ts`, the run start and the
continuation) it is `(m) => { log?.info(m); }`, where `log` is the session's `SessionLog` — the per-session log of
REQ-SESSION-142 — and the line is written at `INFO`. That log's level is `session_log_level`, `WARNING` by default,
so the line is dropped. With the default configuration a hook fault that reduces to a log entry is recorded nowhere.

The lines affected are the engine's own: a withheld announcement that could not be published, a payload that could
not be built, a `hook_run` entry or `hook_failure` issue that could not be written, a hook event that could not be
published; and `createHookPort`'s account of why the hook set could not be resolved (`apps/desktop/src/run-host/hooks.ts`),
which reaches the user separately as the load warning. The checkpoint port's `log` is wired the same way; its port
does not say which log it means.

Noticed 2026-09-27 while building `PD-MONITOR-002`, whose audit asked where each line REQ-HOOKS-138 admits to the
application log is written. Established by reading the wiring; not measured on a run with a failing hook.

## Specs

- `REQ-HOOKS-079`, `REQ-HOOKS-128`, `REQ-HOOKS-129`: these faults "reduce to a log entry". Which log is not said.
  The ports say the application log, and at the default configuration the entry is not written at all.
- `REQ-HOOKS-138`: the surfaces hook activity may reach are "exactly these and no others", the application log among
  them. The per-session log is not in the list, and it is where these lines go.
- `PD-MONITOR-002`: a line another requirement obliges into the application log is written at `info` or above. Rerouting
  these lines to the application log would meet it with no further change; left where they are, the directive's
  threshold never sees them.

## Relevant files

- `packages/engine/src/sessions.ts`: the two `this.deps.hooks({ …, log: (m) => { log?.info(m); } … })` calls, and the
  two `checkpointPortFor` calls beside them.
- `packages/engine/src/hooks-port.ts`: `HookPortContext.log`, "The application log only."
- `packages/hooks/src/engine.ts`: `HookSinks.log`, the same sentence, and the six call sites that write through it.
- `apps/desktop/src/run-host/hooks.ts`: `createHookPort`, which passes `ctx.log` on as the sink.
- `packages/engine/src/session-log.ts`: `SessionLog`, and the `WARNING` default that drops an `INFO` line.
