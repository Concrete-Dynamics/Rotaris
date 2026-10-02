## The Scope column's Unset is named "Unset" and nothing else

The **Unset** action in a role row's Scope column (Settings → Personas) is a link-styled button whose text is "Unset",
with no `aria-label`. Its title, "Falls back to the lower-precedence value.", is the tooltip. Its accessible name is
therefore "Unset" on every row and for both fields. A screen-reader user moving through the table hears the same name
for the model's and the reasoning's Unset of every role, and the name does not say which field or role it clears.

Seen 2026-10-02 with `pnpm app:drive` over a scratch workspace whose `agents.yaml` sets only
`personas.tester.model: large_model`. The `tester` row's Unset read `{ text: "Unset", aria-label: null, title: "Falls back
to the lower-precedence value." }`. Found while repairing
[`fixed/the-scope-column-names-the-built-in-origin-built-in-not-default.md`](fixed/the-scope-column-names-the-built-in-origin-built-in-not-default.md);
not repaired.

## Specs

- `REQ-CONFIG-341`: the Unset's "accessible name identifies the field and the role". The tooltip clause ("explains that
  it falls back to the lower-precedence value") is met.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx`: the two Unset `DesignButton`s in the role row's `settings__scope` cell
  carry a `title` and no `aria-label`.
