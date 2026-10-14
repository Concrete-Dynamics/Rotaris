## A Runtime timeout field's description states an unsaved value as stored

The Per-agent timeout (`#child-timeout`) and the Improvement analysis timeout (`#improvement-timeout`) carry an
`aria-description` of "Stored as <N> seconds." (`packages/ui/src/settings/ConfigSettings.tsx`, the `description` passed to
`ClampedNumberField` at the two fields, about lines 320 and 335). `<N>` is read from `pending.runtime` — the form's pending
value — not from the saved one. So during an unsaved edit the description states a figure the workspace file does not hold: a
stored `child_timeout: 3` overtyped with `1` minute reads "Stored as 60 seconds." to a screen reader until Save, while the file
still says 3. The visible stored-value line beneath (`storedTimeoutNote`, `storedSecondsLine` in
`packages/ui/src/settings/config-state.ts`) reads the same pending value, but is hidden whenever the pending value is one the
field can show, which every typed value is. Read from the code on 2026-10-14 by fin45 (`fin45-retro-and-record`) while
recording [OQ-301](../architecture/open-questions.md#oq-301)'s ruling; not seen in the built app. Recorded, not repaired: its
repair follows the ordinary path and is outside that ruling.

## Specs

`PD-CONFIG-003` (and its revision 2 for the improvement analysis timeout): the line beneath a value the control cannot express
"states the stored seconds", and REQ-CONFIG-446 states the stored value. A pending edit is not stored until Save
(REQ-CONFIG-419).

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — the `description` of `#child-timeout` (about line 320) and
  `#improvement-timeout` (about line 335), built from `rt = pending.runtime`; `ClampedNumberField`'s `aria-description`.
- `packages/ui/src/settings/config-state.ts` — `storedSecondsLine`, `storedTimeoutNote`, `storedImprovementTimeoutNote`: the
  visible line's wording, read from the same value.
