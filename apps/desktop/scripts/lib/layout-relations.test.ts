/**
 * Every `UiLayoutContract` relation, against fixed numbers.
 *
 * The probe that feeds these measurements runs in the renderer and is exercised by
 * `pnpm ui-audit`; what this file pins is the verdict — including the direction each
 * relation fails in, because a relation that cannot fail is a proof that proves nothing
 * (`codebase.md`, the sixty-eighth defect's family).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the audit library is plain ESM beside the scripts that run it.
import { DEFAULT_TOLERANCE, RELATION_KINDS, evaluateContracts, evaluateRelation, shrunkBoxes } from './layout-relations.mjs';

const box = (x: number, y: number, width: number, height: number) => ({
  x, y, width, height, left: x, top: y, right: x + width, bottom: y + height,
});
const viewport = box(0, 0, 1400, 900);
const scroll = (clientWidth: number, clientHeight: number, scrollWidth: number, scrollHeight: number) => ({
  clientWidth, clientHeight, scrollWidth, scrollHeight,
});

describe('layout-contract relations', () => {
  it('declares the nine relations and a one-pixel tolerance', () => {
    expect(RELATION_KINDS).toEqual([
      'align-x', 'align-y', 'equal-width', 'equal-height', 'spacing-token',
      'containment', 'text-fit', 'hit-test', 'viewport-scroll',
    ]);
    expect(DEFAULT_TOLERANCE).toBe(1);
  });

  it('refuses a relation it does not know, rather than passing it', () => {
    expect(evaluateRelation({ kind: 'looks-nice' }, { own: box(0, 0, 1, 1) }).pass).toBe(false);
    expect(evaluateRelation(null, {}).pass).toBe(false);
    expect(evaluateRelation({ kind: 'align-x' }, { own: box(0, 0, 1, 1), target: null }).detail).toBe('missing target');
  });

  describe('align-x', () => {
    it('holds within tolerance and fails outside it', () => {
      const own = box(100, 10, 80, 20);
      expect(evaluateRelation({ kind: 'align-x' }, { own, target: box(100.5, 400, 200, 20) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'align-x' }, { own, target: box(103, 400, 200, 20) }).pass).toBe(false);
    });

    it('reads the named edge, not the box', () => {
      const own = box(100, 10, 80, 20);
      const target = box(60, 400, 120, 20);
      expect(evaluateRelation({ kind: 'align-x', edge: 'right' }, { own, target }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'align-x', edge: 'left' }, { own, target }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'align-x', edge: 'center' }, { own, target }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'align-x', edge: 'center' }, { own, target: box(120, 400, 40, 20) }).pass).toBe(true);
    });

    it('honours a wider tolerance the relation states itself', () => {
      const own = box(100, 10, 80, 20);
      expect(evaluateRelation({ kind: 'align-x', tolerance: 4 }, { own, target: box(103, 400, 200, 20) }).pass).toBe(true);
    });
  });

  describe('align-y', () => {
    it('defaults to the top edge and reads middle and bottom when named', () => {
      const own = box(10, 100, 80, 40);
      const target = box(400, 100, 80, 40);
      expect(evaluateRelation({ kind: 'align-y' }, { own, target }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'align-y', edge: 'middle' }, { own, target: box(400, 110, 80, 20) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'align-y', edge: 'bottom' }, { own, target: box(400, 120, 80, 20) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'align-y', edge: 'top' }, { own, target: box(400, 120, 80, 20) }).pass).toBe(false);
    });
  });

  describe('equal-width and equal-height', () => {
    it('compares the dimension it names and no other', () => {
      const own = box(0, 0, 120, 32);
      expect(evaluateRelation({ kind: 'equal-width' }, { own, target: box(500, 0, 120.5, 200) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'equal-width' }, { own, target: box(500, 0, 140, 32) }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'equal-height' }, { own, target: box(500, 0, 999, 32) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'equal-height' }, { own, target: box(500, 0, 120, 44) }).pass).toBe(false);
    });
  });

  describe('spacing-token', () => {
    it('passes when the declaration equals the resolved token', () => {
      const result = evaluateRelation({ kind: 'spacing-token', property: 'gap', token: '--rt-space-3' },
        { own: box(0, 0, 10, 10), computed: { property: 12, token: 12 } });
      expect(result.pass).toBe(true);
      expect(result.detail).toContain('--rt-space-3 12px');
    });

    it('fails an unresolved token rather than reading the fallback as compliance', () => {
      const result = evaluateRelation({ kind: 'spacing-token', property: 'gap', token: '--rt-space-nope' },
        { own: box(0, 0, 10, 10), computed: { property: 12, token: Number.NaN } });
      expect(result.pass).toBe(false);
      expect(result.detail).toBe('--rt-space-nope resolves to nothing');
    });

    it('fails a declaration that is not a length', () => {
      expect(evaluateRelation({ kind: 'spacing-token', property: 'gap', token: '--rt-space-3' },
        { own: box(0, 0, 10, 10), computed: { property: Number.NaN, token: 12 } }).pass).toBe(false);
    });

    it('fails a declaration that resolved to a different token', () => {
      expect(evaluateRelation({ kind: 'spacing-token', property: 'padding-left', token: '--rt-space-3' },
        { own: box(0, 0, 10, 10), computed: { property: 20, token: 12 } }).pass).toBe(false);
    });
  });

  describe('containment', () => {
    it('falls back to the viewport and catches an escape on each side', () => {
      expect(evaluateRelation({ kind: 'containment' }, { own: box(20, 20, 200, 40), target: null, viewport }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'containment' }, { own: box(-8, 20, 200, 40), target: null, viewport }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'containment' }, { own: box(20, 880, 200, 40), target: null, viewport }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'containment' }, { own: box(1300, 20, 200, 40), target: null, viewport }).pass).toBe(false);
    });

    it('uses the named target when there is one', () => {
      const own = box(120, 120, 100, 20);
      expect(evaluateRelation({ kind: 'containment', target: 'card' }, { own, target: box(100, 100, 200, 200), viewport }).pass).toBe(true);
      // Narrower than its own child: the card's right edge is 200 and the child's is 220.
      expect(evaluateRelation({ kind: 'containment', target: 'card' }, { own, target: box(100, 100, 100, 100), viewport }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'containment', target: 'card' }, { own, target: box(100, 100, 200, 10), viewport }).pass).toBe(false);
    });
  });

  describe('text-fit', () => {
    it('passes unclipped text and fails a clipped axis', () => {
      expect(evaluateRelation({ kind: 'text-fit' }, { own: box(0, 0, 100, 20), scroll: scroll(100, 20, 100, 20) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'text-fit' }, { own: box(0, 0, 100, 20), scroll: scroll(100, 20, 260, 20) }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'text-fit', axis: 'y' }, { own: box(0, 0, 100, 20), scroll: scroll(100, 20, 260, 20) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'text-fit', axis: 'x' }, { own: box(0, 0, 100, 20), scroll: scroll(100, 20, 260, 20) }).pass).toBe(false);
    });
  });

  describe('hit-test', () => {
    it('accepts the element, a descendant and an ancestor of it', () => {
      const own = box(10, 10, 100, 30);
      expect(evaluateRelation({ kind: 'hit-test' }, { own, hit: { x: 60, y: 25, element: 'button.btn', self: true, descendant: false, ancestor: false } }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'hit-test' }, { own, hit: { x: 60, y: 25, element: 'i.ph', self: false, descendant: true, ancestor: false } }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'hit-test' }, { own, hit: { x: 60, y: 25, element: 'div.card', self: false, descendant: false, ancestor: true } }).pass).toBe(true);
    });

    it('fails when another element covers the centre, and when nothing is there', () => {
      const own = box(10, 10, 100, 30);
      expect(evaluateRelation({ kind: 'hit-test' }, { own, hit: { x: 60, y: 25, element: 'div.scrim', self: false, descendant: false, ancestor: false } }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'hit-test' }, { own, hit: { x: 60, y: 25, element: null, self: false, descendant: false, ancestor: false } }).detail).toContain('(nothing)');
    });
  });

  describe('viewport-scroll', () => {
    it('asserts the presence and the absence of a scroll on the named axis', () => {
      const own = box(0, 0, 400, 300);
      expect(evaluateRelation({ kind: 'viewport-scroll', axis: 'y', expected: true }, { own, scroll: scroll(400, 300, 400, 900) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'viewport-scroll', axis: 'y', expected: false }, { own, scroll: scroll(400, 300, 400, 900) }).pass).toBe(false);
      expect(evaluateRelation({ kind: 'viewport-scroll', axis: 'x', expected: false }, { own, scroll: scroll(400, 300, 400, 900) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'viewport-scroll', axis: 'both', expected: true }, { own, scroll: scroll(400, 300, 900, 300) }).pass).toBe(true);
      expect(evaluateRelation({ kind: 'viewport-scroll', axis: 'both', expected: false }, { own, scroll: scroll(400, 300, 400, 300) }).pass).toBe(true);
    });
  });

  describe('evaluateContracts', () => {
    it('carries the element id, kind and target onto every verdict', () => {
      const verdicts = evaluateContracts([
        { id: 'header-actions', unreadable: false, relations: [
          { relation: { kind: 'align-x', target: 'content', edge: 'right' }, measurement: { own: box(100, 0, 100, 20), target: box(0, 0, 200, 20) } },
          { relation: { kind: 'hit-test' }, measurement: { own: box(100, 0, 100, 20), hit: { x: 150, y: 10, element: 'div.scrim', self: false, descendant: false, ancestor: false } } },
        ] },
      ]);
      expect(verdicts).toEqual([
        { id: 'header-actions', kind: 'align-x', target: 'content', pass: true, detail: 'right delta 0px' },
        { id: 'header-actions', kind: 'hit-test', target: null, pass: false, detail: 'centre 150,10; hit div.scrim' },
      ]);
    });

    it('reports an unreadable contract as a failing schema row', () => {
      expect(evaluateContracts([{ id: 'broken', unreadable: true, relations: [] }])).toEqual([
        { id: 'broken', kind: 'schema', target: null, pass: false, detail: 'contract JSON is unreadable' },
      ]);
    });
  });

  /**
   * UIR-014's numbers are the fixtures: a header measured 56 tall around content standing 76, on an
   * axis whose overflow was `visible`, so the twenty pixels paid out under the card below it.
   */
  describe('shrunkBoxes', () => {
    const geometry = (element: string, clientHeight: number, scrollHeight: number, clientWidth = 916, scrollWidth = 916) => ({
      id: null, component: 'PageHeader', element, x: 0, y: 0, width: clientWidth, height: clientHeight,
      clientWidth, clientHeight, scrollWidth, scrollHeight,
    });
    const style = (overflowY = 'visible', overflowX = 'visible') => ({ id: null, component: 'PageHeader', element: 'x', overflowX, overflowY });

    it('reports a box standing shorter than the content it holds', () => {
      const rows = shrunkBoxes([geometry('div.page-header.git__header', 56, 76)], [style()]);
      expect(rows).toEqual([{
        element: 'div.page-header.git__header', id: null, component: 'PageHeader', axis: 'y',
        detail: 'client height 56 holds content 76 and does not scroll',
      }]);
    });

    it('says nothing about the same box once it takes its content', () => {
      expect(shrunkBoxes([geometry('div.page-header.git__header', 76, 76)], [style()])).toEqual([]);
    });

    it('excuses a box that scrolls, on the axis that scrolls', () => {
      expect(shrunkBoxes([geometry('div.git__table-body', 300, 900)], [style('auto')])).toEqual([]);
      expect(shrunkBoxes([geometry('div.git__table-body', 300, 900)], [style('hidden')])).toEqual([]);
      // Scrolling on one axis is no excuse on the other.
      expect(shrunkBoxes([geometry('div.card', 300, 900, 400, 1200)], [style('auto', 'visible')])
        .map((row) => row.axis)).toEqual(['x']);
    });

    it('holds its peace inside one pixel, and reports both axes when both give way', () => {
      expect(shrunkBoxes([geometry('div.card', 56, 57)], [style()])).toEqual([]);
      expect(shrunkBoxes([geometry('div.card', 56, 76, 400, 500)], [style()]).map((row) => row.axis)).toEqual(['y', 'x']);
    });

    it('reports the audit itself when the two probes disagree on how many boxes there were', () => {
      const rows = shrunkBoxes([geometry('div.card', 56, 76)], []);
      expect(rows).toHaveLength(1);
      expect(rows[0].element).toBe('(audit)');
      expect(rows[0].detail).toContain('read pairwise');
    });

    it('ignores a box with no height rather than dividing by its absence', () => {
      expect(shrunkBoxes([geometry('div.collapsed', 0, 76)], [style()])).toEqual([]);
    });
  });
});
