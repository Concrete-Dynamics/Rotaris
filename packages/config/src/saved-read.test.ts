import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSavedConfiguration } from './saved-read.js';

/**
 * REQ-SANDBOX-038 / REQ-SANDBOX-118: the saved configuration, read again and again, answers from what the files say now —
 * a kept answer is returned only while every file the load read is unchanged.
 */
let dir: string;
let opts: { globalDir: string; workspaceRoot: string; env: Record<string, string> };
let agents: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rotaris-saved-'));
  mkdirSync(join(dir, 'config'));
  mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
  mkdirSync(join(dir, 'appdata'));
  opts = { globalDir: join(dir, 'config'), workspaceRoot: join(dir, 'ws'), env: { APPDATA: join(dir, 'appdata') } };
  agents = join(dir, 'ws', '.rotaris', 'agents.yaml');
  writeFileSync(agents, 'runtime:\n  network_egress_policy: deny\n');
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const PAST = 1_700_000_000.123456;
const policyOf = (r: ReturnType<typeof readSavedConfiguration>) => (r.ok ? r.value.runtime.network_egress_policy : `fatal: ${r.error.message}`);

describe('readSavedConfiguration (REQ-SANDBOX-038/118)', () => {
  it('keeps the answer while nothing it read has changed, and leaves the tool servers out', () => {
    const a = readSavedConfiguration(opts);
    const b = readSavedConfiguration(opts);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.value.runtime).toBe(a.value.runtime);
    expect('mcp' in b.value).toBe(false);
    expect('mcpInputs' in b.value).toBe(false);
  });

  it('a saved edit reaches the next read, whether the file changes size, appears, or is a discovery file or its envFile', () => {
    expect(policyOf(readSavedConfiguration(opts))).toBe('deny');
    writeFileSync(agents, 'runtime:\n  network_egress_policy: allow\n');
    expect(policyOf(readSavedConfiguration(opts))).toBe('allow');
    // a file the last load found absent
    writeFileSync(join(dir, 'config', 'agents.yaml'), 'runtime:\n  tool_call_timeout: 9\n');
    const timeout = readSavedConfiguration(opts);
    expect(timeout.ok && timeout.value.runtime.tool_call_timeout).toBe(9);
    // the project's discovery file (REQ-MCP-017) and the envFile it names (REQ-MCP-021)
    writeFileSync(join(dir, 'ws', '.mcp.json'), JSON.stringify({ mcpServers: { probe: { command: 'probe-cmd', envFile: 'probe.env' } } }));
    writeFileSync(join(dir, 'ws', 'probe.env'), 'TOKEN=one\n');
    const envOf = () => { const r = readSavedConfiguration(opts); return r.ok ? ((r.value.merged['mcp_servers'] as Record<string, { env: Record<string, string> }>)['probe']?.env['TOKEN']) : undefined; };
    expect(envOf()).toBe('one');
    writeFileSync(join(dir, 'ws', 'probe.env'), 'TOKEN=two\n');
    expect(envOf()).toBe('two');
  });

  it('a write of the same size is seen by its time; one whose size and time are both restored is not (the fingerprint\'s limit)', () => {
    utimesSync(agents, PAST, PAST);
    expect(policyOf(readSavedConfiguration(opts))).toBe('deny');
    writeFileSync(agents, 'runtime:\n  network_egress_policy: ask \n');
    expect(policyOf(readSavedConfiguration(opts))).toBe('ask');
    utimesSync(agents, PAST, PAST);
    expect(policyOf(readSavedConfiguration(opts))).toBe('ask');
    writeFileSync(agents, 'runtime:\n  network_egress_policy: deny\n');
    utimesSync(agents, PAST, PAST);
    expect(policyOf(readSavedConfiguration(opts))).toBe('ask');
  });

  it('a time with no fraction of a millisecond is never kept', () => {
    utimesSync(agents, 1_700_000_000, 1_700_000_000);
    const a = readSavedConfiguration(opts);
    const b = readSavedConfiguration(opts);
    expect(a.ok && b.ok && b.value.runtime !== a.value.runtime).toBe(true);
  });

  it('a fatal answer is kept like any other, and the repaired file is read (REQ-SANDBOX-032, REQ-CONFIG-478)', () => {
    writeFileSync(agents, 'runtime: [\n');
    const a = readSavedConfiguration(opts);
    expect(a.ok).toBe(false);
    expect(readSavedConfiguration(opts)).toBe(a);
    writeFileSync(agents, 'runtime:\n  network_egress_policy: allow\n');
    expect(policyOf(readSavedConfiguration(opts))).toBe('allow');
  });

  it('another environment is another answer', () => {
    const a = readSavedConfiguration(opts);
    const b = readSavedConfiguration({ ...opts, env: { ...opts.env, EXTRA: '1' } });
    expect(a.ok && b.ok && b.value.runtime !== a.value.runtime).toBe(true);
  });
});
