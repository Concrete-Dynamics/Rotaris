import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import { listTools, openClient, PROBE_TIMEOUT_MS, type OpenedClient } from './client.js';
import type { McpLog, ProbeOutcome, ServerDescription } from './types.js';

/**
 * ADR-0034's second path: `HealthProbe` — its own connection every call, closed every call, an 8 s budget
 * bounding connect and list together, two outcomes, never raising, touching no cache, running even for a
 * server whose discovery failed (REQ-MCP-054). Probing n times contacts the server n times.
 */
export class HealthProbe {
  /** `clientVersion`: REQ-STARTUP-158's product version, sent as `clientInfo.version` (`OpenOptions.clientVersion`). */
  constructor(private readonly deps: { readonly clocks: Clocks; readonly log: McpLog; readonly budgetMs?: Millis; readonly parentEnv?: Readonly<Record<string, string>>; readonly clientVersion: string }) {}

  probe(name: string, description: ServerDescription): Promise<ProbeOutcome> {
    const { clocks, log } = this.deps;
    const budget = this.deps.budgetMs ?? PROBE_TIMEOUT_MS;
    const started = clocks.monotonic.now();
    return new Promise<ProbeOutcome>((resolve) => {
      let settled = false;
      let opened: OpenedClient | null = null;
      const abort = new AbortController();
      const finish = (o: ProbeOutcome) => { if (!settled) { settled = true; bound.cancel(); resolve(o); } };
      const bound = clocks.timers.after(budget, () => {
        abort.abort();
        finish({ state: 'unreachable', detail: `no answer within ${Math.round(budget / 1000)} s`, elapsedMs: clocks.monotonic.now() - started });
        if (opened) void opened.close();
      });
      void (async () => {
        try {
          opened = await openClient({ parentEnv: this.deps.parentEnv, clientVersion: this.deps.clientVersion, description, label: `probe:${name}`, timers: clocks.timers, monotonic: clocks.monotonic, log, connectTimeoutMs: budget, signal: abort.signal });
          const remaining = millis(Math.max(500, budget - (clocks.monotonic.now() - started)));
          const tools = await listTools(opened.client, remaining, abort.signal);
          finish({ state: 'healthy', toolCount: tools.length, elapsedMs: clocks.monotonic.now() - started });
        } catch (cause) {
          finish({ state: 'unreachable', detail: String(cause instanceof Error ? cause.message : cause), elapsedMs: clocks.monotonic.now() - started });
        } finally {
          if (opened) await opened.close().catch(() => undefined);
        }
      })();
    });
  }
}
