import { describe, expect, it } from 'vitest';
import { SECURITY_PREFERENCE_KEYS, secureWebPreferences } from './secure-web-preferences.js';
import { mainWindowOptions } from './main-windows.js';

/** The values the Electron security checklist asks of every renderer (items 3, 4, 6, 8, 9 and 10; R-091). */
const EXPECTED = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
} as const;

describe('R-091 — one set of web preferences for every window', () => {
  it('states every security key, and enables no Blink feature', () => {
    const prefs = secureWebPreferences();
    expect(prefs).toEqual(EXPECTED);
    expect('enableBlinkFeatures' in prefs).toBe(false);
    for (const key of SECURITY_PREFERENCE_KEYS) if (key !== 'enableBlinkFeatures') expect(prefs[key]).toBe(EXPECTED[key]);
  });
  it('carries the preload path where a window has one, and nothing else beside the set', () => {
    expect(secureWebPreferences('/opt/rotaris/out/preload/index.cjs')).toEqual({ ...EXPECTED, preload: '/opt/rotaris/out/preload/index.cjs' });
  });
  it('is frozen, and each call is a value of its own', () => {
    const one = secureWebPreferences();
    expect(Object.isFrozen(one)).toBe(true);
    expect(() => { (one as { webSecurity?: boolean }).webSecurity = false; }).toThrow(TypeError);
    expect(secureWebPreferences()).not.toBe(one);
    expect(secureWebPreferences().webSecurity).toBe(true);
  });
  it('is what the main window is built with', () => {
    expect(mainWindowOptions('#202020').webPreferences).toEqual(EXPECTED);
  });
});
