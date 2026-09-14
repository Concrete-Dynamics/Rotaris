import type { ImprovementCommand } from '@rotaris/contracts';
import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import type { ResolvedStore } from '@rotaris/store';
import { createImprovementReader, createImprovementWriter, importLegacyImprovements, type ImprovementReader, type ImprovementWriter } from '@rotaris/workspace';

export interface ImprovementServiceAnswer { readonly value: unknown; readonly changed?: boolean }
export interface ImprovementService { handle(command: ImprovementCommand): ImprovementServiceAnswer }

export function createImprovementService(
  open: ResolvedStore,
  deps: { readonly workspaceRoot: string; readonly clocks: Clocks; readonly log: (message: string, level?: 'info' | 'warn') => void },
): ImprovementService {
  const logger = { warn: (message: string) => deps.log(message, 'warn') };
  const reader: ImprovementReader = createImprovementReader(open.db, logger);
  const writer: ImprovementWriter = createImprovementWriter(reader, open.db, { now: () => toIsoUtc(deps.clocks.wall.instant()), logger });
  const imported = importLegacyImprovements(deps.workspaceRoot, reader, writer, logger);
  if (imported.imported > 0 || imported.skipped > 0) deps.log(`improvements: legacy import added ${imported.imported}, skipped ${imported.skipped}`, imported.skipped > 0 ? 'warn' : 'info');

  return Object.freeze({
    handle(command) {
      switch (command.action) {
        case 'list': return { value: reader.list() };
        case 'get': return { value: reader.artifact(command.artifact_id) };
        case 'history': return { value: reader.history(command.artifact_id) };
        case 'approved': return { value: reader.approved(command.artifact_id) };
        case 'save-collected': {
          const result = writer.save(command.artifact, 'collected', { suppressDuplicates: true });
          return { value: result.record, changed: result.changed };
        }
        case 'review': {
          const request = command.request;
          const result = writer.review(request.artifact_id, request.proposal_id, request.status, request.expected_versions_due);
          return { value: result, changed: result.changed };
        }
        case 'edit': {
          const request = command.request;
          const result = writer.edit(request.artifact_id, request.proposal_id, request, request.expected_versions_due);
          return { value: result, changed: result.changed };
        }
        case 'delete': {
          const request = command.request;
          const result = writer.deleteProposal(request.artifact_id, request.proposal_id, request.expected_versions_due);
          return { value: result, changed: result.changed };
        }
      }
    },
  } satisfies ImprovementService);
}

const services = new WeakMap<ResolvedStore, ImprovementService>();
export function improvementServiceFor(
  open: ResolvedStore,
  deps: { readonly workspaceRoot: string; readonly clocks: Clocks; readonly log: (message: string, level?: 'info' | 'warn') => void },
): ImprovementService {
  const present = services.get(open);
  if (present !== undefined) return present;
  const created = createImprovementService(open, deps);
  services.set(open, created);
  return created;
}
