/**
 * The permission-mode reset proof — REQ-TOOLS-077 with REQ-TOOLS-071, REQ-CONFIG-262, REQ-CONFIG-288.
 *
 * The mode chip arms `autonomous`, a run is started, and the run does in fact operate under `autonomous` — measured
 * where it is decided rather than where it is drawn: the session record's own `permission_mode`, which REQ-TOOLS-071
 * makes the effective mode of the run, and the chip's label after the run.
 *
 * Two launches against ONE scratch workspace, differing in exactly one thing — whether the Settings view was opened
 * once and left. That is what makes the reading diagnostic rather than incidental:
 *
 *   1. settings-first — Settings › Runtime opened once, then left, so the screen that publishes ADR-0037's Tier B
 *                       live state (`config.liveState`) has mounted and unmounted; then the chip arms `autonomous`
 *                       and a run is started.
 *   2. plain          — no Settings visit at all; the chip arms `autonomous` and a run is started.
 *
 * **Red before 2026-11-08, and for the reason the proof exists.** The live state the Settings screen handed over was
 * never taken down: the run host kept the last state it was handed for the life of the process and laid it ON TOP of
 * the files at the next run start, so the mode the abandoned form held outranked the composer's own durable write
 * (REQ-CONFIG-288/REQ-CONFIG-328) and launch 1 recorded `ask` — with the chip falling back to `mode: ask` beside it,
 * while the configuration file held `autonomous`. Launch 2, which never mounted the screen, recorded `autonomous`
 * throughout: the difference between the two IS the defect
 * (`docs/defects/a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`).
 *
 * The repair takes the state down when the screen goes, and main decides which window owns the run host's one state
 * and what a window's DOCUMENT going means (`main/live-state.ts`, `commands/config.ts`) — the renderer's own cleanup
 * never runs for a close, and with two windows it could not see the other's screen anyway (REQ-SHELL-020).
 *
 * Evidence under `.proof/mode-reset-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 *
 * PD-SHELL-015 (2026-11-11): the capture variables name a view by its identifier (`workspace`, `settings`), not by
 * its digit. Settings is the sixth view (Ctrl+6; the seventh until then); Mission is no view.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv, mainEntry, electron } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const Database = createRequire(import.meta.url)('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const output = resolve(repo, '.proof', 'mode-reset-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

/**
 * One failed condition, as an Error — the whole proof reads as a sequence of these.
 * @param {unknown} condition
 * @param {string} message
 * @returns {void}
 */
const expect = (condition, message) => { if (!condition) throw new Error(message); };

/** The chip's label and the run state, as the capture's probe reads them at the end of a launch. */
const PROBES = ['[data-testid="chip-mode-label"]', '[data-testid="run-state"]'];
/** The chip's trigger and the third preset, as `composer-proof`'s launch 6 clicks them (PD-CHAT-001's popover). */
const MODE_TRIGGER = '[data-testid="chip-mode"] [aria-haspopup="menu"]';
const MODE_AUTONOMOUS = '.chip-menu__panel [role="menuitemradio"]:nth-child(3)';
const MODE_CONFIRM = '.dialog-actions .btn-danger';

/** One probed element's text and its `data-*` attributes. */
/** @typedef {{ text?: string, data?: Record<string, string> }} Probe */
/** One `inspect-at` reading: the elements the selector matched. */
/** @typedef {{ matches?: Probe[] }} Inspect */
/** What one launch's log was read into. */
/** @typedef {{ png: string, log: string, probes: Record<string, Probe[]>, inspects: Record<string, Inspect> }} LaunchReading */

/**
 * One launch of the built application against the scratch profile, its log written beside its PNG.
 * @param {string} name
 * @param {string} workspace
 * @param {string} local
 * @param {string} preferences
 * @param {Record<string, string>} extra
 * @param {number} [timeoutMs]
 * @returns {Promise<LaunchReading>}
 */
async function launch(name, workspace, local, preferences, extra, timeoutMs = 180_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [mainEntry, ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png,
      ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}\n${log.split('\n').slice(-40).join('\n')}`);
  /** @type {Record<string, Probe[]>} */
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    const selector = m?.[1];
    const json = m?.[2];
    if (selector !== undefined && json !== undefined) { try { probes[selector] = JSON.parse(json); } catch { probes[selector] = []; } }
  }
  /** @type {Record<string, Inspect>} */
  const inspects = {};
  for (const line of log.split('\n')) {
    const m = /capture: inspect-at (\d+) (.+?) → (\{.*\})\s*$/.exec(line);
    const at = m?.[1];
    const selector = m?.[2];
    const json = m?.[3];
    if (at !== undefined && selector !== undefined && json !== undefined) { try { inspects[`${selector}@${at}`] = JSON.parse(json); } catch { /* an unreadable inspect stays absent */ } }
  }
  return { png, log, probes, inspects };
}
/**
 * The one element an `inspect` found for a selector at a time, or null.
 * @param {LaunchReading} reading
 * @param {string} selector
 * @param {number} at
 * @returns {Probe | null}
 */
const match = (reading, selector, at) => reading.inspects[`${selector}@${at}`]?.matches?.[0] ?? null;
/**
 * The mode chip's label as the probe read it after the launch, or null.
 * @param {LaunchReading} reading
 * @returns {string | null}
 */
const chipAfter = (reading) => reading.probes['[data-testid="chip-mode-label"]']?.[0]?.text ?? null;
/**
 * Every click the capture seam reported making, or failed to make — a proof that clicks nothing proves nothing.
 * @param {LaunchReading} reading
 * @returns {string[]}
 */
const clicks = (reading) => reading.log.split('\n').filter((l) => /capture: clicked|no ".+" control on screen|is not under the pointer/.test(l)).map((l) => l.replace(/^\[main [^\]]+\] info\s+/, '').trim());
/**
 * The permission mode the run resolved, as the run host's own configuration line states it.
 * @param {LaunchReading} reading
 * @returns {string[]}
 */
const resolvedModes = (reading) => [...reading.log.matchAll(/configuration: loaded in [^\n]*?permission_mode=(\w+)/g)].map((m) => m[1] ?? '');

const root = join(output, 'profile');
const workspace = join(root, 'ws');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
for (const d of [workspace, local, preferences]) mkdirSync(d, { recursive: true });
const AGENTS_YAML = [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'default_persona: orchestrator',
  'runtime:',
  '  permission_mode: ask',
  '  max_depth: 3',
  '  max_active_children: 4',
  'mcp:',
  '  servers:',
  '    code_intelligence: { enabled: false }',
  '',
].join('\n');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# mode-reset proof workspace\n');
const configFile = join(workspace, '.rotaris', 'agents.yaml');
/** The workspace starts every launch at the shipped default, so each one's own write is the only mode in play. */
/** @param {string} mode */
const writeConfig = (mode) => writeFileSync(configFile, AGENTS_YAML.replace('permission_mode: ask', `permission_mode: ${mode}`));
/** @returns {string | null} */
const configMode = () => /permission_mode:\s*(\w+)/.exec(readFileSync(configFile, 'utf8'))?.[1] ?? null;

/** One session row, by the fields this proof reads — or the note a store that could not be read left. */
/** @typedef {{ session_id?: string, permission_mode?: string, sandboxed?: number, run_type?: string, execution_status?: string, stop_reason?: string, error?: string }} SessionRow */

/**
 * The sessions the runs left, with the effective mode REQ-TOOLS-071 records in session state — read from the store
 * rather than from a surface, so a wrong mode cannot be excused as a drawing fault.
 * @returns {SessionRow[]}
 */
function sessionRows() {
  /** @type {SessionRow[]} */
  const rows = [];
  for (const db of findDatabases(local)) {
    try {
      const conn = new Database(db, { readonly: true });
      const cols = /** @type {{ name: string }[]} */ (conn.prepare('pragma table_info(sessions)').all()).map((c) => c.name);
      const wanted = ['session_id', 'permission_mode', 'sandboxed', 'run_type', 'execution_status', 'stop_reason'].filter((c) => cols.includes(c));
      rows.push(.../** @type {SessionRow[]} */ (conn.prepare(`select ${wanted.join(', ')} from sessions order by rowid`).all()));
      conn.close();
    } catch (cause) { rows.push({ error: String(cause) }); }
  }
  return rows;
}

/**
 * The arm-the-chip-and-run steps, shared so the two launches differ in nothing but the Settings visit.
 * @param {number} triggerAt
 * @returns {Record<string, string>}
 */
const armAndRun = (triggerAt) => ({
  /*
   * The three presses are DEPENDENT — each opens or answers what the one before it revealed — so each waits for its
   * target instead of assuming the previous one landed within a fixed interval (`@~ms` is a deadline, `host.ts`'s
   * `settleAt`; a slow host made a fixed appointment miss the panel entirely, which failed this proof's own
   * precondition rather than the product).
   */
  ROTARIS_CAPTURE_CLICKS: `${MODE_TRIGGER}@${triggerAt};;${MODE_AUTONOMOUS}@~${triggerAt + 4000};;${MODE_CONFIRM}@~${triggerAt + 4000}`,
  /*
   * The chip is read AFTER the three presses have landed and BEFORE the run starts, which is what makes it the
   * "before the run" half of the comparison. `from~to` is the offset form (`parseSteps`): pause until `from`, then
   * poll for the element until `to` — a deadline, not an appointment.
   */
  ROTARIS_CAPTURE_INSPECT_AT: `[data-testid="chip-mode-label"]@${triggerAt + 2800}~${triggerAt + 7800}`,
  ROTARIS_CAPTURE_PROMPT: 'Exercise the permission mode.', ROTARIS_CAPTURE_PROMPT_MS: String(triggerAt + 10_000),
  ROTARIS_SCRIPT: 'wait:12000,answer',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
});

/** What one launch's reading was summarised into, before the runs' sessions are counted in. */
/** @typedef {{ chipBeforeRun: string | null, chipAfterRun: string | null, runState: string | null, resolvedModes: string[], clicks: string[] }} LaunchSummary */

/**
 * A launch's reading, summarised — the fields both launches are read for, in the voter shape `results.json` holds.
 * @param {LaunchReading} reading
 * @param {number} inspectAt
 * @returns {LaunchSummary}
 */
const summarise = (reading, inspectAt) => ({
  chipBeforeRun: match(reading, '[data-testid="chip-mode-label"]', inspectAt)?.text ?? null,
  chipAfterRun: chipAfter(reading),
  runState: reading.probes['[data-testid="run-state"]']?.[0]?.text ?? null,
  resolvedModes: resolvedModes(reading),
  clicks: clicks(reading),
});

// ── 1. Settings opened once and left; the chip armed `autonomous`; a run started ──
writeConfig('ask');
const settingsFirst = await launch('settings-first', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: 'settings', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
  ROTARIS_CAPTURE_VIEWS: 'workspace@3000',
  ...armAndRun(4200),
});
const firstSummary = summarise(settingsFirst, 12_000);
expect(firstSummary.chipBeforeRun !== null, 'the mode chip vanished from the composer strip during the Settings-first launch');
expect(firstSummary.clicks.length === 3, `the arm-and-run steps did not all land in the Settings-first launch: ${JSON.stringify(firstSummary.clicks)}`);
expect(configMode() === 'autonomous', `the mode chip did not write its own key durably (REQ-CONFIG-288): the file holds ${JSON.stringify(configMode())}`);
expect(firstSummary.chipBeforeRun === 'mode: autonomous', `the chip did not show the mode it had just written: ${JSON.stringify(firstSummary.chipBeforeRun)}`);
const firstSessions = sessionRows();
const firstSession = firstSessions[firstSessions.length - 1];
expect(firstSession?.permission_mode !== undefined, `no session was recorded for the Settings-first launch: ${JSON.stringify(firstSessions)}`);
if (firstSession === undefined) throw new Error('unreachable: the expect above proves a session was recorded');
/*
 * REQ-TOOLS-071 / REQ-TOOLS-077: the mode the user armed is the mode the run operated under. This assertion is the
 * proof's whole point and it is RED on the unrepaired build (the abandoned screen's live state overlaid the write).
 */
expect(firstSession.permission_mode === 'autonomous',
  `the run did not operate under the mode the chip armed (REQ-TOOLS-077 with REQ-CONFIG-262): the session records ${JSON.stringify(firstSession.permission_mode)} while the file holds ${JSON.stringify(configMode())} and the chip reads ${JSON.stringify(firstSummary.chipAfterRun)} — an abandoned Settings screen's live state outranked the write`);
expect(firstSummary.chipAfterRun === 'mode: autonomous',
  `the selector fell back after the run start (REQ-TOOLS-077): ${JSON.stringify(firstSummary.chipAfterRun)}`);
expect(firstSummary.resolvedModes[firstSummary.resolvedModes.length - 1] === 'autonomous',
  `the run resolved a mode other than the one armed: ${JSON.stringify(firstSummary.resolvedModes)}`);

// ── 2. No Settings visit at all: the same arm and run, with nothing having published a live state ──
writeConfig('ask');
const plain = await launch('plain', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEWS: 'workspace@2000',
  ...armAndRun(3200),
});
const plainSummary = summarise(plain, 11_000);
expect(plainSummary.clicks.length === 3, `the arm-and-run steps did not all land in the plain launch: ${JSON.stringify(plainSummary.clicks)}`);
expect(configMode() === 'autonomous', `the mode chip did not write its own key durably in the plain launch: ${JSON.stringify(configMode())}`);
const firstIds = new Set(firstSessions.map((s) => s.session_id));
const plainSessions = sessionRows().filter((s) => !firstIds.has(s.session_id));
const plainSession = plainSessions[plainSessions.length - 1];
if (plainSession === undefined) throw new Error(`no session was recorded for the plain launch: ${JSON.stringify(plainSessions)}`);
expect(plainSession.permission_mode === 'autonomous',
  `the plain launch — which mounted no Settings screen — did not run under the armed mode either: ${JSON.stringify(plainSession.permission_mode)}. The two launches are meant to differ only in the Settings visit, so a red here means the harness itself is wrong.`);

/*
 * The control the reading rests on: the two launches are alike but for the Settings visit, and both must agree.
 * Before the repair they did NOT — launch 1 recorded `ask` and launch 2 `autonomous` — which is what named the cause.
 */
expect(firstSession.permission_mode === plainSession.permission_mode,
  `the Settings-first and plain launches disagree on the effective mode (${JSON.stringify(firstSession.permission_mode)} vs ${JSON.stringify(plainSession.permission_mode)}): opening Settings once changed what a run does`);

const results = {
  settingsFirst: { ...firstSummary, fileMode: 'autonomous', sessions: firstSessions },
  plain: { ...plainSummary, fileMode: 'autonomous', sessions: plainSessions },
};
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\nmode-reset proof: evidence under ${relative(repo, output)}`);
