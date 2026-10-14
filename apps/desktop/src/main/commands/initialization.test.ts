import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { InitializationStateView } from '@rotaris/contracts';
import { readInitializationState, writeConfigFields } from '@rotaris/config';
import { InitializationCoordinator } from '../initialization.js';
import { initializationCommands, projectInitCommands } from './initialization.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * Each test's scratch directory below the temporary directory, removed after the test so a run leaves none behind
 * (docs/defects/fixed/unit-tests-leave-their-temporary-directories-behind.md).
 */
const scratchDirs: string[] = [];
function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

/**
 * PD-SHELL-001 / REQ-WORKSPACE-013/105: every `initialization.*` command is answered for the workspace of the window that
 * sent it. Before, the coordinator answered with the workspace opened last, whichever window asked
 * (`docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`); the first case
 * here failed on that code with the second window's `lastRun` (null) in place of the first's.
 */
function workspace(): { root: string; agents: string } {
  const root = realpathSync(scratchDir('rotaris-initcmd-'));
  mkdirSync(join(root, '.rotaris'));
  return { root, agents: join(root, '.rotaris', 'agents.yaml') };
}

const windowOn = (root: string, wcId: number): CommandAt => ({
  w: { workspace: root, workspaceId: `ws-${wcId}`, wcId } as unknown as MainWindowState,
  senderId: wcId,
  awaitWorkspace: async () => undefined,
});

function twoWindows(): { a: { root: string; agents: string }; b: { root: string; agents: string }; commands: ReturnType<typeof initializationCommands>; published: { root: string; state: InitializationStateView }[] } {
  const a = workspace();
  const b = workspace();
  writeFileSync(a.agents, 'initialization:\n  completed: []\n  skipped: []\n  last_run: "2026-09-01T00:00:00.000+00:00"\n  classification: code\n');
  const published: { root: string; state: InitializationStateView }[] = [];
  const coordinator = new InitializationCoordinator({
    clocks: new FakeClock(0, Date.parse('2026-09-15T12:00:00Z')),
    log: () => undefined,
    writeMarker: async (root, patch) => {
      const r = await writeConfigFields(join(root, '.rotaris', 'agents.yaml'), patch);
      return r.ok ? { ok: true } : { ok: false, reason: r.error.fault };
    },
    setup: { start: async () => ({ ok: false, code: 'x', reason: 'x' }), cancel: async () => undefined, status: async () => null },
    publish: (root, state) => { published.push({ root, state }); },
    banner: () => undefined,
    modelReachable: () => true,
    quitting: () => false,
  });
  coordinator.registry.register({
    id: 'asks', label: 'Asks', description: 'runs an agent', requiresConsent: true, applicable: () => true,
    run: async () => ({ status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }),
  });
  // Window 1 opened the first workspace; window 2 opened the second afterwards, and is the one opened last.
  coordinator.open(a.root, a.agents, 'ws-1');
  coordinator.open(b.root, b.agents, 'ws-2');
  return { a, b, commands: initializationCommands({ initialization: coordinator }), published };
}

describe('the initialization commands, answered for the asking window\'s workspace', () => {
  it('reads the first window\'s workspace for the first window though the second was opened last (REQ-WORKSPACE-105)', async () => {
    const { a, commands, published } = twoWindows();
    const out = await commands['initialization.read']({ kind: 'initialization.read' }, windowOn(a.root, 1));
    expect(out.ok && (out.value as InitializationStateView).view.lastRun).toBe('2026-09-01T00:00:00.000+00:00');
    expect(published.map((p) => p.root)).toEqual([a.root]);
  });

  it('records a Skip pressed in the first window in the first workspace only (REQ-WORKSPACE-013, REQ-WORKSPACE-086)', async () => {
    const { a, b, commands } = twoWindows();
    const out = await commands['initialization.skip']({ kind: 'initialization.skip', ids: ['asks'] }, windowOn(a.root, 1));
    expect(out.ok && (out.value as InitializationStateView).view.skipped).toEqual(['asks']);
    expect(readInitializationState(a.agents).skipped).toEqual(['asks']);
    expect(readInitializationState(b.agents).skipped).toEqual([]);
    expect(readInitializationState(b.agents).lastRun).toBeNull();
  });

  it('answers a window that holds no workspace with the empty state, touching neither workspace (REQ-WORKSPACE-105)', async () => {
    const { a, b, commands, published } = twoWindows();
    const out = await commands['initialization.resolve']({ kind: 'initialization.resolve' }, windowOn('(no workspace)', 3));
    expect(out.ok && (out.value as InitializationStateView).view.pending).toEqual([]);
    expect(published).toEqual([]);
    expect(readInitializationState(a.agents).lastRun).toBe('2026-09-01T00:00:00.000+00:00');
    expect(readInitializationState(b.agents).lastRun).toBeNull();
  });
});

/**
 * PD-WORKSPACE-005 revision 3 (OQ-294, ruled 2026-10-14 under R-072): `projectInit.open`, a project-setup banner's action
 * activated in any window, takes PD-SHELL-001 revision 2's reach. The window holding the named workspace is surfaced, else one
 * is added for it, and Settings › Project is opened there through `MainWindows.openProjectInit` — sent at once to a renderer
 * listening on channel 15, held for one still loading. A failed reach answers its outcome (the failure is reported by the add
 * route under REQ-SHELL-019), and the facet can raise no transient of its own (it is not given one). Revision 2's "Project <name> is not open in any window." is gone.
 * Driven with plain objects where the window registry was.
 */
describe('projectInit.open — a project-setup banner\'s action (PD-WORKSPACE-005 revision 3, OQ-294)', () => {
  type Reach = Awaited<ReturnType<CommandContext['mainWindows']['reach']>>;
  function facet(reach: (workspace: string) => Reach, delivered: 'sent' | 'held' | 'gone' = 'sent') {
    const reached: string[] = [];
    const opened: number[] = [];
    const logged: string[] = [];
    const ready: number[] = [];
    const commands = projectInitCommands({
      log: (m) => { logged.push(m); },
      mainWindows: {
        reach: async (workspace: string) => { reached.push(workspace); return reach(workspace); },
        openProjectInit: (wcId: number) => { opened.push(wcId); return delivered; },
        forSender: (senderId: number) => (senderId === 2 ? { wcId: 2 } : undefined),
        projectInitReady: (wcId: number) => { ready.push(wcId); return true; },
      } as unknown as CommandContext['mainWindows'],
    });
    return { commands, reached, opened, logged, ready };
  }
  const window = (wcId: number, workspace: string) => ({ wcId, workspace } as unknown as MainWindowState);

  it('reaches the window holding the named workspace and opens Settings › Project there', async () => {
    const f = facet(() => ({ ok: true, window: window(1, '/work/atlas-billing'), added: false }));
    const out = await f.commands['projectInit.open']({ kind: 'projectInit.open', workspace: '/work/atlas-billing' }, windowOn('/work/other', 2));
    expect(out).toEqual({ ok: true, value: { opened: true, window: 1, added: false, delivered: 'sent' } });
    expect(f.reached).toEqual(['/work/atlas-billing']);
    expect(f.opened).toEqual([1]);
  });

  it('adds a window for a project no window holds and opens Settings › Project there, held until its renderer is ready; no transient', async () => {
    const f = facet(() => ({ ok: true, window: window(3, '/work/closed-project'), added: true }), 'held');
    const out = await f.commands['projectInit.open']({ kind: 'projectInit.open', workspace: '/work/closed-project' }, windowOn('/work/other', 2));
    expect(out).toEqual({ ok: true, value: { opened: true, window: 3, added: true, delivered: 'held' } });
    expect(f.opened).toEqual([3]);
    expect(f.logged.some((line) => line.includes('added window 3') && line.includes('PD-WORKSPACE-005 revision 3') && line.includes('OQ-294'))).toBe(true);
    expect(f.logged.some((line) => line.includes('not open in any window'))).toBe(false);
  });

  it('answers a failed reach with its outcome, opens nothing and raises no transient', async () => {
    const refused = { ok: false as const, code: 'workspace.openFailed', headline: 'Could not open the selected project: /work/gone could not be opened as a workspace.' };
    const f = facet(() => ({ ok: false, outcome: refused }));
    const out = await f.commands['projectInit.open']({ kind: 'projectInit.open', workspace: '/work/gone' }, windowOn('/work/other', 2));
    expect(out).toEqual(refused);
    expect(f.opened).toEqual([]);
  });

  it('projectInit.ready marks the asking main window listening and answers whether an open was owed; any other sender is refused', async () => {
    const f = facet(() => ({ ok: true, window: window(1, '/work/a'), added: false }));
    expect(await f.commands['projectInit.ready']({ kind: 'projectInit.ready' }, windowOn('/work/other', 2))).toEqual({ ok: true, value: { owed: true } });
    expect(f.ready).toEqual([2]);
    const other = { ...windowOn('/work/other', 2), senderId: 202 };
    expect((await f.commands['projectInit.ready']({ kind: 'projectInit.ready' }, other)).ok).toBe(false);
  });
});
