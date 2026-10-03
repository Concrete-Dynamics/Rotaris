/**
 * The live run's requirements check reads the code-intelligence binding the run launched with, and requires the
 * worktree's root (finding D1 of the default live run at 1763f7f; REQ-MCP-034's isolated-run clause). The first case is
 * that run's own lines, which passed the old check on the session's worktree record alone.
 */
import { describe, expect, it } from 'vitest';
import { bindingVerdict, codeIntelligenceLaunches } from './code-intelligence-binding.mjs';

const ws = '/tmp/rotaris-live-run/2026-10-03T05-56-27-364Z/workspace';
const tree = `${ws}/.rotaris/requirements/worktrees/rotaris-req-req-104-u1`;
const prefix = '[main 2026-10-03T06:04:46.970Z] info    run host: ';

describe('the code-intelligence binding a run launched with, read from its log (REQ-MCP-034)', () => {
  it('the lines of the run at 1763f7f name no project, so the check is red on them', () => {
    const log = [
      `${prefix}mcp: discovery of 'code_intelligence' listed 22 tool(s) in 1968 ms`,
      `${prefix}mcp code_intelligence: connected for the session (pid 10231, protocol 2025-11-25, 22 tool(s), hook code_intelligence:ok) in 2511 ms`,
    ].join('\n');
    expect(codeIntelligenceLaunches(log)).toEqual([{ kind: 'discovery', project: null }, { kind: 'connected', project: null }]);
    expect(bindingVerdict(log, tree).ok).toBe(false);
  });

  it('a launch bound to the anchoring checkout is red, and the detail names it', () => {
    const log = [
      `${prefix}mcp: discovery of 'code_intelligence' (project ${tree}) listed 22 tool(s) in 1968 ms`,
      `${prefix}mcp code_intelligence: connected for the session (pid 10231, protocol 2025-11-25, 22 tool(s), hook code_intelligence:ok, project ${ws}) in 2511 ms`,
    ].join('\n');
    const v = bindingVerdict(log, tree);
    expect(v.ok).toBe(false);
    expect(v.detail).toContain(`connected: ${ws}`);
  });

  it('every launch bound to the worktree\'s root is green, a failed discovery included', () => {
    const log = [
      // The injection proof's own lines: a failure whose standard error runs over three log lines.
      `${prefix}mcp: discovery of 'code_intelligence' (project ${tree}) failed (Connection closed (code_intelligence exited with code 127; stderr: the bus: Failed to connect`,
      `${prefix}rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle))) in 973 ms`,
      `${prefix}mcp: discovery of 'web_search' listed 1 tool(s) in 3 ms`,
      `${prefix}mcp code_intelligence: connected for the session (pid 10231, protocol 2025-11-25, 22 tool(s), hook code_intelligence:ok, project ${tree}) in 2511 ms`,
    ].join('\n');
    expect(codeIntelligenceLaunches(log).map((l) => l.project)).toEqual([tree, tree]);
    expect(bindingVerdict(log, tree)).toEqual({ ok: true, detail: `every launch named ${tree} — discovery: ${tree}; connected: ${tree}` });
  });

  it('no launch line at all is red: the check cannot say what the run was bound to', () => {
    expect(bindingVerdict(`${prefix}session 76d7de01 started`, tree)).toEqual({ ok: false, detail: "no launch line of 'code_intelligence' was logged" });
  });
});
