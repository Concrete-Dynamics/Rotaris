import { describe, expect, it } from 'vitest';
import { UserPresence } from './presence.js';

describe('the run\'s away state (PD-TOOLS-005)', () => {
  const holder = () => {
    const lines: string[] = [];
    return { presence: new UserPresence({ record: (m) => lines.push(m) }), lines };
  };

  it('starts present, is marked away once by a timeout, and records the transition with the timeout that expired', () => {
    const { presence, lines } = holder();
    expect(presence.away()).toBeNull();
    expect(presence.markAway(300)).toBe(true);
    expect(presence.away()).toEqual({ afterSeconds: 300 });
    // A second timeout while away — an ask that was already waiting when the first expired — is not a second transition.
    expect(presence.markAway(300)).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^user away: an approval in this run went unanswered for 300 seconds/);
    expect(lines[0]).toContain('PD-TOOLS-005');
  });

  it('returns on input, once, recording the stretch it ended; input while present records nothing', () => {
    const { presence, lines } = holder();
    expect(presence.returned()).toBe(false);
    expect(lines).toHaveLength(0);
    presence.markAway(5);
    expect(presence.returned()).toBe(true);
    expect(presence.away()).toBeNull();
    expect(presence.returned()).toBe(false);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^user returned: .*unanswered for 5 seconds/);
    // Away again after a return: the next timeout is a new stretch.
    expect(presence.markAway(5)).toBe(true);
    expect(presence.away()).toEqual({ afterSeconds: 5 });
  });
});
