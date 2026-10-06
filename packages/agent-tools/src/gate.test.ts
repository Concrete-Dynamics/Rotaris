import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { FakeClock } from '@rotaris/kernel';
import type { ApprovalPayload } from '@rotaris/contracts';
import { PendingApprovals, PresenterRegistry, type PresenterPort } from './approvals.js';
import type { ToolHooks } from './gate.js';
import { advertisedSchemaCheck } from './advertised-schema.js';
import { anySchema, completeTruncatedJson, Gate, repairArrayFields, repairPayload, simpleExecutor, type GateDeps, type GateSink, type ToolCall } from './gate.js';
import { buildPolicy, PolicyContext } from './policy.js';
import { terminalTool, TERMINAL_DEFAULTS, type TerminalManager } from './terminal/index.js';
import { askQuestionsTool, PendingQuestions } from './tools/questions.js';
import { realPathOf } from './tools/fence.js';
import { FileToolState, haetEditTool, writeFileTool } from './tools/files.js';
import { INTERRUPTED_FAILURE_KIND } from './tools/types.js';

const ROOT = 'D:/ws';

/** The real executors, so the gate test sends the run's exact malformed shapes through the real hooks. */
function askQuestionsReal() {
  return askQuestionsTool({ pending: new PendingQuestions(new FakeClock()), conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => true });
}
function writeFileReal() {
  return writeFileTool(new FileToolState(), { workspaceRoot: ROOT, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] });
}
function haetEditReal() {
  return haetEditTool(new FileToolState(), { workspaceRoot: ROOT, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] });
}

it('OQ-15: an unknown terminal action preserves the ValueError contract through the gate', async () => {
  const terminal = terminalTool({} as TerminalManager, TERMINAL_DEFAULTS);
  const h = harness({ extraExecutors: [['terminal', terminal]] });
  const r = await h.gate.dispatch(h.call('terminal', { session_action: 'unknown' }), new AbortController().signal);
  expect(r).toMatchObject({ status: 'failed', isError: true, observation: { failureKind: 'invalid_request', outcomeKind: 'invalid_request' } });
  expect(r.text).toContain('"error_class":"ValueError"');
  expect(r.text).toContain('[terminal_output]\n(no output)');
  expect(h.rec.settles[0]).toMatchObject({ failure_kind: 'invalid_request', outcome_kind: 'invalid_request' });
  expect(h.rec.decisions).toHaveLength(0);
});

function recordingSink() {
  const decisions: Record<string, unknown>[] = [];
  const requested: Record<string, unknown>[] = [];
  const issues: Record<string, unknown>[] = [];
  const timeline: string[] = [];
  const opens: Record<string, unknown>[] = [];
  const settles: Record<string, unknown>[] = [];
  const pending: ApprovalPayload[][] = [];
  const warnings: string[] = [];
  let ordinal = 0;
  const sink: GateSink = {
    decision: (e) => { decisions.push(e); return decisions.length; },
    approvalRequested: (p) => { requested.push(p); },
    pendingChanged: (p) => { pending.push([...p]); },
    issue: (i) => { issues.push(i); },
    timeline: (name) => { timeline.push(name); },
    toolOpen: (o) => { opens.push(o); ordinal += 1; return ordinal; },
    toolSettle: (o, _open, s) => { settles.push({ ordinal: o, ...s }); },
    warn: (m) => { warnings.push(m); },
  };
  return { sink, decisions, requested, issues, timeline, opens, settles, pending, warnings };
}

function harness(opts: { preset?: string; attended?: boolean; presenter?: PresenterPort | null; headless?: 'deny' | 'abort'; abortHook?: (() => void) | null; timeoutMs?: number; extraExecutors?: [string, ReturnType<typeof simpleExecutor>][]; hooks?: ToolHooks | null; planGateHeld?: boolean; planGateWithheldNames?: readonly string[]; writeClaimFor?: GateDeps['writeClaimFor']; root?: string; publicTool?: GateDeps['publicTool']; resolvePath?: GateDeps['resolvePath']; presence?: GateDeps['presence']; quitting?: () => boolean } = {}) {
  const clock = new FakeClock();
  const rec = recordingSink();
  const approvals = new PendingApprovals(clock, opts.quitting ? { held: opts.quitting } : {});
  const policy = new PolicyContext(buildPolicy({ preset: opts.preset ?? 'ask', workspaceRoot: opts.root ?? ROOT }));
  const executed: Record<string, unknown>[] = [];
  const executors = new Map();
  executors.set('write_file', simpleExecutor('write_file', 'w', z.object({ operation: z.string(), path: z.string() }), async (a) => { executed.push(a); return { text: `wrote ${a.path}`, isError: false, diff: 'd' }; }));
  executors.set('terminal', simpleExecutor('terminal', 't', z.object({ command: z.string(), timeout: z.number().optional() }), async (a) => ({ text: `ran ${a.command}`, isError: false, outcomeKind: 'success', exitCode: 0 })));
  executors.set('grep', simpleExecutor('grep', 'g', z.object({ pattern: z.string() }), async () => { throw new Error('disk on fire'); }));
  executors.set('todo', simpleExecutor('todo', 'todo', z.object({ operation: z.string(), tasks: z.array(z.object({ name: z.string() })).optional() }), async (a) => ({ text: JSON.stringify(a), isError: false })));
  for (const [n, e] of opts.extraExecutors ?? []) executors.set(n, e);
  let seq = 0;
  const gate = new Gate({
    sessionId: 'S1', workspaceRoot: opts.root ?? ROOT, policy, approvals, attended: () => opts.attended ?? true, presenter: opts.presenter === undefined ? { present: async () => ({ ok: true }), close: () => undefined } : opts.presenter,
    headlessPolicy: opts.headless ?? 'deny', abortHook: opts.abortHook ?? null, approvalTimeoutMs: opts.timeoutMs ?? 300_000, executors, resolvePath: opts.resolvePath ?? ((p) => (p.startsWith('D:/') ? p : `${ROOT}/${p}`)), publicTool: opts.publicTool ?? (() => true),
    monotonic: clock, wall: clock, timers: clock, sink: rec.sink, nextSequence: () => ++seq, newRequestId: () => `req${++seq}`,
    hooks: opts.hooks ?? null,
    planGateHeld: () => opts.planGateHeld ?? false,
    planGateWithheldNames: () => new Set(opts.planGateWithheldNames ?? []),
    ...(opts.writeClaimFor ? { writeClaimFor: opts.writeClaimFor } : {}),
    ...(opts.presence ? { presence: opts.presence } : {}),
    ...(opts.quitting ? { quitting: opts.quitting } : {}),
  });
  const call = (name: string, args: unknown): ToolCall => ({ callId: `c-${name}`, name, rawArgs: typeof args === 'string' ? args : (args as Record<string, unknown>), persona: 'orchestrator', agentId: 'orchestrator', agentName: 'orchestrator' });
  return { gate, clock, rec, approvals, policy, executed, call };
}

describe('gate (ADR-0017, ADR-0019, REQ-TOOLS-011..013, 027, 032, 050..066, 175)', () => {
  it('allow: tool.start, permission.decision, execution, tool.finish; every decision is audited', async () => {
    const h = harness({ preset: 'autonomous' });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'ok', isError: false, text: 'wrote a.txt' });
    expect(r.observation?.diff).toBe('d');
    expect(h.rec.opens).toHaveLength(1);
    expect(h.rec.decisions[0]).toMatchObject({ decision: 'allow', source: 'preset', rule_id: 'preset:autonomous', summary: 'write_file(operation, path)' });
    expect(h.rec.decisions[0]).not.toHaveProperty('request_id');
    expect(h.rec.settles[0]).toMatchObject({ status: 'ok', is_error: false });
    expect(h.executed).toHaveLength(1);
  });

  it('deny: REQ-TOOLS-013 text with the call id, a permission_denied issue locating the audit entry, nothing executed, status blocked', async () => {
    const h = harness();
    const r = await h.gate.dispatch(h.call('terminal', { command: 'rm -rf build' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(r.text).toBe("Permission denied by rule 'starter:deny-recursive-delete'. Rule 'starter:deny-recursive-delete' (recursive delete) resolved 'terminal' to deny. The 'terminal' call was not executed. Choose a different approach or ask the user to adjust the permission policy.");
    expect(h.rec.issues[0]).toMatchObject({ kind: 'permission_denied', severity: 'warning', evidence_ref: 'permission_audit#1' });
    expect(h.rec.settles[0]).toMatchObject({ status: 'blocked' });
    expect(h.executed).toHaveLength(0);
  });

  it('ask → approve once: approval.requested (brokered) precedes the decision, which pairs by request id; user-once never grants a session rule', async () => {
    const h = harness();
    const p = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await Promise.resolve();
    expect(h.rec.requested[0]).toMatchObject({ resolver: 'brokered', timeout_seconds: 300, unattended_reason: '', request_id: 'req1' });
    expect(h.rec.pending.at(-1)).toHaveLength(1);
    expect(h.approvals.resolve('req1', 'once')).toBe(true);
    const r = await p;
    expect(r.status).toBe('ok');
    expect(h.rec.decisions[0]).toMatchObject({ decision: 'allow', source: 'user-once', rule_id: 'approval:once', request_id: 'req1' });
    expect(h.rec.decisions[0]!['reason']).toBe("The user approved 'write_file' once (rule 'preset:ask' asked).");
    expect(h.rec.timeline).toContain('permission_approved');
    expect(h.policy.sessionApprovals).toHaveLength(0);
    expect(h.rec.pending.at(-1)).toHaveLength(0);
  });

  it('ask → approve for session: the second identical call asks nothing and cites session:allow:1', async () => {
    const h = harness();
    const p = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await Promise.resolve();
    h.approvals.resolve('req1', 'session');
    expect((await p).status).toBe('ok');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'user-session', rule_id: 'approval:session' });
    const r2 = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r2.status).toBe('ok');
    expect(h.rec.requested).toHaveLength(1);
    expect(h.rec.decisions[1]).toMatchObject({ source: 'session-rule', rule_id: 'session:allow:1' });
  });

  it('PD-TOOLS-004: approve for session on an edit covers the retry loop on that path through the gate, for that persona only', async () => {
    const edits: Record<string, unknown>[] = [];
    const haet = simpleExecutor('haet_edit', 'e', anySchema, async (a) => { edits.push(a); return { text: 'edited', isError: false }; });
    const h = harness({ extraExecutors: [['haet_edit', haet], ['haet', haet]] });
    const s = new AbortController().signal;
    const first = h.gate.dispatch(h.call('haet_edit', { path: 'specs/index.md', content_hash: '1'.repeat(64), old_string: 'a (b', new_string: 'c' }), s);
    await Promise.resolve();
    h.approvals.resolve('req1', 'session');
    expect((await first).status).toBe('ok');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'user-session', rule_id: 'approval:session' });
    expect(h.rec.decisions[0]!['reason']).toBe("The user approved 'haet_edit' for this session (rule 'preset:ask' asked); session rule 'session:allow:1' added.");
    // the retries: another old_string, another hash, the alias — no approval is asked for any of them
    expect((await h.gate.dispatch(h.call('haet_edit', { path: 'specs/index.md', content_hash: '2'.repeat(64), old_string: 'a', new_string: 'c' }), s)).status).toBe('ok');
    expect((await h.gate.dispatch(h.call('haet', { path: './specs/index.md', content_hash: '3'.repeat(64), old_string: 'b', new_string: 'c' }), s)).status).toBe('ok');
    expect(h.rec.requested).toHaveLength(1);
    expect(h.rec.decisions.slice(1).map((d) => d['rule_id'])).toEqual(['session:allow:1', 'session:allow:1']);
    // the same edit from another persona, and another path from this one, each ask again
    const coder = h.gate.dispatch({ ...h.call('haet_edit', { path: 'specs/index.md', content_hash: '2'.repeat(64), old_string: 'a', new_string: 'c' }), persona: 'coder' }, s);
    await Promise.resolve();
    expect(h.rec.requested).toHaveLength(2);
    h.approvals.resolve(String(h.rec.requested[1]!['request_id']), 'deny');
    expect((await coder).status).toBe('blocked');
    const other = h.gate.dispatch(h.call('haet_edit', { path: 'specs/other.md', content_hash: '2'.repeat(64), old_string: 'a', new_string: 'c' }), s);
    await Promise.resolve();
    expect(h.rec.requested).toHaveLength(3);
    h.approvals.resolve(String(h.rec.requested[2]!['request_id']), 'deny');
    expect((await other).status).toBe('blocked');
    expect(edits).toHaveLength(3);
  });

  it('REQ-TOOLS-018 through the gate with the run host\'s resolver: a workspace-relative read under restricted is allowed, with the process directory elsewhere', async () => {
    // The harness's own resolver joins the root itself, which is how the path scope resolving the raw argument against
    // the process directory hid until 2026-09-28; this case takes a real root and `realPathOf`, as `run-host/tools.ts` does.
    const ws = realPathOf(mkdtempSync(join(tmpdir(), 'gate-req-tools-018-')));
    try {
      mkdirSync(join(ws, 'specs'));
      writeFileSync(join(ws, 'specs', 'index.md'), 'x\n');
      expect(realPathOf(process.cwd()).startsWith(ws)).toBe(false);
      const reads: unknown[] = [];
      const readFile = simpleExecutor('read_file', 'r', z.object({ path: z.string() }), async (a) => { reads.push(a); return { text: 'x', isError: false }; });
      const h = harness({ preset: 'restricted', root: ws, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } }, extraExecutors: [['read_file', readFile]] });
      const s = new AbortController().signal;
      const inside = h.gate.dispatch(h.call('read_file', { path: 'specs/index.md' }), s);
      await Promise.resolve();
      // A regression asks under restricted:read-outside-workspace; answer it so the case fails rather than waits.
      for (const q of h.rec.requested) h.approvals.resolve(String(q['request_id']), 'deny');
      expect((await inside).status).toBe('ok');
      expect(h.rec.decisions[0]).toMatchObject({ decision: 'allow', rule_id: 'restricted:read-only-tool' });
      expect(reads).toEqual([{ path: 'specs/index.md' }]);
      // and a path outside the root still asks, as REQ-TOOLS-018 makes it
      const outside = h.gate.dispatch(h.call('read_file', { path: join(tmpdir(), 'not-in-this-workspace.md') }), s);
      await Promise.resolve();
      expect(h.rec.requested).toHaveLength(1);
      expect(h.rec.requested[0]).toMatchObject({ rule_id: 'restricted:read-outside-workspace' });
      h.approvals.resolve(String(h.rec.requested[0]!['request_id']), 'deny');
      expect((await outside).status).toBe('blocked');
      expect(reads).toHaveLength(1);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('PD-TOOLS-004: an MCP tool the surface offers as write_file keeps the exact match — another content on the same path asks again', async () => {
    const writes: Record<string, unknown>[] = [];
    const serverWrite = simpleExecutor('write_file', 'a server\'s write_file', anySchema, async (a) => { writes.push(a); return { text: 'written', isError: false }; });
    const h = harness({ extraExecutors: [['write_file', serverWrite]], publicTool: (name) => name !== 'write_file' });
    const s = new AbortController().signal;
    const first = h.gate.dispatch(h.call('write_file', { path: 'specs/index.md', content: 'one' }), s);
    await Promise.resolve();
    h.approvals.resolve('req1', 'session');
    expect((await first).status).toBe('ok');
    expect(h.policy.sessionApprovals[0]!.paths).toBeNull();
    // the identical call is covered, as REQ-TOOLS-024 covers it
    expect((await h.gate.dispatch(h.call('write_file', { content: 'one', path: 'specs/index.md' }), s)).status).toBe('ok');
    expect(h.rec.requested).toHaveLength(1);
    // another content on the same path is not: the server's tool was never scoped by path
    const other = h.gate.dispatch(h.call('write_file', { path: 'specs/index.md', content: 'two' }), s);
    await Promise.resolve();
    expect(h.rec.requested).toHaveLength(2);
    h.approvals.resolve(String(h.rec.requested[1]!['request_id']), 'deny');
    expect((await other).status).toBe('blocked');
    expect(writes).toEqual([{ path: 'specs/index.md', content: 'one' }, { content: 'one', path: 'specs/index.md' }]);
  });

  it('ask → deny, timeout, cancel: the three deny sources with their reason clauses', async () => {
    const h = harness({ timeoutMs: 5_000 });
    const s = new AbortController().signal;
    const a = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), s);
    await Promise.resolve();
    h.approvals.resolve('req1', 'deny');
    expect((await a).status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'user-deny', request_id: 'req1' });
    expect(String(h.rec.decisions[0]!['reason'])).toMatch(/the user denied the request\.$/);

    const b = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'b.txt' }), s);
    await Promise.resolve();
    h.clock.advance(5_000);
    expect((await b).status).toBe('blocked');
    expect(h.rec.decisions[1]).toMatchObject({ source: 'timeout' });
    expect(String(h.rec.decisions[1]!['reason'])).toMatch(/Denied because no answer arrived within 5 seconds\.$/);

    const c = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'c.txt' }), s);
    await Promise.resolve();
    expect(h.approvals.cancelAll()).toBe(1);
    expect((await c).status).toBe('blocked');
    expect(h.rec.decisions[2]).toMatchObject({ source: 'cancelled' });
    expect(String(h.rec.decisions[2]!['reason'])).toMatch(/the approval request was cancelled\.$/);
  });

  it('PD-ORCH-005 clause 9: an approval withdrawn by a rest is never a denial — nothing is audited or raised, the timeline names the interruption, the call settles blocked, interrupted and never run, and asked again it asks afresh', async () => {
    const h = harness();
    const s = new AbortController().signal;
    const a = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), s);
    await Promise.resolve();
    expect(h.approvals.withdrawAll('stop')).toBe(1);
    const r = await a;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true, decision: null, text: 'The approval this call was waiting on was withdrawn by the stop; the call was not run.' });
    expect(h.executed).toEqual([]);
    expect(h.rec.decisions).toEqual([]);
    expect(h.rec.issues).toEqual([]);
    expect(h.rec.timeline).toEqual(['approval_withdrawn']);
    expect(h.rec.pending.at(-1)).toEqual([]);
    expect(h.rec.settles.at(-1)).toMatchObject({ failure_kind: 'interrupted' });
    const again = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), s);
    await Promise.resolve();
    expect(h.rec.requested).toHaveLength(2);
    expect(h.approvals.resolve(h.approvals.pending()[0]!.request_id, 'once')).toBe(true);
    expect(await again).toMatchObject({ status: 'ok' });
    expect(h.executed).toHaveLength(1);
  });

  it('PD-ORCH-005: an executor that reports its rest cut it short (the interrupted failure kind) settles the call interrupted', async () => {
    const h = harness({ preset: 'autonomous', extraExecutors: [['todo', simpleExecutor('todo', 'todo', z.object({ operation: z.string() }), async () => ({ text: 'released by the pause', isError: true, failureKind: INTERRUPTED_FAILURE_KIND }))]] });
    const r = await h.gate.dispatch(h.call('todo', { operation: 'list' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'failed', interrupted: true, text: 'released by the pause' });
    const plain = harness({ preset: 'autonomous', extraExecutors: [['todo', simpleExecutor('todo', 'todo', z.object({ operation: z.string() }), async () => ({ text: 'broke', isError: true, failureKind: 'execution_error' }))]] });
    expect((await plain.gate.dispatch(plain.call('todo', { operation: 'list' }), new AbortController().signal)).interrupted).toBeUndefined();
  });

  it('REQ-TOOLS-055: a timeout of 0 registers no deadline; only an answer or a cancellation releases the wait', async () => {
    const h = harness({ timeoutMs: 0 });
    const p = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await Promise.resolve();
    expect(h.rec.requested[0]).toMatchObject({ timeout_seconds: 0 });
    h.clock.advance(3_600_000);
    expect(h.approvals.size).toBe(1);
    h.approvals.cancel('req1');
    expect((await p).status).toBe('blocked');
  });

  /*
   * Defect `an-approval-asked-after-the-last-window-closes-is-denied` (R-067): the quit revokes the last presenter at once
   * but shuts the run host down only after REQ-GIT-101's checkpoint wait. An ask in that gap met no presenter and was
   * resolved as the headless case — denied — where PD-ORCH-005 clause 9 has the quit withdraw it.
   */
  it('PD-ORCH-005 clause 9: an ask made after the quit closed the last window is held unshown, outlives its timeout, and is withdrawn by the quit — never denied', async () => {
    let shown = 0;
    const h = harness({ attended: false, quitting: () => true, presenter: { present: async () => { shown += 1; return { ok: true }; }, close: () => undefined } });
    const a = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await Promise.resolve();
    expect(h.rec.requested[0]).toMatchObject({ resolver: 'brokered', unattended_reason: '', request_id: 'req1' });
    expect(h.rec.pending.at(-1)).toHaveLength(1);
    expect(shown).toBe(0);
    // The checkpoint wait can outlast the approval budget; the quit's gap never turns the held ask into a timeout's denial.
    h.clock.advance(900_000);
    await Promise.resolve();
    expect(h.approvals.size).toBe(1);
    expect(h.rec.decisions).toEqual([]);
    expect(h.approvals.withdrawAll('quit')).toBe(1);
    const r = await a;
    expect(r).toMatchObject({ status: 'blocked', isError: true, interrupted: true, decision: null, text: 'The approval this call was waiting on was withdrawn by quitting the application; the call was not run.' });
    expect(h.executed).toEqual([]);
    expect(h.rec.decisions).toEqual([]);
    expect(h.rec.issues).toEqual([]);
    expect(h.rec.timeline).toEqual(['approval_withdrawn']);
    expect(h.rec.pending.at(-1)).toEqual([]);
  });

  it('PD-ORCH-005 clause 9: a present that crossed the last window\'s close, answered "not shown" once the quit is under way, is held for the quit — not REQ-TOOLS-058\'s presenter-error denial', async () => {
    let quitting = false;
    const h = harness({ quitting: () => quitting, presenter: { present: async () => { quitting = true; return { ok: false, error: 'no main window is open' }; }, close: () => undefined } });
    const a = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await vi.waitFor(() => expect(quitting).toBe(true));
    await Promise.resolve();
    expect(h.approvals.size).toBe(1);
    expect(h.rec.decisions).toEqual([]);
    expect(h.approvals.withdrawAll('quit')).toBe(1);
    expect(await a).toMatchObject({ status: 'blocked', interrupted: true, decision: null });
    expect(h.rec.decisions).toEqual([]);
    // With no quit under way the same failure is REQ-TOOLS-058's, as before.
    const h2 = harness({ quitting: () => false, presenter: { present: async () => ({ ok: false, error: 'no main window is open' }), close: () => undefined } });
    expect(await h2.gate.dispatch(h2.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal)).toMatchObject({ status: 'blocked' });
    expect(h2.rec.decisions[0]).toMatchObject({ source: 'presenter-error' });
  });

  it('PD-ORCH-005 clause 9 with PD-TOOLS-005: a run whose user is treated as away still resolves an ask at once in the quit\'s gap, as it would with the window open', async () => {
    const h = harness({ attended: false, quitting: () => true, presence: { away: () => ({ afterSeconds: 300 }), markAway: () => undefined } });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'headless-policy' });
    expect(String(h.rec.decisions[0]!['reason'])).toContain('treated as away');
    expect(h.approvals.size).toBe(0);
  });

  it('REQ-TOOLS-064/065/066: unattended → headless, timeout null, no wait; abort invokes the hook, degrades to deny without one', async () => {
    const h = harness({ attended: false });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(h.rec.requested[0]).toMatchObject({ resolver: 'headless', timeout_seconds: null, unattended_reason: 'headless-policy' });
    expect(h.rec.decisions[0]).toMatchObject({ source: 'headless-policy', request_id: 'req1' });
    expect(h.approvals.size).toBe(0);
    let aborted = 0;
    const h2 = harness({ attended: false, headless: 'abort', abortHook: () => { aborted += 1; } });
    await h2.gate.dispatch(h2.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(aborted).toBe(1);
    const h3 = harness({ attended: false, headless: 'abort' });
    await h3.gate.dispatch(h3.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(h3.rec.warnings[0]).toMatch(/degrading to deny/);
  });

  it('REQ-TOOLS-058: a presenter that fails discards the pending request and denies with source presenter-error', async () => {
    const h = harness({ presenter: { present: async () => ({ ok: false, error: 'no window' }), close: () => undefined } });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'presenter-error' });
    expect(h.approvals.size).toBe(0);
  });

  /*
   * REQ-TOOLS-063: a request queued behind another dialog is shown only when that dialog closes, so its presentation
   * may never come. A timeout or a cancellation while it is queued drops it unshown, and it counts as cancelled
   * (REQ-TOOLS-054). An answer given elsewhere while it is queued is honoured. Before the gate raced the presentation
   * against its own wait, a presenter that never confirmed held the call until the presenter's bound denied it.
   */
  it('REQ-TOOLS-063/054: a queued request whose wait times out is dropped unshown and counts as cancelled', async () => {
    const closed: string[] = [];
    const h = harness({ timeoutMs: 1_000, presenter: { present: () => new Promise(() => undefined), close: (id) => { closed.push(id); } } });
    const p = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await vi.waitFor(() => expect(h.approvals.size).toBe(1));
    h.clock.advance(1_000);
    const r = await p;
    expect(r.status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'cancelled', request_id: 'req1' });
    expect(closed).toEqual(['req1']);
    expect(h.approvals.size).toBe(0);
    expect(h.executed).toHaveLength(0);
  });

  it('REQ-TOOLS-063: a queued request answered elsewhere before it is shown is honoured', async () => {
    const h = harness({ presenter: { present: () => new Promise(() => undefined), close: () => undefined } });
    const p = h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    await vi.waitFor(() => expect(h.approvals.size).toBe(1));
    expect(h.approvals.resolve('req1', 'once')).toBe(true);
    const r = await p;
    expect(r.status).toBe('ok');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'user-once', request_id: 'req1' });
    expect(h.executed).toHaveLength(1);
  });

  it('REQ-TOOLS-026: approval resolution that raises denies with source fail-closed', async () => {
    const h = harness({ presenter: { present: async () => { throw new Error('channel gone'); }, close: () => undefined } });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(h.rec.decisions[0]).toMatchObject({ source: 'fail-closed' });
    expect(String(h.rec.decisions[0]!['reason'])).toMatch(/Denied because approval resolution failed: channel gone\.$/);
    expect(r.status).toBe('blocked');
  });

  it('REQ-TOOLS-032: truncated JSON is completed; an object where an array is expected is wrapped; still-invalid is a recoverable error, unexecuted', async () => {
    expect(completeTruncatedJson('{"a": "b')).toBe('{"a": "b"}');
    expect(completeTruncatedJson('{"a": [1, 2')).toBe('{"a": [1, 2]}');
    expect(completeTruncatedJson('{"a": 1, "b":')).toBe('{"a": 1}');
    // The array repair is the schema's to decide (repairArrayFields, below): the JSON repairs leave an object an object.
    expect(repairPayload('{"tasks": {"name": "x"}}', false)).toEqual({ tasks: { name: 'x' } });
    expect(repairPayload('{"message": "done', true)).toEqual({ message: 'done' });
    expect(repairPayload('not json at all {', true)).toEqual({ message: 'not json at all {' });
    const h = harness({ preset: 'autonomous' });
    const ok = await h.gate.dispatch(h.call('todo', '{"operation": "replace", "tasks": {"name": "x"'), new AbortController().signal);
    expect(ok.status).toBe('ok');
    expect(ok.args).toEqual({ operation: 'replace', tasks: [{ name: 'x' }] });
    const bad = await h.gate.dispatch(h.call('write_file', { operation: 5 }), new AbortController().signal);
    expect(bad.status).toBe('failed');
    expect(bad.text).toMatch(/do not match its schema/);
    expect(h.rec.decisions).toHaveLength(1);
    expect(h.rec.settles[1]).toMatchObject({ status: 'failed', failure_kind: 'invalid_request' });
    const unknown = await h.gate.dispatch(h.call('nope', {}), new AbortController().signal);
    expect(unknown.text).toMatch(/Unknown tool 'nope'/);
  });

  it('REQ-TOOLS-032: the run\'s exact malformed shapes reach the hooks, not the generic message', async () => {
    const h = harness({ preset: 'autonomous', extraExecutors: [['ask_questions', askQuestionsReal()], ['write_file', writeFileReal()], ['haet_edit', haetEditReal()]] });
    // Ordinal 19: `{questions: [...]}` for `{steps: [...]}`.
    const q = await h.gate.dispatch(h.call('ask_questions', { questions: [{ id: 'a', title: 'A' }] }), new AbortController().signal);
    expect(q.status).toBe('failed');
    expect(q.text).toMatch(/takes `steps`, not `questions`/);
    // Ordinal 121/266: `write_file` without `operation`.
    const w = await h.gate.dispatch(h.call('write_file', { path: 'notes.txt', content: 'x' }), new AbortController().signal);
    expect(w.status).toBe('failed');
    expect(w.text).toMatch(/write_file requires an operation/);
    // Ordinal 159: `haet_edit` without `path`.
    const he = await h.gate.dispatch(h.call('haet_edit', { content_hash: 'a'.repeat(64), old_string: 'a', new_string: 'b' }), new AbortController().signal);
    expect(he.status).toBe('failed');
    expect(he.text).toMatch(/haet_edit requires a path/);
    expect(h.rec.settles.slice(-3).every((s) => (s as { failure_kind: string }).failure_kind === 'invalid_request')).toBe(true);
  });

  it('an executor that throws or is aborted becomes a failed observation with a tool_error issue; the run is never aborted', async () => {
    const h = harness({ preset: 'autonomous' });
    const r = await h.gate.dispatch(h.call('grep', { pattern: 'x' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'failed', isError: true });
    expect(r.text).toMatch(/disk on fire/);
    expect(h.rec.issues[0]).toMatchObject({ kind: 'tool_error', evidence_ref: 'tool_call_evidence#c-grep' });
  });

  it('REQ-SESSION-136: each call the gate refuses as invalid_request files one tool_error issue referencing its tool-call record (live-run a71-6)', async () => {
    // Before the repair none of these filed an issue: the gate's refusals returned before `outcomeIssues`, so the duress
    // run's two schema-invalid `write_file` calls were failures in the record that no issue referenced.
    const h = harness({ preset: 'autonomous', extraExecutors: [['write_file', writeFileReal()]] });
    const cases: [ToolCall, RegExp][] = [
      // The schema refusal with the tool's own diagnostic — the duress run's `write_file` without `operation`.
      [h.call('write_file', { path: 'notes.txt', content: 'x' }), /write_file requires an operation/],
      // The schema refusal with the gate's generic text.
      [{ ...h.call('todo', { operation: 5 }), callId: 'c-todo-schema' }, /do not match its schema/],
      // Arguments that cannot be read as JSON even after repair.
      [{ ...h.call('grep', 'not json'), callId: 'c-grep-json' }, /could not be read as JSON/],
      // A name that is no tool.
      [h.call('read_path', { path: 'a.ts' }), /Unknown tool 'read_path'/],
    ];
    for (const [call, text] of cases) {
      const before = h.rec.issues.length;
      const r = await h.gate.dispatch(call, new AbortController().signal);
      expect(r).toMatchObject({ status: 'failed', isError: true });
      expect(r.text).toMatch(text);
      expect(h.rec.settles.at(-1)).toMatchObject({ status: 'failed', failure_kind: 'invalid_request' });
      expect(h.rec.issues.slice(before)).toHaveLength(1);
      expect(h.rec.issues.at(-1)).toMatchObject({ kind: 'tool_error', severity: 'warning', actor: 'orchestrator', evidence_ref: `tool_call_evidence#${call.callId}`, metadata: { tool: call.name, failure_kind: 'invalid_request' } });
      expect(String(h.rec.issues.at(-1)!['message'])).toContain(`The '${call.name}' call failed:`);
    }
    expect(h.executed).toEqual([]);
    expect(h.rec.decisions).toEqual([]);
  });

  it('REQ-SESSION-136: a refusal that is not a failure — the plan gate\'s `blocked` — files no issue', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(h.rec.issues).toEqual([]);
  });

  it('REQ-TOOLS-014: the meta tools resolve allow with builtin:meta-tool ahead of everything', async () => {
    const h = harness({ preset: 'restricted', extraExecutors: [['finish', simpleExecutor('finish', 'f', z.object({ message: z.string().optional() }), async () => ({ text: 'ok', isError: false }))]] });
    const r = await h.gate.dispatch(h.call('finish', '{"message": "do'), new AbortController().signal);
    expect(r.decision).toMatchObject({ ruleId: 'builtin:meta-tool', source: 'builtin' });
  });
});

describe('PendingApprovals (REQ-TOOLS-054) and PresenterRegistry (ADR-0019)', () => {
  const payload = (id: string): ApprovalPayload => ({ request_id: id, session_id: 's', agent_id: 'a', persona: 'p', tool_name: 't', command: '', argument_summary: '', rule_id: 'r', reason: '', sequence: 1 });
  it('empty and duplicate ids are rejected; unknown resolve/cancel report failure; unknown wait resolves cancelled', async () => {
    const clock = new FakeClock();
    const p = new PendingApprovals(clock);
    expect(() => p.create(payload(''), null)).toThrow();
    void p.create(payload('a'), null);
    expect(() => p.create(payload('a'), null)).toThrow("Approval 'a' is already pending.");
    expect(p.resolve('zz', 'once')).toBe(false);
    expect(p.cancel('zz')).toBe(false);
    expect(await p.wait('zz')).toEqual({ kind: 'cancelled' });
    expect(p.pending().map((x) => x.request_id)).toEqual(['a']);
    expect(p.cancelAll()).toBe(1);
    expect(p.size).toBe(0);
  });

  it('a lapse is a gap since the last reply: a late reply after a block does not save the waiters, and a reply clears the lapse', () => {
    const clock = new FakeClock();
    const polls: number[] = [];
    let lapses = 0;
    const reg = new PresenterRegistry({ monotonic: clock, timers: clock, poll: (s) => polls.push(s), onLapse: () => { lapses += 1; } });
    expect(reg.attended).toBe(false);
    reg.register('w1');
    reg.start();
    for (let i = 0; i < 4; i += 1) { clock.advance(250); reg.pollReplied(['w1']); }
    expect(reg.attended).toBe(true);
    expect(polls.length).toBe(4);
    // main blocks: polls go out, no reply comes back
    clock.advance(3_000);
    expect(lapses).toBe(0);
    clock.advance(250);
    expect(lapses).toBe(1);
    expect(reg.attended).toBe(false);
    // the backlog of replies arrives late — still one lapse, and attendedness returns
    reg.pollReplied(['w1']);
    expect(reg.attended).toBe(true);
    expect(lapses).toBe(1);
    // the last window closing makes the application unattended without any lapse
    reg.revoke('w1');
    expect(reg.attended).toBe(false);
    reg.stop();
  });

  it('PD-ORCH-005 clause 9: a revoke the quit sends marks the application quitting until a window registers again; an ordinary revoke does not', () => {
    const clock = new FakeClock();
    const reg = new PresenterRegistry({ monotonic: clock, timers: clock, poll: () => undefined, onLapse: () => undefined });
    reg.register('w1');
    reg.register('w2');
    reg.revoke('w1', true);
    // Another main window still presents, so nothing is held for the quit.
    expect(reg.quitting).toBe(false);
    expect(reg.attended).toBe(true);
    reg.revoke('w2', true);
    expect(reg.attended).toBe(false);
    expect(reg.quitting).toBe(true);
    // Main keeps answering the liveness poll with no window; that never ends the quit.
    reg.pollReplied([]);
    expect(reg.quitting).toBe(true);
    reg.register('w3');
    expect(reg.quitting).toBe(false);
    reg.revoke('w3');
    expect(reg.quitting).toBe(false);
  });

  it('PD-ORCH-005 clause 9: a wait whose budget expires while the quit holds it is not timed out; once nothing holds it, the next expiry is REQ-TOOLS-054\'s timeout', async () => {
    const clock = new FakeClock();
    let held = true;
    const p = new PendingApprovals(clock, { held: () => held });
    const w = p.create(payload('a'), 1_000);
    clock.advance(1_000);
    clock.advance(1_000);
    expect(p.has('a')).toBe(true);
    held = false;
    clock.advance(1_000);
    expect(await w).toEqual({ kind: 'timed_out', afterSeconds: 1 });
  });
});

describe('the two hook slots (ADR-0015, REQ-HOOKS-004/005/047/068/071/072/074)', () => {
  function recordingHooks(opts: { block?: boolean; feedback?: string } = {}) {
    const calls: { slot: string; call: Parameters<ToolHooks['preTool']>[0] }[] = [];
    const hooks: ToolHooks = {
      preTool: async (call) => { calls.push({ slot: 'pre', call }); return opts.block ? { blocked: true, refusal: "Blocked by hook 'G'. no The 'terminal' call was not executed. Choose a different approach or ask the user to adjust the hook configuration." } : { blocked: false, refusal: '' }; },
      postTool: async (call) => { calls.push({ slot: 'post', call }); return { feedback: opts.feedback ?? '' }; },
    };
    return { hooks, calls };
  }
  it('a pre_tool stop is a blocked result with the refusal, the tool never runs, the evidence record settles hook_blocked', async () => {
    const rh = recordingHooks({ block: true });
    const h = harness({ preset: 'autonomous', hooks: rh.hooks });
    const r = await h.gate.dispatch(h.call('terminal', { command: 'git push origin main' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'blocked', isError: true });
    expect(r.text).toMatch(/^Blocked by hook 'G'\./);
    expect(r.blockedReason).toBe(r.text);
    expect(h.executed).toEqual([]);
    expect(rh.calls.map((c) => c.slot)).toEqual(['pre']);
    expect(rh.calls[0]!.call).toMatchObject({ toolName: 'terminal', facetText: 'git push origin main', command: 'git push origin main', arguments: { command: 'git push origin main' } });
    expect(h.rec.settles[0]).toMatchObject({ status: 'blocked', failure_kind: 'hook_blocked' });
    // the decision was still audited as allow: the policy permitted, the hook refused (REQ-HOOKS-004)
    expect(h.rec.decisions[0]).toMatchObject({ decision: 'allow' });
  });
  it('post_tool feedback rides in the same result for an observation and follows as a user message for an error; the facet for a file tool is its operation', async () => {
    const rh = recordingHooks({ feedback: "Hook 'P' reported after the call: noted" });
    const h = harness({ preset: 'autonomous', hooks: rh.hooks });
    const ok = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(ok.text).toBe("wrote a.txt\nHook 'P' reported after the call: noted");
    expect(ok.followUp).toBeUndefined();
    expect(rh.calls.map((c) => c.slot)).toEqual(['pre', 'post']);
    expect(rh.calls[0]!.call).toMatchObject({ facetText: 'create', command: '' });
    expect(rh.calls[1]!.call.results).toEqual([{ kind: 'observation', text: 'wrote a.txt' }]);
    const bad = await h.gate.dispatch(h.call('grep', { pattern: 'x' }), new AbortController().signal);
    expect(bad.status).toBe('failed');
    expect(bad.text).toMatch(/^The 'grep' call failed: disk on fire/);
    expect(bad.followUp).toBe("Hook 'P' reported after the call: noted");
    expect(rh.calls[3]!.call.results).toEqual([{ kind: 'error', text: bad.text }]);
  });
  it('PD-ORCH-005 clause 9 (found by phase 3\'s second review): a question the rest withdrew never ran — blocked, recorded as withdrawn, no post_tool hook and no tool error', async () => {
    const rh = recordingHooks();
    const withdrawn = simpleExecutor('ask_questions', 'q', anySchema, async () => ({ text: 'The questions were withdrawn by the pause.', isError: true, failureKind: INTERRUPTED_FAILURE_KIND, withdrawnBy: 'pause' as const }));
    const h = harness({ preset: 'autonomous', hooks: rh.hooks, extraExecutors: [['ask_questions', withdrawn]] });
    const r = await h.gate.dispatch(h.call('ask_questions', {}), new AbortController().signal);
    expect(r).toMatchObject({ status: 'blocked', interrupted: true, blockedReason: 'The questions were withdrawn by the pause.' });
    expect(rh.calls.map((c) => c.slot)).toEqual(['pre']);
    expect(h.rec.timeline).toContain('question_withdrawn');
    expect(h.rec.issues).toEqual([]);
  });

  it('REQ-HOOKS-004/068: a call the policy denies starts no hook; no hook port means one lookup and nothing more', async () => {
    const rh = recordingHooks();
    const h = harness({ preset: 'autonomous', hooks: rh.hooks });
    const r = await h.gate.dispatch(h.call('terminal', { command: 'rm -rf build' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(rh.calls).toEqual([]);
    const none = harness({ preset: 'autonomous' });
    const r2 = await none.gate.dispatch(h.call('write_file', { operation: 'create', path: 'b.txt' }), new AbortController().signal);
    expect(r2.text).toBe('wrote b.txt');
  });
});

/**
 * REQ-ORCH-153 (ADR-0062): the plan gate's enforcement at dispatch — the authoritative point, because it binds
 * "whichever role issues it and by whatever route the tool reached that role".
 */
describe('the plan gate at dispatch (REQ-ORCH-153, ADR-0062)', () => {
  function hooksThatRecord() {
    const slots: string[] = [];
    const hooks: ToolHooks = {
      preTool: async () => { slots.push('pre'); return { blocked: false, refusal: '' }; },
      postTool: async () => { slots.push('post'); return { feedback: '' }; },
    };
    return { hooks, slots };
  }

  it('refuses a withheld call as blocked, executes nothing, and settles the evidence record', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'blocked', isError: true });
    expect(r.text).toContain('held at the plan gate');
    expect(r.blockedReason).toBe(r.text);
    expect(h.executed).toEqual([]);
    expect(h.rec.settles[0]).toMatchObject({ status: 'blocked', failure_kind: 'plan_gate_withheld' });
  });

  it('fires no tool hook for a refused call — the refusal precedes the permission resolution (REQ-HOOKS-004)', async () => {
    const rh = hooksThatRecord();
    const h = harness({ preset: 'autonomous', planGateHeld: true, hooks: rh.hooks });
    await h.gate.dispatch(h.call('terminal', { command: 'rm -rf .' }), new AbortController().signal);
    expect(rh.slots).toEqual([]);
    // No permission decision is taken either: nothing was permitted, so nothing is audited as permitted.
    expect(h.rec.decisions).toEqual([]);
  });

  it('withholds a server\'s tool offered under a public read-only name — the declaration is the tool\'s, not the name\'s (REQ-TOOLS-001, ADR-0016)', async () => {
    const reads: unknown[] = [];
    const serverRead = simpleExecutor('read_file', 'a server\'s read_file', anySchema, async (a) => { reads.push(a); return { text: 'read', isError: false }; });
    const h = harness({ preset: 'autonomous', planGateHeld: true, extraExecutors: [['read_file', serverRead]], publicTool: (name) => name !== 'read_file' });
    const r = await h.gate.dispatch(h.call('read_file', { path: 'a.ts' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'blocked', isError: true });
    expect(r.text).toContain('held at the plan gate');
    expect(h.rec.settles[0]).toMatchObject({ failure_kind: 'plan_gate_withheld' });
    expect(reads).toEqual([]);
    // the public tool of that name is what the requirement leaves a held run
    const pub = harness({ preset: 'autonomous', planGateHeld: true, extraExecutors: [['read_file', simpleExecutor('read_file', 'r', anySchema, async () => ({ text: 'read', isError: false }))]] });
    expect((await pub.gate.dispatch(pub.call('read_file', { path: 'a.ts' }), new AbortController().signal)).status).toBe('ok');
    // a public read-only name the port never offered is still no tool here: no approval could make it exist
    const none = harness({ preset: 'autonomous', planGateHeld: true, publicTool: () => false });
    const u = await none.gate.dispatch(none.call('read_file', { path: 'a.ts' }), new AbortController().signal);
    expect(u.status).toBe('failed');
    expect(u.text).toContain("Unknown tool 'read_file'");
  });

  it('refuses a name this port never offered — an MCP tool reaching the role by another route', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true, planGateWithheldNames: ['mcp__x__write'] });
    const r = await h.gate.dispatch(h.call('mcp__x__write', { any: 1 }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(r.text).toContain('held at the plan gate');
    expect(h.rec.settles[0]).toMatchObject({ failure_kind: 'plan_gate_withheld' });
  });

  it('refuses a public name the port did not offer with the gate\'s reason — approval is what would grant it', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true });
    const r = await h.gate.dispatch(h.call('git_commit', { message: 'x' }), new AbortController().signal);
    expect(r.status).toBe('blocked');
    expect(r.text).toContain('held at the plan gate');
  });

  it('a name that is no tool reads as unknown, not as withheld: no approval can make it exist', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true });
    const r = await h.gate.dispatch(h.call('read_path', { path: 'a.ts' }), new AbortController().signal);
    expect(r.status).toBe('failed');
    expect(r.text).toBe("Unknown tool 'read_path'. The call was not executed; choose one of the tools listed.");
    expect(r.text).not.toContain('plan gate');
    expect(h.rec.settles[0]).toMatchObject({ failure_kind: 'invalid_request' });
    expect(h.executed).toEqual([]);
  });

  it('the remedy names the act that ends the hold, not the state', async () => {
    const h = harness({ preset: 'autonomous', planGateHeld: true });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(r.text).toContain('Write the plan as the final message of this turn and stop');
  });

  it('lets a reading tool through, and the same call through untouched once the hold is over', async () => {
    const held = harness({ preset: 'autonomous', planGateHeld: true });
    const todo = await held.gate.dispatch(held.call('todo', { operation: 'list' }), new AbortController().signal);
    expect(todo.status).toBe('ok');
    const released = harness({ preset: 'autonomous', planGateHeld: false });
    const write = await released.gate.dispatch(released.call('write_file', { operation: 'create', path: 'a.txt' }), new AbortController().signal);
    expect(write).toMatchObject({ status: 'ok', text: 'wrote a.txt' });
  });
});

describe('write scopes at dispatch (PD-TOOLS-006)', () => {
  // A real directory: the claim is asked about the path exactly as the file tools' fence resolves it, real path and all.
  let root = '';
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-scope-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const HOLDER = { canonicalName: 'api', persona: 'coding-agent', pattern: 'src/api/**' };
  /** A claim on `src/api/**` for every caller, recording each path the gate asked about. */
  function claimOnApi() {
    const asked: string[] = [];
    return { asked, writeClaimFor: (rel: string) => { asked.push(rel); return rel.startsWith('src/api/') ? HOLDER : null; } };
  }
  const HASH = 'a'.repeat(64);

  it('refuses a write into a claimed path as blocked, in the directive\'s words, before any approval is asked or anything runs', async () => {
    const claims = claimOnApi();
    const h = harness({ preset: 'ask', writeClaimFor: claims.writeClaimFor, root });
    const r = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'src/api/users.ts' }), new AbortController().signal);
    expect(r).toMatchObject({ status: 'blocked', isError: true });
    expect(r.text).toBe("src/api/users.ts is inside the write scope of api (coding-agent), which is still running: 'src/api/**'. The write was not executed. Choose a path outside that scope, or wait for api with wait_for_tasks.");
    expect(r.blockedReason).toBe(r.text);
    expect(h.executed).toEqual([]);
    // Under `ask` a write would have been brokered to the user: the claim answers first, so nobody is asked.
    expect(h.rec.requested).toEqual([]);
    expect(h.rec.decisions).toEqual([]);
    expect(h.rec.settles[0]).toMatchObject({ status: 'blocked', failure_kind: 'write_scope_claimed' });
  });

  it('every write_file operation counts, undo included, and the path is read as the fence reads it', async () => {
    const claims = claimOnApi();
    const h = harness({ preset: 'autonomous', writeClaimFor: claims.writeClaimFor, root });
    const undo = await h.gate.dispatch(h.call('write_file', { operation: 'undo', path: 'src/api/users.ts' }), new AbortController().signal);
    expect(undo.status).toBe('blocked');
    const dotted = await h.gate.dispatch(h.call('write_file', { operation: 'overwrite', path: './src/ui/../api/users.ts' }), new AbortController().signal);
    expect(dotted.status).toBe('blocked');
    expect(claims.asked).toEqual(['src/api/users.ts', 'src/api/users.ts']);
  });

  it('refuses haet_edit and its alias haet on the same terms', async () => {
    const claims = claimOnApi();
    const h = harness({ preset: 'autonomous', writeClaimFor: claims.writeClaimFor, root, extraExecutors: [['haet_edit', haetEditReal()], ['haet', haetEditReal()]] });
    for (const name of ['haet_edit', 'haet']) {
      const r = await h.gate.dispatch(h.call(name, { path: 'src/api/users.ts', content_hash: HASH, old_string: 'a', new_string: 'b' }), new AbortController().signal);
      expect(r.status).toBe('blocked');
      expect(r.text).toContain('inside the write scope of api (coding-agent)');
    }
  });

  it('lets a write outside every claim through, and never consults the claims for a tool that is not a file write', async () => {
    const claims = claimOnApi();
    const h = harness({ preset: 'autonomous', writeClaimFor: claims.writeClaimFor, root });
    const write = await h.gate.dispatch(h.call('write_file', { operation: 'create', path: 'src/ui/view.ts' }), new AbortController().signal);
    expect(write).toMatchObject({ status: 'ok', text: 'wrote src/ui/view.ts' });
    await h.gate.dispatch(h.call('terminal', { command: 'echo src/api/users.ts' }), new AbortController().signal);
    await h.gate.dispatch(h.call('todo', { operation: 'list' }), new AbortController().signal);
    expect(claims.asked).toEqual(['src/ui/view.ts']);
  });
});

/**
 * PD-TOOLS-005: after one approval wait ends by timeout, the run treats the user as away and every further ask that
 * would prompt resolves at once under the headless policy, until the user's next input. The holder is the engine's
 * (one per run, on every agent's port); here it is a stand-in with the same two methods, so each clause is decided
 * against the gate alone.
 */
describe('PD-TOOLS-005: after one unanswered approval, a run treats the user as away', () => {
  const presence = () => {
    let mark: { afterSeconds: number } | null = null;
    return { away: () => mark, markAway: (afterSeconds: number) => { mark ??= { afterSeconds }; }, returned: () => { mark = null; } };
  };
  const write = (h: ReturnType<typeof harness>, path: string, s = new AbortController().signal) => h.gate.dispatch(h.call('write_file', { operation: 'create', path }), s);
  const ASKED = "No rule matched; permission mode 'ask' defaults to ask.";

  it('the first ask waits the full timeout with REQ-TOOLS-052\'s reason and marks the user away with that timeout; the second resolves at once with the directive\'s reason', async () => {
    const p = presence();
    const h = harness({ timeoutMs: 5_000, presence: p });
    const first = write(h, 'a.txt');
    await Promise.resolve();
    expect(h.rec.requested[0]).toMatchObject({ resolver: 'brokered', timeout_seconds: 5, unattended_reason: '' });
    // Not a second early: the full wait is paid, and the user is not away while it runs.
    h.clock.advance(4_999);
    expect(h.approvals.size).toBe(1);
    expect(p.away()).toBeNull();
    h.clock.advance(1);
    const r1 = await first;
    expect(r1.status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'timeout', request_id: 'req1' });
    expect(h.rec.decisions[0]!['reason']).toBe(`${ASKED} Denied because no answer arrived within 5 seconds.`);
    expect(p.away()).toEqual({ afterSeconds: 5 });

    // The second ask: no wait is created, nothing is presented, the decision is the headless policy's with the away reason.
    const r2 = await write(h, 'b.txt');
    expect(r2.status).toBe('blocked');
    expect(h.approvals.size).toBe(0);
    expect(h.rec.requested).toHaveLength(2);
    expect(h.rec.requested[1]).toMatchObject({ resolver: 'headless', timeout_seconds: null, unattended_reason: 'headless-policy' });
    expect(h.rec.decisions[1]).toMatchObject({ decision: 'deny', source: 'headless-policy', rule_id: 'preset:ask', request_id: h.rec.requested[1]!['request_id'] });
    expect(h.rec.decisions[1]!['reason']).toBe(`${ASKED} The user is treated as away because an earlier approval in this run went unanswered for 5 seconds, so the request was denied.`);
    expect(String(h.rec.decisions[1]!['reason'])).not.toMatch(/No approval UI/);
    expect(r2.blockedReason).toBe(h.rec.decisions[1]!['reason']);
    // The autopsy reads the cause from the permission_denied issue the deny records.
    expect(h.rec.issues.at(-1)).toMatchObject({ kind: 'permission_denied' });
    expect(String(h.rec.issues.at(-1)!['message'])).toContain('treated as away');
    expect(h.executed).toHaveLength(0);

    // The user returns (the engine clears the holder on their input): the next ask is brokered and waits again.
    p.returned();
    const third = write(h, 'c.txt');
    await Promise.resolve();
    expect(h.rec.requested[2]).toMatchObject({ resolver: 'brokered', timeout_seconds: 5 });
    expect(h.approvals.size).toBe(1);
    h.approvals.resolve(String(h.rec.requested[2]!['request_id']), 'once');
    expect((await third).status).toBe('ok');
  });

  it('under `abort` the away ask is refused, the abort hook is invoked, and the reason says so without claiming no approval UI exists', async () => {
    const p = presence();
    p.markAway(300);
    let aborted = 0;
    const h = harness({ headless: 'abort', abortHook: () => { aborted += 1; }, presence: p });
    const r = await write(h, 'a.txt');
    expect(r.status).toBe('blocked');
    expect(aborted).toBe(1);
    expect(h.rec.decisions[0]).toMatchObject({ source: 'headless-policy' });
    expect(h.rec.decisions[0]!['reason']).toBe(`${ASKED} The user is treated as away because an earlier approval in this run went unanswered for 300 seconds, so the request was denied and the headless approval policy aborts the run.`);
    // No hook registered: REQ-TOOLS-065's degrade to deny, with the away reason.
    const h2 = harness({ headless: 'abort', presence: p });
    const r2 = await write(h2, 'a.txt');
    expect(r2.blockedReason).toBe(`${ASKED} The user is treated as away because an earlier approval in this run went unanswered for 300 seconds, so the request was denied.`);
    expect(h2.rec.warnings[0]).toMatch(/degrading to deny/);
  });

  it('a timeout of 0 waits without limit and never marks the user away (REQ-TOOLS-055)', async () => {
    const p = presence();
    const h = harness({ timeoutMs: 0, presence: p });
    const first = write(h, 'a.txt');
    await Promise.resolve();
    h.clock.advance(24 * 3_600_000);
    expect(h.approvals.size).toBe(1);
    expect(p.away()).toBeNull();
    // Released by a cancellation, as before: still not a timeout, still not away.
    expect(h.approvals.cancelAll()).toBe(1);
    expect((await first).status).toBe('blocked');
    expect(h.rec.decisions[0]).toMatchObject({ source: 'cancelled' });
    expect(p.away()).toBeNull();
    const second = write(h, 'b.txt');
    await Promise.resolve();
    expect(h.rec.requested[1]).toMatchObject({ resolver: 'brokered', timeout_seconds: 0 });
    expect(h.approvals.size).toBe(1);
    h.approvals.resolve(String(h.rec.requested[1]!['request_id']), 'once');
    expect((await second).status).toBe('ok');
  });

  it('a question still prompts and waits while the user is away (REQ-TOOLS-158/178), and asks a rule resolves without prompting are unaffected', async () => {
    const p = presence();
    p.markAway(300);
    const questions = new PendingQuestions(new FakeClock());
    const ask = askQuestionsTool({ pending: questions, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => true });
    const h = harness({ presence: p, extraExecutors: [['ask_questions', ask]] });
    // A question whose call is permitted reaches its executor and WAITS on the user-prompt channel, untouched by the
    // away state: under `autonomous` nothing asks, so the call is permitted outright.
    const h2 = harness({ preset: 'autonomous', presence: p, extraExecutors: [['ask_questions', ask]] });
    const pending = h2.gate.dispatch(h2.call('ask_questions', { steps: [{ id: 'a', title: 'A', options: [{ id: 'x', label: 'X' }] }] }), new AbortController().signal);
    await Promise.resolve(); await Promise.resolve();
    expect(questions.pending()).toHaveLength(1);
    expect(h2.rec.requested).toHaveLength(0);
    const id = questions.pending()[0]!.request_id;
    expect(questions.resolve(id, { a: { selected_option: 'x', freeform_text: null } })).toBe(true);
    const answered = await pending;
    expect(answered.status).toBe('ok');
    expect(answered.text).toContain('## User Answers');
    // A rule that allows: the read-only class executes without an approval and without the away state being consulted.
    const g = await h.gate.dispatch(h.call('grep', { pattern: 'x' }), new AbortController().signal);
    expect(g.status).toBe('failed'); // the stand-in executor throws — it RAN, which is the point
    expect(h.rec.decisions.at(-1)).toMatchObject({ decision: 'allow', rule_id: 'ask:read-only-tool' });
    // A rule that denies: the rule's own source and reason, not the headless policy's.
    const d = await h.gate.dispatch(h.call('terminal', { command: 'rm -rf build' }), new AbortController().signal);
    expect(d.status).toBe('blocked');
    expect(h.rec.decisions.at(-1)).toMatchObject({ decision: 'deny', rule_id: 'starter:deny-recursive-delete', source: 'rule' });
    expect(h.rec.requested).toHaveLength(0);
    // The reading taken, raised as OQ-77: `ask_questions` is outside REQ-TOOLS-007's read-only class, so under the
    // `ask` preset its own dispatch is an APPROVAL ask, and that ask is one the away state resolves at once — the
    // question is never put to the user. The directive's "questions still prompt" clause governs the question the
    // executor raises, and is reachable only where the call itself is permitted.
    const q = await h.gate.dispatch(h.call('ask_questions', { steps: [{ id: 'b', title: 'B' }] }), new AbortController().signal);
    expect(q.status).toBe('blocked');
    expect(q.blockedReason).toBe(`${ASKED} The user is treated as away because an earlier approval in this run went unanswered for 300 seconds, so the request was denied.`);
    expect(questions.pending()).toHaveLength(0);
  });

  it('a session with no presenter is still reported as such: REQ-TOOLS-065\'s reason, not the away one', async () => {
    const p = presence();
    p.markAway(300);
    const h = harness({ attended: false, presence: p });
    const r = await write(h, 'a.txt');
    expect(r.blockedReason).toBe(`${ASKED} No approval UI is available in this host, so the request was denied.`);
  });
});

/**
 * Live-run finding G3 (default run at 27a5127): a tool whose parameters are a JSON Schema — an MCP tool, handed to the
 * model as its server's `inputSchema` — reached the gate with `anySchema`, so REQ-TOOLS-032's refusal never fired for it
 * (docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md). `advertisedSchemaCheck`
 * gives the gate a schema that checks the advertised one; the refusal takes the built-in tool's shape and record.
 */
describe('REQ-TOOLS-032 for a tool advertised by JSON Schema (advertisedSchemaCheck)', () => {
  const ADVERTISED = { type: 'object', required: ['memory_name', 'needle'], properties: { memory_name: { type: 'string' }, needle: { type: 'string' }, site: { type: 'string', format: 'uri' }, limit: { type: 'integer', default: 10 } } };
  function advertisedHarness(inputSchema: Record<string, unknown>) {
    const sent: unknown[] = [];
    const check = advertisedSchemaCheck(inputSchema);
    const executor = simpleExecutor('amend_note', 'e', check.schema, async (a) => { sent.push(a); return { text: 'edited', isError: false, outcomeKind: 'mcp' }; });
    const h = harness({ preset: 'autonomous', extraExecutors: [['amend_note', executor]], publicTool: (n) => n !== 'amend_note' });
    return { ...h, sent, check };
  }

  it('a call missing a required property is refused as invalid_request with a tool_error issue, and never executed', async () => {
    const h = advertisedHarness(ADVERTISED);
    const r = await h.gate.dispatch(h.call('amend_note', { content: 'x', memory_name: 'm' }), new AbortController().signal);
    expect(h.sent).toEqual([]);
    expect(r).toMatchObject({ status: 'failed', isError: true });
    expect(r.text).toBe("The arguments for 'amend_note' do not match its schema (needle: required property is missing). Re-issue the call with corrected arguments.");
    expect(h.rec.settles[0]).toMatchObject({ status: 'failed', is_error: true, failure_kind: 'invalid_request' });
    expect(h.rec.issues).toEqual([expect.objectContaining({ kind: 'tool_error', severity: 'warning' })]);
    expect(h.rec.decisions).toHaveLength(0);
  });

  it('a valid call is executed with exactly the arguments the model wrote: no default filled, no unnamed property dropped', async () => {
    const h = advertisedHarness(ADVERTISED);
    const args = { memory_name: 'm', needle: 'n', extra: [1] };
    const r = await h.gate.dispatch(h.call('amend_note', args), new AbortController().signal);
    expect(r).toMatchObject({ status: 'ok', text: 'edited' });
    expect(h.sent).toEqual([args]);
  });

  it('`format` is an annotation, as JSON Schema 2020-12 has it: a value the format would reject is not refused for it', async () => {
    const h = advertisedHarness(ADVERTISED);
    const r = await h.gate.dispatch(h.call('amend_note', { memory_name: 'm', needle: 'n', site: 'not a uri' }), new AbortController().signal);
    expect(r.status).toBe('ok');
    expect(h.sent).toHaveLength(1);
    // A property NAMED format is a property, not the keyword: its schema still binds.
    const named = advertisedHarness({ type: 'object', required: ['format'], properties: { format: { type: 'string', enum: ['json', 'text'] } } });
    const refused = await named.gate.dispatch(named.call('amend_note', { format: 'xml' }), new AbortController().signal);
    expect(refused.status).toBe('failed');
    expect(named.sent).toEqual([]);
  });

  /*
   * `$async` is ajv's keyword, not JSON Schema's. Honoured, it compiled a validator returning a Promise, which the check
   * read as a pass, and whose rejection for an invalid call nothing handled (the fin18 verifier's probe;
   * docs/defects/fixed/an-advertised-schema-marked-async-compiles-a-check-that-never-refuses.md).
   */
  it('an `$async` schema is read as JSON Schema reads it: checked synchronously, an invalid call refused, no rejection left unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const h = advertisedHarness({ $async: true, type: 'object', required: ['needle'], properties: { needle: { type: 'string' }, at: { $async: true, type: 'object', required: ['line'] } } });
      expect(h.check.compiled).toBe(true);
      const refused = await h.gate.dispatch(h.call('amend_note', { memory_name: 'm' }), new AbortController().signal);
      expect(refused.status).toBe('failed');
      expect(refused.text).toMatch(/needle: required property is missing/);
      const nested = await h.gate.dispatch(h.call('amend_note', { needle: 'n', at: {} }), new AbortController().signal);
      expect(nested.text).toMatch(/at\.line: required property is missing/);
      expect((await h.gate.dispatch(h.call('amend_note', { needle: 'n' }), new AbortController().signal)).status).toBe('ok');
      expect(h.sent).toEqual([{ needle: 'n' }]);
      // The refinement itself never yields a Promise, whatever `validate` returns.
      expect(h.check.schema.safeParse({ other: 1 }).success).toBe(false);
      // A property NAMED `$async` is a property, not the keyword: its schema still binds.
      const named = advertisedSchemaCheck({ type: 'object', required: ['$async'], properties: { $async: { type: 'boolean' } } }).schema;
      expect(named.safeParse({}).success).toBe(false);
      expect(named.safeParse({ $async: true }).success).toBe(true);
      await new Promise((resolve) => { setImmediate(resolve); });
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('a schema the validator cannot compile keeps the object check alone, and says why', async () => {
    const h = advertisedHarness({ $schema: 'http://json-schema.org/draft-04/schema#', type: 'object', required: ['b'] });
    expect(h.check).toMatchObject({ compiled: false });
    expect(h.check.reason).toMatch(/dialect the validator does not read/);
    expect((await h.gate.dispatch(h.call('amend_note', { a: 1 }), new AbortController().signal)).status).toBe('ok');
    expect((await h.gate.dispatch(h.call('amend_note', '"just a string"'), new AbortController().signal)).status).toBe('failed');
    expect(h.sent).toEqual([{ a: 1 }]);
    expect(advertisedSchemaCheck({ type: 'object', properties: { a: { $ref: 'https://example.invalid/s.json' } } }).compiled).toBe(false);
  });

  it('if/then/else, dependentRequired and unevaluatedProperties compile and bind as JSON Schema 2020-12 reads them', () => {
    const { schema, compiled } = advertisedSchemaCheck({ type: 'object', properties: { a: {}, b: {}, c: {} }, if: { required: ['a'] }, then: { required: ['b'] }, dependentRequired: { c: ['a'] }, unevaluatedProperties: false });
    expect(compiled).toBe(true);
    expect(schema.safeParse({ a: 1, b: 2, c: 3 }).success).toBe(true);
    expect(schema.safeParse({ b: 2 }).success).toBe(true);
    expect(schema.safeParse({ a: 1 }).error!.issues).toContainEqual(expect.objectContaining({ path: ['b'], message: 'required property is missing' }));
    expect(schema.safeParse({ c: 3, b: 2 }).success).toBe(false);
    expect(schema.safeParse({ b: 2, d: 4 }).error!.issues).toEqual([expect.objectContaining({ path: ['d'], message: 'is not a property the schema allows' })]);
  });

  it('local references and the usual composition keywords compile and bind', async () => {
    const check = advertisedSchemaCheck({ type: 'object', properties: { a: { $ref: '#/$defs/Name' }, b: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, $defs: { Name: { type: 'string', minLength: 2 } }, additionalProperties: false });
    expect(check.compiled).toBe(true);
    expect(check.schema.safeParse({ a: 'ok', b: null }).success).toBe(true);
    expect(check.schema.safeParse({ a: 'x' }).success).toBe(false);
    expect(check.schema.safeParse({ a: 'ok', c: 1 }).success).toBe(false);
  });
});

/**
 * The fin18 verifier's three probes of the advertised-schema check, each a call the server's own schema accepts that the
 * first repair refused, and none of which a re-issue could recover from: a Unicode property escape read without the `u`
 * flag (`\p{L}` as the text "p{L}"), an integer past 2^53, and an object `items` rewritten to an array by the gate before
 * the check saw it (docs/defects/fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md,
 * docs/defects/fixed/the-gate-wraps-an-object-in-an-array-where-the-schema-does-not-expect-one.md).
 */
describe('REQ-TOOLS-032: a call the advertised JSON Schema accepts is never refused', () => {
  function advertisedHarness(inputSchema: Record<string, unknown>) {
    const sent: unknown[] = [];
    const check = advertisedSchemaCheck(inputSchema);
    const executor = simpleExecutor('amend_note', 'e', check.schema, async (a) => { sent.push(a); return { text: 'edited', isError: false, outcomeKind: 'mcp' }; });
    const h = harness({ preset: 'autonomous', extraExecutors: [['amend_note', executor]], publicTool: (n) => n !== 'amend_note' });
    return { ...h, sent, check };
  }
  const dispatch = (h: ReturnType<typeof advertisedHarness>, args: unknown) => h.gate.dispatch(h.call('amend_note', args), new AbortController().signal);

  it('a pattern is an ECMA-262 regular expression read with Unicode semantics: \\p{L} accepts a non-ASCII letter, and still binds', async () => {
    const h = advertisedHarness({ type: 'object', required: ['name'], properties: { name: { type: 'string', pattern: '^\\p{L}+$' } } });
    expect((await dispatch(h, { name: 'Zoë' })).status).toBe('ok');
    const refused = await dispatch(h, { name: 'Zoë 2' });
    expect(refused.status).toBe('failed');
    expect(refused.text).toContain('name: must match pattern "^\\p{L}+$"');
    expect(h.sent).toEqual([{ name: 'Zoë' }]);
  });

  it('a code point outside the BMP is one character to a pattern, as the u flag reads it', async () => {
    const h = advertisedHarness({ type: 'object', properties: { glyph: { type: 'string', pattern: '^.$' }, word: { type: 'string', pattern: '^[^ ]{1,2}$' } } });
    expect((await dispatch(h, { glyph: '😀', word: '😀😀' })).status).toBe('ok');
    expect((await dispatch(h, { glyph: '😀😀' })).status).toBe('failed');
    expect(h.sent).toEqual([{ glyph: '😀', word: '😀😀' }]);
  });

  it('a pattern read with Unicode semantics binds through items, additionalProperties, allOf and a local $ref', () => {
    const { schema } = advertisedSchemaCheck({
      type: 'object', $defs: { Word: { type: 'string', pattern: '^\\p{Lu}' } },
      properties: { list: { type: 'array', items: { $ref: '#/$defs/Word' } }, both: { allOf: [{ $ref: '#/$defs/Word' }] } },
      additionalProperties: { type: 'string', pattern: '^\\p{N}+$' },
    });
    expect(schema.safeParse({ list: ['Él', 'Ü'], both: 'Ä', extra: '٣' }).success).toBe(true);
    const bad = schema.safeParse({ list: ['Él', 'él'], both: 'ä', extra: 'x' });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path.join('.')).sort()).toEqual(['both', 'extra', 'list.1']);
  });

  it('a pattern that is not an ECMA-262 Unicode regular expression is not asserted; the rest of the schema still binds', async () => {
    // A Python named group, and an identity escape the u flag rejects: the server may read either; this product cannot.
    const h = advertisedHarness({ type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^(?P<x>a)$' }, tag: { type: 'string', pattern: '^a\\-b$' }, n: { type: 'integer' } } });
    expect(h.check.compiled).toBe(true);
    expect((await dispatch(h, { id: 'anything', tag: 'whatever' })).status).toBe('ok');
    expect((await dispatch(h, { tag: 'a-b' })).status).toBe('failed');
    expect((await dispatch(h, { id: 'a', n: 'one' })).status).toBe('failed');
    expect(advertisedSchemaCheck({ type: 'object', properties: { a: { type: 'string', pattern: '[unclosed' } } }).compiled).toBe(true);
  });

  it('a Unicode pattern inside anyOf decides its branch as the u flag reads it', async () => {
    const h = advertisedHarness({ type: 'object', properties: { v: { anyOf: [{ type: 'string', pattern: '^\\p{L}+$' }, { type: 'integer' }] } } });
    expect((await dispatch(h, { v: 'Zoë' })).status).toBe('ok');
    expect((await dispatch(h, { v: 3 })).status).toBe('ok');
    expect((await dispatch(h, { v: 'Zoë 2' })).status).toBe('failed');
    expect((await dispatch(h, { v: false })).status).toBe('failed');
  });

  it('a pattern no u-flag expression reads, under oneOf or not, leaves the schema uncompiled rather than refusing a valid call', async () => {
    // Removing the pattern would let both oneOf branches match 'xy', and make the `not` match every string.
    const oneOf = advertisedHarness({ type: 'object', properties: { v: { oneOf: [{ type: 'string', pattern: '^(?P<x>a)$' }, { type: 'string', maxLength: 2 }] } } });
    expect(oneOf.check).toMatchObject({ compiled: false });
    expect(oneOf.check.reason).toContain('"oneOf"');
    expect((await dispatch(oneOf, { v: 'xy' })).status).toBe('ok');
    const not = advertisedSchemaCheck({ type: 'object', properties: { v: { type: 'string', not: { pattern: '(?P<x>a)' } } } });
    expect(not.compiled).toBe(false);
    expect(not.schema.safeParse({ v: 'b' }).success).toBe(true);
    // A property NAMED oneOf is a property, not the keyword: the pattern is removed and the rest still binds.
    const named = advertisedSchemaCheck({ type: 'object', required: ['oneOf'], properties: { oneOf: { type: 'string', pattern: '(?P<x>a)' } } });
    expect(named.compiled).toBe(true);
    expect(named.schema.safeParse({ oneOf: 'anything' }).success).toBe(true);
    expect(named.schema.safeParse({}).success).toBe(false);
  });

  it('a oneOf whose branches differ by a pattern the u flag reads is decided exactly: only the branch that matches counts', async () => {
    // The fin18 verifier's round-2 probe: under JSON Schema only the second branch matches `file:/x`, so the call is valid.
    const h = advertisedHarness({ type: 'object', properties: { src: { oneOf: [
      { type: 'object', required: ['url'], properties: { url: { type: 'string', pattern: '^https://.+' } } },
      { type: 'object', required: ['url'], properties: { url: { type: 'string', pattern: '^file:' } } },
    ] } } });
    expect((await dispatch(h, { src: { url: 'file:/x' } })).status).toBe('ok');
    expect((await dispatch(h, { src: { url: 'https://a' } })).status).toBe('ok');
    expect((await dispatch(h, { src: { url: 'ftp://a' } })).status).toBe('failed');
    expect(h.sent).toEqual([{ src: { url: 'file:/x' } }, { src: { url: 'https://a' } }]);
    const { schema } = advertisedSchemaCheck({ type: 'object', properties: {
      word: { oneOf: [{ type: 'string', pattern: '^\\p{L}+$' }, { type: 'string', pattern: '^[0-9]+$' }] },
      short: { oneOf: [{ type: 'string', pattern: '^a.c$' }, { type: 'string', maxLength: 2 }] },
    } });
    expect(schema.safeParse({ word: '123', short: 'xy' }).success).toBe(true);
    expect(schema.safeParse({ word: 'Zoë' }).success).toBe(true);
    // 'abc' matches ^a.c$ and is longer than 2: exactly one branch. 'abcd' matches neither.
    expect(schema.safeParse({ short: 'abc' }).success).toBe(true);
    expect(schema.safeParse({ word: 'a1' }).success).toBe(false);
    expect(schema.safeParse({ short: 'abcd' }).success).toBe(false);
  });

  it('enum and const compare by deep equality, as JSON Schema has it: an object or array value the schema lists is accepted', async () => {
    const h = advertisedHarness({ type: 'object', properties: {
      e: { enum: [{ x: 1 }, 2] }, l: { enum: [[1, 2], 'x'] }, c: { const: ['x'] }, o: { const: { x: [1] } },
      m: { anyOf: [{ const: { mode: 'auto' } }, { type: 'string' }] },
    } });
    const valid = { e: { x: 1 }, l: [1, 2], c: ['x'], o: { x: [1] }, m: { mode: 'auto' } };
    expect((await dispatch(h, valid)).status).toBe('ok');
    expect(h.sent).toEqual([valid]);
    for (const bad of [{ e: { x: 2 } }, { l: [2, 1] }, { c: ['y'] }, { c: 'x' }, { o: { x: [1, 2] } }, { m: { mode: 'manual' } }]) {
      expect((await dispatch(h, bad)).status, JSON.stringify(bad)).toBe('failed');
    }
    expect(h.sent).toEqual([valid]);
  });

  it('an integer has no bound JSON Schema does not set: 2^60 is an integer, 1.5 is not, and a nullable integer takes null', async () => {
    const h = advertisedHarness({ type: 'object', properties: { big: { type: 'integer', minimum: 0 }, maybe: { type: ['integer', 'null'] }, step: { type: 'integer', multipleOf: 5 } } });
    expect((await dispatch(h, { big: 2 ** 60, maybe: null, step: 10 })).status).toBe('ok');
    expect((await dispatch(h, { maybe: 7 })).status).toBe('ok');
    expect((await dispatch(h, { big: 1.5 })).status).toBe('failed');
    expect((await dispatch(h, { big: -1 })).status).toBe('failed');
    expect((await dispatch(h, { maybe: 1.5 })).status).toBe('failed');
    expect((await dispatch(h, { step: 7 })).status).toBe('failed');
    expect(h.sent).toEqual([{ big: 2 ** 60, maybe: null, step: 10 }, { maybe: 7 }]);
  });

  it('a `format` inside the schema of a property named like a data keyword (enum, const, default, examples) is still an annotation', async () => {
    const h = advertisedHarness({ type: 'object', properties: { enum: { type: 'string', format: 'email' }, default: { type: 'object', properties: { site: { type: 'string', format: 'uri' } } } } });
    expect((await dispatch(h, { enum: 'not an email', default: { site: 'not a uri' } })).status).toBe('ok');
    expect((await dispatch(h, { enum: 5 })).status).toBe('failed');
  });

  it('REQ-TOOLS-032\'s array repair applies only where the schema expects an array: an object `items` is sent as the object it is', async () => {
    const h = advertisedHarness({ type: 'object', required: ['items'], properties: { items: { type: 'object' } } });
    const r = await dispatch(h, { items: { a: 1 } });
    expect(r.status).toBe('ok');
    expect(r.args).toEqual({ items: { a: 1 } });
    expect(h.sent).toEqual([{ items: { a: 1 } }]);
    // Where the advertised schema does expect an array, the single object is read as a one-element array.
    const arrays = advertisedHarness({ type: 'object', properties: { files: { type: 'array', items: { type: 'object', required: ['path'] } } } });
    const wrapped = await dispatch(arrays, '{"files": {"path": "a.txt"}}');
    expect(wrapped.status).toBe('ok');
    expect(arrays.sent).toEqual([{ files: [{ path: 'a.txt' }] }]);
  });

  it('repairArrayFields wraps a field only when the schema refuses the object there and accepts the array', () => {
    const schema = z.object({ tasks: z.array(z.object({ name: z.string() })), items: z.object({ a: z.number() }).optional(), phases: z.union([z.array(z.string()), z.string()]).optional() });
    expect(repairArrayFields({ tasks: { name: 'x' }, items: { a: 1 } }, schema)).toEqual({ tasks: [{ name: 'x' }], items: { a: 1 } });
    // An object inside the wrapped array that is itself invalid is still read as the array the schema expects, so the
    // refusal names the element's own violation rather than "expected array".
    expect(repairArrayFields({ tasks: { name: 5 } }, schema)).toEqual({ tasks: [{ name: 5 }] });
    expect(repairArrayFields({ tasks: [], items: { a: 'no' } }, schema)).toEqual({ tasks: [], items: { a: 'no' } });
    expect(repairArrayFields({ tasks: [], phases: { p: 1 } }, schema)).toEqual({ tasks: [], phases: { p: 1 } });
    // A field outside REQ-TOOLS-032's five is never wrapped.
    expect(repairArrayFields({ tasks: [], other: { a: 1 } }, z.object({ tasks: z.array(z.unknown()), other: z.array(z.unknown()).optional() }))).toEqual({ tasks: [], other: { a: 1 } });
  });
});
