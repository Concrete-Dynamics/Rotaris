import { describe, expect, it } from 'vitest';
import { installPermissionHandlers, isApplicationPage, isOwnPage, permissionGranted, urlOriginForLog, type ApplicationPages, type PermissionSession } from './permissions.js';

const OWN = 'file:///opt/rotaris/out/renderer/index.html';

describe('OQ-459 — what the renderer is granted', () => {
  it('grants the microphone, audio alone, to the application\'s own page', () => {
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, OWN, undefined)).toBe(true);
    expect(permissionGranted('media', { mediaTypes: ['video'] }, OWN, undefined)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio', 'video'] }, OWN, undefined)).toBe(false);
    expect(permissionGranted('media', { mediaType: 'video' }, OWN, undefined)).toBe(false);
  });
  it('refuses a page that is not the application\'s', () => {
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, 'https://example.com/', undefined)).toBe(false);
    expect(permissionGranted('clipboard-sanitized-write', {}, 'https://example.com/', undefined)).toBe(false);
    expect(permissionGranted('media', { mediaTypes: ['audio'] }, undefined, undefined)).toBe(false);
  });
  it('keeps the clipboard write the copy buttons use, and refuses the rest', () => {
    expect(permissionGranted('clipboard-sanitized-write', {}, OWN, undefined)).toBe(true);
    expect(permissionGranted('clipboard-read', {}, OWN, undefined)).toBe(true);
    for (const permission of ['notifications', 'geolocation', 'openExternal', 'pointerLock', 'midi', 'hid', 'serial']) expect(permissionGranted(permission, {}, OWN, undefined)).toBe(false);
  });
  it('reads the dev server by origin, never by prefix', () => {
    expect(isOwnPage('http://localhost:5173/?role=main', 'http://localhost:5173/')).toBe(true);
    expect(isOwnPage('http://localhost:5173.evil.test/', 'http://localhost:5173/')).toBe(false);
    expect(isOwnPage('http://localhost:5173/', undefined)).toBe(false);
  });
  it('installs one handler for the request and one for the check, over the same rule', () => {
    let request!: Parameters<PermissionSession['setPermissionRequestHandler']>[0];
    let check!: Parameters<PermissionSession['setPermissionCheckHandler']>[0];
    installPermissionHandlers({ setPermissionRequestHandler: (h) => { request = h; }, setPermissionCheckHandler: (h) => { check = h; } }, undefined);
    const answers: boolean[] = [];
    request(null, 'media', (g) => answers.push(g), { mediaTypes: ['audio'], requestingUrl: OWN });
    request(null, 'geolocation', (g) => answers.push(g), { requestingUrl: OWN });
    expect(answers).toEqual([true, false]);
    expect(check(null, 'media', 'file:///', { mediaType: 'audio' })).toBe(true);
    expect(check(null, 'media', 'https://example.com', { mediaType: 'audio' })).toBe(false);
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
