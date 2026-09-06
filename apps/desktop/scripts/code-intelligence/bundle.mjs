/**
 * `pnpm code-intel:bundle` — the bundled code-intelligence runtime as a BUILD step (ADR-0035, ADR-0054; REQ-MCP-011,
 * REQ-MCP-033, REQ-STARTUP-015, REQ-STARTUP-159). Part T, 2026-09-06.
 *
 * Produces `apps/desktop/resources/code-intelligence/` (ignored by git; `extraResources` of electron-builder.yml carries
 * it beside the asar — a Python tree cannot run from an archive):
 *
 *   runtime/               a self-contained CPython of the pinned version (python-build-standalone, obtained through uv)
 *                          with `serena-agent==<pin>` and its dependencies installed into its own site-packages — no
 *                          virtual environment, so nothing in the tree records the path it was built at
 *   bundle.json            the marker: the pins' hash (a rebuild is skipped when it matches), what was trimmed, the
 *                          measured size, the runtime's own answers for the version of Python and of the distribution
 *
 * The pins live in `pins.json` and nowhere else on the build side; the generated manifest module carries the same
 * distribution and version for the product side and a test refuses a drift (REQ-MCP-116). `uv` is obtained by version
 * AND sha256 (the machine's own copy is used only when its version equals the pin), and is never shipped.
 *
 * THE BUILD FETCHES — uv, the interpreter, the wheels — AND THE PRODUCT NEVER DOES: the step refuses with the fetch's
 * own error when the network is needed and unavailable; nothing here runs at application run time.
 *
 * ADR-0056's discipline: the evidence is about the ARTIFACT — the interpreter under `runtime/` answers its version and
 * the distribution's version from inside the tree — never a step's exit status.
 *
 *   --force    rebuild even when the marker matches
 *   --check    exit 1 when the tree is absent or stale; build nothing
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..', '..');
const TARGET = join(APP, 'resources', 'code-intelligence');
const RUNTIME = join(TARGET, 'runtime');
const MARKER = join(TARGET, 'bundle.json');
const CACHE = join(APP, '.cache', 'code-intelligence');
/** Bumped when the recipe below changes in a way that must rebuild an existing tree. */
const RECIPE = 3;
const PINS = JSON.parse(readFileSync(join(HERE, 'pins.json'), 'utf8'));
const pinsHash = createHash('sha256').update(JSON.stringify({ python: PINS.python, distribution: PINS.distribution, version: PINS.version, uv: PINS.uv.version, recipe: RECIPE })).digest('hex');
const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
const t0 = Date.now();

/** What is removed from the interpreter tree: nothing the runtime imports, everything a developer's install carries for building against Python. */
const TRIM = [
  'Scripts',            // console-script launchers — each embeds the absolute path it was built at, so none could work after the move
  'include', 'libs',    // C headers and import libraries: building extensions, not running them
  'Lib/test', 'Lib/idlelib', 'Lib/turtledemo',
  'Lib/site-packages/PyWin32.chm',
];

function log(m) { process.stdout.write(`[code-intel:bundle] ${m}\n`); }
function fail(m) { process.stderr.write(`[code-intel:bundle] REFUSED — ${m}\n`); process.exit(1); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status ?? r.signal}\n${(r.stderr ?? '').slice(-2_000)}`);
  return r;
}
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function sizeOf(dir) {
  let bytes = 0, files = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { const s = sizeOf(p); bytes += s.bytes; files += s.files; } else { bytes += statSync(p).size; files += 1; }
  }
  return { bytes, files };
}
const python = () => join(RUNTIME, process.platform === 'win32' ? 'python.exe' : 'bin/python3');

function upToDate() {
  if (!existsSync(MARKER) || !existsSync(python())) return false;
  try { return JSON.parse(readFileSync(MARKER, 'utf8')).pinsHash === pinsHash; } catch { return false; }
}

if (check) {
  if (upToDate()) { log(`up to date (${MARKER})`); process.exit(0); }
  fail(`the bundle is absent or stale at ${TARGET}; run pnpm code-intel:bundle`);
}
if (!force && upToDate()) { log(`up to date — marker ${MARKER} carries the pins' hash; --force rebuilds`); process.exit(0); }
if (process.platform !== 'win32') fail('IC-3: only the Windows bundle is built until the other build hosts exist (implementation-conditions.md)');

// ---- uv: the machine's own when its version equals the pin, else the pinned release by hash ---------------------
function obtainUv() {
  const onPath = spawnSync('uv', ['--version'], { encoding: 'utf8', windowsHide: true });
  const version = onPath.status === 0 ? /uv (\S+)/.exec(onPath.stdout ?? '')?.[1] : undefined;
  if (version === PINS.uv.version) { log(`uv ${version} on PATH equals the pin; used`); return 'uv'; }
  const key = `${process.platform}-${process.arch}`;
  const asset = PINS.uv.assets[key];
  if (!asset) fail(`no uv asset pinned for ${key}`);
  const dir = join(CACHE, `uv-${PINS.uv.version}`);
  const exe = join(dir, 'uv.exe');
  if (existsSync(exe)) { log(`uv ${PINS.uv.version} from the build cache ${dir}`); return exe; }
  const url = `https://github.com/astral-sh/uv/releases/download/${PINS.uv.version}/${asset.file}`;
  const zip = join(CACHE, asset.file);
  mkdirSync(CACHE, { recursive: true });
  log(`uv on PATH is ${version ?? 'absent'}, the pin is ${PINS.uv.version}: downloading ${url}`);
  run('curl.exe', ['-sSL', '--fail', '-o', zip, url]);
  const got = sha256(zip);
  if (got !== asset.sha256) { rmSync(zip, { force: true }); fail(`uv download hash ${got} differs from the pinned ${asset.sha256}`); }
  mkdirSync(dir, { recursive: true });
  run('tar', ['-xf', zip, '-C', dir]);
  if (!existsSync(exe)) fail(`the uv archive held no uv.exe (${dir})`);
  const v = run(exe, ['--version']).stdout.trim();
  if (!v.includes(PINS.uv.version)) fail(`the downloaded uv answers '${v}', not ${PINS.uv.version}`);
  return exe;
}

let uv;
try { uv = obtainUv(); } catch (e) { fail(`uv could not be obtained: ${e.message}. The build fetches; the product never does.`); }

// ---- the interpreter and the distribution ----------------------------------------------------------------------
const install = join(TARGET, '.python-install');
try {
  mkdirSync(TARGET, { recursive: true });
  rmSync(RUNTIME, { recursive: true, force: true });
  rmSync(install, { recursive: true, force: true });
  rmSync(MARKER, { force: true });
  log(`uv python install ${PINS.python} → ${install}`);
  run(uv, ['python', 'install', PINS.python, '--install-dir', install], { stdio: ['ignore', 'inherit', 'inherit'] });
  const dirs = readdirSync(install, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink() && e.name.startsWith(`cpython-${PINS.python}-`)).map((e) => e.name);
  if (dirs.length !== 1) throw new Error(`expected one cpython-${PINS.python}-* directory under ${install}, found [${dirs.join(', ')}]`);
  renameSync(join(install, dirs[0]), RUNTIME);
  rmSync(install, { recursive: true, force: true });
  log(`uv pip install ${PINS.distribution}==${PINS.version} into the interpreter's own site-packages`);
  // No virtual environment: a venv's pyvenv.cfg records the base interpreter's absolute path, which the move into the
  // artifact would falsify; installing into the interpreter itself leaves nothing path-bound in the tree.
  run(uv, ['pip', 'install', '--python', python(), '--break-system-packages', `${PINS.distribution}==${PINS.version}`], { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  fail(`${e.message}\nThe build fetches the interpreter and the wheels; the product never does. Is the network reachable?`);
}

const untrimmed = sizeOf(RUNTIME);
const trimmed = [];
for (const rel of TRIM) { const p = join(RUNTIME, ...rel.split('/')); if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); trimmed.push(rel); } }

// Byte-compile once here: the artifact lands where a user cannot write, so an interpreter that compiles on import would
// pay the cost on every launch and write nothing. Measured beside the marker.
let compiled = false;
try { run(python(), ['-m', 'compileall', '-q', '-j', '0', join(RUNTIME, 'Lib')], { env: { ...process.env, PYTHONUTF8: '1' } }); compiled = true; } catch (e) { log(`compileall did not complete (${e.message.split('\n')[0]}); the tree runs uncompiled`); }

// ---- evidence about the artifact --------------------------------------------------------------------------------
let answers;
try {
  const r = run(python(), ['-I', '-c', 'import importlib.metadata as m, sys, json; print(json.dumps({"python": sys.version.split()[0], "distribution": m.version("serena-agent"), "executable": sys.executable}))'], { env: { PYTHONUTF8: '1', SYSTEMROOT: process.env['SYSTEMROOT'] ?? 'C:\\Windows' } });
  answers = JSON.parse(r.stdout.trim());
} catch (e) {
  fail(`the interpreter under runtime/ does not answer: ${e.message}`);
}
if (answers.python !== PINS.python) fail(`the interpreter answers Python ${answers.python}, the pin is ${PINS.python}`);
if (answers.distribution !== PINS.version) fail(`the tree answers ${PINS.distribution} ${answers.distribution}, the pin is ${PINS.version}`);
// REQ-STARTUP-015 / REQ-STARTUP-142: exactly one copy of the bundled tool server's licence text inside the bundle.
const distInfo = readdirSync(join(RUNTIME, 'Lib', 'site-packages')).find((n) => n.startsWith('serena_agent-') && n.endsWith('.dist-info'));
const licenseFile = distInfo ? join('Lib', 'site-packages', distInfo, 'licenses', 'LICENSE') : null;
if (!licenseFile || !existsSync(join(RUNTIME, licenseFile))) fail(`the distribution's licence text was not found under its dist-info (${distInfo ?? 'no dist-info'})`);

const final = sizeOf(RUNTIME);
const marker = {
  pinsHash, recipe: RECIPE, python: PINS.python, distribution: PINS.distribution, version: PINS.version, uv: PINS.uv.version,
  builtAt: new Date().toISOString(), elapsedMs: Date.now() - t0,
  answers, licenseFile: licenseFile.split('\\').join('/'), trimmed, compiled,
  size: { untrimmedBytes: untrimmed.bytes, untrimmedFiles: untrimmed.files, bytes: final.bytes, files: final.files },
};
writeFileSync(MARKER, `${JSON.stringify(marker, null, 2)}\n`);
log(`built in ${marker.elapsedMs} ms — ${(final.bytes / 1_048_576).toFixed(1)} MiB in ${final.files} files (${(untrimmed.bytes / 1_048_576).toFixed(1)} MiB before trimming); Python ${answers.python}, ${PINS.distribution} ${answers.distribution}; marker ${MARKER}`);
