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

## Repaired 2026-09-28 under [R-062](../../product/requests.md#r-062)

**The cause named above was wrong, and is kept here beside the one measured.** The connection is not Chromium's
component updater. A Chromium net-log of the same launch (`--log-net-log`) named the request the sink saw as a CONNECT:
`GET https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic` — the Hunspell dictionary Electron's built-in
spellchecker downloads for the OS locale when a session is created (Electron documents the default: "By default Electron
will download hunspell dictionaries from the Chromium CDN"; on macOS the OS spellchecker is used and nothing is
downloaded). Measured on the built application under Xvfb, one launch each, the proxy sink and the net-log read together:

| Lever tried | Connections at the sink |
|---|---|
| none (the note's run) | `CONNECT redirector.gvt1.com:443` |
| `--disable-component-update` on the command line | the same — so no switch is appended for it |
| `session.defaultSession.setSpellCheckerEnabled(false)` after `whenReady` | the same |
| `webPreferences.spellcheck: false` on every window | the same |
| `setSpellCheckerEnabled(false)` in `session-created`, and a second launch with it persisted | the same, both launches |
| `setSpellCheckerLanguages([])` in `session-created` (with or without the spellchecker off) | **none** — also none with text typed into a text area |

No Chromium switch turns the download off, and nothing that runs after the session exists does either: the dictionary
load begins while the session is built. Electron's `session-created` event fires synchronously then, and emptying the
dictionary list there discards the loaders before their file check returns. `apps/desktop/src/main/runtime-requests.ts`
(`withoutRuntimeRequests`) does that and turns the spellchecker off, so no text field later asks for a dictionary of its
own; `index.ts` registers it on `app.on('session-created')` before `app.whenReady()`. The consequence the user sees is
that no text field underlines a misspelling, which the specification does not speak to: **OQ-93** asks it (raised as OQ-91 on its branch, renumbered OQ-93 at the merge).

**The proof now asserts the finding stays found.** `pnpm updater-proof` checks that the sink records **zero**
connections from launch to first paint and an orderly quit (REQ-STARTUP-160, REQ-SHELL-005), beside its `github.com`
check, and writes a net-log so any connection arrives with the URL that made it. The two proxy records, 2026-09-28:

Before (`.proof/updater-proof/proxy-record.json`, the unrepaired build):

```json
[
  {
    "at": "2026-09-28T15:50:09.816Z",
    "from": "127.0.0.1:49166",
    "firstLine": "CONNECT redirector.gvt1.com:443 HTTP/1.1"
  }
]
```

After (the repaired build; 9 of 9 checks, the net-log naming no http(s) URL):

```json
[]
```

The same proof run against the unrepaired `index.ts` with the new check in place fails it, naming
`https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic`. **Pinned by** `apps/desktop/src/main/runtime-requests.test.ts`
(the dictionary list emptied, then the spellchecker off) and `pnpm updater-proof`'s zero-connection check.

**Not shown here.** The packaged Windows build: the session-level calls are the same there, but only the next
`pnpm package` on Windows, launched behind the same sink, can measure that it makes no such connection (IC-3). REQ-SHELL-005's demo mode is not built, so its whole-lifetime claim is not observed; this launch is
observed only to first paint and an orderly quit. About & Legal's disclosure needs no change: REQ-STARTUP-160 requires
it to name no host the document does not require, and the request it could not name no longer happens.
