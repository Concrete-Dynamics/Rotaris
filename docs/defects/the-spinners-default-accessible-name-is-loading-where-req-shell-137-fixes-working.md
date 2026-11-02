## The Spinner's default accessible name is Loading where REQ-SHELL-137 fixes Working

`Spinner` in `packages/ui/src/design-system/feedback.tsx` (line 51) defaults its `label` prop, and with it the
`aria-label` it renders on a `role="status"` span, to `Loading`. `REQ-SHELL-137` makes the spinner's default accessible
name "Working", and `docs/design/README.md` §4.1's Spinner row records the same gap against the design system's
component ("Needs the default accessible name **Working**"). A grep on 2026-11-02 finds no `Spinner` rendered in
`packages/ui/src` or `apps/desktop/src` outside the component's own file, so the wrong default binds the first caller
that omits a label rather than a surface drawn today; the surface requirements that name a spinner's wait (guide 13's
checks, `REQ-SHELL-137`) would then announce a word the specification does not use. Noticed 2026-11-02 while reviewing
the design research corpus; guide 13's section 7 first read it from the source.

## Specs

- `REQ-SHELL-137` (`docs/spec/12-desktop-shell-windows/04-transient-and-persistent-feedback-surfaces.md`): "the default
  accessible name is 'Working' (an unnamed turning shape is invisible to a screen reader)". The component's default
  contradicts it.
- `docs/design/README.md` §4.1, the Spinner row, which already lists the "Working" default as what the component needs
  beside `REQ-SHELL-137`.
- Rubric F2 (every state says what it is) and the glossary's voice rule (§1.11, the specification's wording wins) score
  it on a surface once one renders the component without a label.

## Relevant files

- `packages/ui/src/design-system/feedback.tsx` — `Spinner`, line 51, `label = 'Loading'`.
- `docs/spec/12-desktop-shell-windows/04-transient-and-persistent-feedback-surfaces.md` — `REQ-SHELL-137`.
- `docs/design/README/04-4-component-inventory-against-the-specification.md` — §4.1, the Spinner row.
- `docs/research/design/13-states-feedback-and-time.md` — section 7 (the reading); `10-ux-writing.md` section 6, the F2
  check that every `Spinner` is named for its wait.
