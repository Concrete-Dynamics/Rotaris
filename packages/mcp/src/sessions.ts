import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import { callTool, CONNECT_AND_LIST_TIMEOUT_MS, HOOK_TIMEOUT_MS, listTools, openClient, type OpenedClient } from './client.js';
import type { CallOutcome, McpLog, ServerDescription, ToolInfo } from './types.js';

/**
 * ADR-0034's third path: `SessionConnections` — the shared registry of one session. A map from server name to
 * a promise of a connected, hook-completed session under a KEYED single-flight (two concurrent first demands
 * share one promise; a server still starting never blocks a call to a connected one), a shutdown latch (a
 * request after `closeAll()` fails naming the server and leaves nothing open), idempotent `closeAll()`.
 *
 * The connected value holds the client, the UNFILTERED current tool list (post-connect hooks read it, so no
 * grant can disarm them — REQ-MCP-064), the connect-time list (REQ-MCP-060's narrowing floor) and a
 * warned-unreachable flag (REQ-MCP-069: one warning per server per session). `tools/list_changed` re-lists
 * and notifies; the port recomputes its callable set and only ever narrows. A per-call failure after connect
 * is a failed tool call: no retry, no automatic reconnection; when the transport closed, the entry is dropped
 * so the NEXT call re-attempts the connection (REQ-MCP-069). A child conversation ending leaves everything
 * open (REQ-MCP-068); only `closeAll()` — session end — closes.
 *
 * Post-connect hooks (15 s each): the `lsp` name's `lsp_init {root}` (REQ-MCP-070 — a failure means the
 * server contributes no tools to the agent that triggered the connection and the entry is dropped, so a
 * later agent redoes the connection and the call); the code-intelligence binding probe (REQ-MCP-071, live since
 * ADR-0035 executed on 2026-09-06): the memory-listing tool named by the manifest, called once per connection with empty
 * arguments under 15 s, matched on the trailing segment of the reported name; a failure or an exhausted budget reaches
 * the run host's `probeFailed` (REQ-MCP-044's two channels), the connection stays open and the tools are still offered.
 */
export interface Connected {
  readonly name: string;
  readonly opened: OpenedClient;
  /** The unfiltered list as of the last `tools/list`. */
  readonly tools: () => readonly ToolInfo[];
  readonly connectTimeTools: readonly ToolInfo[];
  readonly onToolsChanged: (fn: (tools: readonly ToolInfo[]) => void) => () => void;
  readonly negotiatedVersion: string | undefined;
  readonly pid: () => number | null;
  readonly hook: { readonly kind: 'none' | 'lsp_init' | 'code_intelligence'; readonly outcome: 'ok' | 'failed' | 'skipped'; readonly detail: string };
  readonly connectMs: number;
}

export interface SessionDeps {
  /** OQ-22's reading, confirmed 2026-10-06 by R-071: what a stdio child inherits under the server's map; the run host supplies its environment. */
  readonly parentEnv?: Readonly<Record<string, string>>;
  /** REQ-STARTUP-158: the product version, sent as `clientInfo.version` (`OpenOptions.clientVersion`). */
  readonly clientVersion: string;
  readonly clocks: Clocks;
  readonly log: McpLog;
  readonly workspaceRoot: string;
  /** REQ-MCP-069: delivered through REQ-MCP-044's two channels by the run host, at most once per server per session. */
  readonly unreachable: (server: string, detail: string) => void;
  readonly connectBudgetMs?: Millis;
  readonly hookBudgetMs?: Millis;
  /** REQ-MCP-071: the memory-listing tool's trailing segment, from ADR-0035's manifest; null switches the probe off (a test's affordance). */
  readonly codeIntelligenceMemoryTool?: string | null;
  readonly codeIntelligenceServerName?: string;
  /** REQ-MCP-071: the probe failed or exhausted its budget — the run host delivers the warning through REQ-MCP-044; no corrective action. */
  readonly probeFailed?: (server: string, detail: string) => void;
  /**
   * Words the connected line carries about what was launched, read from the description handed to the launch — the run
   * host names the project REQ-MCP-034 bound (`project <path>`); '' or absent adds nothing.
   */
  readonly launchNote?: (server: string, description: ServerDescription) => string;
}

export class ConnectionsClosed extends Error {
  constructor(server: string) {
    super(`the session's MCP connections are shut down; ${server} cannot be connected`);
  }
}

export class SessionConnections {
  private readonly entries = new Map<string, Promise<Connected>>();
  private readonly settled = new Map<string, Connected>();
  private readonly warnedUnreachable = new Set<string>();
  private down = false;
  private closing: Promise<void> | null = null;
  /** Launches this registry made, per server — what a test counts against REQ-MCP-067. */
  readonly launches = new Map<string, number>();

  constructor(private readonly deps: SessionDeps) {}

  get isShutDown(): boolean {
    return this.down;
  }

  /** The connected servers as they stand (a starting one is absent until it settles). */
  connected(): ReadonlyMap<string, Connected> {
    return this.settled;
  }

  /**
   * REQ-MCP-066/067: opened on first demand under the keyed single-flight; after shutdown, an error naming the server.
   * `root` is the root REQ-MCP-070's `lsp_init` names for the connection this call establishes: the root the run that
   * demands it executes in (`PD-MCP-002`, OQ-194: an isolated run's tree), the session's workspace root when absent.
   */
  connect(name: string, description: ServerDescription, root?: string): Promise<Connected> {
    if (this.down) return Promise.reject(new ConnectionsClosed(name));
    const known = this.entries.get(name);
    if (known) return known;
    const p = this.establish(name, description, root ?? this.deps.workspaceRoot);
    this.entries.set(name, p);
    p.catch(() => { if (this.entries.get(name) === p) this.entries.delete(name); });
    return p;
  }

  /**
   * REQ-MCP-069: one call under its allowance; a failure after connect is THIS call's failure. The connection stays
   * open for an allowance exhausted or an error result; it is dropped when the transport closed, so the next call
   * re-establishes it. No retry here. `quiet` is a request the product makes on its own (PD-MCP-004's warm-up search, whose
   * clause 3 says it writes no notice): a transport it loses is released the same way but warns nothing, and does not spend the
   * server's one warning, so the call the model made next is the one that warns if it meets the same failure.
   */
  async call(name: string, description: ServerDescription, tool: string, args: Readonly<Record<string, unknown>>, timeoutMs: Millis, signal?: AbortSignal, opts: { readonly quiet?: boolean } = {}): Promise<CallOutcome> {
    const c = await this.connect(name, description);
    try {
      return await callTool(c.opened.client, this.deps.clocks.monotonic, tool, args, timeoutMs, signal);
    } catch (cause) {
      const detail = String(cause instanceof Error ? cause.message : cause);
      if (c.opened.pid() === null && description.transport === 'stdio' || /not connected|closed|ECONN|EPIPE/i.test(detail)) {
        // The server went away: this call fails, the entry is released so a later call may re-establish (REQ-MCP-069).
        this.release(name, c);
        if (!opts.quiet && !this.warnedUnreachable.has(name)) {
          this.warnedUnreachable.add(name);
          this.deps.unreachable(name, `${detail}${c.opened.detail() ? ` (${c.opened.detail()})` : ''}`);
        }
      }
      throw cause;
    }
  }

  /** REQ-MCP-067: releasing a superseded connection leaves the current one open and usable. */
  release(name: string, which: Connected): void {
    if (this.settled.get(name) !== which) return;
    this.settled.delete(name);
    this.entries.delete(name);
    void which.opened.close();
  }

  /** REQ-MCP-066/067: idempotent; nothing open once the first call has returned. */
  closeAll(): Promise<void> {
    if (this.closing) return this.closing;
    this.down = true;
    const pending = [...this.entries.values()];
    this.entries.clear();
    this.settled.clear();
    this.closing = Promise.all(pending.map((p) => p.then((c) => c.opened.close(), () => undefined))).then(() => undefined);
    return this.closing;
  }

  private async establish(name: string, description: ServerDescription, root: string): Promise<Connected> {
    const { clocks, log } = this.deps;
    const budget = this.deps.connectBudgetMs ?? CONNECT_AND_LIST_TIMEOUT_MS;
    const started = clocks.monotonic.now();
    this.launches.set(name, (this.launches.get(name) ?? 0) + 1);
    const opened = await openClient({ parentEnv: this.deps.parentEnv, clientVersion: this.deps.clientVersion, description, label: name, timers: clocks.timers, monotonic: clocks.monotonic, log, connectTimeoutMs: budget });
    let current: readonly ToolInfo[];
    try {
      current = await listTools(opened.client, millis(Math.max(1_000, budget - (clocks.monotonic.now() - started))));
    } catch (cause) {
      await opened.close();
      throw cause;
    }
    const connectTime = current;
    const listeners = new Set<(tools: readonly ToolInfo[]) => void>();
    let generation = 0;
    // REQ-MCP-060: a changed list is re-read and every port told; the port narrows against the connect-time names.
    opened.client.setNotificationHandler('notifications/tools/list_changed', async () => {
      const mine = ++generation;
      try {
        const next = await listTools(opened.client, millis(10_000));
        if (mine !== generation) return;
        current = next;
        for (const fn of listeners) fn(next);
      } catch (cause) {
        log.debug(`mcp ${name}: re-listing after list_changed failed: ${String(cause instanceof Error ? cause.message : cause)}`);
      }
    });
    const connected: Connected = {
      name, opened,
      tools: () => current,
      connectTimeTools: connectTime,
      onToolsChanged: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      negotiatedVersion: opened.negotiatedVersion(),
      pid: () => opened.pid(),
      hook: await this.postConnect(name, opened, current, root),
      connectMs: clocks.monotonic.now() - started,
    };
    if (connected.hook.kind === 'lsp_init' && connected.hook.outcome === 'failed') {
      // REQ-MCP-070: no tools for the agent that triggered the connection; a later agent makes the connection again.
      await opened.close();
      throw new Error(`lsp_init failed for ${name}: ${connected.hook.detail}`);
    }
    // A transport that closes underneath (the child exited) drops the entry so the next demand re-establishes.
    opened.onClosed(() => { if (this.settled.get(name) === connected) { this.settled.delete(name); this.entries.delete(name); } });
    if (this.down) { await opened.close(); throw new ConnectionsClosed(name); }
    this.settled.set(name, connected);
    const note = this.deps.launchNote?.(name, description) ?? '';
    log.info(`mcp ${name}: connected for the session (pid ${opened.pid() ?? 'remote'}, protocol ${connected.negotiatedVersion ?? '?'}, ${current.length} tool(s), hook ${connected.hook.kind}:${connected.hook.outcome}${note === '' ? '' : `, ${note}`}) in ${connected.connectMs.toFixed(0)} ms`);
    return connected;
  }

  private async postConnect(name: string, opened: OpenedClient, tools: readonly ToolInfo[], root: string): Promise<Connected['hook']> {
    const hookBudget = this.deps.hookBudgetMs ?? HOOK_TIMEOUT_MS;
    if (name === 'lsp') {
      if (!tools.some((t) => t.name === 'lsp_init')) return { kind: 'lsp_init', outcome: 'skipped', detail: 'the server reports no lsp_init tool; offered as it is' };
      if (root === '') return { kind: 'lsp_init', outcome: 'skipped', detail: 'no workspace root is known' };
      try {
        await callTool(opened.client, this.deps.clocks.monotonic, 'lsp_init', { root }, hookBudget);
        return { kind: 'lsp_init', outcome: 'ok', detail: `root ${root}` };
      } catch (cause) {
        return { kind: 'lsp_init', outcome: 'failed', detail: String(cause instanceof Error ? cause.message : cause) };
      }
    }
    if (name === (this.deps.codeIntelligenceServerName ?? 'code_intelligence')) {
      const memoryTool = this.deps.codeIntelligenceMemoryTool ?? null;
      if (memoryTool === null) return { kind: 'code_intelligence', outcome: 'skipped', detail: 'the binding probe of REQ-MCP-071 is switched off: no memory-listing tool name was supplied' };
      const found = tools.find((t) => t.name === memoryTool || t.name.endsWith(`_${memoryTool}`) || t.name.endsWith(`-${memoryTool}`) || t.name.endsWith(`__${memoryTool}`));
      if (!found) return { kind: 'code_intelligence', outcome: 'skipped', detail: 'the server reports no memory-listing tool' };
      try {
        await callTool(opened.client, this.deps.clocks.monotonic, found.name, {}, hookBudget);
        return { kind: 'code_intelligence', outcome: 'ok', detail: '' };
      } catch (cause) {
        const detail = String(cause instanceof Error ? cause.message : cause);
        this.deps.probeFailed?.(name, detail);
        return { kind: 'code_intelligence', outcome: 'failed', detail };
      }
    }
    return { kind: 'none', outcome: 'skipped', detail: '' };
  }
}
