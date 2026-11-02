/**
 * What the application grants its renderer's device and browser requests (OQ-459, ruled 2026-11-01).
 *
 * Until dictation no handler was set, and Electron's default answers yes to everything a page asks. Now one default-deny policy,
 * installed on every session as it is created: the microphone, audio alone, for the application's own pages; the clipboard
 * write its copy buttons use (`navigator.clipboard.writeText`: `Notice.tsx`, `TranscriptSurface.tsx`, `TerminalWindow.tsx`),
 * under both names Chromium asks it by; and nothing else, to any page. Since 2026-11-02 (R-091, bundle A2) the device handler
 * refuses every HID, serial and USB device and the display-media handler grants no stream, so neither falls back to
 * Electron's default; and "own page" is `isApplicationPage`, OQ-466's one predicate, rather than any `file:` URL.
 *
 * A port, so the rule is tested without Electron. `details` holds what Electron's request and check handlers each pass: the first
 * names `mediaTypes` and `requestingUrl`, the second `mediaType` and `requestingUrl` (where it has one) beside the origin.
 */
import { fileURLToPath } from 'node:url';
import { posix, win32 } from 'node:path';

export interface PermissionDetails {
  readonly mediaTypes?: readonly string[] | undefined;
  readonly mediaType?: string | undefined;
  readonly requestingUrl?: string | undefined;
}

/** What Electron's display-media handler is answered with: no `video` and no `audio` is a refusal. */
export interface DisplayMediaStreams {
  readonly video?: unknown;
  readonly audio?: unknown;
}

export interface PermissionSession {
  setPermissionRequestHandler(handler: (webContents: unknown, permission: string, callback: (granted: boolean) => void, details: PermissionDetails) => void): void;
  setPermissionCheckHandler(handler: (webContents: unknown, permission: string, origin: string, details: PermissionDetails) => boolean): void;
  /** HID, serial and USB (`navigator.hid`, `navigator.serial`, `navigator.usb`): a handler answering false refuses the device. */
  setDevicePermissionHandler(handler: (details: { readonly deviceType: string; readonly origin: string }) => boolean): void;
  /** `navigator.mediaDevices.getDisplayMedia`: the callback answered with neither stream refuses the capture. */
  setDisplayMediaRequestHandler(handler: (request: unknown, callback: (streams: DisplayMediaStreams) => void) => void): void;
}

/**
 * The application's own page, defined once (OQ-466, ruled 2026-11-01): the built renderer's `index.html` in the application's
 * own renderer directory, which every window loads with `loadFile` (a role rides in the query), or, while the application is
 * not packaged, the development server `electron-vite` names (`ELECTRON_RENDERER_URL`), by its exact origin.
 *
 * `platform` is the host's unless a test names another: the path rule is the platform's (Windows folds case and reads a drive
 * and a UNC host; POSIX does neither), so a test can hold each rule on any host.
 */
export interface ApplicationPages {
  /** The absolute path of the built renderer's `index.html`: `join(__dirname, '../renderer/index.html')` in main's bundle. */
  readonly rendererIndex: string;
  /** The development server's URL, or undefined in a packaged build, where no development server is the application's. */
  readonly devServerUrl: string | undefined;
  readonly platform?: NodeJS.Platform;
}

/**
 * Whether `url` is the application's own page (OQ-466): a `file:` URL whose decoded, normalised path is `rendererIndex` — the
 * query and the fragment are the page's own and do not count — or a URL of the development server's exact origin, compared as
 * parsed origins and never by prefix. Refused: a sibling file, a traversal or an encoded one (a URL carrying an encoded
 * separator does not convert to a path at all), another drive, a UNC host, every other scheme (`http:`, `https:`,
 * `javascript:`, `data:`, `about:`), an empty string, and anything that does not parse.
 *
 * The navigation guard (`web-contents-guard.ts`), the dispatcher's sender check (`command-sender.ts`) and, since 2026-11-02
 * (bundle A2, `docs/architecture/hardening.md` §3.1 row 7), the permission handlers below read it.
 */
export function isApplicationPage(url: string | undefined, own: ApplicationPages): boolean {
  if (url === undefined || url === '') return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol === 'file:') {
    const windows = (own.platform ?? process.platform) === 'win32';
    const paths = windows ? win32 : posix;
    let path: string;
    try { path = fileURLToPath(parsed, { windows }); } catch { return false; }
    const asked = paths.normalize(path);
    const index = paths.normalize(own.rendererIndex);
    return windows ? asked.toLowerCase() === index.toLowerCase() : asked === index;
  }
  if (own.devServerUrl === undefined || own.devServerUrl === '') return false;
  try {
    const dev = new URL(own.devServerUrl);
    return dev.origin !== 'null' && parsed.origin === dev.origin;
  } catch { return false; }
}

/**
 * What a log line may say of a URL (PD-MONITOR-002): its origin, or for a URL whose origin is opaque (`file:`, `data:`,
 * `javascript:`) its scheme alone — never a path or a query, which may carry what a line must not.
 */
export function urlOriginForLog(url: string | undefined): string {
  if (url === undefined || url === '') return 'an empty URL';
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? parsed.protocol : parsed.origin;
  } catch { return 'an unreadable URL'; }
}

/**
 * A write with no press behind it (the copy of a line after an await, a window not long focused) reaches the check handler
 * under `clipboard-read`, measured 2026-10-30: `writeText` failed "Write permission denied" until that name was answered yes.
 */
const CLIPBOARD_WRITE_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'clipboard-read']);

/**
 * Whether `permission` is granted to the page at `url` (OQ-459's ruling). The page must be the application's own
 * (`isApplicationPage`). `media` is granted only when what is asked is a list that is not empty, names no `unknown` type and
 * names `audio` alone: a check that names no type, or `unknown`, is refused (until 2026-11-02 `[].every` granted it).
 */
export function permissionGranted(permission: string, details: PermissionDetails, url: string | undefined, own: ApplicationPages): boolean {
  if (!isApplicationPage(url, own)) return false;
  if (CLIPBOARD_WRITE_PERMISSIONS.has(permission)) return true;
  if (permission !== 'media') return false;
  const asked = details.mediaTypes ?? (details.mediaType === undefined ? [] : [details.mediaType]);
  return asked.length > 0 && asked.every((type) => type === 'audio');
}

/**
 * Install the one policy on a session: the request and check handlers over `permissionGranted`, a device handler that refuses
 * every device, and a display-media handler that grants no stream — to any page, the application's own included (OQ-459).
 */
export function installPermissionHandlers(session: PermissionSession, own: ApplicationPages): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => { callback(permissionGranted(permission, details, details.requestingUrl, own)); });
  session.setPermissionCheckHandler((_contents, permission, origin, details) => permissionGranted(permission, details, details.requestingUrl ?? origin, own));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => { callback({}); });
}
