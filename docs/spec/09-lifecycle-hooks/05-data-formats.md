# User-Defined Lifecycle Hook Commands — Configuration (YAML)

Part 5 of 6 of [domain 09](../09-lifecycle-hooks.md), which indexes every part.

## Data & Formats

### Configuration (YAML)

Declared under `hooks:` in `agents.yaml` at either scope. The entry's field set, each field's type, whether it is required, and its default are fixed by REQ-HOOKS-008 and the event names by REQ-HOOKS-001; the block below illustrates them and adds nothing to them. Both spellings are equivalent:

```yaml
hooks:
  enabled: true            # feature on/off, default true
  entries:
    - event: pre_tool      # one of the seven event names
      command: "./check.sh"
      name: "Guard"        # optional display label
      matcher: "git push *" # optional; empty = every occurrence
      timeout_seconds: 60.0 # > 0; default 60.0
      required: false
      enabled: true
```

```yaml
hooks:                     # list shorthand
  - event: session_end
    command: "notify-send done"
```

Scopes: built-in defaults, then `agents.yaml` in the per-user configuration directory (global, REQ-CONFIG-001), then `<workspace>/.rotaris/agents.yaml` (workspace). Both directories are addressed by their current names only; no earlier or alternative directory name is looked for, adopted, or migrated from.

### Hook stdin payload (JSON, UTF-8, one object)

Tool events:

```json
{
  "event": "pre_tool",
  "tool_name": "terminal",
  "arguments": { "command": "git push origin main", "token": "***" },
  "session_id": "<id>",
  "workspace": "<absolute path>",
  "command": "git push origin main"
}
```

- `command` is `""` for tools with no shell command; for a file-editing tool the text matched against is the requested action name (`create`/`edit`/`overwrite`/`insert`/`undo`).
- Tools provided over MCP place their fields under `arguments.data`.
- `post_tool` adds `result`: `{"observation": "<text>"}` or `{"error": "<text>"}` (object or array; at most 4096 characters per text, with a truncation marker).

Lifecycle events: always `event`, `session_id`, `workspace`, plus that event's own top-level fields (REQ-HOOKS-075). Event data cannot replace those three base keys.

Every string at every level is masked by the shared redaction pass of REQ-TOOLS-171, over the key-name test of REQ-TOOLS-172, as REQ-HOOKS-061 and REQ-HOOKS-062 apply them to the payload.

### Trust decision file

The path, the four keys and the serialization are fixed by REQ-HOOKS-096; the block below illustrates them and adds nothing to them:

```json
{
  "decided_at": "2026-08-29T12:00:00+00:00",
  "digest": "<64 lowercase hex chars>",
  "trusted": true,
  "version": 1
}
```

`decided_at` is a timezone-aware UTC ISO-8601 value ending `+00:00`. Any file that is not exactly version 1 and correctly shaped reads as not approved (REQ-HOOKS-094).

The `digest` value is the workspace hook fingerprint of REQ-HOOKS-091, which is the single definition of the digest algorithm, of the canonical document it is taken over, and of what does and does not change it; this appendix holds no copy of any of them.

### External-hooks policy file

The path, the document shape and the toggle semantics are fixed by REQ-HOOKS-115 and REQ-HOOKS-116; the block below illustrates them and adds nothing to them. `<config-dir>/external-hooks.json`, where `<config-dir>` is `ROTARIS_CONFIG_DIR` when set to a non-blank value and the per-user global configuration directory of REQ-CONFIG-001 otherwise:

```json
{
  "agents": { "claude-code": true, "rotaris": true },
  "hooks": { "claude-code:<20 hex>": false, "workspace:0:pre_tool": false },
  "version": 1
}
```

Keys sorted, two-space indentation, trailing newline, atomic write; a missing or malformed file means everything on; ids not mentioned default to on; a hook runs when its agent and its own toggle are both on. Agent ids: `rotaris` for this product's own hooks, `claude-code` for imported ones.

### Session diagnostics

The records named below belong to the session and this domain fixes no path, file name or directory for any of them; where a session's record is held is REQ-SESSION-001's and REQ-SESSION-198's, and the closed set of files a session still keeps is REQ-SESSION-002's. What follows states only what this domain records into them. Each is reachable outside this application through the export of REQ-SESSION-199, which is why the masking rule of REQ-HOOKS-133 binds every one.

- The launch audit (REQ-SESSION-138): `"hooks": [ {hook_id, name, event, matcher, source, command}, ... ]` — enabled set only, commands masked, explicit `[]` when there are none.
- The timeline (REQ-SESSION-134): one `hook_run` entry per completed invocation (fields per REQ-HOOKS-119). `exit_code` is `-1` where the hook produced no exit status.
- The issue record (REQ-SESSION-135): `hook_failure` entries for outcomes carrying a warning; a `hook_trust` entry (metadata `blocked`, `restored`, `workspace`) when the gate withheld hooks.

### Wire events (session stream)

- `hook.start`: `hook_id`, `hook_name`, `lifecycle_point`, `scope`, `tool_name`, `command` (masked). Published before the process starts.
- `hook.finish`: the same identity fields plus `exit_code` (int|null), `duration_ms` (number|null), `blocked`, `timed_out`, `skipped`, `skip_reason` (the defined values are `"untrusted_workspace"` and `"plan_gate"`, REQ-HOOKS-126), `output` (masked, standard output and standard error joined with `\n`).

### Environment variables

- `ROTARIS_CLAUDE_SETTINGS_PATH` — points at the external agent settings file (default `~/.claude/settings.json`).
- `ROTARIS_CONFIG_DIR` — points at the configuration directory used to locate `external-hooks.json`; when unset or blank that directory is the per-user global configuration directory of REQ-CONFIG-001.
