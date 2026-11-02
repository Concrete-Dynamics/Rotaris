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

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-20`)

`carryOverRenamedKeys` now carries an old `panels/<view>` object only when its version reads as 1 (tolerantly, as
REQ-SHELL-069 reads every integer), and the stamp it sets where none is stored is the integer 1, never the object's own value.
An old object at another version, or none, is dropped with its old name, so it decides no other view's layout and never becomes
live under a later stamp. A layout already under the registered keys still wins.

Pinned by three cases in `packages/platform/src/preference-registry.test.ts`, all red before the repair: a version-1 git object
is carried beside a first overview object at version 2, with no version, or with a null version; an object at version 3 is dropped
and stays dropped after another view writes the stamp; and an object whose version is the string `"1"` is carried with the stamp
written as the integer 1.

Shown in the built app by `git-proof`'s new launch 5b, `carried-layout`: the store rewritten as an older build kept it (no
`panels/version`, `panels/overview` at version 2 ahead of `panels/git` at version 1) and the git split is restored at 528 and stored
under the three registered keys with the stamp 1, the version-2 object dropped (`results.carriedLayout`). The same proof on a
build without the repair failed at that launch with `aria-valuenow=480`, the default split. Every launch green with the repair,
twice, alone at a load average of 1.0 to 3.5 on four CPUs.
