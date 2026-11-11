## `pnpm ui-audit` sweeps the Overview only in its empty state, so no audit reads the delegation cards

Found on 2026-11-11 by the proof cascade for [`PD-MONITOR-009`](../product/directives/pd-monitor-009.md#pd-monitor-009);
recorded, not repaired.

`apps/desktop/scripts/ui-audit.mjs` launches the built application on a scratch profile that holds no session and sweeps
each primary view as it then draws. The Overview with no session and none stored draws its onboarding empty state and
none of its cards (REQ-MONITOR-165), so the audit's four sweeps (tracks, containment, stacking, trapped) and its
layout-contract evaluation never see the metric cards, the sessions card, the delegation graph card or the agent
activity table. `overview-agents-first-dot`'s `align-x` relation on `overview-agents-kicker`, which the graph card
publishes, is therefore evaluated by no run of the audit; that was already so for the Overview's old tree card.

What PD-SHELL-015 changed is the Mission view's share: until then the audit swept Mission as its third view, where the
graph card, the settings card and the table drew even with no session (their empty forms). That sweep is gone with the
view, and nothing replaced it in the audit. The two cards' geometry is read by `pnpm mission-proof` instead: its first
launch reads where they stand, and its launch `table-forms` reads the table's one-line form at 1440×900 and its
three-line form at 1000×680 with the card's scroll width against its client width. Those are assertions on named
readings, not the audit's four general sweeps.

A repair would give the audit's profile one finished scripted run before the sweep, so the Overview draws its grid.

## Specs

None contradicted: the audit reports and does not assert (`docs/proofs/ui-audit.md`). `docs/design/README.md` §7's "match
after drawing" and REQ-SHELL-022's minimum-size conditions are what the lost sweep served for these two cards.

## Relevant files

- `apps/desktop/scripts/ui-audit.mjs` — the profile it launches and the views it sweeps.
- `packages/ui/src/OverviewView.tsx` — the empty state that stands in for the grid.
- `apps/desktop/scripts/mission-proof.mjs` — the launches that read the two cards.
