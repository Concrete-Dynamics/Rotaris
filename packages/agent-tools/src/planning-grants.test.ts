import { describe, expect, it } from 'vitest';
import { PUBLIC_TOOL_NAMES } from '@rotaris/contracts';
import { DECLARATIONS, directWorkBundle, META_TOOL_NAMES } from './registry.js';
import { withheldUnderPlanGate } from './planning-grants.js';

/**
 * REQ-ORCH-153's planning grants, asserted against the registry rather than against a list this test keeps:
 * "the tool set it would otherwise hold, less every tool the public tool-name registry declares as writing
 * workspace files or running commands, with a tool the registry carries no declaration for counting as
 * declaring all three."
 */
describe('planning grants (REQ-ORCH-153, ADR-0062)', () => {
  it('withholds exactly the tools the registry declares as writing files or running commands', () => {
    for (const name of PUBLIC_TOOL_NAMES) {
      const d = DECLARATIONS[name];
      expect({ name, withheld: withheldUnderPlanGate(name) }).toEqual({ name, withheld: d.writesWorkspaceFiles || d.runsCommands });
    }
  });

  it('withholds a name the registry carries no declaration for — every MCP and plugin tool', () => {
    for (const name of ['mcp__serena__find_symbol', 'some_plugin_tool', '', 'WRITE_FILE_but_not_really']) {
      expect(withheldUnderPlanGate(name)).toBe(true);
    }
  });

  it('leaves reading, searching, fetching, delegating, the todo and the artifact tools available', () => {
    // A plan is written by reading: `readsWorkspaceFiles` is deliberately not one of the two facets.
    for (const name of ['read_file', 'grep', 'glob', 'haet_read', 'fetch', 'todo', 'delegate', 'background_output', 'wait_for_tasks', 'artifact_read', 'artifact_list', 'artifact_write', 'ask_questions']) {
      expect({ name, withheld: withheldUnderPlanGate(name) }).toEqual({ name, withheld: false });
    }
  });

  it('withholds the five that change the workspace, aliases included', () => {
    for (const name of ['write_file', 'haet', 'haet_edit', 'git_commit', 'terminal']) {
      expect({ name, withheld: withheldUnderPlanGate(name) }).toEqual({ name, withheld: true });
    }
  });

  it('narrows the direct-work bundle of a `single` run rather than exempting it (REQ-ORCH-025)', () => {
    const bundle = directWorkBundle();
    const narrowed = bundle.filter((t) => !withheldUnderPlanGate(t));
    // It only removes, it removes something, and what survives can still produce a plan.
    expect(narrowed.every((t) => bundle.includes(t))).toBe(true);
    expect(narrowed.length).toBeLessThan(bundle.length);
    expect(narrowed).toContain('todo');
    expect(narrowed).toContain('read_file');
    expect(narrowed).not.toContain('terminal');
  });

  it('the meta tools are outside the registry, so the gate must exempt them itself (REQ-TOOLS-014)', () => {
    // Asserted so the exemption in `Gate.dispatch` is never quietly dropped: by the predicate alone they withhold.
    for (const name of META_TOOL_NAMES) expect(withheldUnderPlanGate(name)).toBe(true);
  });
});
