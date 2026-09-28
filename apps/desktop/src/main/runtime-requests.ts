/**
 * The runtime makes no request of its own (REQ-STARTUP-160, REQ-SHELL-005).
 *
 * The built application, launched to first paint and quit with no provider and no update check, opened exactly one
 * connection: `CONNECT redirector.gvt1.com:443`. A Chromium net-log of the same launch (`--log-net-log`, 2026-09-28)
 * named the request — `GET https://redirector.gvt1.com/edgedl/chrome/dict/en-us-10-1.bdic` — which is the Hunspell
 * dictionary Electron's built-in spellchecker downloads for the OS locale when a session is created (Electron's
 * `Session.setSpellCheckerDictionaryDownloadURL` documentation: "By default Electron will download hunspell
 * dictionaries from the Chromium CDN"; macOS uses the OS spellchecker and downloads nothing). It was first taken for
 * Chromium's component updater; `--disable-component-update` was measured and changed nothing, so no switch is
 * appended for it — the note keeps the falsified reason beside this one
 * (`docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md`).
 *
 * No Chromium command-line switch turns the download off, and neither does anything that runs after the session
 * exists: `webPreferences.spellcheck: false` on every window, and `setSpellCheckerEnabled(false)` after `whenReady`
 * (and again on a second launch that had persisted it) all still made the request. What does is emptying the session's
 * dictionary list in Electron's `session-created` event, which fires synchronously while the session is built: the
 * dictionaries the constructor began loading are discarded before their file check returns, so no download starts.
 * The spellchecker is switched off with it, so no text field later asks for a dictionary of its own (measured: typing
 * into a text area made no request). REQ-STARTUP-160 names no such host and forbids the disclosure to name one the
 * document does not require; the specification says nothing about spell-checking a text field, and **OQ-91** asks it.
 */

/** The two calls of an Electron `Session` this uses — a port, so the rule is tested without Electron. */
export interface SpellcheckerSession {
  setSpellCheckerEnabled(enable: boolean): void;
  setSpellCheckerLanguages(languages: string[]): void;
}

/**
 * Leave a newly created session with no dictionary to download and no spellchecker to ask for one. Call it from
 * `app.on('session-created')`, which is registered before `app.whenReady()` so the default session is reached too.
 *
 * Measured on Linux only (IC-3). Should either call throw on another platform, the failure is reported through
 * `report` with its reason, naming REQ-STARTUP-160, rather than reaching main's uncaught-exception line unnamed; the
 * session is still built, and `pnpm updater-proof`'s zero-connection check is what would then go red.
 */
export function withoutRuntimeRequests(session: SpellcheckerSession, report: (message: string) => void): void {
  try {
    session.setSpellCheckerLanguages([]);
    session.setSpellCheckerEnabled(false);
  } catch (e) {
    report(`REQ-STARTUP-160: the spellchecker of a new session could not be turned off, so the runtime may request a dictionary of its own: ${e instanceof Error ? e.message : String(e)}`);
  }
}
