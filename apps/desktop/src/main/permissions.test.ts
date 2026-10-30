import { describe, expect, it } from 'vitest';
import { installPermissionHandlers, isOwnPage, permissionGranted, type PermissionSession } from './permissions.js';

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
