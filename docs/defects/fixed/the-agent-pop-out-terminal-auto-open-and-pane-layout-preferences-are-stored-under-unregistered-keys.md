## The agent pop-out, terminal auto-open and pane-layout preferences are stored under keys the specification does not register

Noticed 2026-10-14 by fin44's reviewer of `fin44-hooks-and-config` while checking the repair of
[`the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md`](the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md)
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

## Outcome — repaired 2026-10-14 (fin45, `fin45-retro-and-record`)

[OQ-302](../../architecture/open-questions.md#oq-302), ruled under [R-072](../../product/requests.md#r-072), confirms
REQ-SHELL-006's table as the store's one complete registry. The specification names each of the three preferences and the
table registers a key for each, so no directive was owed: each is now stored under the key the table lists, and a value stored
under the old name is read once and carried over (`RENAMED_KEYS` and `carryOverRenamedKeys`, `packages/platform/src/preferences.ts`;
a value already under the registered key wins, and the old name is removed).

- **Agent pop-out:** `interface/agentPopOut` → `interface/agentPopout` (registry, `PREFERENCE_COMMAND_KEYS`, main's `prefs.set`,
  the renderer's toggle and boot read, `mission-proof` and `palette-proof`).
- **Terminal auto-open:** `terminal/autoOpen` → `interface/terminalPopout` (`TERMINAL_AUTO_OPEN_PREFERENCE`,
  `packages/contracts/src/terminal.ts`; main reads and writes it through that constant).
- **Pane layouts:** read against REQ-SHELL-069 ("alongside that view's pane count and one schema-version stamp covering every
  stored layout"), the single object per view was a defect, not an encoding left open: the encoding is free, the keys are not.
  A layout is now stored across `panels/version` (one stamp), `panels/{view-key}/state` (the sizes) and
  `panels/{view-key}/panes` (the count), through `PreferenceStore.readLayout` / `writeLayout`, which apply REQ-SHELL-069's
  restore rules (no version 1, another pane count, an empty state) and its tolerant integer parsing. On the wire a layout is a
  `PaneLayout` record named by its view's state key (`PANE_LAYOUT_PREFERENCE_KEYS`); an old `panels/<view>` object is split
  into the three keys once. `overview-proof`, `git-proof` and `composer-proof` read and write the registered keys.

Pinned by `packages/platform/src/preference-registry.test.ts` (six cases, all red before the repair): the registry holds no
literal key REQ-SHELL-006's table does not list — read from the table itself, which before the repair named exactly the six
keys `panels/overview`, `panels/git`, `panels/library`, `interface/agentPopOut`, `panels/workspace` and `terminal/autoOpen`; the
two booleans' keys and defaults; their carry-over; a layout across the three keys; REQ-SHELL-069's restore rules; and a layout
object's carry-over. `platform.test.ts`'s layout round-trips moved to `readLayout` / `writeLayout`.

Shown in the built app, 2026-10-14, each proof alone at a load average of 1.2 to 2.1 on four CPUs: `pnpm overview-proof` (the split
written under the three keys and restored at 420 on the relaunch), `pnpm git-proof` (the divider moved by keyboard stored as
`panels/git/state` `[.., 528]` with `panels/git/panes` 2 and `panels/version` 1, no `panels/git`, and restored on the relaunch),
`pnpm composer-proof` (the Workspace divider stored as `panels/workspace/state` with its count and stamp), `pnpm mission-proof`
(the pop-out toggle persisted as `interface/agentPopout`, `popOutPreference: true`) and `pnpm palette-proof`, all green. No proof
drives the terminal window's auto-open toggle; the unit cases carry its key and carry-over.

