'use strict';
/**
 * The power-loss test's writer (OQ-12; ADR-0058 "Why the decision stands anyway"; ADR-0004 rule 2).
 *
 * Plain JavaScript on purpose: it is spawned without a TypeScript loader and keeps writing until the
 * machine dies. It opens a store with EXACTLY the settings `packages/store/src/open.ts` applies — the
 * equality is asserted by store.test.ts — and commits a ledger row every `--period-ms`:
 *
 *   ordinary rows   at synchronous = NORMAL           (the publish path)
 *   every N-th row  at synchronous = FULL, raised and lowered around the transaction, the shape of
 *                   StoreDal.durableTransaction()     (a terminal save; an explicit flush)
 *
 * and every M-th row replaces two documents carrying the ordinal:
 *   doc-a.json  stage → write → fsync → rename            (ADR-0004's replace, no directory fsync)
 *   doc-b.json  the same, then fsync of the parent directory on a write-opened handle
 *
 * After every FULL commit and every replace one JSON line goes to stdout — the witness the kill
 * variants capture. Under a real cut stdout is lost and the FULL rows are their own witness.
 *
 *   node power-loss-writer.cjs --dir <dir> [--period-ms 1] [--full-every 50] [--replace-every 25] [--stop-after-ms 0] [--probe] [--no-autocheckpoint]
 *
 * It never triggers a fault itself. The owner does (docs/architecture/spikes/power-loss.md).
 */
const { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } = require('node:fs');
const { dirname, join } = require('node:path');
const Database = require('better-sqlite3');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const dir = arg('dir', null);
if (!dir) { process.stderr.write('usage: --dir <dir>\n'); process.exit(2); }
const periodMs = Number(arg('period-ms', '1'));
const fullEvery = Number(arg('full-every', '50'));
const replaceEvery = Number(arg('replace-every', '25'));
const stopAfterMs = Number(arg('stop-after-ms', '0'));

mkdirSync(dir, { recursive: true });
const file = join(dir, 'workspace.db');
const walFile = `${file}-wal`;

// open.ts, line for line: WAL read back, NORMAL, busy_timeout, the write probe rolled back.
const db = new Database(file);
const set = db.pragma('journal_mode = WAL')[0].journal_mode;
const back = db.pragma('journal_mode', { simple: true });
if (set !== 'wal' || back !== 'wal') throw new Error(`WAL not enabled: ${set}/${back}`);
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
// --no-autocheckpoint: the verifier's dry run only. A checkpoint rewinds the WAL, so a recorded WAL length
// stops naming a commit; without checkpoints the length is monotonic and a truncation is a clean cut.
if (process.argv.includes('--no-autocheckpoint')) db.pragma('wal_autocheckpoint = 0');
db.exec('BEGIN IMMEDIATE');
try { db.exec('CREATE TABLE IF NOT EXISTS __probe(x)'); db.exec('INSERT INTO __probe(x) VALUES (1)'); } finally { db.exec('ROLLBACK'); }

// --probe: report the settings this writer runs under and exit; store.test.ts holds them equal to open.ts's.
if (process.argv.includes('--probe')) {
  process.stdout.write(`${JSON.stringify({ journal_mode: db.pragma('journal_mode', { simple: true }), synchronous: db.pragma('synchronous', { simple: true }), busy_timeout: db.pragma('busy_timeout', { simple: true }), probeTable: db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE name = '__probe'").get().c })}
`);
  db.close();
  process.exit(0);
}

db.exec('CREATE TABLE IF NOT EXISTS ledger (ordinal INTEGER PRIMARY KEY, at_ms INTEGER NOT NULL, mode TEXT NOT NULL, payload TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO ledger (ordinal, at_ms, mode, payload) VALUES (?, ?, ?, ?)');
const tx = db.transaction((ordinal, atMs, mode) => { insert.run(ordinal, atMs, mode, 'x'.repeat(200)); });
// dal.ts durableTransaction(): FULL for the transaction, NORMAL restored whatever happens.
function durable(fn) {
  db.pragma('synchronous = FULL');
  try { return fn(); } finally { db.pragma('synchronous = NORMAL'); }
}

function say(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); }

/** ADR-0004's replace shape (document.ts), plus an optional write-handle directory fsync. */
function replace(target, content, dirFsync) {
  const staged = join(dirname(target), `.${require('node:path').basename(target)}.staging-${process.pid}`);
  const fd = openSync(staged, 'w');
  try { writeSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
  try { renameSync(staged, target); } catch (e) { rmSync(staged, { force: true }); throw e; }
  if (dirFsync) {
    const dfd = openSync(dirname(target), 'r+');
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  }
}

// A timer would round to the platform's ~15.6 ms tick; the pause spins on the monotonic clock instead.
const pause = (ms) => { if (ms <= 0) return; const until = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6)); while (process.hrtime.bigint() < until) { /* spin */ } };

let ordinal = db.prepare('SELECT COALESCE(MAX(ordinal), 0) AS m FROM ledger').get().m;
const startedAt = Date.now();
say({ kind: 'start', pid: process.pid, dir, file, ordinalFrom: ordinal + 1, periodMs, fullEvery, replaceEvery, stopAfterMs, atMs: startedAt });
let dirFsyncError = null;
for (;;) {
  ordinal += 1;
  const atMs = Date.now();
  if (ordinal % fullEvery === 0) {
    durable(() => tx(ordinal, atMs, 'full'));
    say({ kind: 'full', ordinal, atMs, walBytes: existsSync(walFile) ? statSync(walFile).size : 0 });
  } else {
    tx(ordinal, atMs, 'normal');
  }
  if (ordinal % replaceEvery === 0) {
    const content = JSON.stringify({ ordinal, atMs });
    replace(join(dir, 'doc-a.json'), content, false);
    try { replace(join(dir, 'doc-b.json'), content, true); } catch (e) { if (!dirFsyncError) { dirFsyncError = String(e); say({ kind: 'dir-fsync-error', ordinal, error: dirFsyncError }); } }
    say({ kind: 'replace', ordinal, atMs });
  }
  if (stopAfterMs > 0 && Date.now() - startedAt >= stopAfterMs) {
    say({ kind: 'stop', ordinal, atMs: Date.now() });
    db.close();
    process.exit(0);
  }
  pause(periodMs);
}
