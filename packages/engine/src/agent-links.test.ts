import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { ArtifactStore } from './artifacts/store.js';
import { AgentActivity } from './children/activity.js';
import { artifactLinksOf, entryToolsOf, toSessionRecord } from './sessions.js';

/**
 * Live-run finding K1 (R-067): the inspector drew "No tools resolved." and "No artifacts yet — this build has no artifact
 * store." in every screenshot of a run whose orchestrator had made fifteen calls and whose store held seven reports. The
 * session record now carries the run-level agent's tools (REQ-MONITOR-060/061) and the session's artifact links
 * (REQ-MONITOR-044/052/068/069); these are the two projections that fill it, against the real store.
 */
describe('engine — the run-level agent\'s tools and the session\'s artifact links on the session record (live-run finding K1)', () => {
  let dir: string;
  let dal: StoreDal;
  let sid: SessionId;
  const clock = new FakeClock();
  const store = () => new ArtifactStore({ dal, sessionId: sid, directory: () => join(dir, 'files'), wall: clock, warn: () => undefined });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-agent-links-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    sid = asSessionId('S-links');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: '2026-09-29T00:00:00.000Z', updated_at: '2026-09-29T00:00:00.000Z' });
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  it('a stored record carries none of either until the live projection fills them', () => {
    const row = dal.getSession(sid)!;
    expect(toSessionRecord(row).entryTools).toEqual({ resolved: [], called: [], active: [] });
    expect(toSessionRecord(row).artifacts).toEqual([]);
  });

  it('REQ-MONITOR-060/061 with REQ-ORCH-153: a live run reports its own resolution and history; with none, nothing is resolved and the history is the tracker\'s under the latest root\'s persona, or, before any iteration, under every name that is no child\'s', () => {
    const activity = new AgentActivity();
    activity.started('orchestrator', 'c1', 'delegate');
    activity.settled('orchestrator', 'c1');
    activity.started('orchestrator', 'c2', 'todo');
    activity.started('planner-1', 'c3', 'grep');
    const live = { entryTools: { resolved: ['read_file', 'delegate', 'todo'], called: ['delegate', 'todo'], active: ['todo'] } };
    expect(entryToolsOf(dal, sid, live, activity)).toBe(live.entryTools);
    // No iteration recorded: every root so far was a plan cycle's (REQ-ORCH-153), named by no row, so the history is every
    // name the tracker holds that is no child's — here the root's, not the child `planner-1`'s (the repair of
    // the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md; it read none before).
    dal.insertChild({
      session_id: sid, task_id: 'bg_00000001', canonical_name: 'planner-1', given_name: 'planner-1', persona: 'planner', state: 'completed', parent_id: 'root', depth: 1, iteration: 1,
      model_key: 'm', category: '', background: 0, task: 'plan', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: '2026-09-29T00:00:00.000Z',
    });
    expect(entryToolsOf(dal, sid, null, activity)).toEqual({ resolved: [], called: ['delegate', 'todo'], active: [] });
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'root:1', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: '', task: 'the task', opened_at: '2026-09-29T00:00:01.000Z' });
    expect(entryToolsOf(dal, sid, undefined, activity)).toEqual({ resolved: [], called: ['delegate', 'todo'], active: [] });
  });

  it('REQ-MONITOR-044/052: every artifact not superseded, with its producer, ready flag and consumers, in creation order', () => {
    const s = store();
    const plan = s.publish({ slug: 'the-plan', title: 'The plan', body: 'First.', tags: [], supersedes: null, createdBy: 'planner-1', persona: 'planner' });
    clock.advance(1000);
    const notes = s.publish({ slug: 'notes', title: 'Notes', body: 'Notes.', tags: [], supersedes: null, createdBy: 'orchestrator', persona: 'orchestrator' });
    if (!plan.ok || !notes.ok) throw new Error('publish');
    s.markConsumed(plan.value.id, 'coder-1');
    clock.advance(1000);
    const report = s.materialiseChildReport({ taskId: 'bg_00000001', canonicalName: 'coder-1', persona: 'coding-agent', status: 'failed', summary: 'It failed.', keyFindings: [], highlightPaths: [], snippets: [], editedFiles: [], createdFiles: [], commands: [], tags: [], conversationId: null });
    if (!report.ok) throw new Error(`materialise: ${report.error.reason}`);
    clock.advance(1000);
    const newer = s.publish({ slug: 'notes-v2', title: 'Notes, again', body: 'Notes 2.', tags: [], supersedes: notes.value.id, createdBy: 'orchestrator', persona: 'orchestrator' });
    if (!newer.ok) throw new Error('publish');
    const links = artifactLinksOf(dal, sid);
    expect(links.map((l) => l.slug)).toEqual(['the-plan', report.value.record.slug, 'notes-v2']);
    expect(links[0]).toEqual({ id: plan.value.id, slug: 'the-plan', title: 'The plan', status: 'published', producer: 'planner-1', ready: true, consumedBy: ['coder-1'] });
    expect(links[1]).toMatchObject({ producer: 'coder-1', status: 'failed', ready: false, consumedBy: [] });
  });
});
