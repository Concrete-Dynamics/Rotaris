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
 * PD-WORKSPACE-005 revision 2 (OQ-262, ruled 2026-10-13 under R-072): `projectInit.open`, a project-setup banner's action
 * activated in any window. The window holding the named workspace is surfaced and told on channel 15 to open Settings ›
 * Project; with no holder, the asking window shows "Project <name> is not open in any window." and nothing else happens.
 * Driven with plain objects where the window registry, the relay and the windows were.
 */
describe('projectInit.open — a project-setup banner\'s action (PD-WORKSPACE-005 revision 2, OQ-262)', () => {
  function facet(holder: { workspace: string; wcId: number } | undefined) {
    const sent: { channel: string; payload: unknown }[] = [];
    const surfaced: string[] = [];
    const transients: { wcId: number; kind: string; title: string }[] = [];
    const counted: string[] = [];
    const logged: string[] = [];
    const commands = projectInitCommands({
      log: (m) => { logged.push(m); },
      mainWindows: {
        surfaceHolding: (workspace: string) => {
          surfaced.push(workspace);
          return holder === undefined ? undefined : { ...holder, win: { isDestroyed: () => false, webContents: { send: (channel: string, payload: unknown) => { sent.push({ channel, payload }); } } } };
        },
      } as unknown as CommandContext['mainWindows'],
      raiseTransient: (w, kind, title) => { transients.push({ wcId: (w as unknown as { wcId: number }).wcId, kind, title }); },
      relay: { count: (channel: string) => { counted.push(channel); } } as unknown as CommandContext['relay'],
    });
    return { commands, sent, surfaced, transients, counted, logged };
  }

  it('surfaces the window holding the named workspace and asks it, on channel 15, to open Settings › Project', async () => {
    const f = facet({ workspace: '/work/atlas-billing', wcId: 1 });
    const out = await f.commands['projectInit.open']({ kind: 'projectInit.open', workspace: '/work/atlas-billing' }, windowOn('/work/other', 2));
    expect(out).toEqual({ ok: true, value: { opened: true, window: 1 } });
    expect(f.surfaced).toEqual(['/work/atlas-billing']);
    expect(f.sent).toEqual([{ channel: 'project-init:open', payload: { v: 1, workspace: '/work/atlas-billing' } }]);
    expect(f.counted).toEqual(['project-init:open']);
    expect(f.transients).toEqual([]);
  });

  it('shows the asking window the info notice and opens nothing when no window holds the workspace', async () => {
    const f = facet(undefined);
    const out = await f.commands['projectInit.open']({ kind: 'projectInit.open', workspace: '/work/atlas-billing' }, windowOn('/work/other', 2));
    expect(out).toEqual({ ok: true, value: { opened: false } });
    expect(f.sent).toEqual([]);
    expect(f.transients).toEqual([{ wcId: 2, kind: 'info', title: 'Project atlas-billing is not open in any window.' }]);
    expect(f.logged.some((line) => line.includes('no window holds it'))).toBe(true);
  });
});
