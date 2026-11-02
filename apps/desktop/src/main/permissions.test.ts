import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPermissionHandlers, isApplicationPage, permissionGranted, urlOriginForLog, type ApplicationPages, type DisplayMediaStreams, type PermissionSession } from './permissions.js';

const OWN = 'file:///opt/rotaris/out/renderer/index.html';
const PAGES: ApplicationPages = { rendererIndex: '/opt/rotaris/out/renderer/index.html', devServerUrl: undefined, platform: 'linux' };

interface Installed {
  request?: Parameters<PermissionSession['setPermissionRequestHandler']>[0];
  check?: Parameters<PermissionSession['setPermissionCheckHandler']>[0];
  device?: Parameters<PermissionSession['setDevicePermissionHandler']>[0];
  display?: Parameters<PermissionSession['setDisplayMediaRequestHandler']>[0];
}

/** A session that records the handlers installed on it, so each can be asked as Electron would ask it. */
function installed(): Installed {
  const handlers: Installed = {};
  installPermissionHandlers({
    setPermissionRequestHandler: (h) => { handlers.request = h; },
    setPermissionCheckHandler: (h) => { handlers.check = h; },
    setDevicePermissionHandler: (h) => { handlers.device = h; },
    setDisplayMediaRequestHandler: (h) => { handlers.display = h; },
  }, PAGES);
  return handlers;
}

describe('OQ-459 — what the renderer is granted (ruled 2026-11-01)', () => {
  it('grants the microphone, audio alone, to the application\'s own page', () => {
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, OWN, PAGES)).toBe(true);
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, `${OWN}?role=main`, PAGES)).toBe(true);
    expect(permissionGranted('media', { mediaType: 'audio' }, OWN, PAGES)).toBe(true);
    expect(permissionGranted('media', { mediaTypes: ['video'] }, OWN, PAGES)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio', 'video'] }, OWN, PAGES)).toBe(false);
    expect(permissionGranted('media', { mediaType: 'video' }, OWN, PAGES)).toBe(false);
  });
  it('refuses media when nothing or `unknown` is asked (`[].every` granted it before the ruling)', () => {
    expect(permissionGranted('media', { mediaTypes: [] }, OWN, PAGES)).toBe(false);
    expect(permissionGranted('media', {}, OWN, PAGES)).toBe(false);
    expect(permissionGranted('media', { mediaType: 'unknown' }, OWN, PAGES)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio', 'unknown'] }, OWN, PAGES)).toBe(false);
  });
  it('refuses a page that is not the application\'s own, any other `file:` page included', () => {
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'https://example.com/', PAGES)).toBe(false);
    expect(permissionGranted('clipboard-sanitized-write', {}, 'https://example.com/', PAGES)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, undefined, PAGES)).toBe(false);
    // Until 2026-11-02 every `file:` URL was an own page (`isOwnPage`); now only the built renderer's index.html is (OQ-466).
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'file:///home/someone/Downloads/page.html', PAGES)).toBe(false);
    expect(permissionGranted('clipboard-sanitized-write', {}, 'file:///', PAGES)).toBe(false);
  });
  it('reads the dev server by its exact origin, and only while one is named (unpackaged)', () => {
    const dev: ApplicationPages = { ...PAGES, devServerUrl: 'http://localhost:5173/' };
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'http://localhost:5173/?role=main', dev)).toBe(true);
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'http://localhost:5173.evil.test/', dev)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'http://localhost:5173/', PAGES)).toBe(false);
  });
  it('keeps the clipboard write the copy buttons use, under both names, and refuses the rest', () => {
    expect(permissionGranted('clipboard-sanitized-write', {}, OWN, PAGES)).toBe(true);
    expect(permissionGranted('clipboard-read', {}, OWN, PAGES)).toBe(true);
    for (const permission of ['notifications', 'geolocation', 'openExternal', 'pointerLock', 'midi', 'midiSysex', 'hid', 'serial', 'usb', 'display-capture', 'fullscreen', 'idle-detection', 'window-management']) {
      expect(permissionGranted(permission, {}, OWN, PAGES)).toBe(false);
    }
  });
  it('installs one handler for the request and one for the check, over the same rule', () => {
    const handlers = installed();
    const answers: boolean[] = [];
    handlers.request?.(null, 'media', (g) => answers.push(g), { mediaTypes: ['audio'], requestingUrl: OWN });
    handlers.request?.(null, 'geolocation', (g) => answers.push(g), { requestingUrl: OWN });
    handlers.request?.(null, 'media', (g) => answers.push(g), { mediaTypes: ['audio'], requestingUrl: 'file:///elsewhere/index.html' });
    expect(answers).toEqual([true, false, false]);
    expect(handlers.check?.(null, 'media', 'file:///', { mediaType: 'audio', requestingUrl: OWN })).toBe(true);
    // A check with no requesting URL is read by its origin, and an origin is never the application's page.
    expect(handlers.check?.(null, 'media', 'file:///', { mediaType: 'audio' })).toBe(false);
    expect(handlers.check?.(null, 'media', 'https://example.com', { mediaType: 'audio' })).toBe(false);
  });
  it('refuses every device (HID, serial and USB) to every page, the application\'s own included', () => {
    const handlers = installed();
    expect(handlers.device).toBeDefined();
    for (const deviceType of ['hid', 'serial', 'usb']) {
      for (const origin of ['file://', OWN, 'https://example.com']) expect(handlers.device?.({ deviceType, origin })).toBe(false);
    }
  });
  it('answers every display-media request with no stream, to every page', () => {
    const handlers = installed();
    const answered: DisplayMediaStreams[] = [];
    for (const securityOrigin of ['file://', 'https://example.com']) handlers.display?.({ securityOrigin, videoRequested: true, audioRequested: true }, (streams) => answered.push(streams));
    expect(answered).toEqual([{}, {}]);
  });
  it('the renderer never reads the clipboard, so the `clipboard-read` grant admits the copy buttons\' write alone', () => {
    const repo = fileURLToPath(new URL('../../../../', import.meta.url));
    const roots = ['packages/ui/src', 'packages/ui-core/src', 'apps/desktop/src/renderer', 'apps/desktop/src/preload'].map((r) => join(repo, r));
    const files = roots.flatMap((root) => readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)).map((f) => join(root, f)));
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((file) => /clipboard\s*\??\.\s*read/.test(readFileSync(file, 'utf8')))).toEqual([]);
  });
});

describe('OQ-466 — the application\'s own page, defined once', () => {
  const POSIX: ApplicationPages = { rendererIndex: '/opt/rotaris/out/renderer/index.html', devServerUrl: undefined, platform: 'linux' };
  const WINDOWS: ApplicationPages = { rendererIndex: 'C:\\Program Files\\Rotaris\\resources\\app.asar\\out\\renderer\\index.html', devServerUrl: undefined, platform: 'win32' };
  const DEV: ApplicationPages = { ...POSIX, devServerUrl: 'http://localhost:5173' };

  it('admits the built renderer\'s index.html, with or without a role in its query or a fragment', () => {
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/index.html', POSIX)).toBe(true);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/index.html?role=approval', POSIX)).toBe(true);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/index.html#top', POSIX)).toBe(true);
    expect(isApplicationPage('file:///C:/Program%20Files/Rotaris/resources/app.asar/out/renderer/index.html?role=terminal', WINDOWS)).toBe(true);
  });
  it('decodes the path before comparing it, and folds case on Windows alone', () => {
    expect(isApplicationPage('file:///opt/my%20app/index.html', { ...POSIX, rendererIndex: '/opt/my app/index.html' })).toBe(true);
    expect(isApplicationPage('file:///c:/program%20files/rotaris/RESOURCES/app.asar/out/renderer/index.html', WINDOWS)).toBe(true);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/INDEX.html', POSIX)).toBe(false);
  });
  it('refuses a sibling file and the directory itself', () => {
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/other.html', POSIX)).toBe(false);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/', POSIX)).toBe(false);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/assets/index.html', POSIX)).toBe(false);
  });
  it('refuses a traversal out of the renderer directory, plain or encoded', () => {
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/../../../etc/passwd', POSIX)).toBe(false);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/%2e%2e/main/index.html', POSIX)).toBe(false);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/..%2F..%2Fsecret%2Findex.html', POSIX)).toBe(false);
    expect(isApplicationPage('file:///C:/Program%20Files/Rotaris/resources/app.asar/out/renderer/..%5C..%5Cindex.html', WINDOWS)).toBe(false);
    // A traversal that comes back to the page is the page: the comparison is of the normalised path.
    expect(isApplicationPage('file:///opt/rotaris/out/main/../renderer/index.html', POSIX)).toBe(true);
  });
  it('refuses another drive and a UNC host', () => {
    expect(isApplicationPage('file:///D:/Program%20Files/Rotaris/resources/app.asar/out/renderer/index.html', WINDOWS)).toBe(false);
    expect(isApplicationPage('file://server/share/Program%20Files/Rotaris/resources/app.asar/out/renderer/index.html', WINDOWS)).toBe(false);
    expect(isApplicationPage('file://server/opt/rotaris/out/renderer/index.html', POSIX)).toBe(false);
  });
  it('reads the development server by its exact origin, never by prefix, and only where one is named', () => {
    expect(isApplicationPage('http://localhost:5173/?role=main', DEV)).toBe(true);
    expect(isApplicationPage('http://localhost:5173.evil.test/', DEV)).toBe(false);
    expect(isApplicationPage('http://localhost:5174/', DEV)).toBe(false);
    expect(isApplicationPage('https://localhost:5173/', DEV)).toBe(false);
    expect(isApplicationPage('http://localhost:5173/', POSIX)).toBe(false);
    expect(isApplicationPage('file:///opt/rotaris/out/renderer/index.html', DEV)).toBe(true);
  });
  it('refuses every other scheme, an empty string and what does not parse', () => {
    for (const url of ['https://example.invalid/', 'http://example.com/index.html', 'javascript:alert(1)', 'data:text/html,<p>x</p>', 'about:blank', '', 'not a url', undefined]) {
      expect(isApplicationPage(url, DEV)).toBe(false);
    }
  });
  it('names a URL in a log line by its origin or its scheme, never its path or query', () => {
    expect(urlOriginForLog('https://example.invalid/path?token=secret')).toBe('https://example.invalid');
    expect(urlOriginForLog('file:///home/someone/secret.html')).toBe('file:');
    expect(urlOriginForLog('data:text/html,<p>secret</p>')).toBe('data:');
    expect(urlOriginForLog('javascript:alert(1)')).toBe('javascript:');
    expect(urlOriginForLog('')).toBe('an empty URL');
    expect(urlOriginForLog(undefined)).toBe('an empty URL');
    expect(urlOriginForLog('not a url')).toBe('an unreadable URL');
  });
});
