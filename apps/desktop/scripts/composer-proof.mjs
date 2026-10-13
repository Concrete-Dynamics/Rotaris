/**
 * The composer proof (Part AB): the composer's chips, its drafts, its history recall and the run header
 * (REQ-CHAT-004, -006, -007, -008, -009, -010, -014, -015, -016, -017, -038, -039, -155, -156, -158;
 * REQ-SHELL-069, REQ-SHELL-159, REQ-NOTIFY-066). ADR-0042's fifth execution.
 *
 * Seven launches against one scratch profile, plus one measurement made without a window:
 *
 *   1. draft      — a draft typed into workspace A through the composer's own change path, the divider dragged
 *                   by keyboard, then the window CLOSED by the user (REQ-SHELL-159's fourth flush point). The
 *                   preference file is then read from disk: the draft is under the workspace's own key and the
 *                   divider under `panels/workspace`.
 *   2. relaunch   — the same workspace again: the composer holds the draft CHARACTER FOR CHARACTER, the divider
 *                   is where it was left, the run header says `Ready` and shows no duration before any run, and
 *                   the three chips are enabled with no reason to state.
 *   3. other      — workspace B against the same preference root: its composer is empty and A's draft is
 *                   untouched on disk (REQ-CHAT-015's last sentence).
 *   4. run        — a scripted run in workspace A: the label vocabulary, the timing indicator rising and then
 *                   frozen at the run's total, the three chips disabled with their reason published through BOTH
 *                   the tooltip and the accessible description, the text area still editable (REQ-CHAT-156), the
 *                   queue header grammatical at one and at two (REQ-CHAT-168), and a send refused while the run
 *                   is cancelling with REQ-CHAT-007's exact sentence.
 *   4b. stop-run  — workspace B, a run inside a 20 s model call: the composer's own "Stop run" clicked; the label
 *                   reads "Cancelling…" and the control "Force stop" while the graceful stop waits for the call; the
 *                   permission mode changed through its chip inside that window, and the label still "Cancelling…"
 *                   (OQ-165's hold, REQ-SESSION-186); the run ends `user_cancelled` and does not rest at `running` or
 *                   `cancelling`.
 *   5. history    — three history entries pushed through the real command, then Up, Up, Down, Down over a typed
 *                   draft: the walk loads, clamps, walks back and restores the draft (REQ-CHAT-016).
 *   6. autonomous — REQ-CHAT-009/155: the confirmation raised, Cancel holding initial focus, a reflex Return
 *                   leaving the previous mode in place and the configuration file byte-identical.
 *
 *   7. (no window) REQ-CHAT-038's `QUEUED → TRIGGERED` transition under two simultaneous callers on the real
 *                  store, from two connections, with the loser's outcome measured rather than assumed.
 *
 * Evidence under `.proof/composer-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'composer-proof');
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

const expect = (condition, message) => { if (!condition) throw new Error(message); };


const PROBES = [
  '[data-testid="run-header"]', '[data-testid="run-state"]', '[data-testid="run-timing"]', '[data-testid="composer-divider"]',
  '[data-testid="composer-dock"]', '[data-testid="composer-strip"]',
  '[data-testid="chip-persona"] [data-ui-component="SearchableSelect"]', '[data-testid="chip-model"] [data-ui-component="SearchableSelect"]', '[data-testid="chip-reasoning"] [aria-haspopup="menu"]',
  '[data-testid="chip-mode-label"]', '.composer__input', '.queue__head span', '.composer__error', '[data-testid="composer-send"]',
  '.app-shell',
];

async function launch(name, workspace, local, preferences, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_VIEW_MS: '1500', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}\n${log.split('\n').slice(-40).join('\n')}`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  const inspects = {};
  for (const line of log.split('\n')) {
    const m = /capture: inspect-at (\d+) (.+?) → (\{.*\})\s*$/.exec(line);
    if (m) { try { inspects[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { /* an unreadable inspect stays absent */ } }
  }
  const evals = [];
  for (const line of log.split('\n')) {
    const m = /capture: eval-at (\d+) .+ → (.*)$/.exec(line);
    if (m) { try { evals.push({ at: Number(m[1]), value: JSON.parse(m[2]) }); } catch { evals.push({ at: Number(m[1]), value: m[2] }); } }
  }
  return { png, log, probes, inspects, evals };
}
/** Two workspaces are open across these launches, so a database is chosen by the origin the store records. */
function databaseFor(workspacePath) {
  const found = findDatabases(local).filter((file) => {
    const origin = join(dirname(file), 'origin.txt');
    return existsSync(origin) && readFileSync(origin, 'utf8').trim().toLowerCase() === workspacePath.toLowerCase();
  });
  if (found.length !== 1) throw new Error(`expected one workspace database for ${workspacePath}; found ${found.length}`);
  return found[0];
}
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const inspect = (r, selector, at) => r.inspects[`${selector}@${at}`] ?? null;
const match = (r, selector, at, index = 0) => inspect(r, selector, at)?.matches?.[index] ?? null;

const root = join(output, 'profile');
const workspaceA = join(root, 'alpha');
const workspaceB = join(root, 'beta');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
for (const dir of [workspaceA, workspaceB, local, preferences]) mkdirSync(dir, { recursive: true });
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
for (const ws of [workspaceA, workspaceB]) {
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  writeFileSync(join(ws, 'README.md'), '# composer proof workspace\n');
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), AGENTS_YAML);
}
/**
 * REQ-CHAT-015: "character for character". The text carries punctuation, a newline, a double space, a trailing
 * space and a non-ASCII character, because every one of those is something a naive store loses — and it is set
 * through the composer's OWN change path (the native value setter plus an `input` event), so the 200 ms publish
 * and the 400 ms write of REQ-CHAT-014 / REQ-SHELL-159 both run exactly as they do for a person typing.
 */
const DRAFT = 'Keep me — verbatim: two  spaces,\na second line, a trailing space, and a leaf 🌱 ';
const setComposer = (text) => `(() => { const el = document.querySelector('.composer__input'); if (!el) return 'no composer'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return el.value.length; })()`;
const readComposer = `(() => { const el = document.querySelector('.composer__input'); return el ? el.value : null; })()`;
const readPreferences = () => (existsSync(join(preferences, 'preferences.json')) ? JSON.parse(readFileSync(join(preferences, 'preferences.json'), 'utf8')) : {});
/** REQ-SHELL-159's registered spelling: `workspaces/{workspace-key}/composerDraft`, the key carrying no path. */
const DRAFT_KEY = /^workspaces\/[0-9a-f]{16}\/composerDraft$/;
const draftKeys = (document) => Object.keys(document).filter((k) => DRAFT_KEY.test(k));

const results = {};

// ── 1. The draft written, the divider dragged, the window closed by the user (REQ-CHAT-014/015, REQ-SHELL-159) ──
const draftRun = await launch('draft', workspaceA, local, preferences, {
  ROTARIS_CAPTURE_EVAL_AT: `${setComposer(DRAFT)}@2500;;${readComposer}@3200`,
  // REQ-CHAT-010: the divider is a real control — clicked to focus it, then three ArrowUp presses of 10 px each.
  ROTARIS_CAPTURE_CLICKS: '[data-testid="composer-divider"]@3600',
  ROTARIS_CAPTURE_KEYS: 'Up@3800;;Up@3900;;Up@4000',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="composer-divider"]@4300;;[data-testid="run-state"]@4300;;[data-testid="run-timing"]@4300',
  ROTARIS_CAPTURE_AFTER_MS: '4600',
});
const typedBack = draftRun.evals.find((e) => e.at === 3200)?.value;
expect(typedBack === DRAFT, `the composer did not hold what was typed into it: ${JSON.stringify(typedBack)}`);
const storedPreferences = readPreferences();
const keysAfterA = draftKeys(storedPreferences);
expect(keysAfterA.length === 1, `expected exactly one registered draft key; found ${JSON.stringify(keysAfterA)}`);
const keyA = keysAfterA[0];
expect(storedPreferences[keyA] === DRAFT, `the draft was not stored under ${keyA} character for character: ${JSON.stringify(storedPreferences[keyA])}`);
// REQ-SHELL-006: the KEY carries no path — a workspace path holds separators a slash-namespaced
// key cannot. This read the whole serialised document until 2026-09-12 — `!JSON.stringify(
// storedPreferences).includes('alpha')` — and the falsified reason is kept beside its
// replacement: main's `workspace/lastOpened` (the startup resolution of that day) stores a
// workspace path as a legitimate VALUE, so the document-wide scan began failing a registration
// it was never about. What the requirement forbids is a path spelled into a key.
expect(Object.keys(storedPreferences).every((key) => !key.includes('alpha') && !/[\\:]/.test(key)),
  `a preference key spells a workspace path: ${JSON.stringify(Object.keys(storedPreferences))}`);
const draggedTo = storedPreferences['panels/workspace'];
expect(draggedTo && draggedTo.version === 1 && draggedTo.panes === 2, `the divider did not persist a pane layout: ${JSON.stringify(draggedTo)}`);
expect(draggedTo.sizes[1] === 180, `three ArrowUp presses of 10 px from 150 px should store 180: ${JSON.stringify(draggedTo.sizes)}`);
const beforeAnyRun = match(draftRun, '[data-testid="run-timing"]', 4300);
expect(beforeAnyRun?.attrs['data-seconds'] === '', `the run header showed a duration before any run: ${JSON.stringify(beforeAnyRun?.text)}`);
expect(match(draftRun, '[data-testid="run-state"]', 4300)?.text === 'Ready', 'the idle run-state label is not REQ-CHAT-008’s "Ready"');
results.draft = { typedBack: DRAFT.length, storedUnderKey: keyA, characterForCharacter: true, dividerStored: draggedTo.sizes, runStateBeforeAnyRun: 'Ready', durationBeforeAnyRun: '' };

// ── 2. The relaunch: the draft and the divider come back; the chips are enabled and state no reason ──
const back = await launch('relaunch', workspaceA, local, preferences, {
  ROTARIS_CAPTURE_EVAL_AT: `${readComposer}@3200`,
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="composer-divider"]@3400;;[data-testid="chip-model"] [data-ui-component="SearchableSelect"]@3400;;[data-testid="chip-reasoning"] [aria-haspopup="menu"]@3400;;[data-testid="chip-persona"] [data-ui-component="SearchableSelect"]@3400;;[data-testid="chip-mode-label"]@3400;;[data-testid="composer-send"]@3400;;[data-testid="composer-strip"]@3400;;[data-testid="composer-dock"]@3400',
  ROTARIS_CAPTURE_AFTER_MS: '3800',
});
const restored = back.evals.find((e) => e.at === 3200)?.value;
expect(restored === DRAFT, `the draft did not survive the quit character for character: ${JSON.stringify(restored)}`);
expect(match(back, '[data-testid="composer-divider"]', 3400)?.attrs['aria-valuenow'] === '180', 'the divider position did not survive the relaunch');
for (const chip of ['chip-model', 'chip-persona']) {
  const el = match(back, `[data-testid="${chip}"] [data-ui-component="SearchableSelect"]`, 3400);
  expect(el !== null, `${chip} is not on screen`);
  expect(el.attrs['aria-disabled'] !== 'true', `${chip} is disabled while the session is idle (REQ-CHAT-006)`);
}
// PD-CHAT-001: the reasoning chip is a menu button now, and it is enabled while the session is idle.
const reasoningChip = match(back, '[data-testid="chip-reasoning"] [aria-haspopup="menu"]', 3400);
expect(reasoningChip !== null, 'the reasoning chip is not on screen');
expect(reasoningChip.attrs['aria-disabled'] !== 'true', 'chip-reasoning is disabled while the session is idle (REQ-CHAT-006)');
const modeLabel = match(back, '[data-testid="chip-mode-label"]', 3400)?.text ?? '';
expect(modeLabel === 'mode: ask', `the permission chip should name the CONFIGURED mode the next run starts from: ${JSON.stringify(modeLabel)}`);
// PD-CHAT-001 revision 2 (the docked strip): the send is the strip's short pill — the mode's short label
// visible, the spec's own wording as its accessible name, so REQ-CHAT-005 still states the mode.
const primary = match(back, '[data-testid="composer-send"]', 3400);
expect(primary?.text === 'Run', `with no session the send pill should read "Run", not ${JSON.stringify(primary?.text)}`);
expect(primary?.attrs['aria-label'] === 'Start run. Persona orchestrator. Model scripted. Control Enter submits from anywhere in the window.', `the send pill's accessible name is not the spec wording: ${JSON.stringify(primary?.attrs['aria-label'])}`);
const strip = match(back, '[data-testid="composer-strip"]', 3400);
expect(strip !== null, 'the composer strip is not on screen');
// The dock is the strip's contour: one border around field and strip, the field's own border gone.
const dock = match(back, '[data-testid="composer-dock"]', 3400);
expect(dock !== null, 'the composer dock is not on screen');
results.relaunch = { draftRestored: true, dividerRestored: 180, chipsEnabled: true, modeLabel, primaryAction: primary?.text, sendName: primary?.attrs['aria-label'], stripOnScreen: true, dockOnScreen: true };

// ── 3. Another workspace, same preference root: the draft does not follow (REQ-CHAT-015) ──
const other = await launch('other-workspace', workspaceB, local, preferences, {
  ROTARIS_CAPTURE_EVAL_AT: `${readComposer}@3200`,
  ROTARIS_CAPTURE_AFTER_MS: '3600',
});
const inB = other.evals.find((e) => e.at === 3200)?.value;
expect(inB === '', `workspace B's composer showed another workspace's draft: ${JSON.stringify(inB)}`);
const afterB = readPreferences();
expect(afterB[keyA] === DRAFT, 'opening another workspace disturbed the first workspace’s stored draft');
// B may register a key of its own the moment its empty composer flushes; what it may never hold is A's text.
for (const key of draftKeys(afterB)) expect(key === keyA || afterB[key] === '', `workspace B's draft key ${key} holds ${JSON.stringify(afterB[key])}`);
results.otherWorkspace = { composer: '', otherDraftIntact: true, keys: draftKeys(afterB).length };

// ── 4. A run: the labels, the timing, the disabled chips and their reasons, the queue, and the cancelling refusal ──
const RUN_WAIT_MS = 16_000;
const run = await launch('run', workspaceA, local, preferences, {
  ROTARIS_SCRIPT: `wait:${RUN_WAIT_MS},answer`,
  ROTARIS_CAPTURE_PROMPT: 'Exercise the composer.',
  ROTARIS_CAPTURE_PROMPT_MS: '2500',
  // Two follow-ups queued while the run is active (REQ-CHAT-035), so the panel's count is read at one and at two.
  ROTARIS_CAPTURE_TYPE: 'first follow-up@5200;;second follow-up@7200',
  ROTARIS_CAPTURE_INSPECT_AT: [
    '[data-testid="run-state"]@4200', '[data-testid="run-timing"]@4200', '[data-testid="chip-model"] [data-ui-component="SearchableSelect"]@4200',
    '[data-testid="chip-reasoning"] [aria-haspopup="menu"]@4200', '[data-testid="chip-persona"] [data-ui-component="SearchableSelect"]@4200', '.composer__input@4200',
    '[data-testid="chip-mode-label"]@4200', '[data-testid="composer-send"]@4200',
    '[data-testid="chip-model"] .visually-hidden@4200', '[data-testid="chip-reasoning"] .visually-hidden@4200', '[data-testid="chip-persona"] .visually-hidden@4200',
    '.queue__head span@6200', '.queue__head span@8200',
    '[data-testid="run-timing"]@12200',
  ].join(';;'),
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS + 60_000), ROTARIS_CAPTURE_AFTER_MS: '2500',
}, RUN_WAIT_MS + 120_000);
const runState = match(run, '[data-testid="run-state"]', 4200)?.text;
expect(runState === 'Run active', `the run-state label during a run should be REQ-CHAT-008's "Run active", not ${JSON.stringify(runState)}`);
const composerDuringRun = match(run, '.composer__input', 4200);
expect(composerDuringRun?.attrs['disabled'] === undefined, 'the composer text area was disabled during a run (REQ-CHAT-006, REQ-CHAT-156)');
expect(composerDuringRun?.attrs['placeholder'] === 'Run active — write a follow-up for the next iteration…', `the first placeholder is not REQ-CHAT-004's: ${JSON.stringify(composerDuringRun?.attrs['placeholder'])}`);
expect(match(run, '[data-testid="composer-send"]', 4200)?.text === 'Queue', 'the send pill is not labelled Queue during a run (REQ-CHAT-005, REQ-CHAT-156)');
expect(/^mode: /.test(match(run, '[data-testid="chip-mode-label"]', 4200)?.text ?? ''), 'the permission-mode chip vanished during a run (REQ-CHAT-006)');
// REQ-CHAT-006/007: every disabled chip publishes its reason through BOTH the tooltip and the accessible description.
const REASON = 'Run controls are unavailable while run active';
const chipReasons = {};
for (const chip of ['chip-model', 'chip-persona']) {
  const el = match(run, `[data-testid="${chip}"] [data-ui-component="SearchableSelect"]`, 4200);
  expect(el?.attrs['aria-disabled'] === 'true', `${chip} was enabled while the run was active (REQ-CHAT-006)`);
  expect(el.attrs['title'] === REASON, `${chip}'s tooltip is not the reason text: ${JSON.stringify(el.attrs['title'])}`);
  expect(el.attrs['aria-describedby'] === `${chip}-reason`, `${chip} has no accessible description (REQ-CHAT-007)`);
  chipReasons[chip] = { tooltip: el.attrs['title'], describedBy: el.attrs['aria-describedby'] };
}
// PD-CHAT-001: the reasoning chip publishes the same reason through the same two channels, as a menu button.
{
  const el = match(run, '[data-testid="chip-reasoning"] [aria-haspopup="menu"]', 4200);
  expect(el?.attrs['aria-disabled'] === 'true', 'chip-reasoning was enabled while the run was active (REQ-CHAT-006)');
  expect(el.attrs['title'] === REASON, `chip-reasoning's tooltip is not the reason text: ${JSON.stringify(el.attrs['title'])}`);
  expect(el.attrs['aria-describedby'] === 'chip-reasoning-reason', 'chip-reasoning has no accessible description (REQ-CHAT-007)');
  chipReasons['chip-reasoning'] = { tooltip: el.attrs['title'], describedBy: el.attrs['aria-describedby'] };
}
for (const chip of ['chip-model', 'chip-persona']) {
  const described = match(run, `[data-testid="${chip}"] .visually-hidden`, 4200);
  expect(described?.text === REASON, `${chip}'s accessible description does not carry the reason: ${JSON.stringify(described?.text)}`);
  chipReasons[chip].description = described.text;
}
{
  const described = match(run, '[data-testid="chip-reasoning"] .visually-hidden', 4200);
  expect(described?.text === REASON, `chip-reasoning's accessible description does not carry the reason: ${JSON.stringify(described?.text)}`);
  chipReasons['chip-reasoning'].description = described.text;
}
// REQ-CHAT-168: the queue header is grammatical at the count it carries — read at one and at two.
const queueAtOne = match(run, '.queue__head span', 6200)?.text;
const queueAtTwo = match(run, '.queue__head span', 8200)?.text;
expect(queueAtOne === 'Queued messages (1)', `the queue header at one reads ${JSON.stringify(queueAtOne)}`);
expect(queueAtTwo === 'Queued messages (2)', `the queue header at two reads ${JSON.stringify(queueAtTwo)}`);
// REQ-CHAT-158: the value rises while the run is inside a model call.
const early = Number(match(run, '[data-testid="run-timing"]', 4200)?.attrs['data-seconds'] ?? -1);
const later = Number(match(run, '[data-testid="run-timing"]', 12200)?.attrs['data-seconds'] ?? -1);
expect(early >= 0 && later > early, `the run-timing indicator did not rise: ${early} → ${later}`);
expect(match(run, '[data-testid="run-timing"]', 12200)?.attrs['data-frozen'] === '0', 'the indicator claimed to be frozen while the run was active');
// The end state: the label, and the value frozen at the run's total wall-clock duration.
const db = new Database(databaseFor(workspaceA), { readonly: true });
const sessionRow = db.prepare('SELECT session_id, execution_status, run_started_at, updated_at FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
const queuedRows = db.prepare('SELECT prompt_id, session_id, content, status, context_snapshot FROM queued_prompts ORDER BY position').all();
db.close();
expect(sessionRow.execution_status === 'completed', `the run ended ${sessionRow.execution_status}`);
const endState = first(run.probes, '[data-testid="run-state"]')?.text;
expect(endState === 'Completed', `the terminal run-state label is not "Completed": ${JSON.stringify(endState)}`);
const frozen = first(run.probes, '[data-testid="run-timing"]');
const total = Math.floor((Date.parse(sessionRow.updated_at) - Date.parse(sessionRow.run_started_at)) / 1000);
expect(frozen?.data['data-frozen'] === '1', 'the indicator did not freeze at a terminal state');
expect(Number(frozen?.data['data-seconds']) === total, `the frozen value ${frozen?.data['data-seconds']} is not the run's total ${total}`);
// REQ-CHAT-039: every queued prompt is owned by the session it was submitted to, and no other.
expect(queuedRows.length === 2, `expected two queued prompts; found ${queuedRows.length}`);
expect(queuedRows.every((p) => p.session_id === sessionRow.session_id), 'a queued prompt is scoped to another session');
results.run = {
  labelDuringRun: runState, labelAtEnd: endState, composerEditableDuringRun: true, primaryAction: 'Queue',
  chipReasons, queueHeaders: [queueAtOne, queueAtTwo], timing: { early, later, frozenSeconds: Number(frozen?.data['data-seconds']), runTotal: total },
  queuedPrompts: queuedRows.map((p) => ({ owner: p.session_id, status: p.status, snapshot: p.context_snapshot })),
};

// ── 4b. The composer's Stop run, pressed, and the mode changed while the stop is pending (REQ-SESSION-186, OQ-165) ──
// Until 2026-10-13 no proof pressed it: the stop's hold (`Run.stopAccepted`, first-executions 2026-10-06) was shown by
// the engine's case driving `op: 'cancel'` through `Sessions.control`. Here the real button is clicked while the run is
// inside a 20 s model call, in workspace B (A's session is the one launches 5 and 6 read). The first press stops
// gracefully (REQ-SESSION-092): the call in flight is let finish, so the stop stays pending for most of the wait — the
// window the 2026-10-06 defect lived in. Inside it the permission mode is changed through the chip, which saves the run;
// before the repair that save wrote `running` over the stop's `cancelling`. The label must hold "Cancelling…" past the
// mode change, the button offer "Force stop", and the run end `user_cancelled` once the call returns.
const STOP_WAIT_MS = 20_000;
const stopped = await launch('stop-run', workspaceB, local, preferences, {
  ROTARIS_SCRIPT: `wait:${STOP_WAIT_MS},answer`,
  ROTARIS_CAPTURE_PROMPT: 'Run long enough to be stopped.',
  ROTARIS_CAPTURE_PROMPT_MS: '2500',
  // `~`: pressed as soon as the control is on screen, inside the model call's wait.
  ROTARIS_CAPTURE_CLICKS: '.btn-danger>>Stop run@~6000',
  ROTARIS_CAPTURE_MODE: 'restricted', ROTARIS_CAPTURE_MODE_MS: '9000',
  ROTARIS_CAPTURE_INSPECT_AT: ['[data-testid="run-state"]@7500', '.btn-danger@7500', '[data-testid="run-state"]@14000', '[data-testid="chip-mode-label"]@14000'].join(';;'),
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(STOP_WAIT_MS + 45_000), ROTARIS_CAPTURE_AFTER_MS: '1500',
}, STOP_WAIT_MS + 120_000);
expect(stopped.log.includes('capture: clicked "Stop run"') && !stopped.log.includes('capture: "Stop run" is not under the pointer'), 'the Stop run press was not made on its own control — see stop-run.log');
expect(/control cancel on [0-9a-f-]+ → ok/.test(stopped.log), 'the press reached no `session.control` cancel — see stop-run.log');
const pendingLabel = match(stopped, '[data-testid="run-state"]', 7500)?.text;
expect(pendingLabel === 'Cancelling…', `after the press the run-state label reads ${JSON.stringify(pendingLabel)}, not "Cancelling…"`);
const forceButton = (inspect(stopped, '.btn-danger', 7500)?.matches ?? []).map((m) => m.text);
expect(forceButton.includes('Force stop'), `the pending stop's control does not offer "Force stop": ${JSON.stringify(forceButton)}`);
expect(stopped.log.includes('capture: clicked "restricted"'), 'the permission mode was not changed during the stop — see stop-run.log');
const modeAfter = match(stopped, '[data-testid="chip-mode-label"]', 14000)?.text;
expect(modeAfter === 'mode: restricted', `the mode change during the stop did not take: ${JSON.stringify(modeAfter)}`);
const heldLabel = match(stopped, '[data-testid="run-state"]', 14000)?.text;
expect(heldLabel === 'Cancelling…', `after a mode change during the stop the run-state label reads ${JSON.stringify(heldLabel)}: the stop's cancelling was not held (OQ-165, REQ-SESSION-186)`);
const sdb = new Database(databaseFor(workspaceB), { readonly: true });
const stoppedRow = sdb.prepare('SELECT session_id, execution_status, stop_reason, run_started_at, updated_at FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
sdb.close();
expect(stoppedRow?.stop_reason === 'user_cancelled', `the pressed stop did not end the run user_cancelled: ${JSON.stringify(stoppedRow)}`);
expect(stoppedRow.execution_status !== 'running' && stoppedRow.execution_status !== 'cancelling', `the stopped session still reads ${stoppedRow.execution_status} once the run rests (OQ-165's hold must end with the run)`);
const stoppedLabel = first(stopped.probes, '[data-testid="run-state"]')?.text;
expect(stoppedLabel !== 'Run active' && stoppedLabel !== 'Cancelling…', `the run-state label once the run rests reads ${JSON.stringify(stoppedLabel)}`);
results.stopRun = {
  pressed: 'Stop run', pendingLabel, pendingControl: 'Force stop', modeChangedDuringStop: modeAfter, labelAfterModeChange: heldLabel,
  status: stoppedRow.execution_status, stopReason: stoppedRow.stop_reason, labelAtRest: stoppedLabel,
  runSeconds: (Date.parse(stoppedRow.updated_at) - Date.parse(stoppedRow.run_started_at)) / 1000,
};

// ── 5. REQ-CHAT-016: the history walk over a typed draft ──
const history = await launch('history', workspaceA, local, preferences, {
  // Part X's seam pushes through the REAL `prompts.push` command, so the store and its ordering are exercised.
  ROTARIS_CAPTURE_PROMPTS: 'history>>oldest entry@2200;;history>>middle entry@2400;;history>>newest entry@2600',
  ROTARIS_CAPTURE_EVAL_AT: [
    `${setComposer('a draft in progress')}@3200`,
    `${readComposer}@3600`, `${readComposer}@4000`, `${readComposer}@4400`, `${readComposer}@4800`, `${readComposer}@5200`, `${readComposer}@5600`,
  ].join(';;'),
  // Up, Up, Up walking older; Down, Down, Down walking newer and, past the newest, restoring the saved draft.
  ROTARIS_CAPTURE_KEYS: 'Up@3400;;Up@3800;;Up@4200;;Down@4600;;Down@5000;;Down@5400',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
const walked = [3600, 4000, 4400, 4800, 5200, 5600].map((at) => history.evals.find((e) => e.at === at)?.value);
expect(walked[0] === 'newest entry', `the first Up did not load the newest entry: ${JSON.stringify(walked[0])}`);
expect(walked[1] === 'middle entry', `the second Up did not walk older: ${JSON.stringify(walked[1])}`);
expect(walked[2] === 'oldest entry', `the third Up did not walk older again: ${JSON.stringify(walked[2])}`);
expect(walked[3] === 'middle entry', `Down did not walk newer: ${JSON.stringify(walked[3])}`);
expect(walked[4] === 'newest entry', `the second Down did not walk newer again: ${JSON.stringify(walked[4])}`);
// REQ-CHAT-016: past the newest entry, Down restores the draft the first Up saved.
expect(walked[5] === 'a draft in progress', `the saved draft was not restored past the newest entry: ${JSON.stringify(walked[5])}`);
results.history = { walk: walked, entriesPushed: 3 };

// ── 6. REQ-CHAT-009 / REQ-CHAT-155: the autonomous confirmation, declined by a reflex Return ──
// PD-CHAT-001: the presets live in the mode chip's popover now — open it, then choose autonomous from the menu.
const configBefore = readFileSync(join(workspaceA, '.rotaris', 'agents.yaml'), 'utf8');
const autonomous = await launch('autonomous', workspaceA, local, preferences, {
  ROTARIS_CAPTURE_CLICKS: '[data-testid="chip-mode"] [aria-haspopup="menu"]@3000;;.chip-menu__panel [role="menuitemradio"]:nth-child(3)@3200',
  ROTARIS_CAPTURE_INSPECT_AT: '.dialog-actions .btn-secondary@3600;;.dialog@3600;;.dialog@4600;;[data-testid="chip-mode-label"]@4600',
  // The reflex confirm: an empty type step is a bare Return (down, char, up) into whatever holds focus — which is
  // what REQ-CHAT-009 means by "confirming by reflex". Cancel holds initial focus, so the reflex declines.
  ROTARIS_CAPTURE_TYPE: '@4000',
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
const focused = inspect(autonomous, '.dialog-actions .btn-secondary', 3600)?.active;
expect(inspect(autonomous, '.dialog', 3600)?.matches?.length === 1, 'the autonomous confirmation was not raised (REQ-CHAT-009, REQ-CHAT-155)');
expect((focused?.className ?? '').includes('btn-secondary'), `Cancel did not hold initial focus; focus was on ${JSON.stringify(focused)}`);
expect(inspect(autonomous, '.dialog', 4600)?.matches?.length === 0, 'the dialog is still open after the reflex Return');
const configAfter = readFileSync(join(workspaceA, '.rotaris', 'agents.yaml'), 'utf8');
expect(configAfter === configBefore, 'declining the confirmation still wrote the autonomous mode');
expect(/permission_mode: ask/.test(configAfter), 'the previous permission mode is not in place after the decline');
results.autonomous = { dialogRaised: true, initialFocus: focused?.className ?? '', modeAfterDecline: 'ask', configurationByteIdentical: true };

/**
 * ── 7. REQ-CHAT-038: `QUEUED → TRIGGERED` is atomic and succeeds for exactly ONE caller ──
 *
 * Measured against the real store with the real statement, from TWO connections, which is what the amended
 * REQ-CHAT-041 means by "one authoritative service … across processes": the queue is a table, and the claim is
 * a conditional UPDATE whose row count decides. The loser's outcome is measured in both of its forms — it is
 * locked out while the winner's transaction is open, and once the winner commits it observes that the prompt is
 * no longer QUEUED and leaves it alone.
 */
const storeFile = databaseFor(workspaceA);
const one = new Database(storeFile, { timeout: 0 });
const two = new Database(storeFile, { timeout: 0 });
const session = one.prepare('SELECT session_id FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get().session_id;
one.prepare("INSERT INTO queued_prompts (session_id, prompt_id, position, content, status, created_at, context_snapshot) VALUES (?, 'race-1', 99, 'consume me once', 'QUEUED', 't', NULL)").run(session);
const claim = (db, at) => db.prepare("UPDATE queued_prompts SET status = 'TRIGGERED', triggered_at = ? WHERE session_id = ? AND prompt_id = 'race-1' AND status = 'QUEUED'").run(at, session).changes;
one.prepare('BEGIN IMMEDIATE').run();
const winner = claim(one, 'caller-one');
let lockedOut = null;
try { claim(two, 'caller-two'); } catch (cause) { lockedOut = String(cause.code ?? cause); }
one.prepare('COMMIT').run();
const loserAfterCommit = claim(two, 'caller-two');
const raced = two.prepare("SELECT status, triggered_at FROM queued_prompts WHERE session_id = ? AND prompt_id = 'race-1'").get(session);
one.close();
two.close();
expect(winner === 1, `the first caller did not claim the prompt: ${winner} row(s) changed`);
expect(lockedOut !== null && /BUSY|LOCKED/.test(lockedOut), `the second caller was not held off while the transition was in flight: ${lockedOut}`);
expect(loserAfterCommit === 0, `the second caller claimed the same prompt after the commit: ${loserAfterCommit} row(s) changed`);
expect(raced.status === 'TRIGGERED' && raced.triggered_at === 'caller-one', `the losing caller overwrote the winner: ${JSON.stringify(raced)}`);
results.exactlyOnce = { winnerRowsChanged: winner, loserWhileInFlight: lockedOut, loserAfterCommit, finalState: raced };

/**
 * ── What this proof does NOT establish, recorded here rather than left to be assumed ──
 */
results.notEstablished = {
  'REQ-CHAT-007 second limb': 'implemented and unreachable: nothing in this build raises a project-setup prompt that gates execution (the code-intelligence setup of REQ-MCP-099/112 is a settings action and gates nothing).',
  'REQ-CHAT-155 third limb': 'transcript clearing’s confirmation dialog (REQ-CHAT-083) is out of the plan with section 14; 155 is met in two limbs of three.',
  'REQ-CHAT-158 model-call boundary': 'no field publishes one; the indicator counts from the newest row the run produced, which restarts per call but is not the instant the call was issued.',
};

/** A limb a directive withdrew is not one this proof leaves unestablished: it is no longer asked of the product. */
results.withdrawn = {
  'REQ-CHAT-039 unscoped half': 'withdrawn by PD-CHAT-007 (OQ-51 as ruled, R-071, 2026-10-06): every queued prompt belongs to a session, as `queued_prompts.session_id` is NOT NULL; the scoped half is built and measured above.',
};

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\ncomposer-proof PASSED — evidence under ${relative(repo, output)}`);
