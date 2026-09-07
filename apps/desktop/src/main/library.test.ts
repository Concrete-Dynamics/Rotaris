import { describe, expect, it, vi } from 'vitest';
import { LIBRARY_CHANGES } from '@rotaris/contracts';
import { createLibraryRevision } from './library.js';

describe('main — the library revision (Part X; REQ-LIBRARY-105)', () => {
  it('is closed to the four things REQ-LIBRARY-105 defines a library change as, and to nothing else', () => {
    expect([...LIBRARY_CHANGES]).toEqual(['prompt-history', 'prompt-stash', 'session-artifacts', 'improvement-artifacts']);
    // The set names no setting of any kind: enabling a tool server, switching a skills mode and changing a model
    // slot are the three the requirement calls out, and none of them can be spelled as a member.
    for (const forbidden of ['settings', 'mcp-server', 'skills-mode', 'model-slot', 'theme', 'preference']) {
      expect(LIBRARY_CHANGES).not.toContain(forbidden);
    }
  });

  it('starts at zero, rises by one per change, and broadcasts each move exactly once', () => {
    const seen: { revision: number; change: string }[] = [];
    const counter = createLibraryRevision((revision, change) => seen.push({ revision, change }));
    expect(counter.value).toBe(0);
    expect(counter.bump('prompt-stash')).toBe(1);
    expect(counter.bump('prompt-history')).toBe(2);
    expect(counter.bump('session-artifacts')).toBe(3);
    expect(counter.value).toBe(3);
    expect(seen).toEqual([{ revision: 1, change: 'prompt-stash' }, { revision: 2, change: 'prompt-history' }, { revision: 3, change: 'session-artifacts' }]);
  });

  it('does not move for anything outside that set — a settings change bumps nothing and broadcasts nothing', () => {
    const onChange = vi.fn();
    const counter = createLibraryRevision(onChange);
    counter.bump('prompt-history');
    expect(counter.value).toBe(1);
    // The three REQ-LIBRARY-105 names, as a value that crossed a boundary as a string would arrive.
    for (const settingsChange of ['tool-server-enabled', 'skills-mode', 'model-slot']) {
      expect(counter.bump(settingsChange as never)).toBe(1);
    }
    expect(counter.value).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('never goes backwards, so a surface that has seen a number is never told to re-read an older state', () => {
    const counter = createLibraryRevision();
    let previous = counter.value;
    for (const change of [...LIBRARY_CHANGES, ...LIBRARY_CHANGES]) {
      const next = counter.bump(change);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
    expect(counter.value).toBe(LIBRARY_CHANGES.length * 2);
  });
});
