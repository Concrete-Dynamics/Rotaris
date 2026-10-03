## The capture's console relay listens with the deprecated console-message arguments

Observed 2026-10-03 by the orchestrator's default live run at origin/main `1763f7f` (pack `2026-10-03T05-56-27-364Z`,
finding D8 of its autopsy): `edit/app.log` line 97 reads "(electron) 'console-message' arguments are deprecated and will
be removed. Please use Event<WebContentsConsoleMessageEventParams> object instead." The same line stands in the logs
of the proofs whose renderer writes a warning (chat-controls-proof, mission-proof, transcript-proof, artifacts-proof
on 2026-10-03). The three capture-mode listeners take the positional form `(event, level, message, line, sourceId)`,
which Electron 44 (the version this repository pins) marks deprecated in favour of the single details event
(`message`, `level` as `info`/`warning`/`error`/`debug`, `lineNumber`, `sourceId`). Cosmetic today; when Electron
removes the positional arguments, the relay that explains a blank window in a proof's log (Part O) stops relaying.

## Specs

None contradicted: the relay is proof and capture harness, not product behaviour.

## Relevant files

- `apps/desktop/src/main/capture/index.ts` — the main window's relay of renderer warnings and errors into the capture log.
- `apps/desktop/src/main/main-windows.ts` — the same relay for a persona window, in capture mode only.
- `apps/desktop/src/main/capture/theme-proof.ts` — the theme proof's collection of renderer errors.

Noticed 2026-10-03 by the autopsy of the live run at `1763f7f`; recorded before the repair.
