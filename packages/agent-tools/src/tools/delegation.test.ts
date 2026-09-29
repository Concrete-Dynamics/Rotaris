import { describe, expect, it } from 'vitest';
import { delegateTool, type DelegationPort } from './delegation.js';
import type { ToolContext } from './types.js';

/** PD-ORCH-004: `delegate`'s `continuation_of` names the child continued, and reaches the engine's port unchanged. */
describe('delegate — continuation_of (PD-ORCH-004)', () => {
  function capture() {
    const seen: Parameters<DelegationPort['delegate']>[1][] = [];
    const port: DelegationPort = {
      delegate: async (_parent, req) => { seen.push(req); return { status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }; },
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    return { seen, tool: delegateTool(port, 'root:1') };
  }
  const ctx = {} as ToolContext;

  it('carries the named task id to the port, and omits the field when the call names none', async () => {
    const { seen, tool } = capture();
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'rest', task: 'TASK: continue', continuation_of: 'bg_00000001' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'fresh', task: 'TASK: other' }), ctx);
    expect(seen[0]!.continuationOf).toBe('bg_00000001');
    expect('continuationOf' in seen[1]!).toBe(false);
  });

  it('tells the model the argument exists', () => {
    expect(capture().tool.description).toContain('continuation_of');
  });
});

/** REQ-TOOLS-152: `suppress_auto_context` omits the automatic sibling-artifact index; the call's flag reaches the engine's port. */
describe('delegate — suppress_auto_context (REQ-TOOLS-152)', () => {
  function capture() {
    const seen: Parameters<DelegationPort['delegate']>[1][] = [];
    const port: DelegationPort = {
      delegate: async (_parent, req) => { seen.push(req); return { status: 'queued', canonicalName: req.taskName, taskId: 'bg_00000002', message: 'Accepted.' }; },
      backgroundOutput: () => ({ status: 'not_found', state: '', text: '' }),
      waitForTasks: async () => ({ immediate: true, requested: 0, text: '' }),
    };
    return { seen, tool: delegateTool(port, 'root:1') };
  }
  const ctx = {} as ToolContext;

  it('REQ-TOOLS-152: a call that sets it carries it to the port; one that leaves it at its default (false) carries nothing', async () => {
    const { seen, tool } = capture();
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'quiet', task: 'TASK: x', suppress_auto_context: true }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'plain', task: 'TASK: y' }), ctx);
    await tool.execute(tool.schema.parse({ persona: 'coder', task_name: 'off', task: 'TASK: z', suppress_auto_context: false }), ctx);
    expect(seen[0]!.suppressAutoContext).toBe(true);
    expect('suppressAutoContext' in seen[1]!).toBe(false);
    expect('suppressAutoContext' in seen[2]!).toBe(false);
  });
});
