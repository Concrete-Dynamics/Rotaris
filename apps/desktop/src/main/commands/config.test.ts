import { describe, expect, it, vi } from 'vitest';
import { DesktopSaveSchema, type CommandOutcome, type RepositoryState, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';
import { createLiveStateArbiter } from '../live-state.js';

// `config.ts` announces a saved snapshot to the main windows it is handed; no Electron window is reached.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
const { configCommands } = await import('./config.js');

/**
 * An arbiter over a stub run host, recording the states handed over. The real one is driven by
 * `live-state.test.ts`; here it only has to exist, so the facet's other cases are unaffected (REQ-CONFIG-262).
 */
const arbiter = (lines: string[] = []) => createLiveStateArbiter({
  log: (m) => { lines.push(m); },
  send: (state) => { lines.push(`live-state:${JSON.stringify(state)}`); return Promise.resolve({ ok: true, value: {} } as CommandOutcome); },
});

/**
 * PD-MONITOR-002, live-run finding a71-9: one fact, one emitter. The workspace service performs the repository read and
 * writes its line ("repository <root>: git=… in N ms", `workspace-service/index.ts`); main relays the answer to the
 * window and does not write the same line again. Driven with a plain object where the service's link was.
 */
const ROOT = '/work/project';
const state: RepositoryState = { gitAvailable: true, isRepository: true, branch: 'main', base: null, ahead: 0, behind: 0, touched: 1, uncommitted: 1, failed: [], readMs: 41 };

/** One stub the facet now receives: the run host link (PD-CONFIG-006 asks it to reload after an `mcp_servers` write). */
const runHostStub = (asked: RunHostRequest[] = []) => ({ request: async (req: RunHostRequest) => { asked.push(req); return { kind: 'ack' as const }; } });

describe('repository.read — the repository card, relayed from the workspace service', () => {
  it('answers with the service\'s state and writes no "repository" line of its own (the service wrote it)', async () => {
    const lines: string[] = [];
    const asked: WorkspaceServiceRequest[] = [];
    const link = { request: async (req: WorkspaceServiceRequest) => { asked.push(req); return { kind: 'repository.state', state }; } };
    const services = new Map([[canonicalPath(ROOT), { link }]]) as unknown as CommandContext['services'];
    const mainWindows = { ordered: () => [] } as unknown as CommandContext['mainWindows'];
    const facet = configCommands({ log: (m) => { lines.push(m); }, liveState: arbiter(lines), mainWindows, raiseNotice: () => undefined, services, runHost: runHostStub() });
    const at: CommandAt = { w: { workspaceId: 'ws-1', workspace: ROOT, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    const out = await facet['repository.read']({ kind: 'repository.read' }, at);
    expect(out).toEqual({ ok: true, value: state });
    expect(asked).toEqual([{ kind: 'repository.read', workspaceRoot: canonicalPath(ROOT) }]);
    expect(lines).toEqual([]);
  });
});

/**
 * REQ-WORKSPACE-105 / PD-SHELL-001 / REQ-TOOLS-131: a save in one main window announces the reloaded snapshot to the window
 * holding that workspace and to no other; a window on another workspace is sent its own workspace's snapshot, read again.
 * Until 2026-10-03 every window was sent the saved workspace's snapshot (`BrowserWindow.getAllWindows`), so a second main
 * window's status strip read the first workspace's `runtime.allow_outside_workspace`.
 */
describe('config.setField — every main window repopulates from its own workspace', () => {
  it("sends workspace A's snapshot to A's window and B's own to B's", async () => {
    const A = '/work/alpha';
    const B = '/work/beta';
    const snap = (root: string, outside: boolean) => ({ workspaceRoot: root, runtime: { allow_outside_workspace: outside } });
    const service = (root: string, outside: boolean) => ({ link: { request: async (req: WorkspaceServiceRequest) => ({ kind: 'config.snapshot', snapshot: snap(root, req.kind === 'config.setField' ? true : outside) }) } });
    const services = new Map([[canonicalPath(A), service(canonicalPath(A), false)], [canonicalPath(B), service(canonicalPath(B), false)]]) as unknown as CommandContext['services'];
    const sent = new Map<string, unknown[]>();
    const win = (workspace: string) => ({ workspace, win: { isDestroyed: () => false, webContents: { send: (_channel: string, payload: { snapshot: unknown }) => { sent.set(workspace, [...(sent.get(workspace) ?? []), payload.snapshot]); } } }, personaWindows: { list: () => [], entry: () => undefined }, terminalWindows: { current: () => null } });
    const mainWindows = { ordered: () => [win(A), win(B)] } as unknown as CommandContext['mainWindows'];
    const facet = configCommands({ log: () => undefined, liveState: arbiter(), mainWindows, raiseNotice: () => undefined, services, runHost: runHostStub() });
    const at: CommandAt = { w: { workspaceId: 'ws-a', workspace: A, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    const out = await facet['config.setField']({ kind: 'config.setField', patch: { runtime: { allow_outside_workspace: true } } }, at);
    expect(out.ok).toBe(true);
    await vi.waitFor(() => { expect(sent.get(B)).toHaveLength(1); });
    expect(sent.get(A)).toEqual([snap(canonicalPath(A), true)]);
    expect(sent.get(B)).toEqual([snap(canonicalPath(B), false)]);
  });
});

/**
 * ADR-0037 Tier A / REQ-MONITOR-060: a persona window reads the configuration (`useConfigSnapshot('persona')`: its entry and
 * run-level model, its declared tools, the compression threshold) and repopulates on `config:changed` like its main window.
 * 5df1943 announced to the main windows alone, so after a Settings save a persona window kept its stale snapshot until it
 * was reopened (driven 2026-10-03: the main window's counter read one delivery, the persona window's none).
 */
describe('config.setField — a main window\'s persona and terminal windows repopulate with it', () => {
  it("sends A's snapshot to A's persona and terminal windows and B's own to B's persona window", async () => {
    const A = '/work/alpha';
    const B = '/work/beta';
    const snap = (root: string, outside: boolean) => ({ workspaceRoot: root, runtime: { allow_outside_workspace: outside } });
    const service = (root: string) => ({ link: { request: async (req: WorkspaceServiceRequest) => ({ kind: 'config.snapshot', snapshot: snap(root, req.kind === 'config.setField') }) } });
    const services = new Map([[canonicalPath(A), service(canonicalPath(A))], [canonicalPath(B), service(canonicalPath(B))]]) as unknown as CommandContext['services'];
    const sent = new Map<string, unknown[]>();
    const electronWindow = (name: string, destroyed = false) => ({ isDestroyed: () => destroyed, webContents: { send: (_channel: string, payload: { snapshot: unknown }) => { sent.set(name, [...(sent.get(name) ?? []), payload.snapshot]); } } });
    const family = (workspace: string, name: string, personas: readonly string[], terminal: boolean) => ({
      workspace,
      win: electronWindow(name),
      personaWindows: { list: () => personas.map((persona) => ({ persona })), entry: (persona: string) => (personas.includes(persona) ? { win: electronWindow(`${name}/${persona}`) } : undefined) },
      terminalWindows: { current: () => (terminal ? { win: electronWindow(`${name}/terminal`) } : null) },
    });
    const mainWindows = { ordered: () => [family(A, 'A', ['orchestrator', 'reviewer'], true), family(B, 'B', ['orchestrator'], false)] } as unknown as CommandContext['mainWindows'];
    const facet = configCommands({ log: () => undefined, liveState: arbiter(), mainWindows, raiseNotice: () => undefined, services, runHost: runHostStub() });
    const at: CommandAt = { w: { workspaceId: 'ws-a', workspace: A, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    const out = await facet['config.setField']({ kind: 'config.setField', patch: { runtime: { allow_outside_workspace: true } } }, at);
    expect(out.ok).toBe(true);
    await vi.waitFor(() => { expect(sent.get('B/orchestrator')).toHaveLength(1); });
    for (const name of ['A', 'A/orchestrator', 'A/reviewer', 'A/terminal']) expect(sent.get(name)).toEqual([snap(canonicalPath(A), true)]);
    for (const name of ['B', 'B/orchestrator']) expect(sent.get(name)).toEqual([snap(canonicalPath(B), false)]);
  });
});

/**
 * OQ-279 (ruled 2026-10-13 under R-072): every load an announcement makes or carries is a load of that workspace, so the
 * fatal-load notice hears each one — the written workspace's reloaded snapshot and each other workspace's own, read again.
 * A clean one clears that workspace's notice; a fatal one raises it.
 */
describe('config.setField — each announced load reaches the fatal-load notice (OQ-279)', () => {
  it('observes the written workspace\'s reloaded snapshot and every other workspace\'s own', async () => {
    const A = '/work/alpha';
    const B = '/work/beta';
    const snap = (root: string, loadOk: boolean) => ({ workspaceRoot: root, loadOk, fatal: loadOk ? null : `${root}/.rotaris/agents.yaml at runtime.max_depth (workspace scope): must be an integer`, runtime: {} });
    const service = (root: string, loadOk: boolean) => ({ link: { request: async () => ({ kind: 'config.snapshot', snapshot: snap(root, loadOk) }) } });
    const services = new Map([[canonicalPath(A), service(canonicalPath(A), true)], [canonicalPath(B), service(canonicalPath(B), false)]]) as unknown as CommandContext['services'];
    const win = (workspace: string) => ({ workspace, win: { isDestroyed: () => false, webContents: { send: () => undefined } }, personaWindows: { list: () => [], entry: () => undefined }, terminalWindows: { current: () => null } });
    const mainWindows = { ordered: () => [win(A), win(B)] } as unknown as CommandContext['mainWindows'];
    const observed: { root: string; loadOk: boolean }[] = [];
    const configFatal = { observe: async (root: string, s: { loadOk: boolean }) => { observed.push({ root, loadOk: s.loadOk }); }, loaded: async () => undefined };
    const facet = configCommands({ configFatal, log: () => undefined, liveState: arbiter(), mainWindows, raiseNotice: () => undefined, services, runHost: runHostStub() });
    const at: CommandAt = { w: { workspaceId: 'ws-a', workspace: A, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    expect((await facet['config.setField']({ kind: 'config.setField', patch: { runtime: { max_depth: 3 } } }, at)).ok).toBe(true);
    await vi.waitFor(() => { expect(observed).toHaveLength(2); });
    expect(observed).toEqual([{ root: canonicalPath(A), loadOk: true }, { root: canonicalPath(B), loadOk: false }]);
  });
});

/**
 * ADR-0037 Tier B / REQ-CONFIG-262 with REQ-SHELL-020 — the repair of
 * `docs/defects/a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`, driven through the
 * facet rather than through the arbiter directly: this is the ONE path every window's write passes, so it is where the
 * rule has to hold. A window's non-empty state is a publication; an empty one is that window letting go, and the run
 * host is told "none" only when no window still holds a screen.
 */
describe('config.liveState — a window publishes, and letting go is the last holder\'s to do (REQ-CONFIG-262, REQ-SHELL-020)', () => {
  const states: unknown[] = [];
  const facetFor = () => configCommands({
    log: () => undefined, mainWindows: { ordered: () => [] } as unknown as CommandContext['mainWindows'],
    raiseNotice: () => undefined, services: new Map(), runHost: runHostStub(),
    liveState: createLiveStateArbiter({
      log: () => undefined,
      send: (state) => { states.push(state); return Promise.resolve({ ok: true, value: {} }); },
    }),
  });
  // `wcId` is the identity the arbiter keys on, so the fake window carries the one the case names (the real
  // `MainWindowView` does; `commands/config.ts` reads `w.wcId`).
  const at = (wcId: number): CommandAt => ({ w: { wcId, workspaceId: 'ws-1', workspace: '/work/project', followedSessionId: null } as unknown as MainWindowState, senderId: wcId, awaitWorkspace: async () => undefined });

  it('hands a window\'s values over, and restores a survivor\'s own when another holder lets go', async () => {
    states.length = 0;
    const facet = facetFor();
    const ask = { runtime: { permission_mode: 'ask' } };
    const autonomous = { runtime: { permission_mode: 'autonomous' } };
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: ask }, at(1))).toEqual({ ok: true });
    await vi.waitFor(() => { expect(states).toEqual([ask]); });
    // A second window publishes; the FIRST lets go. B's values must survive, and they must be B's OWN (REQ-SHELL-020) —
    // a set of window identities would leave the run host holding B's values only by luck.
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: autonomous }, at(2))).toEqual({ ok: true });
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: {} }, at(1))).toEqual({ ok: true });
    await vi.waitFor(() => { expect(states).toEqual([ask, autonomous]); });
    // A publishes again, so A owns the state; B letting go now changes nothing (B's values were already displaced).
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: ask }, at(1))).toEqual({ ok: true });
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: {} }, at(2))).toEqual({ ok: true });
    await vi.waitFor(() => { expect(states).toEqual([ask, autonomous, ask]); });
    // The last holder (A, the owner) lets go, so the run host is told "none".
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: {} }, at(1))).toEqual({ ok: true });
    await vi.waitFor(() => { expect(states).toEqual([ask, autonomous, ask, {}]); });
  });

  it('a letting-go from a window that never published says nothing to the run host', async () => {
    states.length = 0;
    const facet = facetFor();
    expect(await facet['config.liveState']({ kind: 'config.liveState', state: {} }, at(9))).toEqual({ ok: true });
    await Promise.resolve();
    expect(states).toEqual([]);
  });
});

/**
 * PD-CONFIG-006: main drives the reload. A `config.setField` whose patch touches `mcp_servers` asks the run host to
 * drop its cached resolution of that window's workspace and read the file again (`mcp.reload`), after the write
 * succeeded; a patch that touches no `mcp_servers` key asks nothing, and no `config.save` asks (a save's own reload
 * path covers the rest). The run host never writes the file — main does, through the workspace service.
 */
describe('config.setField — an mcp_servers write asks the run host to reload (PD-CONFIG-006)', () => {
  const A = '/work/alpha';
  const facetOn = (asked: RunHostRequest[]) => {
    const service = { link: { request: async () => ({ kind: 'config.snapshot', snapshot: { workspaceRoot: A, runtime: {} } }) } };
    const services = new Map([[canonicalPath(A), service]]) as unknown as CommandContext['services'];
    const mainWindows = { ordered: () => [] } as unknown as CommandContext['mainWindows'];
    return configCommands({ log: () => undefined, liveState: arbiter(), mainWindows, raiseNotice: () => undefined, services, runHost: runHostStub(asked) });
  };
  const at: CommandAt = { w: { workspaceId: 'ws-a', workspace: A, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };

  it('reloads for a patch that writes mcp_servers, and for nothing else', async () => {
    const asked: RunHostRequest[] = [];
    const facet = facetOn(asked);
    const out = await facet['config.setField']({ kind: 'config.setField', patch: { mcp_servers: { browser: { enabled: true } } } }, at);
    expect(out.ok).toBe(true);
    expect(asked).toEqual([{ kind: 'mcp.reload', workspaceId: 'ws-a' }]);

    asked.length = 0;
    await facet['config.setField']({ kind: 'config.setField', patch: { runtime: { max_depth: 4 } } }, at);
    expect(asked).toEqual([]);
  });

  /**
   * The other half of "and for nothing else": a `config.save` asks no reload, so a Debug build cannot regress the
   * narrow shape into "every write reloads". It is also structural: `DesktopSaveSchema` carries no `mcp_servers` key
   * (the entry is written by the scoped per-field path the press uses, never by the save bar), so a save can never
   * write one and has nothing to reload for.
   */
  it('a config.save asks no reload — it cannot carry an mcp_servers key at all', async () => {
    const asked: RunHostRequest[] = [];
    const facet = facetOn(asked);
    const out = await facet['config.save']({ kind: 'config.save', save: { runtime: { max_depth: 4 } } }, at);
    expect(out.ok).toBe(true);
    expect(asked).toEqual([]);
    expect(Object.keys(DesktopSaveSchema.shape)).not.toContain('mcp_servers');
  });
});
