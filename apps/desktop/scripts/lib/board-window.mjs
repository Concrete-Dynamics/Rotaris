/**
 * What `requirements-proof` reads back of the long tasks the renderer observed in one window — the function below is
 * sent to the renderer as source (`(${readLongTasks})()`), so it may use nothing but the page's own globals: the arming
 * instant (`window.__rotarisArmedAt`), the observer's entries (`window.__rotarisLongTasks`, `{ at, ms }`) and the board's
 * observable (`window.__rotarisBoard`).
 *
 * REQ-TRACE-239 bounds the interface thread "putting a board on screen once the engine has answered". A long task that
 * ENDED before the engine's answer (`paintFrom`, the instant the board's own paint figure began) is not that work: the
 * Requirements view's first mount, which runs when Ctrl+4 shows it and before the board is even asked for, is one. Traced
 * on 2026-10-07 (finacc3, load 12 to 13 on four CPUs): a 423 ms mount task, 210 ms of it V8's lazy compilation of the
 * view's code, beside a board paint of 32 ms, and the proof read the 423 as the board's. Those tasks are reported apart
 * (`beforeArrival`) and never counted; every task that ended after the answer is counted, whatever it was, as before
 * (docs/defects/fixed/requirements-proof-counted-the-requirements-views-first-mount-against-the-board-on-screen.md).
 *
 * Nothing here is product code. It runs only from the proofs; `board-window.test.ts` pins it.
 */
export function readLongTasks() {
  const since = window.__rotarisArmedAt ?? 0;
  const b = window.__rotarisBoard;
  const from = b && typeof b.paintFrom === 'number' ? b.paintFrom : null;
  const inWindow = (window.__rotarisLongTasks ?? []).filter((t) => t.at >= since);
  const counted = inWindow.filter((t) => from === null || t.at + t.ms > from);
  const tasks = counted.map((t) => t.ms);
  return {
    longest: Math.max(0, ...tasks),
    count: tasks.length,
    tasks,
    beforeArrival: inWindow.filter((t) => from !== null && t.at + t.ms <= from).map((t) => t.ms),
    board: b ? { paintMs: b.paintMs, paintFrom: from, ready: b.ready, pending: b.pending, realised: b.realised, cards: b.cards, columns: b.columns } : null,
  };
}

/**
 * The expression the capture seam evaluates in the renderer, on ONE line: the seam logs each answer as
 * `capture: eval-at <ms> <expression> → <value>` and the proof reads that line back, so an expression spanning lines is
 * never matched (the first form answered `undefined` that way). The function holds no line comment, so joining is safe.
 */
export const READ_LONGTASKS = `(${readLongTasks.toString().replace(/\s*\n\s*/g, ' ')})()`;

/**
 * REQ-TRACE-364 in the drop stage: ask the board to reveal card `id`, then wait, frame by frame, until that card holds the
 * focus or `boundMs` has passed. Sent to the renderer as its own source, like `readLongTasks`, so it uses nothing but the
 * page's globals. Resolves with `{ revealed, focused, frames, ms }`.
 *
 * The board takes the focus through React — the reveal sets state, the render and its effect run on React's scheduler, and
 * the effect focuses the card in a further animation frame — and REQ-TRACE-364 fixes no number of frames for it. The stage
 * read the focus exactly two frames after asking until 2026-10-07 and went red on a loaded host for a card revealed and
 * focused moments later
 * (docs/defects/fixed/requirements-proofs-drop-stage-reads-a-revealed-cards-focus-two-frames-after-asking-for-it.md).
 * The focus is still required; what is no longer assumed is that it arrives within two frames.
 */
export async function revealUntilFocused(id, boundMs) {
  const board = window.__rotarisBoard;
  const revealed = board.reveal(id);
  const started = performance.now();
  let frames = 0;
  while (true) {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    frames += 1;
    const card = document.querySelector(`[data-req-card="${id}"]`);
    const ms = Math.round(performance.now() - started);
    if (card !== null && document.activeElement === card) return { revealed, focused: true, frames, ms };
    if (revealed !== true || ms >= boundMs) return { revealed, focused: false, frames, ms };
  }
}

/** `revealUntilFocused` as the one-line source the drop stage's expression calls (see `READ_LONGTASKS`). */
export const REVEAL_UNTIL_FOCUSED = `(${revealUntilFocused.toString().replace(/\s*\n\s*/g, ' ')})`;
