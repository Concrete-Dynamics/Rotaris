import { describe, expect, it } from 'vitest';
import { childPayload } from './notify.js';

describe('the child payload order — REQ-TOOLS-154, REQ-ORCH-035, PD-TOOLS-006', () => {
  const prior = '[Prior agent context — authoritative: rely on these findings rather than repeating the investigation]';
  const index = 'PRIOR SIBLING ARTIFACT INDEX\n- a';
  const attached = 'PRIOR AGENT CONTEXT (FULL)\n- b';
  const scopes = "Write scopes:\n- Yours: 'src/**'.";

  it('puts the prior-agent context first, then the workspace root and write scopes, then the artifacts, then the task', () => {
    const payload = childPayload('/ws', 'the task', prior, [index, attached], scopes);
    const at = (text: string) => payload.indexOf(text);
    const order = [prior, 'Workspace root: /ws.', scopes, index, attached, 'the task'].map(at);
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(payload.endsWith('the task')).toBe(true);
  });

  it('starts with the workspace root when the child has no dependencies, and omits the blocks it has none of', () => {
    const payload = childPayload('/ws', 'the task', '', [index, ''], '');
    expect(payload.split('\n\n')[0]).toMatch(/^Workspace root: \/ws\./);
    expect(payload.split('\n\n').slice(1)).toEqual([...index.split('\n\n'), 'the task']);
  });
});
