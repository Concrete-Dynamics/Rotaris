## driver-proof clicks Pop out at a box the notice banner moves

Scenario 13c of `pnpm driver-proof` starts a delegated run, switches to the Mission view with Ctrl+3 and clicks
`.agent-table__row .btn` with the text `Pop out` straight away. The driver's `click` takes the first match's box and
sends `mouseMove`, `mouseDown` and `mouseUp` at its centre, and nothing checks that those events reached the button
(`apps/desktop/src/main/driver.ts`, `click`). In the orchestrator's acceptance run 1 on 2026-10-06 (01:55:18, load 2.22
to 3.82) the click went 181 ms after the view switch; main never received `window.openPersona` (neither "persona window
… created" nor "not opened: no session is followed"), and 13c threw after 15 s: "the persona window listed did not hold
within 15000 ms; last seen {windows:[family-a], auxiliary:[]}". A re-run passed (click at 02:18:49.254, the persona
window created at 02:18:50.800).

Confirmed on branch `finacc2-accept1-1` at `27a5127` with the built app (load 2.55 to 2.98): three launches replaying
13c's start recorded the Pop out button's box on every frame after Ctrl+3. Each time the button stood at y=199 for the
first frames, at y=274 from 56 to 80 ms after the switch, and at y=296 from 319 to 610 ms after it: the "No model provider is authenticated
yet" notice fills the shell's notice slot (0, then 75, then 97 px high) above the views and pushes the table down. A
click measured before the notice and sent after it lands 63 px or more above the button. The child's row is present
from the first frame; what is unsettled is the shell above it, not the table.

## Specs

None contradicted: the driver and the proof are verification tools. What 13c measures is REQ-SHELL-072 (a persona
window opened from the Mission table), REQ-MONITOR-069 and REQ-STARTUP-163 (its commands answer for the main window
that owns it); a lost click left all three unmeasured in that run.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — 13b and 13c click Pop out straight after Ctrl+3.
- `apps/desktop/src/main/driver.ts` — `click`: one measurement, a coordinate click, no check that it landed.
- `packages/ui/src/AgentTable.tsx` — the row (`data-agent-id`) and its Pop out button.
- `packages/ui/src/AppShell.tsx`, `packages/ui/src/shell.css` (`.notice-slot`) — the notice banner above the views.
