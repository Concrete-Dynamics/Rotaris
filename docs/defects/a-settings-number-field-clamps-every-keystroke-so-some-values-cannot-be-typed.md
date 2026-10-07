## A Settings number field clamps every keystroke, so some values cannot be typed

The Runtime category's numeric fields clamp the value on every `onChange` (`clampForDisplay(Number(value) || min, min,
max)` in `packages/ui/src/settings/ConfigSettings.tsx`), and the field is controlled, so each keystroke is replaced at once by
its clamp. Where the minimum has more than one digit the first keystroke of a new value is clamped up and the next ones are
appended to the clamp: in "Compression threshold" (50–95) a person who selects the field and types `70` gets `50` after the
`7` and `95` after the `0` (`500` clamped). In every field an emptied value becomes the minimum at once, so clearing "Depth
cap" and typing `4` gives `14`, and clearing "Per-agent timeout" and typing `45` gives `145` minutes. Arrow keys and the
spinner work; typing does not, for these values. Noticed on 2026-10-07 while building PD-CONFIG-003 revision 2 (OQ-223),
whose new "Improvement analysis timeout" field (10–600) met it in the built app — `120` typed into a cleared field became
`600` — and was built to hold a draft until the value is in range or the field loses focus (`improvementTimeoutEdit`); the
other fields are recorded, not repaired here.

## Specs

REQ-CONFIG-322 and REQ-CONFIG-325 ("hard widget-level clamping, so out-of-range values are unreachable through the UI" — the
clamp is required, but it makes in-range values unreachable too); `PD-CONFIG-003` (the per-agent timeout's 1–240 minutes).

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — the `max-depth`, `max-active`, `child-timeout`, `threshold` and `iterations`
  fields' `onChange`.
- `packages/ui/src/settings/config-state.ts` — `clampForDisplay`, `timeoutSecondsFromInput`; `improvementTimeoutEdit`, the
  pattern the repair could share.
