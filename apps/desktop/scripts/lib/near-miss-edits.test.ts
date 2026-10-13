/**
 * PD-TOOLS-014's live-run count (`near-miss-edits.mjs`), pinned against the shape finding D5 recorded at `a68f121`
 * (wave3's level-3 miss #292, its `cat -A` probe #293, its retry #294) and the shape the directive targets.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { nearMissReading } from './near-miss-edits.mjs';

const NEAR = 'old_string was not found exactly in docs/verification.md. It matches lines 168-170 at match level 3 (indentation shift). …';
const PLAIN = 'old_string was not found exactly in docs/verification.md. Read it again with haet_read.';
const call = (ordinal: number, tool_name: string, isError = false, result = '', agent_name = 'wave3', path = 'docs/verification.md') =>
  ({ ordinal, tool_name, agent_name, isError, result, args: tool_name === 'terminal' ? { command: 'sed -n 1,2p x | cat -A' } : { path } });

describe('nearMissReading (PD-TOOLS-014)', () => {
  it('D5 as recorded: a near miss, a terminal probe by the same agent, then a successful retry on the same path', () => {
    const r = nearMissReading([{ scenario: 'duress', calls: [call(292, 'haet_edit', true, NEAR), call(293, 'terminal'), call(294, 'haet_edit')] }]);
    expect(r.misses).toEqual([{ scenario: 'duress', ordinal: 292, agent: 'wave3', path: 'docs/verification.md', level: 3 }]);
    expect(r.probed.map((m: { ordinal: number }) => m.ordinal)).toEqual([292]);
    expect(r.retried.map((m: { ordinal: number }) => m.ordinal)).toEqual([292]);
  });

  it('the directive\'s target: the retry follows at once; another agent\'s terminal call is not a probe', () => {
    const r = nearMissReading([{ scenario: 'duress', calls: [call(1, 'haet', true, NEAR.replace('level 3 (indentation shift)', 'level 2 (trailing whitespace)')), call(2, 'terminal', false, '', 'other'), call(3, 'haet')] }]);
    expect(r.misses.map((m: { level: number }) => m.level)).toEqual([2]);
    expect(r.probed).toEqual([]);
    expect(r.retried).toHaveLength(1);
  });

  it('a plain miss is no near miss; a failed retry or one on another path is not counted as retried', () => {
    const r = nearMissReading([{ scenario: 'edit', calls: [call(1, 'haet_edit', true, PLAIN), call(2, 'haet_edit', true, NEAR), call(3, 'haet_edit', true, PLAIN), call(4, 'haet_edit', true, NEAR), call(5, 'haet_edit', false, '', 'wave3', 'other.md')] }]);
    expect(r.misses.map((m: { ordinal: number }) => m.ordinal)).toEqual([2, 4]);
    expect(r.retried).toEqual([]);
  });

  it('with no later edit, only the next few calls of the agent can be its probe, not a terminal call late in its life (fin32\'s review)', () => {
    const late = [call(1, 'haet_edit', true, NEAR), call(2, 'haet_read'), call(3, 'grep'), call(4, 'write_file'), call(5, 'terminal')];
    expect(nearMissReading([{ scenario: 'duress', calls: late }]).probed).toEqual([]);
    const early = [call(1, 'haet_edit', true, NEAR), call(2, 'haet_read'), call(3, 'terminal'), call(4, 'write_file')];
    expect(nearMissReading([{ scenario: 'duress', calls: early }]).probed.map((m: { ordinal: number }) => m.ordinal)).toEqual([1]);
  });
});
