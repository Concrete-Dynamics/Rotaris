import { err, millis, ok, type Result, type TimerHandle, type Timers } from '@rotaris/kernel';
import { modelError, type ChatMessage, type ContentPart, type ModelClient, type ModelError, type ModelRequest, type StreamPart, type ToolSpec, type Usage } from '@rotaris/model';
import { BRIDGE_SERVER_NAME, BRIDGE_TOOL_PREFIX, type BridgeRegistration, type BridgeToolCall, type BridgeToolResult, type ToolBridge } from './tool-bridge.js';

/**
 * PD-PROVIDER-002 — a `claude-code` model is answered by the Claude Code tool the user installed and signed in to,
 * started by this product as a subprocess in its documented non-interactive mode. The product never reads, holds or
 * passes on that tool's credential: the subprocess authenticates itself, as it does when the user runs it.
 *
 * The external tool runs as a MODEL and nothing more (the owner's ruling on OQ-17, kept by the directive): its built-in
 * tools are switched off, it loads none of the user's or the project's settings, and the one tool server it is given
 * is the product's own bridge. It keeps its own conversation while a turn lasts, so one process serves one turn:
 *
 * - a step that ends in tool calls leaves the process alive with those calls unanswered; the run loop dispatches them
 *   as it dispatches any model's — approvals, tool events, transcript rows — and the next step, which carries their
 *   results, answers them and reads on;
 * - a step that ends the turn ends the process;
 * - a step that finds no process waiting for its results (the application restarted, the wait outlived the idle
 *   bound, the history was compressed) starts a new one and hands it the conversation so far as text.
 *
 * So the engine drives the loop exactly as it does for an HTTP provider, and this file is a `ModelClient`.
 */
export const CLAUDE_CLI_PROVIDER = 'claude-code';
export const CLAUDE_CLI_EXECUTABLE = 'claude';
/** How long a process may wait for the results of the calls it asked for before it is given up (the next step starts anew). */
export const WAITING_SESSION_IDLE_MS = 15 * 60_000;
/** The external tool's own bound on one tool call, set past any approval wait this product allows. */
const TOOL_CALL_BOUND_MS = 24 * 60 * 60_000;

/** REQ-PROVIDER-048: the sources that outrank the subscription in the external tool's own credential chain. */
export const CONFLICTING_VARIABLES = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'] as const;

/** REQ-PROVIDER-048: null when nothing conflicts, else the sentence naming every conflicting source and its remedy. */
export function credentialConflict(env: Readonly<Record<string, string | undefined>>, userSettings: string | null): string | null {
  const sources: string[] = CONFLICTING_VARIABLES.filter((name) => (env[name] ?? '') !== '').map((name) => `the environment variable ${name}`);
  if (userSettings !== null) {
    try {
      const parsed: unknown = JSON.parse(userSettings);
      if (parsed !== null && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>)['apiKeyHelper'] === 'string') sources.push('the apiKeyHelper entry in ~/.claude/settings.json');
    } catch { /* an unreadable settings file names no helper */ }
  }
  if (sources.length === 0) return null;
  return `Claude Code would not use the subscription: ${sources.join(', ')} outrank${sources.length === 1 ? 's' : ''} it in Claude Code's own credential chain. Remove ${sources.length === 1 ? 'it' : 'them'} (for a variable, start Rotaris from an environment without it; for apiKeyHelper, delete the entry), then run again.`;
}

/** One running external process, as this client needs it: lines in, lines out, an end. */
export interface CliProcess {
  write(line: string): void;
  endInput(): void;
  kill(): void;
  onLine(fn: (line: string) => void): void;
  /** Called once, with the exit code (null for a signal or a launch failure) and what the process wrote to stderr last. */
  onExit(fn: (code: number | null, stderrTail: string) => void): void;
}

export interface CliLaunch {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
}

export interface ClaudeCliOptions {
  readonly timers: Timers;
  readonly bridge: ToolBridge;
  readonly launch: (l: CliLaunch) => CliProcess;
  /** The environment the application was started with. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** A directory that is no workspace: the process is given no project to read. */
  readonly cwd: string;
  /** `~/.claude/settings.json` as text, or null when it is absent (REQ-PROVIDER-048). */
  readonly readUserSettings: () => string | null;
  /**
   * Writes one of a session's two files — its system text, its tool-server description — and answers the path. Both go
   * by file because neither survives every platform's command line: the text can be longer than one allows, and the
   * description is JSON.
   */
  readonly writeSessionFile: (kind: 'instructions' | 'tools', text: string) => string;
  readonly removeFile: (path: string) => void;
  readonly log: (m: string) => void;
  readonly warn: (m: string) => void;
  readonly executable?: string;
  readonly idleMs?: number;
}

type Event =
  | { readonly kind: 'line'; readonly value: Record<string, unknown> }
  | { readonly kind: 'tool-arrived'; readonly callId: string }
  | { readonly kind: 'exit'; readonly code: number | null; readonly stderr: string }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'idle' };

interface PendingCall { readonly call: BridgeToolCall; readonly answer: (r: BridgeToolResult) => void }

class Session {
  readonly pending = new Map<string, PendingCall>();
  private readonly queue: Event[] = [];
  private waiter: (() => void) | null = null;
  tools: readonly ToolSpec[] = [];
  registration: BridgeRegistration | null = null;
  process: CliProcess | null = null;
  ended = false;
  reaper: TimerHandle | null = null;
  readonly files: string[] = [];
  removeFile: (path: string) => void = () => undefined;

  push(e: Event): void { this.queue.push(e); const w = this.waiter; this.waiter = null; w?.(); }

  async next(): Promise<Event> {
    while (this.queue.length === 0) await new Promise<void>((resolve) => { this.waiter = resolve; });
    return this.queue.shift()!;
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.reaper?.cancel();
    this.reaper = null;
    // A call nobody will answer is answered as a failure, so the request the process holds open ends with it.
    for (const p of this.pending.values()) p.answer({ text: 'The run ended before this call was answered.', isError: true });
    this.pending.clear();
    this.registration?.release();
    this.process?.kill();
    for (const file of this.files.splice(0)) this.removeFile(file);
  }
}

function textOf(parts: readonly ContentPart[]): string {
  return parts.map((p) => (p.kind === 'text' ? p.text : `[an image, ${p.mediaType}]`)).join('');
}

/** The conversation so far, as text, for a process that was not there for it. */
export function renderHistory(messages: readonly ChatMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') { lines.push(`<user>\n${textOf(m.content)}\n</user>`); continue; }
    if (m.role === 'assistant') {
      const said = m.content.filter((p): p is ContentPart => p.kind === 'text' || p.kind === 'image');
      const calls = m.content.filter((p) => p.kind === 'tool-call');
      if (said.length > 0) lines.push(`<assistant>\n${textOf(said)}\n</assistant>`);
      for (const c of calls) if (c.kind === 'tool-call') lines.push(`<assistant_tool_call id="${c.callId}" tool="${c.name}">\n${c.args}\n</assistant_tool_call>`);
      continue;
    }
    if (m.role !== 'tool') continue;
    for (const r of m.content) lines.push(`<tool_result id="${r.callId}" tool="${r.name}"${r.isError ? ' error="true"' : ''}>\n${r.result}\n</tool_result>`);
  }
  return lines.join('\n');
}

type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** What a new process is told first: the one user message there is, or the conversation so far and where it stands. */
export function openingContent(messages: readonly ChatMessage[]): Block[] {
  const rest = messages.filter((m) => m.role !== 'system');
  const last = rest[rest.length - 1];
  const blocks = (parts: readonly ContentPart[]): Block[] => parts.map((p) => (p.kind === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }));
  if (rest.length === 1 && last?.role === 'user') return blocks(last.content);
  if (last?.role === 'user') {
    return [{ type: 'text', text: `The conversation so far, which you took part in as the assistant:\n\n${renderHistory(rest.slice(0, -1))}\n\nThe user's next message follows.` }, ...blocks(last.content)];
  }
  return [{ type: 'text', text: `The conversation so far, which you took part in as the assistant:\n\n${renderHistory(rest)}\n\nContinue from where it stands. The tool results above are the answers to your last tool calls.` }];
}

function usageOf(u: unknown): Usage | null {
  if (u === null || typeof u !== 'object') return null;
  const n = (k: string): number => { const v = (u as Record<string, unknown>)[k]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; };
  return { input: n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens'), output: n('output_tokens') };
}

function at(value: unknown, ...path: string[]): unknown {
  let v = value;
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}

/** The external tool's own failure text, read for the status the run's recovery paths key on. */
export function failureOf(text: string, status: unknown): ModelError {
  const message = text.trim().slice(0, 500);
  if (typeof status === 'number' && status >= 400) return modelError({ code: 'http', status, headline: `Claude Code answered HTTP ${status}`, providerMessage: message });
  if (/\/login|not logged in|authentication_error|invalid api key|oauth token/i.test(message)) return modelError({ code: 'http', status: 401, headline: 'Claude Code is not signed in', providerMessage: message });
  if (/usage limit|rate limit|limit reached|out of extra usage|quota/i.test(message)) return modelError({ code: 'http', status: 429, headline: 'Claude Code reported a usage limit', providerMessage: message });
  if (/overloaded/i.test(message)) return modelError({ code: 'http', status: 503, headline: 'Claude Code reported the service overloaded', providerMessage: message });
  return modelError({ code: 'unknown', headline: 'Claude Code ended the turn with an error', providerMessage: message });
}

export class ClaudeCliModelClient implements ModelClient {
  private readonly waiting = new Set<Session>();
  private readonly all = new Set<Session>();

  constructor(private readonly opts: ClaudeCliOptions) {}

  /** Ends every process this client started. Called when the run host shuts down. */
  shutdown(): void { for (const s of [...this.all]) this.end(s); }

  private end(s: Session): void { s.close(); this.waiting.delete(s); this.all.delete(s); }

  /** The process waiting for exactly the results this step carries, if there is one. */
  private waitingFor(messages: readonly ChatMessage[]): { session: Session; results: Map<string, BridgeToolResult> } | null {
    const results = new Map<string, BridgeToolResult>();
    for (let i = messages.length - 1; i >= 0 && messages[i]!.role === 'tool'; i -= 1) {
      const m = messages[i]!;
      if (m.role === 'tool') for (const r of m.content) results.set(r.callId, { text: r.result, isError: r.isError });
    }
    if (results.size === 0) return null;
    for (const session of this.waiting) {
      if (session.pending.size > 0 && [...session.pending.keys()].every((id) => results.has(id))) return { session, results };
    }
    return null;
  }

  private async start(req: ModelRequest): Promise<Result<Session, ModelError>> {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content as readonly ContentPart[])).join('\n\n');
    const session = new Session();
    session.tools = req.tools ?? [];
    try {
      session.registration = await this.opts.bridge.register({
        tools: () => session.tools,
        call: (call) => new Promise<BridgeToolResult>((answer) => {
          if (session.ended || call.callId === '') { answer({ text: 'This call could not be matched to the turn that asked for it.', isError: true }); return; }
          session.pending.set(call.callId, { call, answer });
          session.push({ kind: 'tool-arrived', callId: call.callId });
        }),
      });
    } catch (cause) {
      return err(modelError({ code: 'connection', headline: 'The tool bridge for Claude Code could not be started', providerMessage: cause instanceof Error ? cause.message : String(cause), transient: false }));
    }
    try {
      session.removeFile = this.opts.removeFile;
      session.files.push(this.opts.writeSessionFile('instructions', system), this.opts.writeSessionFile('tools', JSON.stringify(session.registration.config)));
    } catch (cause) {
      session.close();
      return err(modelError({ code: 'connection', headline: 'Claude Code could not be given its instructions', providerMessage: cause instanceof Error ? cause.message : String(cause), transient: false }));
    }
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      // The product's tools and no others: no built-in tool, no tool server but the bridge, no settings of the user's or the project's.
      '--tools', '', '--strict-mcp-config', '--mcp-config', session.files[1]!, '--allowedTools', `mcp__${BRIDGE_SERVER_NAME}`,
      '--setting-sources', '', '--no-session-persistence', '--system-prompt-file', session.files[0]!, '--model', req.model.modelId,
      ...(req.thinking === 'unset' || req.thinking === 'off' ? [] : ['--effort', req.thinking]),
    ];
    // The process authenticates itself. Nothing of this product's is put into its environment as a credential, and the
    // two variables that would tell it that it runs inside another Claude Code session are not passed on.
    const env: Record<string, string | undefined> = { ...this.opts.env, MCP_TOOL_TIMEOUT: String(TOOL_CALL_BOUND_MS), CLAUDECODE: undefined, CLAUDE_CODE_ENTRYPOINT: undefined };
    let process: CliProcess;
    try {
      process = this.opts.launch({ executable: this.opts.executable ?? CLAUDE_CLI_EXECUTABLE, args, env, cwd: this.opts.cwd });
    } catch (cause) {
      session.close();
      return err(modelError({ code: 'connection', headline: 'Claude Code could not be started', providerMessage: cause instanceof Error ? cause.message : String(cause), transient: false }));
    }
    session.process = process;
    this.all.add(session);
    process.onLine((line) => {
      if (line.trim() === '') return;
      try {
        const value: unknown = JSON.parse(line);
        if (value !== null && typeof value === 'object') session.push({ kind: 'line', value: value as Record<string, unknown> });
      } catch { /* a line that is not a message is not the stream's */ }
    });
    process.onExit((code, stderr) => session.push({ kind: 'exit', code, stderr }));
    process.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: openingContent(req.messages) } })}\n`);
    return ok(session);
  }

  async *stream(req: ModelRequest): AsyncIterable<Result<StreamPart, ModelError>> {
    // REQ-PROVIDER-048: before every prompt.
    const conflict = credentialConflict(this.opts.env, this.opts.readUserSettings());
    if (conflict !== null) { yield err(modelError({ code: 'validation', headline: 'Claude Code credential conflict', providerMessage: conflict, transient: false })); return; }
    if (req.signal.aborted) { yield err(modelError({ code: 'aborted', headline: 'the call was aborted', transient: false })); return; }

    let session: Session;
    const resumed = this.waitingFor(req.messages);
    if (resumed) {
      session = resumed.session;
      this.waiting.delete(session);
      session.reaper?.cancel();
      session.reaper = null;
      session.tools = req.tools ?? session.tools;
      for (const [id, p] of [...session.pending]) { session.pending.delete(id); p.answer(resumed.results.get(id)!); }
    } else {
      const started = await this.start(req);
      if (!started.ok) { yield started; return; }
      session = started.value;
    }

    const onAbort = (): void => session.push({ kind: 'aborted' });
    req.signal.addEventListener('abort', onAbort, { once: true });
    const idle: { handle: TimerHandle | null } = { handle: null };
    const rearm = (): void => { idle.handle?.cancel(); idle.handle = this.opts.timers.after(millis(req.timeoutMs), () => session.push({ kind: 'idle' })); };
    rearm();

    let usage: Usage = { input: 0, output: 0 };
    let usageSeen = false;
    /** The tool calls of the assistant message being read, in the order it made them. */
    let asked: { id: string; name: string }[] = [];
    const current: { usage: Usage | null } = { usage: null };
    let closing = false;
    let keep = false;
    try {
      for (;;) {
        const event = await session.next();
        if (event.kind === 'aborted') { yield err(modelError({ code: 'aborted', headline: 'the call was aborted', transient: false })); return; }
        if (event.kind === 'idle') { yield err(modelError({ code: 'timeout', headline: `no stream activity for ${req.timeoutMs} ms` })); return; }
        if (event.kind === 'exit') {
          yield err(event.code === null && event.stderr === '' ? modelError({ code: 'connection', headline: 'Claude Code could not be started', providerMessage: `The ${this.opts.executable ?? CLAUDE_CLI_EXECUTABLE} executable was not found or ended at once. Install Claude Code and sign in to it.`, transient: false }) : failureOf(event.stderr || `Claude Code ended with exit code ${String(event.code)} before it answered.`, null));
          return;
        }
        rearm();
        if (event.kind === 'tool-arrived') {
          if (closing && asked.every((a) => session.pending.has(a.id))) break;
          continue;
        }
        const m = event.value;
        if (m['type'] === 'stream_event') {
          const e = m['event'];
          const type = at(e, 'type');
          if (type === 'message_start') { asked = []; current.usage = usageOf(at(e, 'message', 'usage')); closing = false; }
          else if (type === 'content_block_start' && at(e, 'content_block', 'type') === 'tool_use') {
            const id = at(e, 'content_block', 'id');
            const name = at(e, 'content_block', 'name');
            if (typeof id === 'string' && typeof name === 'string') { asked.push({ id, name }); yield ok<StreamPart>({ kind: 'tool-input', callId: id }); }
          } else if (type === 'content_block_delta') {
            const delta = at(e, 'delta');
            if (at(delta, 'type') === 'text_delta' && typeof at(delta, 'text') === 'string') yield ok<StreamPart>({ kind: 'text', delta: at(delta, 'text') as string });
            else if (at(delta, 'type') === 'thinking_delta' && typeof at(delta, 'thinking') === 'string') yield ok<StreamPart>({ kind: 'reasoning', delta: at(delta, 'thinking') as string });
          } else if (type === 'message_delta') {
            const u = usageOf(at(e, 'usage'));
            if (u) current.usage = { input: Math.max(current.usage?.input ?? 0, u.input), output: Math.max(current.usage?.output ?? 0, u.output) };
          } else if (type === 'message_stop') {
            if (current.usage) { usage = { input: usage.input + current.usage.input, output: usage.output + current.usage.output }; usageSeen = true; current.usage = null; }
            if (asked.length > 0) {
              // The step ends here, once every call the message made has reached the bridge and waits there.
              closing = true;
              if (asked.every((a) => session.pending.has(a.id))) break;
            }
          }
          continue;
        }
        if (m['type'] === 'result') {
          const text = typeof m['result'] === 'string' ? m['result'] : '';
          if (m['is_error'] === true || (typeof m['subtype'] === 'string' && m['subtype'] !== 'success')) { yield err(failureOf(text || String(m['subtype']), m['api_error_status'])); return; }
          if (!usageSeen) { const u = usageOf(m['usage']); if (u) usage = u; }
          yield ok<StreamPart>({ kind: 'usage', usage });
          yield ok<StreamPart>({ kind: 'finish', reason: m['stop_reason'] === 'max_tokens' ? 'length' : 'stop' });
          session.process?.endInput();
          return;
        }
      }
      // The message's calls, whole, in the order it made them; their answers are the next step's to give.
      for (const a of asked) {
        const call = session.pending.get(a.id)!.call;
        yield ok<StreamPart>({ kind: 'tool-call', callId: a.id, name: a.name.startsWith(BRIDGE_TOOL_PREFIX) ? a.name.slice(BRIDGE_TOOL_PREFIX.length) : call.name, argsDelta: JSON.stringify(call.args) });
      }
      yield ok<StreamPart>({ kind: 'usage', usage });
      yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
      keep = true;
    } finally {
      idle.handle?.cancel();
      req.signal.removeEventListener('abort', onAbort);
      if (keep) {
        this.waiting.add(session);
        session.reaper = this.opts.timers.after(millis(this.opts.idleMs ?? WAITING_SESSION_IDLE_MS), () => {
          this.opts.log('claude code: a process waiting for tool results was given up after its idle bound; the next step starts a new one');
          this.end(session);
        });
      } else this.end(session);
    }
  }
}
