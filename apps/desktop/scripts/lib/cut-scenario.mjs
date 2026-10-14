/**
 * The live run's `cut` scenario (fin42; N51 of the 2026-10-13 survey): PD-TOOLS-013 against a real model, a foreground
 * terminal call cut in flight on purpose. Revision 1 (the terminal) and revision 2 (every call its run cancels) were built and
 * proven against the scripted model (`driver-proof` 13d, `fetch-proof`'s `cancelled`, `mcp-proof`'s `cancel` and
 * `cancel-throw`), but no live run had ever cut a call: in the 552d346 default and duress packs and at 0bc3eee every run ended
 * before the capture's quit, so the record waited for a later quit to happen to land on a call. This scenario makes that
 * measurement certain.
 *
 * The model is asked to run one foreground command that marks a file and then sleeps sixty seconds, with an explicit 90-second
 * timeout (a call with no `timeout` is soft-paused instead, and a soft-paused call is no longer in flight). The harness reads
 * the store while the launch runs; once the call's record is open (`running`) and the command has marked its file, it waits
 * `SETTLE_MS` and quits the application by SIGTERM, a quit outside any window (`fetch-proof`'s ninth launch does the same).
 * Then it reads the cut call from the store and the session's `summary.md`.
 *
 * What a pass shows: the call recorded `failed` with failure and outcome kind `interrupted`, no exit code, `"timeout":false`,
 * a `kill_status` of `session_reset` or `reset_failed`, its result saying the run cancelled the call and never that it
 * exceeded its timeout; no `terminal_timeout` or `tool_error` issue for it; `summary.md`'s Tool outcomes counting it under
 * `interrupted` and its Timeouts line at 0. A model that never runs the command, or runs it without the timeout (soft-paused),
 * is a NOTE, never a pass: nothing was cut, so nothing was measured.
 *
 * `ctx` is what `live-run.mjs` owns (`approvalContext()` plus `inFlight`, the launch being run); the readings below are pure
 * and tested beside this file.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** The file the command marks before it sleeps, in the workspace root. */
export const CUT_MARKER = 'CUT-STARTED.txt';
/** The command the model is asked for, word for word. */
export const CUT_COMMAND = `echo started > ${CUT_MARKER} && sleep 60`;
/** How long the harness lets the command sleep before the quit, once it has marked its file. */
export const SETTLE_MS = 2_000;
/** A call whose record is open this long is cut even if the model dropped the marker from the command. */
export const OPEN_WITHOUT_MARKER_MS = 8_000;

export const CUT_PROMPT = `Use the terminal tool exactly once, to run this exact command in the foreground with a timeout of 90 seconds: \`${CUT_COMMAND}\`. Pass the timeout argument as 90. Do not run it in the background and do not run any other command. When it has finished, reply in one sentence saying what it printed.`;

/** Whether one call row is the sleeping command the scenario asked for (its arguments as the gate recorded them). */
export function isCutCommand(command) {
  return /\bsleep\s+60\b/.test(String(command ?? ''));
}

/**
 * The open terminal call the quit should cut, or null: a `running` row of the `terminal` tool whose command is the sleep,
 * once the command marked its file or the record has stood open `OPEN_WITHOUT_MARKER_MS`. `rows` are `{ status, tool_name,
 * entry, session_created_at }` with `entry` parsed; `firstSeen` maps a row's key to when the harness first saw it open.
 * `since` (an ISO instant) keeps only the rows of sessions created once this launch began: a `running` sleep an earlier,
 * crashed scenario left in the store is not this launch's to quit on.
 */
export function openCutCall(rows, { markerExists, now, firstSeen, since = null }) {
  for (const row of rows) {
    if (row.tool_name !== 'terminal' || row.status !== 'running') continue;
    if (since !== null && !(String(row.session_created_at ?? '') >= since)) continue;
    const command = row.entry?.args?.command ?? '';
    if (!isCutCommand(command)) continue;
    const key = `${row.session_id ?? ''}#${row.ordinal}`;
    if (!firstSeen.has(key)) firstSeen.set(key, now);
    if (markerExists || now - firstSeen.get(key) >= OPEN_WITHOUT_MARKER_MS) return { ordinal: row.ordinal, command };
  }
  return null;
}

/** `[{ verdict: 'check'|'note', passed?, what, detail? }]` for the cut call, its issues and `summary.md`. */
export function cutVerdicts({ quitSent, calls, issues, summary }) {
  const sleeps = calls.filter((c) => c.tool_name === 'terminal' && isCutCommand(c.args?.command));
  if (!quitSent) {
    const how = sleeps.length === 0 ? 'the model ran no `sleep 60` in the terminal' : `the sleep's call never stood open (${sleeps.map((c) => `${c.status}${c.args?.timeout === undefined ? ', no timeout supplied, so soft-paused' : ''}`).join('; ')})`;
    return [{ verdict: 'note', what: 'cut: no call was cut in flight, so PD-TOOLS-013 was not measured live', detail: how }];
  }
  const cut = sleeps[0];
  if (cut === undefined) return [{ verdict: 'check', passed: false, what: 'cut: the call the quit cut is in the store', detail: `${calls.length} call(s), none a terminal sleep` }];
  const result = String(cut.result ?? '');
  const verdicts = [
    { verdict: 'check', passed: cut.status === 'failed' && cut.failureKind === 'interrupted' && cut.outcomeKind === 'interrupted', what: 'cut: the terminal call the quit cut is recorded failed, interrupted (PD-TOOLS-013)', detail: `${cut.status} / failure ${cut.failureKind} / outcome ${cut.outcomeKind}, ${cut.elapsedMs ?? '?'} ms` },
    { verdict: 'check', passed: (cut.exitCode ?? null) === null && /"timeout":false/.test(result) && /"kill_status":"(session_reset|reset_failed)"/.test(result) && /"outcome_severity":"warning"/.test(result), what: 'cut: it carries no exit code, timeout false, a session reset, and outcome_severity warning (PD-TOOLS-013 revision 1)', detail: (/\[terminal_diagnostic\] (.*)$/m.exec(result)?.[1] ?? '(no diagnostic)').replace(/"detail":"[^"]*",?/, '').slice(0, 300) },
    { verdict: 'check', passed: /cancelled by the run before the command/.test(result) && !/exceeded its timeout/.test(result), what: 'cut: its result says the run cancelled the call and names no timeout', detail: result.split('\n')[0]?.slice(0, 240) ?? '(no result)' },
  ];
  const own = issues.filter((i) => i.evidence_ref === `tool_call_evidence#${cut.callId}` || i.kind === 'terminal_timeout');
  verdicts.push({ verdict: 'check', passed: own.length === 0, what: 'cut: the cut call files no terminal_timeout and no tool_error issue (REQ-SESSION-136)', detail: own.length === 0 ? undefined : JSON.stringify(own) });
  if (summary === null) {
    verdicts.push({ verdict: 'check', passed: false, what: "cut: the session's summary.md counts the call under interrupted", detail: 'no summary.md was written' });
  } else {
    const outcomes = /^- Tool outcomes: (.*)$/m.exec(summary)?.[1] ?? '';
    const timeouts = /^- Timeouts: (\d+)/m.exec(summary)?.[1] ?? null;
    verdicts.push({ verdict: 'check', passed: /\binterrupted [1-9]/.test(outcomes) && timeouts === '0', what: "cut: the session's summary.md counts the call under interrupted, and Timeouts reads 0 (REQ-SESSION-139)", detail: `Tool outcomes: ${outcomes}; Timeouts: ${timeouts}` });
  }
  return verdicts;
}

/**
 * Whether the quit landed before the run reached its result, read by the ORDER of the application log's lines and by WHICH end
 * the run reached: the first `quit: requested` against main's `run <id> ended <status> (<stop_reason>)` lines and the capture's
 * `wait for result satisfied`. A run its quit cuts still ends with its one result — the interrupted end the shutdown writes
 * (`ended interrupted (application_shutdown)`) — and the capture's wait, still installed, reports that result as satisfied after
 * the quit. So the check fails a result or a run end logged BEFORE the quit, and a first end after the quit that is anything but
 * that interrupted one (a run that completed a moment after the SIGTERM was not cut by it); a wait reporting a result after the
 * quit with no run end logged fails too, since nothing then says which result it was. A log with neither (the wait reported
 * nothing and main logged no end) passes: no result was reached, so none came first.
 * Until 2026-10-14 the check read the satisfied line anywhere in the log and failed the a3be56c pack's cut, whose every other
 * check passed (live-run finding L1 of that pack; fin45); fin45's order reading then passed any result after the quit, a normal
 * completion included, and read the 3c3f447 pack's logged interrupted end as "no result" (acceptance finding C11; fin46,
 * `docs/defects/fixed/the-cut-checks-order-reading-passes-a-normal-completion-reached-after-the-quit.md`).
 * @param {string} log
 * @returns {{ passed: boolean, detail: string }}
 */
export function quitLandedFirst(log) {
  const lines = String(log ?? '').split('\n');
  const isEnd = (l) => /\bended \w+ \([a-z_]+\)/.test(l);
  const endText = (l) => l.replace(/^.*?\b(run \S+ ended .*)$/, '$1').trim();
  const quit = lines.findIndex((l) => /\bquit: requested\b/.test(l));
  const result = lines.findIndex((l) => /capture: wait for result satisfied/.test(l));
  const firstEnd = lines.findIndex(isEnd);
  if (quit < 0) {
    if (result < 0 && firstEnd < 0) return { passed: true, detail: 'no quit line was logged and the run reached no result' };
    const reached = firstEnd >= 0 ? endText(lines[firstEnd]) : lines[result].trim();
    return { passed: false, detail: `the run reached its result (${reached}) and main logged no quit` };
  }
  if (firstEnd >= 0 && firstEnd < quit) return { passed: false, detail: `the run ended (line ${firstEnd + 1}: ${endText(lines[firstEnd])}) before the quit (line ${quit + 1})` };
  if (result >= 0 && result < quit) return { passed: false, detail: `the run reached its result (line ${result + 1}) before the quit (line ${quit + 1})` };
  const reported = result < 0 ? 'the wait reported no result' : `the result the wait reported (line ${result + 1}) is that end`;
  if (firstEnd < 0) {
    return result < 0
      ? { passed: true, detail: `the quit (line ${quit + 1}) came first, and the run logged no end and the wait reported no result after it` }
      : { passed: false, detail: `the wait reported a result (line ${result + 1}) after the quit (line ${quit + 1}), but main logged no run end to say which` };
  }
  const ended = endText(lines[firstEnd]);
  if (!/\bended interrupted \(application_shutdown\)/.test(lines[firstEnd])) {
    return { passed: false, detail: `the first run end after the quit (line ${quit + 1}) is not the interrupted end the quit writes: line ${firstEnd + 1}, ${ended}` };
  }
  return { passed: true, detail: `the quit (line ${quit + 1}) came first; the run's first end after it is the interrupted one (line ${firstEnd + 1}): ${ended}; ${reported}` };
}

function readCut(dbPath, sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
  try {
    const calls = db.prepare('SELECT ordinal, tool_name, status, elapsed_ms, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sessionId).map((c) => {
      const e = parse(c.entry);
      return { ordinal: c.ordinal, tool_name: c.tool_name, status: c.status, args: e.args ?? {}, result: String(e.result ?? ''), callId: e.call_id ?? null, failureKind: e.failure_kind ?? null, outcomeKind: e.outcome_kind ?? null, exitCode: e.exit_code ?? null, elapsedMs: c.elapsed_ms === null ? null : Math.round(c.elapsed_ms) };
    });
    const issues = db.prepare('SELECT kind, severity, message, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(sessionId);
    return { calls, issues };
  } finally { db.close(); }
}

/** The open rows of every session, each with its session's creation instant, read while the launch runs; empty before the first save. */
function openRows(dbPath) {
  const Database = require('better-sqlite3');
  let db;
  try { db = new Database(dbPath, { readonly: true, fileMustExist: true }); } catch { return []; }
  try {
    return db.prepare("SELECT t.session_id, t.ordinal, t.tool_name, t.status, t.entry, s.created_at AS session_created_at FROM tool_calls t JOIN sessions s ON s.session_id = t.session_id WHERE t.status = 'running'").all().map((r) => { let entry = {}; try { entry = JSON.parse(r.entry); } catch { /* still open */ } return { ...r, entry }; });
  } catch { return []; } finally { db.close(); }
}

export async function runCutScenario(ctx) {
  const marker = join(ctx.workspace, CUT_MARKER);
  rmSync(marker, { force: true });
  const firstSeen = new Map();
  let quitSent = null;
  let cutCall = null;
  const started = Date.now();
  const since = new Date(started).toISOString();
  const watch = setInterval(() => {
    if (quitSent !== null) return;
    let dbPath;
    try { dbPath = ctx.oneDatabase(); } catch { return; }
    const open = openCutCall(openRows(dbPath), { markerExists: existsSync(marker), now: Date.now(), firstSeen, since });
    if (open === null) return;
    cutCall = open;
    quitSent = Date.now() + SETTLE_MS;
    setTimeout(() => { const child = ctx.inFlight(); try { if (child?.pid) process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ } }, SETTLE_MS);
  }, 500);
  const png = join(ctx.scenarioDir('cut'), 'cut.png');
  let log;
  try {
    log = await ctx.launch('cut', {
      ROTARIS_CAPTURE_PROMPT: CUT_PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
      // The quit lands before the capture's own picture, which `launch` requires: the window is photographed as the prompt
      // is typed, and at a fifth and three fifths of the wait as every scenario is, by whichever comes first.
      ROTARIS_CAPTURE_PNG_AT: `${png}@4000;;${join(ctx.scenarioDir('cut'), 'cut.early.png')}@${Math.round(ctx.RUN_WAIT_MS * 0.2)};;${join(ctx.scenarioDir('cut'), 'cut.mid.png')}@${Math.round(ctx.RUN_WAIT_MS * 0.6)}`,
    }, ctx.RUN_WAIT_MS + 90_000);
  } finally {
    clearInterval(watch);
  }
  const read = ctx.readSession();
  if (!read) { ctx.check(false, 'cut: the run left a session row', 'no session was recorded'); return; }
  const sessionId = read.session.session_id;
  const dbPath = ctx.oneDatabase();
  const { calls, issues } = readCut(dbPath, sessionId);
  const summaryFile = join(dirname(dbPath), 'sessions', sessionId, 'summary.md');
  const summary = existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : null;
  const verdicts = cutVerdicts({ quitSent: quitSent !== null, calls, issues, summary });
  for (const v of verdicts) { if (v.verdict === 'note') ctx.noted(v.what, v.detail); else ctx.check(v.passed, v.what, v.detail ?? undefined); }
  if (quitSent !== null) { const order = quitLandedFirst(log); ctx.check(order.passed, 'cut: the quit landed before the run reached its result', order.detail); }
  ctx.check(read.session.execution_status !== 'failed', 'cut: a run its quit cut did not fail', `${read.session.execution_status} (${read.session.stop_reason})`);
  const sleep = calls.find((c) => c.tool_name === 'terminal' && isCutCommand(c.args?.command));
  ctx.results.scenarios.cut = {
    status: read.session.execution_status, stopReason: read.session.stop_reason, quitAtMs: quitSent === null ? null : quitSent - started,
    command: cutCall?.command ?? sleep?.args?.command ?? null, timeoutArg: sleep?.args?.timeout ?? null,
    call: sleep === undefined ? null : { status: sleep.status, failureKind: sleep.failureKind, outcomeKind: sleep.outcomeKind, exitCode: sleep.exitCode, elapsedMs: sleep.elapsedMs, firstLine: sleep.result.split('\n')[0]?.slice(0, 200) ?? '' },
    issues: issues.map((i) => i.kind), summaryOutcomes: summary === null ? null : (/^- Tool outcomes: (.*)$/m.exec(summary)?.[1] ?? null),
  };
  rmSync(marker, { force: true });
  ctx.preserveRun('cut', sessionId);
  await ctx.budgetGate();
}
