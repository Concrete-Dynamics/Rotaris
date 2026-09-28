## The built application opens a connection to Chromium's component updater on launch

A driven launch of the built application on Linux (`pnpm updater-proof`, 2026-09-28) started Electron with
`--proxy-server=127.0.0.1:<port>` pointing at a sink that records every connection Chromium's network stack makes.
During one launch to first paint and an orderly quit — a scripted model dialect, no provider, no update check (the
source-tree build is not updatable) — the sink recorded exactly one connection: `CONNECT redirector.gvt1.com:443`.
That host is Google's redirector for component downloads, which Chromium's own component updater contacts on its own
schedule (the CRL set, Widevine and the like). Nothing in the product asked for it; it came from the runtime the
product is built on, and it will come from a packaged build the same way unless the switch that turns the component
updater off is set before the browser process starts.

The record is `.proof/updater-proof/proxy-record.json` after a run of the proof; the proof itself asserts only that
no connection for `github.com` was made, which is its subject, and reports the total so this one is visible.

## Specs

REQ-STARTUP-160: the About & Legal surface discloses the network activity the specification requires and "SHALL name
no host, endpoint, or request this document does not require, so a build whose disclosure and behavior disagree is
non-conformant on the disclosure" — a request the product makes that its disclosure cannot name is exactly that
disagreement. REQ-SHELL-005: in demo mode "the process opens no outbound network connection for its whole lifetime";
this connection is the runtime's and would be made in a demo window too (the demo entry is not built, so it is not
yet observable there). REQ-STARTUP-159 is not contradicted — the window paints with the network blocked, and the
request simply fails — but a machine whose network is blocked for the release gate would see the attempt.

## Relevant files

- `apps/desktop/src/main/index.ts` — where a Chromium command-line switch is appended before `app.whenReady()`
  (`app.commandLine.appendSwitch`, as the capture scale already is). Electron exposes Chromium's switches; the one that
  disables the component updater is the lever to measure, and the packaged Windows build must be measured making no
  such connection afterwards.
- `apps/desktop/scripts/updater-proof.mjs` — the proxy sink that recorded it; its report could be made to assert zero
  connections in all once the repair lands, which would keep the finding found.

Noticed 2026-09-28 while running the updater's first execution (first-release-plan.md §4.6, R-062). Not repaired
here: it is outside the updater item and needs a measurement of the switch's effect on the platform.
