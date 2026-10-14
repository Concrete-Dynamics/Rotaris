import { describe, expect, it, vi } from 'vitest';
import { CHANNEL, CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * Channel 14 — REQ-CHAT-167 ("changing it changes every reasoning row at once") and REQ-CONFIG-403 (each Display toggle
 * wired to the stored preference and "a live re-render notification"). Until 2026-10-14 `prefs.set` stored a display
 * preference and told no window, so a persona window already open kept the values it booted with
 * (`docs/defects/fixed/an-open-persona-window-keeps-the-display-preferences-it-booted-with.md`). The windows are plain
 * objects standing where Electron's are; no Electron window is reached.
 */
type Sent = { channel: string; payload: unknown };
const windows: { sent: Sent[]; destroyed: boolean; isDestroyed: () => boolean; webContents: { send: (channel: string, payload: unknown) => void } }[] = [];
const fakeWindow = (destroyed = false) => {
  const w = { sent: [] as Sent[], destroyed, isDestroyed: () => w.destroyed, webContents: { send: (channel: string, payload: unknown) => { w.sent.push({ channel, payload }); } } };
  windows.push(w);
  return w;
};
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows }, app: { isPackaged: false, getVersion: () => '0.0.0', getAppPath: () => '.' }, nativeTheme: {}, shell: {} }));
const { shellCommands, announceDisplayPreference } = await import('./shell.js');

const written: [string, unknown][] = [];
const preferences = { write: async (key: string, value: unknown) => { written.push([key, value]); }, read: () => undefined, writeThemeSync: () => undefined } as unknown as CommandContext['preferences'];
const facet = shellCommands({
  capturing: false, currentTheme: () => ({ name: 'rotaris-dim' }) as never, log: () => undefined, notices: {} as never, preferences, processes: [],
  requirementsPreferenceKey: (k: string) => k, runHost: {} as never, services: new Map() as never, setTheme: (() => ({})) as never,
  themeBackground: () => '#000', updater: {} as never,
} as unknown as Parameters<typeof shellCommands>[0]);
const at: CommandAt = { w: { workspaceId: 'ws-1', workspace: '/work/p', followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };

describe('prefs.set announces a stored display preference to every window — REQ-CHAT-167, REQ-CONFIG-403', () => {
  it('each of the three display keys reaches every live window, the writer and a persona window alike, after it is stored', async () => {
    windows.length = 0; written.length = 0;
    const main = fakeWindow();
    const persona = fakeWindow();
    for (const [key, value] of [['display/showReasoning', true], ['display/autoCollapseTools', true], ['display/groupTools', false]] as const) {
      const out = await facet['prefs.set']({ kind: 'prefs.set', key, value }, at);
      expect(out).toEqual({ ok: true });
    }
    const expected = [
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/showReasoning', value: true } },
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/autoCollapseTools', value: true } },
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/groupTools', value: false } },
    ];
    expect(main.sent).toEqual(expected);
    expect(persona.sent).toEqual(expected);
    expect(written).toEqual([['display/showReasoning', true], ['display/autoCollapseTools', true], ['display/groupTools', false]]);
  });

  it('announces nothing for a refused value or a key that is not a display preference', async () => {
    windows.length = 0;
    const w = fakeWindow();
    expect((await facet['prefs.set']({ kind: 'prefs.set', key: 'display/showReasoning', value: 'yes' as never }, at)).ok).toBe(false);
    expect((await facet['prefs.set']({ kind: 'prefs.set', key: 'interface/agentPopOut', value: true }, at)).ok).toBe(true);
    expect(w.sent).toEqual([]);
  });

  it('skips a destroyed window and sheds one whose frame throws, so the rest are still told', () => {
    windows.length = 0;
    const gone = fakeWindow(true);
    const broken = fakeWindow();
    broken.webContents.send = () => { throw new Error('Render frame was disposed'); };
    const live = fakeWindow();
    expect(announceDisplayPreference('display/showReasoning', false)).toBe(1);
    expect(gone.sent).toEqual([]);
    expect(live.sent).toEqual([{ channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/showReasoning', value: false } }]);
  });
});
