import type { ImprovementCommand, VerifierSection } from '@rotaris/contracts';
import { writeVerifierSection } from '@rotaris/config';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import type { ResolvedStore } from '@rotaris/store';
import {
  createImprovementReader,
  createImprovementWriter,
  importLegacyImprovements,
  prepareImprovementRun,
  previewImprovementRollback,
  recordAppliedCheckpoint,
  rollbackImprovement,
  type ImprovementExecutorDeps,
  type ImprovementReader,
  type ImprovementWriter,
} from '@rotaris/workspace';

export interface ImprovementServiceAnswer { readonly value: unknown; readonly changed?: boolean }
export interface ImprovementService { handle(command: ImprovementCommand): Promise<ImprovementServiceAnswer> }

export function createImprovementService(
  open: ResolvedStore,
  deps: {
    readonly workspaceRoot: string;
    readonly configFile: string;
    readonly clocks: Clocks;
    readonly log: (message: string, level?: 'info' | 'warn') => void;
  },
): ImprovementService {
  const logger = { warn: (message: string) => deps.log(message, 'warn') };
  const reader: ImprovementReader = createImprovementReader(open.db, logger);
  const writer: ImprovementWriter = createImprovementWriter(reader, open.db, { now: () => toIsoUtc(deps.clocks.wall.instant()), logger });
  const imported = importLegacyImprovements(deps.workspaceRoot, reader, writer, logger);
  if (imported.imported > 0 || imported.skipped > 0) deps.log(`improvements: imported ${imported.imported}, skipped ${imported.skipped}`, imported.skipped > 0 ? 'warn' : 'info');

  const executorDeps: ImprovementExecutorDeps = {
    workspaceRoot: deps.workspaceRoot,
    clocks: deps.clocks,
    reader,
    writer,
    checkpointDeps: { clocks: deps.clocks },
    warn: logger.warn,
    applyGateSection: async (section: VerifierSection) => {
      const result = await writeVerifierSection(deps.configFile, section, { timers: deps.clocks.timers });
      if (result.ok) return { outcome: result.value.changed ? 'applied' as const : 'unchanged' as const };
      return { outcome: result.error.code === 'invalid' ? 'invalid' as const : 'failed' as const, detail: result.error.fault };
    },
  };

  return Object.freeze({
    async handle(command: ImprovementCommand): Promise<ImprovementServiceAnswer> {
      switch (command.action) {
        case 'list': return { value: reader.list() };
        case 'get': return { value: reader.artifact(command.artifact_id) };
        case 'history': return { value: reader.history(command.artifact_id) };
        case 'approved': return { value: reader.approved(command.artifact_id) };
        case 'save-collected': { const result = writer.save(command.artifact, 'collected', { suppressDuplicates: true }); return { value: result.record, changed: result.changed }; }
        case 'review': { const request = command.request; const result = writer.review(request.artifact_id, request.proposal_id, request.status, request.expected_versions_due); return { value: result, changed: result.changed }; }
        case 'edit': { const request = command.request; const result = writer.edit(request.artifact_id, request.proposal_id, { summary: request.summary, recommended_action: request.recommended_action }, request.expected_versions_due); return { value: result, changed: result.changed }; }
        case 'delete': { const request = command.request; const result = writer.deleteProposal(request.artifact_id, request.proposal_id, request.expected_versions_due); return { value: result, changed: result.changed }; }
        case 'prepare': { const value = await prepareImprovementRun(command.artifact_id, executorDeps, command.dry_run ?? false); return { value, changed: command.dry_run !== true }; }
        case 'record-applied': { const value = await recordAppliedCheckpoint(command.artifact_id, executorDeps); return { value, changed: true }; }
        case 'rollback-preview': return { value: await previewImprovementRollback(command.artifact_id, executorDeps) };
        case 'rollback': { const value = await rollbackImprovement(command.artifact_id, command.force, executorDeps); return { value, changed: value.restored || value.safety_checkpoint !== null }; }
      }
    },
  } satisfies ImprovementService);
}

const services = new WeakMap<ResolvedStore, ImprovementService>();
export function improvementServiceFor(
  open: ResolvedStore,
  deps: {
    readonly workspaceRoot: string;
    readonly configFile: string;
    readonly clocks: Clocks;
    readonly log: (message: string, level?: 'info' | 'warn') => void;
  },
): ImprovementService {
  const present = services.get(open);
  if (present !== undefined) return present;
  const created = createImprovementService(open, deps);
  services.set(open, created);
  return created;
}
