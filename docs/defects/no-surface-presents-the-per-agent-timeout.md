## No surface presents the per-agent timeout

REQ-MONITOR-286 names three interface-level delegation controls: the depth cap, the fan-out limit, and "the per-agent
timeout, presented in minutes, being the per-agent hard timeout REQ-ORCH-088 fixes rendered in that unit", each initialised
from the policy value it governs. The build presents the first two (Settings › Runtime › Delegation limits,
`packages/ui/src/settings/ConfigSettings.tsx`) and the third nowhere: the configuration snapshot carries no
`child_timeout` (`RuntimeViewSchema`, `packages/contracts/src/config.ts`), nothing in `packages/ui` reads it, the advanced
runtime card shows a key only when a file states it (REQ-CONFIG-471), and the Overview caps line is count against cap
(REQ-MONITOR-169). A user whose child fails with "Child timed out after 1200s" — every duress live run met it (the
`c2fdd6a` and `c2a9444` autopsies: 66 % and 61.5 % of the run behind that ceiling) — has no way to see the limit, and the
only way to change it is a YAML key in seconds.

Raised from the final live runs' findings and ruled the same day as T1 under the owner's delegation
([R-072](../product/requests.md#r-072)), recorded as OQ-218: the control is built as a third delegation limit
(PD-CONFIG-003). Recorded here before the code, 2026-10-07.

## Specs

REQ-MONITOR-286 (the per-agent timeout, presented in minutes, initialised from its policy value); REQ-ORCH-088 and
REQ-CONFIG-113 (the key, its unit and its 1200 s default); REQ-CONFIG-322 (Delegation limits as two controls, which a
third control departs from — a directive's to decide).

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — Delegation limits: the depth cap and the fan-out limit only.
- `packages/ui/src/settings/config-state.ts` — the pending runtime holds no `child_timeout`.
- `packages/contracts/src/config.ts` — `RuntimeViewSchema` carries no `child_timeout`.
- `packages/config/src/snapshot.ts`, `packages/config/src/tiers.ts`, `packages/config/src/writers.ts` — the snapshot, the
  Tier B overlay and the desktop save, none of which carries the key.
