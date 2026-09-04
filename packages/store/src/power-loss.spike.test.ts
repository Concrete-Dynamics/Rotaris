import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { hostname, release } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { resolveUserDirs } from '@rotaris/platform';
import { openStore } from './open.js';

/**
 * The power-loss test (OQ-12; ADR-0058 "Why the decision stands anyway"; ADR-0004 rule 2; ADR-0009).
 * The sole stated ground for `synchronous = FULL` on a terminal save, and the only measurement that would
 * say what a directory fsync guarantees here. Three phases, gated on ROTARIS_POWER_LOSS_PHASE:
 *
 *   kill     — run on this machine, unattended: the writer is killed with taskkill /F, then verified.
 *              Expected: nothing lost at NORMAL (a process death leaves the page cache). Then the
 *              verifier's DRY RUN: a second writer (auto-checkpoint off, so a recorded WAL length names a
 *              commit) is killed, its files copied before any survey, and the copy's WAL truncated to the
 *              length recorded at its second-to-last FULL commit — the tail an operating-system-cache loss
 *              would drop. Expected: every row up to that FULL present, every row after it gone. This proves
 *              the accounting can see a loss; it is NOT evidence about the platform and is labelled so.
 *   prepare  — starts the writer detached under the per-user data directory and prints the owner's
 *              steps. The owner then cuts the power (or crashes the kernel) and reboots.
 *   verify   — after the reboot: opens the survivor through the product's openStore, integrity-checks it,
 *              and reports the loss in commits and milliseconds per setting, and the two documents' states.
 *              ROTARIS_POWER_LOSS_FAULT=power|crash names what the owner did.
 *
 * Results go into docs/architecture/spikes/power-loss.md.
 */
const phase = process.env['ROTARIS_POWER_LOSS_PHASE'];
const WRITER = resolve(__dirname, '..', 'spike', 'power-loss-writer.cjs');
const dirs = resolveUserDirs();
const ROOT = join(dirs.data, 'power-loss');

interface Witness { kind: string; ordinal?: number; atMs?: number; walBytes?: number; pid?: number; error?: string }
interface Survey {
  integrity: string;
  rows: number;
  lastOrdinal: number;
  lastFull: number | null;
  lastFullAtMs: number | null;
  lastAtMs: number | null;
  gaps: number[];
  normalAfterLastFull: number;
  docA: { ordinal: number; atMs: number } | null | 'unreadable';
  docB: { ordinal: number; atMs: number } | null | 'unreadable';
}

function witnessesOf(log: string): Witness[] {
  return log.split(/\r?\n/).filter((l) => l.startsWith('{')).map((l) => JSON.parse(l) as Witness);
}

function readDoc(file: string): Survey['docA'] {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')) as { ordinal: number; atMs: number }; } catch { return 'unreadable'; }
}

/** What survived, read the way the product reads: openStore (WAL recovery, the write probe), then the ledger. */
function survey(dir: string): Survey {
  const db = openStore(join(dir, 'workspace.db'));
  try {
    const integrity = db.pragma('integrity_check', { simple: true }) as string;
    const rows = db.prepare('SELECT ordinal, at_ms, mode FROM ledger ORDER BY ordinal').all() as { ordinal: number; at_ms: number; mode: string }[];
    const gaps: number[] = [];
    for (let i = 1; i < rows.length; i += 1) if (rows[i]!.ordinal !== rows[i - 1]!.ordinal + 1) gaps.push(rows[i - 1]!.ordinal);
    const fulls = rows.filter((r) => r.mode === 'full');
    const lastFull = fulls.at(-1) ?? null;
    const last = rows.at(-1) ?? null;
    return {
      integrity,
      rows: rows.length,
      lastOrdinal: last?.ordinal ?? 0,
      lastFull: lastFull?.ordinal ?? null,
      lastFullAtMs: lastFull?.at_ms ?? null,
      lastAtMs: last?.at_ms ?? null,
      gaps,
      normalAfterLastFull: lastFull ? rows.filter((r) => r.ordinal > lastFull.ordinal).length : rows.length,
      docA: readDoc(join(dir, 'doc-a.json')),
      docB: readDoc(join(dir, 'doc-b.json')),
    };
  } finally {
    db.close();
  }
}

/** The loss, against what the writer reported committed (the witness) — kill variants only. */
function loss(s: Survey, witnesses: Witness[]) {
  const fulls = witnesses.filter((w) => w.kind === 'full');
  const lastWitnessedFull = fulls.at(-1) ?? null;
  const lostFull = lastWitnessedFull && (s.lastFull === null || s.lastFull < lastWitnessedFull.ordinal!) ? fulls.filter((f) => f.ordinal! > (s.lastFull ?? 0)).length : 0;
  const replaces = witnesses.filter((w) => w.kind === 'replace');
  const lastReplace = replaces.at(-1) ?? null;
  return { lastWitnessedFull: lastWitnessedFull?.ordinal ?? null, lostFull, lastWitnessedReplace: lastReplace?.ordinal ?? null };
}

function machineFacts() {
  const disk = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-PhysicalDisk | Select-Object FriendlyName,MediaType,BusType | ConvertTo-Json -Compress'], { encoding: 'utf8' }).stdout.trim();
  return { hostname: hostname(), os: release(), node: process.version, sqlite: (new Database(':memory:').prepare('select sqlite_version() v').get() as { v: string }).v, disks: disk };
}

async function runAndKill(dir: string, extra: string[]): Promise<Witness[]> {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, 'witness.log');
  const fd = openSync(log, 'w');
  const child = spawn(process.execPath, [WRITER, '--dir', dir, '--period-ms', '1', ...extra], { stdio: ['ignore', fd, 'inherit'] });
  closeSync(fd);
  await new Promise((r) => setTimeout(r, 5_000));
  const killed = spawnSync('taskkill', ['/F', '/PID', String(child.pid)], { encoding: 'utf8' });
  expect(killed.status).toBe(0);
  await new Promise<void>((r) => child.on('exit', () => r()));
  return witnessesOf(readFileSync(log, 'utf8'));
}

describe.skipIf(phase !== 'kill')("power loss — the kill baseline and the verifier's dry run (this machine, unattended)", () => {
  it('a process death loses nothing at NORMAL; a truncated WAL tail loses exactly the rows after the cut and no FULL row before it', async () => {
    const stamp = Date.now();
    // 1. The baseline, under the product's own settings: a process death loses nothing, gap-free, integrity ok.
    const dir = join(ROOT, `kill-${stamp}`);
    const witnesses = await runAndKill(dir, []);
    const fulls = witnesses.filter((w) => w.kind === 'full');
    expect(fulls.length).toBeGreaterThan(10);
    const after = survey(dir);
    const l = loss(after, witnesses);
    expect(after.integrity).toBe('ok');
    expect(after.gaps).toEqual([]);
    expect(after.lastFull).toBeGreaterThanOrEqual(l.lastWitnessedFull!);
    expect(l.lostFull).toBe(0);
    expect(after.lastOrdinal).toBeGreaterThanOrEqual(after.lastFull!);
    expect(after.docA).not.toBeNull();
    expect(after.docB).not.toBeNull();

    // 2. The dry run, with auto-checkpointing off so a recorded WAL length names a commit: the killed state is
    // copied BEFORE any survey (closing the last connection checkpoints and deletes the WAL), the copy's WAL is
    // truncated to the length recorded at the second-to-last FULL commit — the tail an operating-system-cache
    // loss would drop — and surveyed. Expected: every row up to that FULL present, every row after it gone.
    const dryDir = join(ROOT, `kill-${stamp}-dry`);
    const dryWitnesses = await runAndKill(dryDir, ['--no-autocheckpoint']);
    const dryFulls = dryWitnesses.filter((w) => w.kind === 'full');
    expect(dryFulls.length).toBeGreaterThan(10);
    const cutAt = dryFulls.at(-2)!;
    const wal = join(dryDir, 'workspace.db-wal');
    const before = statSync(wal).size;
    expect(before).toBeGreaterThan(cutAt.walBytes!);
    truncateSync(wal, cutAt.walBytes!);
    const cut = survey(dryDir);
    expect(cut.integrity).toBe('ok');
    expect(cut.gaps).toEqual([]);
    expect(cut.lastFull).toBe(cutAt.ordinal);
    expect(cut.lastOrdinal).toBe(cutAt.ordinal);
    const lastDry = dryFulls.at(-1)!;
    const droppedRows = lastDry.ordinal! - cutAt.ordinal!;
    expect(droppedRows).toBeGreaterThanOrEqual(1);
    const result = { dir, dryDir, facts: machineFacts(), baseline: { witnessedFull: fulls.length, afterKill: after, againstWitness: l }, dryRun: { witnessedFull: dryFulls.length, walBytesBefore: before, walBytesAtCut: cutAt.walBytes, cutAtOrdinal: cutAt.ordinal, lastWitnessedOrdinal: lastDry.ordinal, afterTruncate: cut, droppedRowsAtLeast: droppedRows, droppedMsAtLeast: (lastDry.atMs ?? 0) - (cutAt.atMs ?? 0) } };
    writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`[power-loss kill] baseline: ${after.lastOrdinal} rows (${fulls.length} FULL) survived taskkill, lost 0, gaps 0, integrity ${after.integrity}. dry run: truncated ${before - cutAt.walBytes!} WAL bytes at FULL #${cutAt.ordinal} → survivor ends at ${cut.lastOrdinal}, at least ${droppedRows} rows / ${result.dryRun.droppedMsAtLeast} ms dropped, integrity ${cut.integrity}`);
  }, 60_000);
});

describe.skipIf(phase !== 'prepare')('power loss — prepare: start the writer for the owner\'s fault', () => {
  it('starts the writer detached and states the steps', () => {
    const dir = join(ROOT, `owner-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const log = join(dir, 'witness.log');
    const fd = openSync(log, 'w');
    const child = spawn(process.execPath, [WRITER, '--dir', dir, '--period-ms', '1'], { detached: true, stdio: ['ignore', fd, 'ignore'], windowsHide: true });
    closeSync(fd);
    child.unref();
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), facts: machineFacts() }, null, 2));
    writeFileSync(join(ROOT, 'current'), dir);
    console.log([
      `[power-loss prepare] writer pid ${child.pid} is committing into ${dir}`,
      '  Let it run for at least 30 s. Then, with nothing else you care about unsaved:',
      '  (a) POWER: hold the power button until the machine is off (about 4 s), or',
      '  (b) CRASH: trigger a kernel crash (CrashOnCtrlScroll, or Sysinternals NotMyFault).',
      '  Boot, then run:  ROTARIS_POWER_LOSS_PHASE=verify ROTARIS_POWER_LOSS_FAULT=power|crash pnpm vitest run packages/store/src/power-loss.spike.test.ts',
    ].join('\n'));
    expect(child.pid).toBeGreaterThan(0);
  });
});

describe.skipIf(phase !== 'verify')('power loss — verify: what survived the owner\'s fault', () => {
  it('every FULL commit survived; the store opens and is whole; the loss at NORMAL is measured', () => {
    const dir = existsSync(join(ROOT, 'current')) ? readFileSync(join(ROOT, 'current'), 'utf8').trim() : readdirSync(ROOT).filter((d) => d.startsWith('owner-')).map((d) => join(ROOT, d)).sort().at(-1);
    expect(dir).toBeDefined();
    const state = JSON.parse(readFileSync(join(dir!, 'state.json'), 'utf8')) as { pid: number; startedAt: string };
    const fault = process.env['ROTARIS_POWER_LOSS_FAULT'] ?? 'unstated';
    const minidumps = join(process.env['SystemRoot'] ?? 'C:/Windows', 'Minidump');
    let dumps: { f: string; at: string }[] | string = [];
    try { dumps = existsSync(minidumps) ? readdirSync(minidumps).map((f) => ({ f, at: statSync(join(minidumps, f)).mtime.toISOString() })).filter((d) => d.at > state.startedAt) : []; } catch (e) { dumps = `unreadable without elevation: ${String(e)}`; }
    const s = survey(dir!);
    const witnesses = witnessesOf(readFileSync(join(dir!, 'witness.log'), 'utf8'));
    const l = loss(s, witnesses);
    const result = { dir, fault, state, minidumpsSinceStart: dumps, witnessLinesSurvived: witnesses.length, survey: s, againstWitness: l, lostNormalAfterLastFull: null as number | null, note: 'Under a real cut stdout is lost with the page cache; the witness file names a lower bound only. The FULL rows are their own witness: every one whose commit returned before the cut must be present.' };
    writeFileSync(join(dir!, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`[power-loss verify] fault=${fault}; integrity ${s.integrity}; rows ${s.rows}, last ordinal ${s.lastOrdinal}, last FULL ${s.lastFull} (${s.normalAfterLastFull} NORMAL rows survived after it); gaps ${s.gaps.length}; witness: last FULL reported ${l.lastWitnessedFull}, FULL rows lost against it ${l.lostFull}; doc-a ${JSON.stringify(s.docA)}, doc-b ${JSON.stringify(s.docB)}; minidumps since start ${Array.isArray(dumps) ? dumps.length : dumps}`);
    expect(s.integrity).toBe('ok');
    expect(s.gaps).toEqual([]);
    expect(l.lostFull).toBe(0);
    expect(s.docA).not.toBe('unreadable');
    expect(s.docB).not.toBe('unreadable');
  });
});
