/**
 * One set of web preferences for every window the application builds (R-091, `docs/architecture/hardening.md` §3.1; the
 * Electron security checklist, items 3, 4, 6, 8, 9 and 10).
 *
 * Until 2026-11-02 each of the eight `new BrowserWindow` sites (the main window, the persona and terminal windows, and
 * main's five dialogs) wrote `{ sandbox: true, contextIsolation: true, nodeIntegration: false }` itself and left
 * `webSecurity`, `allowRunningInsecureContent`, `experimentalFeatures`, `enableBlinkFeatures` and `webviewTag` to Electron's
 * defaults, which nothing asserted. Now every site spreads this, and may add only `preload` (through the argument) and keys
 * that decide nothing about security, such as `backgroundColor` on the window itself; `rotaris/browser-window-uses-secure-prefs`
 * fails `pnpm lint` on a window built any other way, and `pnpm driver-proof` reads the main window's preferences back from the
 * built application (`webContents.getLastWebPreferences()`).
 *
 * `enableBlinkFeatures` is deliberately absent rather than written: absent is Electron's "no feature enabled", and the
 * object a caller spreads cannot carry a key a later spread could mistake for a choice.
 */
import type { WebPreferences } from 'electron';

/** The keys whose values decide the renderer's perimeter. A window site may set none of them itself. */
export const SECURITY_PREFERENCE_KEYS = [
  'sandbox',
  'contextIsolation',
  'nodeIntegration',
  'nodeIntegrationInWorker',
  'nodeIntegrationInSubFrames',
  'webSecurity',
  'allowRunningInsecureContent',
  'experimentalFeatures',
  'enableBlinkFeatures',
  'webviewTag',
] as const;

export type SecurityPreferenceKey = (typeof SECURITY_PREFERENCE_KEYS)[number];

/** What every window's renderer is built with. Frozen, so no caller can loosen the shared value in place. */
const SECURE: Readonly<WebPreferences> = Object.freeze({
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
});

/**
 * The web preferences of a window: the secure set, plus the preload script's absolute path where the window has one. A new,
 * frozen object each call; a site spreads it (`webPreferences: { ...secureWebPreferences(preload) }`).
 */
export function secureWebPreferences(preload?: string): Readonly<WebPreferences> {
  return Object.freeze(preload === undefined ? { ...SECURE } : { ...SECURE, preload });
}
