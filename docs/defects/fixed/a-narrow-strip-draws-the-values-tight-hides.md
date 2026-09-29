## A narrow composer strip draws the values the tight strip hides

PD-CHAT-001 revision 3 shortens the strip in two steps, and `narrow` shortens "additionally". The CSS named `tight`
alone for the first step's rules: the reasoning effort, the run-start mode, the permission mode and the token
estimate. So a dock below 700 px drew those four values again, and the strip scrolled. At a 548 px dock, a paused
session's strip was 80 px wider than its dock, and "Continue with a message" was cut behind the hidden scrollbar.

Noticed 2026-09-27 by the second adversarial review of PD-ORCH-005 phase 5, measured in the built app at 1240×800 and
1280×800.

## Specs

`PD-CHAT-001` revision 3, "The compact strip": "`narrow` additionally shortens persona and model".

## Relevant files

- `packages/ui/src/shell.css` — the compact-strip rules.
- `packages/ui/src/WorkspaceView.tsx` — `stripDensity` and `data-compact`.

## Repaired — 2026-09-27

By PD-ORCH-005 phase 5's second repair. Each of the first step's rules now matches both densities,
`:is([data-compact='tight'], [data-compact='narrow'])`, and the second step stays `narrow`'s alone.

Evidence: the built app with the configured model and `autonomous`, paused, with three agents to resume. At 1240×800
the dock is 548 px and the strip's scroll width is 546 of 546. At 1280×800 the dock is 588 px and the strip is 586 of
586. There is no unit test: vitest has no DOM, and no layout is computed in it.
