/**
 * PD-TOOLS-006 revision 9 (OQ-256): the live run's count of hand-off answers a child received cut, read by the block's marker.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { handOffCutReading } from './hand-off-cuts.mjs';

const marker = (given: number, total: number, name: string) => `… [hand-off cut: ${given} of ${total} characters of ${name}'s answer are given here and ${total - given} are omitted, under the 100,000-character hand-off budget. The rest is in neither the workspace nor the artifact store; say in your report which parts of this answer you did not receive.]`;

describe('handOffCutReading (PD-TOOLS-006 revision 9, OQ-256)', () => {
  it('counts each child\'s cut answer once, its retry\'s repeat and the root\'s own messages aside', () => {
    const r = handOffCutReading([{ scenario: 'duress', rootIds: ['root:1'], messages: [
      { task_id: 'bg_00000163', body: JSON.stringify({ role: 'user', content: `[Inherited context …]\n\n### e1 (architect) — succeeded\nxxx\n${marker(100_000, 128_330, 'e1')}\n\nTASK: write` }) },
      { task_id: 'bg_00000163', body: JSON.stringify({ role: 'user', content: marker(100_000, 128_330, 'e1') }) },
      { task_id: 'bg_00000200', body: `${marker(4_000, 30_000, 'b')}` },
      { task_id: 'root:1', body: marker(1, 2, 'z') },
    ] }]);
    expect(r.cuts).toEqual([
      { scenario: 'duress', child: 'bg_00000163', answer: 'e1', given: 100_000, total: 128_330 },
      { scenario: 'duress', child: 'bg_00000200', answer: 'b', given: 4_000, total: 30_000 },
    ]);
    // An answer of 100,000 characters or fewer cut by its block is what the target of zero counts.
    expect(r.underBudget).toEqual([{ scenario: 'duress', child: 'bg_00000200', answer: 'b', given: 4_000, total: 30_000 }]);
  });

  it('the 552d346 duress shape — REQ-ORCH-060\'s report-block marker — is not a hand-off cut, and a run with none reads zero', () => {
    const r = handOffCutReading([{ scenario: 'duress', rootIds: [], messages: [{ task_id: 'bg_00000163', body: '`/** The next fr\n… [24330 characters omitted]' }] }]);
    expect(r).toEqual({ read: ['duress'], cuts: [], underBudget: [] });
  });
});
