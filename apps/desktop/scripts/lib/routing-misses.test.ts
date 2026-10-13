/**
 * PD-TOOLS-006 revision 8 (OQ-250): the duress counts OQ-216's target of zero is measured by, pinned against the shapes the duress
 * live run at a68f121 recorded (session e6747bd0: call 115, architect given a write scope; call 164, a docs-writer's `run_command`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { routingMissReading } from './routing-misses.mjs';

const call = (ordinal: number, tool_name: string, agent_name: string, status: string, result: string, failureKind: string | null = null, args: Record<string, unknown> = {}, endedAt: number | null = null) => ({ ordinal, tool_name, agent_name, status, result, failureKind, args, endedAt });

describe('routingMissReading (PD-TOOLS-006 revision 8, OQ-250)', () => {
  it('counts the a68f121 duress shapes: one write-scope refusal for architect, one unknown tool a child called', () => {
    const r = routingMissReading([{ scenario: 'duress', rootNames: ['orchestrator'], calls: [
      call(115, 'delegate', 'orchestrator', 'failed', "Task 'decisions': rejected — write_scope was given to 'architect', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started."),
      call(116, 'delegate', 'orchestrator', 'ok', "Task 'decisions-doc': queued — Accepted.\ntask_id: bg_00000001"),
      call(164, 'run_command', 'd', 'failed', "Unknown tool 'run_command'. The call was not executed; choose one of the tools listed.", 'invalid_request'),
      call(165, 'read_file', 'd', 'ok', 'contents'),
    ] }]);
    expect(r.scopeRefusals).toEqual([{ scenario: 'duress', ordinal: 115, persona: 'architect', secondsToNext: null, rerouted: true }]);
    expect(r.unknownTools).toEqual([{ scenario: 'duress', ordinal: 164, agent: 'd', tool: 'run_command' }]);
  });

  it('a root\'s own unknown tool is not a child\'s brief, and a run with neither reads zero', () => {
    const r = routingMissReading([{ scenario: 'edit', rootNames: ['orchestrator'], calls: [call(3, 'terminal', 'orchestrator', 'failed', "Unknown tool 'terminal'. The call was not executed; choose one of the tools listed.", 'invalid_request')] }]);
    expect(r).toEqual({ read: ['edit'], scopeRefusals: [], unknownTools: [], flagged: [] });
  });

  // OQ-257 (PD-TOOLS-006 revision 9): the bound that replaced the target of zero — at most one refusal a run, each re-routed by the
  // coordinator's next delegate; the seconds to it are reported.
  const refusal = "Task 'decisions': rejected — write_scope was given to 'architect', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started.";
  it('reads the 552d346 duress shape: one refusal (#92), re-routed 30.0 s later by the architect without a scope, inside the bound', () => {
    const r = routingMissReading([{ scenario: 'duress', rootNames: ['orchestrator'], calls: [
      call(92, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['docs/decisions.md'] }, 1_000_000),
      call(100, 'read_file', 'c', 'ok', 'contents'),
      call(111, 'delegate', 'orchestrator', 'ok', "Task 'e1': queued — Accepted.\ntask_id: bg_0afe2a2a", null, { persona: 'architect' }, 1_030_000),
      call(163, 'delegate', 'orchestrator', 'ok', "Task 'e2': queued — Accepted.\ntask_id: bg_00000163", null, { persona: 'docs-writer', write_scope: ['docs/decisions.md'], inherited_context: ['bg_0afe2a2a'] }, 1_600_000),
    ] }]);
    expect(r.scopeRefusals).toEqual([{ scenario: 'duress', ordinal: 92, persona: 'architect', secondsToNext: 30, rerouted: true }]);
    expect(r.flagged).toEqual([]);
  });

  it('flags a refusal the next delegate does not re-route, one with no later delegate, and a second refusal in one run', () => {
    const again = routingMissReading([{ scenario: 'duress', rootNames: ['orchestrator'], calls: [
      call(10, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 0),
      call(11, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 2_000),
    ] }]);
    expect(again.scopeRefusals.map((x) => [x.ordinal, x.rerouted, x.secondsToNext])).toEqual([[10, false, 2], [11, false, null]]);
    expect(again.flagged).toEqual([
      { scenario: 'duress', ordinal: 10, why: 'the next delegate did not re-route the work' },
      { scenario: 'duress', ordinal: 11, why: 'no later delegate by the same agent' },
      { scenario: 'duress', ordinal: null, why: '2 write-scope refusals in one run' },
    ]);
    // An accepted delegate to the same persona that keeps the scope is not a re-route (only a refusal could answer it).
    const kept = routingMissReading([{ scenario: 'd', rootNames: ['orchestrator'], calls: [
      call(1, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 0),
      call(2, 'delegate', 'orchestrator', 'ok', "Task 'x': queued — Accepted.", null, { persona: 'architect', write_scope: ['b.md'] }, 1_000),
    ] }]);
    expect(kept.scopeRefusals[0]?.rerouted).toBe(false);
  });
});
