import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { fieldSaveReading, runtimeFieldSteps } from './lib/settings-runtime-field.mjs';
import { TAG_EVAL, TAG_SELECTOR, tagReading, timeoutLine } from './lib/cut-off-reading.mjs';

/**
 * PD-ORCH-004 revisions 3 and 4 in the built app: a child cut off at its per-agent timeout while making progress leaves a
 * continuation offer, and the offer outlives the iteration — and the run — that raised it. Until this proof every first
 * execution of those revisions said "No built-app run took up an offer" (the scripted client could not cut a child off while
 * it made progress and then begin a second iteration; mission-proof's item 1d has cut one off since 2026-10-07, OQ-234).
 * Scripted client, scratch stores, the per-agent timeout at 3 s (`runtime.child_timeout`), every child scripted
 * `read,wait:6000,answer` so it is cut off having completed a call inside the stall window (making progress):
 *
 *   1. later-iteration — one launch. The coordinator delegates `alpha` and its turn ends; a second prompt typed into the
 *                        composer while the run is going is queued and becomes iteration 2 of the same run. Iteration 2's
 *                        root is told the open offer in its first message (revision 4's third limb) and takes it up with
 *                        `continuation_of` (the scripted `continue:` step); the continuation is cut off too and carries the
 *                        cut-off statement and no offer of its own ("continued once and never chained").
 *   2. later-run       — three launches over one store. The first run cuts `alpha` off and completes; the second sets
 *                        Settings › Runtime › Per-agent timeout to 1 minute and saves (`lib/settings-runtime-field.mjs`),
 *                        the field's description stating the stored 3 s until Save and 60 s after it (REQ-CONFIG-446);
 *                        the third reopens the session from the Sessions browser, and a follow-up prompt starts
 *                        a new run whose root reads the open offer in the handoff's progress context (revision 4's first
 *                        limb) and takes it up; the continuation finishes `succeeded`.
 *
 * Each scenario asserts from the store: the cut-off child's report (the timeout error "Child timed out after 3s", the
 * cut-off statement, the offer), the root that was told (its first recorded message, its iteration), the continuation's
 * `continuation_of` and its parent, and that the offer is no longer open. Evidence under `.proof/continuation-proof/`: PNGs,
 * logs, `results.json`. `--skip-build` skips the build; `--only=<scenario>[,…]` runs named scenarios alone.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'continuation-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const SCENARIOS = ['later-iteration', 'later-run'];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const wanted = onlyArg === undefined ? SCENARIOS : onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter((s) => s !== '');
for (const name of wanted) if (!SCENARIOS.includes(name)) throw new Error(`--only takes ${SCENARIOS.join(', ')}; got ${name}`);

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 400_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 400_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const agentsYaml = (childTimeout) => [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  // The shipped code_intelligence entry costs every run start its discovery; this proof measures another mechanism.
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4', `  child_timeout: ${childTimeout}`, '',
].join('\n');
function scenario(name) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# continuation proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), agentsYaml(3));
  return { root, workspace, local, preferences: join(root, 'preferences') };
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 150_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: s.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return { log, png, elapsedMs: Date.now() - started };
}
const results = {};
const failures = [];
const expect = (cond, message) => { if (!cond) throw new Error(message); };
async function scenarioRun(name, body) {
  if (!wanted.includes(name)) return;
  try { results[name] = await body(); }
  catch (cause) { failures.push(name); results[name] = { failed: cause instanceof Error ? cause.message : String(cause) }; }
}

/** The store's reading of the offer and its uptake: every child, its report, and each root's first recorded message. */
function readStore(s) {
  const db = new Database(oneDatabase(s.local), { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, iterations_completed FROM sessions ORDER BY created_at DESC').get();
    const children = db.prepare('SELECT task_id, canonical_name, persona, state, parent_id, iteration, continuation_of, report FROM children WHERE session_id = ? ORDER BY spawned_at').all(session.session_id)
      .map((c) => ({ ...c, report: c.report === null ? null : JSON.parse(c.report) }));
    const childIds = new Set(children.map((c) => c.task_id));
    const firsts = db.prepare('SELECT task_id, iteration, body FROM agent_messages WHERE session_id = ? AND kind = \'message\' ORDER BY task_id, seq').all(session.session_id);
    const roots = new Map();
    for (const row of firsts) if (!childIds.has(row.task_id) && !roots.has(row.task_id)) roots.set(row.task_id, { taskId: row.task_id, iteration: row.iteration, first: JSON.parse(row.body) });
    return { session, children, roots: [...roots.values()] };
  } finally { db.close(); }
}
const textOf = (message) => (message?.content ?? []).map((p) => (p.kind === 'text' ? p.text : '')).join('\n');
const OFFERS_HEADER = 'Open continuation offers (delegate with `continuation_of` set to the task id to take one up):';
const CHILD = 'read,wait:6000,answer';

/** What every scenario asserts of the cut-off child: REQ-ORCH-088's error, PD-ORCH-004's statement and its offer. */
function cutOff(child, limitS) {
  expect(child && child.state === 'failed', `the cut-off child: ${JSON.stringify(child && { name: child.canonical_name, state: child.state })}`);
  const r = child.report;
  expect(r?.errors?.some((e) => e.type === 'timeout' && e.message === `Child timed out after ${limitS}s`), `its timeout error: ${JSON.stringify(r?.errors)}`);
  expect(typeof r?.cut_off?.statement === 'string' && /while making progress/.test(r.cut_off.statement), `its cut-off statement: ${JSON.stringify(r?.cut_off)}`);
  return r.cut_off;
}

/**
 * What every scenario asserts of the uptake: the continuation names the cut-off child and is the later root's own child, the
 * later root's first recorded message told it the offer (the list's header and the child's line), the root that delegated the
 * child was not told it in its own first message (nothing was open then), and no offer is left open.
 */
function uptake(store, cutChild, continuation, laterRoot) {
  expect(continuation, `no child continues ${cutChild.task_id}: ${JSON.stringify(store.children.map((c) => ({ name: c.canonical_name, continuation_of: c.continuation_of })))}`);
  expect(continuation.continuation_of === cutChild.task_id, `the continuation's continuation_of: ${continuation.continuation_of} against ${cutChild.task_id}`);
  expect(laterRoot, `no root delegated the continuation (its parent ${continuation.parent_id})`);
  expect(laterRoot.taskId !== cutChild.parent_id, `the continuation was delegated by the root that delegated ${cutChild.canonical_name} (${laterRoot.taskId}), not by a later root`);
  const told = textOf(laterRoot.first);
  const line = `- ${cutChild.canonical_name} (${cutChild.task_id})`;
  expect(told.includes(`${OFFERS_HEADER}\n`) && told.split('\n').includes(line), `the later root's first message does not list the offer as "${line}": ${JSON.stringify(told.slice(-400))}`);
  const first = store.roots.find((x) => x.taskId === cutChild.parent_id);
  expect(first && !textOf(first.first).includes(OFFERS_HEADER), 'the delegating root\'s own first message listed an offer before any child was cut off');
  const continued = new Set(store.children.map((c) => c.continuation_of).filter((id) => id !== null));
  const open = store.children.filter((c) => typeof c.report?.cut_off?.continuation_offer === 'string' && !continued.has(c.task_id));
  expect(open.length === 0, `offers still open: ${open.map((c) => c.canonical_name).join(', ')}`);
  const list = told.slice(told.indexOf(OFFERS_HEADER)).split('\n');
  return { told: [list[0], ...list.slice(1).filter((l, i, all) => all.slice(0, i + 1).every((x) => x.startsWith('- ')))].join('\n'), line };
}

// 1. A later iteration's root takes the offer up (revision 4's "the root of each later iteration of the same run"). The root's
// steps: `delegate` alpha; a 12 s wait and an answer, which holds iteration 1 open while the second prompt is typed and queued;
// an answer when alpha's cut-off report wakes it — it does not take the offer, as the delegating agent may (revision 2); then
// iteration 2's root takes it up (`continue:`) and answers twice. Every child is cut off, so the continuation is too.
await scenarioRun('later-iteration', async () => {
  const s = scenario('later-iteration');
  const r = await launch('later-iteration', s, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,wait:12000,answer,answer,continue:coding-agent:alpha-continued,answer',
    ROTARIS_CHILD_SCRIPT: CHILD,
    ROTARIS_CAPTURE_PROMPT: 'delegate one long job',
    // Typed while the root's second call holds iteration 1 open, so it is queued (REQ-CHAT-040) and becomes iteration 2.
    ROTARIS_CAPTURE_TYPE: 'finish what was cut off>>composer@7000',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '100000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  });
  const firstCall = r.log.indexOf('(orchestrator)'); const typed = r.log.indexOf('capture: typed');
  expect(firstCall >= 0 && typed > firstCall, 'the second prompt was not typed while the first run was going (see later-iteration.log)');
  const store = readStore(s);
  writeFileSync(join(output, 'later-iteration.store.json'), `${JSON.stringify(store, null, 2)}\n`);
  expect(store.session.execution_status === 'completed' && store.session.iterations_completed === 2, `the run: ${JSON.stringify(store.session)} (two iterations expected: the queued prompt is the second)`);
  const alpha = store.children.find((c) => c.canonical_name === 'alpha');
  const cut = cutOff(alpha, 3);
  expect(typeof cut.continuation_offer === 'string' && cut.continuation_offer.includes(`continuation_of: "${alpha.task_id}"`), `alpha's offer: ${JSON.stringify(cut.continuation_offer)}`);
  const continuation = store.children.find((c) => c.continuation_of !== null);
  const laterRoot = store.roots.find((x) => x.taskId === continuation?.parent_id);
  const told = uptake(store, alpha, continuation, laterRoot);
  expect(alpha.iteration === 1 && continuation.iteration === 2 && laterRoot.iteration === 2, `iterations: alpha ${alpha.iteration}, the continuation ${continuation.iteration}, its root ${laterRoot.iteration}`);
  // "A continuation that itself times out while making progress SHALL receive the first two items and SHALL NOT receive a
  // continuation offer, so a piece of work is continued once and never chained."
  const chained = cutOff(continuation, 3);
  expect(chained.continuation_offer === null || chained.continuation_offer === undefined, `the continuation was offered one of its own: ${JSON.stringify(chained.continuation_offer)}`);
  return {
    session: store.session,
    cutOff: { name: alpha.canonical_name, taskId: alpha.task_id, iteration: alpha.iteration, error: `Child timed out after 3s`, statement: cut.statement, offer: cut.continuation_offer },
    laterRoot: { taskId: laterRoot.taskId, iteration: laterRoot.iteration, told: told.told },
    continuation: { name: continuation.canonical_name, taskId: continuation.task_id, continuationOf: continuation.continuation_of, state: continuation.state, statement: chained.statement, offer: chained.continuation_offer ?? null },
    png: r.png,
  };
});

// 2. A later run's root takes the offer up (revision 3's "or a later run of the session", revision 4's "the root of a new run,
// in the continuation handoff's progress context"). The first launch's run cuts alpha off and completes; the relaunch opens the
// session from the Sessions browser, after a launch that raised the limit to 1 minute through Settings › Runtime, and a
// follow-up prompt starts a new run whose root takes the offer up; the continuation, scripted `read,answer`, succeeds.
await scenarioRun('later-run', async () => {
  const s = scenario('later-run');
  const r1 = await launch('later-run-1', s, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer,answer', ROTARIS_CHILD_SCRIPT: CHILD,
    ROTARIS_CAPTURE_PROMPT: 'delegate one long job',
    // The live `cutoff` scenario's reading of the sidebar's timed-out tag, run here against the scripted provider first.
    ROTARIS_CAPTURE_EVAL_AT: `${TAG_EVAL}>>${TAG_SELECTOR}@~60000`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  });
  const tag = tagReading(r1.log);
  expect(tag?.text === 'timed out' && tag.title === timeoutLine(3, true) && tag.description === timeoutLine(3, true), `the sidebar's timed-out tag: ${JSON.stringify(tag)}`);
  const before = readStore(s);
  expect(before.session.execution_status === 'completed', `the first run: ${JSON.stringify(before.session)}`);
  const alpha = before.children.find((c) => c.canonical_name === 'alpha');
  const cut = cutOff(alpha, 3);
  expect(typeof cut.continuation_offer === 'string', `alpha's offer: ${JSON.stringify(cut.continuation_offer)}`);
  expect(before.children.length === 1, `the first run took the offer up itself: ${JSON.stringify(before.children.map((c) => c.canonical_name))}`);
  // PD-CONFIG-003: the limit raised to 1 minute through Settings › Runtime › Per-agent timeout and Save, as a person raises
  // it before trying again — never written into the file by the proof.
  const set = await launch('later-run-settings', s, runtimeFieldSteps({ id: 'child-timeout', value: 1 }));
  const saved = fieldSaveReading(set.log, { id: 'child-timeout' });
  const yaml = readFileSync(join(s.workspace, '.rotaris', 'agents.yaml'), 'utf8');
  expect(saved.afterEdit === 'Unsaved changes' && saved.atEnd === 'All changes saved' && saved.field === '1', `the Per-agent timeout control: ${JSON.stringify(saved)}`);
  expect(/^\s+child_timeout: 60\s*$/m.test(yaml), `Save did not store 60 seconds:\n${yaml}`);
  // REQ-CONFIG-446 / REQ-CONFIG-419: between the edit and Save the file still holds 3 s, and the field's description says so;
  // after Save it states the 60 s the file now holds. Until 2026-10-15 the first reading stated the unsaved 60 as stored
  // (docs/defects/fixed/a-runtime-timeout-fields-description-states-an-unsaved-value-as-stored.md).
  expect(saved.descriptionAfterEdit === 'Stored as 3 seconds.' && saved.descriptionAtEnd === 'Stored as 60 seconds.', `the Per-agent timeout's description before and after Save: ${JSON.stringify([saved.descriptionAfterEdit, saved.descriptionAtEnd])}`);
  const r2 = await launch('later-run-2', s, {
    ROTARIS_SCRIPT: 'continue:coding-agent:alpha-continued,answer,answer', ROTARIS_CHILD_SCRIPT: 'read,answer',
    ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_PROMPT: 'finish what was cut off',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  });
  expect(/capture: opened session "latest" from the browser/.test(r2.log), 'the relaunch did not open the stored session (see later-run-2.log)');
  expect(r2.log.includes('child_timeout=60 s'), `the second run did not read the limit Settings saved: ${/child_timeout=\d+ s/.exec(r2.log)?.[0] ?? 'no child_timeout line'}`);
  const store = readStore(s);
  writeFileSync(join(output, 'later-run.store.json'), `${JSON.stringify(store, null, 2)}\n`);
  expect(store.session.session_id === before.session.session_id && store.session.execution_status === 'completed', `the session after the follow-up: ${JSON.stringify(store.session)} (first ${before.session.session_id})`);
  const continuation = store.children.find((c) => c.continuation_of !== null);
  const laterRoot = store.roots.find((x) => x.taskId === continuation?.parent_id);
  const told = uptake(store, alpha, continuation, laterRoot);
  const handoff = textOf(laterRoot.first);
  expect(handoff.startsWith('This is a follow-up within an existing session.'), `the later root's first message is not the continuation handoff: ${JSON.stringify(handoff.slice(0, 120))}`);
  expect(continuation.state === 'succeeded' && continuation.report?.cut_off == null, `the continuation: ${continuation.state}, ${JSON.stringify(continuation.report?.cut_off ?? null)}`);
  return {
    session: store.session,
    cutOff: { name: alpha.canonical_name, taskId: alpha.task_id, error: 'Child timed out after 3s', statement: cut.statement },
    laterRoot: { taskId: laterRoot.taskId, iteration: laterRoot.iteration, handoff: true, told: told.told },
    continuation: { name: continuation.canonical_name, taskId: continuation.task_id, continuationOf: continuation.continuation_of, state: continuation.state },
    perAgentTimeoutControl: { ...saved, stored: 'child_timeout: 60' },
    sidebarTag: tag.title,
    png: [r1.png, set.png, r2.png],
  };
});

writeFileSync(join(output, 'results.json'), `${JSON.stringify({ failures, ...results }, null, 2)}\n`);
console.log(JSON.stringify({ failures, ...results }, null, 2));
if (failures.length > 0) process.exit(1);
