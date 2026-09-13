/**
 * The questions proof (Part AC): structured questions end to end — the `ask_questions` tool, the trailer row, the
 * stepper, and the two control operations behind them (REQ-CHAT-092..103, REQ-TOOLS-157/158; ADR-0010's fourth
 * execution and ADR-0016's fifth). Scripted client, scratch store, five launches against one scratch profile:
 *
 *   1. answer      — a scripted run calls `ask_questions`; the trailer appears on the whole-session update that
 *                    carries it, with no re-read and no timer; clicking it opens the stepper; the two steps are
 *                    answered (an option, then freeform) and submitted; the WAITING TOOL CALL receives them and the
 *                    trailer clears (REQ-CHAT-097..102).
 *   2. close       — Escape on a later step moves ONE STEP BACK with the answer already entered preserved, and
 *                    Escape on the first step cancels the whole prompt: exactly one `cancelQuestions` reaches the
 *                    run host, the waiting call is released at once rather than at the timeout, and the tool
 *                    observes "Questions were cancelled." (REQ-CHAT-101).
 *   3. elsewhere   — the same prompt answered from ANOTHER surface while the modal is open: the modal closes
 *                    programmatically and emits no second decision (REQ-CHAT-098).
 *   4. stale       — a delivery that no waiting call receives: the modal stays open with REQ-CHAT-102's sentence and
 *                    reports no success.
 *   5. invalid     — an action violating REQ-CHAT-092 is rejected before anything is shown: no trailer ever appears,
 *                    and the rejection names every violation.
 *
 * Evidence under `.proof/questions-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, oneDatabase } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'questions-proof');
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





const PROBES = [
  '[data-testid="row-question"]', '.row--question .row__trailer', '[data-testid="question-stepper"]', '[data-testid="question-pills"] li',
  '[data-testid="question-step-title"]', '[data-testid="question-step-description"]', '[data-testid="question-options"] button',
  '[data-testid="question-freeform"]', '[data-testid="question-back"]', '[data-testid="question-next"]',
  '[data-testid="question-submit"]', '[data-testid="question-failure"]', '.app-shell',
].join(';;');

function launch(name, workspace, local, preferences, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  const timed = [];
  const inspected = [];
  for (const line of log.split('\n')) {
    const end = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (end) { try { probes[end[1]] = JSON.parse(end[2]); } catch { probes[end[1]] = []; } continue; }
    const at = /^\[main (\S+)\] capture: probe-at (\d+) (.+?) → (\[.*\])\s*$/.exec(line);
    if (at) { try { timed.push({ wall: Date.parse(at[1]), at: Number(at[2]), selector: at[3], found: JSON.parse(at[4]) }); } catch { /* an unreadable probe is no probe */ } continue; }
    const ins = /capture: inspect-at (\d+) (.+?) → (\{.*\})\s*$/.exec(line);
    if (ins) { try { inspected.push({ at: Number(ins[1]), selector: ins[2], ...JSON.parse(ins[3]) }); } catch { /* an unreadable inspection is none */ } }
  }
  return { png, log, probes, timed, inspected };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
/** Every `control <op> …` main logged, in order — the count is what "exactly once" is measured against. */
const controls = (log, op) => log.split('\n').filter((l) => new RegExp(`control ${op} on `).test(l));

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Questions proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'runtime:',
  '  permission_mode: autonomous',
  // REQ-TOOLS-178 / REQ-CONFIG-126: the shared budget. 300 s is the registered default and REQ-CHAT-093's figure;
  // it is written here so the proof states the wait it is measuring against rather than inheriting it silently.
  '  approval_timeout_seconds: 300',
  '',
].join('\n'));
const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
git('init', '-q', '-b', 'main');
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
git('add', 'README.md', '.gitignore');
git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');

// The two-step action the scripted agent asks: one step with options, one freeform-only (REQ-CHAT-092's shape).
const QUESTIONS = JSON.stringify({
  ask: {
    steps: [
      { id: 'scope', title: 'Which scope should this change cover?', description: 'Pick the narrowest that still solves the problem.', options: [{ label: 'This file only' }, { label: 'The whole package', description: 'Slower, but consistent.' }] },
      { id: 'notes', title: 'Anything else the agent should know?', options: [], allow_freeform: true },
    ],
  },
  // REQ-CHAT-092 / REQ-TOOLS-157: three violations at once — an empty title, a repeated id, and a step offering nothing.
  bad: { steps: [{ id: 'a', title: '' }, { id: 'a', title: 'again', options: [], allow_freeform: false }] },
});

/** The transcript rows and the tool-call record the run actually wrote — the only evidence of what the TOOL saw. */
function readSession() {
  const db = new Database(oneDatabase(local), { readonly: true });
  const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  const rows = db.prepare('SELECT row_index, kind, body, tool_name, tool_status FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(session.session_id);
  // REQ-SESSION-136: `entry` is the settled record; `result` inside it is exactly what the WAITING TOOL CALL observed.
  const calls = db.prepare('SELECT tool_name, status, started_at, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(session.session_id)
    .map((c) => { let e = {}; try { e = JSON.parse(c.entry); } catch { e = {}; } return { ...c, result: String(e.result ?? '') }; });
  db.close();
  return { session, rows, calls };
}

const results = {};
// Probes taken every 250 ms across the window in which the ask happens, so the FIRST frame carrying the trailer is
// found rather than assumed. REQ-CHAT-097's budget is REQ-MONITOR-222's 250 ms at the 95th percentile.
const TRAILER = '.row--question .row__trailer';
const TRAILER_SWEEP = Array.from({ length: 28 }, (_, i) => `${TRAILER}@${1_500 + i * 250}`).join(';;');

// ── 1. answer ───────────────────────────────────────────────────────────────────────────────────────────────
// PD-CHAT-002: The run asks, the trailer appears, the docked all-in-one form auto-opens inside the transcript;
// all steps are rendered simultaneously; options and freeform are answered; Submit delivers in one payload.
const answer = launch('answer', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'ask,answer', ROTARIS_SCRIPT_QUESTIONS: QUESTIONS,
  ROTARIS_CAPTURE_PROMPT: 'Ask me something.',
  ROTARIS_CAPTURE_PROBE_AT: `${TRAILER_SWEEP};;[data-testid="question-stepper"]@9500;;[data-testid="question-pills"] li@9500;;[data-testid="question-submit"]@9500;;[data-testid="question-options"] button@11000;;[data-testid="question-freeform"]@11000;;[data-testid="question-submit"]@11000;;[data-testid="question-submit"]@15000;;[data-testid="row-question"]@18000`,
  ROTARIS_CAPTURE_CLICKS: '.row__trailer@9000;;[data-testid="question-options"] button>>This file only@10500;;[data-testid="question-freeform"]@11500;;[data-testid="question-submit"]@14500',
  ROTARIS_CAPTURE_TYPE_AT: 'Prefer the smaller change.@12500',
  // Form geometry measured in the built window.
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="question-stepper"]@9600;;.question-form__pill@9600',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '2000',
});
const askedAt = (() => {
  const { calls } = readSession();
  const ask = calls.find((c) => c.tool_name === 'ask_questions');
  if (!ask) throw new Error('no ask_questions call was recorded');
  return Date.parse(ask.started_at);
})();
const trailerProbes = answer.timed.filter((t) => t.selector === TRAILER).sort((a, b) => a.at - b.at);
const firstWithTrailer = trailerProbes.find((t) => t.found.length > 0);
if (!firstWithTrailer) throw new Error(`the question trailer never appeared:\n${answer.log.split('\n').filter((l) => /probe-at .*row-question/.test(l)).slice(0, 6).join('\n')}`);
const visibilityMs = firstWithTrailer.wall - askedAt;
// REQ-CHAT-097 / REQ-SESSION-071: the pending state is PUBLISHED. The sweep samples every 250 ms, so the latency is
// bounded above by one sample plus the publication; a state rediscovered by re-reading persisted state could not
// beat the sampling period the session read uses, and no reconcile was asked for in the window either.
if (visibilityMs > 1_500) throw new Error(`the trailer took ${visibilityMs} ms to appear after the tool call opened`);
const reconciles = controls(answer.log, 'reconcile').length + (answer.log.match(/session\.reconcile/g) ?? []).length;
if (reconciles > 0) throw new Error(`the surface re-read the session ${reconciles} time(s) while the prompt was pending`);
if (!/^\d+ steps? — /.test(firstWithTrailer.found[0].text)) throw new Error(`the trailer did not read "N steps — <first title>": "${firstWithTrailer.found[0].text}"`);
if (firstWithTrailer.found[0].text !== '2 steps — Which scope should this change cover?') throw new Error(`the trailer read "${firstWithTrailer.found[0].text}"`);

const at = (selector, ms) => answer.timed.find((t) => t.selector === selector && t.at === ms)?.found ?? [];
const stepper = at('[data-testid="question-stepper"]', 9500)[0];
if (!stepper) throw new Error('clicking the trailer did not open the stepper');
if (stepper.data['data-step'] !== '1' || stepper.data['data-steps'] !== '2') throw new Error(`the stepper opened at ${JSON.stringify(stepper.data)}`);
const pills = at('[data-testid="question-pills"] li', 9500);
if (pills.length !== 2) throw new Error(`the step indicator read ${JSON.stringify(pills.map((p) => p.data))}`);

// PD-CHAT-002: Submit is present on the form and is disabled until all steps are answered.
const submitBefore = at('[data-testid="question-submit"]', 9500)[0];
if (!submitBefore) throw new Error('Submit was absent on the question form');
if (submitBefore.data['data-disabled'] !== 'true') throw new Error('Submit was enabled before all steps were answered');

// Step 1: options
const options = at('[data-testid="question-options"] button', 11000);
if (options.filter((o) => o.data['data-selected'] === 'true').length !== 1) throw new Error(`after the click ${options.filter((o) => o.data['data-selected'] === 'true').length} option cards were selected`);

// Step 2: freeform editor rendered simultaneously in the all-in-one form
const freeform = at('[data-testid="question-freeform"]', 11000)[0];
if (!freeform) throw new Error('the freeform editor was not rendered for step 2 in the all-in-one form');

// Submit enabled once all steps answered
const submitAfter = at('[data-testid="question-submit"]', 15000)[0];
if (submitAfter?.data['data-disabled'] !== 'false') throw new Error('Submit stayed disabled after all steps were answered');

const box = answer.inspected.find((i) => i.selector === '[data-testid="question-stepper"]')?.matches?.[0]?.rect;
if (!box) throw new Error('the question form could not be measured');
const pill = answer.inspected.find((i) => i.selector === '.question-form__pill')?.matches ?? [];
if (pill.length !== 2) throw new Error(`the step indicator drew ${pill.length} pills`);
const gone = at('[data-testid="row-question"]', 18000);
if (gone.length !== 0) throw new Error('the trailer stayed after the answers were delivered');
const answered = readSession();
const askCall = answered.calls.find((c) => c.tool_name === 'ask_questions');
if (askCall.status !== 'ok') throw new Error(`the ask_questions call settled ${askCall.status}`);
// REQ-CHAT-102's whole point: the evidence that a WAITING TOOL CALL received the answers is the call's own result.
if (!/Received answers for 2 steps\./.test(askCall.result)) throw new Error(`the tool result did not carry the count: ${askCall.result}`);
if (!/## User Answers/.test(askCall.result)) throw new Error(`the tool result carried no answers section: ${askCall.result}`);
if (!/- \*\*scope\*\*: This file only/.test(askCall.result)) throw new Error(`the option answer did not reach the tool: ${askCall.result}`);
if (!/- \*\*notes\*\*: Prefer the smaller change\./.test(askCall.result)) throw new Error(`the freeform answer did not reach the tool: ${askCall.result}`);
if (answered.session.execution_status !== 'completed') throw new Error(`the run ended ${answered.session.execution_status} (${answered.session.stop_reason})`);
const answerControls = controls(answer.log, 'answerQuestion');
if (answerControls.length !== 1 || !/→ ok/.test(answerControls[0])) throw new Error(`the answer reached the run host ${answerControls.length} time(s): ${answerControls.join(' | ')}`);
if (controls(answer.log, 'cancelQuestions').length !== 0) throw new Error('a cancellation was emitted by a submission that succeeded');
results.answer = {
  trailer: firstWithTrailer.found[0].text,
  visibilityMs, reconcilesWhilePending: reconciles,
  pills: pills.map((p) => p.data['data-state']),
  submitDisabledWithoutAnswer: submitBefore.data['data-disabled'] === 'true',
  submitEnabledWithAnswer: submitAfter.data['data-disabled'] === 'false',
  freeformRendered: freeform !== undefined,
  optionsSelected: options.filter((o) => o.data['data-selected'] === 'true').length,
  toolResultFirstLine: askCall.result.split('\n')[0], answerControls: answerControls.length, trailerCleared: true,
  formSize: [Math.round(box.width), Math.round(box.height)], pillCount: pill.length,
};

// ── 2. close ────────────────────────────────────────────────────────────────────────────────────────────────
// PD-CHAT-002 / REQ-CHAT-101: Escape cancels the questions and releases the waiting call immediately.
rmSync(local, { recursive: true, force: true });
mkdirSync(local, { recursive: true });
const close = launch('close', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'ask,answer', ROTARIS_SCRIPT_QUESTIONS: QUESTIONS,
  ROTARIS_CAPTURE_PROMPT: 'Ask me something I will not answer.',
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="question-stepper"]@9500;;[data-testid="question-stepper"]@14000;;[data-testid="row-question"]@14500',
  ROTARIS_CAPTURE_CHORDS: 'Escape@11000',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '2000',
});
const closeOpened = close.timed.find((t) => t.selector === '[data-testid="question-stepper"]' && t.at === 9500)?.found ?? [];
if (closeOpened.length !== 1) throw new Error('the question form did not open before the close');
const closeGone = close.timed.find((t) => t.selector === '[data-testid="question-stepper"]' && t.at === 14000)?.found ?? [];
if (closeGone.length !== 0) throw new Error('the question form stayed open after Escape');
const cancels = controls(close.log, 'cancelQuestions');
if (cancels.length !== 1) throw new Error(`cancellation was emitted ${cancels.length} time(s), not exactly once: ${cancels.join(' | ')}`);
if (!/→ ok/.test(cancels[0])) throw new Error(`the cancellation was refused: ${cancels[0]}`);
const closed = readSession();
const closedCall = closed.calls.find((c) => c.tool_name === 'ask_questions');
if (!/Questions were cancelled\./.test(closedCall.result)) throw new Error(`the tool did not observe a cancellation: ${closedCall.result}`);
// The release is immediate: the cancel and the run's result are seconds apart, against a 300 s budget.
const cancelWall = Date.parse(/^\[main (\S+)\]/.exec(cancels[0])?.[1] ?? '');
const resultWall = Date.parse(/^\[main (\S+)\].*capture: wait for result satisfied/.exec(close.log.split('\n').find((l) => /wait for result satisfied/.test(l)) ?? '')?.[1] ?? '');
const releaseMs = Number.isNaN(cancelWall) || Number.isNaN(resultWall) ? -1 : resultWall - cancelWall;
if (releaseMs < 0 || releaseMs > 30_000) throw new Error(`the waiting call was released ${releaseMs} ms after the cancellation`);
if (controls(close.log, 'answerQuestion').length !== 0) throw new Error('a cancelled prompt also emitted an answer');
results.close = { cancelControls: cancels.length, releaseMs, budgetSeconds: 300, toolResult: closedCall.result.split('\n')[0], formClosed: true };

// ── 3. elsewhere ────────────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-098 / PD-CHAT-002: the pending state clears while the form is open (answered from another surface); the form closes
// programmatically and emits NO second decision.
rmSync(local, { recursive: true, force: true });
mkdirSync(local, { recursive: true });
const elsewhere = launch('elsewhere', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'ask,answer', ROTARIS_SCRIPT_QUESTIONS: QUESTIONS,
  ROTARIS_CAPTURE_PROMPT: 'Ask me something answered elsewhere.',
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="question-stepper"]@9500;;[data-testid="question-stepper"]@13000;;[data-testid="row-question"]@13000',
  ROTARIS_CAPTURE_CLICKS: '.row__trailer@9000',
  ROTARIS_CAPTURE_QUESTION_ELSEWHERE: 'scope@11000',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '2000',
});
if ((elsewhere.timed.find((t) => t.at === 9500)?.found ?? []).length !== 1) throw new Error('the question form did not open before the outside answer');
const outside = elsewhere.log.split('\n').find((l) => /capture: question-elsewhere/.test(l)) ?? '';
if (!/→ delivered/.test(outside)) throw new Error(`the outside answer was not delivered: ${outside}`);
if ((elsewhere.timed.find((t) => t.selector === '[data-testid="question-stepper"]' && t.at === 13000)?.found ?? []).length !== 0) throw new Error('the form stayed open after the prompt was answered elsewhere');
if ((elsewhere.timed.find((t) => t.selector === '[data-testid="row-question"]' && t.at === 13000)?.found ?? []).length !== 0) throw new Error('the trailer stayed after the prompt was answered elsewhere');
if (controls(elsewhere.log, 'answerQuestion').length !== 0 || controls(elsewhere.log, 'cancelQuestions').length !== 0) {
  throw new Error(`the closing form emitted a second decision: ${[...controls(elsewhere.log, 'answerQuestion'), ...controls(elsewhere.log, 'cancelQuestions')].join(' | ')}`);
}
const elsewhereCall = readSession().calls.find((c) => c.tool_name === 'ask_questions');
if (!/- \*\*scope\*\*: answered elsewhere/.test(elsewhereCall.result)) throw new Error(`the outside answer did not reach the tool: ${elsewhereCall.result}`);
results.elsewhere = { delivered: true, formClosed: true, secondDecisions: 0, toolResultFirstLine: elsewhereCall.result.split('\n')[0] };

// ── 4. stale ────────────────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-102: a delivery no waiting call received leaves the form open with the requirement's sentence, and no
// success is reported. The prompt is still pending throughout — what fails is the delivery, not the wait.
rmSync(local, { recursive: true, force: true });
mkdirSync(local, { recursive: true });
const stale = launch('stale', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'ask,answer', ROTARIS_SCRIPT_QUESTIONS: QUESTIONS,
  ROTARIS_CAPTURE_PROMPT: 'Ask me something undeliverable.',
  ROTARIS_CAPTURE_QUESTION_STALE: '1',
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="question-stepper"]@9500;;[data-testid="question-options"] button@11000;;[data-testid="question-freeform"]@11000;;[data-testid="question-stepper"]@16000;;[data-testid="question-failure"]@16000;;[data-testid="question-submit"]@16000',
  ROTARIS_CAPTURE_CLICKS: '.row__trailer@9000;;[data-testid="question-options"] button>>This file only@10500;;[data-testid="question-freeform"]@11500;;[data-testid="question-submit"]@13500',
  ROTARIS_CAPTURE_TYPE_AT: 'no notes@12000',
  ROTARIS_CAPTURE_AFTER_MS: '17000',
});
const staleControls = controls(stale.log, 'answerQuestion');
if (staleControls.length !== 1 || !/→ false/.test(staleControls[0])) throw new Error(`the stale delivery was not refused once: ${staleControls.join(' | ')}`);
const stillOpen = stale.timed.find((t) => t.selector === '[data-testid="question-stepper"]' && t.at === 16000)?.found ?? [];
if (stillOpen.length !== 1) throw new Error('the form did not stay open after a failed delivery');
const failure = stale.timed.find((t) => t.selector === '[data-testid="question-failure"]' && t.at === 16000)?.found ?? [];
if (failure.length !== 1) throw new Error('no failure message was shown after a failed delivery');
if (failure[0].text !== 'Could not deliver answers. The waiting agent is no longer available.') throw new Error(`the failure read "${failure[0].text}"`);
const staleSubmit = stale.timed.find((t) => t.selector === '[data-testid="question-submit"]' && t.at === 16000)?.found ?? [];
if (staleSubmit.length !== 1) throw new Error('Submit was gone after a failed delivery, so the answers could not be resent');
results.stale = { controls: staleControls.length, refused: true, formStayedOpen: true, message: failure[0].text };

// ── 5. invalid ──────────────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-092 / REQ-TOOLS-157: rejected BEFORE anything is shown — no trailer at any point, every violation named.
rmSync(local, { recursive: true, force: true });
mkdirSync(local, { recursive: true });
const invalid = launch('invalid', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'ask:bad,answer', ROTARIS_SCRIPT_QUESTIONS: QUESTIONS,
  ROTARIS_CAPTURE_PROMPT: 'Ask me something malformed.',
  ROTARIS_CAPTURE_PROBE_AT: Array.from({ length: 10 }, (_, i) => `${TRAILER}@${2_000 + i * 700}`).join(';;'),
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '2000',
});
if (invalid.timed.some((t) => t.found.length > 0)) throw new Error('a trailer appeared for an action that should have been rejected before anything was shown');
if (text(invalid.probes, '[data-testid="row-question"]').length !== 0) throw new Error('a trailer was on screen at the capture for a rejected action');
const invalidCall = readSession().calls.find((c) => c.tool_name === 'ask_questions');
if (!invalidCall) throw new Error('no ask_questions call was recorded for the malformed action');
if (invalidCall.status !== 'failed') throw new Error(`the malformed action settled ${invalidCall.status}`);
const named = ['empty title', 'must be unique', 'must offer options or freeform'].filter((s) => new RegExp(s).test(invalidCall.result));
if (named.length !== 3) throw new Error(`the rejection named ${named.length} of 3 violations: ${invalidCall.result}`);
results.invalid = { status: invalidCall.status, violationsNamed: named.length, trailerEverShown: false, firstLine: invalidCall.result.split('\n')[0] };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('PASSED');
