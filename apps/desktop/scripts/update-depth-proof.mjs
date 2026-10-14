/**
 * The update-depth proof — live-run finding D8 in the built app
 * (`docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`).
 *
 * The `a68f121` duress run's renderer threw React error 185 ("Maximum update depth exceeded") seven times while two children
 * streamed reasoning at once. Nothing has reproduced it since. This proof keeps the instrument the note asked for and
 * drives the shape it names, free, on the scripted provider:
 *
 *   1. two-streams — a coordinator delegates two children, and each child streams a long deliberation
 *                    (`think:<deltas>:<ms>`, the scripted client's verification-only step) at the same time, on the
 *                    Workspace view. The `pendingLanes` trap (`lib/lanes-trap.mjs`) is installed through
 *                    `ROTARIS_CAPTURE_EVAL_AT` as soon as the window has drawn, and is read every 3 s. It counts every
 *                    commit, simulates React's nested-update count (the run of commits that leave Sync, InputContinuous or
 *                    Default work pending), and names the fibers that hold that work at each new high. The duress live
 *                    launch installs the same trap (`live-run.mjs`).
 *
 * What it asserts: the trap installed, its `rotaris-lanes-trap: installed` line reached the log through the console relay
 * (OQ-278, as the duress live launch checks), and it saw the commits of both streams (an instrument that saw nothing
 * measures nothing); both children streamed, their spans (`child_start` to `child_end`) overlapping for at least half a deliberation,
 * and the run completed; and no relayed renderer console line names React's
 * update-depth error (`renderer-console.mjs`), nor did the trap see one. React's own threshold is 50 such commits in a
 * row; the proof records the run's high, its holders and the longest synchronous burst, and does not bound them below
 * React's limit, because the note's question is what reaches 50, not what a quiet run stays under.
 *
 * Evidence under `.proof/update-depth-proof/`: `two-streams.log` and `.png`, `results.json`. `--skip-build` skips the
 * build. Under Xvfb on Linux (`xvfb-run -a -s "-screen 0 1600x1000x24"`).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app, buildDesktop, electron, evidenceDirectory, hostSwitches, launchOptions, oneDatabase } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { lanesTrapReading, lanesTrapSteps } from './lib/lanes-trap.mjs';
import { updateDepthErrors } from './lib/renderer-console.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const output = evidenceDirectory('update-depth-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const results = {};
const fail = (message) => { writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`); throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

const root = join(output, 'two-streams');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(local, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# update-depth proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  // The shipped code_intelligence entry's discovery costs every run start seconds; this proof measures the renderer.
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4', '',
].join('\n'));

/** Each child's deliberation: DELTAS reasoning deltas, one every DELTA_MS, so the two streams overlap for about 20 s. */
const DELTAS = 2000;
const DELTA_MS = 10;
const WAIT_MS = 120_000;
const name = 'two-streams';
const png = join(output, `${name}.png`);
const started = Date.now();
const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
  cwd: app, timeoutMs: WAIT_MS + 90_000, windowsHide: true,
  env: launchOptions({
    local, preferences, extra: {
      ROTARIS_SCRIPT: 'plan:2,delegate:coding-agent:alpha,delegate:coding-agent:beta,done,answer',
      ROTARIS_CHILD_SCRIPT: `think:${DELTAS}:${DELTA_MS},answer`,
      ROTARIS_CAPTURE_PROMPT: 'delegate two long deliberations at once',
      ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_VIEW_MS: '1200',
      // Installed before the prompt is submitted, read every 3 s while the children stream.
      ROTARIS_CAPTURE_EVAL_AT: lanesTrapSteps({ installAtMs: 1500, readEveryMs: 3000, untilMs: 90_000 }),
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '1500',
      ROTARIS_CAPTURE_PNG: png,
    },
  }),
});
const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
writeFileSync(join(output, `${name}.log`), log);
if (result.overran) fail(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
if (result.status !== 0) fail(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);

const db = new Database(oneDatabase(local), { readonly: true });
const session = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC LIMIT 1').get();
const kids = session ? db.prepare('SELECT task_id, canonical_name, state, spawned_at FROM children WHERE session_id = ? ORDER BY spawned_at').all(session.session_id) : [];
// When each child actually ran: its timeline's `child_start` and `child_end`. A child held behind a dependency or a slot has
// its `spawned_at` at the delegation, so only these say whether the two streams ran at once.
const spans = session ? db.prepare("SELECT name, at, metadata FROM timeline WHERE session_id = ? AND name IN ('child_start', 'child_end') ORDER BY ordinal").all(session.session_id) : [];
for (const k of kids) {
  const of = (name) => spans.find((t) => t.name === name && JSON.parse(t.metadata ?? '{}').task_id === k.task_id)?.at ?? null;
  k.started = of('child_start');
  k.ended = of('child_end');
}
db.close();
const trap = lanesTrapReading(log);
const depth = updateDepthErrors(log);
results.twoStreams = {
  elapsedMs: Date.now() - started,
  session: session ?? null,
  children: kids,
  trap: { installed: trap.installed, relayed: trap.relayed, reason: trap.reason, readings: trap.readings, last: trap.last, lines: trap.lines },
  updateDepthErrors: depth.map((e) => e.text),
  png,
};
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

expect(trap.installed, `the pendingLanes trap did not install: ${trap.reason}; see ${name}.log`);
// OQ-278: the instrument's install line reached the log through the console relay, as the duress live launch now checks.
expect(trap.relayed, `the pendingLanes trap installed, but its "rotaris-lanes-trap: installed" line was not relayed into the log; see ${name}.log`);
expect(trap.last !== null && trap.last.commits > 100 && trap.last.evaluations > 0, `the trap saw ${trap.last?.commits ?? 0} commits: an instrument that saw nothing measures nothing; see ${name}.log`);
expect(session?.execution_status === 'completed', `the run ended ${session?.execution_status ?? 'nowhere'}, not completed; see ${name}.log`);
expect(kids.length === 2 && kids.every((k) => k.state === 'succeeded'), `the two deliberating children did not both run to completion: ${JSON.stringify(kids)}`);
// The note's shape is two children streaming AT ONCE: each child must have started before the other ended, so the two
// deliberations overlapped. A run that serialized them (a delegation that waits on the first, `delegate:…:after`) passes
// every other assertion here while driving one stream at a time.
const overlapMs = kids.length === 2 && kids.every((k) => k.started && k.ended)
  ? Math.min(Date.parse(kids[0].ended), Date.parse(kids[1].ended)) - Math.max(Date.parse(kids[0].started), Date.parse(kids[1].started))
  : -1;
results.twoStreams.overlapMs = overlapMs;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
expect(overlapMs >= DELTAS * DELTA_MS / 2, `the two children's streams did not overlap for half a deliberation (${DELTAS * DELTA_MS / 2} ms): ${overlapMs} ms; ${JSON.stringify(kids)}`);
expect(depth.length === 0 && (trap.last?.updateDepthErrors ?? 0) === 0, `the renderer threw React's update-depth error ${depth.length} time(s) while two children streamed — D8 reproduced: ${JSON.stringify(depth.map((e) => e.text))} | the trap's lines: ${JSON.stringify(trap.lines)}`);
const errors = log.split('\n').filter((l) => /capture: renderer console:/.test(l) && !l.includes('rotaris-lanes-trap:'));
expect(errors.length === 0, `renderer console warnings or errors: ${errors.join(' | ')}`);
console.log(JSON.stringify(results, null, 2));
console.log(`\nupdate-depth-proof PASSED — ${trap.last.commits} commits; the nested-update run's high ${trap.last.maxRun} (React throws past 50), the longest burst ${trap.last.maxBurst}; ${depth.length} update-depth errors; evidence under ${output}`);
