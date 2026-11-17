// @ts-check
/**
 * `pnpm linux-acceptance-proof [--appimage=<path>] [--out=<report.json>]` — ADR-0066's acceptance criteria for the
 * Linux AppImage, measured on the host this runs on (R-104):
 *
 *   AC-1  the AppImage launches UNEXTRACTED on a host that never had the legacy FUSE library. This script cannot make a
 *         host that never had it; it READS whether this one has or had (`ldconfig -p`, `dpkg-query`'s status, which keeps
 *         a removed package as `rc`) and reports the launch beside that reading. Only a report whose host reads "never
 *         had it" discharges AC-1; on any other host the launch is evidence that the image starts, and says so.
 *   AC-2  first paint inside REQ-STARTUP-155's 5 s: the time from the spawn to the application's own
 *         "main window 1 shown" line, as its timestamp gives it — over five launches, the first of them the first this
 *         host makes of the file. The report gives every one, with the load average at its spawn. Two readings, as
 *         spike 17 gave two for the Windows artifacts: the STRICT one (every launch inside the bound) and the MEDIAN.
 *         The exit status follows the median, so one slow launch on a shared machine does not turn a run red; the
 *         strict reading is in the report and is what the record quotes. A first launch on a hosted runner under a
 *         virtual display read 7.5 s once and 1.6 s once (2026-11-17), which is why one launch is not a measurement.
 *   AC-4  a second launch on the same account is handed to the first (REQ-STARTUP-164): it exits 0 without claiming an
 *         instance, the first logs the hand-over, and one instance claimed the profile.
 *
 * AC-3, the load proof and D10's two counterfactuals, is `pnpm package`'s own and is not measured here.
 *
 * Every launch runs against a scratch profile — `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` under
 * `.proof/linux-acceptance-proof/` — so nothing of the operator's own installation is read or written, and through
 * `spawnBounded`, so none outlives its bound. `APPIMAGELAUNCHER_DISABLE=1` is set: a desktop's AppImage integrator
 * holds a launch behind a dialog, which is the integrator's time and not the artifact's (measured 2026-11-17: 14 s behind
 * one, 0.7 s without).
 *
 * The first launch is ended at its bound by design — it is the instance the second is handed to — so its `overran` is
 * expected and is not a failure. Nothing here is product code. Exit 0 when every criterion measured held, 1 otherwise;
 * the report is written either way.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnBounded } from './lib/bounded-launch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const release = join(app, 'release');
const arg = (/** @type {string} */ name) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

/** REQ-STARTUP-155's bound on first paint. */
const FIRST_PAINT_BOUND_MS = 5_000;
/** How long the first instance stays up: long enough for the second launch to be made and handed over. */
const FIRST_INSTANCE_MS = 14_000;
/** How many launches AC-2 is read over, and how long each of the later ones may run before it is ended. */
const LAUNCHES = 5;
const SOLO_LAUNCH_MS = 9_000;
/** When the second launch is made, counted from the first's spawn. */
const SECOND_LAUNCH_AT_MS = 7_000;

if (process.platform !== 'linux') {
  process.stderr.write('linux-acceptance-proof measures a Linux AppImage on a Linux host; this host is not one\n');
  process.exit(1);
}

const found = existsSync(release) ? readdirSync(release).filter((f) => /^Rotaris-.*-linux-x86_64\.AppImage$/.test(f)) : [];
const appImage = resolve(arg('appimage') ?? (found.length === 1 ? join(release, /** @type {string} */ (found[0])) : ''));
if (!existsSync(appImage) || appImage === resolve('')) {
  process.stderr.write(`no AppImage to measure: pass --appimage=<path>, or run pnpm package first (found ${found.length} under ${release})\n`);
  process.exit(1);
}

const scratch = join(app, '..', '..', '.proof', 'linux-acceptance-proof');
rmSync(scratch, { recursive: true, force: true });
for (const d of ['config', 'data', 'cache', 'workspace']) mkdirSync(join(scratch, d), { recursive: true });
const out = resolve(arg('out') ?? join(scratch, 'report.json'));

const read = (/** @type {string} */ command, /** @type {string[]} */ args) => {
  const r = spawnSync(command, args, { encoding: 'utf8' });
  return { status: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

// ── AC-1's host reading ──────────────────────────────────────────────────────────────────────────────────────────────
const osRelease = Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const at = l.indexOf('='); return [l.slice(0, at), l.slice(at + 1).replace(/^"|"$/g, '')]; }));
const ldconfig = read('ldconfig', ['-p']);
const loaderHasFuse2 = /libfuse\.so\.2\b/.test(ldconfig.text);
// `dpkg-query` prints `<status-abbreviation> <package>`: `ii` installed, `rc` removed with its configuration kept — a
// host that had it. A package dpkg has never seen is not listed at all.
const dpkg = read('dpkg-query', ['-W', '-f', '${db:Status-Abbrev} ${Package}\\n', 'libfuse2', 'libfuse2t64']);
const dpkgKnown = dpkg.text.split('\n').map((l) => l.trim()).filter((l) => /^(ii|rc|hi|pi|un)\s/.test(l) && !/^un\s/.test(l));
const neverHadFuse2 = !loaderHasFuse2 && dpkgKnown.length === 0;

const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ROTARIS_'))),
  XDG_CONFIG_HOME: join(scratch, 'config'),
  XDG_DATA_HOME: join(scratch, 'data'),
  XDG_CACHE_HOME: join(scratch, 'cache'),
  APPIMAGELAUNCHER_DISABLE: '1',
};
const workspace = join(scratch, 'workspace');
const args = ['--enable-logging=stderr', workspace];

const stamp = (/** @type {string} */ log, /** @type {RegExp} */ line) => {
  for (const l of log.split('\n')) {
    if (!line.test(l)) continue;
    const m = /\[main (\S+)\]/.exec(l);
    if (m) return Date.parse(/** @type {string} */ (m[1]));
  }
  return null;
};
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

const firstLoad = { load1: Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]) };
const startedAt = Date.now();
const first = spawnBounded(appImage, args, { timeoutMs: FIRST_INSTANCE_MS, env });
await sleep(SECOND_LAUNCH_AT_MS);
const secondStartedAt = Date.now();
const second = await spawnBounded(appImage, args, { timeoutMs: 10_000, env });
const one = await first;
const firstLog = `${one.stdout}${one.stderr}`;
const secondLog = `${second.stdout}${second.stderr}`;

const shownAt = stamp(firstLog, /main window 1 shown/);
const claimedAt = stamp(firstLog, /instance claimed/);
const firstPaintMs = shownAt === null ? null : shownAt - startedAt;
const loadAt = (/** @type {number} */ at) => ({ at, load1: Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]) });
/** @type {{ launch: number, firstPaintMs: number | null, load1: number }[]} */
const launches = [{ launch: 1, firstPaintMs, load1: firstLoad.load1 }];
for (let n = 2; n <= LAUNCHES; n += 1) {
  const load = loadAt(Date.now());
  const t0 = Date.now();
  const r = await spawnBounded(appImage, args, { timeoutMs: SOLO_LAUNCH_MS, env });
  const at = stamp(`${r.stdout}${r.stderr}`, /main window 1 shown/);
  launches.push({ launch: n, firstPaintMs: at === null ? null : at - t0, load1: load.load1 });
}
const times = launches.map((l) => l.firstPaintMs);
const measured = /** @type {number[]} */ (times.filter((t) => t !== null)).sort((a, b) => a - b);
const medianMs = measured.length === LAUNCHES ? /** @type {number} */ (measured[Math.floor(LAUNCHES / 2)]) : null;
const maxMs = measured.length === LAUNCHES ? /** @type {number} */ (measured[LAUNCHES - 1]) : null;
const handedOver = /hand-over surfaced window/.test(firstLog);
const secondClaimed = /instance claimed/.test(secondLog);

const criteria = {
  'AC-1': {
    held: shownAt !== null,
    discharges: neverHadFuse2,
    reading: neverHadFuse2
      ? 'this host never had libfuse.so.2: the loader does not list it and dpkg has never seen libfuse2 or libfuse2t64'
      : `this host has or had libfuse.so.2 (loader lists it: ${loaderHasFuse2}; dpkg: ${dpkgKnown.join(', ') || 'none'}), so the launch does not discharge AC-1`,
    launchedUnextracted: shownAt !== null,
  },
  'AC-2': {
    held: medianMs !== null && medianMs <= FIRST_PAINT_BOUND_MS,
    strictHeld: maxMs !== null && maxMs <= FIRST_PAINT_BOUND_MS,
    medianMs,
    maxMs,
    boundMs: FIRST_PAINT_BOUND_MS,
    launches,
    firstLaunchClaimedAfterMs: claimedAt === null ? null : claimedAt - startedAt,
  },
  'AC-4': {
    held: handedOver && !secondClaimed && second.status === 0 && second.overran === null,
    secondExit: second.status,
    secondElapsedMs: second.elapsedMs,
    secondAfterMs: secondStartedAt - startedAt,
    secondClaimedAnInstance: secondClaimed,
    firstLoggedTheHandOver: handedOver,
  },
};
const report = {
  at: new Date(startedAt).toISOString(),
  appImage,
  bytes: readFileSync(appImage).length,
  host: { os: `${osRelease['PRETTY_NAME'] ?? 'unknown'}`, versionId: osRelease['VERSION_ID'] ?? null, arch: process.arch, display: process.env['DISPLAY'] ?? null, kernel: read('uname', ['-r']).text },
  fuse2: { loaderLists: loaderHasFuse2, dpkgKnows: dpkgKnown, neverHad: neverHadFuse2 },
  criteria,
  firstInstance: { endedAtItsBound: one.overran !== null, status: one.status, signal: one.signal },
  logs: { firstTail: firstLog.split('\n').slice(0, 12), second: secondLog.split('\n').slice(0, 8) },
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

for (const [id, c] of Object.entries(criteria)) process.stdout.write(`${c.held ? 'PASS' : 'FAIL'}  ${id}  ${JSON.stringify(c)}\n`);
process.stdout.write(`${neverHadFuse2 ? 'AC-1 is discharged by this host' : 'AC-1 is NOT discharged by this host (it has or had the legacy FUSE library)'} — report at ${out}\n`);
process.exit(Object.values(criteria).every((c) => c.held) ? 0 : 1);
