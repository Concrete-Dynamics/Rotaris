## A Runtime number field ignores a value typed over the same clamped digits

Settings › Runtime draws a stored value it cannot show clamped to the field's range and states the stored value beneath
(`ClampedNumberField`, PD-CONFIG-003). When a person selects the field's text and types the very digits it already shows,
the field does not change: React's controlled input raises no change for a value equal to the one it holds, so nothing
reaches `onCommit`, the save bar stays `All changes saved`, and the stored value stays as it was. Measured in the built app
by `continuation-proof`'s later-run scenario on 2026-10-13 (fin42): `runtime.child_timeout: 3` is shown as `1` minute with
"Stored as 3 seconds."; Ctrl+A then `1` then Tab left the bar clean and the file at `child_timeout: 3`. A person who wants
1 minute, the value the field already reads, has no way to say so except by typing another value first or deleting the text
before typing. Recorded, not repaired: the proof's helper deletes the text before typing
(`apps/desktop/scripts/lib/settings-runtime-field.mjs`), which is how the measurement went on.

## Specs

None contradicted outright. REQ-CONFIG-446 and PD-CONFIG-003 say a value the field cannot show is "never rewritten until the
field is changed"; whether typing the digits it already shows is a change of the field is not said. The Per-agent timeout
(`#child-timeout`, minutes over seconds) and the Improvement analysis timeout (`#improvement-timeout`, 10–600 s) are the two
fields where a stored value the field cannot show is reachable by a hand-edited file.

*Added 2026-10-14 (fin45):* that reading is now ruled — [OQ-301](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-301), confirmed as built
under [R-072](../../product/requests.md#r-072): an entry the person types or steps into the field is a change of it, the digits
shown included, and opening, repopulating, focus and blur change nothing (`PD-CONFIG-003`'s ruling note).

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — `ClampedNumberField`: `value={draft ?? shown}`, `onChange` the only commit
  path for a typed value, `onBlur` commits only a draft.
- `packages/ui/src/settings/config-state.ts` — `timeoutMinutesForDisplay`, `clampedNumberEdit`, `storedTimeoutNote`.
- `apps/desktop/scripts/lib/settings-runtime-field.mjs` — the capture steps that set a Runtime field, with the deletion that
  works around it.

## Outcome — repaired 2026-10-14 (fin43, `fin43-transcript-and-prefs`)

`ClampedNumberField` (`packages/ui/src/settings/ConfigSettings.tsx`) commits a typed value from the native input event
(`onInput`) instead of React's `onChange`. The browser raises an input event for every edit, an overtype of the same digits
included; React's change event is raised only when the value differs from the one the controlled input holds. The edit
rule itself is unchanged (`clampedNumberEdit`: a whole number inside the range commits, anything else is a draft the blur
clamps), and so is every other path through the six fields.

The reading taken: PD-CONFIG-003 stores "a user's entry", and a value the person typed into the field is one whether or
not it reads as the digits already shown; "never rewritten until the user changes the field" is kept, since nothing but an
entry reaches `onCommit`. The reading was raised as [OQ-301](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-301) by fin44 and confirmed as
built under [R-072](../../product/requests.md#r-072) on 2026-10-14; nothing changed.

Pinned by `packages/ui/src/settings/number-field-retype.test.ts` (three cases, red on the code before: a stored 3 s shown
as `1` minute and overtyped `1` commits `child_timeout: 60`; a stored 700 s Improvement analysis timeout shown as `600`
and overtyped `600` commits 600; all six clamped fields commit from the input event and none from the change event). The
workaround in `apps/desktop/scripts/lib/settings-runtime-field.mjs` (Backspace before typing) is gone, so every harness that
sets a Runtime field types over the selection as a person does. Shown by `pnpm continuation-proof --only=later-run`: with
the repair the bar read `Unsaved changes` after the overtype, then `All changes saved`, and the file `child_timeout: 60`;
against a build without it the same steps failed with `{"afterEdit":"All changes saved","atEnd":"All changes saved","field":"1"}`.
