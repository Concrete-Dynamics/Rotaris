// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
'use strict';
/**
 * ADR-0056 rules 1, 1a, 3 and 4 — the build's own evidence (IC-6).
 *
 * electron-builder hooks, named exports picked up by name from electron-builder.yml.
 *
 *  beforeBuild — a COLD rebuild is forced (each binding's build/ is removed, so @electron/rebuild
 *    cannot skip on its .forge-meta and node-gyp cannot report "up to date"), the binding's own
 *    prebuild-skip is overridden (force_build=1 reaches node-gyp as -Dforce_build=1 through
 *    npm_config_force_build), and the moment is stamped as the rebuild marker.
 *  artifactBuildCompleted — REQ-STARTUP-031: each produced file carries the name the DECLARED version renders
 *    (`lib/artifact-names.mjs`), never electron-builder's normalised one.
 *  artifactBuildStarted — R-091 (Electron security checklist 19; ADR-0054, ADR-0056 rule 4): the fuses electron-builder
 *    flipped in the packed Rotaris.exe after afterPack (electron-builder.yml's `electronFuses`), read back from the binary's
 *    own fuse wire and compared with `FUSES`; any difference refuses the build before the installer is made from it.
 *  afterPack — rule 1a: for each binding a compiled binary exists in node_modules, is newer than the
 *    marker, is byte-identical to the copy the artifact carries under app.asar.unpacked, and no prebuild
 *    rides in the artifact (neither unpacked nor inside app.asar, where the loader's existsSync would find
 *    it). Then rule 4: the packaged Electron binary loads each binding THROUGH the packaged asar and
 *    reports the file it actually opened, which must be the rule-1a file. Beside them, the "runtime" rule (the bundled
 *    code-intelligence interpreter answers from inside the artifact) and the "assets" rule (the About page's two files
 *    at the root of resources/, and REQ-STARTUP-015's one copy of the tool server's licence text; first-release-plan.md §4.4).
 *
 * ROTARIS_IC6_COUNTERFACTUAL=no-force      — D10 as measured: the rebuild runs, exits 0, compiles nothing.
 * ROTARIS_IC6_COUNTERFACTUAL=keep-prebuild — a prebuild sits in the tree the loader reaches (package.mjs packs
 *   from a config without the prebuild exclusions; rule 1's presence check looks away; rule 4 must catch it).
 *   Placing the file beside the unpacked tree was tried first and reaches nothing: Electron resolves through
 *   the asar index, and a file the index does not name does not exist to the loader (measured 2026-09-04).
 * Under either the build MUST fail, at the named rule. That failing is the whole of what IC-6 asks.
 */
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(APP_DIR, '..', '..');
const RELEASE_DIR = path.join(APP_DIR, 'release');
const MARKER = path.join(RELEASE_DIR, 'rebuild-marker.json');
const REPORT = path.join(RELEASE_DIR, 'load-proof.afterpack.json');
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

/** The set rule 1 is written over. A third binding joins here and inherits every rule. */
const BINDINGS = [
  {
    name: 'better-sqlite3',
    built: { win32: ['build/Release/better_sqlite3.node'] },
    prebuilds: (platform, arch) => [`prebuilds/${platform}-${arch}.node`],
  },
  {
    name: 'node-pty',
    built: { win32: ['build/Release/pty.node', 'build/Release/conpty.node', 'build/Release/conpty_console_list.node'] },
    prebuilds: (platform, arch) => [`prebuilds/${platform}-${arch}`],
  },
];

function counterfactual() {
  const v = process.env['ROTARIS_IC6_COUNTERFACTUAL'];
  if (v === undefined || v === '') return null;
  if (v !== 'no-force' && v !== 'keep-prebuild') throw new Error(`ROTARIS_IC6_COUNTERFACTUAL must be no-force or keep-prebuild, not "${v}"`);
  return v;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function bindingSourceDir(name) {
  // Resolved the way the app's own require would (pnpm hoists to the workspace root), never assumed.
  const deps = require(path.join(APP_DIR, 'package.json')).dependencies ?? {};
  if (!(name in deps)) throw new Error(`rule 1: "${name}" is not a dependency of the app, so the packager would neither rebuild nor carry it`);
  let pkg;
  try { pkg = require.resolve(`${name}/package.json`, { paths: [APP_DIR] }); } catch (e) { throw new Error(`rule 1: "${name}" cannot be resolved from ${APP_DIR}: ${e.message}`); }
  return realpathSync(path.dirname(pkg));
}

/**
 * Every copy of the binding's package the rebuild can reach. pnpm keeps one under node_modules/.pnpm and
 * hoists a second to node_modules/<name>; @electron/rebuild's walker compiles both, and electron-builder's
 * collector packages the .pnpm one while the checkout's require resolves the hoisted one (measured, 2026-09-04).
 */
function bindingCopies(name) {
  const copies = new Set([bindingSourceDir(name)]);
  const root = path.dirname(path.dirname(APP_DIR));
  const store = path.join(root, 'node_modules', '.pnpm');
  if (existsSync(store)) {
    for (const entry of readdirSync(store)) {
      if (!entry.startsWith(`${name}@`)) continue;
      const dir = path.join(store, entry, 'node_modules', name);
      if (existsSync(path.join(dir, 'package.json'))) copies.add(realpathSync(dir));
    }
  }
  return [...copies];
}

function platformOf(ctx) {
  const p = ctx.electronPlatformName ?? (ctx.platform && ctx.platform.nodeName);
  if (p !== 'win32') throw new Error(`IC-3: no ${p} artifact may be produced until the build hosts exist (implementation-conditions.md)`);
  return p;
}

/**
 * electron-builder: called before dependencies are installed or rebuilt. The rebuild is run HERE, through
 * @electron/rebuild's API, because that is the only way to name the set (rule 1 is over the set, not over
 * whatever a walker finds), to force a cold build (D10's "already built" skip), and to see the failure of
 * any one binding as a failed build. electron-builder's own pass then runs over the result and skips.
 */
async function beforeBuild(ctx) {
  const platform = platformOf(ctx);
  const arch = typeof ctx.arch === 'string' ? ctx.arch : ARCH_NAMES[ctx.arch];
  const cf = counterfactual();
  mkdirSync(RELEASE_DIR, { recursive: true });
  const removed = [];
  for (const b of BINDINGS) for (const dir of bindingCopies(b.name)) {
    const build = path.join(dir, 'build');
    if (existsSync(build)) { rmSync(build, { recursive: true, force: true }); removed.push(build); }
  }
  if (cf === 'no-force') delete process.env['npm_config_force_build'];
  else process.env['npm_config_force_build'] = '1';
  // node-pty's winpty.gyp runs `cd shared && GetCommitHash.bat`; with this variable set, cmd.exe does not
  // search the current directory for the batch file and gyp fails to load. Cleared for the rebuild only.
  const noCwd = process.env['NoDefaultCurrentDirectoryInExePath'];
  if (noCwd !== undefined) delete process.env['NoDefaultCurrentDirectoryInExePath'];
  const marker = { at: Date.now(), iso: new Date().toISOString(), electronVersion: ctx.electronVersion, platform, arch, counterfactual: cf, removedBuildDirs: removed, forceBuild: cf !== 'no-force', clearedNoDefaultCurrentDirectoryInExePath: noCwd !== undefined };
  writeFileSync(MARKER, JSON.stringify(marker, null, 2));
  console.log(`[ic6] beforeBuild: marker ${marker.iso}, electron ${marker.electronVersion}, force_build=${marker.forceBuild ? 1 : 'unset'}${cf ? `, COUNTERFACTUAL ${cf}` : ''}; removed ${removed.length} build dir(s)`);
  const { rebuild } = await import('@electron/rebuild');
  const t0 = Date.now();
  await rebuild({
    buildPath: APP_DIR,
    projectRootPath: path.dirname(path.dirname(APP_DIR)),
    electronVersion: ctx.electronVersion,
    arch,
    platform,
    force: true,
    buildFromSource: true,
    onlyModules: BINDINGS.map((b) => b.name),
    mode: 'sequential',
    useCache: false,
  });
  marker.rebuildMs = Date.now() - t0;
  writeFileSync(MARKER, JSON.stringify(marker, null, 2));
  console.log(`[ic6] beforeBuild: @electron/rebuild over ${BINDINGS.map((b) => b.name).join(', ')} returned after ${marker.rebuildMs} ms — which is not evidence of anything (rule 1a); afterPack decides`);
  // `true`: electron-builder keeps its own rebuild pass (a no-op over the .forge-meta this one wrote) AND its
  // node_modules collection — returning `false` declares node_modules "handled externally" and it then
  // packages none at all (measured: an asar of 28 entries and no node_modules).
  return true;
}

/** Rule 1a over one binding: the evidence about the artifact, never about the command. */
function checkRule1a(b, platform, arch, marker, unpackedRoot, asarEntries) {
  const copies = bindingCopies(b.name);
  const files = [];
  for (const rel of b.built[platform]) {
    // What this build compiled: every copy's output that is newer than the marker.
    const compiled = copies.map((dir) => path.join(dir, rel)).filter((f) => existsSync(f)).map((f) => ({ f, st: statSync(f) })).map(({ f, st }) => ({ path: f, size: st.size, mtimeMs: st.mtimeMs, mtime: new Date(st.mtimeMs).toISOString(), sha256: sha256(f) }));
    const fresh = compiled.filter((c) => c.size > 0 && c.mtimeMs > marker.at);
    if (fresh.length === 0) throw new Error(`rule 1a (${b.name}): no compiled binary newer than the rebuild marker (${marker.iso}) for ${rel} — the rebuild step produced nothing; found ${compiled.length === 0 ? 'no file at all' : compiled.map((c) => `${c.path} (${c.mtime})`).join(', ')}`);
    const packaged = path.join(unpackedRoot, b.name, rel);
    if (!existsSync(packaged)) throw new Error(`rule 3 (${b.name}): ${rel} is not unpacked at ${packaged}`);
    const p = sha256(packaged);
    const match = fresh.find((c) => c.sha256 === p);
    if (!match) throw new Error(`rule 1a (${b.name}): the artifact's ${rel} (${p.slice(0, 12)}) is not a file this build compiled: ${fresh.map((c) => `${c.sha256.slice(0, 12)} ${c.path}`).join('; ')}`);
    files.push({ rel, packaged, sha256: p, compiledFrom: match.path, size: match.size, mtime: match.mtime, compiledCopies: compiled.length });
  }
  const prebuilds = [];
  for (const rel of b.prebuilds(platform, arch)) {
    if (marker.counterfactual === 'keep-prebuild') {
      // The counterfactual: the prebuild is in the artifact (package.mjs built it from a config without the
      // exclusions) and this check looks away, so that rule 4 alone has to catch what the loader opens.
      prebuilds.push({ rel, absent: false, checkSkipped: 'COUNTERFACTUAL keep-prebuild' });
      continue;
    }
    const unpacked = path.join(unpackedRoot, b.name, rel);
    if (existsSync(unpacked)) throw new Error(`rule 1 (${b.name}): a prebuilt binary is in the artifact at ${unpacked}; prebuilds are refused`);
    const inAsar = `node_modules/${b.name}/${rel}`.replace(/\\/g, '/');
    const hit = asarEntries.find((e) => e === inAsar || e.startsWith(`${inAsar}/`));
    if (hit) throw new Error(`rule 1 (${b.name}): a prebuilt binary is inside app.asar at ${hit}; the loader's existsSync would find it there`);
    prebuilds.push({ rel, absent: true });
  }
  return { name: b.name, copies, files, prebuilds };
}

function listAsar(asarPath) {
  // eslint-disable-next-line import-x/no-extraneous-dependencies -- electron-builder's own archive reader, loaded in its hook from its tree; `apps/desktop` declares electron-builder
  const asar = require('@electron/asar');
  return asar.listPackage(asarPath, { isPack: false }).map((e) => String(e).replace(/\\/g, '/').replace(/^\//, ''));
}

/** Rule 4: one process, started from the packaged tree under the Electron binary that tree carries. */
function runProbe(exe, appOutDir) {
  const probe = path.join(__dirname, 'native-load-probe.cjs');
  const r = spawnSync(exe, [probe, appOutDir], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 90_000, windowsHide: true });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('PROBE '));
  const report = line ? JSON.parse(line.slice('PROBE '.length)) : null;
  return { status: r.status, signal: r.signal, error: r.error ? String(r.error) : null, stderr: (r.stderr || '').slice(0, 4000), stdout: line ? undefined : (r.stdout || '').slice(0, 4000), report };
}

function checkRule4(probe, rule1a, unpackedRoot, marker) {
  if (!probe.report) throw new Error(`rule 4: the probe produced no report (exit ${probe.status}, signal ${probe.signal}, ${probe.error ?? ''})\n${probe.stderr}\n${probe.stdout ?? ''}`);
  const rep = probe.report;
  if (rep.versions.electron !== marker.electronVersion) throw new Error(`rule 4: the probe ran under Electron ${rep.versions.electron}, the build pins ${marker.electronVersion}`);
  if (!rep.ok) throw new Error(`rule 4: a binding did not load or did not work under the packaged Electron:\n${rep.errors.join('\n')}`);
  // Electron hands dlopen the extended-length spelling of an unpacked path; the comparison ignores the prefix.
  const norm = (p) => path.resolve(String(p).replace(/^\\\\\?\\/, '')).toLowerCase();
  const expected = new Map();
  for (const b of rule1a) for (const f of b.files) expected.set(norm(f.packaged), f);
  const opened = rep.dlopen.map((p) => ({ path: p, expected: expected.get(norm(p)) ?? null }));
  const stray = opened.filter((o) => o.expected === null);
  if (stray.length > 0) throw new Error(`rule 4: the loader opened a file that is not the compiled binary the artifact carries:\n${stray.map((s) => `  ${s.path}`).join('\n')}\n(expected only: ${[...expected.keys()].join(', ')})`);
  for (const b of rule1a) {
    const needed = b.files.map((f) => norm(f.packaged));
    const seen = opened.map((o) => norm(o.path));
    const loaded = needed.filter((n) => seen.includes(n));
    if (loaded.length === 0) throw new Error(`rule 4 (${b.name}): the probe loaded none of ${needed.join(', ')} — the binding's loader resolved somewhere else or nothing at all`);
    b.loaded = loaded;
  }
  if (!rep.dlopen.every((p) => norm(p).includes(norm(unpackedRoot)))) throw new Error(`rule 3/4: a binding loaded from outside ${unpackedRoot}: ${rep.dlopen.join(', ')}`);
  return { versions: rep.versions, sqlite: rep.sqlite, journal: rep.journal, pty: rep.pty, dlopen: rep.dlopen };
}

/** `scripts/lib/artifact-names.mjs` — the names the declared version renders, and the declared version itself. */
async function artifactNames() {
  return import(pathToFileURL(path.join(__dirname, 'lib', 'artifact-names.mjs')).href);
}

/**
 * REQ-STARTUP-031 / REQ-STARTUP-158: every installer name electron-builder is configured to produce equals the name the
 * DECLARED version renders through the naming module, composed nowhere else. `declared` is the manifest's own text
 * (`0.1.0rc1`), never electron-builder's `appInfo.version`, which is that text normalised through loose SemVer
 * (`0.1.0-rc1`): comparing against the normalised value made both sides equally wrong and let a hyphenated prerelease
 * name through (`docs/archive/defects/a-prerelease-version-reaches-the-installer-hyphenated.md`). `renderedNames` are the
 * names as electron-builder will produce them — one per configured `artifactName`, its macros expanded by electron-builder
 * itself (`configuredArtifactNames`). No configured name at all is refused too: `pnpm package` supplies them, and a bare
 * `electron-builder --win` would fall back to electron-builder's own pattern.
 */
async function checkNaming(declared, renderedNames) {
  const { packagingArtifactNames } = await artifactNames();
  const expected = packagingArtifactNames(declared).setup;
  if (renderedNames.length === 0) throw new Error(`REQ-STARTUP-031: no artifactName is configured, so electron-builder would name the installer by its own pattern rather than "${expected}"; pnpm package (scripts/package.mjs) supplies the names from the declared version`);
  for (const rendered of renderedNames) {
    if (rendered !== expected) throw new Error(`REQ-STARTUP-031: electron-builder is configured to produce "${rendered}", the naming module renders "${expected}" from the declared version ${declared}${/-(?:a|b|rc)\d/.test(rendered) ? ' (the version reached electron-builder hyphenated: its \${version} macro is the normalised value, not the declared text)' : ''}`);
  }
  return { declared, expected, rendered: renderedNames };
}

/**
 * The installer names electron-builder will produce from the configuration it is running with — every configured
 * `artifactName` this target reads (`nsis`, then `win`), expanded by electron-builder's own macro expander with the
 * values it will use, so a `${version}` template renders to the normalised version exactly as the artifact would be named.
 */
function configuredArtifactNames(ctx) {
  const config = ctx.packager.config;
  const patterns = [config.win && config.win.artifactName, config.nsis && config.nsis.artifactName].filter((p) => typeof p === 'string' && p !== '');
  return patterns.map((pattern) => ctx.packager.expandMacro(pattern, 'x64', { ext: 'exe' }));
}

/**
 * electron-builder: called for each file an artifact build produced, before the build ends. The file's name is compared
 * against the declared version's name — the installer exactly, or its block map — so a name composed anywhere but the
 * authority refuses the build after the fact as well as before it (REQ-STARTUP-031, REQ-STARTUP-152).
 */
async function artifactBuildCompleted(ctx) {
  const { declaredProductVersion, packagingArtifactNames, producedNameProblem } = await artifactNames();
  const names = packagingArtifactNames(declaredProductVersion(APP_DIR));
  const problem = producedNameProblem(path.basename(ctx.file), names);
  if (problem !== null) {
    console.error(`[ic6] BUILD REFUSED — ${problem}`);
    throw new Error(problem);
  }
  console.log(`[ic6] naming: produced ${path.basename(ctx.file)}, the declared version's name`);
}

/** The PE/COFF machine values a Windows artifact's interpreter can carry, by the `process.arch` name electron-builder uses. */
const PE_MACHINES = { 0x8664: 'x64', 0xaa64: 'arm64', 0x014c: 'ia32' };

/**
 * OQ-400 (ruled 2026-10-15 under R-072): the architecture a PE image is built for, read from its bytes and never by
 * running it — the `MZ` stub, the PE header's offset `e_lfanew` at 0x3C, the `PE\0\0` signature there, then the COFF
 * header's machine field (u16, little-endian). Throws on a file that is no PE image or is cut short of its machine field.
 * Pure: the caller reads the file.
 */
function peArchOf(bytes) {
  if (bytes.length < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error('not a PE image (no MZ stub)');
  if (bytes.length < 0x40) throw new Error(`truncated: ${bytes.length} bytes, short of the DOS header's e_lfanew at 0x3C`);
  const at = bytes.readUInt32LE(0x3c);
  if (at + 6 > bytes.length) throw new Error(`truncated: e_lfanew points at 0x${at.toString(16)}, past the file's ${bytes.length} bytes`);
  if (bytes.readUInt32BE(at) !== 0x50450000) throw new Error(`not a PE image (no "PE\\0\\0" signature at e_lfanew 0x${at.toString(16)})`);
  const machine = bytes.readUInt16LE(at + 4);
  return { machine, arch: PE_MACHINES[machine] || `machine 0x${machine.toString(16).padStart(4, '0')}` };
}

/**
 * ADR-0035 / ADR-0054 (Part T): the bundled code-intelligence runtime is in the artifact and ANSWERS from inside it — the
 * interpreter under win-unpacked/resources/code-intelligence/runtime reports its version and the distribution's, both equal
 * to the committed pins. Evidence about the artifact (ADR-0056's discipline), not about the bundle step's exit status.
 *
 * OQ-400 (2026-10-15): first, before anything runs, the interpreter must be built for the artifact's architecture — its
 * PE machine field equal to `arch` — and the bundle's marker must say it was built for that architecture. An arm64
 * interpreter answers its versions correctly on an ARM64 build host, so the spawn below could never catch it there
 * (`docs/archive/defects/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`). `spawn` is
 * `spawnSync` but in the tests.
 */
function checkRuntime(appOutDir, arch, spawn = spawnSync) {
  const pins = JSON.parse(readFileSync(path.join(APP_DIR, 'scripts', 'code-intelligence', 'pins.json'), 'utf8'));
  const root = path.join(appOutDir, 'resources', 'code-intelligence');
  const python = path.join(root, 'runtime', 'python.exe');
  if (!existsSync(python)) throw new Error(`runtime: no interpreter at ${python} — extraResources did not carry the bundle`);
  let pe;
  try { pe = peArchOf(readFileSync(python)); } catch (e) { throw new Error(`runtime: ${python} is no interpreter this artifact can run: ${e.message}`); }
  if (pe.arch !== arch) throw new Error(`runtime: the packaged interpreter is built for ${pe.arch}, the artifact for ${arch}`);
  const marker = JSON.parse(readFileSync(path.join(root, 'bundle.json'), 'utf8'));
  if (marker.targetArch !== arch) {
    throw new Error(typeof marker.targetArch === 'string'
      ? `runtime: bundle.json says the bundle was built for ${marker.targetArch}, the artifact is ${arch}`
      : `runtime: bundle.json says the bundle was built for no recorded architecture, the artifact is ${arch} — a bundle from before OQ-400; rebuild it with pnpm code-intel:bundle --target=win32-${arch}`);
  }
  if (marker.version !== pins.version || marker.python !== pins.python) throw new Error(`runtime: the artifact's bundle.json pins ${marker.distribution} ${marker.version} on Python ${marker.python}; pins.json says ${pins.version} on ${pins.python}`);
  const r = spawn(python, ['-I', '-c', 'import importlib.metadata as m, sys, json; print(json.dumps({"python": sys.version.split()[0], "version": m.version("serena-agent"), "distribution": "serena-agent"}))'], { encoding: 'utf8', windowsHide: true, timeout: 60_000, env: { PYTHONUTF8: '1', SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows' } });
  if (r.status !== 0) throw new Error(`runtime: the packaged interpreter did not answer (exit ${r.status ?? r.signal}): ${(r.stderr || '').slice(-400)}`);
  const answers = JSON.parse(r.stdout.trim());
  if (answers.python !== pins.python) throw new Error(`runtime: the packaged interpreter answers Python ${answers.python}, the pin is ${pins.python}`);
  if (answers.version !== pins.version) throw new Error(`runtime: the packaged tree answers ${pins.distribution} ${answers.version}, the pin is ${pins.version}`);
  let bytes = 0, files = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { bytes += statSync(p).size; files += 1; } } };
  walk(root);
  // The tool server's licence file is no longer carried here (REQ-STARTUP-015, the "assets" rule below counts its copies).
  return { python, machine: pe.arch, answers, bytes, files };
}

/**
 * first-release-plan.md §4.4 — the "assets" rule: `build-id.txt` (REQ-SHELL-140) and `THIRD-PARTY-LICENSES.txt`
 * (REQ-STARTUP-141) at the root of the artifact's resources, each byte-identical to the file its step wrote before
 * freezing, the identifier naming the tree being packed; the notices file absent only when
 * ROTARIS_PACKAGE_WITHOUT_NOTICES=1 asked for a development package, and never on a build for a tag; and the tool
 * server's licence text once, in the notices file, never under its dist-info as well (REQ-STARTUP-015). The rules are
 * `scripts/lib/about-assets.mjs`'s, which the tests drive through electron-builder's own copier and this yml.
 */
async function checkAssets(appOutDir) {
  const { ABOUT_ASSETS, aboutAssetProblems } = await import(pathToFileURL(path.join(__dirname, 'lib', 'about-assets.mjs')).href);
  const { identifyBuild } = await import(pathToFileURL(path.join(REPO_DIR, 'tools', 'build-id', 'build-id.mjs')).href);
  const resourcesDir = path.join(appOutDir, 'resources');
  const marker = JSON.parse(readFileSync(path.join(APP_DIR, 'resources', 'code-intelligence', 'bundle.json'), 'utf8'));
  const toolServerLicense = typeof marker.licenseFile === 'string' && marker.licenseFile !== '' ? marker.licenseFile : null;
  const build = identifyBuild({ root: REPO_DIR });
  const problems = aboutAssetProblems({ resourcesDir, sourceDir: path.join(APP_DIR, 'resources'), env: process.env, toolServerLicense, build });
  if (problems.length > 0) throw new Error(`assets: ${problems.join('; ')}`);
  return {
    buildId: readFileSync(path.join(resourcesDir, ABOUT_ASSETS.buildId), 'utf8').trim(),
    notices: existsSync(path.join(resourcesDir, ABOUT_ASSETS.notices)) ? 'carried' : 'absent',
    toolServerLicense,
  };
}

/** electron-builder: called after the app is packed into appOutDir and before the artifact is made. */
async function afterPack(ctx) {
  const platform = platformOf(ctx);
  const arch = typeof ctx.arch === 'string' ? ctx.arch : ARCH_NAMES[ctx.arch];
  const marker = JSON.parse(readFileSync(MARKER, 'utf8'));
  const appOutDir = ctx.appOutDir;
  const unpackedRoot = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');
  const asarPath = path.join(appOutDir, 'resources', 'app.asar');
  const exe = path.join(appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const report = { at: new Date().toISOString(), appOutDir, marker, counterfactual: marker.counterfactual, rule1a: [], rule4: null, naming: null, failed: null };
  const fail = (e) => {
    report.failed = String(e && e.message ? e.message : e);
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.error(`[ic6] BUILD REFUSED — ${report.failed}`);
    throw e;
  };
  try {
    const asarEntries = listAsar(asarPath);
    report.asarEntries = asarEntries.length;
    for (const b of BINDINGS) report.rule1a.push(checkRule1a(b, platform, arch, marker, unpackedRoot, asarEntries));
    console.log(`[ic6] rule 1a: ${report.rule1a.map((b) => `${b.name} ${b.files.map((f) => `${path.basename(f.rel)} ${f.size} B`).join(', ')}`).join('; ')} — all newer than the marker, byte-identical in the artifact, no prebuild`);
    const { declaredProductVersion } = await artifactNames();
    report.naming = { normalised: ctx.packager.appInfo.version, ...(await checkNaming(declaredProductVersion(APP_DIR), configuredArtifactNames(ctx))) };
    console.log(`[ic6] naming: declared ${report.naming.declared}, electron-builder's normalised ${report.naming.normalised}; configured to produce ${report.naming.rendered.join(', ')}`);
    report.runtime = checkRuntime(appOutDir, arch);
    console.log(`[ic6] runtime: ${report.runtime.python} (PE machine ${report.runtime.machine}, the artifact's) answered Python ${report.runtime.answers.python}, ${report.runtime.answers.distribution} ${report.runtime.answers.version} from inside the artifact (${report.runtime.files} files, ${(report.runtime.bytes / 1048576).toFixed(1)} MiB)`);
    report.assets = await checkAssets(appOutDir);
    console.log(`[ic6] assets: build-id.txt ${report.assets.buildId}; THIRD-PARTY-LICENSES.txt ${report.assets.notices}; the tool server's licence text ${report.assets.notices === 'carried' ? 'once, in the notices file' : 'not carried (a development package)'}`);
    const probe = runProbe(exe, appOutDir);
    report.probe = { status: probe.status, stderr: probe.stderr };
    report.rule4 = checkRule4(probe, report.rule1a, unpackedRoot, marker);
    console.log(`[ic6] rule 4: Electron ${report.rule4.versions.electron} (node ${report.rule4.versions.node}, modules ${report.rule4.versions.modules}) loaded ${report.rule4.dlopen.length} file(s) from app.asar.unpacked; SQLite ${report.rule4.sqlite}, journal ${report.rule4.journal}; pty exit ${report.rule4.pty && report.rule4.pty.exitCode}`);
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
  } catch (e) {
    fail(e);
  }
}

/**
 * R-091 — the fuses (Electron security checklist 19; the Electron documentation's `tutorial/fuses`; ADR-0054, ADR-0056
 * rule 4: evidence about the artifact, never about the command). Each is a byte of the fuse wire @electron/fuses reads out
 * of Rotaris.exe: `0` (48) disabled, `1` (49) enabled. electron-builder.yml's `electronFuses` names the six it flips, and
 * this list is what the binary must then read — those six, and the two left at Electron's own value on purpose:
 * `grantFileProtocolExtraPrivileges` stays enabled (OQ-466's ruling: the renderer is a `file:` page) and
 * `loadBrowserProcessSpecificV8Snapshot` stays disabled. A wire position past this list (Electron 44.3.0's wire is nine
 * long, @electron/fuses 1.8.0 names eight) is reported, never judged. `index` is @electron/fuses' `FuseV1Options` value.
 *
 * The run host and the workspace service are `utilityProcess` children, which the fuses page says need no RunAsNode; the
 * code-intelligence server starts Rotaris.exe as the application (`main/sentinel.ts`, `builtin:code-intelligence`); and
 * afterPack's rule 4 probe, the one launch that runs the packaged binary as Node, runs before electron-builder flips them.
 */
const FUSE_ENABLE = 49;
const FUSE_DISABLE = 48;
const FUSES = Object.freeze([
  { index: 0, name: 'runAsNode', expected: false, flipped: true },
  { index: 1, name: 'enableCookieEncryption', expected: true, flipped: true },
  { index: 2, name: 'enableNodeOptionsEnvironmentVariable', expected: false, flipped: true },
  { index: 3, name: 'enableNodeCliInspectArguments', expected: false, flipped: true },
  { index: 4, name: 'enableEmbeddedAsarIntegrityValidation', expected: true, flipped: true },
  { index: 5, name: 'onlyLoadAppFromAsar', expected: true, flipped: true },
  { index: 6, name: 'loadBrowserProcessSpecificV8Snapshot', expected: false, flipped: false },
  { index: 7, name: 'grantFileProtocolExtraPrivileges', expected: true, flipped: false },
]);

/** The map electron-builder.yml's `electronFuses` must hold: the flipped fuses alone, by electron-builder's key names. */
function fuseConfiguration() {
  return Object.fromEntries(FUSES.filter((f) => f.flipped).map((f) => [f.name, f.expected]));
}

/** A wire byte as a word: `on`, `off`, or what else it is (`removed`, `inherit`, a byte nobody named). Pure. */
function fuseWord(state) {
  if (state === FUSE_ENABLE) return 'on';
  if (state === FUSE_DISABLE) return 'off';
  if (state === 114) return 'removed';
  if (state === 144) return 'inherit';
  return state === undefined ? 'absent' : `byte ${state}`;
}

/**
 * What differs between a fuse wire, as @electron/fuses' `getCurrentFuseWire` returns it (`{ version, 0: 49, 1: 48, … }`),
 * and `FUSES`: one sentence per fuse that reads otherwise, `[]` when every one reads as listed. Pure.
 */
function fuseProblems(wire) {
  if (wire === null || typeof wire !== 'object') return ['the binary carries no fuse wire'];
  if (String(wire.version) !== '1') return [`the fuse wire is version ${String(wire.version)}, not the 1 this list is written for`];
  const problems = [];
  for (const f of FUSES) {
    const read = wire[f.index];
    if (read !== (f.expected ? FUSE_ENABLE : FUSE_DISABLE)) problems.push(`${f.name} reads ${fuseWord(read)}, ${f.flipped ? 'flipped' : 'left'} ${f.expected ? 'on' : 'off'}`);
  }
  return problems;
}

/** The wire read out of `exe`, every fuse by name and every position past the list by its index. */
function describeWire(wire) {
  const named = Object.fromEntries(FUSES.map((f) => [f.name, fuseWord(wire[f.index])]));
  const rest = Object.keys(wire).filter((k) => /^\d+$/.test(k) && Number(k) >= FUSES.length).map((k) => [`fuse ${k}`, fuseWord(wire[k])]);
  return { version: String(wire.version), ...named, ...Object.fromEntries(rest) };
}

/** Read the fuse wire out of the packed executable and refuse any fuse that is not as listed. `read` is @electron/fuses' but in the tests. */
async function checkFuses(exe, read) {
  if (!existsSync(exe)) throw new Error(`fuses: no packed executable at ${exe}`);
  const wire = await (read ?? require('@electron/fuses').getCurrentFuseWire)(exe);
  const problems = fuseProblems(wire);
  if (problems.length > 0) throw new Error(`fuses: ${exe} — ${problems.join('; ')} (electron-builder.yml's electronFuses; R-091, checklist 19)`);
  return { exe, wire: describeWire(wire) };
}

/** The directory electron-builder packs a Windows architecture into: `win-unpacked` for x64, `win-<arch>-unpacked` otherwise. */
function unpackedDirFor(arch) {
  const name = typeof arch === 'string' ? arch : ARCH_NAMES[arch];
  return name === 'x64' || name === undefined ? 'win-unpacked' : `win-${name}-unpacked`;
}

/**
 * electron-builder: called as a target starts making its artifact out of the packed tree — after the fuses are flipped
 * (`doAddElectronFuses` follows afterPack) — so a binary whose fuses do not read as listed never becomes an installer.
 * The result joins afterPack's report.
 */
async function artifactBuildStarted(ctx) {
  const exe = path.join(path.dirname(ctx.file), unpackedDirFor(ctx.arch), 'Rotaris.exe');
  let fuses;
  try {
    fuses = await checkFuses(exe);
  } catch (e) {
    console.error(`[ic6] BUILD REFUSED — ${e.message}`);
    throw e;
  }
  console.log(`[ic6] fuses: ${Object.entries(fuses.wire).filter(([k]) => k !== 'version').map(([k, v]) => `${k} ${v}`).join(', ')} — read back from ${exe}`);
  if (existsSync(REPORT)) {
    const report = JSON.parse(readFileSync(REPORT, 'utf8'));
    report.fuses = { ...fuses, target: ctx.targetPresentableName };
    writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
}

module.exports = { beforeBuild, afterPack, artifactBuildStarted, artifactBuildCompleted, FUSES, fuseConfiguration, fuseProblems, checkFuses, unpackedDirFor, peArchOf, checkRuntime, BINDINGS, checkRule1a, checkRule4, checkNaming, configuredArtifactNames, checkAssets, MARKER, REPORT };
