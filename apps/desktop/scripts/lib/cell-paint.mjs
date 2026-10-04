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
 *     Git view's bound worktree row does this, `completed · ready` running on under the Ahead figure
 *     (`docs/defects/the-git-views-worktree-state-cell-overruns-the-ahead-column.md`).
 *   - `cut` — a run is narrower on screen than it is laid out, because an ancestor inside the cell clips it. Allowed only
 *     in the columns named in `elide` (the ones whose content is shortened by design and carries its full text as a
 *     tooltip); anywhere else a cut run is text the reader cannot see.
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
        cells: [...tr.cells].map((cell, i) => { const r = cell.getBoundingClientRect(); return { column: heads[i] ?? String(i), left: r.left, right: r.right, runs: runsOf(cell) }; }),
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
