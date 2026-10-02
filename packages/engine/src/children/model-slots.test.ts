import { describe, expect, it } from 'vitest';
import { ModelSlots, type SlotHolder } from './model-slots.js';

describe('ModelSlots — the process-wide per-model count (REQ-CONFIG-094, REQ-MONITOR-020, acceptance A13)', () => {
  function holder(counts: Record<string, number>, woken: string[], name: string): SlotHolder {
    return { inUse: (k) => counts[k] ?? 0, wake: () => { woken.push(name); } };
  }

  it('REQ-CONFIG-094: a run is asked the slots every OTHER run under way holds on the key, never its own', () => {
    const slots = new ModelSlots();
    const woken: string[] = [];
    const a = holder({ k: 2, other: 5 }, woken, 'a');
    const b = holder({ k: 1 }, woken, 'b');
    const c = holder({}, woken, 'c');
    slots.join(a); slots.join(b); slots.join(c);
    expect(slots.heldElsewhere('k', a)).toBe(1);
    expect(slots.heldElsewhere('k', b)).toBe(2);
    expect(slots.heldElsewhere('k', c)).toBe(3);
    // Two keys never share a count.
    expect(slots.heldElsewhere('other', b)).toBe(5);
  });

  it('REQ-MONITOR-020: a slot freed in one run wakes every other run; a run that leaves wakes them too and counts no longer', () => {
    const slots = new ModelSlots();
    const woken: string[] = [];
    const a = holder({ k: 1 }, woken, 'a');
    const b = holder({}, woken, 'b');
    const c = holder({}, woken, 'c');
    const leaveA = slots.join(a); slots.join(b); slots.join(c);
    slots.freed(a);
    expect(woken).toEqual(['b', 'c']);
    woken.length = 0;
    leaveA();
    expect(woken).toEqual(['b', 'c']);
    expect(slots.heldElsewhere('k', b)).toBe(0);
    // Leaving twice frees nothing more.
    woken.length = 0;
    leaveA();
    expect(woken).toEqual([]);
  });

  it('a run whose wake raises is reported, and the others are still woken', () => {
    const warnings: string[] = [];
    const slots = new ModelSlots((m) => warnings.push(m));
    const woken: string[] = [];
    const a = holder({}, woken, 'a');
    slots.join(a);
    slots.join({ inUse: () => 0, wake: () => { throw new Error('boom'); } });
    slots.join(holder({}, woken, 'c'));
    slots.freed(a);
    expect(woken).toEqual(['c']);
    expect(warnings).toEqual(['a run woken for a freed model slot raised: Error: boom']);
  });
});
