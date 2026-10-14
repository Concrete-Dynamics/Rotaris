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
