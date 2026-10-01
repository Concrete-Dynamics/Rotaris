import { describe, expect, it, vi } from 'vitest';
import type { RepositoryState, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

// `config.ts` broadcasts a saved snapshot to every window; nothing here saves, so no window is needed.
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
    const facet = configCommands({ log: (m) => { lines.push(m); }, raiseNotice: () => undefined, runHost, services });
    const at: CommandAt = { w: { workspaceId: 'ws-1', workspace: ROOT, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    const out = await facet['repository.read']({ kind: 'repository.read' }, at);
    expect(out).toEqual({ ok: true, value: state });
    expect(asked).toEqual([{ kind: 'repository.read', workspaceRoot: canonicalPath(ROOT) }]);
    expect(lines).toEqual([]);
  });
});
