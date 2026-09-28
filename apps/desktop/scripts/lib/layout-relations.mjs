/**
 * The verdict half of a `UiLayoutContract` (`packages/ui/src/design-system/layout-contract.ts`),
 * as a pure function of measurements.
 *
 * The probe inside `ui-audit.mjs` runs in the renderer and MEASURES: boxes, computed values,
 * scroll extents, and what `elementFromPoint` returned at a centre. This module decides. The
 * split is deliberate — a verdict reached inside the page can only be exercised by launching
 * the product, and the four-for-four finding says the measuring code is exactly where a defect
 * hides. Every relation here is covered by `layout-relations.test.ts` against fixed numbers.
 */

/** REQ-SHELL-144..160 — the nine relations a component may publish. */
export const RELATION_KINDS = Object.freeze([
  'align-x', 'align-y', 'equal-width', 'equal-height', 'spacing-token',
  'containment', 'text-fit', 'hit-test', 'viewport-scroll',
]);

/** One CSS pixel, unless the relation states its own tolerance. */
export const DEFAULT_TOLERANCE = 1;

const round = (value) => Math.round(value * 100) / 100;

function edgeOf(box, name) {
  if (name === 'right') return box.right;
  if (name === 'center') return box.x + box.width / 2;
  if (name === 'bottom') return box.bottom;
  if (name === 'middle') return box.y + box.height / 2;
  if (name === 'top') return box.top;
  return box.left;
}

/**
 * @param relation one member of `UiLayoutRelation`
 * @param m measurement: `{ own, target, viewport, scroll, computed, hit }` — whichever the kind needs
 * @returns `{ pass, detail }`
 */
export function evaluateRelation(relation, m) {
  if (relation === null || typeof relation !== 'object' || typeof relation.kind !== 'string') {
    return { pass: false, detail: 'relation is not an object with a kind' };
  }
  if (!RELATION_KINDS.includes(relation.kind)) {
    return { pass: false, detail: `unknown relation kind ${relation.kind}` };
  }
  const tolerance = Number.isFinite(Number(relation.tolerance)) ? Number(relation.tolerance) : DEFAULT_TOLERANCE;

  if (relation.kind === 'align-x' || relation.kind === 'align-y') {
    if (m.target === null || m.target === undefined) return { pass: false, detail: 'missing target' };
    const name = relation.edge ?? (relation.kind === 'align-x' ? 'left' : 'top');
    const delta = edgeOf(m.own, name) - edgeOf(m.target, name);
    return { pass: Math.abs(delta) <= tolerance, detail: `${name} delta ${round(delta)}px` };
  }

  if (relation.kind === 'equal-width' || relation.kind === 'equal-height') {
    if (m.target === null || m.target === undefined) return { pass: false, detail: 'missing target' };
    const dimension = relation.kind === 'equal-width' ? 'width' : 'height';
    const delta = m.own[dimension] - m.target[dimension];
    return { pass: Math.abs(delta) <= tolerance, detail: `${dimension} delta ${round(delta)}px` };
  }

  if (relation.kind === 'spacing-token') {
    const actual = Number(m.computed?.property);
    const expected = Number(m.computed?.token);
    if (!Number.isFinite(expected)) return { pass: false, detail: `${relation.token} resolves to nothing` };
    if (!Number.isFinite(actual)) return { pass: false, detail: `${relation.property} is not a length` };
    return { pass: Math.abs(actual - expected) <= tolerance, detail: `${relation.property} ${actual}px; ${relation.token} ${expected}px` };
  }

  if (relation.kind === 'containment') {
    const box = m.target ?? m.viewport;
    if (box === null || box === undefined) return { pass: false, detail: 'missing target' };
    const pass = m.own.left >= box.left - tolerance && m.own.top >= box.top - tolerance
      && m.own.right <= box.right + tolerance && m.own.bottom <= box.bottom + tolerance;
    return { pass, detail: `box ${[m.own.left, m.own.top, m.own.right, m.own.bottom].map(Math.round).join(',')} in ${[box.left, box.top, box.right, box.bottom].map(Math.round).join(',')}` };
  }

  if (relation.kind === 'text-fit') {
    const axis = relation.axis ?? 'both';
    const x = m.scroll.scrollWidth <= m.scroll.clientWidth + tolerance;
    const y = m.scroll.scrollHeight <= m.scroll.clientHeight + tolerance;
    const pass = axis === 'x' ? x : axis === 'y' ? y : x && y;
    return { pass, detail: `client ${m.scroll.clientWidth}x${m.scroll.clientHeight}; scroll ${m.scroll.scrollWidth}x${m.scroll.scrollHeight}` };
  }

  if (relation.kind === 'hit-test') {
    // The centre may legitimately resolve to a child (an icon, a label) or to an ancestor that
    // paints the control's own surface; anything else is another element on top of it.
    const pass = m.hit?.self === true || m.hit?.descendant === true || m.hit?.ancestor === true;
    return { pass, detail: `centre ${m.hit?.x ?? '?'},${m.hit?.y ?? '?'}; hit ${m.hit?.element ?? '(nothing)'}` };
  }

  const x = m.scroll.scrollWidth > m.scroll.clientWidth + tolerance;
  const y = m.scroll.scrollHeight > m.scroll.clientHeight + tolerance;
  const actual = relation.axis === 'x' ? x : relation.axis === 'y' ? y : x || y;
  return { pass: actual === relation.expected, detail: `scrolls x=${x} y=${y}; expected ${relation.expected}` };
}

/**
 * Boxes standing shorter or narrower than the content inside them, with no scroll to reach the rest.
 *
 * This is the deterministic form of the reading that took a critic two cycles to make by hand, and it
 * is not the same question `text-fit` asks: `text-fit` is opt-in, published by a component about
 * itself, and it caught nothing here because nobody thought to publish it on a header. The defect it
 * would have caught (UIR-014) is a property of EVERY box: a view is a `flex-direction: column` and its
 * children carry the default `flex-shrink: 1`, so when the content of a short window exceeds it, the
 * column takes the difference out of whichever child will give — down to its `min-height`, which reads
 * like a floor and is only a limit. The box ends up smaller than what it holds while the content keeps
 * its size, and because the box does not scroll nothing is CLIPPED: the remainder simply pays out past
 * the edge, where the next sibling's background covers it. That is invisible to a containment check
 * (the child is inside the view), invisible to a stacking check (nothing is on top of the control's
 * own centre), and plain in two numbers that were already in `geometry.json` all along.
 *
 * An element that scrolls is excluded: overflowing content with a way to reach it is a scroll
 * container doing its job. Only `visible` on the axis counts, and only the marked components and
 * contract boxes are examined, which is what keeps this from reporting every decorative overflow
 * in the product.
 */
export function shrunkBoxes(geometryItems, styleItems, tolerance = DEFAULT_TOLERANCE) {
  if (geometryItems.length !== styleItems.length) {
    return [{ element: '(audit)', id: null, component: null, axis: 'both', detail: `the probe returned ${geometryItems.length} boxes and ${styleItems.length} style rows; they are read pairwise` }];
  }
  const rows = [];
  geometryItems.forEach((item, index) => {
    const style = styleItems[index];
    const axes = [
      { axis: 'y', overflow: style.overflowY, content: item.scrollHeight, box: item.clientHeight },
      { axis: 'x', overflow: style.overflowX, content: item.scrollWidth, box: item.clientWidth },
    ];
    for (const { axis, overflow, content, box } of axes) {
      if (overflow !== 'visible') continue;
      if (!Number.isFinite(content) || !Number.isFinite(box) || box === 0) continue;
      if (content <= box + tolerance) continue;
      rows.push({ element: item.element, id: item.id ?? null, component: item.component ?? null, axis,
        detail: `${axis === 'y' ? 'client height' : 'client width'} ${box} holds content ${content} and does not scroll` });
    }
  });
  return rows;
}

/** Every measurement the probe collected, judged. */
export function evaluateContracts(measured) {
  return measured.flatMap((entry) => {
    if (entry.unreadable === true) return [{ id: entry.id, kind: 'schema', target: null, pass: false, detail: entry.reason ?? 'contract JSON is unreadable' }];
    return entry.relations.map(({ relation, measurement }) => ({
      id: entry.id,
      kind: relation.kind,
      target: relation.target ?? null,
      ...evaluateRelation(relation, measurement),
    }));
  });
}
