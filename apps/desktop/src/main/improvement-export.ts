import { millis, type Timers } from '@rotaris/kernel';
import { replaceDocument } from '@rotaris/platform';
import type { ImprovementArtifactRecord, RecordedImprovementVersion } from '@rotaris/contracts';

export interface ImprovementExportHistory {
  readonly versions: readonly RecordedImprovementVersion[];
  readonly skipped: readonly number[];
  readonly versionsPruned: number;
  readonly versionsNeverRecorded: number;
}

export interface ImprovementExportEntry {
  readonly artifact: ImprovementArtifactRecord['artifact'];
  readonly history_audit: {
    readonly retained_versions: readonly RecordedImprovementVersion[];
    readonly versions_pruned: number;
    readonly versions_never_recorded: number;
    readonly unreadable_versions_skipped: readonly number[];
  };
}

export interface ImprovementStoreExport {
  readonly format: 'rotaris.improvement-store';
  readonly format_version: 1;
  readonly exported_at: string;
  readonly scope: { readonly kind: 'workspace' } | { readonly kind: 'artifact'; readonly artifact_id: string };
  readonly artifacts: readonly ImprovementExportEntry[];
}

/** REQ-LIBRARY-176: current records plus the retained audit, with the two absence causes kept distinct. */
export function buildImprovementExport(
  records: readonly ImprovementArtifactRecord[],
  histories: ReadonlyMap<string, ImprovementExportHistory>,
  exportedAt: string,
  artifactId?: string,
): ImprovementStoreExport {
  return {
    format: 'rotaris.improvement-store',
    format_version: 1,
    exported_at: exportedAt,
    scope: artifactId === undefined ? { kind: 'workspace' } : { kind: 'artifact', artifact_id: artifactId },
    artifacts: records.map((record) => {
      const history = histories.get(record.artifact.artifact_id) ?? { versions: [], skipped: [], versionsPruned: record.versions_pruned, versionsNeverRecorded: record.versions_never_recorded };
      return {
        artifact: record.artifact,
        history_audit: {
          retained_versions: [...history.versions].sort((a, b) => a.version - b.version),
          versions_pruned: history.versionsPruned,
          versions_never_recorded: history.versionsNeverRecorded,
          unreadable_versions_skipped: [...history.skipped].sort((a, b) => a - b),
        },
      };
    }),
  };
}

/** REQ-TRACE-061: five replacement attempts with the fixed export retry ladder. */
export async function writeImprovementExport(destination: string, document: ImprovementStoreExport, timers: Timers) {
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const result = await replaceDocument(destination, text, { createParent: true, timers, ladder: { delays: [millis(50), millis(100), millis(200), millis(400)] } });
  return result.ok
    ? { ok: true as const, bytes: Buffer.byteLength(text, 'utf8'), attempts: result.value.attempts }
    : { ok: false as const, reason: result.error.detail ?? result.error.headline };
}
