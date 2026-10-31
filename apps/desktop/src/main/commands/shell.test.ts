import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PANE_LAYOUT_VIEWS, PreferenceStore, paneLayoutKeys } from '@rotaris/platform';
import { FakeClock } from '@rotaris/kernel';
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
/**
 * REQ-SHELL-069's pane count, per view: the table `prefs.get` reads against is `platform`'s own, made mutable here so a case
 * can give one view a third pane — the change the read must follow (a layout stored for the old count refused, one for the
 * new count applied). Every other export is the real one.
 */
const paneCounts = vi.hoisted(() => ({} as Record<string, number>));
vi.mock('@rotaris/platform', async (importOriginal) => {
  const actual = await importOriginal<{ readonly PANE_LAYOUT_PANES: Readonly<Record<string, number>> }>();
  Object.assign(paneCounts, actual.PANE_LAYOUT_PANES);
  return { ...actual, PANE_LAYOUT_PANES: paneCounts };
});
/** The platform's opener (`shell.openPath`) and the licence bundle's path, as a case sets them. */
const opener = vi.hoisted(() => ({ open: (_path: string): Promise<string> => Promise.resolve(''), bundle: null as string | null }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows }, app: { isPackaged: false, getVersion: () => '0.0.0', getAppPath: () => '.' }, nativeTheme: {}, shell: { openPath: (path: string) => opener.open(path) } }));
vi.mock('../about.js', async (importOriginal) => ({ ...await importOriginal<object>(), thirdPartyLicensesPath: () => opener.bundle }));
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
    for (const [key, value] of [['display/showReasoning', true], ['display/autoCollapseTools', true], ['display/groupToolCalls', false]] as const) {
      const out = await facet['prefs.set']({ kind: 'prefs.set', key, value }, at);
      expect(out).toEqual({ ok: true });
    }
    const expected = [
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/showReasoning', value: true } },
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/autoCollapseTools', value: true } },
      { channel: CHANNEL.displayChanged, payload: { v: CONTRACT_SCHEMA_VERSION, preference: 'display/groupToolCalls', value: false } },
    ];
    expect(main.sent).toEqual(expected);
    expect(persona.sent).toEqual(expected);
    expect(written).toEqual([['display/showReasoning', true], ['display/autoCollapseTools', true], ['display/groupToolCalls', false]]);
  });

  it('announces nothing for a refused value or a key that is not a display preference', async () => {
    windows.length = 0;
    const w = fakeWindow();
    expect((await facet['prefs.set']({ kind: 'prefs.set', key: 'display/showReasoning', value: 'yes' as never }, at)).ok).toBe(false);
    expect((await facet['prefs.set']({ kind: 'prefs.set', key: 'interface/agentPopout', value: true }, at)).ok).toBe(true);
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

/**
 * ADR-0049 / PD-WORKSPACE-005: `notice.current` answers the notice current in main's one store once every publication accepted
 * before it has been applied, so a window opened after a publication can show it
 * (docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).
 */
describe('notice.current answers the notice a window opened after its publication should show', () => {
  it('waits for the store\'s chain, then answers its current notice in channel 4\'s shape', async () => {
    const steps: string[] = [];
    const current = { id: 3, severity: 'error', title: 'Project setup did not finish: atlas-billing', message: '', detail: '', persistent: true, sessionId: '' };
    const notices = { settled: async () => { steps.push('settled'); }, current: () => { steps.push('current'); return current; } };
    const withStore = shellCommands({
      capturing: false, currentTheme: () => ({ name: 'rotaris-dim' }) as never, log: () => undefined, notices: notices as never, preferences, processes: [],
      requirementsPreferenceKey: (k: string) => k, runHost: {} as never, services: new Map() as never, setTheme: (() => ({})) as never,
      themeBackground: () => '#000', updater: {} as never,
    } as unknown as Parameters<typeof shellCommands>[0]);
    expect(await withStore['notice.current']({ kind: 'notice.current' }, at)).toEqual({ ok: true, value: { v: CONTRACT_SCHEMA_VERSION, current } });
    expect(steps).toEqual(['settled', 'current']);
  });
});

/**
 * REQ-SHELL-069: "the stored pane count differs from the view's current pane count" restores the declared defaults. `prefs.get`
 * reads each view's layout against THAT view's count (`PANE_LAYOUT_PANES`); until 2026-10-14 it read every view against a literal
 * 2, so a view that gained a pane would have had every layout it wrote discarded and a two-pane layout applied to it
 * (`docs/defects/fixed/the-pane-layout-read-assumes-two-panes-for-every-view.md`). The store is a real `PreferenceStore` on disk.
 */
/**
 * REQ-SHELL-069: the components that WRITE each view's layout state its pane count as a literal (the renderer and `@rotaris/ui`
 * do not import `@rotaris/platform`), while `prefs.get` reads against `PANE_LAYOUT_PANES`. A view that gained a pane in one and not
 * the other would have every layout it writes discarded at the next read, silently (fin46's review, accept1-7; the fixed note
 * `docs/defects/fixed/the-pane-layout-read-assumes-two-panes-for-every-view.md` says the two must change together). This holds
 * them together: each writer's `panes: N` is its view's figure in the table.
 */
describe('each view\'s layout writer states the pane count PANE_LAYOUT_PANES declares — REQ-SHELL-069', () => {
  const repo = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
  const writers: Readonly<Record<(typeof PANE_LAYOUT_VIEWS)[number], string>> = {
    overview: 'packages/ui/src/OverviewView.tsx',
    git: 'packages/ui/src/GitView.tsx',
    library: 'packages/ui/src/library/PromptsTab.tsx',
    workspace: 'apps/desktop/src/renderer/main.tsx',
  };
  it('names one writer per view, and each writes its view\'s count and no other', () => {
    expect(Object.keys(writers).sort()).toEqual([...PANE_LAYOUT_VIEWS].sort());
    for (const view of PANE_LAYOUT_VIEWS) {
      const counts = [...readFileSync(join(repo, writers[view]), 'utf8').matchAll(/onLayout\w*\(\{\s*version:\s*1,\s*panes:\s*(\d+)/g)].map((m) => Number(m[1]));
      expect(counts.length, `${view}: ${writers[view]} writes a layout`).toBeGreaterThan(0);
      for (const n of counts) expect(n, `${view}: ${writers[view]} writes panes: ${n}`).toBe(paneCounts[view]);
    }
  });
});

describe('prefs.get reads a pane layout against its own view\'s pane count — REQ-SHELL-069', () => {
  const dirs: string[] = [];
  const declared = { ...paneCounts };
  afterEach(() => {
    Object.assign(paneCounts, declared);
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const withStore = () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-shell-panes-'));
    dirs.push(dir);
    const store = new PreferenceStore(dir);
    const facet = shellCommands({
      capturing: false, currentTheme: () => ({ name: 'rotaris-dim' }) as never, log: () => undefined, notices: {} as never, preferences: store, processes: [],
      requirementsPreferenceKey: (k: string) => k, runHost: {} as never, services: new Map() as never, setTheme: (() => ({})) as never,
      themeBackground: () => '#000', updater: {} as never,
    } as unknown as Parameters<typeof shellCommands>[0]);
    const get = async (view: (typeof PANE_LAYOUT_VIEWS)[number]) => {
      const out = await facet['prefs.get']({ kind: 'prefs.get', key: paneLayoutKeys(view).state }, at);
      return out.ok ? (out.value as { value?: unknown }).value : 'refused';
    };
    return { store, get };
  };

  it('answers every view\'s stored two-pane layout today, each view declaring two panes', async () => {
    expect(declared).toEqual({ overview: 2, git: 2, library: 2, workspace: 2 });
    const { store, get } = withStore();
    for (const view of PANE_LAYOUT_VIEWS) await store.writeLayout(view, { version: 1, panes: 2, sizes: [600, 300] });
    for (const view of PANE_LAYOUT_VIEWS) expect(await get(view)).toEqual({ version: 1, panes: 2, sizes: [600, 300] });
  });

  it('a view that gains a pane applies a layout stored for its new count and restores defaults over one stored for the old', async () => {
    paneCounts['library'] = 3;
    const { store, get } = withStore();
    await store.writeLayout('library', { version: 1, panes: 3, sizes: [300, 300, 300] });
    await store.writeLayout('git', { version: 1, panes: 2, sizes: [400, 528] });
    expect(await get('library')).toEqual({ version: 1, panes: 3, sizes: [300, 300, 300] });
    expect(await get('git')).toEqual({ version: 1, panes: 2, sizes: [400, 528] });
    await store.writeLayout('library', { version: 1, panes: 2, sizes: [500, 400] });
    expect(await get('library')).toBeUndefined();
  });
});

/**
 * REQ-SHELL-142: "a failed open shows 'Could not open the third-party license bundle.'" — and an opener that never answers is a
 * failed open (REQ-SHELL-040: neither failure of the opener is silent). Until 2026-10-31 the command waited on it for good, as
 * Open log did (`docs/defects/fixed/open-log-waits-on-the-platform-opener-without-a-bound.md`).
 */
describe('shell.openThirdPartyLicenses over an opener that never answers (REQ-SHELL-142, REQ-SHELL-040)', () => {
  const bundle = '/opt/rotaris/resources/THIRD_PARTY_NOTICES.txt';
  const licences = (clock: FakeClock) => shellCommands({ capturing: false, clocks: { timers: clock.timers }, log: () => undefined } as unknown as Parameters<typeof shellCommands>[0]);
  const flush = () => new Promise((resolve) => { setImmediate(resolve); });
  afterEach(() => { opener.bundle = null; opener.open = () => Promise.resolve(''); });

  it('answers licenses.failed once the bound passes, and not a moment before', async () => {
    const clock = new FakeClock();
    opener.bundle = bundle;
    const asked: string[] = [];
    opener.open = (path) => { asked.push(path); return new Promise<string>(() => undefined); };
    let outcome: unknown;
    void Promise.resolve(licences(clock)['shell.openThirdPartyLicenses']({ kind: 'shell.openThirdPartyLicenses' }, at)).then((o) => { outcome = o; });
    await flush();
    expect(asked).toEqual([bundle]);
    clock.advance(4_999);
    await flush();
    expect(outcome).toBeUndefined();
    clock.advance(1);
    await flush();
    // THE FALSIFIER: until 2026-10-31 `outcome` stayed undefined here — the command never answered.
    expect(outcome).toEqual({ ok: false, code: 'licenses.failed', headline: 'The license bundle could not be opened', detail: 'the platform opener did not answer within 5 s' });
    expect(clock.pendingCount()).toBe(0);
  });

  it('(as before) success opens the bundle, a refusal is the detail, and no bundle is licenses.absent', async () => {
    const clock = new FakeClock();
    const facet = licences(clock);
    expect(await facet['shell.openThirdPartyLicenses']({ kind: 'shell.openThirdPartyLicenses' }, at)).toMatchObject({ ok: false, code: 'licenses.absent' });
    opener.bundle = bundle;
    opener.open = async () => '';
    expect(await facet['shell.openThirdPartyLicenses']({ kind: 'shell.openThirdPartyLicenses' }, at)).toEqual({ ok: true, value: { path: bundle } });
    opener.open = async () => 'Failed to open path';
    expect(await facet['shell.openThirdPartyLicenses']({ kind: 'shell.openThirdPartyLicenses' }, at)).toEqual({ ok: false, code: 'licenses.failed', headline: 'The license bundle could not be opened', detail: 'Failed to open path' });
    expect(clock.pendingCount()).toBe(0);
  });
});
