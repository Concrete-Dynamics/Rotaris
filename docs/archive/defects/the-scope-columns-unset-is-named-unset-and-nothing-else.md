## The Scope column's Unset is named "Unset" and nothing else

The **Unset** action in a role row's Scope column (Settings → Personas) is a link-styled button whose text is "Unset",
with no `aria-label`. Its title, "Falls back to the lower-precedence value.", is the tooltip. Its accessible name is
therefore "Unset" on every row and for both fields. A screen-reader user moving through the table hears the same name
for the model's and the reasoning's Unset of every role, and the name does not say which field or role it clears.

Seen 2026-10-02 with `pnpm app:drive` over a scratch workspace whose `agents.yaml` sets only
`personas.tester.model: large_model`. The `tester` row's Unset read `{ text: "Unset", aria-label: null, title: "Falls back
to the lower-precedence value." }`. Found while repairing
[`the-scope-column-names-the-built-in-origin-built-in-not-default.md`](the-scope-column-names-the-built-in-origin-built-in-not-default.md);
not repaired.

## Specs

- `REQ-CONFIG-341`: the Unset's "accessible name identifies the field and the role". The tooltip clause ("explains that
  it falls back to the lower-precedence value") is met.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx`: the two Unset `DesignButton`s in the role row's `settings__scope` cell
  carry a `title` and no `aria-label`.

## Outcome — repaired 2026-10-02 (fin5, branch `fin5-gate-and-scope`)

Confirmed first in the built app on origin/main `f2bddcf`, over the note's scratch workspace: `pnpm app:drive inspect
".settings__scope button"` read the `tester` row's one Unset as `{ text: "Unset", title: "Falls back to the
lower-precedence value." }` with no `aria-label`.

Each Unset now carries an `aria-label` naming the field and the role, `Unset model for <role>` and `Unset reasoning for
<role>`. The label is built beside the cell's origin, in `scopeCellOf` (`packages/ui/src/settings/config-state.ts`,
the field's `unsetLabel`), and `PersonasSettings` in `ConfigSettings.tsx` puts it on the two `DesignButton`s. The
visible text "Unset" and the tooltip are kept.

Pinned by:
- `packages/ui/src/settings/config-state.test.ts`, "REQ-CONFIG-341 — the Scope column's Unset is named by its field and
  its role": the model's and the reasoning's Unset of `tester` are named apart, and `planner`'s model Unset by its own
  role. It failed before the repair (no `unsetLabel`).
- `pnpm settings-proof`, new launch 8 (`personas-unset`), over a workspace of its own whose `agents.yaml` sets only
  `personas.tester.model: large_model`: the one Unset on screen is found by the selector
  `.settings__scope button[aria-label="Unset model for tester"]` and clicked through it. While the unset is pending, no
  row reads `model: workspace`, no Unset is offered and the bar reads "Unsaved changes". After Discard the row reads
  `model: workspace` with its named Unset again and the form is clean. The launch therefore also pins the sibling
  repair
  ([`the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md`](the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md)).
  Against the unrepaired renderer (`ConfigSettings.tsx` at `f2bddcf`, rebuilt) the launch fails with "the tester's
  model Unset was not named "Unset model for tester": 0 named of 1 Unset". With the repair the whole proof passes.
  Hardened after the first verification (2026-10-02): a missing or empty probe of the pending column no longer passes,
  since the launch now asks for the probe at all, for as many cells as before the click, and for exactly one more row
  reading `model: default` (13 before, 14 pending), and for an Unset probe that ran and found none. Against a build
  holding this repair but not the sibling one (`scopeCellOf` drawing the read-back origin over a pending unset), the
  launch fails with "with the unset pending a row still read its old origin"; with both, the proof passes.
