import { ImprovementPreparationSchema, ImprovementRollbackPreviewSchema, ImprovementRollbackResultSchema, type ImprovementArtifactRecord, type ProposalStatus } from '@rotaris/contracts';
import { buildImprovementExport, writeImprovementExport, type ImprovementExportHistory } from '../improvement-export.js';
import { canonicalPath } from '@rotaris/platform';
import { millis, toIsoUtc } from '@rotaris/kernel';
import { randomUUID } from 'node:crypto';
import { refusal, type CommandContext, type CommandHandlers } from './context.js';

/**
 * IMPROVEMENTS — the proposal run, its review, the rollback and the export (ADR-0052, REQ-IMPROVE-*). The
 * coordinator main holds does the work; these handlers start it, read it back, and keep the undo that lets a
 * decision be taken back before the artifact is closed.
 */
export function improvementsCommands(
  ctx: Pick<CommandContext, 'chooseExportPath' | 'clocks' | 'enqueueImprovement' | 'improvementRuns' | 'improvementUndo' | 'libraryRevision' | 'log' | 'notices' | 'raiseNotice' | 'runHost' | 'services'>,
): Pick<CommandHandlers, 'improvements.start' | 'improvements.retrospective' | 'improvements.rollbackPreview' | 'improvements.rollback' | 'improvements' | 'improvements.undoReview' | 'improvements.export'> {
  const { chooseExportPath, clocks, enqueueImprovement, improvementRuns, improvementUndo, libraryRevision, log, notices, raiseNotice, runHost, services } = ctx;
  return {
    /**
     * PD-LIBRARY-002: the second analysis pass, and the ONLY way it ever starts — a person raised this command
     * from one of its three surfaces. No run completion, no schedule and no agent reaches it, because the pass
     * spends the owner's money. The run host captures the evidence; the job then rides the same FIFO, the same
     * analyst and the same save path as the post-run pass, so nothing downstream of here knows it exists.
     */
    'improvements.retrospective': async (_req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before looking back over its history' };
      const captured = await runHost
        .request({ kind: 'retrospective.capture', workspaceId: w.workspaceId, workspaceRoot: canonicalPath(w.workspace) }, millis(30_000))
        .catch((cause: Error) => ({ kind: 'refused' as const, code: 'retrospective.capture', headline: 'The retrospective could not be started', detail: cause.message }));
      if (captured.kind !== 'retrospective.captured') {
        const detail = captured.kind === 'refused' ? [captured.headline, captured.detail].filter(Boolean).join(': ') : `unexpected reply ${captured.kind}`;
        /*
         * REQ-LIBRARY-037 with PD-LIBRARY-002: ONE informational notice per gesture, not one per workspace —
         * the user asked for this pass by name, so each asking is answered. The action opens the settings
         * category holding the slot that would resolve it.
         */
        if (captured.kind === 'refused' && captured.code === 'retrospective.no-model') {
          raiseNotice('info', 'The retrospective needs a model', 'Choose a retrospective or medium model, then run the retrospective again.', [{ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }]);
          return { ok: false, code: captured.code, headline: captured.headline, detail };
        }
        if (captured.kind === 'refused' && captured.code === 'retrospective.no-evidence') {
          raiseNotice('info', 'There is nothing to look back over yet', 'This workspace has no sessions, prompts, proposals or instruction files for a retrospective to read.');
          return { ok: false, code: captured.code, headline: captured.headline, detail };
        }
        raiseNotice('error', 'The retrospective could not be started', detail);
        return refusal(captured, 'The retrospective could not be started');
      }
      enqueueImprovement(captured.job);
      log(`retrospective ${captured.job.artifact_id} queued over ${captured.job.considered_session_ids.length} session(s)`);
      return { ok: true, value: { artifactId: captured.job.artifact_id, sessions: captured.job.considered_session_ids.length } };
    },
    // ---- Part X: the saved prompts (REQ-LIBRARY-137/138). Relayed to the run host, which owns the store, exactly
    // as `timeline.append` is; main adds the library revision (REQ-LIBRARY-105) and REQ-LIBRARY-138's failure notice. ----
    'improvements.start': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting an improvement run' };
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const preparedReply = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'prepare', artifact_id: req.artifactId } }, millis(320_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'improvements.prepare', headline: 'The improvement run could not be prepared', detail: cause.message }));
      if (preparedReply.kind !== 'improvements.result') {
        raiseNotice('error', 'The improvement run could not be prepared', preparedReply.kind === 'refused' ? [preparedReply.headline, preparedReply.detail].filter(Boolean).join(': ') : `unexpected reply ${preparedReply.kind}`);
        return refusal(preparedReply, 'The improvement run could not be prepared');
      }
      const parsed = ImprovementPreparationSchema.safeParse(preparedReply.value);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        raiseNotice('error', 'The improvement run could not be prepared', detail);
        return { ok: false, code: 'improvements.preparation-invalid', headline: 'The improvement run could not be prepared', detail };
      }
      const prepared = parsed.data;
      libraryRevision.bump('improvement-artifacts');
      for (const gate of prepared.gate_results) {
        const detail = gate.detail === null ? undefined : gate.detail;
        raiseNotice(gate.outcome === 'failed' || gate.outcome === 'invalid' ? 'warning' : 'info', `${gate.proposal_id}: ${gate.outcome}`, detail);
      }
      if (prepared.checkpoint === null && prepared.checkpoint_reason !== null) raiseNotice('warning', `Improvement ${req.artifactId} has no rollback point`, prepared.checkpoint_reason);
      if (prepared.plan.phases.length === 0) {
        raiseNotice('success', `Applied approved gate proposals from ${req.artifactId}.`, 'The artifact contained no approved agent tasks.');
        return { ok: true, value: { sessionId: null, gateOnly: true } };
      }
      const initialTodo = {
        schema_version: 1 as const,
        phases: prepared.plan.phases.map((phase) => ({ name: phase.name, tasks: phase.tasks.map((task) => ({ id: task.proposal_id, text: task.payload, state: 'pending' as const, consecutiveRetries: 0 as const })) })),
      };
      // ADR-0019: an unanswered run host refuses the start rather than throwing out of the command (R0-2).
      const started = await runHost.request({ kind: 'session.start', workspaceId: w.workspaceId, prompt: prepared.prompt, runType: 'improvement_run', initialTodo }, millis(320_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'run-host.unreachable', headline: 'The improvement run could not be started', detail: cause.message }));
      if (started.kind !== 'session.started') {
        raiseNotice('error', 'The improvement run could not be started', started.kind === 'refused' ? [started.headline, started.detail].filter(Boolean).join(': ') : `unexpected reply ${started.kind}`);
        return refusal(started, 'The improvement run could not be started');
      }
      improvementRuns.set(started.sessionId, { artifactId: req.artifactId, workspaceRoot: root });
      await notices.clearForRunStart(started.sessionId);
      w.personaWindows.destroyAll('a new session started');
      log(`improvement ${req.artifactId} started as session ${started.sessionId}`);
      return { ok: true, value: { sessionId: started.sessionId, gateOnly: false } };
    },
    'improvements.rollbackPreview': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before previewing an improvement rollback' };
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const reply = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'rollback-preview', artifact_id: req.artifactId } }, millis(120_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'improvements.preview', headline: 'The rollback preview could not be computed', detail: cause.message }));
      if (reply.kind !== 'improvements.result') return refusal(reply, 'The rollback preview could not be computed');
      const parsed = ImprovementRollbackPreviewSchema.safeParse(reply.value);
      return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: 'improvements.preview-invalid', headline: 'The rollback preview could not be computed', detail: parsed.error.message };
    },
    'improvements.rollback': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before rolling back an improvement' };
      const root = canonicalPath(w.workspace);
      const svc = services.get(root);
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const reply = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'rollback', artifact_id: req.artifactId, force: req.force } }, millis(320_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'improvements.rollback', headline: 'The improvement rollback could not be completed', detail: cause.message }));
      if (reply.kind !== 'improvements.result') {
        raiseNotice('error', 'The improvement rollback could not be completed', reply.kind === 'refused' ? [reply.headline, reply.detail].filter(Boolean).join(': ') : `unexpected reply ${reply.kind}`);
        return refusal(reply, 'The improvement rollback could not be completed');
      }
      const parsed = ImprovementRollbackResultSchema.safeParse(reply.value);
      if (!parsed.success) return { ok: false, code: 'improvements.rollback-invalid', headline: 'The improvement rollback could not be completed', detail: parsed.error.message };
      const result = parsed.data;
      libraryRevision.bump('improvement-artifacts');
      if (!result.restored) {
        const detail = result.blocked_reason ?? `Improvement ${req.artifactId} could not be rolled back.`;
        raiseNotice('error', `Improvement ${req.artifactId} was not rolled back`, detail);
      } else if (result.warning !== null) {
        raiseNotice('warning', `Improvement ${req.artifactId} was rolled back with a recording warning`, result.warning);
      } else {
        const ids = result.reset_proposal_ids.length === 0 ? 'No proposal statuses changed.' : `Returned to pending review: ${result.reset_proposal_ids.join(', ')}.`;
        raiseNotice('success', `Rolled back improvement ${req.artifactId}`, `${result.changed_files} file${result.changed_files === 1 ? '' : 's'} changed. ${ids} Safety checkpoint ${result.safety_checkpoint?.ref ?? 'recorded'}.`);
      }
      return { ok: true, value: result };
    },
    'improvements': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading improvement artifacts' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const root = canonicalPath(w.workspace);
      const command = req.command;
      const reply = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command }, millis(10_000)).catch((cause: Error) => ({ kind: 'refused' as const, code: 'improvements.failed', headline: 'The improvement store could not be updated', detail: cause.message }));
      if (reply.kind !== 'improvements.result') {
        const headline = command.action === 'list' || command.action === 'get' || command.action === 'history' ? 'The improvement artifacts could not be read' : 'Could not update proposal';
        raiseNotice('error', headline, reply.kind === 'refused' ? [reply.headline, reply.detail].filter(Boolean).join(': ') : `unexpected reply ${reply.kind}`);
        return refusal(reply, headline);
      }
      if (reply.changed === true) libraryRevision.bump('improvement-artifacts');
      if (command.action === 'review' && reply.changed === true) {
        const result = reply.value as { previous: ProposalStatus; current: ProposalStatus; record: ImprovementArtifactRecord };
        const proposal = result.record.artifact.proposals.find((candidate) => candidate.id === command.request.proposal_id);
        const undoId = randomUUID();
        improvementUndo.set(undoId, { artifactId: command.request.artifact_id, proposalId: command.request.proposal_id, previous: result.previous, current: result.current, summary: proposal?.summary ?? command.request.proposal_id });
        raiseNotice('success', `Proposal marked ${result.current.replaceAll('_', ' ')}`, proposal?.summary, [{ label: 'Undo', action: { kind: 'revert-proposal-review', id: undoId } }]);
      } else if (command.action === 'edit' && reply.changed === true) raiseNotice('success', 'Proposal updated.');
      else if (command.action === 'delete' && reply.changed === true) raiseNotice('success', 'Proposal deleted.');
      return { ok: true, value: reply.value };
    },
    'improvements.undoReview': async (req, { w, awaitWorkspace }) => {
      const undo = improvementUndo.get(req.id);
      if (!undo) return { ok: false, code: 'improvements.undo-spent', headline: 'This proposal review can no longer be undone.' };
      improvementUndo.delete(req.id);
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open the proposal workspace before undoing its review' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const root = canonicalPath(w.workspace);
      const loaded = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'get', artifact_id: undo.artifactId } }, millis(10_000)).catch(() => null);
      if (loaded?.kind !== 'improvements.result') {
        raiseNotice('warning', `Proposal ${undo.proposalId} is gone.`, 'The undo wrote nothing.');
        libraryRevision.bump('improvement-artifacts');
        return { ok: false, code: 'improvements.undo-gone', headline: `Proposal ${undo.proposalId} is gone.` };
      }
      const record = loaded.value as ImprovementArtifactRecord;
      const proposal = record.artifact.proposals.find((candidate) => candidate.id === undo.proposalId);
      if (!proposal) {
        raiseNotice('warning', `Proposal ${undo.proposalId} is gone.`, 'The undo wrote nothing.');
        libraryRevision.bump('improvement-artifacts');
        return { ok: false, code: 'improvements.undo-gone', headline: `Proposal ${undo.proposalId} is gone.` };
      }
      if (proposal.status !== undo.current) {
        raiseNotice('warning', `Proposal ${undo.proposalId} has since changed.`, `Its current status is ${proposal.status.replaceAll('_', ' ')}. The undo wrote nothing.`);
        libraryRevision.bump('improvement-artifacts');
        return { ok: false, code: 'improvements.undo-stale', headline: `Proposal ${undo.proposalId} has since changed`, detail: `Its current status is ${proposal.status}.` };
      }
      const restored = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'review', request: { artifact_id: undo.artifactId, proposal_id: undo.proposalId, status: undo.previous, expected_versions_due: record.versions_due } } }, millis(10_000)).catch(() => null);
      if (restored?.kind !== 'improvements.result') {
        raiseNotice('error', 'Could not update proposal', restored?.kind === 'refused' ? [restored.headline, restored.detail].filter(Boolean).join(': ') : 'The undo could not be stored.');
        return { ok: false, code: 'improvements.undo-failed', headline: 'Could not update proposal' };
      }
      libraryRevision.bump('improvement-artifacts');
      raiseNotice('success', `Proposal returned to ${undo.previous.replaceAll('_', ' ')}`, undo.summary);
      return { ok: true, value: restored.value };
    },
    'improvements.export': async (req, { w, awaitWorkspace }) => {
      await awaitWorkspace();
      if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before exporting improvement artifacts' };
      const svc = services.get(canonicalPath(w.workspace));
      if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
      const root = canonicalPath(w.workspace);
      const read = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: req.artifactId === undefined ? { action: 'list' } : { action: 'get', artifact_id: req.artifactId } }, millis(10_000)).catch(() => null);
      if (read?.kind !== 'improvements.result') {
        const reason = read?.kind === 'refused' ? [read.headline, read.detail].filter(Boolean).join(': ') : 'The improvement store did not answer.';
        raiseNotice('error', 'The improvement artifacts could not be exported', reason);
        return { ok: false, code: 'improvements.export-read', headline: 'The improvement artifacts could not be exported', detail: reason };
      }
      const records = req.artifactId === undefined ? read.value as ImprovementArtifactRecord[] : [read.value as ImprovementArtifactRecord];
      const histories = new Map<string, ImprovementExportHistory>();
      for (const record of records) {
        const history = await svc.link.request({ kind: 'improvements.command', workspaceRoot: root, command: { action: 'history', artifact_id: record.artifact.artifact_id } }, millis(10_000)).catch(() => null);
        if (history?.kind !== 'improvements.result') {
          const reason = history?.kind === 'refused' ? [history.headline, history.detail].filter(Boolean).join(': ') : `History for ${record.artifact.artifact_id} could not be read.`;
          raiseNotice('error', 'The improvement artifacts could not be exported', reason);
          return { ok: false, code: 'improvements.export-history', headline: 'The improvement artifacts could not be exported', detail: reason };
        }
        histories.set(record.artifact.artifact_id, history.value as ImprovementExportHistory);
      }
      const destination = await chooseExportPath(w.win, { title: req.artifactId === undefined ? 'Export improvement artifacts' : `Export ${req.artifactId}`, defaultPath: req.artifactId === undefined ? 'rotaris-improvements.json' : `${req.artifactId}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (destination === null) return { ok: true, value: { cancelled: true } };
      const document = buildImprovementExport(records, histories, toIsoUtc(clocks.wall.instant()), req.artifactId);
      const written = await writeImprovementExport(destination, document, clocks.timers);
      if (!written.ok) {
        raiseNotice('error', 'The improvement artifacts could not be exported', written.reason);
        return { ok: false, code: 'improvements.export-write', headline: 'The improvement artifacts could not be exported', detail: written.reason };
      }
      raiseNotice('success', `Exported ${records.length} improvement artifact${records.length === 1 ? '' : 's'}.`, destination);
      return { ok: true, value: { cancelled: false, destination, bytes: written.bytes } };
    },
  };
}
