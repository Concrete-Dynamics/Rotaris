import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
/** What a composition root hands down as the product version (REQ-STARTUP-158); distinctive, so a literal cannot pass for it. */
const clientVersion = '9.8.7rc6';
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
// The suite's scratch directory goes with it (docs/defects/fixed/unit-tests-leave-their-temporary-directories-behind.md).
afterAll(async () => { for (const r of registries) await r.closeAll(); rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); });

describe('ToolDiscovery (REQ-MCP-046/047/048/051/052/053)', () => {
  it('interrogates once per identity, memoises per process, and a reload interrogates afresh', async () => {
    const pids = join(dir, 'disc.pids');
    writeFileSync(pids, '');
    const d = new ToolDiscovery({ clocks, log, clientVersion });
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
    const d = new ToolDiscovery({ clocks, log, clientVersion });
    const req = { name: 'ghost', description: { ...fixture(), command: join(dir, 'no-such-server.exe') }, workspaceRoot: dir };
    const before = lines.filter((l) => l.startsWith('W mcp ghost')).length;
    const r = await d.discover(req);
    expect(r.failed).toBe(true);
    expect(r.tools).toEqual([]);
    await d.discover(req);
    expect(lines.filter((l) => l.startsWith('W mcp ghost')).length - before).toBe(1);
    expect(d.failedFor(req)).toBe(true);
  });
  // Live-run finding U4 (duress at 1763f7f): the failure was said twice, by this warning and by the run host, and the child's
  // two stderr lines broke each record into three physical lines of the application log.
  it('warns a failure once, on one line that keeps the child\'s whole standard error and the time it took (REQ-MCP-048, U4)', async () => {
    const d = new ToolDiscovery({ clocks, log, clientVersion });
    const exits = { transport: 'stdio' as const, command: process.execPath, args: ['-e', "process.stderr.write('first stderr line\\nsecond stderr line\\n'); process.exit(3)"], env, cwd: dir };
    const before = lines.length;
    const r = await d.discover({ name: 'exits', description: exits, workspaceRoot: join(dir, 'exits') });
    expect(r.failed).toBe(true);
    const warned = lines.slice(before).filter((l) => l.startsWith('W mcp exits'));
    expect(warned).toHaveLength(1);
    expect(warned[0]).not.toMatch(/[\r\n]/);
    expect(warned[0]).toMatch(/^W mcp exits: tool discovery failed in \d+ ms \(.*first stderr line \| second stderr line.*\); the persona prompt will list this server with no tool details attached \(REQ-MCP-048\)$/);
    // The run host names the launch's project (REQ-MCP-034) through `context`, now that its own failure line is gone.
    const named = await d.discover({ name: 'exits', description: exits, workspaceRoot: join(dir, 'exits-2'), context: 'project /p' });
    expect(named.failed).toBe(true);
    expect(lines.slice(before).filter((l) => l.startsWith('W mcp exits (project /p): tool discovery failed in '))).toHaveLength(1);
  });
  it('returns the empty list at the outer bound when the server never answers initialize (REQ-MCP-053)', async () => {
    const d = new ToolDiscovery({ clocks, log, clientVersion, timeoutMs: millis(2_000), boundMs: millis(2_500) });
    const started = clocks.monotonic.now();
    const r = await d.discover({ name: 'mute', description: fixture('--never-init'), workspaceRoot: dir });
    const took = clocks.monotonic.now() - started;
    expect(r.failed).toBe(true);
    expect(took).toBeLessThan(3_500);
    await d.closeAll();
  });
  it('drops entries with an empty or non-string name (REQ-MCP-052) — the fixture reports none, so the count is exact', async () => {
    const d = new ToolDiscovery({ clocks, log, clientVersion });
    const r = await d.discover({ name: 'alpha', description: fixture(), workspaceRoot: join(dir, 'x') });
    expect(r.tools.every((t) => typeof t.name === 'string' && t.name !== '' && typeof t.description === 'string')).toBe(true);
    expect(r.tools.find((t) => t.name === 'fail')!.description).toBe('');
  });
});

describe('HealthProbe (REQ-MCP-054)', () => {
  it('contacts the server every time and touches no cache', async () => {
    const pids = join(dir, 'probe.pids');
    writeFileSync(pids, '');
    const p = new HealthProbe({ clocks, log, clientVersion });
    const one = await p.probe('alpha', fixture('--pid-file', pids));
    const two = await p.probe('alpha', fixture('--pid-file', pids));
    expect(one.state).toBe('healthy');
    expect(two.state).toBe('healthy');
    if (one.state === 'healthy') expect(one.toolCount).toBe(5);
    expect(pidLines(pids)).toHaveLength(2);
  });
  it('is unreachable with detail for a missing command and within its budget for a mute server', async () => {
    const p = new HealthProbe({ clocks, log, clientVersion, budgetMs: millis(1_500) });
    const missing = await p.probe('ghost', { ...fixture(), command: join(dir, 'nope.exe') });
    expect(missing.state).toBe('unreachable');
    const started = clocks.monotonic.now();
    const mute = await p.probe('mute', fixture('--never-init'));
    expect(mute.state).toBe('unreachable');
    expect(clocks.monotonic.now() - started).toBeLessThan(2_500);
  });
});

describe('who the client says it is — REQ-STARTUP-158', () => {
  it('every path tells the server the product version it was handed, under the product\'s name', async () => {
    const clients = join(dir, 'clients.jsonl');
    writeFileSync(clients, '');
    const desc = fixture('--client-file', clients);
    await new ToolDiscovery({ clocks, log, clientVersion }).discover({ name: 'who', description: desc, workspaceRoot: join(dir, 'who') });
    expect((await new HealthProbe({ clocks, log, clientVersion }).probe('who', desc)).state).toBe('healthy');
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    await s.connect('who', desc);
    const told = readFileSync(clients, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as unknown);
    expect(told).toEqual([0, 1, 2].map(() => ({ name: 'rotaris', version: '9.8.7rc6' })));
  });
});

describe('SessionConnections (REQ-MCP-066/067/068/069/070)', () => {
  it('REQ-MCP-034 (live-run finding D1): the connected line carries the launch note read from the description it launched, and nothing when there is none', async () => {
    const seen: string[] = [];
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined, launchNote: (server, d) => { seen.push(`${server} ${d.transport === 'stdio' ? d.args.at(-1) ?? '' : ''}`); return 'project /the/tree'; } });
    registries.push(s);
    await s.connect('noted', fixture('--tag', 'noted'));
    expect(seen).toEqual(['noted noted']);
    expect(lines.some((l) => /^I mcp noted: connected for the session \(pid \d+, protocol \S+, \d+ tool\(s\), hook none:skipped, project \/the\/tree\) in \d+ ms$/.test(l))).toBe(true);
    const bare = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(bare);
    await bare.connect('bare', fixture());
    expect(lines.some((l) => /^I mcp bare: connected for the session \(pid \d+, protocol \S+, \d+ tool\(s\), hook none:skipped\) in \d+ ms$/.test(l))).toBe(true);
  });
  it('two concurrent first demands share one connection and one process; three interleaved calls each get their own answer', async () => {
    const pids = join(dir, 'sess.pids');
    writeFileSync(pids, '');
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
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
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
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
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: (n, d) => warned.push(`${n}: ${d}`) });
    registries.push(s);
    const desc = fixture('--crash-after', '50', '--pid-file', pids);
    await expect(s.call('alpha', desc, 'slow', { ms: 1_000 }, millis(5_000))).rejects.toThrow();
    expect(warned).toHaveLength(1);
    const again = await s.call('alpha', desc, 'echo', { text: 'back' }, millis(5_000));
    expect(again.text).toBe('back');
    expect(pidLines(pids)).toHaveLength(2);
  });
  it('a changed list is re-read and announced (REQ-MCP-060)', async () => {
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const c = await s.connect('alpha', fixture('--rename-after', '100'));
    const seen = await new Promise<readonly string[]>((resolve) => { c.onToolsChanged((tools) => resolve(tools.map((t) => t.name))); });
    expect(c.connectTimeTools.map((t) => t.name)).toContain('extra');
    expect(seen).toContain('newcomer');
    expect(seen).not.toContain('extra');
  });
  it('the lsp name runs lsp_init with the root before its tools are offered (REQ-MCP-070)', async () => {
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const c = await s.connect('lsp', fixture());
    expect(c.hook).toEqual({ kind: 'lsp_init', outcome: 'ok', detail: `root ${dir}` });
    const other = await s.connect('beta', fixture());
    expect(other.hook.kind).toBe('none');
  });
  it('PD-MCP-002: lsp_init names the root the demanding run executes in — an isolated run\'s tree (REQ-MCP-070, OQ-194)', async () => {
    const tree = join(dir, '.rotaris', 'worktrees', 'unit-1');
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
    registries.push(s);
    const c = await s.connect('lsp', fixture(), tree);
    expect(c.hook).toEqual({ kind: 'lsp_init', outcome: 'ok', detail: `root ${tree}` });
    // The connection is the session's: a later demand reuses it, whatever root it names.
    expect(await s.connect('lsp', fixture(), dir)).toBe(c);
  });
  it('closeAll is idempotent, leaves no process, and a later request fails naming the server', async () => {
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined });
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
    // At DEBUG: the child's diagnostics are its own, and a real server writes them by the dozen per connection.
    expect(line!.startsWith('D ')).toBe(true);
  });
  it('collapses consecutive repeated stderr lines and truncates long ones; the tail keeps everything', async () => {
    // The run of 2026-09-18: the same validation block repeated once per connection attempt.
    const before = lines.length;
    const t = new OwnedStdioTransport({ command: process.execPath, args: [FIXTURE, '--stderr-repeat', 'same-line', '--stderr-count', '5'], cwd: dir, env, timers: clocks.timers, log, label: 'repeater' });
    await t.start();
    // Wait for ALL five lines to reach the tail before closing: the burst can arrive in several
    // chunks, and closing after only the first log line strands the rest behind the close flush.
    // The tail keeps every line (REQ-MCP-107) while the log collapses them, so the tail is the gate.
    const waited = await until(() => (t.detail.match(/same-line/g) ?? []).length >= 5);
    expect(waited, 'the child wrote nothing to the log within the bound').not.toBeNull();
    await t.close();
    const fresh = lines.slice(before);
    // The launch line carries the fixture ARGS (`--stderr-repeat same-line`), so the filter must
    // match the stderr line's shape, not the bare text — else the launch counts as a second occurrence.
    expect(fresh.filter((l) => l.includes('stderr: same-line'))).toHaveLength(1);
    expect(fresh.some((l) => l.includes('repeated 4 more times'))).toBe(true);
    expect(t.detail).toContain('same-line');
  });
  it('a .cmd runner on PATH starts through cmd.exe with its arguments intact (REQ-MCP-113 on Windows)', async () => {
    if (process.platform !== 'win32') return;
    // A batch runner like npx.cmd: it forwards its arguments to node.
    writeFileSync(join(dir, 'runner.cmd'), `@echo off\r\n"${process.execPath}" %*\r\n`);
    // The description's map is EMPTY (REQ-MCP-043's `env` holds the server's own entries only); PATH and the rest reach
    // the child through the parent environment the run host supplies (OQ-22's reading, confirmed 2026-10-06 by R-071; the merge of Parts R and S found
    // the child spawned with the map alone, so `npx` never had a PATH).
    const withPath = { ...env, PATH: `${dir};${env['PATH'] ?? ''}` };
    const s = new SessionConnections({ clocks, log, clientVersion, workspaceRoot: dir, unreachable: () => undefined, parentEnv: withPath });
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
