import { describe, expect, it } from 'vitest';
import { resumedWorkSection } from './plan-text.js';

/** PD-ORCH-003 revision 2: what a plan cycle held after a resumed iteration is told of the work still pending. */
describe('resumedWorkSection (PD-ORCH-003 revision 2)', () => {
  it('names the resumed iteration and the pending tasks in the order given', () => {
    const text = resumedWorkSection(4, ['alpha', 'beta'], 'done');
    // Left open by a rest or by a crash — a crash-left session's continues take this path too (found by the iteration lane review).
    expect(text).toContain('This run resumed iteration 4, which was left open, and that iteration has closed.');
    expect(text).not.toContain('rest');
    expect(text).toContain('Pending tasks:\n- alpha\n- beta\n');
  });

  it('bounds the list: twenty tasks as the handoff shows of its todo, each cut to 500 characters rather than its 80, never inside a surrogate pair', () => {
    const many = Array.from({ length: 22 }, (_, i) => `task ${i + 1}`);
    const text = resumedWorkSection(1, many, 'none');
    expect(text).toContain('- task 20\n- [... additional pending tasks elided]');
    expect(text).not.toContain('- task 21');
    const long = resumedWorkSection(1, ['x'.repeat(600)], 'none');
    expect(long).toContain(`- ${'x'.repeat(497)}...\n`);
    const pair = resumedWorkSection(1, [`${'x'.repeat(496)}\u{1F600}${'y'.repeat(10)}`], 'none');
    expect(pair).toContain(`- ${'x'.repeat(496)}...\n`);
  });

  it('says the continue\'s message was carried out only when the resumed iteration closed it done (PD-ORCH-005 clause 17)', () => {
    expect(resumedWorkSection(1, ['later'], 'done')).toMatch(/already carried out its message\.$/);
    const pending = resumedWorkSection(1, ['the message', 'own'], 'pending');
    expect(pending).not.toContain('already');
    expect(pending).toMatch(/did not finish its message, which is among the pending tasks above and is taken up first\.$/);
    const none = resumedWorkSection(1, ['own'], 'none');
    expect(none).not.toContain('already');
    expect(none).toMatch(/follows as context\.$/);
  });

  it('says so when nothing is pending', () => {
    expect(resumedWorkSection(1, [], 'none')).toContain('Pending tasks:\n- (none)');
  });
});
