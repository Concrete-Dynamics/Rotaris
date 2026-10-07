/**
 * REQ-TRACE-239 in requirements-proof: a long task counts against putting the board on screen only if it ended after the
 * engine answered (`paintFrom`). Pinned on the shape traced on 2026-10-07: the view's first mount, 423 ms, ended before
 * the board was asked for, and the board's own paint was 32 ms.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { READ_LONGTASKS, readLongTasks, REVEAL_UNTIL_FOCUSED, revealUntilFocused } from './board-window.mjs';

type Page = { __rotarisArmedAt?: number; __rotarisLongTasks?: { at: number; ms: number }[]; __rotarisBoard?: Record<string, unknown> };
const page = globalThis as unknown as { window?: Page };
afterEach(() => { delete page.window; });

describe('the long tasks requirements-proof counts against a board put on screen', () => {
  it('leaves out the view\'s mount, which ended before the engine answered, and reports it apart', () => {
    page.window = { __rotarisArmedAt: 3959, __rotarisLongTasks: [{ at: 1385, ms: 142 }, { at: 4167, ms: 422 }, { at: 4722, ms: 89 }], __rotarisBoard: { paintMs: 32, paintFrom: 4650, ready: true, pending: 4, realised: 7, cards: 11, columns: 7 } };
    const r = readLongTasks();
    expect(r).toMatchObject({ longest: 89, count: 1, tasks: [89], beforeArrival: [422] });
    expect(r.board).toMatchObject({ paintMs: 32, paintFrom: 4650 });
  });

  it('counts a task that began before the answer and ended after it, and every task when no answer is known', () => {
    page.window = { __rotarisArmedAt: 0, __rotarisLongTasks: [{ at: 100, ms: 150 }], __rotarisBoard: { paintMs: 40, paintFrom: 200 } };
    expect(readLongTasks()).toMatchObject({ longest: 150, beforeArrival: [] });
    page.window = { __rotarisArmedAt: 0, __rotarisLongTasks: [{ at: 100, ms: 150 }] };
    expect(readLongTasks()).toMatchObject({ longest: 150, count: 1, beforeArrival: [], board: null });
  });

  it('is sent to the renderer as its own source, self-contained', () => {
    expect(READ_LONGTASKS.startsWith('(function readLongTasks()')).toBe(true);
    // One line, or the proof never finds the seam's log line for it; and no `;;`, the seam's step separator.
    expect(READ_LONGTASKS).not.toMatch(/\n/);
    expect(READ_LONGTASKS).not.toContain(';;');
    page.window = { __rotarisArmedAt: 10, __rotarisLongTasks: [{ at: 5, ms: 300 }, { at: 20, ms: 60 }] };
    expect(new Function(`return ${READ_LONGTASKS}`)()).toMatchObject({ longest: 60, count: 1 });
  });

  it('is the reader requirements-proof uses for every window it reads, and the proof keeps no reader of its own', () => {
    const proof = readFileSync(resolve(import.meta.dirname, '..', 'requirements-proof.mjs'), 'utf8');
    expect(proof).toMatch(/import \{[^}]*\bREAD_LONGTASKS\b[^}]*\} from '\.\/lib\/board-window\.mjs'/);
    expect(proof).not.toMatch(/const READ_LONGTASKS = /);
  });
});

/*
 * docs/defects/fixed/requirements-proofs-drop-stage-reads-a-revealed-cards-focus-two-frames-after-asking-for-it.md: the
 * drop stage read the focus exactly two frames after asking the board to reveal a card, and the board takes the focus
 * through React's scheduler and one more frame, so on a loaded host the stage read `focused: false` for a card focused a
 * moment later. It now waits frame by frame up to a bound; the focus is still required.
 */
describe('the drop stage waits for the revealed card to take the focus (REQ-TRACE-364)', () => {
  type Card = { id: string };
  /** A page whose board focuses the revealed card `afterFrames` frames after the reveal, as React's effect does. */
  const pageFocusingAfter = (afterFrames: number | null) => {
    const card: Card = { id: 'REQ-104' };
    const state = { frame: 0, active: null as Card | null, revealedAt: -1 };
    const g = globalThis as unknown as Record<string, unknown>;
    g['window'] = { __rotarisBoard: { reveal: (id: string) => { if (id !== 'REQ-104') return false; state.revealedAt = state.frame; return true; } } };
    g['document'] = { querySelector: (s: string) => (s === '[data-req-card="REQ-104"]' ? card : null), get activeElement() { return state.active; } };
    g['requestAnimationFrame'] = (cb: () => void) => setTimeout(() => {
      state.frame += 1;
      if (afterFrames !== null && state.revealedAt >= 0 && state.frame - state.revealedAt >= afterFrames) state.active = card;
      cb();
    }, 1);
    return state;
  };
  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g['document']; delete g['requestAnimationFrame'];
  });

  it('reads a focus that arrives on the fourth frame, which a two-frame read missed', async () => {
    pageFocusingAfter(4);
    const seen = await revealUntilFocused('REQ-104', 1000);
    expect(seen).toMatchObject({ revealed: true, focused: true, frames: 4 });
  });

  it('still answers unfocused when the focus never arrives within the bound, and stops at once for a card not revealed', async () => {
    pageFocusingAfter(null);
    expect(await revealUntilFocused('REQ-104', 30)).toMatchObject({ revealed: true, focused: false });
    expect(await revealUntilFocused('REQ-999', 1000)).toMatchObject({ revealed: false, focused: false, frames: 1 });
  });

  it('is what the drop stage sends, as one line with no step separator', () => {
    expect(REVEAL_UNTIL_FOCUSED.startsWith('(async function revealUntilFocused(')).toBe(true);
    expect(REVEAL_UNTIL_FOCUSED).not.toMatch(/\n/);
    expect(REVEAL_UNTIL_FOCUSED).not.toContain(';;');
    const proof = readFileSync(resolve(import.meta.dirname, '..', 'requirements-proof.mjs'), 'utf8');
    expect(proof).toMatch(/const seen = await \$\{REVEAL_UNTIL_FOCUSED\}\('REQ-104', 1000\)/);
    expect(proof).not.toMatch(/board\.reveal\('REQ-104'\); await new Promise/);
  });
});
