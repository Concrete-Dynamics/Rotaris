import { describe, expect, it } from 'vitest';
import { mainWindowOptions } from './main-windows.js';

describe('PD-SHELL-003 main window frame', () => {
  it('uses frameless product chrome and hides the native menu on Windows and Linux', () => {
    for (const platform of ['win32', 'linux'] as const) {
      const options = mainWindowOptions('#202020', platform);
      expect(options.frame).toBe(false);
      expect(options.autoHideMenuBar).toBe(true);
      expect(options.title).toBe('Rotaris');
    }
  });

  it('retains native framing on macOS, which the directive does not change', () => {
    const options = mainWindowOptions('#202020', 'darwin');
    expect(options.frame).toBeUndefined();
    expect(options.autoHideMenuBar).toBe(true);
  });
});
