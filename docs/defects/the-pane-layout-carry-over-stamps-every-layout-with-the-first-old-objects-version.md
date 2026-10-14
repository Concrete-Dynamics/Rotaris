## The pane-layout carry-over stamps every layout with the first old object's version, unchecked

Noticed 2026-10-14 by fin45's reviewer of `fin45-retro-and-record` (an optional finding of Task 2) and taken as acceptance
finding C17 by fin46's first acceptance round; recorded here by `fin46-accept1-20` before its repair.

`carryOverRenamedKeys` (`packages/platform/src/preferences.ts`) splits a pane layout this build once stored as one object
`{ version, panes, sizes }` under `panels/<view>` into REQ-SHELL-069's registered keys. Where no `panels/version` is stored it
copies the **first** old object's `version` into that one stamp, whatever the value is, and it carries every old object's sizes
and count over whatever that object's own version was. Under the old reading each object stood alone (`coercePaneLayout` refused
one whose version was not 1, and the other views kept theirs); under the registered keys one stamp covers every layout. So:

- a first old object at a version other than 1 stamps the store with that version, and every carried layout, the other views'
  version-1 layouts included, restores its defaults from then on;
- a first old object with no version sets the stamp to `undefined`, which counts as present (`in`), so no later object's 1 is
  taken either, and the written file holds no stamp at all: the same loss;
- an old object that the old reading refused (its version not 1) has its sizes carried, and becomes live as soon as another
  view's layout writes the stamp 1, a layout the old reading would never have applied.

Harmless today: this build only ever wrote version 1 objects. A guard makes the migration total.

## Specs

- `REQ-SHELL-069`: "one schema-version stamp covering every stored layout (currently 1)"; defaults are restored when "the stored
  version is not 1". The carry-over lets one old object decide that stamp for every view, which the old per-object reading never did.
- `REQ-SHELL-006`: the registered keys the carry-over writes (`panels/version`, `panels/{view-key}/state`, `panels/{view-key}/panes`).

## Relevant files

- `packages/platform/src/preferences.ts` — `carryOverRenamedKeys`, the pane-layout loop (`next[PANE_LAYOUT_VERSION_KEY] = stored.version`).
- `packages/platform/src/preference-registry.test.ts` — the carry-over cases, all with version-1 objects.
