/**
 * Reading the capture seam's eval answers by offset AND expression (REQ-CHAT-032's model-chip check in `slash-proof`,
 * which read the usage notice scheduled at the same 5,900 ms). Pinned against log text in the seam's own shape, so a
 * probe can only ever read its own answer, and a schedule that still cannot tell two apart fails instead of choosing.
 */
import { describe, expect, it } from 'vitest';
import { redact } from '@rotaris/kernel';
import { parseEvals, readEval } from './capture-evals.mjs';
import { cellPaintProbe } from './cell-paint.mjs';

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
    expect(() => readEval(evals, 5900, undefined!)).toThrow(/needs the expression it reads/);
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

describe('an expression the application log echoes masked is still read as its own (REQ-TOOLS-171, REQ-TOOLS-172)', () => {
  // The application log runs every line through the one redaction pass, so the value after a name holding a
  // secret-looking segment (`key`) is masked in the echo: git-proof's cell probe, `key: tr.parentElement.tagName …`, is
  // logged as `key: *** === 'THEAD' …`. Pinned against the product's own pass, not a copy of it
  // (docs/archive/defects/rows-and-git-proofs-read-probe-and-eval-text-the-application-logs-redaction-pass-masks.md).
  const cells = cellPaintProbe('[data-testid="git-worktrees"] table.git__worktree-table');
  const logged = (at: number, expression: string, value: unknown) => redact(line(at, expression, value));

  it('the product masks the cell probe in its echo, so the cases below are not vacuous', () => {
    expect(logged(170000, cells, null)).toContain('key: *** ===');
    expect(logged(170000, cells, null)).not.toContain(cells);
  });

  it('git-proof\'s cell probe reads its answer from the masked echo', () => {
    const rows = { viewport: [1440, 900], rows: [{ key: 'header', cells: [] }] };
    expect(readEval(parseEvals(logged(170000, cells, rows)), 170000, cells)).toEqual(rows);
  });

  it('a masked echo is read only for the expression it masks, at its own offset', () => {
    const evals = parseEvals([logged(5, '({ key: a.b })', 1), logged(5, '({ other: a.b })', 2)].join('\n'));
    expect(readEval(evals, 5, '({ key: a.b })')).toBe(1);
    expect(readEval(evals, 5, '({ other: a.b })')).toBe(2);
    expect(readEval(evals, 5, '({ key: a.b, more: 1 })')).toBeUndefined();
    expect(readEval(evals, 6, '({ key: a.b })')).toBeUndefined();
  });

  it('two expressions that mask to one echo at one offset are ambiguous and throw rather than choose', () => {
    const evals = parseEvals([logged(5, '({ key: a.b })', 1), logged(5, '({ key: c.d })', 2)].join('\n'));
    expect(() => readEval(evals, 5, '({ key: a.b })')).toThrow(/2 evals of one expression logged at 5 ms/);
  });
});
