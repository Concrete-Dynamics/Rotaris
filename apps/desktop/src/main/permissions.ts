/**
 * What the application grants its renderer's device and browser requests (OQ-459).
 *
 * Until dictation no handler was set, and Electron's default answers yes to everything a page asks. Now: the microphone, audio
 * alone, for the application's own pages; the clipboard write its copy buttons use (`navigator.clipboard.writeText`:
 * `Notice.tsx`, `TranscriptSurface.tsx`, `TerminalWindow.tsx`); and nothing else. A page the application navigated to by mistake
 * asks with a different URL and is refused the microphone and the clipboard.
 *
 * A port, so the rule is tested without Electron. `details` holds what Electron's request and check handlers each pass: the first
 * names `mediaTypes` and `requestingUrl`, the second `mediaType` and `requestingUrl` (where it has one) beside the origin.
 */
export interface PermissionDetails {
  readonly mediaTypes?: readonly string[] | undefined;
  readonly mediaType?: string | undefined;
  readonly requestingUrl?: string | undefined;
}

export interface PermissionSession {
  setPermissionRequestHandler(handler: (webContents: unknown, permission: string, callback: (granted: boolean) => void, details: PermissionDetails) => void): void;
  setPermissionCheckHandler(handler: (webContents: unknown, permission: string, origin: string, details: PermissionDetails) => boolean): void;
}

/** Whether a URL is one of the application's own pages: the built `file:` renderer, or the dev server `electron-vite` names. */
export function isOwnPage(url: string | undefined, devServerUrl: string | undefined): boolean {
  if (url === undefined) return false;
  if (url.startsWith('file://')) return true;
  if (devServerUrl === undefined || devServerUrl === '') return false;
  try { return new URL(url).origin === new URL(devServerUrl).origin; } catch { return false; }
}

/**
 * A write with no press behind it (the copy of a line after an await, a window not long focused) reaches the check handler
 * under `clipboard-read`, measured 2026-10-30: `writeText` failed "Write permission denied" until that name was answered yes.
 */
const CLIPBOARD_WRITE_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'clipboard-read']);

export function permissionGranted(permission: string, details: PermissionDetails, url: string | undefined, devServerUrl: string | undefined): boolean {
  if (!isOwnPage(url, devServerUrl)) return false;
  if (CLIPBOARD_WRITE_PERMISSIONS.has(permission)) return true;
  if (permission !== 'media') return false;
  const asked = details.mediaTypes ?? (details.mediaType === undefined || details.mediaType === 'unknown' ? [] : [details.mediaType]);
  return asked.every((type) => type === 'audio');
}

export function installPermissionHandlers(session: PermissionSession, devServerUrl: string | undefined): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => { callback(permissionGranted(permission, details, details.requestingUrl, devServerUrl)); });
  session.setPermissionCheckHandler((_contents, permission, origin, details) => permissionGranted(permission, details, details.requestingUrl ?? origin, devServerUrl));
}
