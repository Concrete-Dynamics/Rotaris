import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as FsPromises from 'node:fs/promises';

/**
 * How the snapshot walk reads a large directory (OQ-245; fin38's review). The status reads are counted through a wrapped
 * `node:fs/promises`, so the bound is measured in reads, not in milliseconds, and holds at any load on the host
 * (docs/defects/fixed/a-snapshot-reads-every-file-of-a-directory-before-it-checks-the-limit.md).
 */
const reads = vi.hoisted(() => ({ total: 0, inFlight: 0, maxInFlight: 0 }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const lstat = (async (...args: Parameters<typeof actual.lstat>) => {
    reads.total += 1;
    reads.inFlight += 1;
    reads.maxInFlight = Math.max(reads.maxInFlight, reads.inFlight);
    try { return await actual.lstat(...args); } finally { reads.inFlight -= 1; }
  }) as typeof actual.lstat;
  return { ...actual, lstat, default: { ...actual, lstat } };
});

const { SNAPSHOT_STAT_BATCH, snapshotTree } = await import('./observe.js');

const FILES = 1_000;
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rotaris-observe-walk-'));
  mkdirSync(join(root, 'many'));
  for (let i = 0; i < FILES; i += 1) writeFileSync(join(root, 'many', `f${i}.txt`), '');
  Object.assign(reads, { total: 0, inFlight: 0, maxInFlight: 0 });
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('snapshotTree reads a large directory in batches', () => {
  it('a directory past the limit stops within one batch of it, where every file of the directory was read before', async () => {
    expect(await snapshotTree(root, '', 10)).toBeNull();
    // The base's own status, then at most one batch: the limit is checked after each.
    expect(reads.total).toBeLessThanOrEqual(1 + SNAPSHOT_STAT_BATCH);
    expect(reads.total).toBeLessThan(FILES);
  });

  it('at most one batch of reads is in flight, and the walk yields to the event loop between batches', async () => {
    let turns = 0;
    let ticking = true;
    const tick = (): void => { turns += 1; if (ticking) setImmediate(tick); };
    setImmediate(tick);
    const snapshot = await snapshotTree(root, '');
    ticking = false;
    expect(snapshot!.size).toBe(FILES);
    expect(reads.maxInFlight).toBeLessThanOrEqual(SNAPSHOT_STAT_BATCH);
    // Four batches of 1,000 files: the event loop turns at least once between each.
    expect(turns).toBeGreaterThanOrEqual(Math.ceil(FILES / SNAPSHOT_STAT_BATCH) - 1);
  });
});
