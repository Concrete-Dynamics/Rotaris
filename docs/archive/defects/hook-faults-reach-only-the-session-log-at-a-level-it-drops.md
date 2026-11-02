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

## Repaired 2026-09-28 ([R-062](../../product/requests.md#r-062))

`Sessions` gains an optional `SessionsDeps.log` — the application log at `info` (`PD-MONITOR-002`), which the run host
fills with its `log {level: 'info'}` event (`apps/desktop/src/run-host/host.ts`) — and both hook-port construction sites
(`packages/engine/src/sessions.ts`, the run start and the continuation) hand it on as `HookPortContext.log` in place of
`log?.info(m)`. The engine's six `sinks.log` writes and `createHookPort`'s account of an unresolvable set therefore reach
main's standard output at a level its default threshold keeps, and the per-session log no longer receives them. The
three ports' doc comments (`HookSinks.log`, `HookPortContext.log`, `CheckpointPortContext.log`) now say which log and
why. No message kind was added: the `log` event already crossed the run-host → main boundary; `Sessions` had reached it
only as `warn`.

**The checkpoint port's `log`, decided.** `CheckpointPortContext.log` stays the per-session log of REQ-SESSION-142 at
`INFO`. Its root (`apps/desktop/src/run-host/checkpoints.ts`) already writes every checkpoint line to both logs — the
session's through `ctx.log`, the application's through its own `CheckpointRootDeps.log` — and none of those lines is one a
requirement obliges into the application log, so rerouting `ctx.log` would only have doubled them there.

**Pinned by** `packages/engine/src/run/hooks.test.ts` — "REQ-HOOKS-138 / PD-MONITOR-002: a hook fault that reduces to a
log entry reaches the application log, and the session log does not receive it — at the run start and at a continuation"
(the session log open at `DEBUG` throughout, so a misrouted line would be kept and seen) and "a host that supplies no
application log loses the line rather than having it fall to the session log"; both red under the wiring this note
describes (2 failed, 5 passed with `sessions.ts` checked out from `main`), green with the repair. And by
`apps/desktop/src/run-host/hooks.test.ts`, new — the load account of REQ-HOOKS-085 on `ctx.log` and not on the warning
channel, and REQ-HOOKS-128's withheld-announcement line, id and never command, through the engine's sink on a real store
closed underneath the writer. Still not measured on a driven run with a failing hook: no proof covers hooks.
