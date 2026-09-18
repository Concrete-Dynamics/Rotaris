import { describe, expect, it } from 'vitest';
import { TOOL_IMPLEMENTATIONS } from '@rotaris/contracts';
import { gitReadTool, TodoList, todoTool } from '@rotaris/agent-tools';
import { isEntryPort, toolSpec } from './tools.js';

/**
 * Part N's finding: the entry test was written against the root id `root`, which Part B had already made
 * `root:<iteration>`, so the direct-work grant never reached the entry role. The port at depth 0 is the entry.
 */
describe('the entry role\'s tool port (REQ-ORCH-016/025)', () => {
  it.each<[string, { parentId?: string; depth?: number }, boolean]>([
    ['the run\'s root port, first iteration', { parentId: 'root:1', depth: 0 }, true],
    ['the run\'s root port, a later iteration', { parentId: 'root:7', depth: 0 }, true],
    ['a first-level child', { parentId: 'root:1', depth: 1 }, false],
    ['a grandchild', { parentId: 'bg_0a1b2c3d', depth: 2 }, false],
    ['no depth, no parent (a caller outside the run)', {}, true],
    ['no depth, the bare root id', { parentId: 'root' }, true],
    ['no depth, the iteration-suffixed root id', { parentId: 'root:3' }, true],
    ['no depth, a task id', { parentId: 'bg_0a1b2c3d' }, false],
  ])('%s', (_name, ctx, entry) => {
    expect(isEntryPort(ctx)).toBe(entry);
  });
});

/**
 * Found by reading run `a26918e8` (2026-09-16): the advertised schema was Zod's OUTPUT form, in which a field
 * carrying a `.default()` is required. The product therefore told the model that every phase must carry `tasks`
 * while the parser accepted it omitted — a contract advertised and not enforced, in the one built-in tool that
 * takes a batch.
 */
describe('the tool schema the model is handed (REQ-TOOLS-013)', () => {
  const phaseItems = (): Record<string, unknown> => {
    const spec = toolSpec(todoTool(new TodoList()));
    const properties = spec.parameters['properties'] as Record<string, { items: Record<string, unknown> }>;
    return properties['phases']!.items;
  };

  it('advertises the shape of a call about to be MADE, so a defaulted field is not advertised as required', () => {
    expect(phaseItems()['required']).toEqual(['name']);
  });

  it('still advertises what the parser does require', () => {
    const spec = toolSpec(todoTool(new TodoList()));
    expect(spec.parameters['required']).toEqual(['operation']);
    // REQ-TOOLS-144's five reach the model as an enum rather than as a bare string in a prose description.
    const properties = spec.parameters['properties'] as Record<string, { enum?: string[] }>;
    expect(properties['operation']!.enum).toEqual(['replace', 'add_phase', 'add_task', 'update', 'remove_task']);
  });

  it('advertises git_read\'s two operations with ref optional (REQ-TOOLS-193)', () => {
    // The inventory-to-executor link: the name the Tools surface lists is the executor the port wires.
    expect(TOOL_IMPLEMENTATIONS['git_read']).toBe('gitReadTool');
    const spec = toolSpec(gitReadTool('D:/work'));
    expect(spec.name).toBe('git_read');
    expect(spec.parameters['required']).toEqual(['operation']);
    const properties = spec.parameters['properties'] as Record<string, { enum?: string[] }>;
    expect(properties['operation']!.enum).toEqual(['head', 'read_ref']);
  });
});
