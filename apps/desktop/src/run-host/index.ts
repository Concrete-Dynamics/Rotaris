import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, RunHostRequestSchema, ServiceAnswerEnvelopeSchema, type ProcessMessage, type ProcessReply, type RunHostRequest, type ServiceAsk, type ServiceAskEnvelope } from '@rotaris/contracts';
import { asSessionId, millis, ok, toIsoUtc, type Clocks, type Millis, type WorkspaceId } from '@rotaris/kernel';
import { dataLayout, nodeClocks, probePid, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import { openStore, StoreDal, forgetSpelling, type StoreHandle } from '@rotaris/store';
import { CATALOGUE, RefusalLease, RungMemory, Sessions, SUPERVISOR_DEFAULTS } from '@rotaris/engine';
import { PresenterRegistry, type FileToolState, type TerminalManager } from '@rotaris/agent-tools';
import { createToolPort, fileAppender, RunHostPresenter, terminalManagerFromHost } from './tools.js';
import { clearHooksDecision, createHookPort, decideHooks, hooksSummaryFor, setHookToggle } from './hooks.js';
import { runPreflight } from './intent.js';
import { createLoopClassifier } from './loop.js';
import { createCheckpointPort, REFS_ASK_BOUND } from './checkpoints.js';
import { McpHost } from './mcp.js';
import { CHECKPOINTS_DEFAULTS, RUNTIME_DEFAULTS, type LiveState } from '@rotaris/config';
import { classifierSlotsOf, configureRun, egressReader, modelRefOf, type ConfiguredRun } from './configuration.js';
import { type ModelClient, type ModelRequest, type StreamPart } from '@rotaris/model';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session: the
 * session writers, the projection owners they feed, and the runs
 * (ADR-0008, ADR-0013, ADR-0043).
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). A publication leaves here already stamped; main relays it.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 *
 * WHERE THE MODEL AND THE RUNTIME COME FROM — the configuration files, loaded
 * per run start with the live state on top (ADR-0036/0037, `configuration.ts`).
 * `ROTARIS_MODEL_DIALECT=scripted` selects a built-in scripted client for every
 * model (verification only). A fatal file or an unreachable entry model refuses
 * the run before it starts (REQ-EVENTS-021, REQ-CONFIG-478).
 */
const port = process.parentPort;
const clocks = nodeClocks();
const lease = new RefusalLease(clocks.monotonic);
const stores = new Map<string, { file: string; root: string; db: StoreHandle | null; dal: StoreDal | null }>();
const host = readOrMintMachineId(dataLayout(resolveUserDirs()).machineId);

function send(m: ProcessMessage | ServiceAskEnvelope): void {
  port.postMessage(m);
}

/** The child's side of ADR-0002 c.7: a bounded request back to main, correlated by `ask` (the credential lease, ADR-0030). */
let nextAsk = 1;
const pendingAsks = new Map<number, { resolve: (r: ProcessReply) => void; reject: (e: Error) => void; cancel: () => void }>();
function ask(request: ServiceAsk, boundMs: Millis): Promise<ProcessReply> {
  const n = nextAsk++;
  return new Promise<ProcessReply>((resolve, reject) => {
    const h = clocks.timers.after(boundMs, () => { pendingAsks.delete(n); reject(new Error(`main did not answer ${request.kind} within ${boundMs} ms`)); });
    pendingAsks.set(n, { resolve, reject, cancel: () => h.cancel() });
    send({ v: CONTRACT_SCHEMA_VERSION, ask: n, request });
  });
}
function reply(id: number, r: ProcessReply): void {
  send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
}
function log(message: string, level: 'info' | 'warn' = 'info'): void {
  send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
}

/**
 * Verification only: a scripted client. `ROTARIS_SCRIPT` names the steps, comma-separated, one per model
 * call — `glob`, `read`, `write`, `rm`, `git`, `push`, `edit` request a tool call, `fetch:<url>` a fetch of that URL; `wait:<ms>` holds the call that
 * long on the clock port and then answers (the Overview proof needs a run longer than one token-sample period);
 * anything else, or the end of the list, answers with a short streamed reply, one delta per 120 ms so the growth
 * tick is visible.
 */
function scriptedClient(c: Clocks): ModelClient {
  const parse = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  // ROTARIS_SCRIPT drives the orchestrator; ROTARIS_CHILD_SCRIPT every child (a `delegate:<persona>:<name>` step delegates).
  const loopScript = /^loop:([^:]+):(\d+)$/.exec(process.env['ROTARIS_SCRIPT'] ?? '');
  const scripts: Record<string, string[]> = { orchestrator: loopScript ? Array.from({ length: Number(loopScript[2]) }, () => loopScript[1]!) : parse(process.env['ROTARIS_SCRIPT']), child: parse(process.env['ROTARIS_CHILD_SCRIPT']) };
  const calls: Record<string, number> = { orchestrator: 0, child: 0, summariser: 0, 'loop-classifier': 0 };
  let call = 0;
  const TOOL_STEPS: Record<string, { name: string; args: Record<string, unknown> }> = {
    glob: { name: 'glob', args: { pattern: '**/*.md' } },
    read: { name: 'read_file', args: { path: 'README.md' } },
    // Part P: the checkpoint proof edits NOTES.md in a later launch, and the edit tool wants the file read in this process first.
    readnotes: { name: 'read_file', args: { path: 'NOTES.md' } },
    write: { name: 'write_file', args: { operation: 'create', path: 'NOTES.md', content: '# Notes\n\nWritten by the scripted agent through the gate.\n' } },
    edit: { name: 'write_file', args: { operation: 'edit', path: 'NOTES.md', old_string: 'scripted agent', new_string: 'scripted agent (edited)' } },
    rm: { name: 'terminal', args: { command: 'rm -rf build' } },
    git: { name: 'terminal', args: { command: 'git status' } },
    push: { name: 'terminal', args: { command: 'git push origin main' } },
    todo: { name: 'todo', args: { operation: 'add_phase', name: 'main' } },
  };
  return {
    async *stream(req: ModelRequest) {
      await req.resolveCredential();
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const who = /^You are the orchestrator/.test(system) ? 'orchestrator' : /summarise a finished agent transcript/i.test(system) ? 'summariser' : /^You classify a user request/.test(system) ? 'classifier' : /^You classify an agent conversation/.test(system) ? 'loop-classifier' : 'child';
      call += 1;
      // Part S: every child instance follows the child script from its own first call (keyed by its TASK line), so a fan-out of
      // three children each takes the same steps; a single child reads exactly as before.
      const firstUser = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const taskName = who === 'child' && firstUser && firstUser.kind === 'text' ? /TASK: ([^\n]+)/.exec(firstUser.text)?.[1] ?? '' : '';
      const counterKey = who === 'child' ? `child:${taskName}` : who;
      calls[counterKey] = (calls[counterKey] ?? 0) + 1;
      calls[who] = calls[counterKey]!;
      // Verification only: the model each call went to, so a proof can read a fallback or an override from the log (Part Q).
      log(`scripted model call: ${req.model.providerId}/${req.model.modelId} (${who})`);
      if (who === 'classifier') {
        // ROTARIS_INTENT_SCRIPT: <category> | garbage | timeout | reject (the two JSON rungs refused, then text) — verification only.
        const want = (process.env['ROTARIS_INTENT_SCRIPT'] ?? 'moderate_feature').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        if (want === 'reject' && req.output !== undefined) { yield { ok: false as const, error: { code: 'http' as const, headline: 'response_format is not supported by this model', status: 400, transient: false } }; return; }
        const text = want === 'garbage' ? 'lol no' : want === 'reject' ? 'small_feature\nfrom the text rung' : req.output === undefined ? `${want}\nscripted` : JSON.stringify({ intent: want, confidence: 0.75, reason: 'scripted classification' });
        yield ok<StreamPart>({ kind: 'text', delta: text });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 8 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'loop-classifier') {
        const want = (process.env['ROTARIS_LOOP_SCRIPT'] ?? 'detected').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        const loop_detected = want !== 'clear';
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ loop_detected, reason: loop_detected ? 'scripted repeated work' : 'scripted progress', corrective_message: 'Pause and reassess the current path. Choose a different concrete approach and verify its viability first.' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'summariser') {
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ summary: 'The child carried out its task (scripted summary).', key_findings: ['scripted'], tags: ['implementation'] }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 20, output: 10 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      let step = scripts[who]?.[(calls[who] ?? 1) - 1] ?? 'answer';
      const wait = /^wait:(\d+)$/.exec(step);
      if (wait) {
        // The wait is a prefix on this call, not a call of its own: the step after it answers in the same call.
        await new Promise<void>((resolve) => { const t = c.timers.after(millis(Number(wait[1])), resolve); req.signal.addEventListener('abort', () => { t.cancel(); resolve(); }, { once: true }); });
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        scripts[who]?.splice((calls[who] ?? 1) - 1, 1);
        step = scripts[who]?.[(calls[who] ?? 1) - 1] ?? 'answer';
      }
      if (step === 'fail') {
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted failure (HTTP 400)', status: 400, transient: false } };
        return;
      }
      // Part Q's fault steps (REQ-ORCH-088/090/091/092): `fail:429[:retry-after=<s>]`, `fail:quota`, `fail:503`, `fail:401`;
      // `hang` streams nothing until the caller aborts (the unresponsive-model timer or the child timeout).
      const fault = /^fail:(429|quota|503|401)(?::retry-after=(\d+))?$/.exec(step);
      if (fault) {
        const retry = fault[2] === undefined ? {} : { retryAfterMs: Number(fault[2]) * 1000, retryAfter: fault[2] };
        const error = fault[1] === '429' ? { code: 'http' as const, status: 429, headline: 'scripted rate limit (HTTP 429)', providerMessage: 'Too Many Requests', transient: false, ...retry }
          : fault[1] === 'quota' ? { code: 'http' as const, status: 429, headline: 'scripted quota exhaustion (HTTP 429)', providerMessage: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota, please check your plan and billing details."}}', transient: false }
            : fault[1] === '503' ? { code: 'http' as const, status: 503, headline: 'scripted service unavailable (HTTP 503)', providerMessage: 'Service Unavailable', transient: true }
              : { code: 'http' as const, status: 401, headline: 'scripted authentication failure (HTTP 401)', providerMessage: 'Incorrect API key provided', transient: false };
        yield { ok: false as const, error };
        return;
      }
      if (step === 'hang') {
        await new Promise<void>((resolve) => { if (req.signal.aborted) resolve(); else req.signal.addEventListener('abort', () => resolve(), { once: true }); });
        yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } };
        return;
      }
      // delegate:<persona>:<name>[:after] — `after` depends on the last task id a tool result reported.
      const delegate = /^delegate:([a-z-]+):([^:]+)(:after)?$/.exec(step);
      if (delegate && (req.tools ?? []).some((t) => t.name === 'delegate')) {
        const lastId = delegate[3] ? [...req.messages].reverse().flatMap((m) => [...m.content] as { kind: string; result?: string }[]).map((p) => (p.kind === 'tool-result' && p.result ? /task_id: (bg_[0-9a-f]{8})/.exec(p.result)?.[1] : undefined)).find((x) => x !== undefined) : undefined;
        yield ok<StreamPart>({ kind: 'text', delta: `Delegating to ${delegate[1]}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'delegate', argsDelta: JSON.stringify({ persona: delegate[1], task_name: delegate[2], task: `TASK: ${delegate[2]}\nEXPECTED OUTCOME: done\nMUST DO: use your tools\nMUST NOT DO: nothing else\nCONTEXT: scripted`, ...(lastId ? { depends_on: [lastId] } : {}) }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
      // mcp:<server>.<tool> — the MCP proof's step: the callable name after `.` (a renamed tool by its replacement name); fixed arguments per tool.
      const mcpStep = /^mcp:([^.]+)\.(.+)$/.exec(step);
      if (mcpStep) {
        const toolName = mcpStep[2]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          const args = toolName === 'echo' ? { text: 'hello from the scripted agent' } : toolName === 'slow' ? { ms: 4_000 } : {};
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName} on ${mcpStep[1]}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // fetch:<url> — everything after the first `fetch:` is the URL (the fetch proof's step).
      const tool = step.startsWith('fetch:') ? { name: 'fetch', args: { url: step.slice('fetch:'.length) } } : TOOL_STEPS[step];
      if (tool && (req.tools ?? []).some((t) => t.name === tool.name)) {
        yield ok<StreamPart>({ kind: 'text', delta: `Calling ${tool.name}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: tool.name, argsDelta: JSON.stringify(tool.args) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
      const last = req.messages.filter((m) => m.role === 'tool').at(-1)?.content[0];
      const seen = last && last.kind === 'tool-result' ? ` The last tool said: "${last.result.slice(0, 60).replace(/\s+/g, ' ')}".` : '';
      const first = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const task = first && first.kind === 'text' ? first.text : '';
      const words = `I read your request — "${task.slice(0, 60)}" — and this is the scripted reply from the run loop.${seen}`.split(' ');
      for (const w of words) {
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        await new Promise<void>((resolve) => c.timers.after(millis(120), resolve));
        yield ok<StreamPart>({ kind: 'text', delta: `${w} ` });
      }
      yield ok<StreamPart>({ kind: 'usage', usage: { input: 24, output: words.length } });
      yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
    },
  };
}

/**
 * ADR-0019: attendedness is a boolean THIS process maintains — true while main holds a live presenter
 * registration and the liveness poll has not lapsed. A lapse cancels every waiting approval (they
 * resolve `cancelled`); the next reply clears it. Decision 5 of the plan: 250 ms poll, 3,000 ms lapse.
 */
const presenters = new PresenterRegistry({
  monotonic: clocks.monotonic, timers: clocks.timers,
  poll: (seq) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'presenter.poll', seq } }),
  onLapse: () => {
    const n = sessions.cancelAllPending();
    log(`presenter liveness lapsed (> ${presenters.lapseMs} ms without a reply): ${n} waiting approval(s) cancelled; the application is unattended until main answers (ADR-0019)`, 'warn');
  },
});
const presenter = new RunHostPresenter({
  post: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'approval.present', payload } }),
  close: (requestId) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'approval.close', requestId } }),
  clocks, shownBoundMs: 10_000,
});
const fileStates = new Map<string, FileToolState>();
let approvalSequence = 0;
// ADR-0020 / REQ-TOOLS-104: the terminal backend is decided once, by presence; the sessions live for the application.
const terminalReady: Promise<TerminalManager | null> = terminalManagerFromHost(clocks, (m) => log(m, 'warn'), RUNTIME_DEFAULTS.shell_command_timeout)
  .then((t) => { log(t ? `terminal: PowerShell backend present (single-session)` : 'terminal: no shell found on PATH; the tool is removed from every persona (REQ-TOOLS-104)', t ? 'info' : 'warn'); return t; })
  .catch((e) => { log(`terminal: the PTY could not be loaded: ${String(e)}; the tool is removed`, 'warn'); return null; });
let terminal: TerminalManager | null = null;
void terminalReady.then((t) => { terminal = t; });

// REQ-HOOKS-032: a hook inherits exactly the environment this process was started with; the desktop supplies no override.
const hostEnv: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
const configDir = resolveUserDirs().config;
// REQ-ORCH-010: a rung a model rejected is remembered for the session — this process's lifetime.
const rungMemory = new RungMemory();
// ADR-0037 Tier B: the settings store's current values, as main last told this process; empty until it does.
let liveState: LiveState = {};
// The configuration resolved for each workspace's latest run start; every port of that run reads it.
const configured = new Map<string, ConfiguredRun>();
// ADR-0030: the bearers main leased for each workspace's current run; a resolver reads this map per request.
const leased = new Map<string, Record<string, string>>();
// ADR-0034 (Part S): the one MCP holder of the application — discovery memo, probes, session connections, the override, the sink.
const mcp = new McpHost({
  clocks, log: (m, level) => log(m, level ?? 'info'), parentEnv: hostEnv,
  notice: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: n.severity, headline: n.headline, detail: n.detail, ...(n.key === undefined ? {} : { key: n.key }), ttlMs: n.ttlMs } }),
});
const configure = (workspaceRoot: string, attended: boolean) => {
  const r = configureRun(workspaceRoot, attended, {
    clocks, globalDir: configDir, env: process.env, scriptedClient: () => scriptedClient(clocks),
    onRequest: (i) => log(`model request ${i.method} ${i.url}${i.headers['authorization'] ? '' : ' (no authorization header)'}`), log: (m) => log(m), liveState: () => liveState, bearers: (root) => leased.get(root) ?? {},
    mcpEvidence: (cfg, root, role) => mcp.evidenceFor(cfg, root, role),
  });
  if (r.ok) { configured.set(workspaceRoot, r.value); mcp.newConfiguration(r.value.cfg); }
  return r;
};
/** Only a tool port built outside a run start reaches this; the run path always configures first. */
const configureRunFallback = () => {
  throw new Error('a tool port was requested for a workspace no run has configured');
};
const configuredFor = (workspaceRoot: string): ConfiguredRun | null => {
  const known = configured.get(workspaceRoot);
  if (known) return known;
  const r = configure(workspaceRoot, presenters.attended);
  if (!r.ok) log(r.error.reason, 'warn');
  return r.ok ? r.value : null;
};
const sessions = new Sessions({
  clocks,
  pid: process.pid,
  host,
  // REQ-CONFIG-473: the loaded `event_retention_per_session` per run; this is the shipped default behind it.
  retentionCap: RUNTIME_DEFAULTS.event_retention_per_session,
  warn: (m) => log(m, 'warn'),
  mintSessionId: () => randomUUID(),
  model: null,
  // ADR-0036/0037: the files, the live state, the loader's passes — once per run start.
  configure: (workspaceRoot, ctx) => {
    const r = configure(workspaceRoot, ctx.attended);
    return r.ok ? r : { ok: false as const, error: { reason: r.error.reason } };
  },
  isProcessAlive: (pid) => probePid(pid) === 'alive',
  sessionFilesDir: (dal, sid) => join(dirname(dal.db.name), 'sessions', sid),
  publisher: {
    increment: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.increment', payload } }),
    snapshot: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.snapshot', payload } }),
  },
  onRunResult: (sessionId, result) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.result', sessionId, result } }),
  // REQ-ORCH-085: the host told the run paused at the message limit.
  onRunPaused: (sessionId, info) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.paused', sessionId, count: info.count, limit: info.limit, tokens: info.tokens } }),
  tools: (ctx) => createToolPort(ctx, {
    clocks, presenter, nextSequence: () => ++approvalSequence, fileStates, terminal, mcp, configured: (root) => configuredFor(root),
    runtime: (workspaceRoot) => configuredFor(workspaceRoot)?.runtime ?? configureRunFallback(),
    personas: (workspaceRoot) => configuredFor(workspaceRoot)?.personas ?? null,
    // ADR-0023 / REQ-SANDBOX-038: the saved files at each fetch call, never the live state; the read's cost logged.
    egress: (workspaceRoot) => {
      const read = egressReader(configDir, workspaceRoot, clocks);
      return async () => {
        const r = await read();
        log(`fetch: egress policy read from the saved configuration in ${r.loadMs.toFixed(1)} ms${r.ok ? ` (default ${r.policy.defaultDisposition}, ${r.policy.allowed.length} allowed, ${r.policy.denied.length} denied, tool_call_timeout ${r.toolCallTimeoutS} s)` : ` — the load failed: ${r.reason}`}`, r.ok ? 'info' : 'warn');
        return r;
      };
    },
  }),
  backgroundSessions: () => terminal?.runningBackground ?? 0,
  attended: () => presenters.attended,
  sessionLogAppender: (dal, sid) => fileAppender(join(dirname(dal.db.name), 'sessions', sid, 'session.log')),
  // ADR-0015: the hook set per run from the two file scopes; the hook process inherits this process's environment (REQ-HOOKS-032).
  hooks: (ctx) => createHookPort(ctx, { clocks, globalDir: configDir, env: hostEnv }),
  // ADR-0039: the capture at iteration close — Git through main to the workspace service, the row through the writer.
  checkpoints: (ctx) => createCheckpointPort(ctx, { clocks, ask, section: configuredFor(ctx.workspaceRoot)?.cfg.checkpoints ?? CHECKPOINTS_DEFAULTS, log: (m) => log(m) }),
  notice: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', ...n } }),
  supervisor: (workspaceRoot) => {
    const run = configuredFor(workspaceRoot);
    if (!run) return null;
    const cb = run.cfg.circuitBreaker;
    if (!cb.enabled || process.env['ROTARIS_CIRCUIT_BREAKER'] === 'off') return null;
    const timeoutMs = Math.round(run.runtime.loopClassificationTimeoutS * 1_000);
    const classifier = createLoopClassifier({
      backend: run.model.backend, runModel: run.model.config.model, thinking: run.model.config.thinking, credentialFor: run.model.config.credentialFor,
      memory: rungMemory, configuredModel: modelRefOf(run.cfg, cb.model, run.scripted), slots: classifierSlotsOf(run.cfg, run.scripted, leased.get(workspaceRoot), (m) => log(m, 'warn')), modelTimeoutMs: timeoutMs,
    });
    return classifier ? {
      config: {
        ...SUPERVISOR_DEFAULTS, activationMode: cb.activation_mode, classificationTimeoutMs: timeoutMs,
        toolThreshold: cb.tool_call_threshold, messageThreshold: cb.message_count_threshold, toolWeight: cb.tool_weight, messageWeight: cb.message_weight, targetScore: cb.target_score,
        eventWindow: cb.max_recent_events, excerptCap: cb.max_transcript_chars, repetitionThreshold: cb.repetition_threshold, cycleThreshold: cb.cycle_threshold,
      },
      classifier,
    } : null;
  },
  // REQ-ORCH-005: the pre-flight before the coordinator exists; the slots, the strategy and the tier from the run's configuration.
  preflight: (ctx) => {
    const run = configuredFor(ctx.workspaceRoot);
    if (!run) throw new Error('the run has no configuration');
    return runPreflight(ctx, {
      clocks, backend: run.model.backend, runModel: run.model.config.model, credentialFor: run.model.config.credentialFor, modelTimeoutMs: run.model.config.modelTimeoutMs,
      globalDir: configDir, tier: run.tier, slots: classifierSlotsOf(run.cfg, run.scripted, leased.get(ctx.workspaceRoot), (m) => ctx.warn(m)), runOverride: run.runtime.runOverride, memory: rungMemory, log: (m) => log(m),
    });
  },
});
presenters.start();

async function handle(req: RunHostRequest): Promise<ProcessReply> {
  switch (req.kind) {
    case 'hello':
      return { kind: 'hello', process: 'run-host', pid: process.pid };
    case 'ping':
      return { kind: 'pong' };
    case 'workspace.opened': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const db = openStore(req.storeFile);
      const dal = new StoreDal(db);
      stores.set(req.workspaceId, { file: req.storeFile, root: req.workspaceRoot, db, dal });
      const t = dal.totals();
      log(`opened ${req.storeFile} (${t.sessions} sessions, ${t.rows} rows)`);
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.refuseRuns':
      lease.refuse(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.renewLease':
      lease.renew(req.workspaceId as WorkspaceId, millis(req.leaseMs));
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    case 'workspace.closeStore': {
      const s = stores.get(req.workspaceId);
      if (s?.db) { s.db.close(); forgetSpelling(s.file); s.db = null; s.dal = null; }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.release': {
      lease.release(req.workspaceId as WorkspaceId);
      const s = stores.get(req.workspaceId);
      if (s && !s.db) { s.db = openStore(s.file); s.dal = new StoreDal(s.db); }
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'workspace.closing': {
      const s = stores.get(req.workspaceId);
      if (s?.db) { s.db.close(); forgetSpelling(s.file); }
      stores.delete(req.workspaceId);
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    case 'circuit_breaker.status': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      return { kind: 'circuit_breaker.status', enabled: (run?.cfg.circuitBreaker.enabled ?? false) && process.env['ROTARIS_CIRCUIT_BREAKER'] !== 'off' };
    }
    case 'config.liveState': {
      // ADR-0037 Tier B: main hands over the settings store's current values; the next run start reads them.
      liveState = req.state as LiveState;
      return { kind: 'ack' };
    }
    case 'session.list': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return { kind: 'session.list', sessions: sessions.list(s.dal, s.root) };
    }
    case 'session.resume': {
      if (sessions.activeRunCount() > 0) return { kind: 'refused', code: 'session.run-active', headline: 'Finish or cancel the active run before switching sessions.' };
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const resumed = sessions.resume(s.dal, s.root, asSessionId(req.sessionId));
      if (!resumed.ok) return { kind: 'refused', code: `session.${resumed.error.code}`, headline: 'The session could not be loaded', detail: resumed.error.reason };
      return { kind: 'session.resumed', sessionId: resumed.value.sessionId, settledChildren: resumed.value.settledChildren };
    }
    case 'session.start': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      // ADR-0030 / REQ-PROVIDER-066/067: resolve the configuration once to learn the providers it names, lease their
      // bearers from main, and refuse before any session exists when the entry model's provider is not authenticated
      // (REQ-WORKSPACE-137). `sessions.start` configures again; its resolvers read the leased map per request.
      const pre = configure(s.root, presenters.attended);
      if (!pre.ok) {
        if (pre.error.code === 'no-model') return { kind: 'refused', code: 'session.no-model', headline: 'No model configured', detail: 'Choose a model in Settings before starting a run.' };
        return { kind: 'refused', code: 'session.configuration', headline: 'The run was refused before it started', detail: pre.error.reason };
      }
      if (pre.value.authProviders.length > 0) {
        const answer = await ask({ kind: 'credentials.lease', providerIds: [...pre.value.authProviders] }, millis(5_000)).catch((e: Error) => { log(`credentials: main did not answer the lease (${e.message})`, 'warn'); return null; });
        const bearers = answer?.kind === 'credentials.leased' ? answer.bearers : {};
        leased.set(s.root, bearers);
        log(`credentials: leased for ${Object.keys(bearers).join(', ') || 'no provider'} (workspace ${s.root})`);
        if (answer?.kind === 'credentials.leased') {
          const u = Object.entries(answer.report.unresolved);
          log(`credentials: ${answer.report.authenticated.length} provider(s) authenticated${u.length > 0 ? `; unresolved: ${u.map(([id, why]) => `${id} (${why})`).join(', ')}` : ''}`);
        }
        if (pre.value.entryAuthProvider !== null && !bearers[pre.value.entryAuthProvider]) {
          return { kind: 'refused', code: 'session.provider-auth', headline: 'Provider authentication required', detail: 'Authenticate at least one configured provider before starting a run.' };
        }
      } else {
        leased.set(s.root, {});
      }
      // ADR-0034 (Part S): discovery for every carried server starts now, bounded (REQ-MCP-053); the first tool port awaits it.
      void mcp.prepare(pre.value.cfg, s.root).catch((e: unknown) => log(`mcp: discovery ahead of the run failed: ${String(e)}`, 'warn'));
      // REQ-GIT-022 (Part O): the binding was made by the workspace service and the id minted in main before this
      // request; the session row records the binding and the run works in the effective root (REQ-GIT-019).
      if (req.effectiveRoot !== undefined && req.effectiveRoot !== s.root) log(`session ${req.sessionId ?? '(host-minted)'} is isolated: the run works in ${req.effectiveRoot}${req.worktree ? ` on branch ${req.worktree.branch}` : ''}; the record stays under ${s.root}`);
      const r = sessions.start(s.dal, s.root, req.prompt, { ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }), ...(req.worktree === undefined ? {} : { worktree: req.worktree }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }) });
      if (!r.ok) {
        // REQ-SESSION-082: a refusal before the run starts is reported at once, marked as such, with no session behind it.
        if ('failedBeforeStart' in r.error) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The run was refused before it started', detail: r.error.reason };
        return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The session could not be started', detail: r.error.reason };
      }
      log(`session ${r.value} started; row 0 recorded; the run is executing`);
      return { kind: 'session.started', sessionId: r.value };
    }
    case 'session.continue': {
      // REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause or continue a paused session; nothing is appended.
      const r = sessions.continueSession(asSessionId(req.sessionId), req.action);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The session could not be continued', detail: r.error.reason };
      log(`session ${req.sessionId} ${req.action}: ${r.value.resumed ? 'a continuation run is executing' : 'left paused'}${r.value.messageLimit === null ? '' : ` (message limit ${r.value.messageLimit})`}`);
      return { kind: 'session.continued', sessionId: req.sessionId, resumed: r.value.resumed, messageLimit: r.value.messageLimit };
    }
    case 'session.prompt': {
      const r = sessions.prompt(asSessionId(req.sessionId), req.prompt);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: r.error.code === 'run-active' ? r.error.reason : 'The prompt could not be recorded', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.control':
      return { kind: 'control.result', result: sessions.control(req.request) };
    case 'hooks.summary': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      return { kind: 'hooks.summary', summary: hooksSummaryFor({ workspaceRoot: s.root, globalDir: configDir, env: hostEnv, dal: s.dal, sessionId: req.sessionId }) };
    }
    case 'hooks.decide': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const r = await decideHooks(s.root, configDir, req.trusted, toIsoUtc(clocks.wall.instant()));
      if (!r.ok) return { kind: 'refused', code: 'hooks.decision', headline: 'The decision could not be recorded', detail: r.error.reason };
      log(`hooks: workspace ${s.root} ${req.trusted ? 'allowed' : 'refused'} (${r.value.fingerprint.slice(0, 12)}…)`);
      return { kind: 'ack' };
    }
    case 'hooks.clearDecision': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const r = clearHooksDecision(s.root);
      return r.ok ? { kind: 'ack' } : { kind: 'refused', code: 'hooks.clear', headline: 'The stored decision could not be removed', detail: r.error.reason };
    }
    case 'playbooks.catalogue':
      // REQ-ORCH-026: the built-in catalogue, user-inspectable — every slot, every variant, the built-in text.
      return { kind: 'playbooks.catalogue', catalogue: CATALOGUE };
    case 'hooks.setToggle': {
      const r = await setHookToggle(hostEnv, configDir, req.agent, req.hookId, req.on);
      return r.ok ? { kind: 'ack' } : { kind: 'refused', code: 'hooks.policy', headline: 'The hook policy could not be saved', detail: r.error.reason };
    }
    case 'runs.active':
      // ADR-0013: the registry's predicate. Sessions are not keyed by workspace yet; the count is instance-wide.
      return { kind: 'runs.count', workspaceId: req.workspaceId, count: sessions.activeRunCount() };
    case 'checkpoint.list': {
      // REQ-GIT-050: rows only, no Git; REQ-GIT-092/093's verdict stamped on; REQ-GIT-094's repair on this open.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const r = sessions.checkpointListing(s.dal, s.root, asSessionId(req.sessionId));
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      if (r.value.repaired) log(`session ${req.sessionId} was still marked '${r.value.repaired.previous}', but ${r.value.repaired.reason}; marked interrupted (REQ-GIT-094)`, 'warn');
      return { kind: 'checkpoint.list', listing: { ...r.value, includeUntracked: configuredFor(s.root)?.cfg.checkpoints.include_untracked ?? CHECKPOINTS_DEFAULTS.include_untracked } };
    }
    case 'checkpoint.recordSafety': {
      // REQ-GIT-058 gate 5: the pre-restore row through the one transaction; rows first, then the trimmed refs, then the event.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const keep = Math.max(1, configuredFor(s.root)?.cfg.checkpoints.max_per_session ?? CHECKPOINTS_DEFAULTS.max_per_session);
      const listing = sessions.checkpointListing(s.dal, s.root, asSessionId(req.sessionId));
      if (!listing.ok) return { kind: 'refused', code: `checkpoint.${listing.error.code}`, headline: listing.error.reason };
      const r = sessions.recordSafetyCheckpoint(s.dal, asSessionId(req.sessionId), { sequence: req.sequence, ref: req.ref, commit: req.commit, iteration: 0, childName: '', files: req.files, kind: 'pre_restore' }, keep);
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      if (r.value.trimmed.length > 0) {
        const pruned = await ask({ kind: 'checkpoint.prune', workspaceRoot: s.root, treeRoot: listing.value.treeRoot, sessionId: req.sessionId, refs: [...r.value.trimmed] }, REFS_ASK_BOUND).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
        log(`checkpoints: the safety checkpoint trimmed ${r.value.trimmed.length} row(s) to ${keep}; ${pruned.kind === 'checkpoint.pruned' ? `${pruned.deleted} ref(s) deleted` : `their refs could not be deleted (${pruned.kind === 'refused' ? pruned.headline : pruned.kind})`}`);
      }
      r.value.publish();
      log(`checkpoints: safety checkpoint ${req.sequence} recorded for session ${req.sessionId} (${req.files.length} file(s))`);
      return { kind: 'checkpoint.recorded', sequence: req.sequence, trimmed: [...r.value.trimmed] };
    }
    case 'checkpoint.recordRestore': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const r = sessions.recordRestore(s.dal, asSessionId(req.sessionId), { sequence: req.sequence, restored: req.restored, safetySequence: req.safetySequence, changedPaths: req.changedPaths, blockedReason: req.blockedReason, forced: req.forced, treeRoot: req.treeRoot, dirtyPaths: req.dirtyPaths, ref: req.ref, commit: req.commit });
      if (!r.ok) return { kind: 'refused', code: `checkpoint.${r.error.code}`, headline: r.error.reason };
      log(`checkpoints: restore of checkpoint ${req.sequence} on session ${req.sessionId} recorded as ${req.restored ? `restored (${req.changedPaths} file(s), safety ${req.safetySequence ?? 'none'})` : `refused: ${req.blockedReason}`}`);
      return { kind: 'ack' };
    }
    case 'presenter.register':
      presenters.register(req.windowId);
      return { kind: 'ack' };
    case 'presenter.revoke':
      presenters.revoke(req.windowId);
      return { kind: 'ack' };
    case 'presenter.pollReply':
      presenters.pollReplied(req.windows);
      return { kind: 'ack' };
    case 'approval.shown':
      return presenter.shown(req.requestId, req.ok, req.error) ? { kind: 'ack' } : { kind: 'refused', code: 'approval.unknown', headline: 'No present-request waits for that id' };
    case 'session.attach':
      return sessions.attach(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.detach':
      return { kind: 'ack' };
    case 'session.reconcile':
      return sessions.reconcile(asSessionId(req.sessionId)) ? { kind: 'ack' } : { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
    case 'session.pageOlder': {
      const page = sessions.pageOlder(asSessionId(req.sessionId), req.beforeIndex);
      if (!page) return { kind: 'refused', code: 'session.not-live', headline: 'That session is not live' };
      return { kind: 'session.page', sessionId: req.sessionId, rows: page.rows, oldest: page.oldest };
    }
    case 'mcp.list': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      return { kind: 'mcp.list', listing: mcp.list(run.cfg) };
    }
    case 'mcp.probe': {
      // REQ-MCP-092: one server per request, so the category probes sequentially and every request stays under main's bound.
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      const names = req.name === undefined ? Object.keys(run.cfg.mcp.servers) : [req.name];
      const results: { name: string; health: Awaited<ReturnType<McpHost['probeOne']>> }[] = [];
      for (const name of names) { const health = await mcp.probeOne(run.cfg, name); log(`mcp: probe of '${name}' → ${health.state}${health.state === 'healthy' ? ` (${health.toolCount} tools)` : health.detail ? ` (${health.detail})` : ''} in ${(health.elapsedMs ?? 0).toFixed(0)} ms`); results.push({ name, health }); }
      return { kind: 'mcp.probe', results };
    }
    case 'mcp.setEnabled':
      mcp.setEnabled(req.name, req.enabled);
      return { kind: 'ack' };
    case 'mcp.secrets': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root);
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      return { kind: 'mcp.secrets', view: mcp.secrets(run.cfg, req.server ?? null) };
    }
    case 'shutdown': {
      // ADR-0014 / REQ-MONITOR-255: every run asked to stop before any is waited on; the reply follows their terminal results.
      presenters.stop();
      // REQ-MCP-053: an outstanding discovery never delays exit — its children are killed first, so a port waiting on it proceeds at once.
      void mcp.discovery.closeAll();
      await sessions.closeAll();
      // REQ-MCP-066: the session connections closed at exit, within the budget.
      await mcp.closeAll();
      // REQ-TOOLS-111: every background session ended and every terminal resource closed before the host goes.
      await terminal?.dispose();
      for (const s of stores.values()) { try { s.db?.close(); } catch { /* */ } }
      stores.clear();
      clocks.timers.after(millis(0), () => process.exit(0));
      return { kind: 'ack' };
    }
  }
}

port.on('message', (e: { data: unknown }) => {
  const answer = ServiceAnswerEnvelopeSchema.safeParse(e.data);
  if (answer.success) {
    const p = pendingAsks.get(answer.data.ask);
    if (p) { pendingAsks.delete(answer.data.ask); p.cancel(); p.resolve(answer.data.reply); }
    return;
  }
  const env = ProcessRequestEnvelopeSchema.safeParse(e.data);
  if (!env.success) return;
  const req = RunHostRequestSchema.safeParse(env.data.request);
  if (!req.success) { reply(env.data.id, { kind: 'refused', code: 'request.malformed', headline: 'not a run-host request' }); return; }
  handle(req.data).then(
    (r) => reply(env.data.id, r),
    (err) => reply(env.data.id, { kind: 'refused', code: 'request.failed', headline: String(err) }),
  );
});

send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'ready', process: 'run-host', pid: process.pid } });
