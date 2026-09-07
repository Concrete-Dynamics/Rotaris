import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { z } from 'zod';
import type { Clocks } from '@rotaris/kernel';
import { errorObservation, observation, type Observation, type ToolContext, type ToolExecutor } from '../tools/types.js';
import { BackgroundManager, DEFAULT_BACKGROUND_TIMEOUT_S } from './background.js';
import { classifyOutcome, diagnosticBlock, outputSection, outputWarnings, renderAction, type FailureKind } from './classify.js';
import { ForegroundSession, keystroke, type PtyFactory, type ShellBackend } from './foreground.js';

export * from './classify.js';
export * from './foreground.js';
export * from './background.js';

/**
 * The `terminal` tool (REQ-TOOLS-095..113, REQ-TOOLS-179, REQ-TOOLS-187): one executor over a manager
 * that holds one foreground session per agent (sessions of different agents run concurrently) and the
 * background sessions. Backend name `single-session` on every observation (REQ-TOOLS-100). Availability
 * is decided SOLELY by the presence of `pwsh` or `powershell` on Windows (REQ-TOOLS-104), never by how
 * quickly anything responds; the tool loads identically whatever the host's own streams are attached to
 * (REQ-TOOLS-106): nothing here reads them.
 */
export const BACKEND_NAME = 'single-session';

export const terminalSchema = z.object({
  command: z.string().default(''),
  is_input: z.boolean().default(false),
  timeout: z.number().min(0).optional(),
  reset: z.boolean().default(false),
  background: z.boolean().default(false),
  session_id: z.string().regex(/^ts_[0-9a-f]{8}$/).optional(),
  session_action: z.enum(['query', 'kill', 'send_input', 'send_signal', 'list']).optional(),
  signal: z.enum(['SIGTERM', 'SIGINT', 'SIGKILL', 'SIGHUP']).optional(),
  input_data: z.string().optional(),
});
export type TerminalArgs = z.infer<typeof terminalSchema>;

/** REQ-TOOLS-104: presence on the host, and nothing else. */
export function findShell(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): ShellBackend | null {
  if (platform === 'win32') {
    const dirs = (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter((d) => d.length > 0);
    for (const exe of ['pwsh.exe', 'powershell.exe']) {
      for (const d of dirs) {
        const f = join(d, exe);
        try { if (existsSync(f) && statSync(f).isFile()) return { kind: 'powershell', file: f }; } catch { /* next */ }
      }
    }
    return null;
  }
  const file = existsSync('/bin/sh') ? '/bin/sh' : env['SHELL'] ?? null;
  return file ? { kind: 'posix', file } : null;
}

export interface TerminalConfig {
  /** `runtime.shell_command_timeout`, seconds; default 100 (REQ-CONFIG-116). */
  readonly commandTimeoutS: number;
  readonly backgroundTimeoutS: number;
  readonly maxBackgroundSessions: number;
  readonly noOutputWindowMs?: number;
}
export const TERMINAL_DEFAULTS: TerminalConfig = { commandTimeoutS: 100, backgroundTimeoutS: DEFAULT_BACKGROUND_TIMEOUT_S, maxBackgroundSessions: 20 };

export interface TerminalManagerDeps {
  readonly factory: PtyFactory;
  readonly backend: ShellBackend;
  readonly clocks: Clocks;
  readonly config: TerminalConfig;
  readonly env: Record<string, string>;
  readonly warn: (m: string) => void;
}

/** One foreground session per agent (REQ-TOOLS-187); the background sessions per workspace. */
export class TerminalManager {
  private readonly foreground = new Map<string, ForegroundSession>();
  private readonly background = new Map<string, BackgroundManager>();
  constructor(private readonly deps: TerminalManagerDeps) {}

  session(key: string, cwd: string): ForegroundSession {
    let s = this.foreground.get(key);
    if (!s) {
      s = new ForegroundSession({
        factory: this.deps.factory, backend: this.deps.backend, cwd, env: this.deps.env, monotonic: this.deps.clocks.monotonic, timers: this.deps.clocks.timers,
        ...(this.deps.config.noOutputWindowMs === undefined ? {} : { noOutputWindowMs: this.deps.config.noOutputWindowMs }), warn: this.deps.warn,
      });
      this.foreground.set(key, s);
    }
    return s;
  }
  backgroundFor(cwd: string): BackgroundManager {
    let b = this.background.get(cwd);
    if (!b) {
      b = new BackgroundManager({ backend: this.deps.backend, cwd, env: this.deps.env, monotonic: this.deps.clocks.monotonic, wall: this.deps.clocks.wall, timers: this.deps.clocks.timers, maxSessions: this.deps.config.maxBackgroundSessions, warn: this.deps.warn });
      this.background.set(cwd, b);
    }
    return b;
  }
  /** REQ-TOOLS-184: background sessions in the running state, across the workspaces this host serves. */
  get runningBackground(): number {
    let n = 0;
    for (const b of this.background.values()) n += b.running;
    return n;
  }
  /** REQ-TOOLS-111: kill every background session and close every terminal resource held. */
  async dispose(): Promise<void> {
    for (const s of this.foreground.values()) s.dispose();
    this.foreground.clear();
    await Promise.all([...this.background.values()].map((b) => b.dispose()));
    this.background.clear();
  }
}

function invalid(message: string, a: { readonly command: string }): Observation {
  const diag = diagnosticBlock({ backend: BACKEND_NAME, command: a.command, detail: message, error_class: 'ValueError', exit_code: null, failure_kind: 'invalid_request', outcome_kind: 'invalid_request', outcome_severity: 'warning', warnings: [] });
  return errorObservation(`${message}\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'invalid_request', failureKind: 'invalid_request', exitCode: null, warnings: [] });
}

export function terminalTool(manager: TerminalManager, config: TerminalConfig): ToolExecutor<TerminalArgs> {
  return {
    name: 'terminal',
    description: 'Run a command in a persistent shell session (working directory and variables persist across calls). On Windows the shell is PowerShell, not bash: `&&`, `;`, `2>&1` and `$env:VAR` work; a bash heredoc never returns, and bash arrays, `[[ … ]]` and `source` are unavailable. One command per call; use `&&` or `;` for sequences. `background=true` runs a command in its own process and returns a session id for later `query` / `kill`. A command that prints nothing for 30 s returns early with exit −1 while it keeps running; poll with an empty command, interrupt with `C-c` and `is_input=true`; stdout and stderr share the captured terminal stream.',
    schema: terminalSchema,
    validationError: (a, detail) => invalid(`Invalid terminal request: ${detail}`, { command: typeof a['command'] === 'string' ? a['command'] : '' }),
    label: (a) => renderAction({ command: a.command, timeout: a.timeout, reset: a.reset, background: a.background, session_id: a.session_id, session_action: a.session_action }),
    execute: async (a, ctx) => {
      // REQ-TOOLS-101: request validation.
      if (a.reset && a.is_input) return invalid('Cannot use reset=True with is_input=True in the same terminal call.', a);
      if (a.background && (a.is_input || a.reset)) return invalid('Cannot combine background=True with is_input=True or reset=True.', a);
      if (a.background && a.command === '') return invalid('A command is required when background=True.', a);
      if (a.session_action === 'send_input' && a.input_data === undefined) return invalid('send_input requires input_data.', a);
      if (!existsSync(ctx.workspaceRoot)) return invalid(`working_dir '${ctx.workspaceRoot}' is not a valid directory`, a);
      const cwd = ctx.workspaceRoot;

      // Session actions (REQ-TOOLS-110). `background` outranks `session_id` (REQ-TOOLS-120).
      if (!a.background && (a.session_action || a.session_id)) return sessionAction(a, manager.backgroundFor(cwd));
      if (a.background) return startBackground(a, manager.backgroundFor(cwd), config);

      const key = `${ctx.sessionId}:${ctx.agentName}`;
      let session = manager.session(key, cwd);
      let resetNote = '';
      if (a.reset) {
        session.resetNow();
        session = manager.session(key, cwd);
        resetNote = 'The terminal session has been reset; all previous environment variables and session state were cleared.';
        if (a.command === '') {
          const diag = diagnosticBlock({ backend: BACKEND_NAME, command: '[RESET]', detail: resetNote, exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', session_reinitialized: true, warnings: [] });
          return observation(`${resetNote}\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'success', exitCode: 0, warnings: [], label: '$ [RESET]' });
        }
      }
      if (a.is_input) {
        session.sendInput(keystroke(a.command));
        const diag = diagnosticBlock({ backend: BACKEND_NAME, command: a.command, detail: 'Input was written to the terminal session.', exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', warnings: [] });
        return observation(`Sent input to the terminal session.\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'success', exitCode: 0, warnings: [] });
      }
      const timeoutMs = a.timeout !== undefined ? a.timeout * 1000 : config.commandTimeoutS * 1000;
      const softEligible = a.timeout === undefined;
      const r = a.command === '' ? await session.poll() : await session.run(a.command, { timeoutMs: softEligible ? null : timeoutMs, signal: ctx.signal, ...(softEligible ? { hardMs: timeoutMs } : {}) } as { timeoutMs: number | null; signal?: AbortSignal });
      const label = `${resetNote ? '[RESET] ' : ''}${a.command}`;
      const warnings = r.exitCode === 0 || r.exitCode > 0 ? outputWarnings(a.command, r.output, r.exitCode) : [];
      const failureKind: FailureKind | null = r.timedOut ? 'timeout' : r.error && !r.softPaused ? 'execution_error' : null;
      const { outcomeKind, severity } = classifyOutcome({ failureKind, exitCode: r.exitCode, output: r.output, command: a.command }, warnings);
      let detail: string;
      if (r.timedOut) {
        detail = `The command exceeded its timeout of ${timeoutMs / 1000} seconds; the terminal session was forcibly restarted to terminate the process tree, and shell state (working directory, variables, aliases, background jobs) was lost${r.killStatus === 'reset_failed' ? ' — restarting the session failed' : ''}.${r.error ? ` (${r.error})` : ''}`;
      } else if (r.softPaused) {
        detail = r.output === ''
          ? `No output for ${(config.noOutputWindowMs ?? 30_000) / 1000} seconds in the merged terminal stream; stdout and stderr are both captured. The process may still be running. Poll by calling the tool again with an empty command, or interrupt by sending C-c with is_input=true.`
          : 'The command is still running; this is the output so far. Poll again with an empty command.';
      } else if (r.error) {
        detail = `Terminal execution failed before completion: ${r.error}`;
      } else {
        detail = `${resetNote ? `${resetNote} ` : ''}The command exited with code ${r.exitCode}.${warnings.length ? ` ${warnings.join(' ')}` : ''}`;
      }
      const diag = diagnosticBlock({
        backend: BACKEND_NAME, command: a.command, detail, exit_code: r.exitCode, failure_kind: failureKind, kill_status: r.killStatus, outcome_kind: outcomeKind, outcome_severity: severity,
        output_truncated: r.truncated ? true : null, session_reinitialized: r.sessionReinitialized, timeout: r.timedOut, timeout_seconds: timeoutMs / 1000, warnings, working_directory: cwd,
        error_class: r.timedOut ? 'TimeoutError' : r.error ? 'ExecutionError' : null,
      });
      const isError = severity === 'error';
      return {
        text: `${detail}\n${outputSection(r.output, r.timedOut)}\n${diag}`, isError, outcomeKind, exitCode: r.exitCode, failureKind, warnings, label: `$ ${label}`,
      };
    },
  };
}

function startBackground(a: TerminalArgs, bg: BackgroundManager, config: TerminalConfig): Observation {
  const started = bg.start(a.command, a.timeout ?? config.backgroundTimeoutS);
  if (!started.ok) {
    const diag = diagnosticBlock({ backend: BACKEND_NAME, command: a.command, detail: started.error, error_class: 'ExecutionError', exit_code: null, failure_kind: 'execution_error', outcome_kind: 'execution_error', outcome_severity: 'error', warnings: [] });
    return errorObservation(`${started.error}\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'execution_error', failureKind: 'execution_error', exitCode: null, warnings: [] });
  }
  const s = started.session;
  const diag = diagnosticBlock({ backend: BACKEND_NAME, command: a.command, detail: `Background session started: ${s.id}`, exit_code: 0, outcome_kind: 'background_running', outcome_severity: 'info', session_id: s.id, session_status: 'running', warnings: [] });
  return observation(`Background session started: ${s.id}\ncommand: ${a.command}\nsession_status="running"\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'background_running', exitCode: 0, warnings: [] });
}

function sessionAction(a: TerminalArgs, bg: BackgroundManager): Promise<Observation> | Observation {
  const action = a.session_action ?? 'query';
  if (action === 'list') {
    const rows = bg.list();
    const glyph = (s: string) => (s === 'running' ? '▶' : s === 'completed' ? '✓' : '✗');
    const table = rows.length === 0 ? '(no background sessions)' : rows.map((s) => `${glyph(s.status)} ${s.id}  ${s.status.padEnd(9)}  ${s.exitCode ?? '-'}  ${s.startedAt}  ${s.command}`).join('\n');
    const entries = rows.map((s) => ({ session_id: s.id, command: s.command, status: s.status, exit_code: s.exitCode, started_at: s.startedAt }));
    const diag = diagnosticBlock({ backend: BACKEND_NAME, command: '[list]', detail: `${rows.length} background session(s).`, exit_code: 0, outcome_kind: 'success', outcome_severity: 'info', sessions: entries, warnings: [] });
    return observation(`${table}\n${outputSection('', false)}\n${diag}`, { outcomeKind: 'success', exitCode: 0, warnings: [] });
  }
  if (!a.session_id) return invalid(`session_action '${action}' requires session_id.`, a);
  const s = bg.get(a.session_id);
  if (!s) return invalid(`Unknown background session: '${a.session_id}'`, a);
  const finish = (text: string, output: string) => {
    const { outcomeKind, severity } = classifyOutcome({ exitCode: s.exitCode, output, command: s.command, backgroundStatus: s.status }, []);
    const diag = diagnosticBlock({ backend: BACKEND_NAME, command: s.command, detail: text, exit_code: s.exitCode, outcome_kind: outcomeKind, outcome_severity: severity, session_id: s.id, session_status: s.status, warnings: [] });
    return observation(`${text}\n${outputSection(output, false)}\n${diag}`, { outcomeKind, exitCode: s.exitCode, warnings: [], isError: severity === 'error' });
  };
  switch (action) {
    case 'query': {
      const out = s.readNew();
      return finish(`Session ${s.id} is ${s.status}${s.exitCode !== null ? ` (exit ${s.exitCode})` : ''}.`, out === '' ? '(no new output since last poll)' : out);
    }
    case 'kill':
      return s.end('killed').then(() => finish(`Session ${s.id} was killed.`, s.readAll()));
    case 'send_input': {
      const data = a.input_data ?? '';
      const ok = s.sendInput(data);
      return finish(ok ? `Sent ${Buffer.byteLength(data)} byte(s) to session ${s.id}.` : `Session ${s.id}'s input is closed; nothing was sent.`, '');
    }
    case 'send_signal': {
      const sig = a.signal ?? 'SIGTERM';
      const ok = s.signal(sig);
      return ok ? finish(`Sent ${sig} to session ${s.id}.`, '') : invalid(`${sig} cannot be delivered to a background pipe session on ${process.platform}; use kill, or SIGTERM/SIGKILL.`, a);
    }
    default:
      return invalid(`Unknown session action '${String(action)}'.`, a);
  }
}

/** The node-pty factory, loaded lazily so a host without the native module still loads the package. */
export async function nodePtyFactory(): Promise<PtyFactory> {
  const pty = await import('node-pty');
  return {
    spawn: (file, args, opts) => {
      const p = pty.spawn(file, [...args], { name: opts.name, cols: opts.cols, rows: opts.rows, cwd: opts.cwd, env: opts.env });
      return {
        pid: p.pid,
        onData: (cb) => { p.onData(cb); },
        onExit: (cb) => { p.onExit(cb); },
        write: (d) => p.write(d),
        resize: (c, r) => p.resize(c, r),
        kill: (s) => p.kill(s),
      };
    },
  };
}

export { type ToolContext };
