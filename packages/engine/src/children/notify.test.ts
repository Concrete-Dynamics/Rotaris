import { describe, expect, it } from 'vitest';
import type { ChildRow } from '@rotaris/store';
import { cutOffReport } from './cut-off.js';
import { HAND_OFF_BUDGET } from '@rotaris/kernel';
import { childPayload, completionNotification, inheritedContext, inheritedContextBlock, openTodoReminderLines, priorAgentContext, priorAgentContextParts, REPORT_BLOCK_CAP, reportBlock, resumeMessage } from './notify.js';

describe('the child payload order — REQ-TOOLS-154, REQ-ORCH-035, PD-TOOLS-006, REQ-TOOLS-152', () => {
  const prior = '[Prior agent context — authoritative: rely on these findings rather than repeating the investigation]';
  const index = 'PRIOR SIBLING ARTIFACT INDEX\n- a';
  const attached = 'PRIOR AGENT CONTEXT (FULL)\n- b';
  const scopes = "Write scopes:\n- Yours: 'src/**'.";
  const inherited = '[Inherited context — the reports of sibling tasks that had already completed when you were delegated]\n\n### survey (codebase-analyst) — succeeded\nThe module is small.';

  it('puts the prior-agent context first, then the workspace root and write scopes, then the artifacts (3) and (4), then the inherited context (5), then the task', () => {
    const payload = childPayload('/ws', 'the task', prior, [index, attached], scopes, inherited);
    const at = (text: string) => payload.indexOf(text);
    const order = [prior, 'Workspace root: /ws.', scopes, index, attached, inherited, 'the task'].map(at);
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(payload.endsWith('the task')).toBe(true);
    // (5) sits between the attached artifacts and the task with nothing else between them.
    expect(payload).toContain(`${attached}\n\n${inherited}\n\nthe task`);
  });

  it('starts with the workspace root when the child has no dependencies, and omits the blocks it has none of', () => {
    const payload = childPayload('/ws', 'the task', '', [index, ''], '');
    expect(payload.split('\n\n')[0]).toMatch(/^Workspace root: \/ws\./);
    expect(payload.split('\n\n').slice(1)).toEqual([...index.split('\n\n'), 'the task']);
  });

  it('with nothing inherited the payload is what it was before item (5) existed', () => {
    expect(childPayload('/ws', 'the task', prior, [index, attached], scopes, '')).toBe(childPayload('/ws', 'the task', prior, [index, attached], scopes));
  });
});

describe('the inherited-context block — REQ-TOOLS-152, REQ-TOOLS-154 item (5), REQ-ORCH-032', () => {
  const row = (name: string, report: Record<string, unknown>): ChildRow => ({ task_id: `bg_${name.padStart(8, '0')}`, canonical_name: name, persona: 'codebase-analyst', state: 'succeeded', report: JSON.stringify(report) } as ChildRow);

  it('is empty when no completed sibling was named, so the payload gains no block', () => {
    expect(inheritedContextBlock([])).toBe('');
  });

  it('opens with a heading that says the reports are context and not a dependency, then one REQ-ORCH-060 report block per sibling in the order named', () => {
    const block = inheritedContextBlock([row('survey', { status: 'succeeded', final_response: 'The module is small.' }), row('audit', { status: 'succeeded', last_response: 'Two findings.' })]);
    const parts = block.split('\n\n');
    expect(parts[0]).toMatch(/^\[Inherited context — .*completed.*\]$/);
    expect(parts[0]).toMatch(/context, not/);
    expect(parts[0]).toMatch(/not as a dependency/);
    expect(parts.slice(1)).toEqual(['### survey (codebase-analyst) — succeeded\nThe module is small.', '### audit (codebase-analyst) — succeeded\nTwo findings.']);
    // A short answer reads as the parent's resume block does; a long one is no longer cut to that block's 4,000 characters
    // (PD-TOOLS-006 revision 9, OQ-256).
    expect(parts[1]).toBe(reportBlock(row('survey', { status: 'succeeded', final_response: 'The module is small.' })));
  });
});

describe('PD-TOOLS-006 revision 9 (OQ-256): a hand-off carries each named answer whole under one 100,000-character budget', () => {
  // The duress live run at 552d346 (finding V1): e1's 28,330-character answer reached e2 "… [24330 characters omitted]", since the
  // inherited block reused REQ-ORCH-060's 4,000-character report block.
  const row = (name: string, report: Record<string, unknown>, persona = 'architect'): ChildRow => ({ task_id: `bg_${name.padStart(8, '0')}`, canonical_name: name, persona, state: 'succeeded', report: JSON.stringify(report) } as ChildRow);
  const answer = (n: number, mark = 'a') => `${mark}${'x'.repeat(n - 2)}${mark}`;

  it('the budget is 100,000 characters, the figure revision 5 set for attachments', () => {
    expect(HAND_OFF_BUDGET).toBe(100_000);
  });

  it('a 28,330-character final response is carried whole through inherited_context, with no marker and no cut', () => {
    const text = answer(28_330);
    const r = inheritedContext([row('e1', { status: 'succeeded', final_response: text })]);
    expect(r.block).toContain(`### e1 (architect) — succeeded\n${text}`);
    expect(r.block).not.toMatch(/omitted/);
    expect(r.cuts).toEqual([]);
    expect(inheritedContextBlock([row('e1', { status: 'succeeded', final_response: text })])).toBe(r.block);
  });

  it('an answer of 100,001 characters is cut to the budget and ends in the marker the child reads', () => {
    const text = answer(100_001);
    const r = inheritedContext([row('f1', { status: 'succeeded', final_response: text })]);
    expect(r.cuts).toEqual([{ taskId: 'bg_000000f1', name: 'f1', given: 100_000, omitted: 1 }]);
    const body = r.block.split('### f1 (architect) — succeeded\n')[1] as string;
    expect(body.startsWith(text.slice(0, 100_000))).toBe(true);
    expect(body.slice(100_000)).toBe("\n… [hand-off cut: 100000 of 100001 characters of f1's answer are given here and 1 is omitted, under the 100,000-character hand-off budget. The rest is in neither the workspace nor the artifact store; say in your report which parts of this answer you did not receive.]");
  });

  it('two siblings across the budget: the first whole, the second cut to the rest — and never below 4,000 characters', () => {
    const r = inheritedContext([row('a', { final_response: answer(90_000) }), row('b', { final_response: answer(30_000, 'b') })]);
    expect(r.cuts).toEqual([{ taskId: 'bg_0000000b', name: 'b', given: 10_000, omitted: 20_000 }]);
    const floor = inheritedContext([row('a', { final_response: answer(99_000) }), row('b', { final_response: answer(30_000, 'b') }), row('c', { final_response: answer(3_000, 'c') })]);
    expect(floor.cuts).toEqual([{ taskId: 'bg_0000000b', name: 'b', given: REPORT_BLOCK_CAP, omitted: 26_000 }]);
    // A short third answer still arrives whole under the floor: no child receives less than a report block gave it.
    expect(floor.block).toContain(`### c (architect) — succeeded\n${answer(3_000, 'c')}`);
  });

  it('the result text is the final response, else the last response, else the key findings, else the summary', () => {
    expect(inheritedContext([row('k', { key_findings: ['one', 'two'], summary: 'S' })]).block).toContain('### k (architect) — succeeded\n- one\n- two');
    expect(inheritedContext([row('s', { summary: 'only the summary' })]).block).toContain('### s (architect) — succeeded\nonly the summary');
    expect(priorAgentContext([row('k', { key_findings: ['one'], summary: 'S' })])).toContain('#### k (architect, succeeded)\n- one');
  });

  it('REQ-ORCH-047\'s prior-agent context is under the same budget, floor and marker, its authoritative heading kept', () => {
    const big = answer(120_000);
    const parts = priorAgentContextParts([row('d1', { status: 'succeeded', final_response: big }, 'verifier'), row('d2', { status: 'succeeded', final_response: answer(5_000, 'd') }, 'verifier')]);
    expect(parts.block.startsWith('[Prior agent context — authoritative')).toBe(true);
    expect(parts.cuts).toEqual([{ taskId: 'bg_000000d1', name: 'd1', given: 100_000, omitted: 20_000 }, { taskId: 'bg_000000d2', name: 'd2', given: REPORT_BLOCK_CAP, omitted: 1_000 }]);
    expect(parts.block).toContain("of d1's answer are given here and 20000 are omitted");
    expect(priorAgentContext([row('d1', { final_response: big }, 'verifier')])).toBe(priorAgentContextParts([row('d1', { final_response: big }, 'verifier')]).block);
  });

  it('REQ-ORCH-060\'s 4,000-character cap still governs the resume message', () => {
    const msg = resumeMessage([row('e1', { status: 'succeeded', final_response: answer(28_330) })], 0);
    expect(msg).toContain('… [24330 characters omitted]');
  });
});

describe('the report block — REQ-ORCH-060, PD-ORCH-004', () => {
  const row = (report: Record<string, unknown>): ChildRow => ({ task_id: 'bg_0000000a', canonical_name: 'build', persona: 'coding-agent', state: 'failed', report: JSON.stringify(report) } as ChildRow);
  const timeout = { status: 'failed', last_response: 'working on b', errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }] };

  it('a child cut off while making progress shows the statement, its paths and the offer after the capped result text', () => {
    const cut_off = cutOffReport({ taskId: 'bg_0000000a', limitS: 1200, stallS: 90, changedPaths: ['src/a.ts'], isContinuation: false });
    const block = reportBlock(row({ ...timeout, last_response: 'x'.repeat(REPORT_BLOCK_CAP + 10), cut_off }));
    const lines = block.split('\n');
    expect(lines[0]).toBe('### build (coding-agent) — failed');
    expect(lines.slice(-3)).toEqual([cut_off.statement, cut_off.changes, cut_off.continuation_offer]);
    expect(block).toContain('… [10 characters omitted]');
  });

  it('a timed-out child that was not making progress gets exactly the block it had before', () => {
    expect(reportBlock(row(timeout))).toBe('### build (coding-agent) — failed\nworking on b');
  });
});

describe('REQ-ORCH-059: the completion notification\'s open-todo reminder lines', () => {
  const done = { task_id: 'bg_1', canonical_name: 'implement', given_name: 'implement', state: 'succeeded' } as unknown as ChildRow;

  it('appends the parent\'s open plan items after the remaining-count lines, naming up to five', () => {
    const text = completionNotification(done, 1, 2.5, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const lines = text.split('\n');
    expect(lines.slice(-7)).toEqual(['Your todo list still holds 7 open items:', '- a', '- b', '- c', '- d', '- e', '(and 2 more)']);
    expect(lines[5]).toMatch(/^1 background task still running/);
  });

  it('appends nothing when no item is open', () => {
    expect(completionNotification(done, 0, 1, [])).toBe(completionNotification(done, 0, 1));
    expect(completionNotification(done, 0, 1).split('\n').at(-1)).toBe('All background tasks have completed.');
    expect(openTodoReminderLines([])).toEqual([]);
    expect(openTodoReminderLines(['only'])).toEqual(['Your todo list still holds 1 open item:', '- only']);
  });
});
