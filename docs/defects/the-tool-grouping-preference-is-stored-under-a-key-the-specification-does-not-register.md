## The tool-grouping preference is stored under a key the specification does not register

The specification registers the "Group consecutive tool calls" switch's desktop preference as `display/groupToolCalls`
(REQ-CONFIG-405's key list, default true; REQ-SHELL-006's key table). The build stores, reads and accepts it as
`display/groupTools` (the preference registry, the command contract's preference keys and the renderer's display store),
and nothing in the code knows `display/groupToolCalls`. A preference file written to the specification's key is ignored and
the switch reads its default; one written by the build carries a key the specification does not list. Beside it,
REQ-CONFIG-405's key list omits `display/showReasoning`, which REQ-CHAT-167 stores in the same store and REQ-SHELL-006's
table registers, so the two requirements that enumerate the store's keys disagree with each other as well as with the code.

Noticed 2026-10-13 (recorded 2026-10-14) by fin43 while writing PD-CONFIG-004, the ruling of OQ-264, which names the three
Display › Transcript switches; recorded under that ruling's instruction, which authorizes no repair. Whether the code or the
specification moves (the key is persisted in users' preference files, so renaming it is a migration) is not decided here.

## Specs

- `REQ-CONFIG-405` — lists `display/groupToolCalls` (bool, default **true**) and does not list `display/showReasoning`.
- `REQ-SHELL-006` — its key table registers `display/groupToolCalls` and `display/showReasoning`.
- `REQ-CHAT-167` — stores `display/showReasoning` "under the registered key … written user-wide like every desktop
  preference (REQ-CONFIG-405)", a list that does not name it.

## Relevant files

- `packages/platform/src/preferences.ts` — the registry entry `display/groupTools` (default true, owner REQ-CHAT-067).
- `packages/contracts/src/commands.ts` — `PREFERENCE_COMMAND_KEYS` accepts `display/groupTools`, not `display/groupToolCalls`.
- `apps/desktop/src/renderer/shell.ts` — `readDisplayPrefs` and `DisplayPrefKey` read and write `display/groupTools`.
- `docs/spec/15-settings-configuration.md` — REQ-CONFIG-405's key list.
- `docs/spec/12-desktop-shell-windows.md` — REQ-SHELL-006's key table.
