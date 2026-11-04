# `driver-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/driver-proof.mjs`](../../apps/desktop/scripts/driver-proof.mjs).

The driver seam `pnpm app:drive` depends on — and that its `quit` brings a live run to rest, its shot straight after a navigation shows the new view, and it answers an approval in its dialog and probes a persona window; scenario 13c holds two main windows on two workspaces and asserts that a persona window's `config.read` and a terminal window's `session.list` answer for the main window that owns them, not the active one (REQ-MONITOR-069, REQ-STARTUP-163; `docs/archive/defects/a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md`); since 2026-10-07 launch 13d quits while a foreground `terminal` call runs and reads its record `interrupted`, with no exit code and no issue (PD-TOOLS-013; `docs/archive/defects/a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md`)

Since 2026-11-01 (R-091, `docs/architecture/hardening.md` §3.1) step 9b is the first execution of the web-contents guard
(`apps/desktop/src/main/web-contents-guard.ts`, OQ-466's `isApplicationPage`): the driven page calls
`window.open('https://example.invalid/…')` and sets `location.href` to the same origin; the proof asserts that
`window.open` returns `null`, that the window still shows the application's page afterwards, and that the application log
holds exactly two `warning` lines, `window refused: …` and `navigation refused: will-navigate to https://example.invalid, …`,
each naming the origin and neither the path nor the query (Electron security checklist 13 and 14; PD-MONITOR-002).

Since 2026-11-02 (R-091 bundle A2, `docs/architecture/hardening.md` §3.1 rows 4 and 7) steps 9c, 13a and 13c read the web
preferences of the main window, the approval dialog and the persona and terminal windows back from Electron through the
driver's `webPreferences` op (`webContents.getLastWebPreferences()`) and assert the secure set every window spreads
(`apps/desktop/src/main/secure-web-preferences.ts`); step 9d asks OQ-459's policy from the application's own page —
the microphone and the clipboard write `granted`, a camera, a location and a notification refused, `getDisplayMedia` and
`getUserMedia({ video })` `NotAllowedError` — and notes the HID, serial and USB devices the page holds.

Since 2026-11-04 (R-091 bundle F3, `docs/architecture/hardening.md` §3.5 row 7 and §3.1 row 6) step 9e measures the command
boundary in the built app. The page sends two requests through its own preload channel (`window.rotaris.command`, the sender
check included): a kind the contract does not have, answered `{ ok: false, code: 'command.malformed' }` with the headline
"The request could not be read: the kind is not valid", and a `session.start` whose prompt is 2,000,000 characters, answered
`command.malformed` with "The prompt is longer than 1,048,576 characters" (OQ-467's bound), the value echoed neither in the
answer nor in the log. Each step's one line in the application log is the driver's own for the eval that sent it: a malformed
request is refused as a value and the product writes none ([OQ-485](../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-485)
asks whether it should). The driver's `commandThrowing` op (`apps/desktop/src/main/driver.ts`, compiled out of a packaged
build with the rest of the driver) then sends `theme.get` through main's own `dispatchCommand` over a table in which every
handler throws, since no product handler throws on purpose: the answer is `command.failed`, "The command failed", its detail
the thrown message through the redaction pass (`token=***`), and the log holds exactly one `error` line,
`command theme.get failed: its handler threw; answered command.failed (ADR-0019)`, followed by the redacted stack, and the
secret nowhere (ADR-0019, REQ-TOOLS-171). First execution 2026-11-04 on Windows 11 ARM64: all four checks of 9e passed in
the second run; the first run's slice of the log missed each step's first line (the harness's, repaired before the second).
