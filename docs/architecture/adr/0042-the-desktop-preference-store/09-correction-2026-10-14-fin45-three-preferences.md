# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Correction — 2026-10-14 (fin45), three preferences under keys the table does not list

Part 9 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Correction — 2026-10-14 (fin45), three preferences under keys the table does not list

The second to fifth executions above registered each pane layout as ONE record `{ version, panes, sizes }` under
`panels/<view>`, and Part R and Part AL′ registered `interface/agentPopOut` and `terminal/autoOpen`. None of those five
keys is in REQ-SHELL-006's table, which is the registry this store enforces ("a key that does not appear in that table does
not exist"; OQ-302, ruled under R-072, confirms the table as the one complete registry). The table registers
`interface/agentPopout`, `interface/terminalPopout`, ONE `panels/version` stamp for every stored layout, and per view
`panels/{view-key}/state` and `panels/{view-key}/panes`. Those are the keys now: `PreferenceStore.readLayout` / `writeLayout`
read and write a layout whole across the three, applying REQ-SHELL-069's restore rules (no version 1, another pane count, an
empty state), and `carryOverRenamedKeys` carries a value found under any old name over once, a value already under the
registered key winning. The executions above are kept as written: what they measured (a nested record round-trips; the
serialiser's replacer defect) still holds of the store; the keys they named are falsified by the table. A test now reads the
table itself and fails on any literal key the registry holds that the table does not list
(`packages/platform/src/preference-registry.test.ts`;
`docs/defects/fixed/the-agent-pop-out-terminal-auto-open-and-pane-layout-preferences-are-stored-under-unregistered-keys.md`).

**Addendum, 2026-10-14 (fin46, `fin46-accept1-20`).** The carry-over above copied the first old object's `version` into the one
`panels/version` stamp unchecked, and carried every old object whatever its own version, where each old object had stood alone
(refused unless version 1). It now carries only an object at version 1 (read tolerantly), stamps the integer 1, and drops any
other, so no old object decides another view's layout. The reading that the first object's version may stand for every layout is
falsified and kept here beside its replacement
(`docs/defects/fixed/the-pane-layout-carry-over-stamps-every-layout-with-the-first-old-objects-version.md`; pinned by three cases in
`preference-registry.test.ts` and `git-proof`'s launch 5b, `carried-layout`).
