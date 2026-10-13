import { describe, expect, it } from 'vitest';
import { ImprovementAnalysisJobSchema, type ImprovementAnalysisJob, type ProcessReply, type RunHostRequest } from '@rotaris/contracts';
import { improvementsCommands, RETROSPECTIVE_PENDING_REASON } from './improvements.js';
import type { CommandAt, CommandContext, MainWindowState } from './context.js';

/**
 * PD-LIBRARY-002 revision 2, clause (e) (OQ-236): the `improvements.retrospective` handler — the one path all three
 * surfaces raise — refuses a further gesture with one info notice and no capture while a retrospective is queued,
 * running or being captured in the workspace, and a post-run analysis refuses nothing. Driven with plain objects
 * where the run host and the coordinator were, as `skills.test.ts` drives its facet.
 */
const capturedJob = (id: string): ImprovementAnalysisJob => ImprovementAnalysisJobSchema.parse({
  artifact_id: id, workspace_id: 'ws-1', workspace_root: '/work/project', source_session_id: null, generated_at: '2026-10-13T10:00:00.000Z',
  timeout_seconds: 120, collector_model: 'medium', considered_session_ids: ['s-1'], pass: 'retrospective',
  progress: { available: true, entries: [] }, todo: { available: true, entries: [] }, child_reports: { available: true, entries: [] },
  transcript: { available: true, entries: [] }, gate: { available: true, entries: [] }, prior_artifacts_available: true, prior_artifacts: [],
  retrospective: Object.fromEntries(['sessions', 'proposals', 'prompts', 'persona_memory', 'instructions'].map((k) => [k, { available: true, entries: [] }])),
});

function rig(pending: (workspaceId: string) => boolean) {
  const asked: RunHostRequest[] = [];
  const notices: { severity: string; title: string }[] = [];
  const queued: string[] = [];
  let release: ((reply: ProcessReply) => void) | null = null;
  let next = 1;
  const runHost: CommandContext['runHost'] = {
    request: (req) => {
      asked.push(req as RunHostRequest);
      return new Promise<ProcessReply>((resolve) => { release = resolve; });
    },
  };
  const facet = improvementsCommands({
    runHost,
    retrospectivePending: pending,
    enqueueImprovement: (job: ImprovementAnalysisJob) => { queued.push(job.artifact_id); },
    raiseNotice: (severity: string, title: string) => { notices.push({ severity, title }); },
    log: () => undefined,
  } as unknown as Parameters<typeof improvementsCommands>[0]);
  const at: CommandAt = { w: { workspaceId: 'ws-1', workspace: '/work/project' } as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
  const press = () => facet['improvements.retrospective']({ kind: 'improvements.retrospective' }, at);
  const answer = () => { const id = `impart_0000000${next++}`; release!({ kind: 'retrospective.captured', job: capturedJob(id) }); return id; };
  return { asked, notices, queued, press, answer };
}

describe('improvements.retrospective — refused only while a retrospective is pending (PD-LIBRARY-002 revision 2 (e))', () => {
  it('captures and queues while only a post-run analysis is pending: the press waits behind it on the FIFO', async () => {
    const r = rig(() => false);
    const out = r.press();
    await Promise.resolve();
    const id = r.answer();
    expect(await out).toEqual({ ok: true, value: { artifactId: id, sessions: 1 } });
    expect(r.asked.map((q) => q.kind)).toEqual(['retrospective.capture']);
    expect(r.queued).toEqual([id]);
    expect(r.notices).toEqual([]);
  });

  it('refuses with one info notice and asks the run host nothing while a retrospective is queued or running', async () => {
    const r = rig((workspaceId) => workspaceId === 'ws-1');
    expect(await r.press()).toEqual({ ok: false, code: 'retrospective.pending', headline: RETROSPECTIVE_PENDING_REASON });
    expect(RETROSPECTIVE_PENDING_REASON).toBe('A retrospective is already queued or running.');
    expect(r.notices).toEqual([{ severity: 'info', title: RETROSPECTIVE_PENDING_REASON }]);
    expect(r.asked).toEqual([]);
    expect(r.queued).toEqual([]);
  });

  it('refuses a second press made while the first is still being captured, before the FIFO holds it', async () => {
    const r = rig(() => false);
    const first = r.press();
    await Promise.resolve();
    expect(await r.press()).toMatchObject({ ok: false, code: 'retrospective.pending' });
    const id = r.answer();
    expect(await first).toMatchObject({ ok: true });
    expect(r.asked).toHaveLength(1);
    expect(r.queued).toEqual([id]);
    expect(r.notices).toEqual([{ severity: 'info', title: RETROSPECTIVE_PENDING_REASON }]);
  });
});

/**
 * PD-LIBRARY-002 revision 2, clause (e) (OQ-236), fin38's review: a main window reads the activity as it mounts, after it has
 * subscribed. The push main sends a window that has just opened a workspace can reach a renderer that has not subscribed yet
 * (the window has loaded, but its root subscribes only after its boot's own reads and first render), and is then lost
 * (docs/defects/fixed/a-window-opened-while-a-retrospective-is-pending-shows-it-as-not-pending-until-the-next-publication.md).
 */
describe('improvements.activity — the activity as it stands, for the asking window\'s own workspace (PD-LIBRARY-002 revision 2 (e))', () => {
  const activity = { workspace_id: 'ws-2', active: true, queued: 1, source_session_id: null, pass: 'retrospective' as const, retrospective_pending: false };
  const facetFor = (pending: (workspaceId: string) => boolean) => improvementsCommands({
    retrospectivePending: pending,
    improvementActivity: () => activity,
  } as unknown as Parameters<typeof improvementsCommands>[0]);

  it('answers once the window\'s workspace is open, its retrospective_pending that workspace\'s, not the activity\'s', async () => {
    const facet = facetFor((workspaceId) => workspaceId === 'ws-1');
    const state = { workspaceId: undefined as string | undefined, workspace: '/work/project' };
    let open!: () => void;
    const opened = new Promise<void>((resolve) => { open = () => { state.workspaceId = 'ws-1'; resolve(); }; });
    const at: CommandAt = { w: state as unknown as MainWindowState, senderId: 1, awaitWorkspace: () => opened };
    const out = facet['improvements.activity']({ kind: 'improvements.activity' }, at);
    open();
    expect(await out).toEqual({ ok: true, value: { ...activity, retrospective_pending: true } });
    // Another workspace's window is told none is pending, whatever the activity's own workspace holds.
    const other: CommandAt = { w: { workspaceId: 'ws-9', workspace: '/work/other' } as MainWindowState, senderId: 2, awaitWorkspace: async () => undefined };
    expect(await facet['improvements.activity']({ kind: 'improvements.activity' }, other)).toEqual({ ok: true, value: { ...activity, retrospective_pending: false } });
  });

  it('tells a window holding no workspace that none is pending', async () => {
    const facet = facetFor(() => true);
    const at: CommandAt = { w: { workspaceId: undefined, workspace: '(no workspace)' } as unknown as MainWindowState, senderId: 1, awaitWorkspace: async () => undefined };
    expect(await facet['improvements.activity']({ kind: 'improvements.activity' }, at)).toEqual({ ok: true, value: { ...activity, retrospective_pending: false } });
  });
});
