import type { ChildProcess } from 'node:child_process';
import { ReadBuffer, serializeMessage, type JSONRPCMessage, type Transport } from '@modelcontextprotocol/client';
import { millis, redact, type Millis, type Timers } from '@rotaris/kernel';
import { spawnChild, windowsLaunchOf } from '@rotaris/platform';
import type { McpLog } from './types.js';

/**
 * ADR-0033's `OwnedStdioTransport`: the SDK's protocol layer above, OUR process behaviour below.
 * Every launch creates the child's three standard streams itself (`stdio: pipe ×3`), never inherits or
 * reuses the parent's, and suppresses the console window (`spawnChild` sets `windowsHide`) — REQ-MCP-113.
 * The child's stderr reaches the log line by line AFTER `redact()` (ADR-0007). Framing is the SDK's
 * exported `ReadBuffer` / `serializeMessage` (newline-delimited JSON-RPC). Termination is ours:
 * terminate → a grace on the Timers port → force-kill, the whole tree on Windows (`terminateTree`,
 * shared with ADR-0026's backend and REQ-MCP-099's setup children).
 *
 * The SDK classifies a transport that exposes `stderr` and `pid` as stdio-shaped (its probe-timeout
 * verdict is then "legacy server", not "outage"), and spawns its sibling probe ONLY for its own
 * `StdioClientTransport` (it reads `_serverParams` behind a `_dispose` prototype member) — measured in
 * `spikes/mcp-negotiation.md`: over this transport the process count is one under every mode.
 */
export interface OwnedStdioSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** The environment the pipeline resolved (OQ-22's reading: the scrubbed parent environment with REQ-MCP-090's map overlaid). */
  readonly env: Readonly<Record<string, string>>;
  readonly timers: Timers;
  readonly log: McpLog;
  /** A name for the log lines. */
  readonly label: string;
  /** REQ-MCP-099 / ADR-0033: the grace between terminate and force-kill; 5 s by default. */
  readonly graceMs?: Millis;
}

export const TERMINATE_GRACE_MS: Millis = millis(5_000);

/** Terminate, wait the grace, force-kill — the whole tree on Windows. Resolves once the process is gone or the kill was issued. */
export function terminateTree(child: ChildProcess, timers: Timers, graceMs: Millis = TERMINATE_GRACE_MS): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; grace.cancel(); resolve(); } };
    child.once('exit', finish);
    const force = () => {
      if (done) return;
      if (process.platform === 'win32' && child.pid !== undefined) {
        // The tree: a package runner (npx, uvx) spawns the real server below itself.
        const killer = spawnChild({ command: 'taskkill', args: ['/PID', String(child.pid), '/T', '/F'], env: process.env as Record<string, string>, stdio: 'ignore' });
        killer.once('exit', () => { child.kill('SIGKILL'); });
        killer.once('error', () => { child.kill('SIGKILL'); });
      } else {
        child.kill('SIGKILL');
      }
      // A process that will not die does not hold the caller: the kill was issued.
      timers.after(millis(1_000), finish);
    };
    const grace = timers.after(graceMs, force);
    try { child.kill(); } catch { force(); }
  });
}

export class OwnedStdioTransport implements Transport {
  private child: ChildProcess | null = null;
  private readonly buffer = new ReadBuffer();
  private started = false;
  private closed = false;
  private stderrTail = '';
  private exitDetail = '';
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;

  constructor(private readonly spec: OwnedStdioSpec) {}

  /** The child's pid, for the counting tests of REQ-MCP-067; null before start and after exit. */
  get pid(): number | null {
    return this.child?.pid ?? null;
  }
  /** Present so the SDK reads this transport as stdio-shaped; the stream itself is consumed here, redacted, never handed out. */
  get stderr(): null {
    return null;
  }
  /** The last lines the child wrote to stderr and how it ended — REQ-MCP-107's root-cause text. */
  get detail(): string {
    return this.exitDetail || this.stderrTail.trim();
  }

  start(): Promise<void> {
    if (this.started) return Promise.reject(new Error(`OwnedStdioTransport for ${this.spec.label} was already started`));
    this.started = true;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let child: ChildProcess;
      try {
        // REQ-MCP-113 on Windows: a `.cmd`/`.bat` runner (npx, uvx) is reached through cmd.exe with the line passed verbatim.
        const launch = windowsLaunchOf(this.spec.command, this.spec.args, this.spec.env);
        child = spawnChild({ command: launch.command, args: launch.args, cwd: this.spec.cwd, env: this.spec.env, stdio: ['pipe', 'pipe', 'pipe'], ...(launch.windowsVerbatimArguments === undefined ? {} : { windowsVerbatimArguments: launch.windowsVerbatimArguments }) });
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)));
        return;
      }
      this.child = child;
      child.once('spawn', () => { settled = true; resolve(); });
      child.on('error', (error: Error) => {
        // Before spawn: the OS could not start the child at all (REQ-MCP-107 case 1). After: a transport error.
        this.exitDetail = error.message;
        if (!settled) { settled = true; reject(error); return; }
        this.onerror?.(error);
      });
      child.on('exit', (code, signal) => {
        this.exitDetail = `${this.spec.label} exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}${this.stderrTail.trim() ? `; stderr: ${this.stderrTail.trim().slice(-400)}` : ''}`;
        this.child = null;
        if (!settled) { settled = true; reject(new Error(this.exitDetail)); }
        this.settleClosed();
      });
      child.stdout?.on('data', (chunk: Buffer) => {
        this.buffer.append(chunk);
        for (;;) {
          let message: JSONRPCMessage | null;
          try { message = this.buffer.readMessage(); } catch (cause) { this.onerror?.(cause instanceof Error ? cause : new Error(String(cause))); continue; }
          if (message === null) break;
          this.onmessage?.(message);
        }
      });
      // ADR-0007: the child's error stream reaches the log only through the redaction pass.
      let pending = '';
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim() === '') continue;
          const safe = redact(line);
          this.stderrTail = `${this.stderrTail}\n${safe}`.slice(-2_000);
          this.spec.log.info(`mcp ${this.spec.label} stderr: ${safe}`);
        }
      });
      child.stdin?.on('error', (error: Error) => { this.onerror?.(error); });
    });
  }

  send(message: JSONRPCMessage): Promise<void> {
    const child = this.child;
    if (!child || !child.stdin || child.stdin.destroyed) return Promise.reject(new Error(`${this.spec.label} is not connected${this.exitDetail ? ` (${this.exitDetail})` : ''}`));
    return new Promise<void>((resolve, reject) => {
      const ok = child.stdin!.write(serializeMessage(message), (error) => { if (error) reject(error); else resolve(); });
      if (!ok) child.stdin!.once('drain', () => resolve());
    });
  }

  async close(): Promise<void> {
    const child = this.child;
    if (child) {
      try { child.stdin?.end(); } catch { /* the stream may already be gone */ }
      await terminateTree(child, this.spec.timers, this.spec.graceMs ?? TERMINATE_GRACE_MS);
    }
    this.settleClosed();
  }

  private settleClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer.clear();
    this.onclose?.();
  }
}
