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
