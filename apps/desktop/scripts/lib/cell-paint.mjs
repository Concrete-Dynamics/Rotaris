// @ts-check
/**
 * Whether a table's cells keep what they paint inside their own column (REQ-GIT-109, REQ-SHELL-022; the adopted design
 * language's table, `docs/design/README.md` §2, never lets one cell paint into the next).
 *
 * Two halves. `cellPaintProbe(tableSelector)` is a renderer expression for ROTARIS_CAPTURE_EVAL_AT: for the heading row
 * (keyed `header`) and every body row it measures each cell's border box and, for every text run and every drawn control
 * (a button, a tag) inside it, the run's own box and the part of it its clipping ancestors leave visible. It only
 * measures. `cellPaintFindings` is the verdict, a pure function with its test beside it:
 *
 *   - `overrun` — a visible run reaches past its own cell's border box: it is painted under the neighbouring cell. The
 *     Git view's bound worktree row did this until 2026-10-04, `completed · ready` running on under the Ahead figure
 *     (`docs/defects/fixed/the-git-views-worktree-state-cell-overruns-the-ahead-column.md`).
 *   - `cut` — a run is narrower on screen than it is laid out, because an ancestor inside the cell clips it. Allowed only
 *     in the columns named in `elide` (the ones whose content is shortened by design and carries its full text as a
 *     tooltip); anywhere else a cut run is text the reader cannot see.
 *
 * Four narrower checks beside it, each a pure function too: `runShownWhole` (a run that may elide but has room not to),
 * `runShowsLeadingChars` (an eliding run that still draws its first characters and the marker) and `controlsOutsideCell`
 * (a tag or button laid out past its cell's edge, which the cell's clip hides rather than paints over the next one), and
 * `cellsShortOfRow` (a cell whose box does not span its row's height — the Branch cell did not while it was itself the
 * flex box, so its border and selected background stopped short of the row's).
 *
 * The probe's text must not contain `;;` or `>>`, which the capture seam's step grammar splits on (`parseSteps`).
 *
 * Nothing here is product code. It runs only from the proofs.
 */

/** Pixels a run may pass an edge by before it counts: sub-pixel layout rounds both ways. */
export const CELL_PAINT_TOLERANCE = 1;

/**
 * The renderer expression that measures `tableSelector`'s body rows. Awaits the fonts and two frames, so a row painted
 * in the frame that matched is measured after its layout settled.
 * @param {string} tableSelector
 * @returns {string}
 */
export function cellPaintProbe(tableSelector) {
  const expression = `(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const table = document.querySelector(${JSON.stringify(tableSelector)});
    if (!table) return { error: 'no table' };
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const paddingBox = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { left: r.left + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.borderRightWidth) }; };
    const clipOf = (node, cell) => {
      let left = null, right = null;
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (getComputedStyle(el).overflowX !== 'visible') { const b = paddingBox(el); left = left === null ? b.left : Math.max(left, b.left); right = right === null ? b.right : Math.min(right, b.right); }
        if (el === cell) break;
      }
      return { clipLeft: left, clipRight: right };
    };
    const runsOf = (cell) => {
      const runs = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (t.textContent.trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        if (rects.length === 0) continue;
        runs.push({ text: t.textContent.trim(), left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), ...clipOf(t, cell) });
      }
      for (const el of cell.querySelectorAll('button, .tag')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) runs.push({ text: '[' + el.textContent.trim() + ']', left: r.left, right: r.right, ...clipOf(el, cell) });
      }
      return runs;
    };
    return {
      viewport: [innerWidth, innerHeight],
      rows: [...table.querySelectorAll('thead tr, tbody tr')].map((tr) => ({
        key: tr.parentElement.tagName === 'THEAD' ? 'header' : tr.dataset.session || tr.title || String(tr.rowIndex),
        top: tr.getBoundingClientRect().top, bottom: tr.getBoundingClientRect().bottom,
        cells: [...tr.cells].map((cell, i) => { const r = cell.getBoundingClientRect(); return { column: heads[i] ?? String(i), left: r.left, right: r.right, top: r.top, bottom: r.bottom, runs: runsOf(cell) }; }),
      })),
    };
  })()`;
  // One line: the seam logs the expression verbatim, and a log line is read line by line.
  return expression.replace(/\s*\n\s*/g, ' ');
}

/**
 * @typedef {{ text: string, left: number, right: number, clipLeft: number | null, clipRight: number | null }} Run
 * @typedef {{ column: string, left: number, right: number, runs: Run[] }} Cell
 * @typedef {{ key: string, cells: Cell[] }} Row
 * @typedef {{ row: string, column: string, kind: 'overrun' | 'cut', text: string, detail: string }} Finding
 */

/**
 * The verdict over one measurement: every run that paints outside its cell, and every run cut short in a column that
 * does not elide by design.
 * @param {{ rows?: Row[], error?: string } | null | undefined} measured
 * @param {{ elide?: string[], tolerance?: number }} [options]
 * @returns {Finding[]}
 */
export function cellPaintFindings(measured, options = {}) {
  if (!measured || typeof measured !== 'object') throw new Error('no cell measurement was taken');
  if (measured.error) throw new Error(`the cell measurement failed: ${measured.error}`);
  if (!Array.isArray(measured.rows) || measured.rows.length === 0) throw new Error('the cell measurement holds no rows');
  const elide = new Set(options.elide ?? []);
  const tol = options.tolerance ?? CELL_PAINT_TOLERANCE;
  const round = (n) => Math.round(n * 100) / 100;
  /** @type {Finding[]} */
  const findings = [];
  for (const row of measured.rows) {
    for (const cell of row.cells) {
      for (const run of cell.runs) {
        const visibleLeft = run.clipLeft === null ? run.left : Math.max(run.left, run.clipLeft);
        const visibleRight = run.clipRight === null ? run.right : Math.min(run.right, run.clipRight);
        if (visibleRight > visibleLeft && (visibleRight > cell.right + tol || visibleLeft < cell.left - tol)) {
          findings.push({ row: row.key, column: cell.column, kind: 'overrun', text: run.text, detail: `painted ${round(visibleLeft)}..${round(visibleRight)} in a cell spanning ${round(cell.left)}..${round(cell.right)}` });
        }
        const hidden = (run.right - run.left) - Math.max(0, visibleRight - visibleLeft);
        if (hidden > tol && !elide.has(cell.column)) {
          findings.push({ row: row.key, column: cell.column, kind: 'cut', text: run.text, detail: `${round(hidden)} px of ${round(run.right - run.left)} clipped` });
        }
      }
    }
  }
  return findings;
}

/**
 * Whether `text` is drawn whole somewhere in `column` of the row keyed `key` — the check for a run that may be cut by
 * design but has room not to be.
 * @param {{ rows?: Row[] }} measured
 * @param {string} key
 * @param {string} column
 * @param {string} text
 * @param {number} [tolerance]
 */
export function runShownWhole(measured, key, column, text, tolerance = CELL_PAINT_TOLERANCE) {
  const cell = measured.rows?.find((r) => r.key === key)?.cells.find((c) => c.column === column);
  const run = cell?.runs.find((r) => r.text === text);
  if (!run) return false;
  const visibleLeft = run.clipLeft === null ? run.left : Math.max(run.left, run.clipLeft);
  const visibleRight = run.clipRight === null ? run.right : Math.min(run.right, run.clipRight);
  return (run.right - run.left) - Math.max(0, visibleRight - visibleLeft) <= tolerance;
}

/**
 * Whether the run `text` in `column` of the row keyed `key` shows at least its first `count` characters and the elision
 * marker after them, or is drawn whole. The column's face is monospace (the Branch cell is `.mono`), so one character's
 * advance is the run's laid-out width over its length, and the marker takes one more. The Git view's base row drew no
 * character of `main` at the 1000×680 minimum until 2026-10-04, its two tags taking the cell's whole width
 * (`docs/defects/fixed/the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md`).
 * @param {{ rows?: Row[] }} measured
 * @param {string} key
 * @param {string} column
 * @param {string} text
 * @param {number} [count]
 * @param {number} [tolerance]
 */
export function runShowsLeadingChars(measured, key, column, text, count = 1, tolerance = CELL_PAINT_TOLERANCE) {
  const cell = measured.rows?.find((r) => r.key === key)?.cells.find((c) => c.column === column);
  const run = cell?.runs.find((r) => r.text === text);
  if (!run || text.length === 0) return false;
  if (runShownWhole(measured, key, column, text, tolerance)) return true;
  const visibleLeft = run.clipLeft === null ? run.left : Math.max(run.left, run.clipLeft);
  const visibleRight = run.clipRight === null ? run.right : Math.min(run.right, run.clipRight);
  const advance = (run.right - run.left) / text.length;
  return Math.max(0, visibleRight - visibleLeft) + tolerance >= advance * (Math.min(count, text.length) + 1);
}

/**
 * The drawn controls (a tag or a button, measured as `[label]`) in `column` of the row keyed `key` whose LAID-OUT box
 * reaches past the cell's border box. The cell's clip hides such a control instead of letting it paint into the next
 * cell, so `cellPaintFindings` never sees it; on screen the control is simply missing, or half of it is.
 * @param {{ rows?: Row[] }} measured
 * @param {string} key
 * @param {string} column
 * @param {number} [tolerance]
 * @returns {string[]}
 */
export function controlsOutsideCell(measured, key, column, tolerance = CELL_PAINT_TOLERANCE) {
  const cell = measured.rows?.find((r) => r.key === key)?.cells.find((c) => c.column === column);
  if (!cell) return [];
  return cell.runs.filter((r) => r.text.startsWith('[') && r.text.endsWith(']') && (r.right > cell.right + tolerance || r.left < cell.left - tolerance))
    .map((r) => `${r.text} laid out ${Math.round(r.left * 100) / 100}..${Math.round(r.right * 100) / 100} in a cell spanning ${Math.round(cell.left * 100) / 100}..${Math.round(cell.right * 100) / 100}`);
}

/**
 * Every cell whose box does not span its row's height, as `row column top..bottom of top..bottom`. A real table cell
 * always does; a cell given `display: flex` is wrapped in an anonymous cell and is only as tall as its content, so its
 * border and background stop short of its neighbours'. A row or cell measured without its height is skipped.
 * @param {{ rows?: Array<Row & { top?: number, bottom?: number }> }} measured
 * @param {number} [tolerance]
 * @returns {string[]}
 */
export function cellsShortOfRow(measured, tolerance = CELL_PAINT_TOLERANCE) {
  const out = [];
  const round = (n) => Math.round(n * 100) / 100;
  for (const row of measured.rows ?? []) {
    if (typeof row.top !== 'number' || typeof row.bottom !== 'number') continue;
    for (const c of /** @type {Array<Cell & { top?: number, bottom?: number }>} */ (row.cells)) {
      if (typeof c.top !== 'number' || typeof c.bottom !== 'number') continue;
      if (c.top > row.top + tolerance || c.bottom < row.bottom - tolerance) out.push(`${row.key} ${c.column} ${round(c.top)}..${round(c.bottom)} of ${round(row.top)}..${round(row.bottom)}`);
    }
  }
  return out;
}
