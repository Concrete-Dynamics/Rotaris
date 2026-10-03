import { describe, expect, it, vi } from 'vitest';
import type { RepositoryState, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

// `config.ts` announces a saved snapshot to the main windows it is handed; no Electron window is reached.
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
const { configCommands } = await import('./config.js');

/**
 * PD-MONITOR-002, live-run finding a71-9: one fact, one emitter. The workspace service performs the repository read and
 * writes its line ("repository <root>: git=… in N ms", `workspace-service/index.ts`); main relays the answer to the
 * window and does not write the same line again. Driven with a plain object where the service's link was.
 */
const ROOT = '/work/project';
const state: RepositoryState = { gitAvailable: true, isRepository: true, branch: 'main', base: null, ahead: 0, behind: 0, touched: 1, uncommitted: 1, failed: [], readMs: 41 };

describe('repository.read — the repository card, relayed from the workspace service', () => {
  it('answers with the service\'s state and writes no "repository" line of its own (the service wrote it)', async () => {
    const lines: string[] = [];
    const asked: WorkspaceServiceRequest[] = [];
    const link = { request: async (req: WorkspaceServiceRequest) => { asked.push(req); return { kind: 'repository.state', state }; } };
    const services = new Map([[canonicalPath(ROOT), { link }]]) as unknown as CommandContext['services'];
    const runHost = { request: async () => ({ kind: 'ack' }) } as unknown as CommandContext['runHost'];
    const mainWindows = { ordered: () => [] } as unknown as CommandContext['mainWindows'];
    const facet = configCommands({ log: (m) => { lines.push(m); }, mainWindows, raiseNotice: () => undefined, runHost, services });
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
    const win = (workspace: string) => ({ workspace, win: { isDestroyed: () => false, webContents: { send: (_channel: string, payload: { snapshot: unknown }) => { sent.set(workspace, [...(sent.get(workspace) ?? []), payload.snapshot]); } } } });
    const mainWindows = { ordered: () => [win(A), win(B)] } as unknown as CommandContext['mainWindows'];
    const runHost = { request: async () => ({ kind: 'ack' }) } as unknown as CommandContext['runHost'];
    const facet = configCommands({ log: () => undefined, mainWindows, raiseNotice: () => undefined, runHost, services });
    const at: CommandAt = { w: { workspaceId: 'ws-a', workspace: A, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    const out = await facet['config.setField']({ kind: 'config.setField', patch: { runtime: { allow_outside_workspace: true } } }, at);
    expect(out.ok).toBe(true);
    await vi.waitFor(() => { expect(sent.get(B)).toHaveLength(1); });
    expect(sent.get(A)).toEqual([snap(canonicalPath(A), true)]);
    expect(sent.get(B)).toEqual([snap(canonicalPath(B), false)]);
  });
});
