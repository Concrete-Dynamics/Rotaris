## The agent pop-out, terminal auto-open and pane-layout preferences are stored under keys the specification does not register

Noticed 2026-10-14 by fin44's reviewer of `fin44-hooks-and-config` while checking the repair of
[`the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md`](fixed/the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md)
against REQ-SHELL-006's table; not repaired, outside that task, which named the tool-grouping key alone.

REQ-SHELL-006's table is closed — "every key the product may store is listed here … and a key absent from it does not
exist" — and REQ-CONFIG-405 repeats the interface keys with their defaults. Three of the build's registered preferences
(`PREFERENCE_KEYS`, `packages/platform/src/preferences.ts`) are stored under keys that table does not list:

- **Agent pop-out** (REQ-SHELL-073): the build stores `interface/agentPopOut`; the table and REQ-CONFIG-405 register
  `interface/agentPopout`. The two differ in the case of one letter, and the store's keys are case-sensitive, so a value
  under the registered spelling is not read.
- **Terminal auto-open** (REQ-SHELL-109): the build stores `terminal/autoOpen`, in a `terminal/` namespace the table's list of
  namespaces does not have; the table and REQ-CONFIG-405 register `interface/terminalPopout` ("auto-open the terminal window
  when a command starts", default false).
- **Pane layouts** (REQ-SHELL-069): the build stores one object per view under `panels/overview`, `panels/git`,
  `panels/library` and `panels/workspace` (version, pane count and sizes together, `coercePaneLayout`); the table registers
  `panels/version` (one stamp for every stored layout) and `panels/{view-key}/state` and `panels/{view-key}/panes` per view.

Each key is persisted in users' preference files, so moving any of them needs the carry-over the tool-grouping repair gave
`display/groupTools` (`RENAMED_KEYS`): the stored value read once under the old name and written under the registered one. For
the pane layouts the stored shape differs as well as the name. Whether the pane layouts' single object per view is a defect or
an encoding the table leaves open ("the physical location and encoding are platform-defined") is for whoever repairs it to
read against REQ-SHELL-069; this note does not decide it.

## Specs

- `REQ-SHELL-006` (`docs/spec/12-desktop-shell-windows.md`, the preference key table): registers `interface/agentPopout`,
  `interface/terminalPopout`, `panels/version`, `panels/{view-key}/state` and `panels/{view-key}/panes`, and says a key absent
  from it does not exist.
- `REQ-CONFIG-405` (`docs/spec/15-settings-configuration.md`): lists `interface/agentPopout` and `interface/terminalPopout`
  with their defaults.
- `REQ-SHELL-073`, `REQ-SHELL-109`, `REQ-SHELL-069`: the behaviours the three preferences carry.

## Relevant files

- `packages/platform/src/preferences.ts` — `PREFERENCE_KEYS` (`interface/agentPopOut`, `terminal/autoOpen`, `panels/*`) and
  `RENAMED_KEYS`, the carry-over a rename would extend.
- `packages/contracts/src/commands.ts` — `PREFERENCE_COMMAND_KEYS`, which accepts `interface/agentPopOut` and the `panels/*` keys.
- `apps/desktop/src/main/` — `window.terminalAutoOpen`, which resolves `terminal/autoOpen`.
