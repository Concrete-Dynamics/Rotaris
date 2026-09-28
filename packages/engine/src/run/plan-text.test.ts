import { describe, expect, it } from 'vitest';
import { resumedWorkSection } from './plan-text.js';

/** PD-ORCH-003 revision 2: what a plan cycle held after a resumed iteration is told of the work still pending. */
describe('resumedWorkSection (PD-ORCH-003 revision 2)', () => {
  it('names the resumed iteration and the pending tasks in the order given', () => {
    const text = resumedWorkSection(4, ['alpha', 'beta']);
    expect(text).toContain('This run resumed iteration 4');
    expect(text).toContain('Pending tasks:\n- alpha\n- beta\n');
  });

  it('bounds the list: twenty tasks as the handoff shows of its todo, each cut to 500 characters rather than its 80, never inside a surrogate pair', () => {
    const many = Array.from({ length: 22 }, (_, i) => `task ${i + 1}`);
    const text = resumedWorkSection(1, many);
    expect(text).toContain('- task 20\n- [... additional pending tasks elided]');
    expect(text).not.toContain('- task 21');
    const long = resumedWorkSection(1, ['x'.repeat(600)]);
    expect(long).toContain(`- ${'x'.repeat(497)}...\n`);
    const pair = resumedWorkSection(1, [`${'x'.repeat(496)}\u{1F600}${'y'.repeat(10)}`]);
    expect(pair).toContain(`- ${'x'.repeat(496)}...\n`);
  });

  it('says so when nothing is pending', () => {
    expect(resumedWorkSection(1, [])).toContain('Pending tasks:\n- (none)');
  });
});
