## A grant the controls left empty of native tools reads as no grant recorded

A child's row records its native grant as a JSON array in `children.granted_tools`. The spawn writes `[]` (no grant
yet), and the child's port writes the grant it put in force once ready. When REQ-TOOLS-006's controls leave a child no
native tool, for example a `tool_restrictions` list naming only tool-server tools, the port records `[]` too. The
surfaces cannot tell the two apart: `resolvedTools` (`packages/ui/src/agents.ts`) shows the persona's declared tools
whenever the recorded list is empty, so the inspector lists as granted every tool the controls removed. This is the
over-report `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md` repaired, surviving in this one case.

Noticed 2026-10-01 while repairing that note (fin2). Not reproduced in a built app.

## Specs

- `REQ-MONITOR-049` / `REQ-MONITOR-060`: the declared tools stand in only where no grant was recorded.
- `REQ-MCP-065`, `REQ-TOOLS-006`: what the controls removed is not granted.

## Relevant files

- `packages/engine/src/children/ledger.ts`: `spawn` writes `granted_tools: '[]'`. `recordGrant` writes the port's list.
- `packages/ui/src/agents.ts`: `resolvedTools`, which reads an empty list as "no grant recorded".
- `packages/engine/src/sessions.ts`: `toAgentRecord`'s `grantedTools: parseList(c.granted_tools)`.
