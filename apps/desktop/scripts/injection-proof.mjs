/**
 * The workspace-context injection proof (first-release-plan §3.2 and §3.3; REQ-WORKSPACE-041..050 as narrowed and
 * extended by PD-WORKSPACE-002, OQ-64 as ruled 2026-09-27).
 *
 * Everything here is read from what the MODEL PORT RECEIVED, not from a log line saying a block was built: the
 * scripted client appends every call's system text to a file (`ROTARIS_CAPTURE_MODEL_REQUESTS`, a seam compiled out
 * of a packaged build and reachable only from the scripted client, so no real provider is ever called or recorded).
 *
 * Every instruction base is a scratch directory. The home-relative bases resolve into a scratch home through
 * `ROTARIS_CAPTURE_INSTRUCTIONS_HOME`, the global base is the scratch profile's own configuration directory, and the
 * machine-wide base (`/etc/codex`, off Windows only) is redirected by `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`: no
 * instruction file of the operator's own is read or written. On a POSIX host `HOME` is that scratch home as well
 * (`proofIsolationEnv`), so every other home-relative read — the prompt library's `~/.agents/prompts`, for one —
 * lands there too; Windows keeps its real home, because overriding it kills Electron before it paints there.
 *
 * The same variable moves the skill search's machine-wide root, `/etc/codex/skills` (REQ-WORKSPACE-051, off Windows
 * only): both discoveries read under the one machine-wide directory, so the run host lists `<profile.machine>/skills`
 * and never the operator's own. Before the seam existed a skill there entered the scripted model's catalog and the
 * captured calls (`docs/defects/fixed/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`).
 *
 * The functional half, four launches against one scratch profile whose workspace is a Git repository in which every
 * workspace instruction file's committed text differs from its working copy:
 *
 *   1. all-on    — a scripted run with every file switched on. ORDER: the source comments arrive in discovery
 *                  order (the workspace pairs, the global base, the three home-relative bases, the machine-wide
 *                  base; `AGENTS.md` before `CLAUDE.md` within each). PRESENCE: every enabled file's block, its
 *                  source comment immediately followed by its content. The on override suppresses its own base and
 *                  nothing else (REQ-WORKSPACE-042 as narrowed). The context unit precedes the skill catalog
 *                  (REQ-WORKSPACE-047).
 *   2. switch    — Settings → Instructions: every present file listed in discovery order under its source label;
 *                  `user-agents:CLAUDE.md` and `workspace:AGENTS.override.md` switched off and saved, and the
 *                  per-file policy written sparsely into the workspace file.
 *   3. switched  — a scripted run. ABSENCE: the switched-off file contributes nothing, not even its source comment.
 *                  OQ-64 AS RULED: the override switched off returns its base, `AGENTS.md`, to the merge.
 *   4. isolated  — New session with isolation on: the run executes in `.rotaris/worktrees/<sid>`, and its workspace
 *                  blocks come from THAT tree — the committed text, under the worktree's paths — while the policy
 *                  (the two switches of launch 2) and every other base stay the base workspace's (REQ-WORKSPACE-050).
 *
 * The latency half (§3.2, REQ-WORKSPACE-049): a second scratch profile holding a fixture AT the bound — every
 * instruction-file slot discovery can reach filled (14 where the platform has an `/etc` hierarchy, 12 on Windows;
 * the requirement's 20 is unreachable, see OQ-68), totalling exactly 1 MiB — and `--latency-runs` (default and minimum
 * 20) consecutive launches, each a separate process, each preceded by evicting the fixture files from the page cache.
 * The figure read back is the run host's own timing of the cold path (the saved-policy read, the discovery, the
 * merge), on the monotonic clock port. It reports the 95th percentile by nearest rank, checks that every separate
 * process produced byte-identical merged context, and checks that the merge ran only after the first input.
 *
 * What "cold" means here, and it is narrower than it sounds: on Linux each fixture file's DATA pages are dropped with
 * `posix_fadvise(POSIX_FADV_DONTNEED)` (`dd iflag=nocache count=0`) after one `sync`, before every launch, and the
 * drop is then CHECKED with `mincore(2)` (through `python3`'s `ctypes` where one exists) — a resident page fails the
 * run rather than letting a warm reading pass as cold. Metadata (dentries, inodes) is not dropped — the eviction
 * opens each file, and the workspace service stats every instruction file at workspace open anyway, before any
 * merge can run. The process is new each time, so the code path is cold too. No other platform has a per-file
 * eviction this script can reach, so elsewhere the reading is labelled WARM and is not assessed against the bound.
 *
 * Evidence under `.proof/injection-proof/`: one PNG, one log and one model-call file per launch; `results.json`;
 * `latency.json`. Flags: `--skip-build`, `--skip-latency`, `--latency-runs=<n>` or `--latency-runs <n>` (n ≥ 20).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform as hostPlatform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { app, buildDesktop, configDirFor, electron, evidenceDirectory, hostSwitches, launchOptions, readProbes, repo } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const output = evidenceDirectory('injection-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });
/** `--name=value` or `--name value`; a flag given with no value reads as the empty string, which no check accepts. */
const flag = (name) => {
  const at = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (at < 0) return undefined;
  return process.argv[at].includes('=') ? process.argv[at].slice(name.length + 3) : (process.argv[at + 1] ?? '');
};
const skipLatency = process.argv.includes('--skip-latency');
const latencyRuns = Number(flag('latency-runs') ?? 20);
// REQ-WORKSPACE-049: "at least 20 consecutive cold measurements taken in separate processes". Fewer is not the figure.
if (!Number.isInteger(latencyRuns) || latencyRuns < 20) throw new Error(`--latency-runs must be a whole number of at least 20 (REQ-WORKSPACE-049); got ${flag('latency-runs')}`);
if (!process.argv.includes('--skip-build')) buildDesktop(output);
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const PROBES = ['.app-shell', '.save-bar__status', '[data-testid="inventory-row"]', '[data-testid="instruction-toggle"]'];
const results = [];
const fail = (message) => { writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2)); throw new Error(message); };
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
/** The platform rule the product applies to the machine-wide base (`hasEtcHierarchy`): every platform but Windows. */
const hasMachineBase = process.platform !== 'win32';
/** Where `HOME` may be moved into the profile: every platform but Windows, where overriding it kills Electron. */
const scratchHome = process.platform !== 'win32';

/**
 * One launch of the built product. `profile` names the scratch roots; the model-call file is the launch's own, so a
 * record is never read from a previous launch.
 */
async function launch(name, profile, workspace, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const calls = join(output, `${name}.model-calls.jsonl`);
  rmSync(calls, { force: true });
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...launchOptions({ local: profile.local, preferences: profile.preferences, ...(scratchHome ? { home: profile.home } : {}) }),
      ROTARIS_CAPTURE_INSTRUCTIONS_HOME: profile.home,
      ...(hasMachineBase ? { ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE: profile.machine } : {}),
      ROTARIS_CAPTURE_MODEL_REQUESTS: calls,
      ROTARIS_CAPTURE_PNG: png,
      ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) fail(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) fail(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) fail(`${name} produced no screenshot`);
  const records = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l)) : [];
  return { log, probes: readProbes(log), records };
}

/** A run: the prompt typed through the real composer, the launch ending once the run's result is presented. */
const runPrompt = { ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '600' };

/** The system text of the calls that carried workspace context — the agents built for the session. */
function contextCalls(records, name) {
  const carrying = records.filter((r) => r.system.includes('<!-- source: '));
  if (carrying.length === 0) fail(`${name}: no model call received workspace context (${records.length} call(s) recorded: ${records.map((r) => r.who).join(', ') || 'none'})`);
  return carrying;
}
/** The source comments, in the order the model received them. */
const sourcesOf = (system) => [...system.matchAll(/^<!-- source: (.+) -->$/gm)].map((m) => m[1]);
/** The workspace context unit: from its first source comment to the next unit (the skill catalog, when one follows). */
function contextUnitOf(system) {
  const start = system.indexOf('<!-- source: ');
  const catalog = system.indexOf('Portable skills available in this workspace.', start);
  return (catalog < 0 ? system.slice(start) : system.slice(start, catalog)).replace(/\n+$/, '');
}

// ═══ The functional half ═══════════════════════════════════════════════════════════════════════════════════════════

const scratch = join(output, 'scratch');
const profile = {
  local: join(scratch, 'local'),
  preferences: join(scratch, 'prefs'),
  home: join(scratch, 'home'),
  machine: join(scratch, 'machine-codex'),
};
// The home the launch is handed, so the macOS answer (composed from the home alone) names the directory it reads.
const globalDir = configDirFor(profile.local, process.platform, profile.home);
const workspace = join(scratch, 'workspace');
for (const dir of [profile.local, profile.preferences, profile.home, profile.machine, globalDir, workspace]) mkdirSync(dir, { recursive: true });

/** One file's text: a heading and one line naming the file and which copy it is. */
const body = (id, copy) => `# ${id}\nINJECTION-PROOF ${id} (${copy})\n`;
/** Every instruction file the fixture lays down, by stable identity, with the path the product will read it from. */
const files = {
  'workspace:AGENTS.md': join(workspace, 'AGENTS.md'),
  'workspace:AGENTS.override.md': join(workspace, 'AGENTS.override.md'),
  'workspace:CLAUDE.md': join(workspace, 'CLAUDE.md'),
  'global:AGENTS.md': join(globalDir, 'AGENTS.md'),
  'global:CLAUDE.md': join(globalDir, 'CLAUDE.md'),
  'user-agents:AGENTS.md': join(profile.home, '.agents', 'AGENTS.md'),
  'user-agents:CLAUDE.md': join(profile.home, '.agents', 'CLAUDE.md'),
  'user-opencode:AGENTS.md': join(profile.home, '.config', 'opencode', 'AGENTS.md'),
  'user-openhands:CLAUDE.md': join(profile.home, '.openhands', 'CLAUDE.md'),
  ...(hasMachineBase ? { 'machine-codex:AGENTS.md': join(profile.machine, 'AGENTS.md'), 'machine-codex:CLAUDE.md': join(profile.machine, 'CLAUDE.md') } : {}),
};
const sourceLabel = (id) => ({ workspace: 'workspace', global: 'global', 'user-agents': 'user (~/.agents)', 'user-opencode': 'user (~/.config/opencode)', 'user-openhands': 'user (~/.openhands)', 'machine-codex': 'machine (/etc/codex)' })[id.slice(0, id.indexOf(':'))];
const WORKSPACE_IDS = ['workspace:AGENTS.md', 'workspace:AGENTS.override.md', 'workspace:CLAUDE.md'];
const PRESENT = Object.keys(files);

// The workspace: a repository whose committed instruction files differ from the working copy, so a run in a worktree
// (which checks out the commit) and a run in the base (which reads the working copy) cannot be told apart by accident.
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' };
const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv }).toString().trim();
git('init', '-q', '-b', 'main');
// Both directories the load's amendment keeps ignored (REQ-CONFIG-013 / REQ-MCP-089), as `git-proof` does.
write(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
write(join(workspace, 'README.md'), '# Injection proof workspace\n');
for (const id of WORKSPACE_IDS) write(files[id], body(id, 'committed'));
git('add', '.gitignore', 'README.md', 'AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md');
git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'the instruction files, committed');
for (const id of WORKSPACE_IDS) write(files[id], body(id, 'base working copy'));
for (const id of PRESENT.filter((i) => !WORKSPACE_IDS.includes(i))) write(files[id], body(id, 'base'));
// One skill, so REQ-WORKSPACE-047's "ahead of the skill catalog" has a catalog to be ahead of.
write(join(workspace, '.agents', 'skills', 'proof-skill', 'SKILL.md'), '---\nname: proof-skill\ndescription: A skill so the catalog unit exists.\n---\nPROOF_SKILL_BODY\n');
const agentsYaml = join(workspace, '.rotaris', 'agents.yaml');
write(agentsYaml, [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  '',
].join('\n'));

/** The block a file contributes when the model is given it: its source comment on its own line, then its content. */
const blockOf = (path, text) => `<!-- source: ${path} -->\n${text.replace(/\n+$/, '')}`;
const baseText = (id) => readFileSync(files[id], 'utf8');

/**
 * The assertions every run shares: the received order is exactly `expected`, each expected file's block is present
 * whole, and each file in `absent` contributes nothing — neither its content line nor its source comment.
 */
function assertReceived(name, system, expected, absent, textOf = (id) => baseText(id), pathOf = (id) => files[id]) {
  const got = sourcesOf(system);
  const want = expected.map(pathOf);
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${name}: ORDER — the model received ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  for (const id of expected) {
    if (!system.includes(blockOf(pathOf(id), textOf(id)))) fail(`${name}: PRESENCE — ${id}'s block (${pathOf(id)}) was not received whole`);
  }
  for (const id of absent) {
    if (system.includes(`INJECTION-PROOF ${id} (`)) fail(`${name}: ABSENCE — ${id}'s content reached the model`);
    // Under either spelling of its path, so an isolated run cannot pass by naming the base's copy of a file it dropped.
    if (got.includes(files[id]) || got.includes(pathOf(id))) fail(`${name}: ABSENCE — ${id}'s source comment reached the model`);
  }
}

// ── 1. all-on ───────────────────────────────────────────────────────────────────────────────────────────────────────
const allOn = await launch('all-on', profile, workspace, runPrompt, 180_000);
const allOnSystem = contextCalls(allOn.records, 'all-on')[0].system;
// Discovery order, with the one suppression PD-WORKSPACE-002 keeps: an ON override suppresses its own base alone.
const allOnExpected = PRESENT.filter((id) => id !== 'workspace:AGENTS.md');
assertReceived('all-on', allOnSystem, allOnExpected, ['workspace:AGENTS.md']);
// REQ-WORKSPACE-047: the context unit ahead of the catalog, and ahead of every other unit.
const catalogAt = allOnSystem.indexOf('- proof-skill: ');
const lastBlockAt = allOnSystem.lastIndexOf('<!-- source: ');
if (catalogAt < 0) fail('all-on: the skill catalog did not reach the model, so the unit order is unobserved');
if (!(lastBlockAt < catalogAt)) fail('all-on: the skill catalog reached the model ahead of the workspace context');
if (allOnSystem.includes('PROOF_SKILL_BODY')) fail('all-on: a catalogued skill\'s body reached the model');
// The run host's own account of the same merge, so the log and the port can be compared by a reader.
const allOnTimed = /workspace context: the enabled set of (\d+) instruction file\(s\) merged into (\d+) bytes in ([\d.]+) ms/.exec(allOn.log);
if (!allOnTimed) fail('all-on: the run host logged no timed merge');
if (Number(allOnTimed[1]) !== allOnExpected.length) fail(`all-on: the run host merged ${allOnTimed[1]} file(s), not ${allOnExpected.length}`);
results.push({ launch: 'all-on', received: sourcesOf(allOnSystem), suppressed: 'workspace:AGENTS.md', catalogAfterContext: true, mergeMs: Number(allOnTimed[3]) });

// ── 2. switch ───────────────────────────────────────────────────────────────────────────────────────────────────────
const SWITCHED_OFF = 'user-agents:CLAUDE.md';
const OVERRIDE_OFF = 'workspace:AGENTS.override.md';
const switched = await launch('switch', profile, workspace, {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: '900', ROTARIS_CAPTURE_SETTINGS: 'Instructions',
  ROTARIS_CAPTURE_CLICKS: `[data-testid="instruction-toggle"][data-id="${SWITCHED_OFF}"]@1800;;[data-testid="instruction-toggle"][data-id="${OVERRIDE_OFF}"]@2400;;.save-bar .btn-primary>>Save@3400`,
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
// PD-WORKSPACE-002's inventory: every present file, in discovery order, under its own source label.
const toggles = switched.probes['[data-testid="instruction-toggle"]'] ?? [];
const listedIds = toggles.map((t) => t.data['data-id']);
if (JSON.stringify(listedIds) !== JSON.stringify(PRESENT)) fail(`switch: the inventory listed ${JSON.stringify(listedIds)}, not ${JSON.stringify(PRESENT)}`);
const inventory = switched.probes['[data-testid="inventory-row"]'] ?? [];
const labels = inventory.map((r) => r.data['data-source']);
if (JSON.stringify(labels) !== JSON.stringify(PRESENT.map(sourceLabel))) fail(`switch: the inventory's sources read ${JSON.stringify(labels)}`);
for (const t of toggles) {
  const wantOn = t.data['data-id'] !== SWITCHED_OFF && t.data['data-id'] !== OVERRIDE_OFF;
  if ((t.data['data-on'] === 'true') !== wantOn) fail(`switch: ${t.data['data-id']} reads ${t.data['data-on']} after Save`);
}
const savedYaml = readFileSync(agentsYaml, 'utf8');
if (!savedYaml.includes(`${SWITCHED_OFF}: off`) || !savedYaml.includes(`${OVERRIDE_OFF}: off`)) fail(`switch: the per-file policy was not written:\n${savedYaml}`);
// Sparse: no file the user did not touch is in the map.
if (PRESENT.some((id) => id !== SWITCHED_OFF && id !== OVERRIDE_OFF && savedYaml.includes(`${id}:`))) fail(`switch: the save was not sparse:\n${savedYaml}`);
results.push({ launch: 'switch', inventory: listedIds, off: [SWITCHED_OFF, OVERRIDE_OFF], agentsYaml: savedYaml });

// ── 3. switched ─────────────────────────────────────────────────────────────────────────────────────────────────────
const after = await launch('switched', profile, workspace, runPrompt, 180_000);
const afterSystem = contextCalls(after.records, 'switched')[0].system;
// ABSENCE for the switched-off file; OQ-64 AS RULED — the override off returns its base, `AGENTS.md`, to the merge.
const afterExpected = PRESENT.filter((id) => id !== SWITCHED_OFF && id !== OVERRIDE_OFF);
assertReceived('switched', afterSystem, afterExpected, [SWITCHED_OFF, OVERRIDE_OFF]);
if (!afterSystem.includes(blockOf(files['workspace:AGENTS.md'], baseText('workspace:AGENTS.md')))) fail('switched: OQ-64 — the override was switched off and its base did not return to the merge');
results.push({ launch: 'switched', received: sourcesOf(afterSystem), absent: [SWITCHED_OFF, OVERRIDE_OFF], oq64: 'switching the override off returned workspace:AGENTS.md to the merge' });

// ── 4. isolated ─────────────────────────────────────────────────────────────────────────────────────────────────────
const isolated = await launch('isolated', profile, workspace, {
  ROTARIS_CAPTURE_CLICKS: 'button>>New session@1800;;[data-testid="start-session-isolation"]@2800;;[data-testid="start-session-accept"]@3400',
  ROTARIS_CAPTURE_TYPE: 'Say hello from the worktree.>>composer@4400',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '600',
}, 180_000);
const bound = /session (\S+) is isolated: the run works in (.+?)(?: on branch \S+)?; the record stays under/.exec(isolated.log);
if (!bound) fail('isolated: the run host did not report an isolated execution root');
const worktree = bound[2];
if (!existsSync(join(worktree, 'AGENTS.md'))) fail(`isolated: the execution root ${worktree} holds no checked-out AGENTS.md`);
const isoSystem = contextCalls(isolated.records, 'isolated')[0].system;
// REQ-WORKSPACE-050: the workspace files from the EXECUTION root — the committed text, under the worktree's paths —
// with the base's policy still governing them by identity, and every other base exactly as the base run had it.
const isoPath = (id) => (WORKSPACE_IDS.includes(id) ? join(worktree, files[id].slice(workspace.length + 1)) : files[id]);
const isoText = (id) => (WORKSPACE_IDS.includes(id) ? body(id, 'committed') : baseText(id));
assertReceived('isolated', isoSystem, afterExpected, [SWITCHED_OFF, OVERRIDE_OFF], isoText, isoPath);
for (const id of WORKSPACE_IDS) {
  if (sourcesOf(isoSystem).includes(files[id])) fail(`isolated: ${id} was read from the base workspace rather than the worktree`);
}
if (isoSystem.includes('(base working copy)')) fail('isolated: the base workspace\'s working copy reached a run executing in its worktree');
if (!/enabled for .+ \(the worktree of .+, REQ-WORKSPACE-050\)/.test(isolated.log)) fail('isolated: the run host did not name the worktree it read from');
// The catalog stays the base workspace's (the other half of REQ-WORKSPACE-050's sentence).
if (!isoSystem.includes(`(SKILL.md: ${join(workspace, '.agents', 'skills', 'proof-skill', 'SKILL.md')})`)) fail('isolated: the skill catalog was not discovered from the base workspace');
results.push({ launch: 'isolated', sessionId: bound[1], executionRoot: worktree, received: sourcesOf(isoSystem) });

// ═══ The latency half (§3.2, REQ-WORKSPACE-049) ════════════════════════════════════════════════════════════════════

let latency = null;
if (!skipLatency) {
  const lat = join(output, 'latency');
  const lprofile = { local: join(lat, 'local'), preferences: join(lat, 'prefs'), home: join(lat, 'home'), machine: join(lat, 'machine-codex') };
  const lglobal = configDirFor(lprofile.local, process.platform, lprofile.home);
  const lworkspace = join(lat, 'workspace');
  for (const dir of [lprofile.local, lprofile.preferences, lprofile.home, lprofile.machine, lglobal, lworkspace]) mkdirSync(dir, { recursive: true });
  write(join(lworkspace, '.rotaris', 'agents.yaml'), ['models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', ''].join('\n'));

  /*
   * Every slot discovery can reach, in discovery order. With both overrides on, the two workspace bases are present
   * (discovery stats them) but suppressed (the merge never reads them), so each holds one line and the other slots
   * share the rest: the bytes the merge actually reads are then as close to the 1 MiB bound as the rule allows.
   */
  const slots = [
    ['workspace:AGENTS.md', join(lworkspace, 'AGENTS.md')], ['workspace:AGENTS.override.md', join(lworkspace, 'AGENTS.override.md')],
    ['workspace:CLAUDE.md', join(lworkspace, 'CLAUDE.md')], ['workspace:CLAUDE.override.md', join(lworkspace, 'CLAUDE.override.md')],
    ['global:AGENTS.md', join(lglobal, 'AGENTS.md')], ['global:CLAUDE.md', join(lglobal, 'CLAUDE.md')],
    ['user-agents:AGENTS.md', join(lprofile.home, '.agents', 'AGENTS.md')], ['user-agents:CLAUDE.md', join(lprofile.home, '.agents', 'CLAUDE.md')],
    ['user-opencode:AGENTS.md', join(lprofile.home, '.config', 'opencode', 'AGENTS.md')], ['user-opencode:CLAUDE.md', join(lprofile.home, '.config', 'opencode', 'CLAUDE.md')],
    ['user-openhands:AGENTS.md', join(lprofile.home, '.openhands', 'AGENTS.md')], ['user-openhands:CLAUDE.md', join(lprofile.home, '.openhands', 'CLAUDE.md')],
    ...(hasMachineBase ? [['machine-codex:AGENTS.md', join(lprofile.machine, 'AGENTS.md')], ['machine-codex:CLAUDE.md', join(lprofile.machine, 'CLAUDE.md')]] : []),
  ];
  const MIB = 1_048_576;
  const suppressed = new Set(['workspace:AGENTS.md', 'workspace:CLAUDE.md']);
  const smallText = (id) => `suppressed base ${id}\n`;
  const smallBytes = [...suppressed].reduce((n, id) => n + Buffer.byteLength(smallText(id)), 0);
  const read = slots.filter(([id]) => !suppressed.has(id));
  const share = Math.floor((MIB - smallBytes) / read.length);
  let spare = MIB - smallBytes - share * read.length;
  /** Deterministic ASCII lines of 80 bytes, the last one cut so the file is exactly `bytes` long and ends in a newline. */
  const filler = (id, bytes) => {
    let text = '';
    for (let n = 1; text.length < bytes; n += 1) text += `${`latency fixture ${id} line ${n} `.padEnd(79, '.')}\n`;
    return `${text.slice(0, bytes - 1)}\n`;
  };
  for (const [id, path] of slots) {
    if (suppressed.has(id)) { write(path, smallText(id)); continue; }
    const bytes = share + (spare > 0 ? 1 : 0);
    if (spare > 0) spare -= 1;
    write(path, filler(id, bytes));
  }
  const total = slots.reduce((n, [, path]) => n + readFileSync(path).length, 0);
  if (total !== MIB) fail(`latency: the fixture totals ${total} bytes, not ${MIB}`);

  // Cold, as the header states it: one sync so no fixture page is dirty, then every file's data pages dropped.
  const evictable = process.platform === 'linux';
  if (evictable) spawnSync('sync', [], { stdio: 'ignore' });
  const evict = () => {
    for (const [, path] of slots) {
      const r = spawnSync('dd', [`if=${path}`, 'iflag=nocache', 'count=0', 'status=none'], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
      if (r.status !== 0) fail(`latency: evicting ${path} from the page cache failed: ${r.stderr}`);
    }
  };
  /*
   * The eviction checked rather than trusted: `mincore(2)` over each file's mapping counts the pages still resident.
   * Node has no binding for it, so the count is taken through Python's `ctypes` where a `python3` exists; where none
   * does the run says so, and the reading is still cold by the method above but unverified.
   */
  const RESIDENT = [
    'import ctypes, mmap, os, sys',
    'libc = ctypes.CDLL("libc.so.6", use_errno=True)',
    'libc.mmap.restype = ctypes.c_void_p',
    'libc.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_long]',
    'libc.mincore.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_char_p]',
    'libc.munmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t]',
    'page = os.sysconf("SC_PAGE_SIZE"); total = resident = 0',
    'for path in sys.argv[1:]:',
    '    size = os.path.getsize(path); fd = os.open(path, os.O_RDONLY)',
    '    addr = libc.mmap(None, size, mmap.PROT_READ, mmap.MAP_SHARED, fd, 0); n = (size + page - 1) // page',
    '    vec = ctypes.create_string_buffer(n)',
    '    if libc.mincore(ctypes.c_void_p(addr), size, vec) != 0: sys.exit(2)',
    '    resident += sum(1 for b in vec.raw if b & 1); total += n',
    '    libc.munmap(ctypes.c_void_p(addr), size); os.close(fd)',
    'print(resident, total)',
  ].join('\n');
  const residentPages = () => {
    const r = spawnSync('python3', ['-c', RESIDENT, ...slots.map(([, path]) => path)], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return null;
    const [resident, pages] = r.stdout.trim().split(/\s+/).map(Number);
    return { resident, pages };
  };

  const samples = [];
  const digests = new Set();
  let firstInputOrder = true;
  for (let i = 1; i <= latencyRuns; i += 1) {
    if (evictable) evict();
    const residency = evictable ? residentPages() : null;
    if (residency !== null && residency.resident > 0) fail(`latency: ${residency.resident} of ${residency.pages} fixture pages were still resident after the eviction, so the run would not be cold`);
    const name = `latency-${String(i).padStart(2, '0')}`;
    const run = await launch(name, lprofile, lworkspace, runPrompt, 180_000);
    const m = /workspace context: the enabled set of (\d+) instruction file\(s\) merged into (\d+) bytes in ([\d.]+) ms \(policy read ([\d.]+) ms, discovery ([\d.]+) ms, merge ([\d.]+) ms\)/.exec(run.log);
    if (!m) fail(`${name}: the run host logged no timed merge`);
    /*
     * REQ-WORKSPACE-049's "never delays first input". The merge runs in the run host, not the window's process, and
     * only at agent construction — so the first merge line must follow the line saying the typed prompt was accepted
     * and recorded as the session's row 0. A merge before it would be one the window could have waited on.
     */
    const lines = run.log.split('\n');
    const mergedAt = lines.findIndex((l) => l.includes('workspace context: ') && l.includes(' merged into '));
    const acceptedAt = lines.findIndex((l) => /session \S+ started; row 0 recorded/.test(l));
    if (acceptedAt < 0 || mergedAt < acceptedAt) firstInputOrder = false;
    const unit = contextUnitOf(contextCalls(run.records, name)[0].system);
    digests.add(createHash('sha256').update(unit).digest('hex'));
    samples.push({ run: i, residentBefore: residency === null ? 'unverified' : `${residency.resident}/${residency.pages} pages`, files: Number(m[1]), mergedBytes: Number(m[2]), ms: Number(m[3]), policyMs: Number(m[4]), discoveryMs: Number(m[5]), mergeMs: Number(m[6]) });
  }
  const sorted = (key) => samples.map((s) => s[key]).sort((a, b) => a - b);
  const nearestRank = (values, p) => values[Math.ceil(p * values.length) - 1];
  const totals = sorted('ms');
  const p95 = nearestRank(totals, 0.95);
  const cpu = cpus()[0]?.model ?? 'unknown';
  latency = {
    platform: `${hostPlatform()} ${release()}`,
    cpu: `${cpu} × ${cpus().length}`,
    cold: evictable ? 'per-file POSIX_FADV_DONTNEED (dd iflag=nocache count=0) after one sync, before each launch; data pages only' : `NOT established — no per-file eviction on ${process.platform}; this is a WARM reading`,
    fixture: { files: slots.length, bytes: total, readByMerge: read.length, suppressedPresent: [...suppressed] },
    runs: latencyRuns,
    p95Ms: p95,
    p95DiscoveryAndMergeMs: nearestRank(samples.map((s) => Number((s.discoveryMs + s.mergeMs).toFixed(2))).sort((a, b) => a - b), 0.95),
    p95PolicyReadMs: nearestRank(sorted('policyMs'), 0.95),
    medianMs: nearestRank(totals, 0.5),
    minMs: totals[0],
    maxMs: totals.at(-1),
    boundMs: 200,
    verdict: !evictable ? 'not assessed (warm)' : p95 <= 200 ? 'met' : 'NOT met',
    byteIdenticalAcrossProcesses: digests.size === 1,
    mergedOnlyAfterTheFirstInput: firstInputOrder,
    samples,
  };
  writeFileSync(join(output, 'latency.json'), JSON.stringify(latency, null, 2));
  results.push({ section: 'latency', ...latency, samples: undefined });
  // Determinism is unconditional (REQ-WORKSPACE-049): every separate process must have produced the same bytes.
  if (digests.size !== 1) fail(`latency: ${digests.size} different merged contexts across ${latencyRuns} separate processes over one unchanged fixture`);
  if (!firstInputOrder) fail('latency: a merge ran before the typed prompt was accepted, so it could have delayed first input');
  if (samples.some((s) => s.files !== read.length)) fail(`latency: a run merged ${samples.find((s) => s.files !== read.length)?.files} file(s), not the ${read.length} the fixture enables`);
  if (evictable && p95 > 200) fail(`latency: REQ-WORKSPACE-049 NOT met on this machine — p95 ${p95} ms over ${latencyRuns} cold runs against the 200 ms bound (evidence in ${join(output, 'latency.json')})`);
}

writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`injection-proof: ${results.length} sections, evidence in ${output}`);
console.log(`  all-on received ${allOnExpected.length} blocks in discovery order; workspace:AGENTS.md suppressed by its on override`);
console.log(`  ${SWITCHED_OFF} switched off → absent; ${OVERRIDE_OFF} switched off → workspace:AGENTS.md back in the merge (OQ-64 as ruled)`);
console.log(`  the isolated run read its workspace files from ${worktree}`);
if (latency) console.log(`  REQ-WORKSPACE-049: p95 ${latency.p95Ms} ms over ${latency.runs} runs (${latency.cold.startsWith('NOT') ? 'WARM' : 'cold'}), median ${latency.medianMs} ms, max ${latency.maxMs} ms — ${latency.verdict}; ${latency.fixture.files} files, ${latency.fixture.bytes} bytes; byte-identical across processes: ${latency.byteIdenticalAcrossProcesses}`);
else console.log('  latency skipped (--skip-latency)');
if (!existsSync(join(repo, '.proof'))) fail('the evidence directory vanished');
