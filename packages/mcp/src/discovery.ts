import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import { DISCOVERY_BOUND_MS, DISCOVERY_TIMEOUT_MS, listTools, openClient, type OpenedClient } from './client.js';
import { serverIdentity } from './identity.js';
import type { DiscoveryResult, McpLog, ServerDescription, ToolInfo } from './types.js';

/**
 * ADR-0034's first path: `ToolDiscovery` — its own short-lived connection, `initialize` then `tools/list`,
 * memoised PER PROCESS by REQ-MCP-047's nine-value identity and never persisted; a configuration reload
 * calls `invalidate()`. Never raises (REQ-MCP-048): any failure is the empty list, one warning per identity,
 * the failure remembered so REQ-MCP-042 can warn later. The 30 s discovery timeout governs connect and list
 * together; an OUTER WATCHDOG on the Timers port at 35 s resolves the request whatever the transport does
 * and kills the child (REQ-MCP-053), so no outstanding discovery delays exit. A teardown error after the
 * list arrived is logged at debug and the list returned (REQ-MCP-051).
 */
export interface DiscoveryDeps {
  readonly clocks: Clocks;
  readonly log: McpLog;
  readonly timeoutMs?: Millis;
  readonly boundMs?: Millis;
}

export interface DiscoverRequest {
  readonly name: string;
  readonly description: ServerDescription;
  readonly workspaceRoot: string;
}

const EMPTY: readonly ToolInfo[] = Object.freeze([]);

export class ToolDiscovery {
  private readonly memo = new Map<string, DiscoveryResult>();
  private readonly inflight = new Map<string, Promise<DiscoveryResult>>();
  private readonly warned = new Set<string>();
  private readonly open = new Set<OpenedClient>();
  /** Bumped by `invalidate()`; a memoised resolution keyed on it re-resolves after a reload. */
  private generation = 0;

  constructor(private readonly deps: DiscoveryDeps) {}

  get version(): number {
    return this.generation;
  }

  /** What the memo holds for an identity — the answer of the last interrogation, or null when none happened yet. */
  peek(req: DiscoverRequest): DiscoveryResult | null {
    return this.memo.get(serverIdentity(req.name, req.description, req.workspaceRoot)) ?? null;
  }

  /** Whether any memoised discovery failed — a reload then interrogates afresh (REQ-MCP-047's "no further warning"). */
  anyFailed(): boolean {
    for (const r of this.memo.values()) if (r.failed) return true;
    return false;
  }

  /** REQ-MCP-042: whether the most recent discovery for this identity failed. */
  failedFor(req: DiscoverRequest): boolean {
    return this.peek(req)?.failed ?? false;
  }

  /** REQ-MCP-047: a reload makes the next request for every server interrogate it afresh. */
  invalidate(): void {
    this.memo.clear();
    this.warned.clear();
    this.generation += 1;
  }

  discover(req: DiscoverRequest): Promise<DiscoveryResult> {
    const identity = serverIdentity(req.name, req.description, req.workspaceRoot);
    const known = this.memo.get(identity);
    if (known) return Promise.resolve({ ...known, memoised: true });
    const running = this.inflight.get(identity);
    if (running) return running;
    const p = this.interrogate(req, identity).finally(() => { this.inflight.delete(identity); });
    this.inflight.set(identity, p);
    return p;
  }

  /** REQ-MCP-053: nothing outstanding may hold the process; every open connection is killed. */
  async closeAll(): Promise<void> {
    const open = [...this.open];
    this.open.clear();
    await Promise.all(open.map((o) => o.close().catch(() => undefined)));
  }

  private interrogate(req: DiscoverRequest, identity: string): Promise<DiscoveryResult> {
    const { clocks, log } = this.deps;
    const timeoutMs = this.deps.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
    const boundMs = this.deps.boundMs ?? DISCOVERY_BOUND_MS;
    const started = clocks.monotonic.now();
    return new Promise<DiscoveryResult>((resolve) => {
      let settled = false;
      let opened: OpenedClient | null = null;
      const abort = new AbortController();
      const finish = (result: DiscoveryResult) => {
        if (settled) return;
        settled = true;
        watchdog.cancel();
        this.memo.set(identity, result);
        if (result.failed && !this.warned.has(identity)) {
          this.warned.add(identity);
          log.warn(`mcp ${req.name}: tool discovery failed (${result.detail}); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`);
        }
        resolve(result);
      };
      // The outer bound is independent of the transport: the request returns here whatever the child does.
      const watchdog = clocks.timers.after(boundMs, () => {
        abort.abort();
        finish({ tools: EMPTY, failed: true, detail: `no answer within ${Math.round(boundMs / 1000)} s (REQ-MCP-053's bound)`, elapsedMs: clocks.monotonic.now() - started, memoised: false });
        if (opened) { const o = opened; this.open.delete(o); void o.close(); }
      });
      void (async () => {
        try {
          opened = await openClient({ description: req.description, label: req.name, timers: clocks.timers, monotonic: clocks.monotonic, log, connectTimeoutMs: timeoutMs, signal: abort.signal });
          this.open.add(opened);
          const remaining = millis(Math.max(1_000, timeoutMs - (clocks.monotonic.now() - started)));
          const tools = await listTools(opened.client, remaining, abort.signal);
          const result: DiscoveryResult = { tools, failed: false, detail: '', elapsedMs: clocks.monotonic.now() - started, memoised: false };
          finish(result);
          // REQ-MCP-051: the list is in hand; a teardown error is debug only.
          this.open.delete(opened);
          await opened.close().catch((e: unknown) => { log.debug(`mcp ${req.name}: teardown after discovery failed: ${String(e instanceof Error ? e.message : e)}`); });
        } catch (cause) {
          const detail = String(cause instanceof Error ? cause.message : cause);
          if (opened) { const o: OpenedClient = opened; this.open.delete(o); await o.close().catch(() => undefined); }
          finish({ tools: EMPTY, failed: true, detail, elapsedMs: clocks.monotonic.now() - started, memoised: false });
        }
      })();
    });
  }
}
