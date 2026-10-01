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

## Outcome — repaired 2026-10-01 (fin3)

Confirmed first by three tests that failed on the unrepaired code: `resolvedTools` returned the declared tools for an
empty grant whatever was recorded, `toAgentRecord` had no way to say a grant was recorded, and the recorded evidence
carried no mark of it.

- **The record tells the two apart, with no migration.** `SessionWriter.recordChildGrant` adds `recorded: true` to the
  `granted_mcp` object it writes beside `granted_tools`. The spawn still writes `[]` and evidence without the marker, so a
  row the port never reported on reads as before. `toAgentRecord` projects the new `AgentRecord.grantRecorded`
  (`grantRecordedOf`, `packages/engine/src/sessions.ts`): `true` where the marker is present, else where the native list is
  non-empty. A row written by any build before this one has no marker and keeps today's reading: `[]` is no grant
  recorded, and a non-empty list (the declared set an older spawn wrote) is the grant. That includes an empty grant a port
  recorded earlier on 2026-10-01, under a build from before this marker: such a child still reads as no grant recorded and
  is drawn with its declared tools, the defect as it stood, for rows already written (the verifier's optional finding).
- **The surface lets the declared tools stand in only where no grant was recorded.** `resolvedTools`
  (`packages/ui/src/agents.ts`) returns the recorded list, empty or not, when `grantRecorded` is set, so the inspector and the
  persona window (REQ-MONITOR-069's card reads the same set) draw "No tools resolved." for a child whose controls removed
  every native tool. The run-level agent's synthetic record sets `grantRecorded: false`, since its set is already
  `runLevelGrant`'s choice.
- The marker was put on the recorded side, not at the spawn (the triage's sketch wrote `recorded: false` there): a spawn
  marker would have left every older unmarked row reading as a recorded empty grant.

Pinned by `packages/ui/src/agents.test.ts` ("REQ-MONITOR-049 / REQ-TOOLS-006: a recorded empty grant lists no native tool;
an unrecorded one lets the declared tools stand in"), `packages/engine/src/children/activity.test.ts` ("REQ-MONITOR-049 /
REQ-MCP-065: a recorded empty native grant reads as recorded; an unmarked empty list as no grant recorded") and
`packages/engine/src/children/children.test.ts` ("REQ-MONITOR-049 / REQ-TOOLS-006: a grant the controls left empty of native
tools is recorded as a grant, not read as none"), each failing without the repair; and by
`apps/desktop/src/run-host/tools.test.ts` ("REQ-TOOLS-006 / REQ-MCP-065: a tool_restrictions list naming only a server tool
leaves an empty native grant beside the server tool"). Shown in the built app by `pnpm mcp-proof`'s new launch 3b
(`empty-native-grant`, driven): a child whose `tool_restrictions` names `echo` alone records `[]` with
`{"granted":{"alpha":["echo"]},…,"recorded":true}`, and with the child selected the inspector's tools field reads
"No tools resolved." with no native chip and `echo used` under alpha. 2026-10-01, all ten launches green, exit 0.
