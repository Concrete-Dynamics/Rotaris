/**
 * PD-TOOLS-006 revision 8 (OQ-250): the duress counts OQ-216's target of zero is measured by, pinned against the shapes the duress
 * live run at a68f121 recorded (session e6747bd0: call 115, architect given a write scope; call 164, a docs-writer's `run_command`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { publishersOf, routingMissReading } from './routing-misses.mjs';

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
    expect(r).toEqual({ read: ['edit'], scopeRefusals: [], unknownTools: [], unknownArtifactWrites: [], publishBriefs: [], flagged: [] });
  });

  // OQ-257 (PD-TOOLS-006 revision 9): the bound that replaced the target of zero — each refusal re-routed by the coordinator's next
  // delegate, the seconds to it reported. Its "at most one refusal a run" is replaced by OQ-331's per-task bound, below.
  const refusal = "Task 'decisions': rejected — write_scope was given to 'architect', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started.";
  it('reads the 552d346 duress shape: one refusal (#92), re-routed 30.0 s later by the architect without a scope, inside the bound', () => {
    const r = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls: [
      call(92, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['docs/decisions.md'] }, 1_000_000),
      call(100, 'read_file', 'c', 'ok', 'contents'),
      call(111, 'delegate', 'orchestrator', 'ok', "Task 'e1': queued — Accepted.\ntask_id: bg_0afe2a2a", null, { persona: 'architect' }, 1_030_000),
      call(163, 'delegate', 'orchestrator', 'ok', "Task 'e2': queued — Accepted.\ntask_id: bg_00000163", null, { persona: 'docs-writer', write_scope: ['docs/decisions.md'], inherited_context: ['bg_0afe2a2a'] }, 1_600_000),
    ] }]);
    expect(r.scopeRefusals).toEqual([{ scenario: 'duress', ordinal: 92, persona: 'architect', secondsToNext: 30, rerouted: true }]);
    expect(r.flagged).toEqual([]);
  });

  it('flags a refusal the next delegate does not re-route, one with no later delegate, and the same work refused twice', () => {
    const again = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls: [
      call(10, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 0),
      call(11, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 2_000),
    ] }]);
    expect(again.scopeRefusals.map((x) => [x.ordinal, x.rerouted, x.secondsToNext])).toEqual([[10, false, 2], [11, false, null]]);
    expect(again.flagged).toEqual([
      { scenario: 'duress', ordinal: 10, why: 'the next delegate did not re-route the work' },
      { scenario: 'duress', ordinal: 11, why: 'no later delegate by the same agent' },
      { scenario: 'duress', ordinal: 11, why: 'the same work was refused before (#10)' },
    ]);
    // An accepted delegate to the same persona that keeps the scope is not a re-route (only a refusal could answer it).
    const kept = routingMissReading([{ scenario: 'd', rootNames: ['orchestrator'], calls: [
      call(1, 'delegate', 'orchestrator', 'failed', refusal, null, { persona: 'architect', write_scope: ['a.md'] }, 0),
      call(2, 'delegate', 'orchestrator', 'ok', "Task 'x': queued — Accepted.", null, { persona: 'architect', write_scope: ['b.md'] }, 1_000),
    ] }]);
    expect(kept.scopeRefusals[0]?.rerouted).toBe(false);
  });

  // OQ-331 (ruled 2026-10-15 under R-072; PD-TOOLS-006 revision 9 stands): OQ-257's "at most one refusal per duress run" was
  // falsified at 2fe0a837 and is replaced by a bound counted per task — at most one refusal for each task of the scenario's request
  // that routes to a persona writing no files (two in duress, none elsewhere), no work refused twice, each re-routed by the same
  // agent's next delegate within 60 s.
  const refusedFor = (task: string, persona: string) => `Task '${task}': rejected — write_scope was given to '${persona}', which cannot write files: it holds no file-writing tool (write_file, haet_edit). The delegation was not started.`;
  const accepted = (task: string) => `Task '${task}': queued — Accepted; the child runs in the background.\ntask_id: bg_00000000`;
  const at = (iso: string) => Date.parse(iso);
  const shape2fe0a837 = () => [
    call(105, 'delegate', 'orchestrator', 'failed', refusedFor('wave2-decisions', 'architect'), null, { persona: 'architect', task_name: 'wave2-decisions', write_scope: ['docs/decisions.md'] }, at('2026-10-15T04:07:25.473Z')),
    call(126, 'delegate', 'orchestrator', 'ok', accepted('wave2-decisions-analysis'), null, { persona: 'architect', task_name: 'wave2-decisions-analysis' }, at('2026-10-15T04:07:52.333Z')),
    call(204, 'delegate', 'orchestrator', 'ok', accepted('wave2-write-decisions'), null, { persona: 'docs-writer', task_name: 'wave2-write-decisions', write_scope: ['docs/decisions.md'], inherited_context: ['bg_7940dd84'] }, at('2026-10-15T04:16:30.437Z')),
    call(231, 'delegate', 'orchestrator', 'failed', refusedFor('wave3-verify', 'verifier'), null, { persona: 'verifier', task_name: 'wave3-verify', write_scope: ['docs/verification.md'] }, at('2026-10-15T04:19:29.485Z')),
    call(232, 'delegate', 'orchestrator', 'ok', accepted('wave3-verify'), null, { persona: 'tester', task_name: 'wave3-verify', write_scope: ['docs/verification.md'] }, at('2026-10-15T04:19:45.336Z')),
  ];

  it('reads the 2fe0a837 duress shape inside the bound: #105 re-routed by #126 after 26.9 s, #231 by #232 after 15.9 s', () => {
    const r = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls: shape2fe0a837() }]);
    expect(r.scopeRefusals).toEqual([
      { scenario: 'duress', ordinal: 105, persona: 'architect', secondsToNext: 26.9, rerouted: true },
      { scenario: 'duress', ordinal: 231, persona: 'verifier', secondsToNext: 15.9, rerouted: true },
    ]);
    expect(r.flagged).toEqual([]);
  });

  it('flags the same paths refused again under a new task_name', () => {
    const calls = [
      ...shape2fe0a837().slice(0, 2),
      call(140, 'delegate', 'orchestrator', 'failed', refusedFor('wave2-decisions-again', 'architect'), null, { persona: 'architect', task_name: 'wave2-decisions-again', write_scope: ['docs/decisions.md'] }, at('2026-10-15T04:09:00.000Z')),
      call(141, 'delegate', 'orchestrator', 'ok', accepted('wave2-write-decisions'), null, { persona: 'docs-writer', task_name: 'wave2-write-decisions', write_scope: ['docs/decisions.md'] }, at('2026-10-15T04:09:10.000Z')),
    ];
    const r = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls }]);
    expect(r.flagged).toEqual([{ scenario: 'duress', ordinal: 140, why: 'the same work was refused before (#105)' }]);
  });

  it('flags three refusals in duress, over its two tasks routed to a non-writer', () => {
    const calls = [
      ...shape2fe0a837(),
      call(240, 'delegate', 'orchestrator', 'failed', refusedFor('wave3-summary', 'reviewer'), null, { persona: 'reviewer', task_name: 'wave3-summary', write_scope: ['docs/summary.md'] }, at('2026-10-15T04:20:00.000Z')),
      call(241, 'delegate', 'orchestrator', 'ok', accepted('wave3-summary'), null, { persona: 'docs-writer', task_name: 'wave3-summary', write_scope: ['docs/summary.md'] }, at('2026-10-15T04:20:10.000Z')),
    ];
    const r = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls }]);
    expect(r.flagged).toEqual([{ scenario: 'duress', ordinal: null, why: '3 write-scope refusals in one run, over its 2 task(s) routed to a persona that writes no files' }]);
  });

  it('flags one refusal in a scenario whose request routes no task to a non-writer', () => {
    const r = routingMissReading([{ scenario: 'delegation', nonWriterFileTasks: 0, rootNames: ['orchestrator'], calls: shape2fe0a837().slice(0, 2) }]);
    expect(r.flagged).toEqual([{ scenario: 'delegation', ordinal: null, why: '1 write-scope refusal in one run, over its 0 task(s) routed to a persona that writes no files' }]);
    // A session that names no count is read as routing none to a non-writer.
    const unnamed = routingMissReading([{ scenario: 'edit', rootNames: ['orchestrator'], calls: shape2fe0a837().slice(0, 2) }]);
    expect(unnamed.flagged.map((f: { ordinal: number | null }) => f.ordinal)).toEqual([null]);
  });

  it('flags a refusal re-routed after more than 60 s', () => {
    const calls = [
      call(105, 'delegate', 'orchestrator', 'failed', refusedFor('wave2-decisions', 'architect'), null, { persona: 'architect', task_name: 'wave2-decisions', write_scope: ['docs/decisions.md'] }, 0),
      call(126, 'delegate', 'orchestrator', 'ok', accepted('wave2-decisions-analysis'), null, { persona: 'architect', task_name: 'wave2-decisions-analysis' }, 61_000),
    ];
    const r = routingMissReading([{ scenario: 'duress', nonWriterFileTasks: 2, rootNames: ['orchestrator'], calls }]);
    expect(r.scopeRefusals[0]).toMatchObject({ ordinal: 105, secondsToNext: 61, rerouted: true });
    expect(r.flagged).toEqual([{ scenario: 'duress', ordinal: 105, why: 're-routed 61 s later, over 60 s' }]);
  });
});

/**
 * PD-TOOLS-006 revision 10 (OQ-334, ruled 2026-10-15 under R-072): in every live run, default and duress, two counts with a target of
 * 0 — a child's call of an `artifact_write` it does not hold, and a brief asking a persona whose catalogue entry lacks "publishes
 * artifacts" to publish an artifact. Pinned against the shape the default run at 3c03287 recorded (session d0c3a7f0: #5 briefed a
 * codebase-analyst "Publish your findings as an artifact so later steps can attach it.", #10 the child's `artifact_write`).
 */
describe('routingMissReading — publishing briefs and invented artifact_write (PD-TOOLS-006 revision 10, OQ-334)', () => {
  const brief = 'TASK: Read src/todos.js and report every function that the module exports.\n\nMUST DO:\n- Read src/todos.js itself.\n- Publish your findings as an artifact so later steps can attach it.\n\nMUST NOT DO:\n- Do not modify any file.';
  const d0c3a7f0 = (publishers?: string[]) => [{ scenario: 'delegation', rootNames: ['orchestrator'], ...(publishers ? { publishers } : {}), calls: [
    call(5, 'delegate', 'orchestrator', 'ok', "Task 'exports': queued — Accepted; the child runs in the background.\ntask_id: bg_aa74009b", null, { persona: 'codebase-analyst', task_name: 'exports', task: brief }),
    call(10, 'artifact_write', 'exports', 'failed', "Unknown tool 'artifact_write'. The call was not executed; choose one of the tools listed.", 'invalid_request'),
    call(17, 'delegate', 'orchestrator', 'ok', "Task 'exports-doc': queued — Accepted.", null, { persona: 'docs-writer', task_name: 'exports-doc', task: 'TASK: Write docs/exports.md. Start from the attached "exports report" artifact; pass nothing else.', attach_artifacts: ['art_C1ZUuJ3B'] }),
  ] }];

  it('(red) counts the d0c3a7f0 shape: one brief asking a non-publisher to publish, one artifact_write a child does not hold', () => {
    const r = routingMissReading(d0c3a7f0());
    expect(r.publishBriefs).toEqual([{ scenario: 'delegation', ordinal: 5, persona: 'codebase-analyst' }]);
    expect(r.unknownArtifactWrites).toEqual([{ scenario: 'delegation', ordinal: 10, agent: 'exports', tool: 'artifact_write' }]);
  });

  it('(red) a brief to a persona whose entry reads "publishes artifacts" is not counted', () => {
    expect(routingMissReading(d0c3a7f0(['codebase-analyst'])).publishBriefs).toEqual([]);
  });

  it('(red) a brief that forbids publishing, names a published artifact or hands one on asks nothing; a schema-refused call delivered no brief', () => {
    const asks = (task: string, result = "Task 'x': queued — Accepted.") => routingMissReading([{ scenario: 'd', rootNames: ['orchestrator'], calls: [call(1, 'delegate', 'orchestrator', 'ok', result, null, { persona: 'codebase-analyst', task_name: 'x', task })] }]).publishBriefs.length;
    expect(asks('MUST NOT DO:\n- Do not publish any artifact.')).toBe(0);
    expect(asks('CONTEXT: the analyst published artifact art_C1ZUuJ3B; read it.')).toBe(0);
    expect(asks("Pass the report artifact's id in attach_artifacts so the child starts from it.")).toBe(0);
    expect(asks('Publish an artifact named findings.')).toBe(1);
    expect(asks('Write the findings with artifact_write.')).toBe(1);
    expect(asks('Publish your findings as an artifact.', "The arguments for 'delegate' do not match its schema (task_name: Invalid input). Re-issue the call with corrected arguments.")).toBe(0);
  });

  it('(red) reads the publishers from a delegate description: each entry whose words include "publishes artifacts"', () => {
    const description = "Delegate a task to a specialist persona. The personas you can delegate to, each with what the product's own tools a child of yours would be granted let it do (tool-server and plugin tools are not described): codebase-analyst (reads workspace files); release-manager (reads workspace files, publishes artifacts); herald (publishes artifacts). Aliases: coder (coding-agent). Ask a persona only for work its tools allow.";
    expect(publishersOf(description)).toEqual(['release-manager', 'herald']);
    expect(publishersOf("Delegate a task. The personas you can delegate to (tool-server and plugin tools are not described): docs-writer (reads workspace files, writes workspace files).")).toEqual([]);
  });
});
