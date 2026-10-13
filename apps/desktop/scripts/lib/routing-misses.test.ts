/**
 * PD-TOOLS-006 revision 8 (OQ-241): the duress counts OQ-216's target of zero is measured by, pinned against the shapes the duress
 * live run at a68f121 recorded (session e6747bd0: call 115, architect given a write scope; call 164, a docs-writer's `run_command`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { routingMissReading } from './routing-misses.mjs';

const call = (ordinal: number, tool_name: string, agent_name: string, status: string, result: string, failureKind: string | null = null) => ({ ordinal, tool_name, agent_name, status, result, failureKind });

describe('routingMissReading (PD-TOOLS-006 revision 8, OQ-241)', () => {
  it('counts the a68f121 duress shapes: one write-scope refusal for architect, one unknown tool a child called', () => {
    const r = routingMissReading([{ scenario: 'duress', rootNames: ['orchestrator'], calls: [
      call(115, 'delegate', 'orchestrator', 'failed', "Task 'decisions': rejected — write_scope was given to 'architect', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started."),
      call(116, 'delegate', 'orchestrator', 'ok', "Task 'decisions-doc': queued — Accepted.\ntask_id: bg_00000001"),
      call(164, 'run_command', 'd', 'failed', "Unknown tool 'run_command'. The call was not executed; choose one of the tools listed.", 'invalid_request'),
      call(165, 'read_file', 'd', 'ok', 'contents'),
    ] }]);
    expect(r.scopeRefusals).toEqual([{ scenario: 'duress', ordinal: 115, persona: 'architect' }]);
    expect(r.unknownTools).toEqual([{ scenario: 'duress', ordinal: 164, agent: 'd', tool: 'run_command' }]);
  });

  it('a root\'s own unknown tool is not a child\'s brief, and a run with neither reads zero', () => {
    const r = routingMissReading([{ scenario: 'edit', rootNames: ['orchestrator'], calls: [call(3, 'terminal', 'orchestrator', 'failed', "Unknown tool 'terminal'. The call was not executed; choose one of the tools listed.", 'invalid_request')] }]);
    expect(r).toEqual({ read: ['edit'], scopeRefusals: [], unknownTools: [] });
  });
});
