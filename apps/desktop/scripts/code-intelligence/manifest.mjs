/**
 * `pnpm code-intel:manifest` — the binding manifest of REQ-MCP-116, GENERATED from the bundled runtime (ADR-0035: "the
 * manifest IS the runtime's answer"). Part T, 2026-09-06.
 *
 * The generator starts the pinned runtime from `apps/desktop/resources/code-intelligence/runtime/` (built by
 * `pnpm code-intel:bundle`) as the product will — `start-mcp-server` with the transport and mode arguments of the
 * shipped default entry and no project — reads `tools/list` over newline-framed JSON-RPC on its standard streams,
 * asks it for the distribution's version and for the file-name extensions its language servers index, and emits
 * `packages/config/src/mcp/code-intelligence-manifest.generated.ts`. The module is COMMITTED so `pnpm check` needs no
 * Python; `pnpm package` regenerates it and refuses on a diff (`--check`).
 *
 * The four tiers of REQ-MCP-015 are held here BY CAPABILITY and bound to the runtime's names by the map below; an
 * unmapped capability, a name the runtime does not report, a cardinality other than 10/7/2/1, an overlap between tiers,
 * or a never-grant name inside a tier fails generation and writes no module.
 *
 * Reading taken (recorded in ADR-0035's note): the tiers are checked against the SERVER's listing under the shipped
 * arguments — the listing the product's discovery sees; the three never-grant names are checked against the runtime's
 * whole tool vocabulary (its own `tools list --all`), because the host-integration mode withholds the dashboard tool
 * from the server's listing while the runtime still owns the name. Both listings are recorded in the module.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..', '..');
const REPO = resolve(APP, '..', '..');
const RUNTIME = join(APP, 'resources', 'code-intelligence', 'runtime');
const PYTHON = join(RUNTIME, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const MODULE = join(REPO, 'packages', 'config', 'src', 'mcp', 'code-intelligence-manifest.generated.ts');
const PINS = JSON.parse(readFileSync(join(HERE, 'pins.json'), 'utf8'));
const ENTRY = 'from serena.cli import top_level; top_level()';
const check = process.argv.includes('--check');

/** REQ-MCP-010: the arguments that select stdio transport and the host-integration mode (the runtime calls the latter a "context"). */
const TRANSPORT_ARGS = ['--transport', 'stdio'];
const MODE_ARGS = ['--context', 'ide'];
/** REQ-MCP-034/036/099: the launch subcommand, the two project-selection options, the marker, the three setup subcommands. */
const LAUNCH_SUBCOMMAND = 'start-mcp-server';
const PROJECT_PATH_OPTION = '--project';
const PROJECT_FROM_CWD_OPTION = '--project-from-cwd';
const MARKER_FILE = '.serena/project.yml';
const SETUP = { create: ['project', 'create'], index: ['project', 'index'], memory: ['memories', 'initialize'] };

/** REQ-MCP-015's tiers by capability → the runtime's name. The ONLY place a runtime tool name is typed by hand. */
const CAPABILITIES = {
  read: {
    symbolLookup: 'find_symbol',
    fileSymbolOverview: 'get_symbols_overview',
    referencingSymbols: 'find_referencing_symbols',
    implementations: 'find_implementations',
    declaration: 'find_declaration',
    patternSearch: 'search_for_pattern',
    fileDiagnostics: 'get_diagnostics_for_file',
    memoryListing: 'list_memories',
    memoryReading: 'read_memory',
    usageInstructions: 'initial_instructions',
  },
  edit: {
    replaceSymbolBody: 'replace_symbol_body',
    insertBeforeSymbol: 'insert_before_symbol',
    insertAfterSymbol: 'insert_after_symbol',
    renameSymbol: 'rename_symbol',
    safeDeleteSymbol: 'safe_delete_symbol',
    replaceInFile: 'replace_content',
    replaceAcrossFiles: 'replace_in_files',
  },
  memoryWrite: { memoryWriting: 'write_memory', memoryEditing: 'edit_memory' },
  onboard: { projectOnboarding: 'onboarding' },
};
const NEVER_GRANT = { memoryDeletion: 'delete_memory', memoryRename: 'rename_memory', dashboardOpening: 'open_dashboard' };
/**
 * PD-ORCH-004 / REQ-ORCH-109 (fin32, the a68f121 duress run's D1): for each capability of the EDIT tier, the argument of
 * its tool that names the file it writes (`path`) — for a cross-file capability, the file or directory its change is
 * confined to — and, where the tool has one, the argument that asks for a preview and changes nothing (`preview`). The
 * run reads them to list the workspace paths a child's edit-tier calls changed. Checked against the input schema the
 * server lists for the tool, so a renamed argument fails generation rather than a report.
 *
 * OQ-245 (XE1, ruled 2026-10-13 under R-072): each capability's `scope` says where the files it changed are read from.
 * `argument` — the file its path argument names, which is all it writes: the five single-file tools, and the safe delete,
 * which refuses while references exist and so only ever touches its declaring file. `reach` — the files the call can
 * reach, observed by the run host before and after the call, because its arguments name fewer than it changes: `reach`
 * says what it can reach — `project`, the whole project (a symbol rename rewrites every reference; its path argument names
 * the declaring file, a file), or `path`, the file or directory its path argument names and the whole project when that is
 * empty (a cross-file replacement; its path argument may be a directory, so it is never listed as an edited file). The
 * reading it replaces, kept beside it: until the ruling every capability was listed by its path argument alone, so a
 * rename listed its declaring file and a whole-project replacement nothing
 * (docs/defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
 */
const EDIT_ARGUMENTS = {
  replaceSymbolBody: { path: 'relative_path', scope: 'argument' },
  insertBeforeSymbol: { path: 'relative_path', scope: 'argument' },
  insertAfterSymbol: { path: 'relative_path', scope: 'argument' },
  renameSymbol: { path: 'relative_path', scope: 'reach', reach: 'project' },
  safeDeleteSymbol: { path: 'relative_path', scope: 'argument' },
  replaceInFile: { path: 'relative_path', scope: 'argument' },
  replaceAcrossFiles: { path: 'relative_path', preview: 'dry_run', scope: 'reach', reach: 'path' },
};
/** The roles of an `EDIT_ARGUMENTS` entry that name an argument of the tool's input schema; `scope` and `reach` do not. */
const ARGUMENT_ROLES = ['path', 'preview'];
/**
 * PD-MCP-001 (OQ-115, ruled by the owner under R-071): descriptions WRITTEN BY THE PRODUCT, by capability, that replace
 * the runtime's own for the tool the capability names wherever the product hands that description to a model. Not the
 * runtime's answer, so not checked against it beyond the capability existing: the runtime's usage-instruction tool
 * describes itself imperatively ("IMPORTANT: If you have not yet read the manual, call this tool immediately …"), every
 * agent obeyed it, and each then re-sent its 7,000-plus characters with every later request (live-run finding L8).
 */
const PRODUCT_DESCRIPTIONS = {
  usageInstructions: "Returns the code-intelligence server's manual: how its symbol, search, edit and memory tools are meant to be used together. The other tools work without it; fetch it only when that guidance would help with the task at hand.",
};
const CARDINALITY = { read: 10, edit: 7, memoryWrite: 2, onboard: 1 };

function fail(m) { process.stderr.write(`[code-intel:manifest] REFUSED — ${m}\n`); process.exit(1); }
function log(m) { process.stdout.write(`[code-intel:manifest] ${m}\n`); }
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

if (!existsSync(PYTHON)) fail(`the bundle is absent at ${RUNTIME}; run pnpm code-intel:bundle first`);
const env = { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1', SERENA_HOME: join(APP, '.cache', 'code-intelligence', 'manifest-home') };
mkdirSync(env.SERENA_HOME, { recursive: true });
// The generator's own home carries the runtime's template with the interface off — the same three values the product's branch seeds.
const seed = join(env.SERENA_HOME, 'serena_config.yml');
if (!existsSync(seed)) {
  const sitePkgs = findSitePackages(RUNTIME);
  if (!sitePkgs) fail(`site-packages is absent under ${RUNTIME}`);
  const template = readFileSync(join(sitePkgs, 'serena', 'resources', 'serena_config.template.yml'), 'utf8');
  writeFileSync(seed, template.replace(/^gui_log_window:.*$/m, 'gui_log_window: False').replace(/^web_dashboard:.*$/m, 'web_dashboard: False').replace(/^web_dashboard_open_on_launch:.*$/m, 'web_dashboard_open_on_launch: False'));
}

function py(args, timeoutMs = 120_000) {
  const r = spawnSync(PYTHON, ['-c', ENTRY, ...args], { encoding: 'utf8', env, windowsHide: true, timeout: timeoutMs, cwd: APP });
  if (r.error) fail(`${args.join(' ')}: ${r.error.message}`);
  if (r.status !== 0) fail(`${args.join(' ')} exited ${r.status ?? r.signal}: ${(r.stderr ?? '').slice(-800)}`);
  return r.stdout;
}

// ---- 1. the runtime's own version, and the extensions it indexes ----------------------------------------------
const version = /(\d+\.\d+\.\d+)/.exec(py(['-V']))?.[1];
if (version !== PINS.version) fail(`the runtime answers version '${version}', the pin is ${PINS.version} (REQ-MCP-011)`);

// ---- 1b. the language servers the runtime provisions at first use (ESC-32 / IC-7; REQ-STARTUP-058's second list, REQ-MCP-118) ----
// The pins must equal the runtime's OWN defaults for each package — the check of REQ-MCP-095's kind: a disclosure that names
// a version the runtime will not fetch is defective. The store is asked of the runtime too, relative to its home.
const lsScript = [
  'import json, os',
  'from solidlsp.language_servers.typescript_language_server import DEFAULT_TYPESCRIPT_VERSION, DEFAULT_TYPESCRIPT_LANGUAGE_SERVER_VERSION',
  'from solidlsp.language_servers.pyright_server import PYRIGHT_VERSION',
  'from solidlsp.settings import SolidLSPSettings',
  'store = os.path.relpath(SolidLSPSettings(solidlsp_dir=os.environ["SERENA_HOME"]).ls_resources_dir, os.environ["SERENA_HOME"]).replace(os.sep, "/")',
  'print(json.dumps({"defaults": {"typescript": DEFAULT_TYPESCRIPT_VERSION, "typescript-language-server": DEFAULT_TYPESCRIPT_LANGUAGE_SERVER_VERSION, "pyright": PYRIGHT_VERSION}, "store": store}))',
].join('\n');
const lsRun = spawnSync(PYTHON, ['-c', lsScript], { encoding: 'utf8', env, windowsHide: true, timeout: 120_000, cwd: APP });
if (lsRun.status !== 0) fail(`the language-server defaults could not be read from the runtime: ${(lsRun.stderr ?? '').slice(-800)}`);
const { defaults: runtimeDefaults, store: languageServerStore } = JSON.parse(lsRun.stdout.trim().split('\n').at(-1));
if (!languageServerStore || languageServerStore.startsWith('..')) fail(`the runtime's language-server store is not under its home: '${languageServerStore}'`);
const languageServers = Array.isArray(PINS.languageServers) ? PINS.languageServers : [];
if (languageServers.length === 0) fail('pins.json declares no language servers (REQ-STARTUP-058)');
for (const ls of languageServers) {
  if (!['npm', 'uvx'].includes(ls.provisioner)) fail(`language '${ls.language}': provisioner '${ls.provisioner}' is not one the runtime uses`);
  for (const pkg of ls.packages) {
    for (const k of ['name', 'version', 'source', 'license']) if (typeof pkg[k] !== 'string' || pkg[k] === '') fail(`language server package '${pkg.name ?? '?'}': ${k} missing (REQ-STARTUP-058)`);
    if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail(`language server package '${pkg.name}': version '${pkg.version}' is not MAJOR.MINOR.PATCH (REQ-STARTUP-059)`);
    if (!(pkg.name in runtimeDefaults)) fail(`language server package '${pkg.name}': the generator reads no default for it from the runtime — add the probe before declaring it`);
    if (runtimeDefaults[pkg.name] !== pkg.version) fail(`language server package '${pkg.name}' is pinned ${pkg.version}; the runtime's own default is ${runtimeDefaults[pkg.name]} (REQ-STARTUP-058)`);
  }
}
log(`language servers: ${languageServers.map((l) => `${l.language} (${l.packages.map((p) => `${p.name} ${p.version}`).join(', ')})`).join('; ')} — equal to the runtime's defaults; store ${languageServerStore}`);
// The extensions: every language server the runtime would consider for a project (a positive default priority, which
// is how its own project creation infers the languages of a workspace), its file-name matcher's extensions, united.
const extScript = [
  'import json',
  'from solidlsp.ls_config import LanguageServerId',
  'from serena.config.serena_config import SerenaConfig',
  'cfg = SerenaConfig.from_config_file()',
  'exts = set()',
  'langs = []',
  'for l in LanguageServerId:',
  '    if cfg.get_ls_priority(l) > 0:',
  '        langs.append(l.value)',
  '        exts.update(l.get_source_fn_matcher()._file_extensions)',
  'print(json.dumps({"languages": sorted(langs), "extensions": sorted(exts)}))',
].join('\n');
const extRun = spawnSync(PYTHON, ['-c', extScript], { encoding: 'utf8', env, windowsHide: true, timeout: 120_000, cwd: APP });
if (extRun.status !== 0) fail(`the extension listing failed: ${(extRun.stderr ?? '').slice(-800)}`);
const { languages, extensions } = JSON.parse(extRun.stdout.trim().split('\n').at(-1));
if (!extensions.includes('.ts') || !extensions.includes('.py')) fail(`the extension list looks wrong: ${extensions.join(' ')}`);

// ---- 2. the runtime's whole vocabulary, then the server's listing under the shipped arguments ------------------
const vocabulary = py(['tools', 'list', '--all']).split(/\r?\n/).map((l) => /^\s*\*\s*`([^`]+)`/.exec(l)?.[1]).filter(Boolean).sort();
if (vocabulary.length < 20) fail(`the tool vocabulary is implausibly short (${vocabulary.length})`);

async function serverListing() {
  const child = spawn(PYTHON, ['-c', ENTRY, LAUNCH_SUBCOMMAND, ...TRANSPORT_ARGS, ...MODE_ARGS], { env, cwd: APP, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let out = Buffer.alloc(0); let stderr = ''; let preamble = null; const pending = new Map(); let id = 0;
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (d) => { stderr += d; });
  const send = (method, params) => new Promise((resolve, reject) => { const my = ++id; pending.set(my, { resolve, reject }); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: my, method, params })}\n`); });
  child.stdout.on('data', (d) => {
    out = Buffer.concat([out, d]);
    for (;;) {
      const nl = out.indexOf(10); if (nl === -1) return;
      const line = out.subarray(0, nl).toString('utf8'); out = out.subarray(nl + 1);
      if (preamble === null) { const b = line.indexOf('{'); preamble = b === -1 ? line : line.slice(0, b); }
      if (line.trim() === '') continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result); }
    }
  });
  const t0 = Date.now();
  const timer = setTimeout(() => { child.kill(); }, 90_000);
  try {
    const init = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rotaris-manifest-generator', version: '0' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    const tools = await send('tools/list', {});
    const listMs = Date.now() - t0;
    child.stdin.end();
    const exit = await new Promise((r) => child.on('exit', (c) => r(c)));
    clearTimeout(timer);
    return { names: tools.tools.map((t) => t.name).sort(), schemas: Object.fromEntries(tools.tools.map((t) => [t.name, t.inputSchema ?? {}])), listMs, preamble, exit, protocol: init.protocolVersion, serverName: init.serverInfo?.name, stderrTail: stderr.slice(-600) };
  } catch (e) {
    clearTimeout(timer); child.kill();
    fail(`the server did not answer: ${e.message}\n${stderr.slice(-1200)}`);
  }
}
const server = await serverListing();
if (server.preamble !== '') fail(`the server wrote ${JSON.stringify(server.preamble)} to standard output before the first '{' (REQ-MCP-033)`);
log(`server '${server.serverName}' protocol ${server.protocol}: ${server.names.length} tools in ${server.listMs} ms; exit ${server.exit} on stdin end; vocabulary ${vocabulary.length} names`);

// ---- 3. the checks of REQ-MCP-015 -----------------------------------------------------------------------------
const tiers = Object.fromEntries(Object.entries(CAPABILITIES).map(([tier, map]) => [tier, Object.values(map)]));
for (const [tier, names] of Object.entries(tiers)) {
  if (names.length !== CARDINALITY[tier]) fail(`tier ${tier} holds ${names.length} names, REQ-MCP-015 fixes ${CARDINALITY[tier]}`);
  for (const [cap, name] of Object.entries(CAPABILITIES[tier])) {
    if (typeof name !== 'string' || name === '') fail(`capability ${tier}.${cap} is unmapped`);
    if (!server.names.includes(name)) fail(`tier ${tier}: '${name}' (${cap}) is not reported by the runtime's tools/list — an upstream rename? (REQ-MCP-015)`);
    if (Object.values(NEVER_GRANT).includes(name)) fail(`tier ${tier} holds the never-grant name '${name}'`);
  }
}
const all = Object.values(tiers).flat();
if (new Set(all).size !== all.length) fail('the tiers are not pairwise disjoint');
for (const [cap, name] of Object.entries(NEVER_GRANT)) {
  if (!vocabulary.includes(name)) fail(`never-grant '${name}' (${cap}) is not in the runtime's tool vocabulary — an upstream rename? (REQ-MCP-015)`);
}
for (const name of [...all, ...Object.values(NEVER_GRANT)]) if (!vocabulary.includes(name)) fail(`'${name}' is absent from the vocabulary`);
for (const cap of Object.keys(CAPABILITIES.edit)) if (!Object.prototype.hasOwnProperty.call(EDIT_ARGUMENTS, cap)) fail(`edit capability ${cap} names no path argument (PD-ORCH-004)`);
for (const [cap, args] of Object.entries(EDIT_ARGUMENTS)) {
  const name = CAPABILITIES.edit[cap];
  if (name === undefined) fail(`an edit argument names '${cap}', which is no capability of the edit tier`);
  const properties = server.schemas[name]?.properties ?? {};
  for (const role of ARGUMENT_ROLES) {
    const arg = args[role];
    if (arg !== undefined && !Object.prototype.hasOwnProperty.call(properties, arg)) fail(`edit tier: '${name}' (${cap}) lists no '${arg}' argument for its ${role} — an upstream rename? (PD-ORCH-004)`);
  }
  // OQ-245: every capability says where its changed files are read from, and a reach says what it reaches.
  for (const key of Object.keys(args)) if (![...ARGUMENT_ROLES, 'scope', 'reach'].includes(key)) fail(`edit tier: '${cap}' carries an unknown key '${key}' (OQ-245)`);
  if (args.scope !== 'argument' && args.scope !== 'reach') fail(`edit tier: '${cap}' has scope '${args.scope}', not 'argument' or 'reach' (OQ-245)`);
  if (args.scope === 'reach' && args.reach !== 'project' && args.reach !== 'path') fail(`edit tier: '${cap}' has reach scope and reaches '${args.reach}', not 'project' or 'path' (OQ-245)`);
  if (args.scope === 'argument' && args.reach !== undefined) fail(`edit tier: '${cap}' has argument scope and names a reach (OQ-245)`);
}
for (const [cap, text] of Object.entries(PRODUCT_DESCRIPTIONS)) {
  if (!Object.values(CAPABILITIES).some((map) => Object.prototype.hasOwnProperty.call(map, cap))) fail(`a product description names '${cap}', which is no capability of the tiers (PD-MCP-001)`);
  if (typeof text !== 'string' || text.trim() === '') fail(`the product description for '${cap}' is empty (PD-MCP-001)`);
}

// ---- 4. the module ---------------------------------------------------------------------------------------------
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const arr = (xs, indent = '') => `[${xs.map(q).join(', ')}]${indent}`;
const lines = [
  '/* GENERATED by apps/desktop/scripts/code-intelligence/manifest.mjs from the bundled runtime — DO NOT EDIT. */',
  '/**',
  ' * REQ-MCP-116: the code-intelligence binding manifest — the ONE place the pinned runtime\'s identifiers are written.',
  ' * ADR-0035: generated at build time from the runtime\'s own answers (its version, its tool listing, the extensions its',
  ' * language servers index); `pnpm package` regenerates it and refuses on a diff; `pnpm check` tests it against',
  ' * `apps/desktop/scripts/code-intelligence/pins.json` and REQ-MCP-015\'s counts. Not a configuration surface: never read',
  ' * from disk at run time, never user-editable, never varying by workspace.',
  ` * Generated ${new Date().toISOString().slice(0, 10)} from ${PINS.distribution} ${version} on Python ${PINS.python}: ${server.names.length} tools listed by the server`,
  ` * under the shipped arguments (${server.listMs} ms to tools/list on the build machine), ${vocabulary.length} names in the runtime's vocabulary.`,
  ' */',
  'export const CODE_INTELLIGENCE_MANIFEST = {',
  `  distribution: ${q(PINS.distribution)},`,
  `  version: ${q(version)},`,
  `  python: ${q(PINS.python)},`,
  '  /** REQ-MCP-010: the arguments selecting stdio transport and the host-integration mode (the runtime\'s "context"). */',
  `  transportArgs: ${arr(TRANSPORT_ARGS)},`,
  `  modeArgs: ${arr(MODE_ARGS)},`,
  '  /** REQ-MCP-034/036: the server-launch subcommand and the two project-selection options. */',
  `  launchSubcommand: ${q(LAUNCH_SUBCOMMAND)},`,
  `  projectPathOption: ${q(PROJECT_PATH_OPTION)},`,
  `  projectFromCwdOption: ${q(PROJECT_FROM_CWD_OPTION)},`,
  '  /** REQ-MCP-099: the per-project marker whose presence skips creation, and the three setup subcommands (each takes the project path as its last argument). */',
  `  markerFile: ${q(MARKER_FILE)},`,
  `  setup: { create: ${arr(SETUP.create)}, index: ${arr(SETUP.index)}, memory: ${arr(SETUP.memory)} },`,
  '  /** REQ-MCP-099: the file-name extensions the runtime indexes — a workspace holding one such regular file contains code. */',
  `  languages: ${arr(languages)},`,
  `  extensions: ${arr(extensions)},`,
  '  /** ESC-32 / IC-7 — REQ-STARTUP-058\'s second list, REQ-MCP-118: the language servers the runtime provisions at the first use of a language, each pin equal to the runtime\'s own default at generation; where the runtime stores them, relative to its home. */',
  `  languageServerStore: ${q(languageServerStore)},`,
  '  languageServers: [',
  ...languageServers.map((l) => `    { language: ${q(l.language)}, provisioner: ${q(l.provisioner)}, packages: [${l.packages.map((p) => `{ name: ${q(p.name)}, version: ${q(p.version)}, source: ${q(p.source)}, license: ${q(p.license)} }`).join(', ')}] },`),
  '  ],',
  '  /** REQ-MCP-015: the four tiers, by capability, bound to the runtime\'s names. */',
  '  tiers: {',
  ...Object.entries(CAPABILITIES).map(([tier, map]) => `    ${tier}: { ${Object.entries(map).map(([cap, name]) => `${cap}: ${q(name)}`).join(', ')} },`),
  '  },',
  '  /** PD-ORCH-004 / REQ-ORCH-109: by edit capability, the argument naming the file its tool writes (for a cross-file one, the file or directory it is confined to), the one asking for a preview that changes nothing, and (OQ-245) where the files it changed are read from — the argument, or the files it can reach, observed. */',
  `  editArguments: { ${Object.entries(EDIT_ARGUMENTS).map(([cap, a]) => `${cap}: { ${Object.entries(a).map(([k, v]) => `${k}: ${q(v)}`).join(', ')} }`).join(', ')} },`,
  '  /** REQ-MCP-015: never in a built-in grant. */',
  `  neverGrant: { ${Object.entries(NEVER_GRANT).map(([cap, name]) => `${cap}: ${q(name)}`).join(', ')} },`,
  '  /** PD-MCP-001: descriptions written by the product, not reported by the runtime, by capability — each replaces the runtime\'s own description of the tool it names. */',
  `  productDescriptions: { ${Object.entries(PRODUCT_DESCRIPTIONS).map(([cap, text]) => `${cap}: ${q(text)}`).join(', ')} },`,
  '  /** What the server listed under the shipped arguments, and the runtime\'s whole vocabulary, as generated. */',
  `  reportedByServer: ${arr(server.names)},`,
  `  vocabulary: ${arr(vocabulary)},`,
  '} as const;',
  '',
];
const text = lines.join('\n');
const strip = (t) => t.replace(/^ \* Generated .*$/m, '').replace(/^ \* under the shipped arguments .*$/m, '');
if (check) {
  if (!existsSync(MODULE)) fail(`the committed module is absent: ${MODULE}`);
  const committed = readFileSync(MODULE, 'utf8');
  if (strip(committed.replace(/\r\n/g, '\n')) !== strip(text)) fail(`the committed manifest module differs from a fresh generation against the bundled runtime (REQ-MCP-116); run pnpm code-intel:manifest and commit the result`);
  log(`the committed module equals a fresh generation (${MODULE})`);
  process.exit(0);
}
writeFileSync(MODULE, text);
log(`wrote ${MODULE}`);
