import { resolve } from 'node:path';
import {
  VerifierSectionSchema,
  type ImprovementArtifact,
  type ImprovementArtifactRecord,
  type ImprovementCheckpoint,
  type ImprovementCheckpointKind,
  type ImprovementGateResult,
  type ImprovementPreparation,
  type ImprovementProposal,
  type ImprovementRollbackPreview,
  type ImprovementRollbackResult,
  type ImprovementRunPlan,
  type ImprovementRunTask,
  type VerifierSection,
} from '@rotaris/contracts';
import { type Clocks, countNoun, toIsoUtc } from '@rotaris/kernel';
import {
  CHECKPOINT_REF_TIMEOUT,
  capture,
  checkpointFailureText,
  deleteRefs,
  listRefs,
  preview,
  restore,
  sortPaths,
  type CaptureOutcome,
  type CheckpointDeps,
  type PreviewEntry,
} from '../git/checkpoints.js';
import { invokeGit } from '../git/invoke.js';
import type { ImprovementReader, ImprovementWriter } from './handles.js';

export const IMPROVEMENT_CHECKPOINT_NAMESPACE = 'refs/rotaris/improvements';
export const IMPROVEMENT_CHECKPOINT_LIMIT = 10;
export const IMPROVEMENT_EXECUTOR_INSTRUCTIONS = [
  'Execute only the approved improvement proposals in this run plan.',
  'Never resume, reopen, or reinterpret the original user task.',
  'Never propose new improvements or expand the approved scope.',
  'Make the minimal change needed for each proposal.',
  'Skip an unsafe or ambiguous proposal and state the reason.',
  'Summarize applied and skipped work separately.',
  'Do not trigger another improvement run from this run.',
].join('\n');

export interface ImprovementExecutorDeps {
  readonly workspaceRoot: string;
  readonly clocks: Clocks;
  readonly reader: ImprovementReader;
  readonly writer: ImprovementWriter;
  readonly checkpointDeps: CheckpointDeps;
  readonly applyGateSection: (section: VerifierSection) => Promise<{ readonly outcome: 'applied' | 'unchanged' | 'invalid' | 'failed'; readonly detail?: string }>;
  readonly warn?: (message: string) => void;
}

const taskName = (proposal: ImprovementProposal): string => `Apply improvement ${proposal.id}: ${proposal.summary.slice(0, 60)}`;

export function improvementTask(proposal: ImprovementProposal): ImprovementRunTask {
  const lines = [
    `Proposal: ${proposal.id} (${proposal.category})`,
    `Risk: ${proposal.risk}`,
    'Summary:',
    proposal.summary,
    'Recommended action:',
    proposal.recommended_action,
    ...(proposal.target_persona === null ? [] : [`Target persona: ${proposal.target_persona}`]),
    ...(proposal.category === 'persona_memory_update' && proposal.target_persona !== null
      ? [`Workspace file: .rotaris/persona_memory/${proposal.target_persona}.md`, 'Append to or update that file while keeping it within the 200-line cap.']
      : []),
    'Evidence:',
    ...proposal.evidence.map((entry) => `- [${entry.kind}] ${entry.text}`),
  ];
  return { proposal_id: proposal.id, name: taskName(proposal), payload: lines.join('\n') };
}

export function buildImprovementRunPlan(record: ImprovementArtifactRecord): ImprovementRunPlan {
  const approved = record.artifact.proposals.filter((proposal) => proposal.status === 'approved');
  if (approved.length === 0) throw new Error('An improvement run cannot start without at least one explicitly approved proposal.');
  const tasks = approved.filter((proposal) => proposal.category !== 'verifier_gate_update').map(improvementTask);
  return { artifact_id: record.artifact.artifact_id, phases: tasks.length === 0 ? [] : [{ name: 'improvement_run', tasks }] };
}

export function renderImprovementRunPrompt(plan: ImprovementRunPlan, gates: readonly ImprovementGateResult[]): string {
  const gateLines = gates.length === 0 ? [] : ['Gate proposal outcomes:', ...gates.map((gate) => `${gate.proposal_id}: ${gate.outcome}`), ''];
  const taskLines = plan.phases.flatMap((phase) => phase.tasks.flatMap((task) => [`## ${task.name}`, task.payload, '']));
  return [IMPROVEMENT_EXECUTOR_INSTRUCTIONS, '', ...gateLines, ...taskLines].join('\n').trim();
}

export function currentCheckpoint(record: ImprovementArtifactRecord, kind: ImprovementCheckpointKind): ImprovementCheckpoint | null {
  return record.artifact.checkpoints.filter((checkpoint) => checkpoint.kind === kind).sort((a, b) => b.sequence - a.sequence)[0] ?? null;
}

const sameTree = (left: string, right: string): boolean => {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
};

async function gitTreeRoot(candidate: string, deps: CheckpointDeps): Promise<{ ok: true; root: string } | { ok: false; reason: string }> {
  const args = ['-c', 'gc.auto=0', '-C', candidate, 'rev-parse', '--show-toplevel'] as const;
  const result = await invokeGit({
    args,
    workspaceRoot: candidate,
    timeoutMs: deps.refTimeoutMs ?? CHECKPOINT_REF_TIMEOUT,
    timers: deps.clocks.timers,
    clock: deps.clocks.monotonic,
    ...(deps.env === undefined ? {} : { env: deps.env }),
    ...(deps.executable === undefined ? {} : { executable: deps.executable }),
  });
  if (result.outcome === 'exited' && result.status === 0 && result.stdout.trim() !== '') return { ok: true, root: resolve(result.stdout.trim()) };
  return { ok: false, reason: checkpointFailureText(result, args, Number(deps.refTimeoutMs ?? CHECKPOINT_REF_TIMEOUT)) };
}

function retainedCheckpoints(checkpoints: readonly ImprovementCheckpoint[]): { kept: ImprovementCheckpoint[]; dropped: ImprovementCheckpoint[] } {
  const kept = [...checkpoints].sort((a, b) => a.sequence - b.sequence);
  const dropped: ImprovementCheckpoint[] = [];
  const protectedSequence = kept.filter((checkpoint) => checkpoint.kind === 'pre_improvement').at(-1)?.sequence;
  while (kept.length > IMPROVEMENT_CHECKPOINT_LIMIT) {
    const index = kept.findIndex((checkpoint) => checkpoint.sequence !== protectedSequence);
    if (index < 0) break;
    dropped.push(kept.splice(index, 1)[0]!);
  }
  return { kept, dropped };
}

async function recordCheckpoint(
  record: ImprovementArtifactRecord,
  kind: ImprovementCheckpointKind,
  proposalIds: readonly string[],
  deps: ImprovementExecutorDeps,
): Promise<{ record: ImprovementArtifactRecord; checkpoint: ImprovementCheckpoint | null; reason: string | null }> {
  const tree = await gitTreeRoot(deps.workspaceRoot, deps.checkpointDeps);
  if (!tree.ok) return { record, checkpoint: null, reason: `${deps.workspaceRoot} is not inside a Git working tree, so no rollback point could be taken for this improvement run.` };
  const refs = await listRefs(tree.root, record.artifact.artifact_id, deps.checkpointDeps, IMPROVEMENT_CHECKPOINT_NAMESPACE);
  const recordedMax = record.artifact.checkpoints.reduce((value, checkpoint) => Math.max(value, checkpoint.sequence), -1);
  const refMax = refs.ok ? refs.entries.reduce((value, entry) => Math.max(value, entry.sequence), -1) : -1;
  const sequence = Math.max(recordedMax, refMax) + 1;
  const captured: CaptureOutcome = await capture(tree.root, {
    sessionId: record.artifact.artifact_id,
    sequence,
    includeUntracked: true,
    namespace: IMPROVEMENT_CHECKPOINT_NAMESPACE,
    recordClean: true,
    message: `Rotaris improvement ${record.artifact.artifact_id} ${kind} checkpoint ${sequence}`,
  }, deps.checkpointDeps);
  if (captured.outcome === 'nothing-to-record') return { record, checkpoint: null, reason: 'The workspace has no committed content and no files to record, so no rollback point could be taken.' };
  if (captured.outcome === 'unavailable') return { record, checkpoint: null, reason: `${deps.workspaceRoot} is not inside a Git working tree, so no rollback point could be taken for this improvement run.` };
  if (captured.outcome === 'failed') throw new Error(captured.detail);
  const checkpoint: ImprovementCheckpoint = {
    sequence,
    ref: captured.ref,
    commit: captured.commit,
    kind,
    files: [...captured.files],
    proposal_ids: [...proposalIds],
    tree_root: tree.root,
    created_at: toIsoUtc(deps.clocks.wall.instant()),
  };
  const retained = retainedCheckpoints([...record.artifact.checkpoints, checkpoint]);
  let saved: ImprovementArtifactRecord;
  try {
    saved = deps.writer.save({ ...record.artifact, checkpoints: retained.kept }, 'checkpoint', { expectedVersionsDue: record.versions_due }).record;
  } catch (cause) {
    await deleteRefs(tree.root, record.artifact.artifact_id, [{ ref: checkpoint.ref, commit: checkpoint.commit }], deps.checkpointDeps);
    throw cause;
  }
  if (retained.dropped.length > 0) {
    const removed = await deleteRefs(tree.root, record.artifact.artifact_id, retained.dropped.map(({ ref, commit }) => ({ ref, commit })), deps.checkpointDeps);
    if (removed.failed.length > 0) deps.warn?.(`improvement checkpoint pruning left ${removed.failed.length} ref(s): ${removed.failed.map((failure) => `${failure.ref}: ${failure.detail}`).join('; ')}`);
  }
  return { record: saved, checkpoint, reason: null };
}

export async function prepareImprovementRun(artifactId: string, deps: ImprovementExecutorDeps, dryRun = false): Promise<ImprovementPreparation> {
  let record = deps.reader.artifact(artifactId);
  const plan = buildImprovementRunPlan(record);
  const approved = record.artifact.proposals.filter((proposal) => proposal.status === 'approved');
  const gateResults: ImprovementGateResult[] = [];
  for (const proposal of approved.filter((candidate) => candidate.category === 'verifier_gate_update')) {
    const parsed = VerifierSectionSchema.safeParse(proposal.proposed_verifier_section);
    if (!parsed.success) { gateResults.push({ proposal_id: proposal.id, outcome: 'invalid', detail: parsed.error.issues[0]?.message ?? 'invalid verifier section' }); continue; }
    if (dryRun) { gateResults.push({ proposal_id: proposal.id, outcome: 'unchanged', detail: 'dry run' }); continue; }
    const applied = await deps.applyGateSection(parsed.data);
    gateResults.push({ proposal_id: proposal.id, outcome: applied.outcome, detail: applied.detail ?? null });
  }
  let checkpoint: ImprovementCheckpoint | null = currentCheckpoint(record, 'pre_improvement');
  let checkpointReason: string | null = null;
  if (!dryRun && (checkpoint === null || record.artifact.rolled_back_at !== null)) {
    const captured = await recordCheckpoint(record, 'pre_improvement', approved.map((proposal) => proposal.id), deps);
    record = captured.record;
    checkpoint = captured.checkpoint;
    checkpointReason = captured.reason;
  }
  return { artifact: record, plan, prompt: renderImprovementRunPrompt(plan, gateResults), gate_results: gateResults, checkpoint, checkpoint_reason: checkpointReason };
}

export async function recordAppliedCheckpoint(artifactId: string, deps: ImprovementExecutorDeps): Promise<ImprovementArtifactRecord> {
  const record = deps.reader.artifact(artifactId);
  const proposalIds = currentCheckpoint(record, 'pre_improvement')?.proposal_ids ?? record.artifact.proposals.filter((proposal) => proposal.status === 'approved').map((proposal) => proposal.id);
  return (await recordCheckpoint(record, 'applied', proposalIds, deps)).record;
}

interface RollbackState {
  readonly record: ImprovementArtifactRecord;
  readonly point: ImprovementCheckpoint | null;
  readonly treeRoot: string | null;
  readonly entries: readonly PreviewEntry[];
  readonly public: ImprovementRollbackPreview;
}

function dirtyReason(artifactId: string, dirty: readonly string[]): string {
  const shown = sortPaths(dirty).slice(0, 5);
  const more = dirty.length > shown.length ? ` and ${dirty.length - shown.length} more` : '';
  return `Rolling back improvement ${artifactId} would overwrite ${countNoun(dirty.length, 'change')} made since the run: ${shown.join(', ')}${more}. Turn on the explicit override and confirm again to overwrite them.`;
}

async function rollbackState(artifactId: string, deps: ImprovementExecutorDeps): Promise<RollbackState> {
  let record: ImprovementArtifactRecord;
  try { record = deps.reader.artifact(artifactId); } catch {
    return { record: null as never, point: null, treeRoot: null, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `No improvement artifact ${artifactId} exists in this workspace.`, dirty_only: false } };
  }
  const point = currentCheckpoint(record, 'pre_improvement');
  if (point === null) return { record, point, treeRoot: null, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `No rollback point was recorded for improvement ${artifactId}.`, dirty_only: false } };
  const tree = await gitTreeRoot(deps.workspaceRoot, deps.checkpointDeps);
  if (!tree.ok) return { record, point, treeRoot: null, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `${deps.workspaceRoot} is not inside a Git working tree, so no rollback point could be taken for this improvement run.`, dirty_only: false } };
  if (!sameTree(point.tree_root, tree.root)) return { record, point, treeRoot: tree.root, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `That rollback point was taken in ${point.tree_root}, not in ${tree.root}. Restoring it here would overwrite a working tree it never described.`, dirty_only: false } };
  const candidates = record.artifact.checkpoints.filter((checkpoint) => checkpoint.kind === 'applied' || checkpoint.kind === 'pre_rollback').sort((a, b) => b.sequence - a.sequence).map(({ sequence, commit }) => ({ sequence, commit }));
  const inspected = await preview(tree.root, { sessionId: artifactId, sequence: point.sequence, commit: point.commit, includeUntracked: true, candidates, namespace: IMPROVEMENT_CHECKPOINT_NAMESPACE }, deps.checkpointDeps);
  if (inspected.treeState === 'ref-gone') return { record, point, treeRoot: tree.root, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `Improvement ${artifactId} has a recorded rollback point but its Git snapshot is gone, so it can no longer be rolled back.`, dirty_only: false } };
  if (inspected.treeState !== 'ok') return { record, point, treeRoot: tree.root, entries: [], public: { artifact_id: artifactId, entries: [], dirty: [], blocked_reason: `Improvement ${artifactId} could not be previewed because the workspace's Git repository could not be inspected: ${inspected.blockedReason}`, dirty_only: false } };
  const entries = inspected.entries.map((entry) => ({ path: entry.path, action: entry.status === 'A' ? 'delete' as const : entry.status === 'D' ? 'restore' as const : 'revert' as const })).sort((a, b) => a.path.localeCompare(b.path));
  const blocked = inspected.dirty.length === 0 ? null : dirtyReason(artifactId, inspected.dirty);
  return { record, point, treeRoot: tree.root, entries: inspected.entries, public: { artifact_id: artifactId, entries, dirty: sortPaths(inspected.dirty), blocked_reason: blocked, dirty_only: blocked !== null } };
}

export async function previewImprovementRollback(artifactId: string, deps: ImprovementExecutorDeps): Promise<ImprovementRollbackPreview> {
  return (await rollbackState(artifactId, deps)).public;
}

export async function rollbackImprovement(artifactId: string, force: boolean, deps: ImprovementExecutorDeps): Promise<ImprovementRollbackResult> {
  const state = await rollbackState(artifactId, deps);
  if (state.public.blocked_reason !== null && !(force && state.public.dirty_only)) return { restored: false, changed_files: 0, reset_proposal_ids: [], safety_checkpoint: null, blocked_reason: state.public.blocked_reason, warning: null };
  if (state.point === null || state.treeRoot === null) return { restored: false, changed_files: 0, reset_proposal_ids: [], safety_checkpoint: null, blocked_reason: state.public.blocked_reason, warning: null };
  let safety;
  try { safety = await recordCheckpoint(state.record, 'pre_rollback', state.point.proposal_ids, deps); } catch (cause) {
    return { restored: false, changed_files: 0, reset_proposal_ids: [], safety_checkpoint: null, blocked_reason: `Could not record a safety checkpoint before the rollback: ${String(cause instanceof Error ? cause.message : cause)}`, warning: null };
  }
  if (safety.checkpoint === null) return { restored: false, changed_files: 0, reset_proposal_ids: [], safety_checkpoint: null, blocked_reason: `Could not record a safety checkpoint before the rollback: ${safety.reason ?? 'no checkpoint was recorded'}`, warning: null };
  const restored = await restore(state.treeRoot, { sessionId: artifactId, sequence: state.point.sequence, commit: state.point.commit, entries: state.entries }, deps.checkpointDeps);
  if (!restored.ok) return { restored: false, changed_files: 0, reset_proposal_ids: [], safety_checkpoint: safety.checkpoint, blocked_reason: restored.detail, warning: null };
  const targetIds = state.point.proposal_ids.length === 0
    ? safety.record.artifact.proposals.filter((proposal) => proposal.status === 'approved').map((proposal) => proposal.id)
    : state.point.proposal_ids;
  const reset = new Set(targetIds);
  const resetIds = safety.record.artifact.proposals.filter((proposal) => reset.has(proposal.id) && proposal.status === 'approved').map((proposal) => proposal.id);
  const artifact: ImprovementArtifact = {
    ...safety.record.artifact,
    proposals: safety.record.artifact.proposals.map((proposal) => reset.has(proposal.id) && proposal.status === 'approved' ? { ...proposal, status: 'pending_review' as const } : proposal),
    rolled_back_at: toIsoUtc(deps.clocks.wall.instant()),
  };
  try {
    deps.writer.save(artifact, 'rollback', { expectedVersionsDue: safety.record.versions_due });
    return { restored: true, changed_files: restored.touched.length, reset_proposal_ids: resetIds, safety_checkpoint: safety.checkpoint, blocked_reason: null, warning: null };
  } catch (cause) {
    const warning = `The workspace was rolled back, but the reversal could not be recorded on improvement ${artifactId}: ${String(cause instanceof Error ? cause.message : cause)}. Its proposals still read as approved even though their changes are gone.`;
    return { restored: true, changed_files: restored.touched.length, reset_proposal_ids: [], safety_checkpoint: safety.checkpoint, blocked_reason: null, warning };
  }
}
