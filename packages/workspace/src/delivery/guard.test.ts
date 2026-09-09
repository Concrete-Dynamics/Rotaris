import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { FakeClock, mintWorkspaceId } from '@rotaris/kernel';
import { forgetSpelling, openWorkspaceStore, type ResolvedStore } from '@rotaris/store';
import { MISSING_COMPARISON, assertWriterDeclares, createDeliveryReader, createDeliveryWriter, createQueueSettings, createTransitions } from './index.js';

/**
 * The three structural assertions ADR-0041 says this area owes (consequence 5):
 *  - REQ-TRACE-403: a component composed with read access alone offers no state-changing operation at all;
 *  - REQ-TRACE-399: no module writes the delivery store directly — an assertion over the MODULE GRAPH, not over
 *    string literals, because the database handle is held privately by the engine;
 *  - REQ-TRACE-402: the assembly refuses to start without the hash comparison, naming what is missing.
 */
const REPO = resolve(import.meta.dirname, '..', '..', '..', '..');
const DAL = 'packages/store/src/delivery/dal.ts';
const WRITE_STATEMENT = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+delivery(?:_history|_audit|_runs|_worktrees|_blockers|_tombstones)?\b/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(name)) yield p;
  }
}
const rel = (p: string) => relative(REPO, p).split(sep).join('/');

describe('REQ-TRACE-399 — no module writes the delivery store directly', () => {
  it('every write statement over a delivery table lives in the one DAL module', () => {
    const offenders: string[] = [];
    for (const dir of ['packages', 'apps']) {
      for (const file of sources(join(REPO, dir))) {
        if (rel(file) === DAL || rel(file).endsWith('.test.ts')) continue;
        if (WRITE_STATEMENT.test(readFileSync(file, 'utf8'))) offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual([]);
  });
  it('the DAL is imported only by the delivery engine — nothing in apps/, ui/, ui-core/ or engine/ names it', () => {
    const importers: string[] = [];
    for (const dir of ['packages', 'apps']) {
      for (const file of sources(join(REPO, dir))) {
        const r = rel(file);
        if (r.endsWith('.test.ts') || r.startsWith('packages/store/src/delivery/')) continue;
        if (/\bDeliveryDal\b/.test(readFileSync(file, 'utf8'))) importers.push(r);
      }
    }
    expect(importers.sort()).toEqual(['packages/workspace/src/delivery/handles.ts', 'packages/workspace/src/delivery/transition.ts']);
  });
});

describe('REQ-TRACE-403 — read access alone offers no state-changing operation', () => {
  const A = mintWorkspaceId('000000000000000000000000000000ac');
  let root: string;
  let r: ResolvedStore;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-guard-')); r = openWorkspaceStore(root, A, 'C:\\ws'); });
  afterEach(() => { r.db.close(); forgetSpelling(r.dir); rmSync(root, { recursive: true, force: true }); });

  it('the reader carries exactly its query methods, none of which transitions, records, answers, sets or exposes the store', () => {
    const reader = createDeliveryReader(r.db, { workspaceKey: 'C:\\ws', queue: createQueueSettings() });
    expect(Object.keys(reader).sort()).toEqual(['board', 'history', 'queue', 'reachable', 'requirement', 'runningRuns', 'runs']);
    for (const k of Object.keys(reader)) expect(k, k).not.toMatch(/^(transition|record|answer|set|write|db|dal|store)/i);
    // No property of the reader is the database handle or the DAL — the reader is a closure over them.
    for (const v of Object.values(reader)) expect(typeof v).toBe('function');
    expect(JSON.stringify(reader)).toBe('{}');
  });
  it('the writer is built from the reader plus the transition function and exposes neither the reader nor the store', () => {
    const reader = createDeliveryReader(r.db, { workspaceKey: 'C:\\ws', queue: createQueueSettings() });
    const writer = createDeliveryWriter(reader, createTransitions(r.db, { wall: new FakeClock(), workspaceKey: 'C:\\ws', queue: createQueueSettings() }));
    expect(Object.keys(writer).sort()).toEqual(['answerBlocker', 'declares', 'inFlight', 'recordRunEnded', 'recordRunStarted', 'setQueue', 'transition']);
    expect(Object.isFrozen(writer)).toBe(true);
    expect(Object.values(writer).includes(reader as never)).toBe(false);
    expect(Object.values(writer).includes(r.db as never)).toBe(false);
  });
});

describe('REQ-TRACE-402 — the assembly refuses a writer that does not declare the comparison', () => {
  it('names the comparison that is missing', () => {
    expect(() => assertWriterDeclares({})).toThrow(MISSING_COMPARISON);
    expect(() => assertWriterDeclares({ declares: { comparesSpecificationHash: 'yes' } })).toThrow(/comparesSpecificationHash/);
    expect(() => assertWriterDeclares({ declares: { comparesSpecificationHash: true } })).not.toThrow();
  });
});
