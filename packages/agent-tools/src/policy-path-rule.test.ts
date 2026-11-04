/**
 * The gate's workspace-root scoping compares as the fence does (REQ-TOOLS-018, REQ-TOOLS-130; R-091, `hardening.md` §3.4
 * row 5, bundle D3). Until 2026-11-04 `policy.ts` held a private comparison that lower-cased every path on every platform,
 * so on Linux a sibling of the root differing from it by case alone satisfied `inside_workspace`.
 *
 * The platform's rule is not injectable through `buildPolicy`, so this file swaps the fence's default rule for Linux's
 * (`vi.mock`, this file alone): the gate must read a case-variant sibling as outside, which it does only while it takes
 * the fence's `isInside`.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildPolicy, evaluate, type EvaluationEnv, permissionRequest } from './policy.js';
import type * as Fence from './tools/fence.js';

vi.mock('./tools/fence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Fence>();
  const linux = actual.pathRuleFor('linux');
  return { ...actual, isInside: (root: string, candidate: string, rule = linux) => actual.isInside(root, candidate, rule) };
});

/** A lexical POSIX workspace on any host: the resolver drops a drive letter `path.resolve` may add and keeps `/`. */
const env: EvaluationEnv = {
  attended: true,
  workspaceRoot: '/work',
  resolvePath: (p) => p.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/'),
  publicTool: () => true,
};

describe('the gate\'s path scope takes the fence\'s path rule (REQ-TOOLS-018, REQ-TOOLS-130)', () => {
  it('under Linux\'s rule a sibling of the root that differs from it by case alone is outside the workspace', () => {
    const p = buildPolicy({ preset: 'restricted', workspaceRoot: '/work' });
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: '/work/src/a.ts' }), env).ruleId).toBe('restricted:read-only-tool');
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: '/Work/src/a.ts' }), env).ruleId).toBe('restricted:read-outside-workspace');
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: '../Work/a.ts' }), env).ruleId).toBe('restricted:read-outside-workspace');
  });
});
