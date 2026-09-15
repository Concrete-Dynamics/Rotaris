import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImprovementArtifactRecordSchema } from '@rotaris/contracts';
import { mintWorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { StoreDal, forgetSpelling, openWorkspaceStore, storeDir } from '@rotaris/store';
import { listRefs } from '../git/checkpoints.js';
import { createImprovementReader, createImprovementWriter } from './handles.js';
import {
  IMPROVEMENT_CHECKPOINT_NAMESPACE,
  IMPROVEMENT_EXECUTOR_INSTRUCTIONS,
  buildImprovementRunPlan,
  improvementTask,
  prepareImprovementRun,
  previewImprovementRollback,
  recordAppliedCheckpoint,
  renderImprovementRunPrompt,
  rollbackImprovement,
  type ImprovementExecutorDeps,
} from './executor.js';

const clocks = nodeClocks();
const workspaceId = mintWorkspaceId('000000000000000000000000000000bb');
const roots: string[] = [];
const env = { ...process.env, GIT_AUTHOR_NAME: 'Rotaris Test', GIT_AUTHOR_EMAIL: 'test@rotaris.local', GIT_COMMITTER_NAME: 'Rotaris Test', GIT_COMMITTER_EMAIL: 'test@rotaris.local' };
let gitPresent = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitPresent = false; }

afterEach(() => {
  for (const root of roots.splice(0)) {
    forgetSpelling(storeDir(join(root, 'stores'), workspaceId));
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows can retain a transient SQLite handle. */ }
  }
});

const evidence = [{ kind: 'analyst', text: 'The repeated work is observable.', source_task_id: null, source_artifact_id: null, source_session_id: 'source-session' }];
function record(status: 'pending_review' | 'approved' = 'approved') {
  return ImprovementArtifactRecordSchema.parse({
    artifact: {
      artifact_id: 'impart_00000001', source_session_id: 'source-session', source_run_type: 'task_run', generated_at: '2026-09-15T10:00:00.000Z', collector_model: 'analyst',
      proposals: [
        { id: 'imp_00000001', category: 'workspace_note', summary: 'Record the useful observation.', evidence, recommended_action: 'Add the observation to the workspace notes.', risk: 'low', status, target_persona: null, proposed_verifier_section: null, created_at: '2026-09-15T10:00:00.000Z' },
        { id: 'imp_00000002', category: 'verifier_gate_update', summary: 'Use the repository suite.', evidence, recommended_action: 'Add the suite as a completion gate.', risk: 'medium', status, target_persona: null, proposed_verifier_section: { gate_completion: true, checks: [{ name: 'suite', command: 'pnpm test', role: 'test' }] }, created_at: '2026-09-15T10:00:00.000Z' },
      ],
      considered_session_ids: ['source-session'], notes: null, checkpoints: [], rolled_back_at: null,
    },
    versions_due: 1, versions_pruned: 0, versions_never_recorded: 0,
  });
}

describe('improvement run planning', () => {
  it('includes approved executor tasks, keeps verifier proposals in the gate lane, and freezes the executor instruction block', () => {
    const plan = buildImprovementRunPlan(record());
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0]?.name).toBe('improvement_run');
    expect(plan.phases[0]?.tasks.map((task) => task.proposal_id)).toEqual(['imp_00000001']);
    const prompt = renderImprovementRunPrompt(plan, [{ proposal_id: 'imp_00000002', outcome: 'applied', detail: null }]);
    expect(prompt.startsWith(IMPROVEMENT_EXECUTOR_INSTRUCTIONS)).toBe(true);
    expect(prompt).toContain('imp_00000002: applied');
    expect(prompt).toContain('Add the observation to the workspace notes.');
  });

  it('requires explicit approval and gives persona memory tasks their exact bounded file instruction', () => {
    expect(() => buildImprovementRunPlan(record('pending_review'))).toThrow('explicitly approved proposal');
    const task = improvementTask({ ...record().artifact.proposals[0]!, category: 'persona_memory_update', target_persona: 'tester' });
    expect(task.payload).toContain('Workspace file: .rotaris/persona_memory/tester.md');
    expect(task.payload).toContain('200-line cap');
  });
});

describe.skipIf(!gitPresent)('improvement checkpoint and rollback lifecycle', () => {
  it('records dedicated checkpoints, previews later edits, requires the dirty override, and restores the approved scope', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-improvement-executor-'));
    roots.push(root);
    const workspaceRoot = join(root, 'workspace');
    const storesRoot = join(root, 'stores');
    mkdirSync(workspaceRoot);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: workspaceRoot, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(workspaceRoot, 'note.txt'), 'original\n');
    git('add', '.');
    git('commit', '-q', '-m', 'seed');

    const open = openWorkspaceStore(storesRoot, workspaceId, workspaceRoot);
    new StoreDal(open.db).upsertSession({ session_id: 'source-session', execution_status: 'completed', workspace_root: workspaceRoot, created_at: '2026-09-15T09:00:00.000Z', updated_at: '2026-09-15T10:00:00.000Z' });
    const reader = createImprovementReader(open.db);
    const writer = createImprovementWriter(reader, open.db, { now: () => new Date().toISOString() });
    writer.save(record().artifact, 'collected');
    const gates: unknown[] = [];
    const deps: ImprovementExecutorDeps = {
      workspaceRoot, clocks, reader, writer, checkpointDeps: { clocks },
      applyGateSection: async (section) => { gates.push(section); return { outcome: 'applied' }; },
    };

    const prepared = await prepareImprovementRun('impart_00000001', deps);
    expect(prepared.checkpoint).toMatchObject({ kind: 'pre_improvement', sequence: 0, proposal_ids: ['imp_00000001', 'imp_00000002'] });
    expect(prepared.gate_results).toEqual([{ proposal_id: 'imp_00000002', outcome: 'applied', detail: null }]);
    expect(gates).toHaveLength(1);
    const refs = await listRefs(workspaceRoot, 'impart_00000001', { clocks }, IMPROVEMENT_CHECKPOINT_NAMESPACE);
    expect(refs.ok && refs.entries).toHaveLength(1);

    writeFileSync(join(workspaceRoot, 'note.txt'), 'applied\n');
    await recordAppliedCheckpoint('impart_00000001', deps);
    writeFileSync(join(workspaceRoot, 'note.txt'), 'later user edit\n');
    const preview = await previewImprovementRollback('impart_00000001', deps);
    expect(preview.entries).toEqual([{ path: 'note.txt', action: 'revert' }]);
    expect(preview.dirty).toEqual(['note.txt']);
    expect(preview.dirty_only).toBe(true);

    const blocked = await rollbackImprovement('impart_00000001', false, deps);
    expect(blocked).toMatchObject({ restored: false, changed_files: 0 });
    const restored = await rollbackImprovement('impart_00000001', true, deps);
    expect(restored).toMatchObject({ restored: true, changed_files: 1, reset_proposal_ids: ['imp_00000001', 'imp_00000002'], warning: null });
    expect(readFileSync(join(workspaceRoot, 'note.txt'), 'utf8')).toBe('original\n');
    expect(reader.artifact('impart_00000001').artifact).toMatchObject({ rolled_back_at: expect.any(String), proposals: [{ status: 'pending_review' }, { status: 'pending_review' }] });
    expect(reader.artifact('impart_00000001').artifact.checkpoints.map((checkpoint) => checkpoint.kind)).toEqual(['pre_improvement', 'applied', 'pre_rollback']);
    open.db.close();
  });
});
