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

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — `ClampedNumberField`: `value={draft ?? shown}`, `onChange` the only commit
  path for a typed value, `onBlur` commits only a draft.
- `packages/ui/src/settings/config-state.ts` — `timeoutMinutesForDisplay`, `clampedNumberEdit`, `storedTimeoutNote`.
- `apps/desktop/scripts/lib/settings-runtime-field.mjs` — the capture steps that set a Runtime field, with the deletion that
  works around it.
