## The Settings category list does not move focus by the arrow keys

**Outcome: repaired 2026-11-11** on `feat/r-097-ui-ux-overhaul`, in the change that put the list under four headings
([`PD-CONFIG-008`](../../product/directives/pd-config-008.md#pd-config-008)). The list's `onKeyDown` moves focus among its
entries through `categoryFocusMove` (`packages/ui/src/SettingsView.tsx`): Arrow Down and Arrow Up by one entry, Home to
Models, End to About, stopping at either end, the selection untouched; `packages/ui/src/settings/categories.test.ts` holds
the rule, and a drive of the built application read the focused entry after each key.

Found on 2026-11-11 by the independent critique of the information-architecture map
([`docs/design/information-architecture.md`](../../design/information-architecture.md), section 7) and confirmed in the
source: the list in `SettingsView.tsx` was a `ul[role=listbox]` of `button[role=option]` with no key handler, so its
thirteen entries were thirteen Tab stops and the four keys did nothing. The selected entry's rule down its left edge and
the two accessible descriptions were built; the keyboard movement was not.

## Specs

REQ-SHELL-153: in a vertical navigation list "Arrow Up, Arrow Down, Home and End move focus without changing the
selection, and selecting requires Space or Enter". The Settings category list is the shell's first such list
(`docs/spec/12-desktop-shell-windows/05-shell-accessibility-contract.md`).

## Relevant files

- `packages/ui/src/SettingsView.tsx` — the list, `categoryFocusMove` and the handler.
- `packages/ui/src/settings/categories.test.ts` — the rule's test.
