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

## Repaired — 2026-10-06

Repaired on `finacc2-accept1-1` (acceptance finding A3). The cause was a coordinate press at a box measured before the
notice slot filled, and nothing that read what the press met; the repair waits for the box to settle and reads it.

- `apps/desktop/src/main/driver.ts`: `click` takes `settle`. `settleScript` measures the match, lets `SETTLE_FRAMES`
  (two) of the renderer's frames begin, and measures again; the match is pressed only when its box is unchanged and
  `elementFromPoint` at its centre is the match or inside it. A one-shot capture `mousedown` listener armed in the same
  script records what the press met, and `LANDING_SCRIPT` reads it after the press: a press that met something else is
  refused ("the click at (x, y) on … did not land: the press met …"); a window that cannot answer is `landed: null`, not a
  miss. A match that never settles is refused at the timeout with why ("moved from …", "covered by …"). A plain `click`
  is unchanged.
- `apps/desktop/scripts/lib/driver.mjs`: `clickLanded` asks for the settled click and presses again only after a press
  that did not land, up to three presses, returning the misses so a proof can report them.
- `apps/desktop/scripts/driver-proof.mjs`: 13b and 13c open the persona window through `popOutPersona`, which waits
  for the row whose persona cell reads `coding-agent`, presses that row's Pop out with `clickLanded`, and waits 15 s
  for `persona:coding-agent`. A press that landed and opened no window then fails as REQ-SHELL-072's, naming the press.
  13c gains the check "the child's Pop out, pressed on its settled row, landed and opened its persona window".
- `pnpm app:drive click … --settle` reaches the same option (AGENTS.md, "Driving the built app").

Pinned by `apps/desktop/src/main/driver.test.ts` ("the driver's settled click", five cases: the press waits for the
settled box and goes to its centre, not the first measurement's; a press that met something else is refused, naming
it; a covered target is never pressed; an unanswerable landing is unknown; a plain click is unchanged). The first four
fail against the driver before the repair. `apps/desktop/scripts/lib/driver.test.ts` ("clickLanded", three cases)
pins the retry rule.

Shown by `xvfb-run -a node apps/desktop/scripts/driver-proof.mjs --skip-build` (what `pnpm driver-proof` runs) on the
built branch: eight runs, 27 passed and 0 failed in each, at load averages of 8.2 to 22.1 on four CPUs (another agent's
work was running beside them). Five ran before `SETTLE_FRAME_BOUND_MS` was added (each frame wait bounded at 100 ms so a
window that paints nothing still answers) and three after it. 13c's press landed on the first try every time, 123 to
148 ms after the request, so the settle wait outlasted the notice's arrival. The first run's `family-app.log`: notice at
03:49:05.059, Ctrl+3 at .089, the press at .383, the persona window created at 03:49:07.227.

The refusals were driven once on the real renderer as well, by a throwaway script against the built app that is not
kept. A settled click on the rail's Workspace landed (`landed: true`, 119 ms). On Overview under an injected
`translateX` animation it was refused as "matched but did not settle within 800 ms: last moved from {…}". Under a
transparent full-window overlay it was refused as "… last covered by div". With a `mousemove` listener that moved the
item away under the press, it was refused as "the click at (45, 172) … did not land: the press met nav.nav-rail …".
