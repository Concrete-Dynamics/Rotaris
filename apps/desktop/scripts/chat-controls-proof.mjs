/**
 * The chat-controls proof (Part AO): manual compression, the transcript clear and the prompt-file commands in the
 * built product — REQ-CHAT-073, REQ-CHAT-078..084, REQ-CHAT-160/161; REQ-MONITOR-090..094, 096, 097, 271; ADR-0060
 * decision 1's second reader (the registry of live conversations); ADR-0049's `notice.report` (defect fifty-seven).
 *
 * Four launches on the scripted provider, driven through the product's own paths (real key events, the composer's
 * native setter plus an `input` event, real clicks) and read back through the capture harness's probes and the store:
 *
 *   1. compress-two     a root that delegates and then waits on a model call, a child that reads twice and waits: TWO
 *                       live conversations. "Compress context" pressed in the run header → the button relabels
 *                       "Compressing…" and disables, "Compressing active agent contexts…" is toasted, then "Compressed
 *                       context for 2 active agents." and the label is back (REQ-CHAT-079/080, REQ-MONITOR-093/094);
 *                       the store holds one `context_compressed` entry PER AGENT, `trigger: manual`, no threshold figure
 *                       (REQ-CHAT-081, REQ-MONITOR-096), and both conversations shrank (REQ-MONITOR-092).
 *   2. compress-partial the same run with the scripted compressor failing on the child's slice alone (`fail-if:`): the root
 *                       compresses, the child does not, and the PERSISTENT notice "Context compression incomplete" names
 *                       the child with its reason in the copyable detail block (REQ-CHAT-080, REQ-MONITOR-094); the notice
 *                       is in the session's timeline (REQ-NOTIFY-268).
 *   3. controls         idle: the header control is disabled with REQ-CHAT-078's reason; the palette's "Compress context"
 *                       is refused with "No run is active." (REQ-MONITOR-097/271); `/compress` is refused through the ONE
 *                       persistent slot — "Command not run" raised by `notice.report` (REQ-CHAT-021, ADR-0049); the toolbar's
 *                       Clear is disabled on the empty transcript (REQ-CHAT-073). `/` lists the prompt file under both its
 *                       names with the `prompt` badge and its frontmatter description (REQ-CHAT-160, REQ-CHAT-025), and a
 *                       malformed file was skipped with a logged reason. `/greet-me one "two words" NAME=v` starts a run whose
 *                       user row is the body expanded exactly once (REQ-CHAT-161). Clear during the live run → REQ-CHAT-083's
 *                       dialog, verbatim → confirm → the visible transcript empties, "Transcript cleared. …" is toasted, and
 *                       the run's next rows arrive WITHOUT the old ones (REQ-CHAT-084, the live route); after the run ends,
 *                       Clear on the loaded idle session → zero rows (the named route).
 *   4. restart          the same store opened again and the session resumed from the browser: the snapshot is empty and
 *                       the empty state shows (REQ-CHAT-084's atomic clear held across a restart; REQ-CHAT-073).
 *
 * Evidence under `.proof/chat-controls-proof/`: one `.log` and `.png` per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'chat-controls-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
// Part AO: Windows refuses this wipe with EPERM while a previous launch's run host or workspace service still holds the
// scratch workspace as its working directory — the second of two runs started back to back died here, before a single
// assertion. The retries are that settle, stated rather than left to luck.
rmSync(output, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
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


function openStore(local) {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return new Database(databases[0], { readonly: true });
}

/**
 * A scratch workspace on the scripted provider. The compressor's trigger sits far above anything the scripted
 * client reports (`max_input_tokens: 100000`), so every compression below is the manual arm's; `preserve_recent_turns: 0`
 * (inside REQ-CONFIG-132's range; ADR-0060 consequence 5) makes a conversation compressible after its FIRST completed
 * step, which is what lets a fixed schedule find the delegated child ready on a loaded machine (the first run on this
 * shared host took 2 s per scripted step where an idle one takes 0.5 s, and a child with one step and one preserved turn
 * had nothing between its request and its tail — correctly "unchanged", but not the case the proof exists to measure). `code_intelligence` is off (its ~4.5 s
 * discovery per run start distorts nothing here and costs every launch). The README carries a marker the CHILD alone
 * reads (`read` in its script), so the scripted compressor's `fail-if:` can fail one agent of a concurrent pass.
 */
const PROMPT_BODY = 'Hello $1, you said "$2". NAME is $NAME. All: $ARGUMENTS. Literal $$ and empty[$9].';
const PROMPT_EXPANDED = 'Hello one, you said "two words". NAME is v. All: one "two words" NAME=v. Literal $ and empty[].';
function scenario(name) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(join(workspace, '.agents', 'prompts', 'nested'), { recursive: true });
  mkdirSync(local, { recursive: true });
  mkdirSync(preferences, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n\nCHILD-SLICE-MARKER — a line only the delegated child reads.\n');
  writeFileSync(join(workspace, '.agents', 'prompts', 'Greet Me.md'), `---\ndescription: Greets someone\nargument-hint: <name> "<phrase>" NAME=value\n---\n${PROMPT_BODY}\n`);
  writeFileSync(join(workspace, '.agents', 'prompts', 'broken.md'), '---\ndescription: never closed\n');
  writeFileSync(join(workspace, '.agents', 'prompts', 'nested', 'deep.md'), 'not directly inside a root');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:', '  scripted: { provider: scripted, model_id: scripted, max_input_tokens: 100000 }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'default_persona: orchestrator',
    'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4',
    'compressor:', '  threshold_percentage: 60', '  preserve_recent_turns: 0',
    'mcp_servers:', '  code_intelligence: { enabled: false }', '',
  ].join('\n'));
  return { root, workspace, local, preferences };
}

async function launch(name, s, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: s.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}\n${log.split('\n').slice(-40).join('\n')}`);
  const inspects = {};
  for (const line of log.split('\n')) {
    const m = /capture: inspect-at (\d+) (.+?) → (\{.*\})\s*$/.exec(line);
    if (m) { try { inspects[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { /* an unreadable inspect stays absent */ } }
  }
  const evals = [];
  for (const line of log.split('\n')) {
    // Non-greedy on the script: a notice's message may itself carry " → " (the first-launch notice's "Settings → Models" does).
    const m = /capture: eval-at (\d+) (.+?) → (.*)$/.exec(line);
    if (m) { try { evals.push({ at: Number(m[1]), value: JSON.parse(m[3]) }); } catch { evals.push({ at: Number(m[1]), value: m[3] }); } }
  }
  const texts = {};
  for (const line of log.split('\n')) {
    const m = /capture: text-at (\d+) "(.*)" → (true|false|error)\s*$/.exec(line);
    if (m) texts[`${m[2]}@${m[1]}`] = m[3] === 'true';
  }
  return { png, log, inspects, evals, texts };
}
const match = (r, selector, at, index = 0) => (r.inspects[`${selector}@${at}`]?.matches ?? [])[index] ?? null;
const evalAt = (r, at) => r.evals.find((e) => e.at === at)?.value;
const text = (r, needle, at) => r.texts[`${needle}@${at}`] === true;

// ── the probes ──
const setComposer = (value) => `(() => { const el = document.querySelector('.composer__input'); if (!el) return 'no composer'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return el.value.length; })()`;
const readCompress = `(() => { const b = document.querySelector('[data-testid="run-compress"]'); return b ? { text: b.textContent, disabled: b.disabled, title: b.title, pending: b.dataset.pending } : null; })()`;
const readClear = `(() => { const b = document.querySelector('[data-testid="transcript-clear"]'); return b ? { text: b.textContent, disabled: b.disabled, title: b.title } : null; })()`;
/** The shell's ONE persistent notice slot (ADR-0049); the composer draws none of its own once `raiseNotice` is wired. */
const readNotice = `(() => { const n = document.querySelector('[data-testid="notice"]'); if (!n) return null; return { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, message: n.querySelector('[data-testid="notice-message"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, severity: n.dataset.severity ?? null, inComposer: n.closest('[data-testid="composer-notice"]') !== null }; })()`;
const readRows = `(() => ({ rows: document.querySelectorAll('.transcript article.row').length, user: [...document.querySelectorAll('.transcript article.row')].filter((r) => /\\brow--user\\b/.test(r.className)).length, empty: document.body.innerText.includes('No transcript yet') }))()`;
const readDialog = `(() => { const d = document.querySelector('[data-testid="clear-transcript-dialog"]'); if (!d) return null; return { text: d.innerText, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) }; })()`;
const readPopup = `(() => { const p = document.querySelector('[data-testid="slash-popup"]'); if (!p) return { open: false }; const rows = [...p.querySelectorAll('[role="option"]')]; const row = (name) => { const r = rows.find((x) => x.dataset.command === name); return r ? { kind: r.dataset.kind, text: r.textContent, available: r.dataset.available } : null; }; return { open: true, names: rows.map((r) => r.dataset.command), greet: row('greet-me'), prefixed: row('prompts:greet-me'), broken: row('broken') }; })()`;
const readComposer = `(() => { const el = document.querySelector('.composer__input'); return el ? { value: el.value, focused: document.activeElement === el } : null; })()`;
/**
 * Defect AO-2 — `/` is typed only once the composer's prompt-file commands are on the registry the popup reads. The
 * catalogue's registry is rebuilt while a window settles and the popup's list is a memo of the text and that registry, so a
 * registration landing after the list was built shows only at the next keystroke: a fixed millisecond here measured the
 * machine, and went red in one launch of three with the workspace service's answer already in the log. This waits for the
 * registrar's own signal, types through the composer's own change path, and records what it waited.
 */
const typeSlashWhenRegistered = `(() => { const el = document.querySelector('.composer__input'); if (!el) return 'no composer'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; const started = Date.now(); const ready = () => Number(document.querySelector('[data-testid="prompt-commands"]')?.dataset.count ?? '0') > 0; const type = () => { window.__promptWaitMs = Date.now() - started; setter.call(el, '/'); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); }; const tick = () => { if (ready() || Date.now() - started >= 3000) { type(); return; } setTimeout(tick, 25); }; tick(); return { readyAtOnce: ready() }; })()`;
const readPromptSignal = `(() => { const s = document.querySelector('[data-testid="prompt-commands"]'); return { count: Number(s?.dataset.count ?? '-1'), roots: s?.dataset.roots ?? null, waitedMs: window.__promptWaitMs ?? null }; })()`;
const readRunState = `document.querySelector('[data-testid="run-state"]')?.textContent ?? null`;

const results = {};
const timelineOf = (db, sid) => db.prepare('SELECT name, message, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid);
const newestSession = (db) => db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC').get();

// ═══ 1. compress-two — two live conversations, one press, both compressed ═══════════════════════════════════════════
const TWO = {
  ROTARIS_SCRIPT: 'glob,glob,delegate:coding-agent:child-a,wait:20000,answer', ROTARIS_CHILD_SCRIPT: 'read,wait:16000,answer',
  ROTARIS_INTENT_SCRIPT: 'moderate_feature', ROTARIS_CAPTURE_PROMPT: 'compress me', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '1500',
};
/**
 * The scripted compressor answers in ~20 ms, so REQ-CHAT-079's relabel is over before any timed probe: a MutationObserver
 * armed on the control before the click records every label and disabled-state change the pass caused.
 */
const armCompressObserver = `(() => { const b = document.querySelector('[data-testid="run-compress"]'); if (!b) return 'no control'; const log = []; window.__rotarisCompress = log; new MutationObserver(() => log.push({ text: b.textContent, disabled: b.disabled, pending: b.dataset.pending, at: Math.round(performance.now()) })).observe(b, { childList: true, attributes: true, subtree: true, characterData: true }); return 'armed'; })()`;
const readCompressObserved = `window.__rotarisCompress ?? null`;
// The click lands while BOTH waits are open: the root's from ~4–10 s to ~24–30 s and the child's from ~5.5–11 s to ~21.5–27 s, at 0.5–2.5 s per scripted step.
const T1 = { arm: 13900, press: 14000, pressing: 14300, done: 15500 };
{
  const s = scenario('compress-two');
  const r = await launch('compress-two', s, {
    ...TWO,
    ROTARIS_CAPTURE_CLICKS: `[data-testid="run-compress"]@${T1.press}`,
    ROTARIS_CAPTURE_EVAL_AT: [`${readCompress}@${T1.press - 200}`, `${armCompressObserver}@${T1.arm}`, `${readCompressObserved}@${T1.pressing}`, `${readCompress}@${T1.done}`, `${readNotice}@${T1.done + 50}`].join(';;'),
    ROTARIS_CAPTURE_TEXT_AT: `Compressing active agent contexts…@${T1.pressing};;Compressed context for 2 active agents.@${T1.done}`,
  });
  const before = evalAt(r, T1.press - 200);
  const observed = evalAt(r, T1.pressing);
  const done = evalAt(r, T1.done);
  expect(before?.disabled === false && before.text === 'Compress context' && before.title === 'Manually compress context for all active agents', `while running the control is enabled with REQ-CHAT-078's description: ${JSON.stringify(before)}`);
  expect(evalAt(r, T1.arm) === 'armed', 'the observer was not armed on the control');
  const pressing = Array.isArray(observed) ? observed.find((o) => o.text === 'Compressing…') ?? null : null;
  expect(pressing !== null && pressing.disabled === true && pressing.pending === '1', `on activation the control relabels "Compressing…" and disables (REQ-CHAT-079, REQ-MONITOR-093): ${JSON.stringify(observed)}`);
  expect(text(r, 'Compressing active agent contexts…', T1.pressing), 'the start toast "Compressing active agent contexts…" was not shown');
  expect(text(r, 'Compressed context for 2 active agents.', T1.done), '"Compressed context for 2 active agents." was not shown (REQ-CHAT-080)');
  expect(done?.text === 'Compress context' && done.pending === '0', `on completion the label is restored: ${JSON.stringify(done)}`);
  expect(evalAt(r, T1.done + 50) === null, `no persistent notice on a complete pass: ${JSON.stringify(evalAt(r, T1.done + 50))}`);
  const db = openStore(s.local);
  const row = newestSession(db);
  const entries = timelineOf(db, row.session_id).filter((t) => t.name === 'context_compressed');
  db.close();
  expect(row.execution_status === 'completed', `the run should complete after the pass: ${JSON.stringify(row)}`);
  expect(entries.length === 2, `expected one context_compressed entry per live agent (2); got ${entries.length}`);
  const metas = entries.map((e) => JSON.parse(e.metadata));
  expect(new Set(metas.map((m) => m.agent)).size === 2, `the two entries should name two agents: ${metas.map((m) => m.agent).join(', ')}`);
  for (const m of metas) {
    expect(m.trigger === 'manual', `the entry should be attributed to the manual pass: ${JSON.stringify(m)}`);
    // REQ-CHAT-081 / REQ-MONITOR-096: no threshold figure, because none was read.
    for (const field of ['threshold_percentage', 'capacity', 'advertised_input_limit', 'default_threshold', 'trigger_tokens']) expect(m[field] === undefined, `a manual entry must carry no ${field}: ${JSON.stringify(m)}`);
    expect(m.after_messages < m.before_messages, `${m.agent}'s conversation did not shrink: ${JSON.stringify(m)}`);
  }
  // The run host's own `manual compression:` line is the SESSION log's; main's stdout carries the acknowledgement it relayed and the control's answer.
  expect(/acknowledgement from the run host: ok "Compressed context for 2 active agents\."/.test(r.log) && /control forceCompression on \S+ → ok/.test(r.log), 'main did not relay the settled pass');
  results.compressTwo = { agents: metas.map((m) => ({ agent: m.agent, before: m.before_messages, after: m.after_messages, latencyMs: m.latency_ms })), pressing, done };
}

// ═══ 2. compress-partial — the child's pass fails; the root's succeeds; the notice lists the child ═══════════════════
{
  const s = scenario('compress-partial');
  const r = await launch('compress-partial', s, {
    ...TWO, ROTARIS_COMPRESSOR_SCRIPT: 'fail-if:CHILD-SLICE-MARKER',
    ROTARIS_CAPTURE_CLICKS: `[data-testid="run-compress"]@${T1.press}`,
    ROTARIS_CAPTURE_EVAL_AT: [`${readNotice}@${T1.done}`, `${readCompress}@${T1.done + 20}`].join(';;'),
    ROTARIS_CAPTURE_TEXT_AT: `Compressed context for@${T1.done}`,
  });
  const notice = evalAt(r, T1.done);
  expect(notice?.title === 'Context compression incomplete' && notice.severity === 'error', `the persistent incomplete notice: ${JSON.stringify(notice)}`);
  expect(notice.message === '1 of 2 active agent contexts compressed; 1 failed.', `the notice's message: ${JSON.stringify(notice.message)}`);
  expect(typeof notice.detail === 'string' && /child-a/.test(notice.detail) && /scripted compressor failure/.test(notice.detail), `the detail block should list the failing agent with its reason (REQ-MONITOR-094): ${JSON.stringify(notice.detail)}`);
  expect(!notice.inComposer, 'the notice must be the shell\'s one slot, not a composer-drawn banner');
  expect(!text(r, 'Compressed context for', T1.done), 'a partial pass must not toast the completion count');
  expect(evalAt(r, T1.done + 20)?.text === 'Compress context' && evalAt(r, T1.done + 20)?.pending === '0', `the control must be restored after a partial pass: ${JSON.stringify(evalAt(r, T1.done + 20))}`);
  const db = openStore(s.local);
  const row = newestSession(db);
  const timeline = timelineOf(db, row.session_id);
  db.close();
  const compressed = timeline.filter((t) => t.name === 'context_compressed').map((t) => JSON.parse(t.metadata).agent);
  expect(compressed.length === 1 && !/child-a/.test(compressed[0]), `only the root should have compressed: ${compressed.join(', ')}`);
  // REQ-NOTIFY-268: an error notice is recorded into the session's timeline at publication, unchanged.
  expect(timeline.some((t) => /Context compression incomplete/.test(`${t.message} ${t.metadata}`)), 'the notice was not recorded in the session timeline');
  expect(/control forceCompression on \S+ → ok/.test(r.log) && /Context compression incomplete/.test(r.log), 'main did not relay the partial pass and its notice');
  results.compressPartial = { notice, compressed };
}

// ═══ 3. controls — the idle refusals, the prompt file, the clear on a live run and on the loaded session ═══════════
const T3 = {
  idle: 1500, palette: 1800, paletteType: 2000, paletteEnter: 2300, paletteToast: 2700,
  slashCompress: 3200, slashEnter: 3400, slashNotice: 4000,
  // Defect AO-2: `slash` is when the typer STARTS waiting for the prompt commands to be registered, not when it types;
  // `popup` leaves it the whole wait it can take (3 s) and the popup's own settle, so the read measures the product and
  // not the machine. Everything after it moved by the same 2900 ms — widened, never reordered.
  slash: 4400, popup: 7800, escape: 8000, cleared: 8100,
  greet: 8400, greetEnter: 8600, running: 10500,
  clear: 12400, dialog: 12900, confirm: 13200, emptied: 13900,
  ended: 23400, clear2: 23900, confirm2: 24500, emptied2: 25200, end: 25900,
};
const controls = scenario('controls');
{
  const r = await launch('controls', controls, {
    ROTARIS_SCRIPT: 'glob,wait:6000,answer', ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_VIEW_MS: '1000',
    ROTARIS_CAPTURE_CHORDS: `Ctrl+K@${T3.palette}`,
    ROTARIS_CAPTURE_TYPE_AT: `compress@${T3.paletteType}`,
    ROTARIS_CAPTURE_KEYS: `Return@${T3.paletteEnter};;Return@${T3.slashEnter};;Escape@${T3.escape};;Return@${T3.greetEnter}`,
    ROTARIS_CAPTURE_CLICKS: [
      `[data-testid="transcript-clear"]@${T3.clear}`, `[data-testid="clear-transcript-dialog"] button>>Clear transcript@${T3.confirm}`,
      `[data-testid="transcript-clear"]@${T3.clear2}`, `[data-testid="clear-transcript-dialog"] button>>Clear transcript@${T3.confirm2}`,
    ].join(';;'),
    ROTARIS_CAPTURE_EVAL_AT: [
      `${readCompress}@${T3.idle}`, `${readClear}@${T3.idle + 20}`, `${readRows}@${T3.idle + 50}`,
      `${readNotice}@${T3.paletteToast}`,
      `${setComposer('/compress')}@${T3.slashCompress}`, `${readNotice}@${T3.slashNotice}`, `${readComposer}@${T3.slashNotice + 50}`,
      // REQ-CHAT-021 restored "/compress" after the refusal; the field is emptied before "/" is typed, so the popup's rule sees a bare slash.
      `${setComposer('')}@${T3.slash - 100}`, `${typeSlashWhenRegistered}@${T3.slash}`, `${readPopup}@${T3.popup}`, `${readPromptSignal}@${T3.popup + 20}`, `${setComposer('')}@${T3.cleared}`,
      `${setComposer('/greet-me one "two words" NAME=v')}@${T3.greet}`,
      `${readRunState}@${T3.running}`, `${readCompress}@${T3.running + 50}`, `${readRows}@${T3.running + 100}`, `${readClear}@${T3.running + 150}`,
      `${readDialog}@${T3.dialog}`, `${readRows}@${T3.emptied}`, `${readDialog}@${T3.emptied + 50}`,
      `${readRunState}@${T3.ended}`, `${readRows}@${T3.ended + 50}`,
      `${readRows}@${T3.emptied2}`,
    ].join(';;'),
    ROTARIS_CAPTURE_TEXT_AT: [
      `No run is active.@${T3.paletteToast}`,
      `Hello one, you said@${T3.running}`,
      `Transcript cleared. Session artifacts and agent state were kept.@${T3.emptied}`,
      `Transcript cleared. Session artifacts and agent state were kept.@${T3.emptied2}`,
    ].join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: String(T3.end),
  }, 180_000);

  // Idle: the header control disabled with REQ-CHAT-078's reason; the Clear control disabled on the empty transcript (REQ-CHAT-073).
  const idleCompress = evalAt(r, T3.idle);
  const idleClear = evalAt(r, T3.idle + 20);
  expect(idleCompress?.disabled === true && idleCompress.title === 'Start or continue a run to enable run controls.', `idle "Compress context": ${JSON.stringify(idleCompress)}`);
  expect(idleClear?.disabled === true && idleClear.title === 'The transcript is empty.', `idle "Clear transcript": ${JSON.stringify(idleClear)}`);
  expect(evalAt(r, T3.idle + 50)?.rows === 0 && evalAt(r, T3.idle + 50)?.empty === true, `the transcript should start empty with its empty state: ${JSON.stringify(evalAt(r, T3.idle + 50))}`);
  // The palette's entry, run while idle: a toast with the reason, no persistent notice (REQ-MONITOR-097/271).
  expect(text(r, 'No run is active.', T3.paletteToast), 'the palette\'s "Compress context" should toast "No run is active." while idle');
  // The slot may hold the product's own first-launch notice (REQ-WORKSPACE-152) at this point; what it must not hold is the refusal.
  const paletteNotice = evalAt(r, T3.paletteToast);
  expect(paletteNotice === null || (paletteNotice.title !== 'Command not run' && paletteNotice.message !== 'No run is active.'), `the palette refusal is a toast, not a persistent notice: ${JSON.stringify(paletteNotice)}`);
  // `/compress` while idle: the composer's gate, reported through the ONE persistent slot by `notice.report` (REQ-CHAT-021, ADR-0049).
  const slashNotice = evalAt(r, T3.slashNotice);
  expect(slashNotice?.title === 'Command not run' && slashNotice.message === 'No run is active.' && slashNotice.severity === 'warning' && slashNotice.inComposer === false, `"/compress" idle should raise "Command not run" in the shell's slot: ${JSON.stringify(slashNotice)}`);
  expect(evalAt(r, T3.slashNotice + 50)?.value === '/compress', 'the exact text should be restored to the composer');
  expect(/diagnostics: notice #\d+ warning "Command not run" — No run is active\./.test(r.log), 'main should have recorded the renderer-raised notice (REQ-NOTIFY-268, no session applies)');
  // The prompt file in the catalogue (REQ-CHAT-160/025) and the malformed one skipped with a logged reason.
  // Defect AO-2: the registrar's own signal says the two names are on the registry the popup reads, and the typer above waited
  // for it — so a red below is the product's list, never the schedule's luck.
  const signal = evalAt(r, T3.popup + 20);
  const popup = evalAt(r, T3.popup);
  expect(signal?.roots === 'read' && signal.count === 2, `both prompt-file commands should be registered before "/" was typed: ${JSON.stringify(signal)}`);
  expect(popup?.open === true && popup.greet !== null && popup.prefixed !== null, `"/" should list the prompt file under both names (signal ${JSON.stringify(signal)}): ${JSON.stringify(popup)}`);
  expect(popup.greet.kind === 'prompt' && popup.prefixed.kind === 'prompt', `prompt-file rows carry the prompt badge: ${JSON.stringify(popup.greet)}`);
  expect(popup.greet.text.includes('/greet-me — Greets someone') && popup.greet.text.includes('<name> "<phrase>" NAME=value'), `the row reads the frontmatter's description and hint: ${JSON.stringify(popup.greet.text)}`);
  expect(popup.broken === null, 'the malformed file must not register');
  expect(/prompt file skipped: .*broken\.md — malformed frontmatter/.test(r.log), 'the malformed file should be skipped with a logged reason');
  expect(!popup.names.includes('deep') && !popup.names.includes('prompts:deep'), 'a file below a subdirectory must not register');
  // `/greet-me one "two words" NAME=v` starts a run on the expanded body (REQ-CHAT-161).
  expect(evalAt(r, T3.running) === 'Run active', `the prompt command should have started a run: ${JSON.stringify(evalAt(r, T3.running))}`);
  expect(text(r, 'Hello one, you said', T3.running), 'the expanded prompt should be the user row');
  expect(evalAt(r, T3.running + 50)?.disabled === false, 'the header control should be enabled while running');
  const beforeClear = evalAt(r, T3.running + 100);
  expect(beforeClear?.rows > 0 && beforeClear.user === 1, `rows before the clear: ${JSON.stringify(beforeClear)}`);
  expect(evalAt(r, T3.running + 150)?.disabled === false, 'Clear should be enabled once rows exist');
  // The dialog, verbatim (REQ-CHAT-083).
  const dialog = evalAt(r, T3.dialog);
  expect(dialog !== null, 'Clear should open the confirmation dialog');
  for (const line of ['Clear transcript?', 'This removes the visible conversation from the loaded session. Agent state, artifacts, and Git changes remain.', 'Transcript messages cannot be restored after the session snapshot is saved.']) {
    expect(dialog.text.includes(line), `the dialog should carry "${line}": ${JSON.stringify(dialog.text)}`);
  }
  expect(dialog.buttons.includes('Clear transcript') && dialog.buttons.includes('Cancel'), `the dialog's actions: ${JSON.stringify(dialog.buttons)}`);
  // Confirmed on the live run: the visible transcript empties, the toast reads, the dialog is gone (REQ-CHAT-084, the live route).
  const emptied = evalAt(r, T3.emptied);
  expect(emptied?.rows === 0, `the transcript should be empty after the confirmed clear: ${JSON.stringify(emptied)}`);
  expect(text(r, 'Transcript cleared. Session artifacts and agent state were kept.', T3.emptied), 'the success toast was not shown');
  expect(evalAt(r, T3.emptied + 50) === null, 'the dialog should be closed');
  // The run's next writes land on the emptied record: the answer rows arrive, the old user row does not come back.
  expect(evalAt(r, T3.ended) !== 'Run active', `the run should have ended: ${JSON.stringify(evalAt(r, T3.ended))}`);
  const afterRun = evalAt(r, T3.ended + 50);
  expect(afterRun?.rows > 0 && afterRun.user === 0, `after the run: new rows, no resurrected user row: ${JSON.stringify(afterRun)}`);
  // The named-session route: the loaded idle session cleared again.
  const emptied2 = evalAt(r, T3.emptied2);
  expect(emptied2?.rows === 0 && emptied2.empty === true, `the idle session should be empty after the second clear: ${JSON.stringify(emptied2)}`);
  expect(text(r, 'Transcript cleared. Session artifacts and agent state were kept.', T3.emptied2), 'the second clear\'s toast was not shown');
  // The store: no rows, two `transcript_cleared` entries, the wire record untouched and holding the expanded prompt.
  const db = openStore(controls.local);
  const row = newestSession(db);
  const rows = db.prepare('SELECT count(*) AS n FROM transcript_rows WHERE session_id = ?').get(row.session_id).n;
  const cleared = timelineOf(db, row.session_id).filter((t) => t.name === 'transcript_cleared');
  const events = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'transcript.row'").all(row.session_id).map((e) => e.payload);
  db.close();
  expect(row.execution_status === 'completed', `the run should have completed: ${JSON.stringify(row)}`);
  expect(rows === 0, `the store should hold no transcript rows: ${rows}`);
  expect(cleared.length === 2, `expected two transcript_cleared entries (live, then named): ${cleared.length}`);
  expect(JSON.parse(cleared[0].metadata).removed === beforeClear.rows, `the first entry should count the rows it removed (${beforeClear.rows}): ${cleared[0].metadata}`);
  expect(events.length > 0 && events.some((p) => p.includes(JSON.stringify(PROMPT_EXPANDED).slice(1, -1))), `the wire record should still hold the user row with the body expanded exactly once: ${events.slice(0, 2).join(' | ')}`);
  expect(!events.some((p) => p.includes('$1') || p.includes('$ARGUMENTS')), 'no unexpanded placeholder may reach the record');
  results.controls = { idle: { compress: idleCompress, clear: idleClear }, slashNotice, promptSignal: signal, popup: { greet: popup.greet, prefixed: popup.prefixed }, dialog: dialog.buttons, removedFirst: JSON.parse(cleared[0].metadata).removed, removedSecond: JSON.parse(cleared[1].metadata).removed, rowsAfterRun: afterRun.rows };
}

// ═══ 4. restart — the same store, the session resumed: the snapshot is empty ═════════════════════════════════════════
{
  const r = await launch('restart', controls, {
    ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_VIEW_MS: '1000', ROTARIS_CAPTURE_RESUME: 'latest',
    ROTARIS_CAPTURE_EVAL_AT: `${readRows}@5200;;${readRunState}@5250`,
    ROTARIS_CAPTURE_AFTER_MS: '6000',
  });
  expect(/capture: opened session "latest" from the browser/.test(r.log), 'the session was not resumed from the browser');
  const rows = evalAt(r, 5200);
  expect(rows?.rows === 0 && rows.empty === true, `the resumed session's snapshot should be empty with the empty state shown (REQ-CHAT-084/073): ${JSON.stringify(rows)}`);
  const db = openStore(controls.local);
  const n = db.prepare('SELECT count(*) AS n FROM transcript_rows').get().n;
  db.close();
  expect(n === 0, `the store should still hold no transcript rows after the restart: ${n}`);
  results.restart = { rows, runState: evalAt(r, 5250) };
}

results.passed = true;
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`chat-controls-proof PASSED ${join(output, 'results.json')}`);
