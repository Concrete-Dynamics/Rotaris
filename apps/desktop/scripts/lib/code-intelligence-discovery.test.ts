/**
 * The live run's per-launch statement of whether code-intelligence discovery succeeded (finding U5 of the duress live run at
 * 1763f7f: the tree had no bundle and the run passed without a line saying code intelligence never ran). The failure lines
 * are that pack's own (`sign-in/app.log:22`, `duress/app.log:37-42`), the instants shortened.
 */
import { describe, expect, it } from 'vitest';
import { codeIntelligenceDiscovery } from './code-intelligence-discovery.mjs';

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
