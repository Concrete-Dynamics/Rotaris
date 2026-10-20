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
 *   --force                      rebuild even when the marker matches
 *   --check                      exit 1 when the tree is absent or stale; build nothing
 *   --target=<platform>-<arch>   the artifact's architecture (OQ-400, ruled 2026-10-15 under R-072): the interpreter is
 *                                installed by its full uv key for it, the marker and its hash carry it, and a tree built
 *                                for another one is stale. The development tree defaults to the host; `package.mjs`
 *                                passes `win32-x64`, so a Windows ARM64 host builds the `windows-x64` artifact's bundle
 *                                with an x86_64 interpreter (`target.mjs`; `build-hooks.cjs`'s `checkRuntime` refuses
 *                                any other at packaging).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultTargetKey, interpreterKey, parseTarget, pinsHashInput, uvAssetFor } from './target.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..', '..');
const TARGET = join(APP, 'resources', 'code-intelligence');
const RUNTIME = join(TARGET, 'runtime');
const MARKER = join(TARGET, 'bundle.json');
const CACHE = join(APP, '.cache', 'code-intelligence');
/** Bumped when the recipe below changes in a way that must rebuild an existing tree. */
const RECIPE = 4;
const PINS = JSON.parse(readFileSync(join(HERE, 'pins.json'), 'utf8'));
const target = parseTarget(process.argv.slice(2), { platform: process.platform, arch: process.arch });
if (target.error) { process.stderr.write(`[code-intel:bundle] REFUSED — ${target.error}\n`); process.exit(1); }
const pinsHash = createHash('sha256').update(pinsHashInput(PINS, RECIPE, target)).digest('hex');
const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
const t0 = Date.now();

/** What is removed from the interpreter tree: nothing the runtime imports, everything a developer's install carries for building against Python. */
const TRIM = [
  'Scripts',            // console-script launchers on Windows
  'include', 'libs',    // C headers and import libraries: building extensions, not running them
  'Lib/test', 'Lib/idlelib', 'Lib/turtledemo',
  'Lib/site-packages/PyWin32.chm',
  'share/man', 'share/doc', // unix documentation
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

function findSitePackages(root) {
  const win = join(root, 'Lib', 'site-packages');
  if (existsSync(win)) return win;
  const lib = join(root, 'lib');
  if (existsSync(lib)) {
    const py = readdirSync(lib).find((e) => e.startsWith('python3.'));
    if (py && existsSync(join(lib, py, 'site-packages'))) {
      return join(lib, py, 'site-packages');
    }
  }
  return null;
}

function findLibDir(root) {
  const win = join(root, 'Lib');
  if (existsSync(win)) return win;
  const lib = join(root, 'lib');
  if (existsSync(lib)) {
    const py = readdirSync(lib).find((e) => e.startsWith('python3.'));
    if (py && existsSync(join(lib, py))) {
      return join(lib, py);
    }
  }
  return null;
}

function upToDate() {
  if (!existsSync(MARKER) || !existsSync(python())) return false;
  try { return JSON.parse(readFileSync(MARKER, 'utf8')).pinsHash === pinsHash; } catch { return false; }
}

const hostKey = `${process.platform}-${process.arch}`;
if (check) {
  if (upToDate()) { log(`up to date for ${target.key} (${MARKER})`); process.exit(0); }
  fail(`the bundle is absent or stale for ${target.key} at ${TARGET}; run pnpm code-intel:bundle${target.key === defaultTargetKey({ platform: process.platform, arch: process.arch }) ? '' : ` --target=${target.key}`}`);
}
if (!force && upToDate()) { log(`up to date for ${target.key} — marker ${MARKER} carries the pins' hash; --force rebuilds`); process.exit(0); }
if (process.platform !== 'win32' && process.platform !== 'linux') fail('only Windows and Linux bundles are currently supported');

// ---- uv: the machine's own when its version equals the pin, else the pinned release by hash ---------------------
function obtainUv() {
  const onPath = spawnSync('uv', ['--version'], { encoding: 'utf8', windowsHide: true });
  const version = onPath.status === 0 ? /uv (\S+)/.exec(onPath.stdout ?? '')?.[1] : undefined;
  if (version === PINS.uv.version) { log(`uv ${version} on PATH equals the pin; used`); return 'uv'; }
  // OQ-400 (c): no win32-arm64 uv is pinned; that host takes the pinned, hash-checked win32-x64 asset under emulation.
  const chosen = uvAssetFor(PINS.uv, hostKey);
  if (chosen.error) fail(chosen.error);
  const { key, asset } = chosen;
  if (chosen.emulated) log(`no uv pinned for ${hostKey}: the pinned ${key} uv is used, and runs under the operating system's x64 emulation`);
  const dir = join(CACHE, `uv-${PINS.uv.version}-${key}`);
  const exe = join(dir, process.platform === 'win32' ? 'uv.exe' : 'uv');
  if (existsSync(exe)) { log(`uv ${PINS.uv.version} from the build cache ${dir}`); return exe; }
  const url = `https://github.com/astral-sh/uv/releases/download/${PINS.uv.version}/${asset.file}`;
  const archive = join(CACHE, asset.file);
  mkdirSync(CACHE, { recursive: true });
  log(`uv on PATH is ${version ?? 'absent'}, the pin is ${PINS.uv.version}: downloading ${url}`);
  const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
  run(curlCmd, ['-sSL', '--fail', '-o', archive, url]);
  const got = sha256(archive);
  if (got !== asset.sha256) { rmSync(archive, { force: true }); fail(`uv download hash ${got} differs from the pinned ${asset.sha256}`); }
  mkdirSync(dir, { recursive: true });
  // Windows' own bsdtar, as `packages/store/src/backup.ts` names it: from Git Bash a bare `tar` is GNU tar, which reads `C:` as a host.
  const tarCmd = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
  run(tarCmd, ['-xf', archive, '-C', dir]);
  let resolvedExe = exe;
  if (!existsSync(resolvedExe)) {
    // Some archives extract into a nested folder, e.g. uv-x86_64-unknown-linux-gnu/uv
    const found = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && existsSync(join(dir, e.name, 'uv')));
    if (found) resolvedExe = join(dir, found.name, 'uv');
  }
  if (!existsSync(resolvedExe)) fail(`the uv archive held no uv executable (${dir})`);
  const v = run(resolvedExe, ['--version']).stdout.trim();
  if (!v.includes(PINS.uv.version)) fail(`the downloaded uv answers '${v}', not ${PINS.uv.version}`);
  return resolvedExe;
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
  // The full key, never the bare version: uv would pick an interpreter for the host it runs on (OQ-400).
  const pythonKey = interpreterKey(PINS.python, target);
  log(`uv python install ${pythonKey} → ${install} (the target ${target.key}, on a ${hostKey} host)`);
  run(uv, ['python', 'install', pythonKey, '--install-dir', install], { stdio: ['ignore', 'inherit', 'inherit'] });
  const dirs = readdirSync(install, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink() && e.name.startsWith(`cpython-${PINS.python}-`)).map((e) => e.name);
  if (dirs.length !== 1) throw new Error(`expected one cpython-${PINS.python}-* directory under ${install}, found [${dirs.join(', ')}]`);
  if (dirs[0] !== pythonKey) throw new Error(`uv installed ${dirs[0]}, not the ${pythonKey} the target ${target.key} asks for`);
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
const libDir = findLibDir(RUNTIME);
try {
  if (libDir) {
    run(python(), ['-m', 'compileall', '-q', '-j', '0', libDir], { env: { ...process.env, PYTHONUTF8: '1' } });
    compiled = true;
  }
} catch (e) { log(`compileall did not complete (${e.message.split('\n')[0]}); the tree runs uncompiled`); }

// ---- evidence about the artifact --------------------------------------------------------------------------------
let answers;
try {
  const env = { PYTHONUTF8: '1' };
  if (process.platform === 'win32') env.SYSTEMROOT = process.env['SYSTEMROOT'] ?? 'C:\\Windows';
  const r = run(python(), ['-I', '-c', 'import importlib.metadata as m, sys, json; print(json.dumps({"python": sys.version.split()[0], "distribution": m.version("serena-agent"), "executable": sys.executable}))'], { env });
  answers = JSON.parse(r.stdout.trim());
} catch (e) {
  fail(`the interpreter under runtime/ does not answer: ${e.message}`);
}
if (answers.python !== PINS.python) fail(`the interpreter answers Python ${answers.python}, the pin is ${PINS.python}`);
if (answers.distribution !== PINS.version) fail(`the tree answers ${PINS.distribution} ${answers.distribution}, the pin is ${PINS.version}`);
// REQ-STARTUP-015 / REQ-STARTUP-142: exactly one copy of the bundled tool server's licence text inside the bundle. This
// tree's copy is the one the notices generator reads and reproduces in THIRD-PARTY-LICENSES.txt; the artifact carries
// that one and leaves this file out (electron-builder.yml's filter; afterPack's "assets" rule counts; plan §4.4).
const sitePackages = findSitePackages(RUNTIME);
if (!sitePackages) fail(`site-packages not found under ${RUNTIME}`);
const distInfo = readdirSync(sitePackages).find((n) => n.startsWith('serena_agent-') && n.endsWith('.dist-info'));
const fullLicense = distInfo ? join(sitePackages, distInfo, 'licenses', 'LICENSE') : null;
const licenseFile = fullLicense && existsSync(fullLicense) ? relative(RUNTIME, fullLicense) : null;
if (!licenseFile) fail(`the distribution's licence text was not found under its dist-info (${distInfo ?? 'no dist-info'})`);

const final = sizeOf(RUNTIME);
const marker = {
  pinsHash, recipe: RECIPE, target: target.key, targetArch: target.arch, python: PINS.python, distribution: PINS.distribution, version: PINS.version, uv: PINS.uv.version,
  builtAt: new Date().toISOString(), elapsedMs: Date.now() - t0,
  answers, licenseFile: licenseFile.split('\\').join('/'), trimmed, compiled,
  size: { untrimmedBytes: untrimmed.bytes, untrimmedFiles: untrimmed.files, bytes: final.bytes, files: final.files },
};
writeFileSync(MARKER, `${JSON.stringify(marker, null, 2)}\n`);
log(`built in ${marker.elapsedMs} ms — ${(final.bytes / 1_048_576).toFixed(1)} MiB in ${final.files} files (${(untrimmed.bytes / 1_048_576).toFixed(1)} MiB before trimming); Python ${answers.python}, ${PINS.distribution} ${answers.distribution}, for ${target.key}; marker ${MARKER}`);
