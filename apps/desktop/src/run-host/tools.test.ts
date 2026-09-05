import { describe, expect, it } from 'vitest';
import { isEntryPort } from './tools.js';

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
