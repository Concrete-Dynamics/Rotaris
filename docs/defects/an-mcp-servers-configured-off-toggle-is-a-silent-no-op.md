## The MCP Servers category's enable toggle is a silent no-op on a row configured `enabled: false`

The MCP Servers card lists every configured server, a disabled one included (REQ-MCP-091), each with a toggle whose
label is "Enable {name} for this session" (REQ-MCP-094). On a row whose entry is configured `enabled: false`, pressing
that toggle changes nothing: no message, no state, no log line. The row keeps reading `Configured off (enabled: false
in the configuration file).` and the switch springs back. Measured 2026-11-08 against the real `McpHost` on the shipped
defaults, where `browser` and `web_search` ship `enabled: false` (REQ-CONFIG-181):

```
BEFORE:                 {"enabled":false,"overridden":false,"available":true}
AFTER setEnabled(true): {"enabled":false,"overridden":false,"available":true}   # unchanged
```

The cause is that "on" and "off" are not symmetrical. `McpSettings.tsx` computes
`const on = row.enabled && !row.overridden && row.available`, so on a configured-off row a press calls
`onToggle(name, true)`. The run host's one writer holds a **disable-only** set:

```ts
// apps/desktop/src/run-host/mcp.ts:224
setEnabled(name: string, enabled: boolean): void {
  if (enabled) this.overrides.delete(name); else this.overrides.add(name);
```

`overrides` is read as an exclusion at both consumers (`:246` in the discovery pass, `:296` as
`sessionDisabled`), so `true` only ever *removes* a session switch-off; it cannot turn a configured `false` on. The
opposite direction works: pressing a row that is on adds it to the set and the row reads overridden.

Nothing tells the user. The button is disabled only when the server is *unavailable* (`disabled={!row.available}`);
its `title` is set only in that same case, so a configured-off but available row (which is the shipped `browser` with
`npx` on PATH) carries no tooltip at all. The explanatory hint sits under the switch, and it names the file but not
that the control is inert there. REQ-MCP-115 requires the category to say which of the two controls is in force and to
name `enabled` and the configuration file "as the way to make it persistent ... plainly rather than leaving the user
to discover that a toggle did not stick": a control that accepts a press and does nothing is exactly that discovery.

No proof and no test exercises the enable direction. `apps/desktop/scripts/mcp-proof.mjs:692` presses
`button[aria-label="Enable beta for this session"]` on a server that is already enabled, i.e. it only ever toggles
*off*; and the category has no unit test of its own.

**Not repaired here, deliberately.** The narrow fix — a press on a configured-off row writes
`mcp_servers.<name>.enabled: true` — contradicts REQ-CONFIG-417's ruling that "Tool-server enablement is not a further
destination and is not written to any configuration file" and REQ-MCP-094/115's session-scoped design, so it is a
directive for the owner, not a silent repair. The weaker remedy that keeps both requirements — extend the hint to
name `enabled` and the file with an example, give the switch a `title` whenever the row is configured off, and stop
swallowing the press — is a presentation change with the same owner question behind it (should the control stay
inert, or should it become a durable write?). Raised in the handoff of the availability fix's report
(`reports/rotaris-mcp-servers-diagnose-2026-11-08.md`), whose PR is confined to the availability defect.

## Specs

REQ-MCP-091 (the toggle and its state), REQ-MCP-094 and REQ-MCP-115 (the two controls, which is in force, and the
requirement that the category say so plainly), REQ-CONFIG-465 (the configured value), REQ-CONFIG-417 (tool-server
enablement is not a configuration-file write destination), REQ-CONFIG-349 (the toggle's initialization and its
disabled-when-unavailable rule), REQ-CONFIG-464/REQ-CONFIG-350 (the screen edits values and does not author objects).

## Relevant files

- `packages/ui/src/settings/McpSettings.tsx` — `Row`: `on` (line 50), the press handler's guard and `!on` (lines
  62-66), the `disabled` and `title` expressions (line 83), and the enablement hint (line 60 in the availability
  fix's head; line 54 before it).
- `apps/desktop/src/run-host/mcp.ts` — `setEnabled` and the `overrides` set (lines 145, 224-232), and its two reads
  (line 246, line 296).
- `apps/desktop/src/renderer/main.tsx` — `onToggle`, the `mcp.setEnabled` request and the reload that follows.
- `packages/contracts/src/mcp.ts` — `McpServerRowSchema`'s `enabled` and `overridden`.
- `apps/desktop/scripts/mcp-proof.mjs` — the only press of the toggle (line 692), and its off-only shape.
