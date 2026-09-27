// @ts-check
// The notices generator (REQ-STARTUP-141/142/143; ADR-0054; first-release-plan.md §4.3). It computes the shipped
// closure of a build OFFLINE — from the installed workspace, the bundled code-intelligence runtime's own metadata and
// the version-controlled tables beside this file — validates it, and renders `THIRD-PARTY-LICENSES.txt`.
//
// Plain JavaScript on purpose, like `tools/symbol-artifact/`: its callers are `pnpm notices` and the release job,
// neither of which compiles TypeScript. The contract is declared in `notices.d.mts` for the tests beside it.
//
// Every function here takes the repository root it reads, so the tests run it over a fixture tree; nothing reads
// the clock (the date that decides a reviewed exception's expiry is a parameter) and nothing reads the platform
// (the target platform is a parameter), so two runs over the same inputs render byte-identical text.
//
// Readings this file builds under, each recorded where a ruling can replace it:
//  - OQ-66: the closure's granularity is what a package manager enumerates. Electron is one component whose own
//    credits (LICENSES.chromium.html) are reproduced beneath it; two libraries this build compiles into its native
//    modules from vendored sources, and whose licence files the packager strips, are listed as components of their own.
//  - OQ-67: this build's setup manifest carries the code-intelligence runtime's language servers and no machine tools,
//    so the tools section says it provisions no machine tools; Manrope, which REQ-STARTUP-142 names and no build
//    carries yet, has its licence reproduced and its entry says it is not contained.
//  - OQ-68: a component that carries licence text but declares no licence identifier fails validation outright; the
//    reviewed-exceptions table covers a component with no licence text only, as REQ-STARTUP-143 words it.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';

/** REQ-STARTUP-141: the file's name, inside every standalone artifact and opened by the About & Legal surface. */
export const NOTICES_FILE = 'THIRD-PARTY-LICENSES.txt';
/** REQ-STARTUP-142: the section's title, verbatim. */
export const TOOLS_SECTION = 'Tools provisioned after installation';
/** REQ-STARTUP-143: the longest a reviewed exception may stand. */
export const MAX_EXCEPTION_DAYS = 365;

/** Every input and the output, relative to the repository root. One place, so the records can cite them. */
export const PATHS = Object.freeze({
  desktop: 'apps/desktop/package.json',
  output: `apps/desktop/resources/${NOTICES_FILE}`,
  runtime: 'apps/desktop/resources/code-intelligence/runtime',
  bundleMarker: 'apps/desktop/resources/code-intelligence/bundle.json',
  setupManifest: 'apps/desktop/scripts/code-intelligence/pins.json',
  fontFaces: 'packages/ui/src/fonts.css',
  designAssets: 'docs/design/assets',
  electron: 'node_modules/electron',
  assets: 'tools/notices/bundled-assets.json',
  exceptions: 'tools/notices/reviewed-exceptions.json',
  releaseInputs: 'tools/notices/release-inputs.json',
});

/** The workspace globs of `pnpm-workspace.yaml`: every package under them is the product's own (REQ-STARTUP-142). */
const WORKSPACE_DIRS = ['packages', 'apps', 'tools'];
/** A file that carries a component's licence text, by the names the ecosystems use for one. */
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([.\-_].*)?$/i;
/** Values that declare nothing: setuptools' default and npm's pointer to a file. */
const NO_IDENTIFIER = /^(unknown|none|)$|^see licen[cs]e in /i;

// ---- small readers ---------------------------------------------------------------------------------------------

/** Line endings and a byte-order mark are the only things a licence text loses on its way into the file. */
function normalize(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
}

/** Code-point order, so the output does not depend on the machine's locale. */
function byText(a, b) {
  const x = a.toLowerCase(), y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Dotted versions compared segment by segment, numerically where both segments are numbers. Used for sorting and
 * for a reviewed exception's range; a pre-release or local suffix compares as text, which is deterministic but not
 * semver's precedence — an exception names such a version exactly.
 */
export function compareVersions(a, b) {
  const x = String(a).split(/[.+]/), y = String(b).split(/[.+]/);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? '0', q = y[i] ?? '0';
    if (p === q) continue;
    if (/^\d+$/.test(p) && /^\d+$/.test(q)) return Number(p) < Number(q) ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** REQ-STARTUP-143 "the version or version range it covers": an exact version, or space-separated comparators. */
export function versionInRange(version, range) {
  const parts = String(range).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(part);
    if (!m) return false;
    const c = compareVersions(version, m[2]);
    switch (m[1] ?? '=') {
      case '>=': return c >= 0;
      case '<=': return c <= 0;
      case '>': return c > 0;
      case '<': return c < 0;
      default: return c === 0;
    }
  });
}

/** Read and parse a JSON input, or record why not and answer null. */
function readJson(root, rel, problems, what) {
  const path = join(root, rel);
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { problems.push(`${what} ${rel} cannot be read: ${codeOf(e)}`); return null; }
  try { return JSON.parse(text); } catch (e) { problems.push(`${what} ${rel} cannot be parsed: ${e instanceof Error ? e.message : String(e)}`); return null; }
}

function codeOf(e) {
  return e && typeof e === 'object' && 'code' in e ? String(e.code) : e instanceof Error ? e.message : String(e);
}

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/** The licence texts of one directory's own licence files, sorted by name; an empty one is kept, and the caller decides what it means. */
function licenseFilesOf(dir, relTo) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => LICENSE_FILE.test(n) && isFile(join(dir, n))).sort(byText)
    .map((n) => ({ file: relative(relTo, join(dir, n)).split('\\').join('/'), text: normalize(readFileSync(join(dir, n), 'utf8')) }));
}

// ---- the JavaScript closure (npm) -----------------------------------------------------------------------------

/** The product's own packages: every `package.json` under the workspace globs, and the root's. */
export function workspacePackages(root) {
  /** @type {Map<string, {dir: string, pkg: any}>} */
  const out = new Map();
  if (isFile(join(root, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof pkg.name === 'string') out.set(pkg.name, { dir: root, pkg });
  }
  for (const group of WORKSPACE_DIRS) {
    let dirs = [];
    try { dirs = readdirSync(join(root, group)); } catch { continue; }
    for (const d of dirs.sort(byText)) {
      const file = join(root, group, d, 'package.json');
      if (!isFile(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      out.set(pkg.name, { dir: join(root, group, d), pkg });
    }
  }
  return out;
}

/** Node's own resolution over the installed tree: the nearest `node_modules/<name>` walking up to the root. */
function resolveInstalled(name, fromDir, root) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (isFile(join(candidate, 'package.json'))) return candidate;
    if (dir === root) return null;
    const up = join(dir, '..');
    if (up === dir || relative(root, up).startsWith('..')) return null;
    dir = up;
  }
}

/** npm's `license` field, or the legacy `licenses` array; null when it declares nothing an identifier can be read from. */
export function npmLicenseOf(pkg) {
  let value = pkg.license;
  if (value && typeof value === 'object') value = value.type;
  if (!value && Array.isArray(pkg.licenses)) value = pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean).join(' OR ');
  if (typeof value !== 'string' || NO_IDENTIFIER.test(value.trim())) return null;
  return value.trim();
}

/**
 * The dependencies present in the shipped artifact on the JavaScript side (REQ-STARTUP-142). The roots are the
 * desktop application's production `dependencies` — what the packager copies into the archive — and the production
 * `dependencies` of every workspace package the application builds from, which the bundler inlines. Development
 * dependencies are never followed, and a workspace package is traversed but never listed. `electron` is the runtime
 * the artifact is built around: it is listed by `electronComponent`, and its npm dependencies (the downloader) are
 * not shipped.
 */
export function javascriptClosure(root, problems) {
  const workspace = workspacePackages(root);
  const desktop = [...workspace.values()].find((w) => relative(root, join(w.dir, 'package.json')).split('\\').join('/') === PATHS.desktop);
  if (!desktop) { problems.push(`the desktop application's manifest ${PATHS.desktop} cannot be read`); return []; }
  /** @type {Map<string, any>} */
  const seen = new Map();
  const visitedWorkspace = new Set();

  const visit = (name, fromDir, requiredBy, optional) => {
    if (name === 'electron') return;
    const dir = resolveInstalled(name, fromDir, root);
    if (!dir) {
      if (!optional) problems.push(`${name}, a dependency of ${requiredBy}, is not installed — the closure is read from the installed workspace (pnpm install)`);
      return;
    }
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (workspace.has(pkg.name)) return;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) return;
    seen.set(key, {
      section: 'application', ecosystem: 'npm', name: pkg.name, version: String(pkg.version),
      license: npmLicenseOf(pkg), texts: licenseFilesOf(dir, dir), dir,
    });
    const peers = Object.keys(pkg.peerDependencies ?? {}).filter((p) => pkg.peerDependenciesMeta?.[p]?.optional !== true);
    for (const dep of Object.keys(pkg.dependencies ?? {}).sort(byText)) visit(dep, dir, key, false);
    for (const dep of Object.keys(pkg.optionalDependencies ?? {}).sort(byText)) visit(dep, dir, key, true);
    for (const dep of peers.sort(byText)) visit(dep, dir, key, false);
  };
  const visitWorkspace = (name) => {
    if (visitedWorkspace.has(name)) return;
    visitedWorkspace.add(name);
    const w = workspace.get(name);
    if (!w) { problems.push(`workspace package ${name} is named by the desktop application and is not in the workspace`); return; }
    for (const [dep, spec] of Object.entries(w.pkg.dependencies ?? {}).sort(([a], [b]) => byText(a, b))) {
      if (String(spec).startsWith('workspace:')) visitWorkspace(dep);
      else visit(dep, w.dir, name, false);
    }
  };

  for (const dep of Object.keys(desktop.pkg.dependencies ?? {}).sort(byText)) {
    if (String(desktop.pkg.dependencies[dep]).startsWith('workspace:')) visitWorkspace(dep);
    else visit(dep, desktop.dir, desktop.pkg.name, false);
  }
  for (const [dep, spec] of Object.entries(desktop.pkg.devDependencies ?? {}).sort(([a], [b]) => byText(a, b))) {
    if (String(spec).startsWith('workspace:')) visitWorkspace(dep);
  }
  return [...seen.values()];
}

// ---- Electron and the components compiled into it -------------------------------------------------------------

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00A0' };
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') return String.fromCodePoint(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1)));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Electron's credits file — one `div.product` per component compiled into the runtime — as plain entries. */
export function parseChromiumCredits(html) {
  const out = [];
  const product = /<div class="product">([\s\S]*?)<div class="license">\s*<pre>([\s\S]*?)<\/pre>/g;
  for (let m = product.exec(html); m !== null; m = product.exec(html)) {
    const title = /<span class="title">([\s\S]*?)<\/span>/.exec(m[1]);
    const homepage = /<span class="homepage"><a href="([^"]*)"/.exec(m[1]);
    out.push({
      title: decodeEntities((title?.[1] ?? '').trim()),
      homepage: homepage ? decodeEntities(homepage[1]) : null,
      text: normalize(decodeEntities(m[2])),
    });
  }
  return out;
}

/** The runtime the artifact is built around (ADR-0054): one component, and its own credits beneath it (OQ-66). */
export function electronComponent(root, problems) {
  const dir = join(root, PATHS.electron);
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch (e) { problems.push(`electron is not installed at ${PATHS.electron} (${codeOf(e)})`); return null; }
  const version = String(pkg.version);
  const dist = join(dir, 'dist');
  try {
    const shipped = readFileSync(join(dist, 'version'), 'utf8').trim();
    if (shipped !== version) problems.push(`electron ${version}: the installed runtime under ${PATHS.electron}/dist is ${shipped} — reinstall it (node node_modules/electron/install.js)`);
  } catch { problems.push(`electron ${version}: the runtime is not installed under ${PATHS.electron}/dist (node node_modules/electron/install.js)`); }
  const texts = [];
  const licensePath = `${PATHS.electron}/dist/LICENSE`;
  try {
    const text = normalize(readFileSync(join(dist, 'LICENSE'), 'utf8'));
    if (text === '') problems.push(`electron ${version}: license file ${licensePath} is empty`);
    texts.push({ file: 'LICENSE', text });
  } catch { problems.push(`electron ${version}: license file ${licensePath} is missing`); }
  const creditsPath = `${PATHS.electron}/dist/LICENSES.chromium.html`;
  let credits = [];
  try {
    const html = readFileSync(join(dist, 'LICENSES.chromium.html'), 'utf8');
    credits = parseChromiumCredits(html);
    const declared = (html.match(/<div class="product">/g) ?? []).length;
    if (credits.length === 0 || credits.length !== declared) problems.push(`electron ${version}: ${creditsPath} declares ${declared} components and ${credits.length} could be read — the credits format changed`);
    for (const c of credits) if (c.text === '') problems.push(`${c.title} (compiled into electron ${version}): its license text in ${creditsPath} is empty`);
  } catch { problems.push(`electron ${version}: license file ${creditsPath} is missing`); }
  return { section: 'application', ecosystem: 'npm', name: 'electron', version, license: npmLicenseOf(pkg), texts, credits, textRequired: true };
}

// ---- components compiled into a shipped native module ---------------------------------------------------------

/**
 * Two libraries this build compiles into its own native modules from sources the host package vendors (ADR-0056
 * rule 1), whose licence files `electron-builder.yml` excludes from the archive together with those sources — so
 * the notices file is the one place they are acknowledged (OQ-66). Each is read from the installed host package.
 */
const COMPILED_IN = [
  {
    host: 'better-sqlite3', name: 'SQLite', platforms: null,
    version: { file: 'deps/sqlite3/sqlite3.c', pattern: /#define SQLITE_VERSION\s+"([^"]+)"/ },
    // The amalgamation carries its dedication in every constituent file's header; the first is the text.
    text: { file: 'deps/sqlite3/sqlite3.c', pattern: /\*\* (The author disclaims copyright to this source code\.[\s\S]*?never taking more than you give\.)/ },
    identifier: (text) => (/The author disclaims copyright to this source code/.test(text) ? 'blessing' : null),
  },
  {
    host: 'node-pty', name: 'winpty', platforms: ['win32'],
    version: { file: 'deps/winpty/VERSION.txt', pattern: /^\s*(\S+)/ },
    text: { file: 'deps/winpty/LICENSE', pattern: null },
    identifier: (text) => (/^The MIT License/.test(text) ? 'MIT' : null),
  },
];

export function compiledInComponents(root, closure, platform, problems) {
  const out = [];
  for (const spec of COMPILED_IN) {
    if (spec.platforms && !spec.platforms.includes(platform)) continue;
    const host = closure.find((c) => c.name === spec.host);
    if (!host) continue;
    const where = `${spec.name} (compiled into ${host.name} ${host.version})`;
    const read = (file) => { try { return readFileSync(join(host.dir, file), 'utf8'); } catch { return null; } };
    const versionSource = read(spec.version.file);
    const version = versionSource === null ? null : spec.version.pattern.exec(versionSource)?.[1] ?? null;
    if (version === null) problems.push(`${where}: its version cannot be read from ${relative(root, join(host.dir, spec.version.file)).split('\\').join('/')}`);
    const textSource = read(spec.text.file);
    const rel = relative(root, join(host.dir, spec.text.file)).split('\\').join('/');
    let text = null;
    if (textSource === null) problems.push(`${where}: license file ${rel} is missing`);
    else {
      const raw = spec.text.pattern ? spec.text.pattern.exec(textSource)?.[1].replace(/^\*\* ?/gm, '') ?? null : textSource;
      text = raw === null ? null : normalize(raw);
      if (!text) problems.push(`${where}: license file ${rel} is empty or no longer carries the text`);
    }
    out.push({
      section: 'application', ecosystem: 'compiled', name: spec.name, version: version ?? 'unknown', license: text ? spec.identifier(text) : null,
      texts: text ? [{ file: spec.text.file, text }] : [], containedIn: `${host.name} ${host.version}`, textRequired: true,
    });
  }
  return out;
}

// ---- the bundled code-intelligence runtime (Python) -----------------------------------------------------------

/** Core metadata's header block (RFC 822 style, continuation lines indented), every value of every field. */
export function parseCoreMetadata(text) {
  /** @type {Map<string, string[]>} */
  const fields = new Map();
  const head = normalize(text).split(/\n\n/)[0] ?? '';
  let last = null;
  for (const line of head.split('\n')) {
    if (/^[ \t]/.test(line) && last) { const values = fields.get(last) ?? []; values[values.length - 1] += `\n${line.trim()}`; continue; }
    const m = /^([A-Za-z0-9-]+):\s?(.*)$/.exec(line);
    if (!m) continue;
    last = m[1].toLowerCase();
    fields.set(last, [...(fields.get(last) ?? []), m[2]]);
  }
  return fields;
}

/**
 * The licence identifier a distribution declares, most specific first: its `License-Expression` (PEP 639), a
 * one-line `License` field, its licence classifiers, the first line of a `License` field that holds a whole text.
 * `UNKNOWN` — setuptools' default when the author wrote nothing — declares nothing (OQ-68).
 */
export function pythonLicenseOf(fields) {
  const expression = fields.get('license-expression')?.[0]?.trim();
  if (expression) return expression;
  const license = fields.get('license')?.[0]?.trim() ?? '';
  const oneLine = license !== '' && !license.includes('\n');
  if (oneLine && !NO_IDENTIFIER.test(license)) return license;
  const classifiers = (fields.get('classifier') ?? []).filter((c) => c.startsWith('License ::')).map((c) => c.split('::').pop()?.trim() ?? '').filter(Boolean);
  if (classifiers.length > 0) return classifiers.join('; ');
  const firstLine = license.split('\n')[0]?.trim() ?? '';
  if (!oneLine && firstLine !== '' && firstLine.length <= 64 && !NO_IDENTIFIER.test(firstLine)) return firstLine;
  return null;
}

function sitePackagesOf(runtime) {
  const win = join(runtime, 'Lib', 'site-packages');
  if (existsSync(win)) return win;
  try {
    const py = readdirSync(join(runtime, 'lib')).find((e) => /^python3\.\d+$/.test(e));
    if (py && existsSync(join(runtime, 'lib', py, 'site-packages'))) return join(runtime, 'lib', py, 'site-packages');
  } catch { /* absent: answered as null below */ }
  return null;
}

/** A distribution's licence files: the ones its metadata declares, and every licence-named file its metadata directory holds. */
function distributionLicenseFiles(infoDir, fields) {
  const found = new Map();
  const add = (path) => { if (isFile(path)) found.set(relative(infoDir, path).split('\\').join('/'), path); };
  for (const declared of fields.get('license-file') ?? []) { add(join(infoDir, 'licenses', declared)); add(join(infoDir, declared)); }
  const walk = (dir, all) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, all || e.name === 'licenses');
      else if (all || LICENSE_FILE.test(e.name)) add(p);
    }
  };
  walk(infoDir, false);
  return [...found.keys()].sort(byText).map((file) => ({ file, text: normalize(readFileSync(/** @type {string} */ (found.get(file)), 'utf8')) }));
}

/**
 * The interpreter and every distribution installed in it (ADR-0035: `runtime/` is carried whole under
 * `extraResources`, so everything in it is in the shipped closure — the tool server's dependencies and the
 * installer the interpreter came with alike). Read from the tree `pnpm code-intel:bundle` built, never fetched.
 */
export function codeIntelligenceComponents(root, problems) {
  const runtime = join(root, PATHS.runtime);
  if (!existsSync(runtime)) {
    problems.push(`the bundled code-intelligence runtime is absent at ${PATHS.runtime} — its distributions are part of the shipped closure; run pnpm code-intel:bundle first`);
    return [];
  }
  const out = [];
  // The interpreter's own version, as it answered when the bundle was built (bundle.mjs's marker).
  const marker = readJson(root, PATHS.bundleMarker, problems, 'the bundle marker');
  const pyVersion = typeof marker?.answers?.python === 'string' ? marker.answers.python : null;
  if (marker && !pyVersion) problems.push(`the bundle marker ${PATHS.bundleMarker} carries no interpreter version (answers.python)`);
  const site = sitePackagesOf(runtime);
  const candidates = ['LICENSE.txt', ...(site ? [relative(runtime, join(site, '..', 'LICENSE.txt'))] : [])];
  const licenseRel = candidates.map((c) => c.split('\\').join('/')).find((c) => isFile(join(runtime, c)));
  const interpreter = { section: 'runtime', ecosystem: 'interpreter', name: 'CPython', version: pyVersion ?? 'unknown', license: /** @type {string | null} */ (null), texts: /** @type {{file: string, text: string}[]} */ ([]), textRequired: true };
  if (!licenseRel) problems.push(`CPython ${interpreter.version}: license file LICENSE.txt is missing from ${PATHS.runtime}`);
  else {
    const text = normalize(readFileSync(join(runtime, licenseRel), 'utf8'));
    if (text === '') problems.push(`CPython ${pyVersion}: license file ${PATHS.runtime}/${licenseRel} is empty`);
    interpreter.texts.push({ file: licenseRel, text });
    // The interpreter declares its licence in its own text, by name.
    interpreter.license = /PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2/.test(text) ? 'PSF-2.0' : null;
  }
  out.push(interpreter);
  if (!site) { problems.push(`the bundled code-intelligence runtime at ${PATHS.runtime} has no site-packages`); return out; }
  for (const entry of readdirSync(site).filter((n) => /\.(dist|egg)-info$/.test(n)).sort(byText)) {
    const infoDir = join(site, entry);
    const metaFile = ['METADATA', 'PKG-INFO'].map((f) => join(infoDir, f)).find(isFile);
    if (!metaFile) { problems.push(`${entry} (code-intelligence runtime): no METADATA to read its name, version and license from`); continue; }
    const fields = parseCoreMetadata(readFileSync(metaFile, 'utf8'));
    out.push({
      section: 'runtime', ecosystem: 'python', name: fields.get('name')?.[0]?.trim() ?? entry, version: fields.get('version')?.[0]?.trim() ?? 'unknown',
      license: pythonLicenseOf(fields), texts: distributionLicenseFiles(infoDir, fields),
    });
  }
  return out;
}

// ---- bundled fonts and icons -----------------------------------------------------------------------------------

/** WOFF2's known-table index (the specification's table of 63 tags); a font's `name` table is never transformed. */
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/**
 * A WOFF2 font's naming table, Windows Unicode English records only, by name id: 0 is the copyright notice, 5 the
 * version string, 13 the licence description. Read so a font's version and copyright come from the font itself.
 */
export function woff2Names(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 font');
  const numTables = buffer.readUInt16BE(12);
  const compressed = buffer.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) { const b = buffer[p++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; }
    throw new Error('malformed WOFF2 table directory');
  };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buffer[p++];
    let tag = WOFF2_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buffer.toString('latin1', p, p + 4); p += 4; }
    let length = base128();
    const transform = (flags >> 6) & 3;
    const transformed = tag === 'glyf' || tag === 'loca' ? transform !== 3 : transform !== 0;
    if (transformed) length = base128();
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(buffer.subarray(p, p + compressed));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === 'name') {
      const n = data.subarray(offset, offset + t.length);
      const count = n.readUInt16BE(2), strings = n.readUInt16BE(4);
      /** @type {Record<number, string>} */
      const names = {};
      for (let i = 0; i < count; i++) {
        const r = 6 + i * 12;
        if (n.readUInt16BE(r) !== 3 || n.readUInt16BE(r + 2) !== 1 || n.readUInt16BE(r + 4) !== 0x409) continue;
        const s = n.subarray(strings + n.readUInt16BE(r + 10), strings + n.readUInt16BE(r + 10) + n.readUInt16BE(r + 8));
        let text = '';
        for (let j = 0; j + 1 < s.length; j += 2) text += String.fromCharCode(s.readUInt16BE(j));
        names[n.readUInt16BE(r + 6)] = text;
      }
      return names;
    }
    offset += t.length;
  }
  throw new Error('the font has no name table');
}

/** The `@design-assets` alias of `electron.vite.config.ts`, and the font files `fonts.css` bundles through it. */
export function declaredFontFiles(css) {
  const out = new Set();
  for (const m of css.matchAll(/url\(\s*['"]?@design-assets\/([^'")]+)['"]?\s*\)/g)) out.add(`${PATHS.designAssets}/${m[1]}`);
  return [...out].sort(byText);
}

/**
 * REQ-STARTUP-142's fonts and icon set, from the table beside this file. A font's version and copyright notice
 * are read from its own naming table, and its licence file must carry that notice; a font `fonts.css` bundles with
 * no row in the table has no licence file, which REQ-STARTUP-143 fails on.
 */
export function bundledAssetComponents(root, problems) {
  const table = readJson(root, PATHS.assets, problems, 'the bundled-assets table');
  if (!table) return [];
  if (!Array.isArray(table.assets)) { problems.push(`the bundled-assets table ${PATHS.assets} carries no assets list`); return []; }
  const covered = new Set();
  const out = [];
  for (const [i, a] of table.assets.entries()) {
    const label = typeof a?.component === 'string' && a.component !== '' ? a.component : `entry ${i + 1}`;
    for (const k of ['component', 'license', 'licenseFile']) if (typeof a?.[k] !== 'string' || a[k] === '') problems.push(`the bundled-assets table ${PATHS.assets}: ${label} has no ${k}`);
    const files = Array.isArray(a?.files) ? a.files : [];
    const versions = new Set();
    const copyrights = new Set();
    for (const f of files) {
      covered.add(f);
      let buffer;
      try { buffer = readFileSync(join(root, f)); } catch { problems.push(`bundled asset ${label}: ${f} is missing`); continue; }
      try {
        const names = woff2Names(buffer);
        if (names[5]) versions.add(names[5].replace(/^Version\s+/i, '').split(/[;\s]/)[0]);
        if (names[0]) copyrights.add(names[0]);
      } catch (e) { problems.push(`bundled asset ${label}: ${f} cannot be read as a font (${e instanceof Error ? e.message : String(e)})`); }
    }
    // A font the table names and no build carries (Manrope, OQ-67) states so where its version would be.
    let version = files.length === 0 && typeof a?.package !== 'string' ? 'not contained in this build' : [...versions].sort(compareVersions).join(', ');
    if (typeof a?.package === 'string') {
      const dir = resolveInstalled(a.package, root, root);
      if (!dir) problems.push(`bundled asset ${label}: its package ${a.package} is not installed`);
      else version = String(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version);
    }
    const texts = [];
    if (typeof a?.licenseFile === 'string' && a.licenseFile !== '') {
      let text = null;
      try { text = normalize(readFileSync(join(root, a.licenseFile), 'utf8')); } catch { problems.push(`bundled asset ${label}: license file ${a.licenseFile} is missing`); }
      if (text === '') problems.push(`bundled asset ${label}: license file ${a.licenseFile} is empty`);
      if (text) {
        texts.push({ file: a.licenseFile.split('/').pop() ?? a.licenseFile, text });
        for (const c of copyrights) if (!text.includes(c)) problems.push(`bundled asset ${label}: license file ${a.licenseFile} does not carry the font's own copyright notice "${c}"`);
      }
    }
    out.push({ section: 'assets', ecosystem: 'asset', name: label, version: version || null, license: a?.license || null, texts, files });
  }
  let css = null;
  try { css = readFileSync(join(root, PATHS.fontFaces), 'utf8'); } catch { problems.push(`the bundled font faces ${PATHS.fontFaces} cannot be read`); }
  if (css !== null) for (const f of declaredFontFiles(css)) if (!covered.has(f)) problems.push(`bundled asset ${f} (declared by ${PATHS.fontFaces}) has no row in ${PATHS.assets}, so its license file is missing`);
  return out;
}

// ---- the setup manifest ----------------------------------------------------------------------------------------

/**
 * REQ-STARTUP-058's manifest as this build carries it (OQ-67): the code-intelligence pins, whose `languageServers`
 * is the second list and which carry no machine tools. An unreadable or unparsable manifest — including one whose
 * declared package lacks one of the four fields — fails validation (REQ-STARTUP-143).
 */
export function setupManifest(root, problems) {
  const pins = readJson(root, PATHS.setupManifest, problems, 'the setup manifest');
  if (!pins) return null;
  const bad = (m) => { problems.push(`the setup manifest ${PATHS.setupManifest} cannot be parsed: ${m}`); return null; };
  if (typeof pins.distribution !== 'string' || typeof pins.version !== 'string') return bad('it names no runtime distribution and version');
  const machineTools = pins.machineTools ?? [];
  if (!Array.isArray(machineTools)) return bad('machineTools is not a list');
  if (!Array.isArray(pins.languageServers)) return bad('languageServers is not a list');
  const languageServers = [];
  for (const ls of pins.languageServers) {
    if (typeof ls?.language !== 'string' || !Array.isArray(ls?.packages)) return bad('a language-server entry has no language or packages');
    for (const pkg of ls.packages) {
      for (const k of ['name', 'version', 'source', 'license']) if (typeof pkg?.[k] !== 'string' || pkg[k] === '') return bad(`language server package ${pkg?.name ?? '?'} (${ls.language}) has no ${k}`);
      languageServers.push({ language: ls.language, provisioner: ls.provisioner, name: pkg.name, version: pkg.version, source: pkg.source, license: pkg.license });
    }
  }
  const tools = [];
  for (const t of machineTools) {
    for (const k of ['name', 'version', 'source', 'license']) if (typeof t?.[k] !== 'string' || t[k] === '') return bad(`machine tool ${t?.name ?? '?'} has no ${k}`);
    tools.push({ name: t.name, version: t.version, source: t.source, license: t.license });
  }
  return { runtime: `${pins.distribution} ${pins.version}`, machineTools: tools, languageServers };
}

// ---- the reviewed exceptions and the release inputs ------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function dayNumber(date) {
  if (!DATE.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== date ? null : t / 86_400_000;
}

/**
 * REQ-STARTUP-143's maintainer-review table. An entry carries the seven fields; its expiry is at most
 * MAX_EXCEPTION_DAYS after its review. A malformed entry fails validation naming it — a reviewed exception that
 * cannot be read is not one.
 */
export function reviewedExceptions(root, problems) {
  const table = readJson(root, PATHS.exceptions, problems, 'the reviewed-exceptions table');
  if (!table) return [];
  if (!Array.isArray(table.exceptions)) { problems.push(`the reviewed-exceptions table ${PATHS.exceptions} carries no exceptions list`); return []; }
  const out = [];
  for (const [i, e] of table.exceptions.entries()) {
    const label = `${PATHS.exceptions} entry ${i + 1}${typeof e?.component === 'string' ? ` (${e.component})` : ''}`;
    const missing = ['component', 'versions', 'license', 'whyNoText', 'reviewer', 'reviewedOn', 'expires'].filter((k) => typeof e?.[k] !== 'string' || e[k].trim() === '');
    if (missing.length > 0) { problems.push(`${label} has no ${missing.join(', ')}`); continue; }
    const reviewed = dayNumber(e.reviewedOn), expires = dayNumber(e.expires);
    if (reviewed === null || expires === null) { problems.push(`${label}: reviewedOn and expires must be YYYY-MM-DD dates`); continue; }
    if (expires < reviewed || expires - reviewed > MAX_EXCEPTION_DAYS) { problems.push(`${label}: expires ${e.expires} is not within ${MAX_EXCEPTION_DAYS} days after the review on ${e.reviewedOn}`); continue; }
    out.push(e);
  }
  return out;
}

/** The exception covering one component, or why none does: an expired entry and an out-of-range one are no entry. */
export function exceptionFor(component, exceptions, today) {
  const named = exceptions.filter((e) => e.component === component.name);
  const live = named.find((e) => versionInRange(component.version, e.versions) && e.expires >= today);
  if (live) return { entry: live, reason: null };
  if (named.length === 0) return { entry: null, reason: 'no reviewed exception covers it' };
  const inRange = named.find((e) => versionInRange(component.version, e.versions));
  return { entry: null, reason: inRange ? `its reviewed exception expired on ${inRange.expires}` : `its reviewed exception covers ${named.map((e) => e.versions).join(', ')}, not ${component.version}` };
}

/**
 * REQ-STARTUP-142: a literal address reachable without an account. Refused when empty, when it is a page reference,
 * and when it is only a placeholder — a template marker, a to-do word, or a domain reserved for examples and tests.
 */
export function addressProblem(address) {
  if (typeof address !== 'string' || address.trim() === '') return 'is empty';
  const a = address.trim();
  if (/^(https?:\/\/|www\.)/i.test(a)) return 'is a web page reference, not an address';
  if (/<[^@<>]*>|\{\{|\}\}/.test(a)) return 'is a template placeholder';
  if (/\b(todo|tbd|fixme|changeme|placeholder|lorem ipsum|x{3,})\b|your[\s_-]?(e-?mail|address)/i.test(a)) return 'is a placeholder';
  if (/@(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|[a-z0-9-]+\.(?:example|invalid|test|localhost))\b|@(?:example|localhost)\b/i.test(a)) return 'uses a domain reserved for examples and tests';
  return null;
}

/** The one place the owner writes the address (O-3): `release-inputs.json`, beside this file. */
export function releaseInputs(root, problems) {
  const inputs = readJson(root, PATHS.releaseInputs, problems, 'the release inputs');
  const address = inputs?.lgplCorrespondingSourcesAddress;
  if (inputs) {
    const why = addressProblem(address);
    if (why) problems.push(`the LGPL corresponding-sources address (lgplCorrespondingSourcesAddress in ${PATHS.releaseInputs}) ${why} — it is the owner's to give (first-release-plan.md §6, O-3; REQ-STARTUP-142)`);
  }
  return { address: typeof address === 'string' ? address.trim() : '' };
}

// ---- the model ---------------------------------------------------------------------------------------------------

/**
 * Everything the file says, and every reason it may not be frozen (REQ-STARTUP-143). `today` (YYYY-MM-DD, UTC)
 * decides a reviewed exception's expiry; `platform` is the release job's target (a component compiled only there).
 */
export function collectNotices({ root, platform, today }) {
  /** @type {string[]} */
  const problems = [];
  let product = { name: 'Rotaris', version: 'unknown' };
  try { product = { name: 'Rotaris', version: String(JSON.parse(readFileSync(join(root, PATHS.desktop), 'utf8')).version) }; } catch { /* reported by the closure */ }
  const javascript = javascriptClosure(root, problems);
  const electron = electronComponent(root, problems);
  const compiled = compiledInComponents(root, javascript, platform, problems);
  const runtime = codeIntelligenceComponents(root, problems);
  const assets = bundledAssetComponents(root, problems);
  const manifest = setupManifest(root, problems);
  const exceptions = reviewedExceptions(root, problems);
  const inputs = releaseInputs(root, problems);

  const order = (a, b) => byText(a.name, b.name) || compareVersions(a.version, b.version);
  const application = [...javascript, ...compiled, ...(electron ? [electron] : [])].sort(order);
  const interpreter = runtime.filter((c) => c.ecosystem === 'interpreter');
  const distributions = runtime.filter((c) => c.ecosystem !== 'interpreter').sort(order);

  for (const c of [...application, ...interpreter, ...distributions]) {
    const where = c.section === 'runtime' ? 'code-intelligence runtime' : c.containedIn ? `compiled into ${c.containedIn}` : c.ecosystem;
    if (!c.license) problems.push(`${c.name} ${c.version} (${where}): declares no license identifier`);
    // An empty licence file is no licence text. Electron, the interpreter and a compiled-in library have one named
    // file each, which their readers already reported missing or empty; only a dependency takes the reviewed route.
    c.texts = c.texts.filter((t) => t.text !== '');
    if (c.texts.length === 0 && !c.textRequired) {
      const { entry, reason } = exceptionFor(c, exceptions, today);
      if (entry) c.exception = entry;
      else problems.push(`${c.name} ${c.version} (${where}): carries no license text and ${reason} (${PATHS.exceptions})`);
    }
    delete c.dir;
  }
  return { product, address: inputs.address, application, interpreter, distributions, assets, manifest, electron, problems };
}

// ---- the rendering -----------------------------------------------------------------------------------------------

const RULE = '='.repeat(80);
const THIN = '-'.repeat(80);

function wrap(text, width = 78, indent = '') {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line !== '' && indent.length + line.length + 1 + word.length > width) { out.push(indent + line); line = word; } else line = line === '' ? word : `${line} ${word}`;
    }
    out.push(indent + line);
  }
  return out.join('\n');
}

function entry(c, extra = []) {
  const lines = [THIN, `Component: ${c.name}`, `Version:   ${c.version ?? 'not stated'}`];
  const license = c.license ?? 'none declared';
  lines.push(`License:   ${c.exception ? `${c.exception.license} (a maintainer-reviewed exception, reviewed ${c.exception.reviewedOn}, expires ${c.exception.expires})` : license}`);
  lines.push(...extra, THIN, '');
  if (c.exception) lines.push(wrap(`No license text is distributed with this component. ${c.exception.whyNoText}`), '');
  const shown = c.texts.filter((t) => t.text !== '');
  for (const t of shown) {
    if (shown.length > 1) lines.push(`----- ${t.file} -----`, '');
    lines.push(t.text, '');
  }
  return lines.join('\n');
}

function heading(n, title) {
  return [RULE, `${n}. ${title}`, RULE, ''].join('\n');
}

/** A sub-heading underlined to its own length, as far as the page is wide. */
function subheading(title) {
  return [title, '-'.repeat(Math.min(title.length, 80)), ''].join('\n');
}

/** The file, deterministically: no date, no path of the machine that built it, every list in a fixed order. */
export function renderNotices(model) {
  const { product, application, interpreter, distributions, assets, manifest, electron } = model;
  const credits = electron?.credits ?? [];
  const lgpl = [...application, ...interpreter, ...distributions, ...assets].filter((c) => /LGPL|Lesser General Public/i.test(c.license ?? ''));
  const title = `${product.name} ${product.version} — third-party software notices`;
  const out = [title, '='.repeat(title.length), ''];
  out.push(wrap(`This file is ${NOTICES_FILE}. It names every third-party component contained in this build of ${product.name}, each with its version, its license identifier and the full text of its license, and then the tools ${product.name} downloads after installation, which this build does not contain.`), '');
  out.push(subheading('Components licensed under the GNU Lesser General Public License'));
  out.push(wrap(`Some components in this build are licensed under the GNU Lesser General Public License (LGPL). You have the right to modify each of them and to relink ${product.name} with your modified version, under the terms of the LGPL, whose text is reproduced with each such component below.${lgpl.length > 0 ? ` The components whose declared license names the LGPL are: ${lgpl.map((c) => `${c.name} ${c.version}`).join(', ')}.` : ''}${credits.length > 0 ? ` Components compiled into Electron whose license is the LGPL are reproduced in section 5.` : ''}`), '');
  out.push(wrap('To request the complete corresponding source code of any LGPL-licensed component in this build, write to:'), '');
  out.push(...(model.address || '(no address)').split('\n').map((l) => `    ${l.trim()}`), '');
  out.push(subheading('Contents'));
  out.push(`  1. Application dependencies (${application.length})`);
  out.push(`  2. The bundled code-intelligence runtime (${interpreter.length + distributions.length})`);
  out.push(`  3. Bundled fonts and icons (${assets.length})`);
  out.push(`  4. ${TOOLS_SECTION}`);
  if (electron) out.push(`  5. Components compiled into Electron ${electron.version} (${credits.length})`);
  out.push('');

  out.push(heading(1, 'Application dependencies'));
  out.push(wrap(`The packages the application is built from and ships, and the libraries compiled into its native modules.`), '');
  for (const c of application) {
    const extra = [];
    if (c.containedIn) extra.push(`Contained in: ${c.containedIn} (compiled into its native module)`);
    if (c === electron && credits.length > 0) extra.push(`See:       section 5, the ${credits.length} components compiled into Electron`);
    out.push(entry(c, extra));
  }

  out.push(heading(2, 'The bundled code-intelligence runtime'));
  out.push(wrap(`The interpreter the bundled code-intelligence runtime runs on, and every distribution installed in it.`), '');
  for (const c of [...interpreter, ...distributions]) out.push(entry(c));

  out.push(heading(3, 'Bundled fonts and icons'));
  for (const c of assets) out.push(entry(c));

  out.push(heading(4, TOOLS_SECTION));
  out.push(subheading('Machine tools'));
  if (!manifest || manifest.machineTools.length === 0) {
    out.push(wrap(`The setup manifest of this build pins no machine tools, so this build downloads neither Git nor ripgrep.`), '');
  } else {
    out.push(wrap(`The tools below are downloaded after installation and are not contained in this artifact.`), '');
    for (const t of manifest.machineTools) out.push(`  ${t.name}`, `    Version:  ${t.version}`, `    Source:   ${t.source}`, `    License:  ${t.license}`, '');
  }
  const runtimeName = manifest?.runtime ?? 'the bundled code-intelligence runtime';
  const sub = `Language servers provisioned by the bundled code-intelligence runtime (${runtimeName})`;
  out.push(subheading(sub));
  out.push(wrap(`The bundled code-intelligence runtime downloads each package below at the first use of that language. None of them is contained in this artifact.`), '');
  for (const s of manifest?.languageServers ?? []) out.push(`  ${s.name}`, `    Language: ${s.language}`, `    Version:  ${s.version}`, `    Source:   ${s.source}`, `    License:  ${s.license}`, '');
  out.push(wrap(`A further language the runtime supports obtains its language server by the same route, at the first use of that language, and is not declared here.`), '');

  if (electron) {
    out.push(heading(5, `Components compiled into Electron ${electron.version}`));
    out.push(wrap(`Electron's own credits, as the Electron ${electron.version} distribution carries them in LICENSES.chromium.html: every component compiled into the Electron runtime, with the full text of its license. The credits state no version and no license identifier; each component is the version compiled into Electron ${electron.version}.`), '');
    for (const c of credits) {
      const lines = [THIN, `Component: ${c.title}`, `Version:   as compiled into Electron ${electron.version}`];
      if (c.homepage) lines.push(`Homepage:  ${c.homepage}`);
      lines.push(THIN, '', c.text, '');
      out.push(lines.join('\n'));
    }
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

/** Collect, render, and say whether the file may be frozen: `problems` empty is the only passing outcome. */
export function generateNotices(options) {
  const model = collectNotices(options);
  return { text: renderNotices(model), problems: model.problems, model };
}

/**
 * The release job's step (REQ-STARTUP-037, REQ-STARTUP-143, REQ-STARTUP-149), answered as an exit code and the lines
 * to print rather than printed, so the tests drive it over a fixture tree. The file is written only when validation
 * passes, and a failure removes any earlier one, so no stale file can be frozen in place of a failed one.
 */
export function runNoticesStep({ root, platform, today }) {
  const output = join(root, PATHS.output);
  try {
    const { text, problems, model } = generateNotices({ root, platform, today });
    if (problems.length > 0) {
      rmSync(output, { force: true });
      const stderr = [`error: notices validation failed (REQ-STARTUP-143): ${problems.length} problem${problems.length === 1 ? '' : 's'}; ${PATHS.output} was not written`, ...problems.map((p) => `error: ${p}`)];
      return { code: 1, stdout: [], stderr };
    }
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, text);
    const counts = `${model.application.length} application, ${model.interpreter.length + model.distributions.length} runtime, ${model.assets.length} font and icon components; ${model.manifest?.languageServers.length ?? 0} language servers; ${model.electron?.credits.length ?? 0} components compiled into Electron`;
    return { code: 0, stdout: [`[notices] wrote ${PATHS.output} (${Buffer.byteLength(text)} bytes): ${counts}`], stderr: [] };
  } catch (e) {
    rmSync(output, { force: true });
    return { code: 1, stdout: [], stderr: [`error: the notices generator failed: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
