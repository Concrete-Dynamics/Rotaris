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

## Repaired 2026-10-03

The three listeners now go through one relay, `onConsoleWarning` in `apps/desktop/src/main/capture/console-relay.ts`,
which registers a single-parameter listener on the details event (Electron 44.1.1's `electron.d.ts` types the event's
one argument as `Event<WebContentsConsoleMessageEventParams>` with `message`, `level`, `lineNumber` and `sourceId`, and
marks the positional `level, message, line, sourceId` deprecated) and relays what `level >= 2` relayed before: the
`warning` and `error` levels. The main window's capture log line, the persona window's and the theme proof's collected
errors keep their wording.

Evidence:

- `apps/desktop/src/main/capture/console-relay.test.ts` — the relay registers one listener whose arity is 1 and relays
  warnings and errors only; and no file under `apps/desktop/src` but the relay names `console-message`, which fails
  against the unrepaired three files (it lists `main/capture/index.ts`, `main/capture/theme-proof.ts` and
  `main/main-windows.ts`).
- `pnpm transcript-proof --only=behaviour`, whose replica logs a renderer warning: against a build of the unrepaired
  listeners `behaviour.log` carries the relayed `capture: renderer console: [replica] gap on S1200 …` line **and**
  Electron's `'console-message' arguments are deprecated` line; repaired, the relayed line stands and the deprecation
  line is gone. Both passed.
