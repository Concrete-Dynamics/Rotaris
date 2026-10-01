import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { InitializationStateView } from '@rotaris/contracts';
import { readInitializationState, writeConfigFields } from '@rotaris/config';
import { InitializationCoordinator } from '../initialization.js';
import { initializationCommands } from './initialization.js';
import type { CommandAt, MainWindowState } from './context.js';

/**
 * PD-SHELL-001 / REQ-WORKSPACE-013/105: every `initialization.*` command is answered for the workspace of the window that
 * sent it. Before, the coordinator answered with the workspace opened last, whichever window asked
 * (`docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`); the first case
 * here failed on that code with the second window's `lastRun` (null) in place of the first's.
 */
function workspace(): { root: string; agents: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rotaris-initcmd-')));
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
