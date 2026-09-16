## The shipped `web_search`, disabled by default, warned twice per launch about its unresolved placeholder

`resolveRemoteUrl` emits REQ-MCP-088's unresolved-placeholder diagnostic for every `${VAR}` a remote
URL still holds. For a disabled entry it already restricted the **channel** to the log, which is half
of what REQ-MCP-040 asks. The diagnostic stayed a `warning` in the `load` scope, so two things
followed: the run host logs any non-info severity at warn level, and `newLoad()` clears the load scope
between loads — and a launch performs two (workspace open, run start). The shipped `web_search` entry
is `enabled: false` with `${ROTARIS_SEARCH_API_KEY}` unset, so every launch warned twice about a key
the user was never asked for:

```
run host warn: mcp: mcp web_search: the placeholder ${ROTARIS_SEARCH_API_KEY} in its url could not
be resolved from a stored secret or the environment; the server is configured but unavailable until
it is (REQ-MCP-088, REQ-CONFIG-225)
```

Observed on 2026-09-16, session `6696f6ed`. The REQ-CONFIG-465 line beside it — `persona <p>: MCP
server 'web_search' is disabled by its configured 'enabled: false'; skipped` — repeated for a
different reason: it carried an **empty** de-duplication key, and an empty key is delivered every time
it is produced.

## Specs

- `REQ-MCP-040` — a disabled server "SHALL produce no warning and no session issue". A warning in the
  log is still a warning, and the severity is what the run host reads to decide the level.
- `REQ-CONFIG-181` — an unsupplied key is a state, not a fault. `REQ-CONFIG-225` renders the entry as
  present-but-unavailable, which is where a user learns of it.
- `REQ-MCP-088` — the placeholder stays literal and the fact is recorded. Both still happen; for a
  disabled entry it is recorded as information, once per process.

## Relevant files

- `packages/config/src/mcp/environment.ts` — `resolveRemoteUrl`: an enabled entry keeps the
  user-channel warning in the `load` scope; a disabled one produces `info` in the `process` scope
  under the same key.
- `packages/config/src/mcp/persona.ts` — the REQ-MCP-040 disabled line gains
  `mcp.disabled.<persona>.<server>` so one process says it once.
- `packages/config/src/mcp/diagnostics.ts` — the scope rules this leans on, unchanged.

## Repaired — 2026-09-16

Regression test: `packages/config/src/mcp/mcp.test.ts`, in "a remote url substitutes substrings,
secret before environment, and warns on an unresolved one" — the enabled entry keeps
`severity: 'warning'`, `scope: 'load'`, `channels: 'user'`; the disabled one is `info` in the
`process` scope under the same key, and produces no warning-severity diagnostic at all.
