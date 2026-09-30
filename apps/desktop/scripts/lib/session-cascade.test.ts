/**
 * Acceptance finding A3 (R-067): `sessions-proof` pinned `cascaded.length === 16` before its delete scenario, and store
 * v23–v24 (PD-ORCH-005) had made the cascading tables twenty, so the proof stopped there on every run and the built-app
 * delete's cascade (REQ-SESSION-166), the moved-tree delete and the exports went unmeasured. The premise is now the
 * cascade's shape, read from the schema by `session-cascade.mjs`, and holds whatever the count.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetSpelling, migrateStore, openStore, type StoreHandle } from '@rotaris/store';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { SESSION_FACT_TABLES, sessionCascade } from './session-cascade.mjs';

type Premise = { tables: string[]; cascaded: string[]; facts: string[]; problems: string[] };

describe('the session delete\'s cascade premise, read from the schema (REQ-SESSION-166, PD-ORCH-005)', () => {
  let dir: string;
  let db: StoreHandle;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-cascade-'));
    db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
  });
  afterEach(() => {
    db.close();
    forgetSpelling(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('REQ-SESSION-166: holds on the store this build migrates — the store that made the sixteen-table pin fail', () => {
    const premise = sessionCascade(db) as Premise;
    expect(premise.problems).toEqual([]);
    expect(premise.facts).toEqual(['delivery_runs']);
    expect(premise.cascaded[0]).toBe('sessions');
    // PD-ORCH-005 clause 12: the conversation record belongs to its session and is deleted with it.
    for (const t of ['plan_cycles', 'iterations', 'agent_messages', 'agent_terminals', 'agent_fingerprints']) expect(premise.cascaded).toContain(t);
    // The pin that stood in the proof: it counted what the schema now holds more of, and nothing after it ran.
    expect(premise.cascaded.length).not.toBe(16);
    expect([...premise.cascaded, ...premise.facts].sort()).toEqual([...premise.tables].sort());
  });

  it('REQ-SESSION-166: a table a later migration adds under the cascade\'s shape leaves the premise holding', () => {
    const before = (sessionCascade(db) as Premise).cascaded.length;
    db.exec('CREATE TABLE future_session_rows (session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE, n INTEGER)');
    const premise = sessionCascade(db) as Premise;
    expect(premise.problems).toEqual([]);
    expect(premise.cascaded).toHaveLength(before + 1);
    expect(premise.cascaded).toContain('future_session_rows');
  });

  it('REQ-SESSION-166: a reference to sessions without ON DELETE CASCADE breaks the premise, naming the table', () => {
    db.exec('CREATE TABLE kept_rows (session_id TEXT NOT NULL REFERENCES sessions(session_id), n INTEGER)');
    const premise = sessionCascade(db) as Premise;
    expect(premise.problems).toHaveLength(1);
    expect(premise.problems[0]).toMatch(/^kept_rows references sessions .* ON DELETE NO ACTION/);
  });

  it('REQ-SESSION-166: a session_id with no reference, outside the deliberate fact table, breaks the premise', () => {
    db.exec('CREATE TABLE orphan_rows (session_id TEXT NOT NULL, n INTEGER)');
    const premise = sessionCascade(db) as Premise;
    expect(premise.facts).toEqual(['delivery_runs', 'orphan_rows']);
    expect(premise.problems).toHaveLength(1);
    expect(premise.problems[0]).toMatch(/^orphan_rows carries session_id with no reference/);
  });

  it('REQ-TRACE-476: the delivery run outlives its session, so a reference from delivery_runs breaks the premise', () => {
    expect(SESSION_FACT_TABLES).toEqual(['delivery_runs']);
    db.exec('DROP TABLE delivery_runs');
    db.exec('CREATE TABLE delivery_runs (req_id TEXT, unit TEXT, session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE)');
    const premise = sessionCascade(db) as Premise;
    expect(premise.problems).toEqual(['delivery_runs references sessions, so a session delete takes the record REQ-TRACE-476 keeps']);
  });
});
