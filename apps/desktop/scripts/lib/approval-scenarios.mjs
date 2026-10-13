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
import { awayLiveVerdicts, awayStretch } from './approval-readings.mjs';

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
    ROTARIS_CAPTURE_PROMPT: 'Create a file named AWAY.md in the workspace root containing the single line "away check", with one write_file call. If that call is refused, try exactly once more with one write_file call that creates AWAY-2.md instead, then stop and reply in one sentence saying what happened and why. Do not use the terminal and do not delegate.',
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
