/**
 * The live run's scenarios at a permission mode that asks (fin42; N53 and N54 of the 2026-10-13 survey). `live-run.mjs`
 * forces `permission_mode: autonomous` on its sandbox, so until these no approval dialog, away mark, session approval or plan
 * gate had met a real model. Each scenario rewrites the sandbox's `agents.yaml` for its own launch and puts it back after,
 * the way `faults-args` and `duress` do, and answers the dialogs through the approval seam's per-tool form
 * (`src/main/capture/approval-answers.ts`).
 *
 * The scenarios live here, not inline in `live-run.mjs`, so the script holds one call per scenario: `ctx` is what the script
 * already owns — `launch`, `check`, `noted`, `readSession`, `readSessionLog`, `oneDatabase`, `preserveRun`, `budgetGate`,
 * `withRuntimeKey`, `agentsFile`, `workspace`, `scenarioDir`, `results` and `RUN_WAIT_MS`.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { approvalsLiveVerdicts, awayLiveVerdicts, awayStretch, sessionScopedWrites } from './approval-readings.mjs';

const require = createRequire(import.meta.url);

/** One session's permission audit, approval events and timeline, as `approval-readings.mjs` reads them. */
export function readApprovalRecord(dbPath, sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
  try {
    return {
      audit: db.prepare("SELECT ordinal, recorded_at, agent_id, tool_name, decision, rule_id, source, entry FROM permission_audit WHERE session_id = ? AND kind = 'decision' ORDER BY ordinal").all(sessionId)
        .map((r) => ({ ...r, ...parse(r.entry), at: Date.parse(r.recorded_at) })),
      events: db.prepare("SELECT ordinal, kind, at, payload FROM events WHERE session_id = ? AND kind = 'approval.requested' ORDER BY ordinal").all(sessionId)
        .map((e) => ({ ordinal: e.ordinal, kind: e.kind, at: Date.parse(e.at), payload: parse(e.payload) })),
      timeline: db.prepare('SELECT ordinal, at, name, actor, message, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sessionId)
        .map((t) => ({ ...t, at: Date.parse(t.at), metadata: parse(t.metadata) })),
      calls: db.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sessionId)
        .map((c) => { const e = parse(c.entry); return { ordinal: c.ordinal, tool_name: c.tool_name, agent_name: c.agent_name, status: c.status, args: e.args ?? {}, result: String(e.result ?? '') }; }),
    };
  } finally { db.close(); }
}

/** Writes `keys` (runtime key → value) into the sandbox's configuration for `body`, and puts the file back after. */
async function withRuntime(ctx, name, keys, body) {
  const before = readFileSync(ctx.agentsFile, 'utf8');
  let changed = before;
  for (const [key, value] of Object.entries(keys)) changed = ctx.withRuntimeKey(changed, key, value);
  try {
    writeFileSync(ctx.agentsFile, changed);
    cpSync(ctx.agentsFile, join(ctx.scenarioDir(name), 'agents.yaml'));
    return await body();
  } finally {
    writeFileSync(ctx.agentsFile, before);
  }
}

/**
 * `away` — PD-TOOLS-005 (revisions 1 and 2) and PD-TOOLS-011 against a real model, at the `ask` preset with a 20-second
 * approval timeout and EVERY dialog left unanswered (`ROTARIS_CAPTURE_APPROVAL: none`): the user is not there. The first ask
 * must wait its full timeout and end with REQ-TOOLS-052's reason, the run must mark its user away (a `user_away` entry, the
 * session log's WARNING line), no further dialog may be shown, and every later ask must be denied at once with the directive's
 * reason; what the model then says is noted, which is the wording meeting a real model. The return (`user_returned`) is not
 * driven here: no input reaches the run while it is live; `approvals-proof`'s `away` launch measures it against the scripted
 * model.
 */
export async function runAwayScenario(ctx) {
  const SECONDS = Number(process.env['LIVE_RUN_AWAY_TIMEOUT_S'] ?? 20);
  const before = new Set(['AWAY.md', 'AWAY-2.md'].filter((f) => existsSync(join(ctx.workspace, f))));
  const log = await withRuntime(ctx, 'away', { permission_mode: 'ask', approval_timeout_seconds: SECONDS, headless_approval_policy: 'deny' }, () => ctx.launch('away', {
    ROTARIS_CAPTURE_PROMPT: 'Create a file named AWAY.md in the workspace root containing the single line "away check", with one write_file call. If that call is refused, try exactly once more with one write_file call that creates AWAY-2.md instead, then stop and reply in one sentence saying what happened and why. Do not use the terminal.',
    ROTARIS_CAPTURE_APPROVAL: 'none',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
  }, ctx.RUN_WAIT_MS + 90_000));
  ctx.check(!/capture: wait for result timed out/.test(log), 'away: the run reached its result inside the wait');
  const read = ctx.readSession();
  if (!read) { ctx.check(false, 'away: the run left a session row', 'no session was recorded'); return; }
  const sessionId = read.session.session_id;
  const record = readApprovalRecord(ctx.oneDatabase(), sessionId);
  const stretch = awayStretch({ ...record, log });
  const answer = (read.rows ?? []).filter((row) => row.kind === 'agent').map((row) => row.body).join(' ');
  for (const v of awayLiveVerdicts(stretch, { seconds: SECONDS, sessionLog: ctx.readSessionLog(sessionId), answer })) {
    if (v.verdict === 'note') ctx.noted(v.what, v.detail); else ctx.check(v.passed, v.what, v.detail ?? undefined);
  }
  ctx.check(read.session.execution_status !== 'failed', 'away: a run whose asks were refused did not fail', `${read.session.execution_status} (${read.session.stop_reason})`);
  const written = ['AWAY.md', 'AWAY-2.md'].filter((f) => !before.has(f) && existsSync(join(ctx.workspace, f)));
  ctx.check(written.length === 0, 'away: no refused write reached the disk', written.join(', ') || undefined);
  ctx.results.scenarios.away = {
    status: read.session.execution_status, timeoutSeconds: SECONDS,
    firstAsk: stretch.first === null ? null : { tool: stretch.first.request.tool_name, waitedMs: stretch.first.waitedMs },
    userAway: stretch.away === null ? null : stretch.away.metadata, dialogsShown: stretch.shown.map((p) => p.tool),
    askedWhileAway: stretch.askedWhileAway.map((w) => ({ tool: w.request.tool_name, source: w.decision?.source ?? null, decidedMs: w.decidedMs })),
    answer: answer.trim().slice(0, 400),
  };
  ctx.preserveRun('away', sessionId);
  await ctx.budgetGate();
}

/** A record's verdicts, handed to the script's own `check` and `noted`. */
function report(ctx, verdicts) {
  for (const v of verdicts) { if (v.verdict === 'note') ctx.noted(v.what, v.detail); else ctx.check(v.passed, v.what, v.detail ?? undefined); }
}

/**
 * `approvals` — PD-TOOLS-004 against a real model at the asking default (`ask`, the registered 300 s timeout): the first
 * `write_file` dialog is answered "Approve for this session" and every other dialog "Approve once", and the model is asked for
 * three separate writes of one file. The later writes of that path by the same persona must pass with no dialog, allowed by
 * the session rule; the file must hold all three lines. A model that wrote the path once is a NOTE.
 */
export async function runApprovalsScenario(ctx) {
  const PATH = 'notes/live.md';
  const LINES = ['first line', 'second line', 'third line'];
  const log = await withRuntime(ctx, 'approvals', { permission_mode: 'ask' }, () => ctx.launch('approvals', {
    ROTARIS_CAPTURE_PROMPT: `Create ${PATH} containing the single line "${LINES[0]}" with one write_file call. Then make a second, separate write_file call on the same file that adds the line "${LINES[1]}" after it, and a third, separate write_file call that adds the line "${LINES[2]}" after that. Use write_file for all three, not the terminal. Reply in one sentence when the file holds all three lines.`,
    ROTARIS_CAPTURE_APPROVAL: 'write_file=session;;once',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
  }, ctx.RUN_WAIT_MS + 90_000));
  ctx.check(!/capture: wait for result timed out/.test(log), 'approvals: the run reached its result inside the wait');
  const read = ctx.readSession();
  if (!read) { ctx.check(false, 'approvals: the run left a session row', 'no session was recorded'); return; }
  const sessionId = read.session.session_id;
  ctx.check(read.session.execution_status === 'completed', 'approvals: the run at the asking default completed', `${read.session.execution_status} (${read.session.stop_reason})`);
  const record = readApprovalRecord(ctx.oneDatabase(), sessionId);
  const writes = sessionScopedWrites({ audit: record.audit, calls: record.calls, log });
  const file = join(ctx.workspace, PATH);
  report(ctx, approvalsLiveVerdicts(writes, { path: PATH, fileText: existsSync(file) ? readFileSync(file, 'utf8') : '', wanted: LINES }));
  const shownAll = awayStretch({ ...record, log }).shown;
  ctx.noted('approvals: the dialogs the run put to the user, by tool', shownAll.map((p) => p.tool).join(', ') || 'none');
  ctx.results.scenarios.approvals = {
    status: read.session.execution_status, dialogsShown: shownAll.map((p) => p.tool),
    grants: writes.grants.length, unasked: writes.unasked.length, writesByPath: writes.byPath,
  };
  ctx.preserveRun('approvals', sessionId);
  await ctx.budgetGate();
}

/** The newest session's plan-gate state: the session row's gate columns, its cycles and its timeline names. */
function readPlanGate(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason, plan_cycle, plan_released FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    if (!session) return null;
    const cycles = db.prepare('SELECT cycle, plan, decision FROM plan_cycles WHERE session_id = ? ORDER BY cycle').all(session.session_id);
    const timeline = db.prepare('SELECT name, at FROM timeline WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
    return { session, cycles, timeline };
  } finally { db.close(); }
}

/**
 * `plan-gate` — PD-ORCH-001, PD-ORCH-002 and PD-ORCH-003 against a real model, at `run_start_mode: plan` (the sandbox's
 * `autonomous` mode otherwise unchanged), in three launches: the prompt is held at the gate with a real plan drawn as rendered
 * Markdown and nothing written, and no loop supervision fires while it is held; the plan is approved through the gate's own
 * button and the released run does the work; a second prompt in the same session is not held again.
 */
export async function runPlanGateScenario(ctx) {
  const SOURCE = join(ctx.workspace, 'src', 'todos.js');
  const sourceBefore = existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8') : '';
  const GATE_MS = Math.min(ctx.RUN_WAIT_MS, 300_000);
  await withRuntime(ctx, 'plan-gate', { run_start_mode: 'plan' }, async () => {
    // 1. Held: the gate drawn with the plan as rendered Markdown, nothing written, no loop supervision while held.
    const held = await ctx.launch('plan-gate', {
      ROTARIS_CAPTURE_PROMPT: 'Add a function countOpen(todos) to src/todos.js that returns how many todos are not done, export it, and add a test for it to src/todos.test.js. Run the tests with node --test when you are done.',
      ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate"]\') !== null && document.querySelector(\'[data-testid="plan-gate-preview"], [data-testid="plan-gate-plan"]\') !== null',
      ROTARIS_CAPTURE_WAIT_MS: String(GATE_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
      ROTARIS_CAPTURE_PROBE: '[data-testid="plan-gate"];;[data-testid="plan-gate-preview"];;[data-testid="plan-gate-plan"]',
    }, GATE_MS + 90_000);
    const probe = (selector) => { const m = new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])\\s*$`, 'm').exec(held); try { return m ? JSON.parse(m[1]) : []; } catch { return []; } };
    const g1 = readPlanGate(ctx.oneDatabase());
    ctx.check(g1?.session.execution_status === 'awaiting_plan_decision' && g1.session.plan_cycle === 1, 'plan-gate: the prompt was held at the gate (REQ-ORCH-153)', `${g1?.session.execution_status} cycle ${g1?.session.plan_cycle}`);
    ctx.check((g1?.cycles[0]?.plan ?? '').trim().length > 0, 'plan-gate: the held cycle carries the real model\'s plan', `${(g1?.cycles[0]?.plan ?? '').length} characters`);
    ctx.check(probe('[data-testid="plan-gate"]').length === 1 && probe('[data-testid="plan-gate-preview"]').length === 1, 'plan-gate: the gate draws the plan as rendered Markdown by default (PD-ORCH-002)', `gate ${probe('[data-testid="plan-gate"]').length}, preview ${probe('[data-testid="plan-gate-preview"]').length}, source field ${probe('[data-testid="plan-gate-plan"]').length}`);
    ctx.check((existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8') : '') === sourceBefore, 'plan-gate: nothing the plan names was written while the gate held (REQ-ORCH-153)');
    const loops = (g1?.timeline ?? []).filter((t) => t.name === 'loop_supervisor_activation');
    ctx.check(loops.length === 0, 'plan-gate: loop supervision did not fire while the run was held (PD-ORCH-001)', loops.length === 0 ? `${(g1?.timeline ?? []).length} timeline entries read` : `${loops.length} activation(s)`);
    if (g1) ctx.noted('plan-gate: the real model\'s plan, as held', g1.cycles[0]?.plan.slice(0, 400) ?? '');
    if (g1?.session.execution_status !== 'awaiting_plan_decision') return;

    // 2. Approved through the gate's own button: released for the session, the work done.
    const approved = await ctx.launch('plan-gate-approve', {
      ROTARIS_CAPTURE_RESUME: 'latest',
      ROTARIS_CAPTURE_CLICKS: '[data-testid="plan-approve"]@~60000',
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, ctx.RUN_WAIT_MS + 90_000);
    ctx.check(!/capture: wait for result timed out/.test(approved), 'plan-gate: the approved run reached its result inside the wait');
    const g2 = readPlanGate(ctx.oneDatabase());
    ctx.check(g2?.cycles[0]?.decision === 'approve' && g2.session.plan_released === 1 && g2.session.plan_cycle === null, 'plan-gate: approval released the session (REQ-ORCH-154, PD-ORCH-003)', `decision ${g2?.cycles[0]?.decision}, released ${g2?.session.plan_released}, cycle ${g2?.session.plan_cycle}`);
    ctx.check(g2?.session.execution_status === 'completed', 'plan-gate: the released run completed', `${g2?.session.execution_status} (${g2?.session.stop_reason})`);
    ctx.check(/countOpen/.test(existsSync(SOURCE) ? readFileSync(SOURCE, 'utf8') : ''), 'plan-gate: the released run did the work the plan named', 'src/todos.js names countOpen');
    if (g2?.session.plan_released !== 1) return;

    // 3. A second prompt in the released session is not held again (PD-ORCH-003).
    const follow = await ctx.launch('plan-gate-follow-up', {
      ROTARIS_CAPTURE_RESUME: 'latest',
      ROTARIS_CAPTURE_PROMPT: 'Also export a function countDone(todos) from src/todos.js that returns how many todos are done.',
      ROTARIS_CAPTURE_PROMPT_MS: '10000',
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(ctx.RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, ctx.RUN_WAIT_MS + 90_000);
    ctx.check(!/capture: wait for result timed out/.test(follow), 'plan-gate: the follow-up run reached its result inside the wait');
    const g3 = readPlanGate(ctx.oneDatabase());
    ctx.check(g3?.cycles.length === 1 && g3.session.plan_released === 1 && g3.session.execution_status !== 'awaiting_plan_decision', 'plan-gate: the second prompt in the released session was not held (PD-ORCH-003)', `${g3?.cycles.length} cycle(s), released ${g3?.session.plan_released}, ${g3?.session.execution_status}`);
    ctx.results.scenarios['plan-gate'] = {
      held: { status: g1.session.execution_status, planChars: g1.cycles[0]?.plan.length ?? 0 },
      approved: { decision: g2.cycles[0]?.decision ?? null, released: g2.session.plan_released, status: g2.session.execution_status },
      followUp: { cycles: g3?.cycles.length ?? null, status: g3?.session.execution_status ?? null },
    };
    ctx.preserveRun('plan-gate', g3?.session.session_id ?? g2.session.session_id);
  });
  await ctx.budgetGate();
}
