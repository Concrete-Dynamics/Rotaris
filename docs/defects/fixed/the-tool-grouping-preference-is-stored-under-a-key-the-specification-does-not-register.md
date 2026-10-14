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
- `apps/desktop/src/renderer/display-prefs.ts` — the window's display store, its boot read and `DisplayPrefKey`, which read and
  write `display/groupTools` (moved there from `apps/desktop/src/renderer/shell.ts` on 2026-10-14 by fin44, `fin44-optional-findings`;
  `shell.ts` re-exports `readDisplayPrefs`, `writeDisplayPref` and `DisplayPrefKey`).
- `docs/spec/15-settings-configuration.md` — REQ-CONFIG-405's key list.
- `docs/spec/12-desktop-shell-windows.md` — REQ-SHELL-006's key table.

## Outcome — repaired 2026-10-14 (fin44, `fin44-hooks-and-config`)

The specification registers a key for the switch — `display/groupToolCalls`, default true, in REQ-CONFIG-405's list and
REQ-SHELL-006's table — so the code moved to it and no question was needed for the key itself. `display/groupTools` became
`display/groupToolCalls` in `PREFERENCE_KEYS` (`packages/platform/src/preferences.ts`), `PREFERENCE_COMMAND_KEYS`
(`packages/contracts/src/commands.ts`), `DISPLAY_PREFERENCE_KEYS` (`channels.ts`), main's `prefs.set` broadcast
(`apps/desktop/src/main/commands/shell.ts`), the renderer's display store (`renderer/display-prefs.ts` and its test, the comments of `renderer/shell.ts`, `main.tsx`), `ui`'s
`display-host.ts` and `settings-proof`'s read of the file. A value a user's preference file still holds under the old name is
read once and carried over: `PreferenceStore` moves it to the registered key the first time the file is read or written (a value
already under the registered key wins) and removes the old name (`RENAMED_KEYS`), so the switch keeps the user's choice across
the upgrade. Pinned by two cases in `packages/platform/src/platform.test.ts`, both red on the code before (the registered key was
refused as "not registered (REQ-SHELL-006)"). The second half of this note — REQ-CONFIG-405's list omitting
`display/showReasoning`, which REQ-SHELL-006 and REQ-CHAT-167 register — is a disagreement of the specification, not of the code,
and is raised as [OQ-302](../../architecture/open-questions.md#oq-302) (raised as OQ-297 and renumbered at landing, where fin44's sibling bundles had taken OQ-297 to OQ-301); the build keeps `display/showReasoning` as registered.
*Added 2026-10-14 (fin45):* OQ-302 was ruled confirmed as built under [R-072](../../product/requests.md#r-072), with no change: REQ-CONFIG-405's list names the keys it owns and REQ-SHELL-006's table is the one complete registry, so this note's second half is settled.
