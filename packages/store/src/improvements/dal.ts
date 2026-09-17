import type { StoreHandle } from '../open.js';

export const IMPROVEMENT_HISTORY_LIMIT = 25;

export interface ImprovementArtifactRow {
  readonly artifact_id: string;
  /** v19 (ADR-0065): null for a retrospective, which belongs to no session. */
  readonly source_session_id: string | null;
  readonly source_kind: string;
  readonly source_run_type: string;
  readonly generated_at: string;
  readonly body: string;
  readonly versions_due: number;
  readonly versions_pruned: number;
}

export interface ImprovementVersionRow {
  readonly artifact_id: string;
  readonly version: number;
  readonly recorded_at: string;
  readonly cause: string;
  readonly body: string;
}

export interface ImprovementArtifactWrite {
  readonly artifact_id: string;
  readonly source_session_id: string | null;
  readonly source_kind: string;
  readonly source_run_type: string;
  readonly generated_at: string;
  readonly body: string;
  readonly versions_due: number;
  readonly versions_pruned: number;
}

/** Statement-shaped access to v19's current rows and immutable history rows. */
export class ImprovementDal {
  private readonly listNewestStmt;
  private readonly listIdsStmt;
  private readonly byIdStmt;
  private readonly latestStmt;
  private readonly latestForSessionStmt;
  private readonly upsertStmt;
  private readonly versionsStmt;
  private readonly versionStmt;
  private readonly versionCountStmt;
  private readonly insertVersionStmt;
  private readonly droppableStmt;
  private readonly deleteVersionStmt;
  private readonly setPrunedStmt;
  private readonly sessionArtifactsStmt;
  private readonly setSessionArtifactsStmt;

  constructor(readonly db: StoreHandle) {
    this.listNewestStmt = db.prepare('SELECT * FROM improvement_artifacts ORDER BY generated_at DESC, artifact_id ASC');
    this.listIdsStmt = db.prepare('SELECT artifact_id FROM improvement_artifacts ORDER BY artifact_id ASC');
    this.byIdStmt = db.prepare('SELECT * FROM improvement_artifacts WHERE artifact_id = ?');
    this.latestStmt = db.prepare('SELECT * FROM improvement_artifacts ORDER BY generated_at DESC, artifact_id ASC LIMIT 1');
    this.latestForSessionStmt = db.prepare('SELECT * FROM improvement_artifacts WHERE source_session_id = ? ORDER BY generated_at DESC, artifact_id ASC LIMIT 1');
    this.upsertStmt = db.prepare(`INSERT INTO improvement_artifacts
      (artifact_id, source_session_id, source_kind, source_run_type, generated_at, body, versions_due, versions_pruned)
      VALUES (@artifact_id, @source_session_id, @source_kind, @source_run_type, @generated_at, @body, @versions_due, @versions_pruned)
      ON CONFLICT(artifact_id) DO UPDATE SET
        source_session_id=excluded.source_session_id,
        source_kind=excluded.source_kind,
        source_run_type=excluded.source_run_type,
        generated_at=excluded.generated_at,
        body=excluded.body,
        versions_due=excluded.versions_due,
        versions_pruned=excluded.versions_pruned`);
    this.versionsStmt = db.prepare('SELECT * FROM improvement_artifact_versions WHERE artifact_id = ? ORDER BY version DESC');
    this.versionStmt = db.prepare('SELECT * FROM improvement_artifact_versions WHERE artifact_id = ? AND version = ?');
    this.versionCountStmt = db.prepare('SELECT count(*) AS count FROM improvement_artifact_versions WHERE artifact_id = ?');
    this.insertVersionStmt = db.prepare('INSERT INTO improvement_artifact_versions (artifact_id, version, recorded_at, cause, body) VALUES (@artifact_id, @version, @recorded_at, @cause, @body)');
    this.droppableStmt = db.prepare(`SELECT version FROM improvement_artifact_versions
      WHERE artifact_id = ? AND version <> 1 AND version <> (SELECT max(version) FROM improvement_artifact_versions WHERE artifact_id = ?)
      ORDER BY version ASC LIMIT 1`);
    this.deleteVersionStmt = db.prepare('DELETE FROM improvement_artifact_versions WHERE artifact_id = ? AND version = ?');
    this.setPrunedStmt = db.prepare('UPDATE improvement_artifacts SET versions_pruned = ? WHERE artifact_id = ?');
    this.sessionArtifactsStmt = db.prepare('SELECT improvement_artifact_ids FROM sessions WHERE session_id = ?');
    this.setSessionArtifactsStmt = db.prepare('UPDATE sessions SET improvement_artifact_ids = ? WHERE session_id = ?');
  }

  transaction<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
  durableTransaction<T>(fn: () => T): T {
    this.db.pragma('synchronous = FULL');
    try { return this.transaction(fn); }
    finally { this.db.pragma('synchronous = NORMAL'); }
  }
  readTransaction<T>(fn: () => T): T { return this.db.transaction(fn).deferred(); }

  listNewest(): ImprovementArtifactRow[] { return this.listNewestStmt.all() as ImprovementArtifactRow[]; }
  listIds(): string[] { return (this.listIdsStmt.all() as { artifact_id: string }[]).map((row) => row.artifact_id); }
  read(id: string): ImprovementArtifactRow | undefined { return this.byIdStmt.get(id) as ImprovementArtifactRow | undefined; }
  latest(sessionId?: string): ImprovementArtifactRow | undefined {
    return (sessionId === undefined ? this.latestStmt.get() : this.latestForSessionStmt.get(sessionId)) as ImprovementArtifactRow | undefined;
  }
  write(row: ImprovementArtifactWrite): void { this.upsertStmt.run(row); }
  versions(id: string): ImprovementVersionRow[] { return this.versionsStmt.all(id) as ImprovementVersionRow[]; }
  version(id: string, version: number): ImprovementVersionRow | undefined { return this.versionStmt.get(id, version) as ImprovementVersionRow | undefined; }
  versionCount(id: string): number { return Number((this.versionCountStmt.get(id) as { count: number }).count); }
  insertVersion(row: ImprovementVersionRow): void { this.insertVersionStmt.run(row); }
  setPruned(id: string, count: number): void { this.setPrunedStmt.run(count, id); }

  retain(id: string, keep = IMPROVEMENT_HISTORY_LIMIT): number {
    let pruned = 0;
    if (keep <= 0) {
      for (const row of this.versions(id)) pruned += this.deleteVersionStmt.run(id, row.version).changes;
      return pruned;
    }
    while (this.versionCount(id) > keep) {
      if (keep === 1) {
        const rows = this.versions(id);
        const newest = rows[0]?.version;
        const victim = rows.find((row) => row.version !== newest);
        if (victim === undefined) break;
        pruned += this.deleteVersionStmt.run(id, victim.version).changes;
        continue;
      }
      const victim = this.droppableStmt.get(id, id) as { version: number } | undefined;
      if (victim === undefined) break;
      pruned += this.deleteVersionStmt.run(id, victim.version).changes;
    }
    return pruned;
  }

  associateWithSession(sessionId: string, artifactId: string): void {
    const row = this.sessionArtifactsStmt.get(sessionId) as { improvement_artifact_ids: string } | undefined;
    if (row === undefined) return;
    let ids: string[];
    try { ids = JSON.parse(row.improvement_artifact_ids) as string[]; }
    catch { ids = []; }
    if (ids.includes(artifactId)) return;
    this.setSessionArtifactsStmt.run(JSON.stringify([...ids, artifactId]), sessionId);
  }
}
