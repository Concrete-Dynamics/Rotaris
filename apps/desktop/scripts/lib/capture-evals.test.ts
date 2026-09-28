/**
 * Reading the capture seam's eval answers by offset AND expression (REQ-CHAT-032's model-chip check in `slash-proof`,
 * which read the usage notice scheduled at the same 5,900 ms). Pinned against log text in the seam's own shape, so a
 * probe can only ever read its own answer, and a schedule that still cannot tell two apart fails instead of choosing.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { parseEvals, readEval } from './capture-evals.mjs';

const readNotice = `(() => { const n = document.querySelector('[data-testid="notice"]'); return n ? { title: n.textContent } : null; })()`;
const openChip = `(() => { const t = document.querySelector('[data-testid="chip-model"]'); if (!t) return 'no chip'; t.click(); return 'opened'; })()`;
const line = (at: number, expression: string, value: unknown) => `[main] capture: eval-at ${at} ${expression} → ${JSON.stringify(value)}`;

describe('two probes at one offset each read their own answer (REQ-CHAT-032)', () => {
  const log = [
    'unrelated line',
    line(5900, readNotice, { title: 'Command not run' }),
    line(5900, openChip, 'opened'),
    line(5950, '[...document.querySelectorAll("[role=option]")].map((o) => o.dataset.value)', ['scripted', 'scripted-2']),
  ].join('\n');
  const evals = parseEvals(log);

  it('the chip probe reads "opened", not the notice logged before it', () => {
    expect(readEval(evals, 5900, openChip)).toBe('opened');
    expect(readEval(evals, 5900, readNotice)).toEqual({ title: 'Command not run' });
  });

  it('an expression logged at another offset is not read', () => {
    expect(readEval(evals, 5950, openChip)).toBeUndefined();
    expect(readEval(evals, 6000, readNotice)).toBeUndefined();
  });

  it('a read without its expression is refused: the offset alone does not name a probe', () => {
    expect(() => readEval(evals, 5900, undefined)).toThrow(/needs the expression it reads/);
    expect(() => readEval(evals, 5900, '  ')).toThrow(/needs the expression it reads/);
  });

  it('the same expression logged twice at one offset is ambiguous and throws', () => {
    const twice = parseEvals([line(100, readNotice, null), line(100, readNotice, { title: 'x' })].join('\n'));
    expect(() => readEval(twice, 100, readNotice)).toThrow(/2 evals of one expression logged at 100 ms/);
  });
});

describe('the answer is the seam\'s JSON, read as the old reader read it', () => {
  it('JSON values parse; a value that is not JSON stays text; a CR from a Windows pipe is dropped', () => {
    const evals = parseEvals([line(1, 'document.title', 'Rotaris'), `capture: eval-at 2 window.x → undefined`, `${line(3, '1 + 1', 2)}\r`].join('\n'));
    expect(readEval(evals, 1, 'document.title')).toBe('Rotaris');
    expect(readEval(evals, 2, 'window.x')).toBe('undefined');
    expect(readEval(evals, 3, '1 + 1')).toBe(2);
  });

  it('an arrow inside the answer does not cut it, and the expression is matched trimmed, as the seam trims each step', () => {
    const evals = parseEvals(line(7, 'probe()', { message: 'a → b' }));
    expect(readEval(evals, 7, '  probe()  ')).toEqual({ message: 'a → b' });
  });

  it('null is an answer, distinct from no answer', () => {
    const evals = parseEvals(line(9, readNotice, null));
    expect(readEval(evals, 9, readNotice)).toBeNull();
    expect(readEval(evals, 10, readNotice)).toBeUndefined();
  });
});
