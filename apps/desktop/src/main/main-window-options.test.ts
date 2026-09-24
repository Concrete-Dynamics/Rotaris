import { describe, expect, it } from 'vitest';
import { mainWindowOptions, removeApplicationMenu } from './main-windows.js';

describe('PD-SHELL-003 main window frame', () => {
  it('uses frameless product chrome and hides the native menu on every supported desktop', () => {
    const options = mainWindowOptions('#202020');
    expect(options.frame).toBe(false);
    expect(options.autoHideMenuBar).toBe(true);
    expect(options.title).toBe('Rotaris');
  });

  it('removes Electron application chrome instead of merely auto-hiding it', () => {
    const calls: (unknown[] | null)[] = [];
    removeApplicationMenu({ setApplicationMenu: (menu: unknown[] | null) => { calls.push(menu); } });
    expect(calls).toEqual([null]);
  });
});
