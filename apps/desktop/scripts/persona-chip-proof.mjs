/**
 * The composer's next-run chips at rest — REQ-CHAT-006/009 with REQ-CONFIG-063, REQ-MONITOR-057/058.
 *
 * The three chips that choose what the NEXT run starts with (persona, model, reasoning) must name what that run would
 * start as BEFORE any run exists. This proof reads them at rest and again while a run is live, in one launch, and
 * requires the two readings to AGREE.
 *
 * **Red before 2026-11-08, and for the reason the proof exists.** `entryRole` (`packages/ui/src/agents.ts`) fell back
 * to the literal `'orchestrator'` when no run was live and no transcript row existed, so a workspace stating
 * `default_persona: architect` drew the persona chip `orchestrator` at rest and it appeared to jump to `architect` the
 * moment a run began — while the run really had started as `architect` (the run host logs `entry architect`, the store
 * records it as the iteration's `root_persona`). The same fallback names the role the MODEL and REASONING chips read
 * their values from, so all three misdrew together; the permission-mode chip, which reads the configured mode through
 * its own prop, stayed right and is this proof's non-moving control.
 *
 * Two launches, so the reading is diagnostic rather than incidental: a workspace whose default is `architect` with its
 * own model and reasoning, and a second whose default is `coding-agent`, which is NOT the fallback word — a chip that
 * still prints `orchestrator` there has been shown to ignore the configuration rather than to agree with it.
 *
 * Evidence under `.proof/persona-chip-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 *
 * PD-SHELL-015 (2026-11-11): the capture variables name a view by its identifier (`workspace`), not by its digit, the
 * form that does not move when the rail does (Mission is no view; Settings is the sixth). No chord this script
 * presses moved.
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
const output = resolve(repo, '.proof', 'persona-chip-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
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

/** The four composer chips and the run state, as the capture seam's selectors name them. */
const PERSONA = '[data-testid="chip-persona"] [data-ui-component="SearchableSelect"]';
const MODEL = '[data-testid="chip-model"] [data-ui-component="SearchableSelect"]';
const REASONING = '[data-testid="chip-reasoning"] [aria-haspopup="menu"]';
const MODE = '[data-testid="chip-mode-label"]';
const RUN_STATE = '[data-testid="run-state"]';
const PROBES = [PERSONA, MODEL, REASONING, MODE, RUN_STATE];

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
async function launch(name, workspace, local, preferences, extra, timeoutMs = 240_000) {
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
 * All four chips and the run state as one reading — the shape both halves of the comparison share, so a chip cannot be
 * read in one place and forgotten in the other.
 * @param {LaunchReading} reading
 * @param {number} at
 * @returns {{ runState: string | null, persona: string | null, model: string | null, reasoning: string | null, mode: string | null }}
 */
const stripAt = (reading, at) => ({
  runState: match(reading, RUN_STATE, at)?.text ?? null,
  persona: match(reading, PERSONA, at)?.text ?? null,
  model: match(reading, MODEL, at)?.text ?? null,
  reasoning: match(reading, REASONING, at)?.text ?? null,
  mode: match(reading, MODE, at)?.text ?? null,
});
/**
 * The entry role the run host resolved at each load, as its own configuration line states it — read where the run is
 * decided rather than where it is drawn.
 * @param {LaunchReading} reading
 * @returns {string[]}
 */
const entryRoles = (reading) => [...reading.log.matchAll(/configuration: loaded in [^\n]*?entry (\S+) on (\S+?);/g)].map((m) => `${m[1]} on ${m[2]}`);
/**
 * The personas the runs' roots actually ran as, from the store.
 * @param {string} local
 * @returns {{ iteration?: number, root_persona?: string, error?: string }[]}
 */
function iterationRoots(local) {
  /** @type {{ iteration?: number, root_persona?: string, error?: string }[]} */
  const rows = [];
  for (const db of findDatabases(local)) {
    try {
      const conn = new Database(db, { readonly: true });
      rows.push(.../** @type {{ iteration?: number, root_persona?: string }[]} */ (conn.prepare('select iteration, root_persona from iterations order by iteration').all()));
      conn.close();
    } catch (cause) { rows.push({ error: String(cause) }); }
  }
  return rows;
}

const root = join(output, 'profile');
const workspaceA = join(root, 'alpha');
const workspaceB = join(root, 'beta');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
for (const dir of [workspaceA, workspaceB, local, preferences]) mkdirSync(dir, { recursive: true });
/**
 * The two roles must be DISTINGUISHABLE in every chip or the reading cannot discriminate: `orchestrator` (the retired
 * literal fallback) sits on the large slot with the shipped thinking, while `architect` — the configured default of
 * workspace A — has a model key and a reasoning level of its own.
 */
const AGENTS_YAML = [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  '  arch-model: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'default_persona: architect',
  'personas:',
  '  architect: { model: arch-model, thinking: low }',
  'runtime:',
  '  permission_mode: ask',
  '  max_depth: 3',
  '  max_active_children: 4',
  'mcp:',
  '  servers:',
  '    code_intelligence: { enabled: false }',
  '',
].join('\n');
/** @type {[string, string][]} */
const workspaces = [[workspaceA, 'persona-chip proof workspace A'], [workspaceB, 'persona-chip proof workspace B']];
for (const [ws, title] of workspaces) {
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  writeFileSync(join(ws, 'README.md'), `# ${title}\n`);
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), ws === workspaceA ? AGENTS_YAML : AGENTS_YAML.replace('default_persona: architect', 'default_persona: coding-agent'));
}

const results = {};

/*
 * ── 1. Workspace A (`default_persona: architect`, `architect` on `arch-model` at `low`) ──
 *
 * One launch: the Workspace view is opened so the composer strip exists, the four chips are read at rest BEFORE any
 * prompt (the `Ready` run state is the precondition, asserted, not assumed), then a prompt is submitted and the same
 * four are read again while the run is live. The readings must agree.
 */
const a = await launch('rest-and-run', workspaceA, local, preferences, {
  // The entry role is `architect`, not `orchestrator`, so the scripted client routes the root's calls to its `child`
  // script (`scripted-client.ts` picks the key from the system prompt). `ROTARIS_SCRIPT` would be ignored here and the
  // run would end on the default `answer` before the mid-run reading.
  ROTARIS_CHILD_SCRIPT: 'wait:30000,answer',
  ROTARIS_CAPTURE_VIEWS: 'workspace@1500',
  ROTARIS_CAPTURE_PROMPT: 'Exercise the composer chips.',
  ROTARIS_CAPTURE_PROMPT_MS: '9500',
  // `from~to` is a deadline, not an appointment: pause until `from`, then poll for the element until `to`.
  ROTARIS_CAPTURE_INSPECT_AT: [`${RUN_STATE}@4000~8000`, `${PERSONA}@4000~8000`, `${MODEL}@4000~8000`, `${REASONING}@4000~8000`, `${MODE}@4000~8000`, `${RUN_STATE}@15000`, `${PERSONA}@15000`, `${MODEL}@15000`, `${REASONING}@15000`, `${MODE}@15000`].join(';;'),
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '180000', ROTARIS_CAPTURE_AFTER_MS: '2000',
});
const atRest = stripAt(a, 8000);
const duringRun = stripAt(a, 15000);
expect(atRest.runState === 'Ready', `the chips were not read at rest — the run state is ${JSON.stringify(atRest.runState)}, not "Ready"`);
expect(duringRun.runState === 'Run active', `the chips were not read during a live run — the run state is ${JSON.stringify(duringRun.runState)}`);
for (const [chip, value] of Object.entries({ persona: atRest.persona, model: atRest.model, reasoning: atRest.reasoning, mode: atRest.mode })) {
  expect(value !== null, `the ${chip} chip was not on screen at rest`);
}
/*
 * REQ-CHAT-006/009 with REQ-CONFIG-063: the at-rest chips name what the next run starts as. Workspace A's configured
 * default is `architect`, on `arch-model`, at `low` — its reasoning chip draws the label (`Low`), the persona and model
 * chips the bare identifiers. This is RED on the unrepaired build, which read `orchestrator` / `scripted` / `Medium`.
 */
expect(atRest.persona === 'architect', `the persona chip at rest does not name the configured default role (REQ-CHAT-006/009): ${JSON.stringify(atRest.persona)} while the file states default_persona: architect`);
expect(atRest.model === 'arch-model', `the model chip at rest does not name the configured role's model: ${JSON.stringify(atRest.model)} while architect is configured on arch-model — the three chips share entryRole's fallback role`);
expect(atRest.reasoning === 'Low', `the reasoning chip at rest does not name the configured role's reasoning: ${JSON.stringify(atRest.reasoning)} while architect is configured at low`);
/*
 * The permission-mode chip is the control: it reads `session?.permissionMode ?? configuredMode` and was repaired
 * separately, so it must NOT move between the two readings. A mode chip that moved here would mean the premise —
 * "the mode chip is the correct shape in this strip" — is wrong, and the harness, not the product, is at fault.
 */
expect(atRest.mode === 'mode: ask' && duringRun.mode === 'mode: ask', `the permission-mode chip is not the configured mode in both readings (${JSON.stringify(atRest.mode)} at rest, ${JSON.stringify(duringRun.mode)} during the run): the control this proof rests on does not hold`);
const agreed = ['persona', 'model', 'reasoning'].filter((chip) => atRest[/** @type {'persona'|'model'|'reasoning'} */ (chip)] === duringRun[/** @type {'persona'|'model'|'reasoning'} */ (chip)]);
expect(agreed.length === 3, `the chips at rest and during the run disagree (REQ-CHAT-006/009): at rest ${JSON.stringify({ persona: atRest.persona, model: atRest.model, reasoning: atRest.reasoning })}, during the run ${JSON.stringify({ persona: duringRun.persona, model: duringRun.model, reasoning: duringRun.reasoning })} — the chip 'jump' the proof exists for`);
/*
 * The run really did start as the configured role, read where it is decided rather than where it is drawn: the run
 * host's own configuration line, and the store's `iterations.root_persona`. Without this, an agreeing pair of readings
 * could equally mean "the chip is right and the run is wrong".
 */
const entries = entryRoles(a);
expect(entries.length > 0, 'the run host wrote no configuration line naming the entry role');
expect(entries.every((line) => line.startsWith('architect ')), `the run did not resolve the configured default role as its entry role: ${JSON.stringify(entries)}`);
const roots = iterationRoots(local);
expect(roots.some((r) => r.root_persona === 'architect'), `no iteration was recorded with root_persona architect: ${JSON.stringify(roots)}`);
results.workspaceA = { configured: 'architect', atRest, duringRun, agreedChips: agreed, entryRoles: entries, iterationRoots: roots };

/*
 * ── 2. Workspace B (`default_persona: coding-agent`) ──
 *
 * `coding-agent` is NOT the word the retired fallback printed, so a chip that still reads `orchestrator` here has been
 * shown to ignore the configuration rather than to agree with it. This is the reading that makes workspace A's pass
 * mean something: without it, a chip hard-coded to the file's value could not be told from a chip hard-coded to
 * `orchestrator` whenever the two happen to agree.
 */
const b = await launch('second-default', workspaceB, local, preferences, {
  ROTARIS_CHILD_SCRIPT: 'wait:12000,answer',
  ROTARIS_CAPTURE_VIEWS: 'workspace@1500',
  ROTARIS_CAPTURE_INSPECT_AT: [`${RUN_STATE}@3500~7000`, `${PERSONA}@3500~7000`].join(';;'),
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '1200',
});
const bRest = stripAt(b, 7000);
expect(bRest.runState === 'Ready', `workspace B's chips were not read at rest — the run state is ${JSON.stringify(bRest.runState)}`);
expect(bRest.persona === 'coding-agent', `workspace B's persona chip at rest does not follow its configured default (REQ-CHAT-006/009): ${JSON.stringify(bRest.persona)} while the file states default_persona: coding-agent — a chip reading ${JSON.stringify(bRest.persona)} has been shown to ignore the configuration`);
results.workspaceB = { configured: 'coding-agent', atRest: bRest };


/*
 * ── 3. The WRITE limb of the same cause, in workspace A (a third launch) ──
 *
 * `entry.persona` is not only drawn: the model and reasoning chips key their CONFIGURATION write by it
 * (`main.tsx` -> `setNextModel`/`setField`, `config.setField`). On the unrepaired build that key was the literal
 * `orchestrator` at rest, so a model chosen on an idle composer was written to `personas.orchestrator.*` while the next
 * run starts as `default_persona` — the user's choice was silently not honoured. The write is measured on the FILE, not
 * on the chip: choose a model the configured role does not already name, and require the file to have moved that role's
 * `model`, and no other role's. This launch submits nothing; it ends idle.
 */
const before = readFileSync(join(workspaceA, '.rotaris', 'agents.yaml'), 'utf8');
const w = await launch('write-limb', workspaceA, local, preferences, {
  ROTARIS_CAPTURE_VIEWS: 'workspace@1500',
  // The `SearchableSelect` is driven as a person drives it: the trigger is clicked, the wanted option clicked.
  ROTARIS_CAPTURE_SELECT: `${MODEL}>>scripted@4000~9000`,
  ROTARIS_CAPTURE_INSPECT_AT: `${RUN_STATE}@3500~7000`,
  ROTARIS_CAPTURE_AFTER_MS: '13000',
});
const after = readFileSync(join(workspaceA, '.rotaris', 'agents.yaml'), 'utf8');
const config = after.slice(after.indexOf('personas:'));
/** The `model:` a named role's entry states in the written file, or null where the role is absent. @param {string} role */
const roleModel = (role) => {
  const at = config.indexOf(`\n  ${role}:`);
  if (at === -1) return null;
  const m = /model:\s*([A-Za-z0-9_.-]+)/.exec(config.slice(at, at + 200));
  return m?.[1] ?? null;
};
expect(w.log.includes('= scripted → chosen'), `the model chip's choice did not land — the select seam reported no choice: ${JSON.stringify(w.log.split('\n').filter((l) => /capture: select/.test(l)))}`);
expect(roleModel('architect') === 'scripted', `choosing a model at rest did not write it onto the CONFIGURED role (REQ-CHAT-006/009): personas.architect.model is ${JSON.stringify(roleModel('architect'))} in the file the launch wrote, not scripted — on the unrepaired build the write went to the literal fallback's role instead`);
expect(roleModel('orchestrator') === null, `choosing a model at rest wrote onto a role the workspace does not configure: personas.orchestrator appears in the file (${JSON.stringify(roleModel('orchestrator'))})`);
results.writeLimb = { configuredRole: 'architect', chosenModel: 'scripted', modelAfter: roleModel('architect'), strayOrchestratorModel: roleModel('orchestrator'), choseLanded: true, beforeHasArchModel: /architect:\s*\{[^}]*arch-model/.test(before) };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\npersona-chip proof PASSED — evidence under ${relative(repo, output)}`);
