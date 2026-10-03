/**
 * The live run's per-launch statement of whether code-intelligence discovery succeeded (finding U5 of the duress live run at
 * 1763f7f: the tree had no bundle and the run passed without a line saying code intelligence never ran). The failure lines
 * are that pack's own (`sign-in/app.log:22`, `duress/app.log:37-42`), the instants shortened.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeIntelligenceDiscovered, codeIntelligenceDiscovery, codeIntelligenceStatement, discoveryFailed } from './code-intelligence-discovery.mjs';

const info = '[main 2026-10-03T06:16:07.855Z] info    run host: ';
const warning = '[main 2026-10-03T06:16:07.854Z] warning run host: ';
const ws = '/tmp/rotaris-live-run/2026-10-03T06-15-52-273Z/workspace';

describe('whether a launch\'s code-intelligence discovery succeeded (U5)', () => {
  it('reads a discovery that listed its tools as listed, naming the count, the time and the project', () => {
    expect(codeIntelligenceDiscovery(`${info}mcp: discovery of 'code_intelligence' (project ${ws}) listed 22 tool(s) in 1968 ms`))
      .toEqual({ outcome: 'listed', detail: `listed 22 tool(s) in 1968 ms (project ${ws})` });
  });

  it('reads the duress pack at 1763f7f as failed — its run-host line and its warning alike', () => {
    const before = [
      `${warning}mcp code_intelligence: tool discovery failed (Connection closed (code_intelligence exited with code 127; stderr: the bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory`,
      `${warning}rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle))); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`,
      `${info}mcp: discovery of 'code_intelligence' failed (Connection closed (code_intelligence exited with code 127; stderr: the bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory`,
    ].join('\n');
    const read = codeIntelligenceDiscovery(before);
    expect(read.outcome).toBe('failed');
    expect(read.detail).toMatch(/^failed: Connection closed \(code_intelligence exited with code 127/);
    // One failure, named once: the run host's restatement of the old packs is read only where no warning is.
    expect(read.detail.split(' | ').filter((part) => part.startsWith('failed'))).toHaveLength(1);
  });

  it('still reads an old pack\'s run-host line where its warning is absent', () => {
    const read = codeIntelligenceDiscovery(`${info}mcp: discovery of 'code_intelligence' (project ${ws}) failed (spawn ENOENT) in 12 ms`);
    expect(read).toEqual({ outcome: 'failed', detail: `failed (project ${ws}): spawn ENOENT) in 12 ms` });
  });

  it('reads the one-line warning of 2026-10-03 as failed, with its time and project', () => {
    const read = codeIntelligenceDiscovery(`${warning}mcp code_intelligence (project ${ws}): tool discovery failed in 973 ms (Connection closed (code_intelligence exited with code 127; stderr: a | b)); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`);
    expect(read.outcome).toBe('failed');
    expect(read.detail).toContain(`failed in 973 ms (project ${ws}): Connection closed`);
  });

  it('a failure anywhere in the launch fails it, though another root\'s discovery listed its tools', () => {
    const log = [
      `${info}mcp: discovery of 'code_intelligence' (project ${ws}) listed 22 tool(s) in 1968 ms`,
      `${warning}mcp code_intelligence (project ${ws}/.rotaris/requirements/worktrees/u1): tool discovery failed in 35001 ms (no answer within 35 s (REQ-MCP-053's bound)); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`,
    ].join('\n');
    expect(codeIntelligenceDiscovery(log).outcome).toBe('failed');
  });

  it('a launch that started no run is absent; with the setup\'s own failure in its log, setup-failed (sign-in at 1763f7f)', () => {
    expect(codeIntelligenceDiscovery(`${info}session list: 0 sessions`)).toEqual({ outcome: 'absent', detail: 'no run started a discovery in this launch' });
    const signIn = `${info}mcp setup: create failed — exited with code 127; its last output: rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle) (258 ms)\n${info}mcp setup: failed — A step failed, so the workspace is only partly set up.`;
    const read = codeIntelligenceDiscovery(signIn);
    expect(read.outcome).toBe('setup-failed');
    expect(read.detail).toMatch(/^no discovery ran in this launch, and setup step create failed — exited with code 127/);
  });

  it('a discovery of another server is not code intelligence\'s', () => {
    expect(codeIntelligenceDiscovery(`${info}mcp: discovery of 'web_search' listed 1 tool(s) in 3 ms`).outcome).toBe('absent');
  });
});

describe('the per-launch statement live-run prints (U5)', () => {
  it('a launch whose every discovery listed tools passes', () => {
    expect(codeIntelligenceStatement('duress', `${info}mcp: discovery of 'code_intelligence' (project ${ws}) listed 22 tool(s) in 1968 ms`))
      .toMatchObject({ verdict: 'pass', label: 'duress: code-intelligence discovery succeeded', detail: `listed 22 tool(s) in 1968 ms (project ${ws})` });
  });

  it('a failed discovery fails it', () => {
    expect(codeIntelligenceStatement('duress', `${warning}mcp code_intelligence (project ${ws}): tool discovery failed in 973 ms (spawn ENOENT); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`))
      .toMatchObject({ verdict: 'fail', label: 'duress: code-intelligence discovery succeeded' });
  });

  it('a discovery that listed no tool fails it: code intelligence offered nothing', () => {
    const statement = codeIntelligenceStatement('default', `${info}mcp: discovery of 'code_intelligence' (project ${ws}) listed 0 tool(s) in 5 ms`);
    expect(statement).toMatchObject({ verdict: 'fail', label: 'default: code-intelligence discovery succeeded', detail: `listed 0 tool(s) in 5 ms (project ${ws})` });
    expect(statement.reading.outcome).toBe('empty');
  });

  it('a launch that started no run is a note, naming a failed setup step where one failed', () => {
    expect(codeIntelligenceStatement('sign-in', `${info}session list: 0 sessions`))
      .toMatchObject({ verdict: 'note', label: 'sign-in: code-intelligence discovery did not run in this launch', detail: 'no run started a discovery in this launch' });
    const setup = codeIntelligenceStatement('sign-in', `${info}mcp setup: create failed — exited with code 127; its last output: rotaris: the bundled code-intelligence runtime is not present`);
    expect(setup.verdict).toBe('fail');
    expect(setup.reading.outcome).toBe('setup-failed');
  });

  it('live-run\'s launch prints the statement this module makes', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const body = text.slice(text.indexOf('async function launch('), text.indexOf('/** The store as the run left it'));
    expect(body).toMatch(/codeIntelligenceStatement\(name, log\)/);
  });
});

/*
 * The repair round of 2026-10-03: U4 removed the run host's "mcp: discovery of '<name>' … failed (…)" line, and two
 * readers still matched only it — plan-gate-proof's guard that its fixture turned code intelligence off, and the console
 * spike's read of its `token` server's failure. Both now read the failure through this module.
 */
describe('every reader of a failed discovery reads its one form since 2026-10-03 (U4)', () => {
  const warned = (name: string) => `${warning}mcp ${name} (project ${ws}): tool discovery failed in 12 ms (spawn ENOENT); the persona prompt will list this server with no tool details attached (REQ-MCP-048)`;

  it('discoveryFailed reads one server\'s failure in the warning and in the old run-host line, and no other server\'s', () => {
    expect(discoveryFailed('token').test(warned('token'))).toBe(true);
    expect(discoveryFailed('token').test(`${warning}mcp token: tool discovery failed in 3 ms (spawn ENOENT); the persona prompt …`)).toBe(true);
    expect(discoveryFailed('token').test(`${info}mcp: discovery of 'token' failed (spawn ENOENT) in 3 ms`)).toBe(true);
    expect(discoveryFailed('token').test(warned('console'))).toBe(false);
    expect(discoveryFailed('token').test(`${info}mcp: discovery of 'token' listed 1 tool(s) in 3 ms`)).toBe(false);
  });

  it('codeIntelligenceDiscovered sees a failed discovery in its one warning, and a setup step is not a discovery', () => {
    expect(codeIntelligenceDiscovered(warned('code_intelligence'))).toBe(true);
    expect(codeIntelligenceDiscovered(`${info}mcp: discovery of 'code_intelligence' failed (spawn ENOENT) in 12 ms`)).toBe(true);
    expect(codeIntelligenceDiscovered(`${info}mcp: discovery of 'code_intelligence' listed 22 tool(s) in 1968 ms`)).toBe(true);
    expect(codeIntelligenceDiscovered(`${info}mcp setup: create failed — exited with code 127; its last output: …`)).toBe(false);
    expect(codeIntelligenceDiscovered(`${info}session list: 0 sessions`)).toBe(false);
  });

  it('no script outside this module matches a named server\'s discovery by the removed line alone', () => {
    const scripts = resolve(import.meta.dirname, '..');
    const stale: string[] = [];
    for (const file of readdirSync(scripts).filter((f) => f.endsWith('.mjs'))) {
      readFileSync(join(scripts, file), 'utf8').split('\n').forEach((line, at) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        // A named server's "discovery of '<name>'" read for anything but a listing is the removed failure line.
        if (/discovery of '[a-z_]+'(?! listed)/.test(code)) stale.push(`${file}:${at + 1}: ${code}`);
      });
    }
    expect(stale).toEqual([]);
  });
});
