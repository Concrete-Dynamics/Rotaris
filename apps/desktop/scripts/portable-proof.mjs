/**
 * `pnpm portable-proof` — the portable's launcher stub and its assembly (ADR-0054 alternative P4, first-release-plan.md
 * §4.5; REQ-STARTUP-013, REQ-STARTUP-031, REQ-STARTUP-150, REQ-STARTUP-165 (a)–(e)), executed on the host that runs it.
 *
 * The stub (`apps/desktop/launcher`) is built for THIS host by Cargo and assembled by the same module `pnpm package` uses
 * for the Windows artifact (`lib/portable.mjs`), around two payloads:
 *
 *   A. **The mechanism**, against a payload whose entry point is a shell script that writes down what it was started
 *      with — the artifact variable, its own directory, its arguments, its marker's outcome. Fast enough to drive every
 *      outcome REQ-STARTUP-165 names: the preparing run and the reusing run, launched from a READ-ONLY directory that
 *      must come out byte for byte unchanged (clause (a)); eight damage classes, each redone silently (clause (c),
 *      ADR-0054's Defects A and B); a second artifact preparing afresh and the superseded preparation reclaimed
 *      (clause (b)); two launches racing (ADR-0054, "Two launches racing"); a root that accepts no write, so the payload
 *      runs from a run-scoped placement in the transient-files storage that is gone afterwards, with the marker naming
 *      the root it could not prepare into (clause (c)'s second half, the branch ADR-0054 consequence 14 left unmeasured);
 *      and an unassembled stub refusing to start.
 *   B. **The application**: this host's Electron runtime with the built desktop app as its payload, launched twice
 *      through the stub to a painted window — preparing, then from the preparation — with the artifact variable reaching
 *      the application's main process (clause (e)) and the running image inside the preparation, never beside the
 *      artifact, and no notice about preparation on either. Then once more with the root refusing every write: the
 *      application runs from a run-scoped placement and shows the warning REQ-STARTUP-165 (c) requires, naming the
 *      per-user data directory (B4). Part A's A7 cannot show that notice: its payload is a shell script.
 *
 * What this proof is NOT: the Windows artifact. That one is assembled from `win-unpacked` and launched twice by
 * `pnpm package` on the Windows x64 runner (its "portable" steps in `release/load-proof.json`); this host has no Windows
 * runtime. On Linux the stub waits for the application and returns its status, where on Windows it exits after starting
 * it (`launcher/src/main.rs`) — the one platform difference, and the Windows half is the package step's to show.
 *
 *   node apps/desktop/scripts/portable-proof.mjs [--skip-build] [--only=mechanism|app]
 *
 * Evidence: `.proof/portable-proof/report.json`, each launch's records and the two captures.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, truncateSync, appendFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { app, buildDesktop, dataDirFor, electron, evidenceDirectory, hostSwitches, launchOptions, mainEntry } from './lib/harness.mjs';
import { assemblePortable, buildLauncher, MARKER, readPortable } from './lib/portable.mjs';

const output = evidenceDirectory('portable-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? null;
if (process.platform === 'win32') {
  console.error('portable-proof runs off Windows: on Windows the artifact is assembled and launched by `pnpm package` itself');
  process.exit(2);
}

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const report = { startedAt: new Date().toISOString(), host: `${process.platform}-${process.arch}`, launches: [], checks };
const finish = () => {
  report.ok = checks.length > 0 && checks.every((c) => c.pass);
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nportable-proof: ${checks.filter((c) => c.pass).length}/${checks.length} checks passed — ${join(output, 'report.json')}`);
  process.exit(report.ok ? 0 : 1);
};

console.log('[portable-proof] cargo build --release (apps/desktop/launcher)');
const stub = buildLauncher(app, { stdio: 'inherit' });
report.stub = { path: stub, bytes: statSync(stub).size };

/** Every entry of a directory with its size and times, and the artifact's digest: what "byte for byte unchanged" compares. */
function snapshot(dir, artifactPath) {
  const entries = readdirSync(dir).sort().map((name) => { const s = statSync(join(dir, name)); return `${name} ${s.size} ${s.mtimeMs} ${s.ctimeMs} ${s.mode}`; });
  return { entries, sha256: createHash('sha256').update(readFileSync(artifactPath)).digest('hex') };
}
const listing = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);
const markerOf = (dir) => readFileSync(join(dir, MARKER), 'utf8');

/** One launch of an artifact, bounded; its status, elapsed time and log are kept in the report. */
async function launch(label, artifact, args, env, timeoutMs = 60_000) {
  const r = await spawnBounded(artifact, args, { env, timeoutMs });
  const log = `${r.stdout || ''}\n${r.stderr || ''}`;
  writeFileSync(join(output, `${label}.log`), log);
  report.launches.push({ label, status: r.status, signal: r.signal, elapsedMs: r.elapsedMs });
  if (r.overran) throw new Error(overrunMessage(label, r, log));
  return { ...r, log };
}

// ── A. The mechanism ────────────────────────────────────────────────────────────────────────────────────────────────
async function mechanism() {
  const root = join(output, 'mechanism');
  const payload = join(root, 'payload');
  mkdirSync(join(payload, 'lib', 'deep'), { recursive: true });
  // The entry point writes down what a started payload can observe, and nothing else.
  writeFileSync(join(payload, 'run.sh'), [
    '#!/bin/sh',
    'here=$(cd "$(dirname "$0")" && pwd)',
    '{',
    '  echo "artifact=$ROTARIS_PORTABLE_ARTIFACT"',
    '  echo "here=$here"',
    '  echo "argc=$#"; for a in "$@"; do echo "arg=$a"; done',
    '  grep -E "^(outcome|unprepared-root|token) " "$here/.rotaris-preparation"',
    '} > "$PORTABLE_PROOF_RECORD"',
    'exit 0',
    '',
  ].join('\n'));
  chmodSync(join(payload, 'run.sh'), 0o755);
  // Incompressible bytes, so the preparing run does real work and two racing launches overlap.
  writeFileSync(join(payload, 'lib', 'blob.bin'), randomBytes(24 << 20));
  writeFileSync(join(payload, 'lib', 'deep', 'small.txt'), 'small\n');
  writeFileSync(join(payload, 'lib', 'empty.txt'), '');

  const media = join(root, 'media');
  mkdirSync(media, { recursive: true });
  const artifact = join(media, 'rotaris-portable');
  const made = await assemblePortable({ stub, tree: payload, entry: 'run.sh', version: '0.1.0', out: artifact, chunkBytes: 4 << 20 });
  chmodSync(artifact, 0o755);
  report.mechanism = { artifact: made };
  check('A0 the assembly reads back: footer, index, every chunk inside the payload, the stub carrying the index\'s token (REQ-STARTUP-165 (b))', readPortable(artifact).token === made.token, `${made.token}, ${made.bytes} B, ${made.chunks} chunk(s), stub ${made.stubBytes} B`);

  const profile = join(root, 'profile');
  const data = join(profile, 'data');
  const tmp = join(profile, 'tmp');
  mkdirSync(tmp, { recursive: true });
  // XDG_DATA_HOME is set to `data` directly here, so the per-user data directory is `data/rotaris` (packages/platform dirs.ts).
  const prepared = join(data, 'rotaris', 'prepared');
  const record = join(root, 'record.txt');
  const env = { PATH: process.env.PATH, HOME: join(profile, 'home'), XDG_DATA_HOME: data, TMPDIR: tmp, PORTABLE_PROOF_RECORD: record };
  const read = () => Object.fromEntries(readFileSync(record, 'utf8').trim().split('\n').map((l) => { const at = l.search(/[= ]/); return [l.slice(0, at), l.slice(at + 1)]; }));
  const tokenDir = join(prepared, made.token);

  chmodSync(media, 0o555); // clause (a): the artifact's directory accepts no write for the whole of section A's launches
  const before = snapshot(media, artifact);
  try {
    rmSync(record, { force: true });
    let r = await launch('A1-prepare', artifact, ['one', 'two words'], env);
    let rec = existsSync(record) ? read() : {};
    check('A1 the preparing run starts the payload with its arguments, and exits with its status', r.status === 0 && rec.argc === '2', `status ${r.status}, argc ${rec.argc}, ${r.elapsedMs} ms`);
    check('A1 the payload runs from the preparation under the per-user data directory, never beside the artifact (clause (a))', rec.here === tokenDir, rec.here);
    check('A1 ROTARIS_PORTABLE_ARTIFACT names the artifact the launch started from (clause (e), REQ-STARTUP-147)', rec.artifact === artifact, rec.artifact);
    check('A1 the marker records a preparation of this token (ADR-0054, the marker)', rec.outcome === 'prepared' && rec.token === made.token, `${rec.outcome} ${rec.token}`);
    check('A1 nothing is reported on the preparing run (REQ-STARTUP-150)', r.log.trim() === '', JSON.stringify(r.log.trim()).slice(0, 120));
    const markerBefore = statSync(join(tokenDir, MARKER));

    r = await launch('A2-reuse', artifact, [], env);
    rec = read();
    const markerAfter = statSync(join(tokenDir, MARKER));
    check('A2 the next run starts from the same preparation without preparing again (clause (b))', r.status === 0 && rec.here === tokenDir && markerAfter.ino === markerBefore.ino && markerAfter.mtimeMs === markerBefore.mtimeMs, `status ${r.status}, ${r.elapsedMs} ms, marker inode ${markerAfter.ino}`);
    check('A2 the root holds the one preparation and nothing half-made', JSON.stringify(listing(prepared)) === JSON.stringify([made.token]), listing(prepared).join(', '));

    // Clause (c), ADR-0054 Defects A and B: every damage is redone silently, and the next run starts from a whole tree.
    const damages = [
      ['marker deleted', () => rmSync(join(tokenDir, MARKER))],
      ['marker names another token', () => writeFileSync(join(tokenDir, MARKER), markerOf(tokenDir).replace(`token ${made.token}`, 'token 0.0.9-0000000000000000'))],
      ['marker of another launcher format', () => writeFileSync(join(tokenDir, MARKER), markerOf(tokenDir).replace(/^rotaris-preparation 1/, 'rotaris-preparation 99'))],
      ['marker unreadable (not text)', () => writeFileSync(join(tokenDir, MARKER), Buffer.from([0xff, 0xfe, 0, 1, 2]))],
      ['entry point deleted', () => rmSync(join(tokenDir, 'run.sh'))],
      ['a listed file deleted (Defect B)', () => rmSync(join(tokenDir, 'lib', 'deep', 'small.txt'))],
      ['a listed file truncated (Defect B)', () => truncateSync(join(tokenDir, 'lib', 'blob.bin'), 1024)],
      ['a listed file grown', () => appendFileSync(join(tokenDir, 'lib', 'empty.txt'), 'x')],
      ['a subtree removed', () => rmSync(join(tokenDir, 'lib'), { recursive: true })],
    ];
    for (const [i, [what, damage]] of damages.entries()) {
      damage();
      rmSync(record, { force: true });
      r = await launch(`A3-damage-${i + 1}`, artifact, [], env);
      rec = existsSync(record) ? read() : {};
      const whole = statSync(join(tokenDir, 'lib', 'blob.bin'), { throwIfNoEntry: false })?.size === 24 << 20 && existsSync(join(tokenDir, 'lib', 'deep', 'small.txt')) && statSync(join(tokenDir, 'lib', 'empty.txt')).size === 0;
      check(`A3 ${what}: redone silently, the run starts, the preparation is whole again and nothing stale is left (clause (c), REQ-STARTUP-150)`, r.status === 0 && rec.outcome === 'prepared' && whole && r.log.trim() === '' && JSON.stringify(listing(prepared)) === JSON.stringify([made.token]), `status ${r.status}, ${r.elapsedMs} ms, root: ${listing(prepared).join(', ')}`);
    }
  } finally {
    chmodSync(media, 0o755);
  }
  const after = snapshot(media, artifact);
  check('A4 the artifact\'s directory was read-only throughout and is byte for byte what it was: no entry added, the artifact\'s size, times and digest unchanged (clause (a))', JSON.stringify(after) === JSON.stringify(before), `${after.entries.length} entr(ies), sha256 ${after.sha256.slice(0, 16)}…`);

  // Clause (b): another artifact prepares afresh; the superseded preparation is identifiable and reclaimed.
  writeFileSync(join(payload, 'lib', 'deep', 'small.txt'), 'small, version two\n');
  const second = join(media, 'rotaris-portable-2');
  const made2 = await assemblePortable({ stub, tree: payload, entry: 'run.sh', version: '0.1.1', out: second, chunkBytes: 4 << 20 });
  chmodSync(second, 0o755);
  rmSync(record, { force: true });
  let r = await launch('A5-another-artifact', second, [], env);
  let rec = read();
  check('A5 a different artifact prepares afresh under its own token and runs its own code (clause (b))', r.status === 0 && rec.token === made2.token && rec.here === join(prepared, made2.token) && rec.artifact === second, `${made2.token}`);
  check('A5 the superseded preparation, which nothing runs from, is reclaimed after the start (clause (b))', JSON.stringify(listing(prepared)) === JSON.stringify([made2.token]), listing(prepared).join(', '));

  // ADR-0054, "Two launches racing": both start, one preparation survives, nothing half-made is left.
  rmSync(prepared, { recursive: true, force: true });
  const [x, y] = await Promise.all([launch('A6-race-1', artifact, [], env), launch('A6-race-2', artifact, [], env)]);
  check('A6 two launches racing to prepare both start, and the root holds exactly one preparation and no leftover', x.status === 0 && y.status === 0 && JSON.stringify(listing(prepared)) === JSON.stringify([made.token]), `${x.elapsedMs} ms / ${y.elapsedMs} ms; root: ${listing(prepared).join(', ')}`);

  // Clause (c)'s second half: the root accepts no write, so the run places the payload for itself in the transient-files
  // storage, runs it, and removes it; the marker names the root, which the application's notice would name.
  rmSync(prepared, { recursive: true, force: true });
  mkdirSync(prepared, { recursive: true });
  chmodSync(prepared, 0o555);
  try {
    rmSync(record, { force: true });
    r = await launch('A7-unwritable-root', artifact, [], env);
    rec = existsSync(record) ? read() : {};
    check('A7 with the root refusing every write the artifact still starts (clause (c): never a reason it does not run)', r.status === 0 && rec.argc === '0', `status ${r.status}, ${r.elapsedMs} ms`);
    check('A7 it ran from a run-scoped placement in the transient-files storage, never beside the artifact (clause (c)\'s closed set of two)', typeof rec.here === 'string' && rec.here.startsWith(`${tmp}/rotaris-run-`), rec.here);
    check('A7 that placement\'s marker records the run-scoped outcome and names the root it could not prepare into (ADR-0054, "How the application learns of it")', rec.outcome === 'run-scoped' && rec['unprepared-root'] === prepared, `${rec.outcome}; ${rec['unprepared-root']}`);
    check('A7 the placement is removed when the run ends, and the root is left as it was', listing(tmp).length === 0 && listing(prepared).length === 0, `tmp: [${listing(tmp).join(', ')}], root: [${listing(prepared).join(', ')}]`);
  } finally {
    chmodSync(prepared, 0o755);
  }

  // A stub that was never assembled carries no token and starts nothing.
  const bare = join(root, 'bare-launcher');
  cpSync(stub, bare);
  r = await launch('A8-unassembled', bare, [], env);
  check('A8 an unassembled stub refuses to start, saying why', r.status === 70 && /carries no payload identity/.test(r.log), `status ${r.status}: ${r.log.trim()}`);
  rmSync(root, { recursive: true, force: true });
}

// ── B. The application ──────────────────────────────────────────────────────────────────────────────────────────────
async function application() {
  if (!process.argv.includes('--skip-build')) buildDesktop(output);
  const root = join(output, 'app');
  const payload = join(root, 'payload');
  // This host's Electron runtime, named as a packaged build names it, so `app.isPackaged` holds as it does in an artifact.
  cpSync(join(electron, '..'), payload, { recursive: true });
  renameSync(join(payload, 'electron'), join(payload, 'rotaris'));
  // The application: an entry that writes down what each process started from this payload sees, then loads the built main
  // entry. A line per process, because the product starts its own image again (the code-intelligence branch, for one), and
  // those children must NOT see the variable (REQ-STARTUP-147, PD-STARTUP-004).
  const appDir = join(payload, 'resources', 'app');
  mkdirSync(appDir, { recursive: true });
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', main: 'index.js' }, null, 2));
  writeFileSync(join(appDir, 'index.js'), [
    "import { appendFileSync } from 'node:fs';",
    "import { pathToFileURL } from 'node:url';",
    "appendFileSync(process.env.PORTABLE_PROOF_RECORD, JSON.stringify({ pid: process.pid, artifact: process.env.ROTARIS_PORTABLE_ARTIFACT ?? null, execPath: process.execPath, argv: process.argv.slice(1) }) + '\\n');",
    `await import(pathToFileURL(${JSON.stringify(mainEntry)}).href);`,
    '',
  ].join('\n'));
  const media = join(root, 'media');
  mkdirSync(media, { recursive: true });
  const exe = join(media, 'rotaris-portable');
  const made = await assemblePortable({ stub, tree: payload, entry: 'rotaris', version: pkg.version, out: exe });
  chmodSync(exe, 0o755);
  rmSync(payload, { recursive: true, force: true });
  report.app = { artifact: made };
  check('B0 the application artifact is assembled: one file, the runtime and the app inside it', readPortable(exe).files.length === made.files, `${made.token}: ${made.files} files, ${(made.payloadBytes / 2 ** 20).toFixed(1)} MiB → ${(made.bytes / 2 ** 20).toFixed(1)} MiB`);

  const scratch = join(root, 'scratch');
  const local = join(scratch, 'local');
  const ws = join(scratch, 'workspace');
  mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, 'README.md'), '# scratch\n');
  const recordFile = join(root, 'record.json');
  const dataDirectory = dataDirFor(local);
  const prepared = join(dataDirectory, 'prepared');
  // REQ-STARTUP-165 (c): sampled before B1 and B2's capture, waited for on B4, because any later notice replaces it (REQ-NOTIFY-024).
  const TITLE = '[data-testid="notice-title"]';
  const WARNING = '[data-testid="notice"][data-severity="warning"]';
  const NOT_PREPARED = 'could not prepare itself';
  const probedAt = (log, label, selector) => {
    const line = log.split('\n').find((l) => l.includes(`capture: probe-at ${label} ${selector} → `));
    return line ? JSON.parse(line.slice(line.indexOf(' → ') + 3)) : null;
  };
  const tokenDir = join(prepared, made.token);
  chmodSync(media, 0o555);
  const before = snapshot(media, exe);
  try {
    for (const [i, label] of ['B1-preparing', 'B2-from-the-preparation'].entries()) {
      const png = join(output, `${label}.png`);
      rmSync(recordFile, { force: true });
      const env = launchOptions({ local, preferences: join(scratch, 'preferences'), extra: { ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_PROBE_AT: `${TITLE}@1400`, PORTABLE_PROOF_RECORD: recordFile } });
      const markerBefore = i === 1 ? statSync(join(tokenDir, MARKER)) : null;
      const r = await launch(label, exe, [...hostSwitches, ws], env, 120_000);
      const records = existsSync(recordFile) ? readFileSync(recordFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
      // The first process is the one the stub started: main. Every later one was started by the product itself.
      const [rec = {}, ...children] = records;
      writeFileSync(join(output, `${label}.records.json`), JSON.stringify(records, null, 2));
      check(`${label}: the application starts through the stub and paints its window`, r.status === 0 && existsSync(png) && /captured /.test(r.log), `status ${r.status}, ${r.elapsedMs} ms to the capture and exit`);
      check(`${label}: main is started with ROTARIS_PORTABLE_ARTIFACT naming the artifact (clause (e))`, rec.artifact === exe, rec.artifact ?? '(not recorded)');
      check(`${label}: the running image is inside the preparation, never beside the artifact (clause (a))`, typeof rec.execPath === 'string' && rec.execPath.startsWith(`${tokenDir}/`), rec.execPath ?? '(not recorded)');
      check(`${label}: no process the product started from its own image inherits the variable (REQ-STARTUP-147, PD-STARTUP-004)`, children.every((c) => c.artifact === null), `${children.length} such process(es)${children.length ? `: ${children.map((c) => JSON.stringify(c.argv.slice(0, 2))).join(' ')}` : ''}`);
      const titles = probedAt(r.log, '1400', TITLE);
      check(`${label}: a run that made or reused a preparation reports nothing about it (REQ-STARTUP-150)`, titles !== null && !titles.some((t) => t.text.includes(NOT_PREPARED)) && !r.log.includes('launch preparation:'), JSON.stringify(titles));
      if (markerBefore) {
        const markerAfter = statSync(join(tokenDir, MARKER));
        check(`${label}: started from the preparation the first launch made, not prepared again`, markerAfter.ino === markerBefore.ino && markerAfter.mtimeMs === markerBefore.mtimeMs, `marker inode ${markerAfter.ino}`);
      }
    }
  } finally {
    chmodSync(media, 0o755);
  }
  const after = snapshot(media, exe);
  check('B3 the application artifact\'s read-only directory is byte for byte what it was (clause (a))', JSON.stringify(after) === JSON.stringify(before), `sha256 ${after.sha256.slice(0, 16)}…`);

  // Clause (c)'s report, end to end: the real stub, the real marker, the real application. A7 measures the marker; this measures the notice.
  const tmp = join(scratch, 'tmp');
  mkdirSync(tmp, { recursive: true });
  rmSync(prepared, { recursive: true, force: true });
  mkdirSync(prepared, { recursive: true });
  chmodSync(prepared, 0o555);
  try {
    const png = join(output, 'B4-no-preparation.png');
    rmSync(recordFile, { force: true });
    const env = launchOptions({ local, preferences: join(scratch, 'preferences'), extra: { TMPDIR: tmp, ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_AFTER_MS: '10000', ROTARIS_CAPTURE_PROBE_AT: `${WARNING}@100~8000`, PORTABLE_PROOF_RECORD: recordFile } });
    const r = await launch('B4-no-preparation', exe, [...hostSwitches, ws], env, 180_000);
    const [rec = {}] = existsSync(recordFile) ? readFileSync(recordFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    check('B4 with the root refusing every write the application still starts and paints (clause (c))', r.status === 0 && existsSync(png) && /captured /.test(r.log), `status ${r.status}, ${r.elapsedMs} ms`);
    check('B4 it ran from a run-scoped placement, never from the root or beside the artifact (clause (c))', typeof rec.execPath === 'string' && rec.execPath.startsWith(`${tmp}/rotaris-run-`), rec.execPath ?? '(not recorded)');
    const [warning] = probedAt(r.log, '~8000', WARNING) ?? [];
    check('B4 the warning is on screen after the show, saying it could not prepare itself and that every launch costs the same (REQ-STARTUP-165 (c), REQ-STARTUP-150)', typeof warning?.text === 'string' && warning.text.includes(NOT_PREPARED) && warning.text.includes('Every launch will take as long as this one'), warning?.text ?? '(no warning)');
    check('B4 it names the per-user data directory, never the preparation root or the placement (REQ-STARTUP-165 (c))', typeof warning?.text === 'string' && warning.text.includes(`${dataDirectory}.`) && !warning.text.includes(prepared) && !warning.text.includes('rotaris-run-'), warning?.text ?? '(no warning)');
  } finally {
    chmodSync(prepared, 0o755);
  }
  rmSync(root, { recursive: true, force: true });
}

try {
  if (only === null || only === 'mechanism') await mechanism();
  if (only === null || only === 'app') await application();
} catch (e) {
  check('the proof ran to its end', false, String(e?.stack ?? e));
}
finish();
