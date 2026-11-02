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

## Outcome

Repaired by fin34 (2026-10-13). The improvement analysis timeout's draft-until-blur pattern is now every Runtime number
field's: `ClampedNumberField` (`packages/ui/src/settings/ConfigSettings.tsx`) draws Depth cap, Fan-out limit, Per-agent
timeout, Improvement analysis timeout, Compression threshold and Iteration cap. A keystroke that makes a whole number inside the
field's range is committed at once (REQ-CONFIG-325's write-through on value change); any other text — empty, a partial value
below the minimum, one past the maximum, a fraction — is held as the field's draft, never committed, and clamped into the range
when the field loses focus (`clampedNumberEdit`, `clampedNumberCommit` in `config-state.ts`; the ranges are named there,
`DEPTH_CAP_RANGE`, `FAN_OUT_RANGE`, `COMPRESSION_THRESHOLD_RANGE`, `ITERATION_CAP_RANGE`, beside `CHILD_TIMEOUT_MINUTES` and
`IMPROVEMENT_TIMEOUT_SECONDS`). REQ-CONFIG-322 and REQ-CONFIG-325's clamp holds: no out-of-range value is ever committed. The
field's look is unchanged (the same `DesignInput`, `settings__number`, min, max and step); the mockup draws no number field in
its Settings screen, so it decided nothing here.

Pinned by `packages/ui/src/settings/number-field.test.ts`: every value inside each of the six ranges typed digit by digit
into the cleared field ends committed as itself; the note's own cases (`70`, `4`, `45`); nothing outside a range committed for
`0`, `9999`, empty, `-3`, `2.5` and the bounds' neighbours; and each of the six inputs drawn as the clamped field with its range
(fails before the repair).

Driven in the built app with `pnpm app:drive` (2026-10-13, Linux, Settings › Runtime, each field selected, cleared and typed):
`70` into Compression threshold read 70, `4` into Depth cap 4, `45` into Per-agent timeout 45, `250` into Iteration cap 250,
`33` into Fan-out limit 33, `120` into Improvement analysis timeout 120, each kept when the field was left. Out-of-range drafts
were held while the field had focus and clamped when it was left: Compression threshold `9` → 50 and `120` → 95, Iteration cap
`9999` → 500, Depth cap `0` → 1, Fan-out limit emptied → 1, Per-agent timeout `300` → 240, Improvement analysis timeout `5` →
10. Under the bare Xvfb display the window never holds the platform's focus (`document.hasFocus()` is false), so Chromium moves
the active element on Tab without firing `blur`; leaving the field was driven by dispatching the `focusout` React listens to.
A person's focused window fires it on its own; that leg is not measured here.
