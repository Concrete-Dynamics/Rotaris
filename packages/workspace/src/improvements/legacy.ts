import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ImprovementReader, ImprovementWriter, ImprovementLogger } from './handles.js';

/** REQ-LIBRARY-044: one read-only sweep of the retired per-session artifact layout. */
export function importLegacyImprovements(
  workspaceRoot: string,
  reader: ImprovementReader,
  writer: ImprovementWriter,
  logger: ImprovementLogger,
): { readonly imported: number; readonly skipped: number } {
  const sessions = join(workspaceRoot, '.rotaris', 'sessions');
  if (!existsSync(sessions)) return { imported: 0, skipped: 0 };
  const present = new Set(reader.ids());
  let imported = 0;
  let skipped = 0;
  for (const sessionName of readdirSync(sessions).sort()) {
    const directory = join(sessions, sessionName, 'improvement_artifacts');
    if (!existsSync(directory) || !statSync(directory).isDirectory()) continue;
    for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.json')).sort()) {
      const path = join(directory, name);
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as { artifact_id?: unknown };
        if (typeof raw.artifact_id === 'string' && present.has(raw.artifact_id)) continue;
        const result = writer.save(raw, 'collected', { suppressDuplicates: true });
        present.add(result.record.artifact.artifact_id);
        imported++;
      } catch (error) {
        skipped++;
        logger.warn(`legacy improvement artifact '${path}' skipped: ${String(error)}`);
      }
    }
  }
  return { imported, skipped };
}
