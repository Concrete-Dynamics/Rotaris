/**
 * REQ-TRACE-239 in requirements-proof: a long task counts against putting the board on screen only if it ended after the
 * engine answered (`paintFrom`). Pinned on the shape traced on 2026-10-07: the view's first mount, 423 ms, ended before
 * the board was asked for, and the board's own paint was 32 ms.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { READ_LONGTASKS, readLongTasks } from './board-window.mjs';

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
    expect(proof).toMatch(/import \{ READ_LONGTASKS \} from '\.\/lib\/board-window\.mjs'/);
    expect(proof).not.toMatch(/const READ_LONGTASKS = /);
  });
});
