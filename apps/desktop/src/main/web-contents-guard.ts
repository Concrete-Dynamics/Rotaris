/**
 * The web-contents guard (R-091, `docs/architecture/hardening.md` §3.1; ADR-0044, REQ-SHELL-023): what a page may do to the
 * window it is shown in. Installed once, on `app.on('web-contents-created')` before `app.whenReady()`, so every web contents
 * the application ever builds — each main, persona, terminal and dialog window — is guarded from its first navigation.
 *
 * - `will-navigate` and `will-redirect` are refused unless the target is the application's own page (`isApplicationPage`,
 *   OQ-466's one predicate; the Electron security checklist, item 13). Main's own `loadFile` and `loadURL` raise no
 *   `will-navigate`; a page's own navigation (a link, `location.href`) and a redirect on the way to any page do.
 * - `setWindowOpenHandler` denies every request (item 14): the product opens an external link through
 *   `main/commands/shell.ts`'s `shell.openExternal` command, never through `window.open` or a `target` link.
 * - `will-attach-webview` is refused (item 12): no window enables `webviewTag`, so this is defence in depth.
 *
 * Each refusal writes ONE application-log line at `warning` naming the URL's origin alone (PD-MONITOR-002): a path or a query
 * may carry what the log must not hold.
 *
 * A port, so the rule is tested without Electron: `GuardedContents` is the slice of `WebContents` the guard touches.
 */
import { isApplicationPage, urlOriginForLog, type ApplicationPages } from './permissions.js';

/** What `will-navigate` and `will-redirect` hand their listener: Electron's event carries the URL, as does the deprecated second argument. */
export interface NavigationEvent {
  preventDefault(): void;
  readonly url?: string;
}

export interface GuardedContents {
  on(event: 'will-navigate' | 'will-redirect', listener: (event: NavigationEvent, url?: string) => void): unknown;
  on(event: 'will-attach-webview', listener: (event: { preventDefault(): void }, webPreferences: unknown, params: { readonly src?: string }) => void): unknown;
  setWindowOpenHandler(handler: (details: { readonly url: string }) => { action: 'deny' }): void;
}

export interface GuardedApp {
  on(event: 'web-contents-created', listener: (event: unknown, contents: GuardedContents) => void): unknown;
}

/** Guards one web contents. Exported for the test; the product reaches it through `installWebContentsGuard`. */
export function guardWebContents(contents: GuardedContents, own: ApplicationPages, warn: (message: string) => void): void {
  const navigation = (which: 'will-navigate' | 'will-redirect') => (event: NavigationEvent, url?: string): void => {
    const target = event.url ?? url;
    if (isApplicationPage(target, own)) return;
    event.preventDefault();
    warn(`navigation refused: ${which} to ${urlOriginForLog(target)}, which is not the application's own page (Electron security checklist 13; OQ-466)`);
  };
  contents.on('will-navigate', navigation('will-navigate'));
  contents.on('will-redirect', navigation('will-redirect'));
  contents.setWindowOpenHandler((details) => {
    warn(`window refused: a page asked to open ${urlOriginForLog(details.url)}; the application opens no window from a page (Electron security checklist 14)`);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event, _webPreferences, params) => {
    event.preventDefault();
    warn(`webview refused: a page asked to attach ${urlOriginForLog(params.src)} (Electron security checklist 12)`);
  });
}

/** Registers the guard for every web contents the application builds. Call before `app.whenReady()`. */
export function installWebContentsGuard(app: GuardedApp, own: ApplicationPages, warn: (message: string) => void): void {
  app.on('web-contents-created', (_event, contents) => { guardWebContents(contents, own, warn); });
}
