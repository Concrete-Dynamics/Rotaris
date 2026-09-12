import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { millis } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { ToolDiscovery } from './discovery.js';
import { HealthProbe } from './probe.js';
import { ConnectionsClosed, SessionConnections } from './sessions.js';
import { OwnedStdioTransport } from './transport.js';
import type { McpLog, StdioDescription } from './types.js';

/** The three connection paths of ADR-0034 and ADR-0033's transport, against the hand-written fixture server. */
const FIXTURE = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'apps', 'desktop', 'scripts', 'fixtures', 'mcp-fixture-server.mjs');
const clocks = nodeClocks();
const dir = mkdtempSync(join(tmpdir(), 'rotaris-mcp-'));
const lines: string[] = [];
const log: McpLog = { info: (m) => lines.push(`I ${m}`), warn: (m) => lines.push(`W ${m}`), debug: (m) => lines.push(`D ${m}`) };
const env = { ...process.env as Record<string, string> };
const fixture = (...extra: string[]): StdioDescription => ({ transport: 'stdio', command: process.execPath, args: [FIXTURE, ...extra], env, cwd: dir });
const pidLines = (file: string) => readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '');
/**
 * Wait FOR a condition under a deadline, rather than sampling once at an appointment. Spawning a
 * second Node process costs whatever the machine has left: under full-suite parallelism the same
 * work that takes tens of milliseconds alone can take an order of magnitude longer, so a fixed
 * sleep asserts the machine's load, not the mechanism. Returns the milliseconds waited, or `null`
 * when the bound passed without the condition holding — so the assertion that follows fails for
 * its own reason and says how long it gave.
 *
 * Measured 2026-09-12 for the stderr line below, which a fixed 400 ms sleep used to wait out: 61,
 * 68 and 93 ms with this file alone, 239 ms under the full suite, 446 and 472 ms under the suite
 * plus eight busy cores — past the old bound, which is where that red came from.
 */
const until = async (hit: () => boolean, boundMs = 10_000): Promise<number | null> => {
  const started = clocks.monotonic.now();
  for (;;) {
    const waited = clocks.monotonic.now() - started;
    if (hit()) return waited;
    if (waited >= boundMs) return null;
    await new Promise((r) => clocks.timers.after(millis(25), () => r(undefined)));
  }
};
const registries: SessionConnections[] = [];
afterAll(async () => { for (const r of registries) await r.closeAll(); });

describe('ToolDiscovery (REQ-MCP-046/047/048/051/052/053)', () => {
  it('interrogates once per identity, memoises per process, and a reload interrogates afresh', async () => {
    const pids = join(dir, 'disc.pids');
    writeFileSync(pids, '');
    const d = new ToolDiscovery({ clocks, log });
    const req = { name: 'alpha', description: fixture('--pid-file', pids), workspaceRoot: dir };
    const first = await d.discover(req);
    expect(first.failed).toBe(false);
    expect(first.tools.map((t) => t.name)).toEqual(['echo', 'slow', 'fail', 'lsp_init', 'extra']);
    expect(first.memoised).toBe(false);
    const again = await d.discover(req);
    expect(again.memoised).toBe(true);
    expect(pidLines(pids)).toHaveLength(1);
    // A differing ninth value (the workspace root) is a different identity.
    await d.discover({ ...req, workspaceRoot: join(dir, 'other') });
    expect(pidLines(pids)).toHaveLength(2);
    d.invalidate();
    await d.discover(req);
    expect(pidLines(pids)).toHaveLength(3);
  });
  it('never raises: a command that cannot start is the empty list, one warning per identity, the failure remembered', async () => {
    const d = new ToolDiscovery({ clocks, log });
    const req = { name: 'ghost', description: { ...fixture(), command: join(dir, 'no-such-server.exe') }, workspaceRoot: dir };
    const before = lines.filter((l) => l.startsWith('W mcp ghost')).length;
    const r = await d.discover(req);
    expect(r.failed).toBe(true);
    expect(r.tools).toEqual([]);
    await d.discover(req);
    expect(lines.filter((l) => l.startsWith('W mcp ghost')).length - before).toBe(1);
    expect(d.failedFor(req)).toBe(true);
  });
  it('returns the empty list at the outer bound when the server never answers initialize (REQ-MCP-053)', async () => {
    const d = new ToolDiscovery({ clocks, log, timeoutMs: millis(2_000), boundMs: millis(2_500) });
    const started = clocks.monotonic.now();
    const r = await d.discover({ name: 'mute', description: fixture('--never-init'), workspaceRoot: dir });
    const took = clocks.monotonic.now() - started;
    expect(r.failed).toBe(true);
    expect(took).toBeLessThan(3_500);
    await d.closeAll();
  });
  it('drops entries with an empty or non-string name (REQ-MCP-052) — the fixture reports none, so the count is exact', async () => {
    const d = new ToolDiscovery({ clocks, log });
    const r = await d.discover({ name: 'alpha', description: fixture(), workspaceRoot: join(dir, 'x') });
    expect(r.tools.every((t) => typeof t.name === 'string' && t.name !== '' && typeof t.description === 'string')).toBe(true);
    expect(r.tools.find((t) => t.name === 'fail')!.description).toBe('');
  });
});

describe('HealthProbe (REQ-MCP-054)', () => {
  it('contacts the server every time and touches no cache', async () => {
    const pids = join(dir, 'probe.pids');
    writeFileSync(pids, '');
    const p = new HealthProbe({ clocks, log });
    const one = await p.probe('alpha', fixture('--pid-file', pids));
    const two = await p.probe('alpha', fixture('--pid-file', pids));
    expect(one.state).toBe('healthy');
    expect(two.state).toBe('healthy');
    if (one.state === 'healthy') expect(one.toolCount).toBe(5);
    expect(pidLines(pids)).toHaveLength(2);
  });
  it('is unreachable with detail for a missing command and within its budget for a mute server', async () => {
    const p = new HealthProbe({ clocks, log, budgetMs: millis(1_500) });
    const missing = await p.probe('ghost', { ...fixture(), command: join(dir, 'nope.exe') });
    expect(missing.state).toBe('unreachable');
    const started = clocks.monotonic.now();
    const mute = await p.probe('mute', fixture('--never-init'));
    expect(mute.state).toBe('unreachable');
    expect(clocks.monotonic.now() - started).toBeLessThan(2_500);
  });
});

describe('SessionConnections (REQ-MCP-066/067/068/069/070)', () => {
  it('two concurrent first demands share one connection and one process; three interleaved calls each get their own answer', async () => {
    const pids = join(dir, 'sess.pids');
    writeFileSync(pids, '');
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const desc = fixture('--pid-file', pids);
    const [a, b] = await Promise.all([s.connect('alpha', desc), s.connect('alpha', desc)]);
    expect(a).toBe(b);
    expect(pidLines(pids)).toHaveLength(1);
    const [x, y, z] = await Promise.all([
      s.call('alpha', desc, 'slow', { ms: 300 }, millis(5_000)),
      s.call('alpha', desc, 'echo', { text: 'second' }, millis(5_000)),
      s.call('alpha', desc, 'echo', { text: 'third' }, millis(5_000)),
    ]);
    expect(x.text).toBe('slept 300');
    expect(y.text).toBe('second');
    expect(z.text).toBe('third');
    expect(pidLines(pids)).toHaveLength(1);
  });
  it('an exhausted allowance fails the call, leaves the connection open, and a later call succeeds (REQ-MCP-003)', async () => {
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const desc = fixture();
    await expect(s.call('alpha', desc, 'slow', { ms: 2_000 }, millis(300))).rejects.toThrow();
    const c = await s.connect('alpha', desc);
    expect(c.pid()).not.toBeNull();
    const ok = await s.call('alpha', desc, 'echo', { text: 'still here' }, millis(5_000));
    expect(ok.text).toBe('still here');
  });
  it('a crash after connect fails the call in flight, warns once, and the next call re-establishes (REQ-MCP-069)', async () => {
    const pids = join(dir, 'crash.pids');
    writeFileSync(pids, '');
    const warned: string[] = [];
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: (n, d) => warned.push(`${n}: ${d}`) });
    registries.push(s);
    const desc = fixture('--crash-after', '50', '--pid-file', pids);
    await expect(s.call('alpha', desc, 'slow', { ms: 1_000 }, millis(5_000))).rejects.toThrow();
    expect(warned).toHaveLength(1);
    const again = await s.call('alpha', desc, 'echo', { text: 'back' }, millis(5_000));
    expect(again.text).toBe('back');
    expect(pidLines(pids)).toHaveLength(2);
  });
  it('a changed list is re-read and announced (REQ-MCP-060)', async () => {
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const c = await s.connect('alpha', fixture('--rename-after', '100'));
    const seen = await new Promise<readonly string[]>((resolve) => { c.onToolsChanged((tools) => resolve(tools.map((t) => t.name))); });
    expect(c.connectTimeTools.map((t) => t.name)).toContain('extra');
    expect(seen).toContain('newcomer');
    expect(seen).not.toContain('extra');
  });
  it('the lsp name runs lsp_init with the root before its tools are offered (REQ-MCP-070)', async () => {
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const c = await s.connect('lsp', fixture());
    expect(c.hook).toEqual({ kind: 'lsp_init', outcome: 'ok', detail: '' });
    const other = await s.connect('beta', fixture());
    expect(other.hook.kind).toBe('none');
  });
  it('closeAll is idempotent, leaves no process, and a later request fails naming the server', async () => {
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined });
    const c = await s.connect('alpha', fixture());
    const pid = c.pid();
    expect(pid).not.toBeNull();
    await s.closeAll();
    await s.closeAll();
    expect(c.pid()).toBeNull();
    await expect(s.connect('alpha', fixture())).rejects.toBeInstanceOf(ConnectionsClosed);
    await expect(s.connect('alpha', fixture())).rejects.toThrow(/alpha/);
  });
});

describe('OwnedStdioTransport (ADR-0033, ADR-0007)', () => {
  it("captures the child's stderr to the log after redaction", async () => {
    const t = new OwnedStdioTransport({ command: process.execPath, args: [FIXTURE, '--stderr', 'token=ghp_abcdefghijklmnop'], cwd: dir, env, timers: clocks.timers, log, label: 'noisy' });
    await t.start();
    const waited = await until(() => lines.some((l) => l.includes('noisy stderr')));
    await t.close();
    expect(waited, 'the child wrote nothing to the log within the bound').not.toBeNull();
    const line = lines.find((l) => l.includes('noisy stderr'));
    expect(line).toBeDefined();
    expect(line).not.toContain('ghp_abcdefghijklmnop');
    expect(line).toContain('***');
  });
  it('a .cmd runner on PATH starts through cmd.exe with its arguments intact (REQ-MCP-113 on Windows)', async () => {
    if (process.platform !== 'win32') return;
    // A batch runner like npx.cmd: it forwards its arguments to node.
    writeFileSync(join(dir, 'runner.cmd'), `@echo off\r\n"${process.execPath}" %*\r\n`);
    // The description's map is EMPTY (REQ-MCP-043's `env` holds the server's own entries only); PATH and the rest reach
    // the child through the parent environment the run host supplies (OQ-22's reading; the merge of Parts R and S found
    // the child spawned with the map alone, so `npx` never had a PATH).
    const withPath = { ...env, PATH: `${dir};${env['PATH'] ?? ''}` };
    const s = new SessionConnections({ clocks, log, workspaceRoot: dir, unreachable: () => undefined, parentEnv: withPath });
    registries.push(s);
    const c = await s.connect('runner', { transport: 'stdio', command: 'runner', args: [FIXTURE, '--stderr', 'via cmd'], env: {}, cwd: dir });
    expect(c.tools().map((t) => t.name)).toContain('echo');
    const r = await s.call('runner', { transport: 'stdio', command: 'runner', args: [FIXTURE], env: {}, cwd: dir }, 'echo', { text: 'through cmd.exe' }, millis(5_000));
    expect(r.text).toBe('through cmd.exe');
  });
  it('a command that does not exist rejects start with the OS error (REQ-MCP-107 case 1)', async () => {
    const t = new OwnedStdioTransport({ command: join(dir, 'missing.exe'), args: [], cwd: dir, env, timers: clocks.timers, log, label: 'missing' });
    await expect(t.start()).rejects.toThrow(/ENOENT/);
  });
});
