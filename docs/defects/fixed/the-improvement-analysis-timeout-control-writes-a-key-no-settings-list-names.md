## The Improvement analysis timeout control writes a key no Settings list names

Settings › Runtime › Runtime policy carries a numeric control "Improvement analysis timeout" (`improvement-timeout`,
`packages/ui/src/settings/ConfigSettings.tsx`) over `runtime.improvement_collector_timeout`, in seconds, committed by Save
(`savePayload` sends every changed runtime key, and the desktop save writes whatever runtime key it is handed,
`packages/config/src/writers.ts`). No requirement lists it: REQ-CONFIG-256's written keys are "exactly" an enumeration that
omits it, REQ-CONFIG-263's Tier B overlay omits it (and so does `TIER_B_RUNTIME_KEYS`, `packages/config/src/tiers.ts`),
REQ-CONFIG-323's runtime policy card is four toggles, and REQ-CONFIG-417's destination 1 does not name it; the desktop
save's own type (`DesktopSave.runtime`) does not list it either. Noticed on 2026-10-07 while building PD-CONFIG-003 (OQ-218,
T1), whose ruling names it as a note owed by whoever builds; both advocates read it as outside the four lists. Recorded,
not repaired, not classified.

## Specs

REQ-CONFIG-256, REQ-CONFIG-263, REQ-CONFIG-323, REQ-CONFIG-417 (the enumerations that omit it); REQ-CONFIG-118
(the key's policy home); PD-LIBRARY-002 sits beside it for the retrospective's own bound.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — the `improvement-timeout` control in the runtime policy card.
- `packages/ui/src/settings/config-state.ts` — `PendingSettings.runtime.improvement_collector_timeout`, saved and sent live.
- `packages/config/src/tiers.ts` — `TIER_B_RUNTIME_KEYS`, which omits it, so the live value never reaches a run start.
- `packages/config/src/writers.ts` — `DesktopSave.runtime`'s key union, which omits it while the writer writes it.

## Repaired — 2026-10-07, fin29 (PD-CONFIG-003 revision 2, OQ-223; REQ-CONFIG-256, REQ-CONFIG-262, REQ-CONFIG-263)

Classified by the R-072 consortium as its question IT1, ruled as [OQ-223](../../architecture/open-questions.md) (advocate A
followed) and recorded as [`PD-CONFIG-003`](../../product/directives.md#pd-config-003) revision 2: the control stays, and every
list now names the key. `DESKTOP_SAVE_RUNTIME_KEYS` (`packages/contracts/src/config.ts`) closes `DesktopSaveSchema.runtime` —
REQ-CONFIG-256's eight, `child_timeout`, `improvement_collector_timeout` and the six confinement and egress fields — and types
`DesktopSave.runtime` (`packages/config/src/writers.ts`); `TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`) gains the key,
so the on-screen value reaches the next run start; the control (`packages/ui/src/settings/ConfigSettings.tsx`) takes whole
seconds clamped 10–600 with a "seconds" suffix, an `aria-description` of the stored seconds, a plain hint and a stored-value line
(`improvementTimeoutForDisplay`, `improvementTimeoutFromInput`, `improvementTimeoutEdit`, `storedImprovementTimeoutNote` in
`config-state.ts`). Pinned by `settings/improvement-timeout.test.ts` (the clamp, the keystroke rule, the stored line, the
control drawn after the toggle at 60 and as 10 and 600 for a stored 5 and 900 with the form clean, the save carrying the key
only after an edit, the live state, and the screen's runtime keys equal to the closed list), `writers.test.ts` (the save writes
120 and refuses 0; a live 120 reaches the resolved runtime; Tier B's keys equal the closed list less the six) and
`contracts.test.ts` (an unlisted runtime key is refused), each red on the source before but the save's write, which the writer
already did. Driven in the built app (`pnpm app:drive`): a default install read "Improvement analysis timeout 60 seconds"
directly after the toggle, the field 66 px wide like the per-agent timeout's; 120 typed and saved wrote
`improvement_collector_timeout: 120` into the workspace file and the next run start logged `improvement_collector_timeout=120
s`; a workspace stating 900 read 600 with "Stored as 900 seconds; kept until you change this field." and "All changes saved".
Driving also found the keystroke clamp that made `120` untypable (it became `600`); this control holds a draft until the value
is in range or the field loses focus, and the same fault in the other Runtime number fields is recorded open:
[`a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md`](a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md).
