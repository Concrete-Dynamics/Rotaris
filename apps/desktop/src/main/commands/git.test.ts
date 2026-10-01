import { describe, expect, it } from 'vitest';
import type { GitViewState, WorkspaceServiceRequest } from '@rotaris/contracts';
import { canonicalPath } from '@rotaris/platform';
import { gitCommands } from './git.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * PD-MONITOR-002, live-run finding a71-9: one fact, one emitter. The workspace service performs the Git view's reads and
 * writes their line ("git view: N reads in M ms (…)", `workspace-service/index.ts`); main relays the answer to the window
 * and does not write the same line again. Driven with a plain object where the service's link was.
 */
const ROOT = '/work/project';
const view: GitViewState = {
  workspaceRoot: ROOT, gitAvailable: true, isRepository: true, branch: 'main', detached: false, upstream: null,
  ahead: 0, behind: 0, uncommitted: 0, additions: 0, deletions: 0, files: 0, baseBranch: 'main', worktrees: [], history: [],
  failed: [], reads: 9, readMs: 73,
};

function harness(state: GitViewState) {
  const lines: string[] = [];
  const asked: WorkspaceServiceRequest[] = [];
  const link = { request: async (req: WorkspaceServiceRequest) => { asked.push(req); return { kind: 'git.state', state }; } };
  const services = new Map([[canonicalPath(ROOT), { link }]]) as unknown as CommandContext['services'];
  const facet = gitCommands({ chooseDirectory: async () => null, log: (m) => { lines.push(m); }, raiseNoticeKeyed: () => true, services });
  const at: CommandAt = { w: { workspaceId: 'ws-1', workspace: ROOT, followedSessionId: null } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
  return { facet, at, lines, asked };
}

describe('git.read — the Git view, relayed from the workspace service', () => {
  it('answers with the service\'s state and writes no "git view" line of its own (the service wrote it)', async () => {
    const h = harness(view);
    const out = await h.facet['git.read']({ kind: 'git.read' }, h.at);
    expect(out).toEqual({ ok: true, value: view });
    expect(h.asked).toEqual([{ kind: 'git.view', workspaceRoot: canonicalPath(ROOT) }]);
    expect(h.lines.filter((l) => l.startsWith('git view:'))).toEqual([]);
  });

  it('still says the notice it raises when Git is missing — that line is main\'s own fact', async () => {
    const h = harness({ ...view, gitAvailable: false, isRepository: false, branch: null, baseBranch: null });
    await h.facet['git.read']({ kind: 'git.read' }, h.at);
    expect(h.lines).toEqual(['notice: Working without Git']);
  });
});
