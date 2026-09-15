import { CONTRACT_SCHEMA_VERSION, ProcessRequestEnvelopeSchema, RunHostRequestSchema, ServiceAnswerEnvelopeSchema, SKILLS_DISABLED_MESSAGE, type ImprovementArtifactRecord, type ProcessMessage, type ProcessReply, type RunHostRequest, type ServiceAsk, type ServiceAskEnvelope } from '@rotaris/contracts';
import { asSessionId, millis, ok, toIsoUtc, type Clocks, type Millis, type WorkspaceId } from '@rotaris/kernel';
import { dataLayout, environmentWithout, nodeClocks, probePid, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import { openStore, StoreDal, forgetSpelling, type PromptLists, type StoreHandle } from '@rotaris/store';
import { analyzeImprovement, captureImprovementJob, CATALOGUE, RefusalLease, relativeTime, RungMemory, Sessions, SUPERVISOR_DEFAULTS, timelineId } from '@rotaris/engine';
import { ConfinementService, PresenterRegistry, renderUnavailability, spawnTrial, type AvailabilityVerdict, STREAM_SETTINGS_DEFAULTS, withheldUnderPlanGate, type FileToolState, type TerminalManager } from '@rotaris/agent-tools';
import { createToolPort, fileAppender, RunHostPresenter, terminalManagerFromHost } from './tools.js';
import { createTerminalHost } from './terminal.js';
import { clearHooksDecision, createHookPort, decideHooks, hooksSummaryFor, setHookToggle } from './hooks.js';
import { runPreflight } from './intent.js';
import { createLoopClassifier } from './loop.js';
import { createCheckpointPort, REFS_ASK_BOUND } from './checkpoints.js';
import { McpHost } from './mcp.js';
import { deleteSession, exportRecords, exportTrajectories, repairSessions, sessionFiles } from './session-actions.js';
import { CHECKPOINTS_DEFAULTS, loadConfiguration, RUNTIME_DEFAULTS, SKILLS_DEFAULTS, type LiveState, CODE_INTELLIGENCE_TOKEN } from '@rotaris/config';
import { SkillHost } from './skills.js'; // ADR-0063
import { classifierSlotsOf, configureRun, egressReader, improvementCollectorOf, modelRefOf, type ConfiguredRun } from './configuration.js';
import { launchSession, leaseForContinuation } from './launch.js';
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
/** Part X: the DAL's readonly lists as the wire carries them (REQ-LIBRARY-138); the schema wants mutable arrays. */
function asState(lists: PromptLists): { history: string[]; stash: string[] } {
  return { history: [...lists.history], stash: [...lists.stash] };
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
  const calls: Record<string, number> = { orchestrator: 0, child: 0, summariser: 0, compressor: 0, 'loop-classifier': 0 };
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
      const who = /^You are the orchestrator/.test(system) ? 'orchestrator' : /summarise a finished agent transcript/i.test(system) ? 'summariser' : /^You condense an agent conversation/.test(system) ? 'compressor' : /^You classify a user request/.test(system) ? 'classifier' : /^You classify an agent conversation/.test(system) ? 'loop-classifier' : 'child';
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
      if (who === 'compressor') {
        // ROTARIS_COMPRESSOR_SCRIPT=fail — the compressing pass itself failing, so REQ-ORCH-093's "the original
        // rejection is surfaced unchanged" has a producer. Verification only.
        // Part AO: `fail-if:<text>` fails only the pass whose compressible slice mentions the text — one agent of a
        // concurrent manual pass, so REQ-MONITOR-094's per-agent listing has a producer while the others succeed.
        const compressorScript = (process.env['ROTARIS_COMPRESSOR_SCRIPT'] ?? '').trim();
        const failIf = /^fail-if:(.+)$/.exec(compressorScript);
        const slice = req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
        if (compressorScript === 'fail' || (failIf !== null && slice.includes(failIf[1]!))) {
          yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted compressor failure (HTTP 500)', status: 500, transient: false } };
          return;
        }
        // Part AH: the compressing pass's scripted answer. It states the three things REQ-MONITOR-082 asks for,
        // so the proof can assert the summary reached the rebuilt conversation rather than a placeholder.
        yield ok<StreamPart>({ kind: 'text', delta: ['Work performed: the scripted agent read the repository and wrote NOTES.md.', 'Findings reached: the transcript renderer draws one row per event.', 'Questions left open: none.'].join(String.fromCharCode(10)) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 40, output: 24 } });
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
      if (step === 'fail:context') {
        // Part AH (REQ-ORCH-093): the context-window rejection, in one of the eight phrasings `classifyFailure` knows.
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted rejection: prompt is too long', status: 400, providerMessage: 'The maximum context length of this model is 8192 tokens; reduce the length of the messages.', transient: false } };
        return;
      }
      // Part Q's fault steps (REQ-ORCH-088/090/091/092): `fail:429[:retry-after=<s>]`, `fail:quota`, `fail:503`, `fail:401`;
      // tokens:<n> — Part AH: a step that REPORTS n prompt tokens and then calls a tool so the turn goes round
      // again. REQ-MONITOR-081 prefers the provider's own figure, so this is how a scripted run crosses the
      // automatic threshold without composing a genuinely enormous conversation. Verification only.
      const tokenStep = /^tokens:(\d+)$/.exec(step);
      if (tokenStep) {
        yield ok<StreamPart>({ kind: 'text', delta: 'Working, with a large reported prompt. ' });
        if ((req.tools ?? []).some((t) => t.name === 'glob')) yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'glob', argsDelta: JSON.stringify({ pattern: '**/*.md' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: Number(tokenStep[1]), output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
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
      // Part Z (REQ-CHAT-163/062): `think` streams deliberation on the reasoning channel before the answer, so the
      // streamed-reasoning ROW has a producer in a scripted run. The three provider SHAPES that carry deliberation
      // are normalised inside the AI SDK client and are proven there; this proves what the engine does with one.
      if (step === 'think') {
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Weighing the request. ' });
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Two options remain, and the second is cheaper.' });
        yield ok<StreamPart>({ kind: 'text', delta: 'The scripted answer, after deliberating.' });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 18, output: 9 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
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
      // artifact:<tool>[:<key>] — Part Y's proof: one of the three artifact tools, with arguments taken from
      // ROTARIS_SCRIPT_ARTIFACT_ARGS by key (a JSON map) or the defaults below. Verification only.
      const artifactStep = /^artifact:(artifact_write|artifact_read|artifact_list)(?::([\w-]+))?$/.exec(step);
      if (artifactStep) {
        const toolName = artifactStep[1]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_ARTIFACT_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = artifactStep[2] ?? toolName;
          const fallback = toolName === 'artifact_write'
            ? { slug: 'scripted-plan', title: 'The scripted plan', body: 'The first line of the scripted body.\n\nA second paragraph with `code` and **bold**.', tags: ['research'] }
            : toolName === 'artifact_read' ? { id_or_slug: 'scripted-plan' } : {};
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // terminal:<key> — PD-LIBRARY-001's proof: one `terminal` call, with the arguments taken from
      // ROTARIS_SCRIPT_TERMINAL_ARGS by key (a JSON map) or the `git status` default below. Verification only,
      // in the shape of the artifact and MCP argument maps above: the proof needs a child that runs ordered
      // terminal commands whose exit statuses the command ledger can record, and the scripted dialect had no
      // deterministic terminal step.
      const terminalStep = /^terminal:([\w-]+)$/.exec(step);
      if (terminalStep) {
        if ((req.tools ?? []).some((t) => t.name === 'terminal')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_TERMINAL_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = terminalStep[1]!;
          const args = key in scripted ? scripted[key] : { command: 'git status' };
          yield ok<StreamPart>({ kind: 'text', delta: `Running the terminal command for ${key}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'terminal', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // ask[:<key>] — Part AC's step: one `ask_questions` call, with the steps taken from ROTARIS_SCRIPT_QUESTIONS by
      // key (a JSON map) or the two-step default below. Verification only.
      const askStep = /^ask(?::([\w-]+))?$/.exec(step);
      if (askStep) {
        if ((req.tools ?? []).some((t) => t.name === 'ask_questions')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_QUESTIONS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = askStep[1] ?? 'ask';
          const fallback = {
            steps: [
              { id: 'scope', title: 'Which scope should this change cover?', description: 'Pick the narrowest that still solves the problem.', options: [{ label: 'This file only' }, { label: 'The whole package', description: 'Slower, but consistent.' }] },
              { id: 'notes', title: 'Anything else the agent should know?', options: [], allow_freeform: true },
            ],
          };
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: 'Asking the user. ' });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'ask_questions', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // mcp:<server>.<tool> — the MCP proof's step: the callable name after `.` (a renamed tool by its replacement name); fixed arguments per tool.
      const mcpStep = /^mcp:([^.]+)\.(.+)$/.exec(step);
      if (mcpStep) {
        const toolName = mcpStep[2]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          // ROTARIS_SCRIPT_MCP_ARGS: a JSON map from callable name to the arguments the scripted agent sends (Part T's proof; verification only).
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_MCP_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const args = toolName in scripted ? scripted[toolName] : toolName === 'echo' ? { text: 'hello from the scripted agent' } : toolName === 'slow' ? { ms: 4_000 } : {};
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
// Latest workspace configuration for workspace-scoped controls and continuation loads.
const configured = new Map<string, ConfiguredRun>();
// ADR-0030: latest workspace lease for continuation loads. Active launches capture their own lease.
const leased = new Map<string, Readonly<Record<string, string>>>();
// The workspace root a session was started or resumed under — the key a continuation's lease refresh reads.
const sessionRoots = new Map<string, string>();
// Each active run retains its setup through deferred preflight and tool creation.
const configuredRuns = new Map<string, ConfiguredRun>();
const runBearers = new Map<string, Readonly<Record<string, string>>>();
const improvementContexts = new Map<string, { run: ConfiguredRun }>();
const missingCollectorNotified = new Set<string>();
const improvementControllers = new Map<string, AbortController>();
// ADR-0034 (Part S): the one MCP holder of the application — discovery memo, probes, session connections, the override, the sink.
const mcp = new McpHost({
  clocks, log: (m, level) => log(m, level ?? 'info'), parentEnv: hostEnv,
  // Part V: REQ-MCP-044's warning is a transient on the acknowledgement channel (REQ-NOTIFY-040 forbids the timed clear it had) — and the issue record it also writes.
  acknowledge: (a) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'acknowledgement.publish', kindOf: a.kind, title: a.title, ...(a.body === undefined ? {} : { body: a.body }) } }),
  // Part AS (ADR-0064): every step and the end, pushed — what ADR-0064's task runner follows instead of a cadence.
  publishSetup: (status) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'mcp.setupStatus', status } }),
});
// REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — THIS application's own executable (a utility process
// runs the same binary) with the token first and `--` second (the branch's separator, measured in
// spikes/code-intelligence-branch.md); in development Electron's binary with the main bundle before them, which is the
// interpreted installation's "own language runtime" of REQ-MCP-033. Packaged is read off this bundle's own location.
const packaged = import.meta.dirname.includes('app.asar');
const codeIntelligenceLaunch = { command: process.execPath, args: packaged ? [CODE_INTELLIGENCE_TOKEN, '--'] : [join(import.meta.dirname, 'index.js'), CODE_INTELLIGENCE_TOKEN, '--'] };
log(`mcp: the reserved token launches ${codeIntelligenceLaunch.command} ${codeIntelligenceLaunch.args.join(' ')} (${packaged ? 'packaged' : 'development'})`);
/**
 * ADR-0022's availability service, owned at application lifetime (REQ-SANDBOX-067): one probe per
 * process, cached, cleared only by REQ-SANDBOX-129's explicit re-check. It lives in the RUN HOST and
 * not in main because this is the process that executes commands — the verdict that gates a session
 * and the mechanism that would confine its commands are then one reading, and no message between
 * processes can land between them (REQ-SANDBOX-094).
 */
const confinement = new ConfinementService({
  platform: process.platform,
  env: process.env,
  clocks,
  runTrial: spawnTrial(clocks, environmentWithout([], process.env)),
});
/**
 * REQ-SANDBOX-071 names the application log as one of the surfaces that presents the verdict's own
 * text, on the same terms as the settings label, the launch dialog and the run-refusal record.
 *
 * ADR-0022's first execution found this logged from the LAUNCH path only, so on a machine where the
 * user opened Settings and never started a run — which on this platform is the machine of anyone who
 * read the disclosure and left confinement alone — the log recorded nothing about why confinement was
 * unavailable. The falsified reason, kept beside its replacement: "the launch is where the verdict
 * first matters". It is where it first *gates* something; it is not where it is first *taken*.
 * Every path that settles the verdict now comes through here, and the line is written once.
 */
const settleConfinement = async (): Promise<AvailabilityVerdict> => {
  const first = confinement.peek() === null;
  const verdict = await confinement.verdict();
  if (first) log(`confinement: ${verdict.available ? `available (${verdict.backend})` : `unavailable — ${renderUnavailability(verdict).replace(/\n/g, ' ')}`}`);
  return verdict;
};
const configurationDeps = {
  clocks, globalDir: configDir, env: process.env, scriptedClient: () => scriptedClient(clocks), codeIntelligenceLaunch,
  onRequest: (i: { method: string; url: string; headers: Record<string, string> }) => log(`model request ${i.method} ${i.url}${i.headers['authorization'] ? '' : ' (no authorization header)'}`),
  log: (m: string) => log(m), liveState: () => liveState, bearers: (root: string) => leased.get(root) ?? {},
  mcpEvidence: (cfg: ConfiguredRun['cfg'], root: string, role: string) => mcp.evidenceFor(cfg, root, role),
  confinement: () => confinement.peek(),
};
/**
 * ADR-0063 — the portable-skill catalog. The run host owns it because REQ-WORKSPACE-058 clears it at
 * SESSION creation, a lifetime only the process that creates sessions can honour, and because the units it
 * feeds are composed at agent construction, which is also here.
 *
 * The `skills:` section is read from the SAVED configuration at each ask rather than from a run's captured
 * Tier B snapshot: REQ-WORKSPACE-073 gates a user gesture happening now, not a run that started earlier, and
 * the `fetch` tool's per-call policy read (REQ-SANDBOX-038) is the existing precedent for that. A load that
 * fails leaves the shipped defaults standing — a broken configuration must not silently switch skills off.
 */
const skills = new SkillHost({
  log: (m, level) => log(m, level ?? 'info'),
  monotonic: clocks.monotonic,
  /*
   * Verification only — `ROTARIS_CAPTURE_SKILLS_HOME` points user-scope discovery at a scratch tree, so a proof
   * exercises `~/.agents/skills` and the OpenHands manifest without reading the operator's own skills.
   *
   * It is a seam rather than an override of `HOME`/`USERPROFILE` because overriding those **kills the Electron
   * process before it paints** on Windows (measured on this proof's first run, 2026-09-14). A user-driven launch
   * never sets it and takes `homedir()`.
   */
  ...(process.env['ROTARIS_CAPTURE_SKILLS_HOME'] ? { home: process.env['ROTARIS_CAPTURE_SKILLS_HOME'] } : {}),
  section: (workspaceRoot) => {
    const loaded = loadConfiguration({ globalDir: configDir, workspaceRoot });
    if (loaded.ok) return loaded.value.skills;
    log(`skills: the configuration could not be read for ${workspaceRoot}; the shipped defaults stand`, 'warn');
    return SKILLS_DEFAULTS;
  },
});

const configure = (workspaceRoot: string, attended: boolean) => {
  const r = configureRun(workspaceRoot, attended, configurationDeps);
  if (r.ok) { configured.set(workspaceRoot, r.value); mcp.newConfiguration(r.value.cfg); }
  return r;
};
/**
 * ADR-0030 / REQ-PROVIDER-066 for the continuation paths: a paused or resumed session's run reads
 * the bearers of the LAST launch's lease (`leased`), which an application restart empties — the
 * 401 recorded in `docs/defects/continue-run-sends-no-authorization-header.md`. Every continuation
 * launch therefore re-asks main first (`leaseForContinuation`), publishes the fresh map under the
 * workspace root, and only then lets the engine resolve the setup. The user notices nothing; the
 * one refusal is an entry provider main cannot resolve, the same sentence a launch gives. A
 * session this process never started or resumed has no root to lease under — nothing is known
 * about it here, and the engine's own refusals (`not-live`, `no-session`) answer it instead.
 */
const continuationLeaseForSession = async (sessionId: string): Promise<ProcessReply | null> => {
  const workspaceRoot = sessionRoots.get(sessionId);
  if (workspaceRoot === undefined) return null;
  const r = await leaseForContinuation(workspaceRoot, {
    workspaceRoot, attended: presenters.attended, configuration: configurationDeps,
    leaseCredentials: async (providers) => {
      const answer = await ask({ kind: 'credentials.lease', providerIds: [...providers] }, millis(5_000)).catch((e: Error) => { log(`credentials: main did not answer the lease (${e.message})`, 'warn'); return null; });
      const bearers = answer?.kind === 'credentials.leased' ? answer.bearers : {};
      log(`credentials: re-leased for ${Object.keys(bearers).join(', ') || 'no provider'} (continuation, workspace ${workspaceRoot})`);
      return bearers;
    },
  });
  if (r.kind === 'refused') return r.reply;
  leased.set(workspaceRoot, r.bearers);
  return null;
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
    if (r.ok) { configuredRuns.set(ctx.sessionId, r.value); runBearers.set(ctx.sessionId, leased.get(workspaceRoot) ?? {}); }
    // REQ-WORKSPACE-060: the units as a GETTER, read at every agent construction, so a skill invoked between
    // prompts reaches the next agent built and never retracts one already running (REQ-CONFIG-166).
    // REQ-WORKSPACE-050: from the base workspace, which is what `configure` is called with.
    return r.ok ? { ok: true as const, value: { ...r.value, contextUnits: () => skills.contextUnits(workspaceRoot, ctx.sessionId) } } : { ok: false as const, error: { reason: r.error.reason } };
  },
  /**
   * REQ-MONITOR-049 / REQ-CONFIG-085 (Part AH): a model's own maximum input tokens, from the configuration
   * the last run of any open workspace resolved. Part R declared this lookup and left it unfilled, so every
   * agent's meter read REQ-MONITOR-080's default whatever the model; REQ-MONITOR-078's capacity ladder needs
   * the same figure, so it is filled here rather than a second time inside the compressor.
   */
  contextLimitFor: (modelKey) => { for (const c of configured.values()) { const n = c.contextLimits?.[modelKey]; if (n !== undefined) return n; } return null; },
  isProcessAlive: (pid) => probePid(pid) === 'alive',
  sessionFilesDir: (dal, sid) => join(dirname(dal.db.name), 'sessions', sid),
  publisher: {
    increment: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.increment', payload } }),
    snapshot: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.snapshot', payload } }),
  },
  onRunResult: (sessionId, result) => {
    const run = configuredRuns.get(sessionId);
    configuredRuns.delete(sessionId);
    runBearers.delete(sessionId);
    send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.result', sessionId, result } });
    if (!run || !run.cfg.runtime.improvement_collector_enabled) return;
    const collector = improvementCollectorOf(run.cfg, run.scripted);
    if (collector === null) {
      if (!missingCollectorNotified.has(run.cfg.workspaceRoot)) {
        missingCollectorNotified.add(run.cfg.workspaceRoot);
        send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: 'info', title: 'Improvement analysis needs a model', message: 'Improvement analysis is switched on. Choose an improvement collector or medium model to produce proposals.', detail: '', action: 'config.models', key: `improvement-model:${run.cfg.workspaceRoot}`, sessionId, persistent: true } });
      }
      return;
    }
    const locatedStore = [...stores.entries()].find(([, candidate]) => candidate.root === run.cfg.workspaceRoot && candidate.dal !== null);
    if (!locatedStore?.[1].dal) return;
    const [workspaceId, store] = locatedStore;
    void (async () => {
      const historyReply = await ask({ kind: 'improvements.command', workspaceRoot: run.cfg.workspaceRoot, command: { action: 'list' } }, millis(10_000)).catch((cause: Error) => {
        log(`improvements: history capture failed for ${sessionId}: ${cause.message}`, 'warn');
        return null;
      });
      const prior = historyReply?.kind === 'improvements.result' ? (historyReply.value as ImprovementArtifactRecord[]).map((record) => record.artifact) : [];
      const job = captureImprovementJob(store.dal!, { workspaceId, workspaceRoot: run.cfg.workspaceRoot, sessionId, generatedAt: toIsoUtc(clocks.wall.instant()), timeoutSeconds: run.cfg.runtime.improvement_collector_timeout, collectorModel: collector.key, priorArtifactsAvailable: historyReply?.kind === 'improvements.result', priorArtifacts: prior });
      if (job === null) return;
      improvementContexts.set(job.artifact_id, { run });
      send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'improvement.job', job } });
    })();
  },
  // REQ-ORCH-085: the host told the run paused at the message limit.
  onRunPaused: (sessionId, info) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.paused', sessionId, count: info.count, limit: info.limit, tokens: info.tokens } }),
  // REQ-ORCH-153 (ADR-0062): the registry predicate the plan gate's child-admission check reads; the engine holds
  // no copy of the tool declarations (ADR-0002's boundaries).
  planWithholds: withheldUnderPlanGate,
  tools: (ctx) => createToolPort(ctx, {
    clocks, presenter, nextSequence: () => ++approvalSequence, fileStates, terminal, mcp, configured: () => configuredRuns.get(ctx.sessionId) ?? null,
    runtime: () => configuredRuns.get(ctx.sessionId)?.runtime ?? configureRunFallback(),
    personas: () => configuredRuns.get(ctx.sessionId)?.personas ?? null,
    // REQ-WORKSPACE-059 (ADR-0063): the cataloged skill directories as additional READ roots, so an agent can
    // read a SKILL.md and its siblings even outside the workspace; writes stay refused by the fence itself.
    // REQ-WORKSPACE-050: from the BASE workspace, never a worktree's effective root.
    skillReadRoots: () => skills.readRoots(ctx.workspaceRoot, ctx.sessionId),
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
  checkpoints: (ctx) => createCheckpointPort(ctx, { clocks, ask, section: configuredRuns.get(ctx.sessionId)?.cfg.checkpoints ?? CHECKPOINTS_DEFAULTS, log: (m) => log(m) }),
  // Part V: the engine's headline is the title and its prose the message body (REQ-NOTIFY-005: the detail block is for diagnostic output, which none of the three run notices carries); every run notice is dismissible.
  notice: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: n.severity, title: n.headline, message: n.detail, detail: '', ...(n.action === undefined ? {} : { action: n.action }), ...(n.key === undefined ? {} : { key: n.key }), sessionId: n.sessionId ?? '', persistent: true } }),
  // Part AO — the two control arms' channels: the completion toast (REQ-CHAT-080/084) on the window's stack, and the two
  // failure notices with a COPYABLE detail block (REQ-MONITOR-094, REQ-NOTIFY-037/038) through main's one persistent slot.
  acknowledge: (kind, title, body) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'acknowledgement.publish', kindOf: kind, title, ...(body === undefined ? {} : { body }) } }),
  report: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: n.severity, title: n.title, message: n.message, detail: n.detail, sessionId: n.sessionId, persistent: true } }),
  supervisor: (_workspaceRoot, sessionId) => {
    const run = configuredRuns.get(sessionId);
    if (!run) return null;
    const cb = run.cfg.circuitBreaker;
    if (!cb.enabled || process.env['ROTARIS_CIRCUIT_BREAKER'] === 'off') return null;
    const timeoutMs = Math.round(run.runtime.loopClassificationTimeoutS * 1_000);
    const classifier = createLoopClassifier({
      backend: run.model.backend, runModel: run.model.config.model, thinking: run.model.config.thinking, credentialFor: run.model.config.credentialFor,
      memory: rungMemory, configuredModel: modelRefOf(run.cfg, cb.model, run.scripted), slots: classifierSlotsOf(run.cfg, run.scripted, runBearers.get(sessionId), (m) => log(m, 'warn')), modelTimeoutMs: timeoutMs,
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
    const run = configuredRuns.get(ctx.sessionId);
    if (!run) throw new Error('the run has no configuration');
    return runPreflight(ctx, {
      clocks, backend: run.model.backend, runModel: run.model.config.model, credentialFor: run.model.config.credentialFor, modelTimeoutMs: run.model.config.modelTimeoutMs,
      globalDir: configDir, tier: run.tier, slots: classifierSlotsOf(run.cfg, run.scripted, runBearers.get(ctx.sessionId), (m) => ctx.warn(m)), runOverride: run.runtime.runOverride, memory: rungMemory, log: (m) => log(m),
    });
  },
});
presenters.start();
// Part U: the browser's actions over this registry, the clock ports and the ask channel.
const sessionActions = { sessions, clocks, ask, log: (m: string, level?: 'info' | 'warn') => log(m, level ?? 'info') };

// Part AL — the live terminal (ADR-0021 first executed): the stream publisher over the terminal manager, the run's
// `runtime.terminal_stream_*` settings (REQ-TOOLS-126), and the seven `terminal.*` requests (`run-host/terminal.ts`).
// The tool hands the registry its EFFECTIVE root, which an isolated run keys nowhere; the base workspace's run is the
// fallback, then the defaults.
const terminalHost = createTerminalHost({
  ready: terminalReady, send, sessions, clocks, log: (m, level) => log(m, level ?? 'info'),
  settings: (workspaceRoot) => {
    const run = configured.get(workspaceRoot) ?? [...configured.values()].at(-1) ?? null;
    const r = run?.cfg.runtime;
    return r ? { enabled: r.terminal_stream_enabled, intervalMs: r.terminal_stream_interval_ms, bufferKb: r.terminal_stream_buffer_kb } : STREAM_SETTINGS_DEFAULTS;
  },
});

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
      // REQ-WORKSPACE-058 (ADR-0063): "discovery runs automatically on workspace open with no user action".
      // Warmed off the reply so it cannot delay the open; a failure here is logged and costs nothing, because
      // the next ask discovers on a cold cache anyway.
      queueMicrotask(() => { try { skills.catalog(req.workspaceRoot); } catch (cause) { log(`skills: discovery on workspace open failed: ${String(cause)}`, 'warn'); } });
      return { kind: 'workspace.ack', workspaceId: req.workspaceId };
    }
    /*
     * ADR-0063 — portable skills. All four answer with the same `skills.state` shape, so no caller has to ask
     * again to redraw, and `loaded` names the skill for the toast. None persists anything: REQ-WORKSPACE-073
     * and REQ-WORKSPACE-151 both scope their effect to the session and leave `skills.overrides` exactly as it
     * was, which is why the row a surface draws keeps showing the PERSISTED policy.
     */
    case 'skills.read':
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId) };
    case 'skills.rescan': {
      // REQ-WORKSPACE-069: re-read from disk, re-project, change no policy, mark nothing dirty.
      const before = skills.state(req.workspaceRoot, req.sessionId).skills.length;
      skills.rescan(req.workspaceRoot);
      const state = skills.state(req.workspaceRoot, req.sessionId);
      log(`skills: rescanned ${req.workspaceRoot} — ${before} → ${state.skills.length}`);
      return { kind: 'skills.state', state };
    }
    case 'skills.forceLoad': {
      const r = skills.forceLoad(req.workspaceRoot, req.sessionId, req.name);
      if (!r.ok) return { kind: 'refused', code: r.reason === 'disabled' ? 'skills.disabled' : 'skills.unknown', headline: r.reason === 'disabled' ? SKILLS_DISABLED_MESSAGE : r.reason };
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId), loaded: r.name };
    }
    case 'skills.loadFile': {
      const r = skills.loadFile(req.workspaceRoot, req.sessionId, req.path);
      // REQ-WORKSPACE-151: a failure is reported with the reason REQ-WORKSPACE-057 gives and leaves the catalog unchanged.
      if (!r.ok) return { kind: 'refused', code: 'skills.load-failed', headline: r.reason };
      return { kind: 'skills.state', state: skills.state(req.workspaceRoot, req.sessionId), loaded: r.name };
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
      if (s) for (const [artifactId, context] of improvementContexts) {
        if (context.run.cfg.workspaceRoot !== s.root) continue;
        improvementControllers.get(artifactId)?.abort();
        improvementControllers.delete(artifactId);
        improvementContexts.delete(artifactId);
      }
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
      sessionRoots.set(req.sessionId, s.root);
      const resumed = sessions.resume(s.dal, s.root, asSessionId(req.sessionId));
      if (!resumed.ok) return { kind: 'refused', code: `session.${resumed.error.code}`, headline: 'The session could not be loaded', detail: resumed.error.reason };
      return { kind: 'session.resumed', sessionId: resumed.value.sessionId, settledChildren: resumed.value.settledChildren };
    }
    case 'session.start': {
      if (lease.isRefusing(req.workspaceId as WorkspaceId)) return { kind: 'refused', code: 'workspace.refusing', headline: 'New runs are refused for this workspace while a restore is under way' };
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return launchSession(req, {
        workspaceRoot: s.root, attended: presenters.attended, configuration: configurationDeps, settleConfinement,
        leaseCredentials: async (providers) => {
          const answer = await ask({ kind: 'credentials.lease', providerIds: [...providers] }, millis(5_000)).catch((e: Error) => { log(`credentials: main did not answer the lease (${e.message})`, 'warn'); return null; });
          const bearers = answer?.kind === 'credentials.leased' ? answer.bearers : {};
          log(`credentials: leased for ${Object.keys(bearers).join(', ') || 'no provider'} (workspace ${s.root})`);
          if (answer?.kind === 'credentials.leased') {
            const u = Object.entries(answer.report.unresolved);
            log(`credentials: ${answer.report.authenticated.length} provider(s) authenticated${u.length > 0 ? `; unresolved: ${u.map(([id, why]) => `${id} (${why})`).join(', ')}` : ''}`);
          }
          return bearers;
        },
        start: (setup, bearers) => {
          // Publish the setup only when its credential lease has settled. Deferred run ports use the session key.
          const sessionId = req.sessionId ?? randomUUID();
          sessionRoots.set(sessionId, s.root);
          const previousSetup = configuredRuns.get(sessionId);
          const previousBearers = runBearers.get(sessionId);
          const restore = () => {
            if (previousSetup) configuredRuns.set(sessionId, previousSetup); else configuredRuns.delete(sessionId);
            if (previousBearers) runBearers.set(sessionId, previousBearers); else runBearers.delete(sessionId);
          };
          configuredRuns.set(sessionId, setup);
          runBearers.set(sessionId, bearers);
          configured.set(s.root, setup);
          leased.set(s.root, bearers);
          /*
           * REQ-WORKSPACE-058 (ADR-0063): **session creation** clears the catalog cache, so skills are
           * re-discovered from disk at each new session, and adopts any gesture the user made before this
           * session existed (OQ-58's pending bucket). It sits HERE and not in `configure`, which also runs for
           * every continuation: a continuation is a further run of an existing session, not a new one, and
           * clearing the cache there would re-read the tree on every prompt for no rule that asks for it.
           */
          skills.onSessionCreated(s.root, sessionId);
          mcp.newConfiguration(setup.cfg);
          void mcp.prepare(setup.cfg, s.root).catch((e: unknown) => log(`mcp: discovery ahead of the run failed: ${String(e)}`, 'warn'));
          if (req.effectiveRoot !== undefined && req.effectiveRoot !== s.root) log(`session ${sessionId} is isolated: the run works in ${req.effectiveRoot}${req.worktree ? ` on branch ${req.worktree.branch}` : ''}; the record stays under ${s.root}`);
          try {
            // REQ-WORKSPACE-060 (ADR-0063): the session's context units reach the launch as a getter, read at every
            // agent construction. REQ-WORKSPACE-050: against the BASE workspace even when the run works in a worktree.
            const r = sessions.start(s.dal!, s.root, req.prompt, { setup: { ...setup, contextUnits: () => skills.contextUnits(s.root, sessionId) }, sessionId, runType: req.runType ?? 'task_run', ...(req.worktree === undefined ? {} : { worktree: req.worktree }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }), ...(req.attachments === undefined ? {} : { attachments: req.attachments }), ...(req.initialTodo === undefined ? {} : { initialTodo: req.initialTodo }) });
            if (r.ok) log(`session ${r.value} started; row 0 recorded; the run is executing`);
            else restore();
            return r;
          } catch (cause) {
            restore();
            throw cause;
          }
        },
      });
    }
  case 'improvement.analyze': {
      const context = improvementContexts.get(req.job.artifact_id);
      if (context === undefined) return { kind: 'refused', code: 'improvement.expired', headline: 'The captured improvement job is no longer available' };
      const collector = improvementCollectorOf(context.run.cfg, context.run.scripted);
      if (collector === null) return { kind: 'refused', code: 'improvement.no-model', headline: 'No improvement analyst is configured' };
      const controller = new AbortController();
      improvementControllers.set(req.job.artifact_id, controller);
      try {
        const artifact = await analyzeImprovement(req.job, { backend: context.run.model.backend, model: collector.model, thinking: collector.thinking, timers: clocks.timers, credentialFor: context.run.model.config.credentialFor, warn: (message) => log(message, 'warn') }, controller.signal);
        return { kind: 'improvement.analyzed', artifact };
      } finally {
        improvementControllers.delete(req.job.artifact_id);
      improvementContexts.delete(req.job.artifact_id);
    }
  }
  case 'improvement.cancel': {
    improvementControllers.get(req.artifactId)?.abort();
    improvementControllers.delete(req.artifactId);
    improvementContexts.delete(req.artifactId);
    return { kind: 'ack' };
  }
    case 'session.continue': {
      // REQ-SESSION-110 / REQ-MONITOR-125: resolve a pause or continue a paused session; nothing is appended.
      // REQ-PROVIDER-066 (the continuation lease): refresh the bearers before the run resolves its setup.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.continueSession(asSessionId(req.sessionId), req.action);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The session could not be continued', detail: r.error.reason };
      log(`session ${req.sessionId} ${req.action}: ${r.value.resumed ? 'a continuation run is executing' : 'left paused'}${r.value.messageLimit === null ? '' : ` (message limit ${r.value.messageLimit})`}`);
      return { kind: 'session.continued', sessionId: req.sessionId, resumed: r.value.resumed, messageLimit: r.value.messageLimit };
    }
    case 'session.planEdit': {
      // REQ-ORCH-154: the edit is recorded and nothing else moves — the gate stays held on the same cycle.
      const r = sessions.planEdit(asSessionId(req.sessionId), req.text);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The plan could not be edited', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.planDecision': {
      // REQ-ORCH-153: the three answers, exactly; approve and revise launch the next segment, cancel launches nothing.
      // REQ-PROVIDER-066 (the continuation lease): an approve or revise launches a segment — refresh first.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.planDecision(asSessionId(req.sessionId), req.decision, req.changes ?? '');
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: 'The plan decision could not be applied', detail: r.error.reason };
      log(`session ${req.sessionId} plan cycle ${r.value.cycle}: ${req.decision}${r.value.relaunched ? ' — a further segment is executing' : ' — the run came to rest'}`);
      return { kind: 'session.planResolved', sessionId: req.sessionId, cycle: r.value.cycle, relaunched: r.value.relaunched };
    }
    case 'session.prompt': {
      // REQ-PROVIDER-066 (the continuation lease): a prompt on a resumed session launches a run — refresh first.
      const leaseRefusal = await continuationLeaseForSession(req.sessionId);
      if (leaseRefusal) return leaseRefusal;
      const r = sessions.prompt(asSessionId(req.sessionId), req.prompt, req.attachments ?? []);
      if (!r.ok) return { kind: 'refused', code: `session.${r.error.code}`, headline: r.error.code === 'run-active' ? r.error.reason : 'The prompt could not be recorded', detail: r.error.reason };
      return { kind: 'ack' };
    }
    case 'session.readAttachment': {
      const r = sessions.readAttachment(asSessionId(req.sessionId), req.path, req.digest);
      return r.ok ? { kind: 'session.attachment', base64: r.base64 } : { kind: 'refused', code: 'session.attachment-unavailable', headline: r.reason };
    }
    case 'session.control':
      // Part AO: `forceCompression` settles once every live conversation has (REQ-MONITOR-092), so the control is awaited.
      return { kind: 'control.result', result: await sessions.controlAsync(req.request) };
    // Part U — the session browser's actions (REQ-SESSION-182); `session-actions.ts` holds the mechanism.
    case 'session.repair': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return repairSessions(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'session.delete': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return deleteSession(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'session.export': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return exportRecords(sessionActions, s.dal, s.root, req.sessionId, req.destination);
    }
    case 'session.exportTrajectory': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return exportTrajectories(sessionActions, s.dal, s.root, req.sessionIds, req.destination);
    }
    case 'session.files': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      return sessionFiles(sessionActions, s.dal, s.root, req.sessionId);
    }
    case 'timeline.append': {
      // Part V / REQ-NOTIFY-268: through the live writer where the session is live (its ordinal counter), else one transaction under the store.
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const sid = asSessionId(req.sessionId);
      const live = sessions.writer(sid);
      if (live) {
        const r = live.appendTimeline(req.name, req.actor, req.message, req.metadata, req.severity ?? 'info');
        return r.ok ? { kind: 'timeline.appended', sessionId: req.sessionId, ordinal: r.value } : { kind: 'refused', code: `timeline.${r.error.code}`, headline: 'The timeline entry could not be written', detail: 'reason' in r.error ? r.error.reason : r.error.code };
      }
      const dal = s.dal;
      if (!dal.getSession(sid)) return { kind: 'refused', code: 'session.unknown', headline: 'No session with that id exists in this workspace' };
      try {
        const at = toIsoUtc(clocks.wall.instant());
        const ordinal = dal.transaction(() => { const o = dal.nextTimelineOrdinal(sid); dal.insertTimeline(sid, o, at, req.name, req.actor, req.message, JSON.stringify(req.metadata), timelineId(), req.severity ?? 'info'); return o; });
        return { kind: 'timeline.appended', sessionId: req.sessionId, ordinal };
      } catch (cause) {
        return { kind: 'refused', code: 'timeline.write', headline: 'The timeline entry could not be written', detail: String(cause) };
      }
    }
    // Part X — the saved prompts (REQ-LIBRARY-137/138/139). Session-less, like `session.list`: the run host owns the
    // workspace's store, and the two lists belong to the workspace rather than to any session. Every rule about an
    // entry is the DAL's; this case is the boundary and nothing else. A store failure comes back as a refusal, which
    // main turns into REQ-LIBRARY-138's persistent notice while the window keeps its lists in memory.
    case 'prompts.read':
    case 'prompts.push':
    case 'prompts.take': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const dal = s.dal;
      try {
        if (req.kind === 'prompts.read') return { kind: 'prompts.state', state: asState(dal.readPrompts()) };
        if (req.kind === 'prompts.push') return { kind: 'prompts.state', state: asState(dal.pushPrompt(req.list, req.text, toIsoUtc(clocks.wall.instant())).lists) };
        // REQ-LIBRARY-107: `remove` decides, and it is the caller's explicit choice — "Use" keeps, "Use and remove" pops.
        const text = req.remove ? dal.popPrompt(req.list, req.index) : dal.promptAt(req.list, req.index);
        return { kind: 'prompts.taken', text, state: asState(dal.readPrompts()) };
      } catch (cause) {
        return { kind: 'refused', code: 'prompts.write', headline: 'Could not save prompt history', detail: String(cause) };
      }
    }
    // Part Y — the Library's Artifacts tab (REQ-LIBRARY-108/131..136). The store and the session's files are this
    // process's (ADR-0002, ADR-0058); the tab reads the LOADED session and nothing else (REQ-LIBRARY-136).
    case 'artifacts.list': {
      const s = stores.get(req.workspaceId);
      if (!s?.dal) return { kind: 'refused', code: 'workspace.not-open', headline: 'No store is open for this workspace' };
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      if (!loaded || !store) return { kind: 'artifacts.state', state: { sessionId: null, artifacts: [], warnings: [] } };
      const hydrated = store.hydrate();
      const now = clocks.wall.instant();
      return {
        kind: 'artifacts.state',
        state: {
          sessionId: loaded,
          // REQ-LIBRARY-136: superseded artifacts are hidden from the Library table.
          artifacts: hydrated.records.filter((r) => r.supersededBy === null).map((r) => ({
            id: r.id, slug: r.slug, title: r.title, kind: r.kind, status: r.status,
            persona: r.sourcePersona ?? '', producer: r.createdBy || r.canonicalName || '', summary: r.summary,
            createdAt: r.createdAt, createdLabel: relativeTime(r.createdAt, now), edited: r.editedAt !== null,
            tags: [...r.tags], importance: r.importance, supersededBy: r.supersededBy,
          })),
          warnings: [...hydrated.warnings],
        },
      };
    }
    case 'artifacts.body': {
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      // REQ-LIBRARY-136: opening an artifact from the Library requires it to belong to the loaded session.
      if (!store) return { kind: 'refused', code: 'artifacts.no-session', headline: 'Artifact not found in the loaded session.' };
      const record = store.lookup(req.ref);
      if (!record) return { kind: 'refused', code: 'artifacts.unknown', headline: `Unknown artifact: '${req.ref}'` };
      const body = store.body(record.id);
      // REQ-LIBRARY-134: a load failure leaves the editor read-only with the stated message; the record stays listed.
      if (!body.ok) return { kind: 'refused', code: 'artifacts.body', headline: body.error.reason };
      return {
        kind: 'artifacts.body', id: record.id, slug: record.slug, title: record.title, kind_: record.kind, status: record.status,
        producer: record.createdBy || record.canonicalName || '', persona: record.sourcePersona ?? '', edited: record.editedAt !== null,
        body: body.value.text, fallback: body.value.fallback,
      };
    }
    case 'artifacts.save': {
      const loaded = sessions.loadedSessionId();
      const store = loaded ? sessions.artifactsOf(loaded) : null;
      if (!store) return { kind: 'refused', code: 'artifacts.no-session', headline: 'Artifact not found in the loaded session.' };
      const r = store.editBody(req.ref, req.body);
      // REQ-LIBRARY-133: the footer shows `Save failed: <err>` on failure; the reason travels as the refusal's headline.
      if (!r.ok) return { kind: 'refused', code: `artifacts.${r.error.code}`, headline: r.error.reason };
      log(`artifact ${r.value.id} edited by hand at ${r.value.editedAt} (REQ-LIBRARY-094)`);
      return { kind: 'artifacts.saved', id: r.value.id, editedAt: r.value.editedAt };
    }
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
    /**
     * ADR-0022 / REQ-SANDBOX-129: the settings label's read, and its re-check. The probe runs here,
     * in the run host, off every interface thread; the label enters its checking state the moment
     * the request is sent and shows the new verdict when this reply arrives, so neither the settings
     * surface nor any other view blocks for the up-to-5.0-second trial. A fresh verdict governs
     * sessions started AFTERWARDS and never changes the confinement fact recorded for a session
     * already running (REQ-SANDBOX-094, REQ-SANDBOX-096).
     */
    case 'confinement.status': {
      if (req.recheck !== true) return { kind: 'confinement.status', verdict: await settleConfinement() };
      const verdict = await confinement.recheck();
      log(`confinement: re-checked — ${verdict.available ? `available (${verdict.backend})` : `unavailable — ${renderUnavailability(verdict).replace(/\n/g, ' ')}`}`);
      return { kind: 'confinement.status', verdict };
    }
    // ADR-0035 (Part T) / REQ-MCP-099/112: the project setup — the steps run here; the reply is the status as it stands.
    case 'mcp.setup': {
      const s = stores.get(req.workspaceId);
      if (!s) return { kind: 'refused', code: 'workspace.unknown', headline: 'That workspace is not open in the run host' };
      const run = configuredFor(s.root) ?? (configure(s.root, true).ok ? configuredFor(s.root) : null);
      // Part AS: `applicable` (REQ-WORKSPACE-090) is read off the same resolution every other answer is.
      if (req.action === 'status') return { kind: 'mcp.setup', status: mcp.setupStatus(run?.cfg ?? null) };
      if (req.action === 'cancel') return { kind: 'mcp.setup', status: mcp.cancelSetup() };
      if (!run) return { kind: 'refused', code: 'mcp.configuration', headline: 'The configuration could not be loaded' };
      const started = mcp.startSetup(run.cfg, s.root);
      if (!started.ok) return { kind: 'refused', code: 'mcp.setup.running', headline: started.reason };
      return { kind: 'mcp.setup', status: started.status };
    }
    // Part AL — the live terminal's requests (ADR-0021, REQ-TOOLS-128, REQ-SHELL-106/107); the mechanism is `run-host/terminal.ts`.
    case 'terminal.streams':
    case 'terminal.sendKeys':
    case 'terminal.resize':
    case 'terminal.interrupt':
    case 'terminal.endInput':
    case 'terminal.kill':
    case 'terminal.audit':
      return terminalHost.handle(req);
    case 'shutdown': {
      // ADR-0014 / REQ-MONITOR-255: every run asked to stop before any is waited on; the reply follows their terminal results.
      for (const controller of improvementControllers.values()) controller.abort();
      improvementControllers.clear();
      improvementContexts.clear();
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
