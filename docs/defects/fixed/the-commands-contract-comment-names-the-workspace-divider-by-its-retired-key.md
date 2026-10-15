## The commands contract's comment names the Workspace divider by its retired key

The header comment above `PANE_LAYOUT_PREFERENCE_KEYS` in `packages/contracts/src/commands.ts` says "Part AB adds
`panels/workspace`" for REQ-CHAT-010's transcript/composer divider, "keyed by the lower-cased view name for the same reason
`panels/library` is". Neither name is a key any more: since 2026-10-14 (`fe4adaa`) a pane layout is named on the wire by its
`panels/{view-key}/state` key and stored across REQ-SHELL-006's three keys (`panels/{view-key}/state`,
`panels/{view-key}/panes`, `panels/version`), and the constant directly below the comment lists `panels/workspace/state` and
`panels/library/state`. The sentence was accurate when Part AB landed and is accurate as history, but it is written in the
present tense beside the current key list, so a reader takes `panels/workspace` for the key the divider is stored under,
which is the very key `composer-proof` asserts is absent from the store.

Found by fin45's review (optional finding, `fin45/retro-and-record`, Task 2) and taken by fin46's acceptance round 1 as C19.
The product's behaviour is unaffected: the code writes the registered keys.

## Specs

- REQ-SHELL-069 (pane layouts keyed by the lower-cased view name under `panels/`) and REQ-SHELL-006's per-user preference
  store table (`panels/version`, `panels/{view-key}/state`, `panels/{view-key}/panes`): the comment names a key the table does
  not list, as if it were current. No requirement is contradicted by the code.

## Relevant files

- `packages/contracts/src/commands.ts` — the header comment, lines 37-38, beside `PANE_LAYOUT_PREFERENCE_KEYS`.
- `apps/desktop/scripts/composer-proof.mjs` — asserts the divider persists under the registered keys and not under
  `panels/workspace`.

## Outcome — repaired 2026-10-14 (fin46, bundle `fin46-accept1-18`)

The comment now says Part AB adds `panels/workspace/state` (with its `panels/workspace/panes`), keyed `workspace` for the
same reason the Library's is keyed `library`, and names `panels/workspace` only as the record's name until 2026-10-14 —
one stored object the store's table (REQ-SHELL-006) does not list, never a registered key — retired and never reused
(REQ-SHELL-069's last sentence). No code changed: the product already wrote the registered keys.

Pinned by `packages/contracts/src/commands.test.ts`: every backticked `panels/` name in `commands.ts` is a registered key
(`panels/version`, a `panels/{view-key}/state` of `PANE_LAYOUT_PREFERENCE_KEYS` or its `/panes` sibling, or the table's
`{view-key}` forms), or is marked as history ("until 2026-10-14", "formerly", "retired") in the eighty characters before it
(in its own sentence, up to the name, since fin47: a mark ending the sentence before no longer covers it).
It failed on the old comment with `["panels/workspace", "panels/library"]` and passes on the new one. `pnpm composer-proof`
(built app, 2026-10-14, load 0.95) passed, and its stored `preferences.json` holds `panels/workspace/state` and
`panels/workspace/panes` and no `panels/workspace`: the keys the comment now names are the ones the divider is stored under.
