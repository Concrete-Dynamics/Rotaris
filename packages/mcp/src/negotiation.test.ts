import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VersionNegotiationOptions } from '@modelcontextprotocol/client';
import { millis } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { forgetNegotiatedEras, listTools, openClient } from './client.js';
import type { McpLog, StdioDescription } from './types.js';

/**
 * ADR-0033 consequence 2 / spike-list item 3 — protocol negotiation over OUR transport, taken as the first
 * act of building the client (2026-09-05). Three fixture eras × three modes; per connection the outcome,
 * the negotiated version, the tool count and HOW MANY FIXTURE PROCESSES the connection spawned (the fixture
 * appends its pid to a file per launch). The table is written to `MCP_SPIKE_OUT` when set; the assertions
 * below are the decision: under `'auto'` both eras connect over one process each (REQ-MCP-067 holds without
 * a pin), a 2025-only server under a 2026 pin fails loudly (so a pin would break every existing server),
 * and `'legacy'` cannot reach a server that speaks only the new negotiation.
 */
const FIXTURE = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'apps', 'desktop', 'scripts', 'fixtures', 'mcp-fixture-server.mjs');
const clocks = nodeClocks();
const quiet: McpLog = { info: () => undefined, warn: () => undefined, debug: () => undefined };
const MODES: Record<string, VersionNegotiationOptions> = { legacy: { mode: 'legacy' }, auto: { mode: 'auto' }, pin2026: { mode: { pin: '2026-07-28' } } };
const ERAS = ['2025', '2025-strict', '2026', '2026-only'] as const;

interface Cell { readonly era: string; readonly mode: string; readonly ok: boolean; readonly version: string | undefined; readonly tools: number; readonly processes: number; readonly error: string; readonly elapsedMs: number }

async function connectOnce(era: string, mode: string, dir: string): Promise<Cell> {
  const pidFile = join(dir, `${era}-${mode}.pids`);
  writeFileSync(pidFile, '');
  const description: StdioDescription = { transport: 'stdio', command: process.execPath, args: [FIXTURE, '--era', era, '--pid-file', pidFile], env: { ...process.env as Record<string, string> }, cwd: dir };
  const started = clocks.monotonic.now();
  try {
    const opened = await openClient({ description, label: `${era}/${mode}`, timers: clocks.timers, monotonic: clocks.monotonic, log: quiet, connectTimeoutMs: millis(8_000), negotiation: MODES[mode]! });
    const tools = await listTools(opened.client, millis(5_000));
    const version = opened.negotiatedVersion();
    await opened.close();
    const processes = readFileSync(pidFile, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
    return { era, mode, ok: true, version, tools: tools.length, processes, error: '', elapsedMs: clocks.monotonic.now() - started };
  } catch (cause) {
    const processes = readFileSync(pidFile, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
    return { era, mode, ok: false, version: undefined, tools: 0, processes, error: String(cause instanceof Error ? cause.message : cause).slice(0, 900), elapsedMs: clocks.monotonic.now() - started };
  }
}

describe('the era a server already told us (ADR-0033, first execution against a real third-party server)', () => {
  it('a server that answered the probe with an error is asked once, not once per connection', async () => {
    forgetNegotiatedEras();
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-mcp-era-'));
    const requests = join(dir, 'requests.log');
    writeFileSync(requests, '');
    const description: StdioDescription = { transport: 'stdio', command: process.execPath, args: [FIXTURE, '--era', '2025', '--request-file', requests], env: { ...process.env as Record<string, string> }, cwd: dir };
    const methods = () => readFileSync(requests, 'utf8').split('\n').filter((l) => l.trim() !== '');
    for (const label of ['discovery', 'session', 'probe']) {
      // No `negotiation`: exactly what ToolDiscovery, SessionConnections and HealthProbe pass.
      const opened = await openClient({ description, label, timers: clocks.timers, monotonic: clocks.monotonic, log: quiet, connectTimeoutMs: millis(8_000) });
      expect(opened.negotiatedVersion()).toBe('2025-11-25');
      await opened.close();
    }
    expect(methods().filter((m) => m === 'server/discover')).toHaveLength(1);
    expect(methods().filter((m) => m === 'initialize')).toHaveLength(3);
    // A caller that asks for a mode still gets it; the memory is a default, not an override.
    const pinned = openClient({ description, label: 'pinned', timers: clocks.timers, monotonic: clocks.monotonic, log: quiet, connectTimeoutMs: millis(8_000), negotiation: { mode: { pin: '2026-07-28' } } });
    await expect(pinned).rejects.toThrow();
    expect(methods().filter((m) => m === 'server/discover')).toHaveLength(2);
    forgetNegotiatedEras();
  }, 30_000);
});

describe('spike 3 — negotiation over OwnedStdioTransport (ADR-0033 c.2, ESC-12)', () => {
  it('measures three eras under three modes and decides the mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-mcp-negotiation-'));
    const cells: Cell[] = [];
    for (const era of ERAS) for (const mode of Object.keys(MODES)) cells.push(await connectOnce(era, mode, dir));
    const out = process.env['MCP_SPIKE_OUT'];
    if (out) writeFileSync(out, `${JSON.stringify(cells, null, 2)}\n`);
    const cell = (era: string, mode: string) => cells.find((c) => c.era === era && c.mode === mode)!;
    // One process per connection under every mode over our transport: no sibling probe is spawned. The one exception is
    // measured, not assumed: a strict 2025 server exits on the in-place probe and is launched a second time, sequentially,
    // under the legacy handshake (`openClient`'s fallback) — two launches, never two processes at once.
    for (const c of cells) expect(c.processes, `${c.era}/${c.mode} spawned ${c.processes} processes`).toBeLessThanOrEqual(c.era === '2025-strict' && c.mode === 'auto' ? 2 : 1);
    expect(cell('2025-strict', 'auto').ok).toBe(true);
    expect(cell('2025-strict', 'auto').processes).toBe(2);
    expect(cell('2025-strict', 'legacy').ok).toBe(true);
    expect(cell('2025-strict', 'pin2026').ok).toBe(false);
    // 'auto': both eras connect on one process each; the 2025 server falls back to initialize, the 2026 server takes the modern era.
    expect(cell('2025', 'auto').ok).toBe(true);
    expect(cell('2025', 'auto').version).toBe('2025-11-25');
    expect(cell('2026', 'auto').ok).toBe(true);
    expect(cell('2026', 'auto').version).toBe('2026-07-28');
    expect(cell('2026-only', 'auto').ok).toBe(true);
    // 'legacy' reaches a 2025 server and a 2026 server that kept the old handshake, never a 2026-only one.
    expect(cell('2025', 'legacy').ok).toBe(true);
    expect(cell('2026', 'legacy').ok).toBe(true);
    expect(cell('2026-only', 'legacy').ok).toBe(false);
    // A 2026 pin breaks every 2025-era server (ESC-12 option (c)'s cost, measured).
    expect(cell('2025', 'pin2026').ok).toBe(false);
    expect(cell('2026', 'pin2026').ok).toBe(true);
    for (const c of cells) expect(c.ok ? c.tools : 0, `${c.era}/${c.mode}`).toBe(c.ok ? 5 : 0);
  }, 60_000);
});
