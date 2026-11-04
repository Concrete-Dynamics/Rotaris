import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { instant } from '@rotaris/kernel';
import { PreferenceStore } from '@rotaris/platform';
import { DiagnosticsCaptures, defaultDiagnosticsBase, perUserDiagnosticsBase } from '../diagnostics.js';
import { cardState, diagnosticsCommands } from './diagnostics.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

vi.mock('electron', () => ({ shell: { openPath: vi.fn(() => Promise.resolve('')) } }));

/**
 * REQ-SHELL-163's card through the facet itself, with plain objects for its slice of `CommandContext`: the level and the
 * folder are stored in the preference store and reach the windows built afterwards, and the asking window's capture is
 * never altered by either (REQ-STARTUP-129).
 */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-diagnostics-card-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

function facet(chosen: string | null) {
  const preferences = new PreferenceStore(join(dir, 'preferences'));
  const diagnostics = new DiagnosticsCaptures({ now: () => instant(Date.UTC(2026, 10, 3)), pid: 1, app: () => ({ name: 'Rotaris', version: '0' }), platform: { os: 'win32', arch: 'arm64', runtime: 'electron' }, perUserData: join(dir, 'data'), warn: () => undefined, info: () => undefined });
  const chooseDirectory = vi.fn((_parent: BrowserWindow, _opts: Electron.OpenDialogOptions) => Promise.resolve(chosen));
  const ctx = { capturing: false, chooseDirectory, clocks: { timers: { after: () => ({ cancel: () => undefined }) } } as unknown as CommandContext['clocks'], diagnostics, log: () => undefined, preferences } as unknown as Parameters<typeof diagnosticsCommands>[0];
  const workspace = join(dir, 'ws');
  const w = { wcId: 5, workspace, win: {} as BrowserWindow } as unknown as MainWindowState;
  const at = { w, senderId: 5, awaitWorkspace: () => Promise.resolve() } satisfies CommandAt;
  return { handlers: diagnosticsCommands(ctx), preferences, diagnostics, chooseDirectory, workspace, at };
}

describe('REQ-SHELL-163: the diagnostics card', () => {
  it('shows off and the workspace default when nothing is stored, and no capture for the window', async () => {
    const f = facet(null);
    expect(await f.handlers['diagnostics.state']({ kind: 'diagnostics.state' }, f.at)).toEqual({ ok: true, value: { level: 'off', folder: defaultDiagnosticsBase(f.workspace), folderChosen: false, capture: { state: 'off' } } });
  });

  it('stores the level for windows built afterwards and leaves the asking window\'s capture as it was built', async () => {
    const f = facet(null);
    const r = await f.handlers['diagnostics.setLevel']({ kind: 'diagnostics.setLevel', level: 'light' }, f.at);
    expect(f.preferences.read('diagnostics/level')).toBe('light');
    expect(r).toMatchObject({ ok: true, value: { level: 'light', capture: { state: 'off' } } });
  });

  it('takes the folder from the platform chooser, limited to directories and starting at the folder in force', async () => {
    const chosen = join(dir, 'chosen');
    const f = facet(chosen);
    const r = await f.handlers['diagnostics.chooseOutputDir']({ kind: 'diagnostics.chooseOutputDir' }, f.at);
    expect(f.chooseDirectory.mock.calls[0]?.[1]).toMatchObject({ properties: ['openDirectory', 'createDirectory'], defaultPath: defaultDiagnosticsBase(f.workspace) });
    expect(f.preferences.read('diagnostics/outputDir')).toBe(chosen);
    expect(r).toMatchObject({ ok: true, value: { folder: chosen, folderChosen: true } });
  });

  it('changes nothing when the chooser is cancelled', async () => {
    const f = facet(null);
    await f.handlers['diagnostics.chooseOutputDir']({ kind: 'diagnostics.chooseOutputDir' }, f.at);
    expect(f.preferences.read('diagnostics/outputDir')).toBeUndefined();
  });

  it('refuses to open a run directory the window does not have, and opens the one it has', async () => {
    const f = facet(null);
    expect(await f.handlers['diagnostics.openRunDirectory']({ kind: 'diagnostics.openRunDirectory' }, f.at)).toMatchObject({ ok: false, code: 'diagnostics.no-run-directory' });
    const capture = f.diagnostics.open(5, { level: 'light', outputDir: join(dir, 'out'), workspace: f.workspace });
    const opened = await f.handlers['diagnostics.openRunDirectory']({ kind: 'diagnostics.openRunDirectory' }, f.at);
    expect(capture.state === 'active' && opened).toEqual({ ok: true, value: { path: capture.state === 'active' ? capture.runDirectory : '' } });
    f.diagnostics.close(5);
  });

  it('shows the per-user default as the folder in force for a window holding no workspace when none is chosen (PD-STARTUP-011)', () => {
    const f = facet(null);
    expect(cardState({ wcId: 9, workspace: '(no workspace)' }, 'light', undefined, f.diagnostics)).toEqual({ level: 'light', folder: perUserDiagnosticsBase(join(dir, 'data')), folderChosen: false, capture: { state: 'off' } });
  });

  it('keeps showing the default fixed when the window was built after a workspace is opened in it (PD-STARTUP-011)', async () => {
    const f = facet(null);
    f.diagnostics.open(5, { level: 'off', outputDir: undefined, workspace: null });
    // The window built with no workspace has since opened one: the record's workspace moved, the default did not.
    expect(await f.handlers['diagnostics.state']({ kind: 'diagnostics.state' }, f.at)).toMatchObject({ ok: true, value: { folder: perUserDiagnosticsBase(join(dir, 'data')), folderChosen: false } });
    await f.handlers['diagnostics.chooseOutputDir']({ kind: 'diagnostics.chooseOutputDir' }, f.at);
    expect(f.chooseDirectory.mock.calls[0]?.[1]).toMatchObject({ defaultPath: perUserDiagnosticsBase(join(dir, 'data')) });
    f.diagnostics.close(5);
  });
});
