/**
 * `pnpm terminal-proof`'s waits, beside the Electron half that uses them (`main.cjs`).
 *
 * `webContents.sendInputEvent` returns before the page has the event, and `executeJavaScript` travels on another channel
 * that can overtake it. Until 2026-10-01 each input in the proof was followed by a FIXED pause and the state read after it,
 * and on a loaded host the read could come first: `wheel.subNotch`, `selection.text` and `selection.emptyCopyFails` went
 * red at random, a race in the proof and not a fault in the grid
 * (`docs/archive/defects/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`). An input fence waits
 * instead until the page has COUNTED the event, which the page does in the capture phase of the same dispatch the grid
 * handles it in, and a fence that times out is recorded rather than read as a pass.
 */
const defaultPause = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls `pred` until it answers truthy (its answer) or `ms` pass (null).
 * @template T
 * @param {() => T | Promise<T>} pred
 * @param {number} ms
 * @param {number} [every]
 * @param {(ms: number) => Promise<unknown>} [pause]
 * @returns {Promise<T | null>}
 */
async function until(pred, ms, every = 10, pause = defaultPause) {
  const t0 = Date.now();
  for (;;) {
    const v = await pred();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await pause(every);
  }
}

/**
 * A fence over the page's input counters. `read` answers the counters (`{ keydowns, pointerUps, wheels }`); the fence
 * resolves true once `field` has passed `before`, and false after `ms` — with the miss pushed onto `misses`, so the proof
 * names an input the page never counted instead of reading the state it did not change.
 * @param {{ read: () => Promise<Record<string, number>>, misses: unknown[], pause?: (ms: number) => Promise<unknown> }} options
 */
function inputFence({ read, misses, pause = defaultPause }) {
  return async (/** @type {string} */ what, /** @type {string} */ field, /** @type {number} */ before, ms = 5_000) => {
    const got = await until(async () => (((await read())[field] ?? Number.NEGATIVE_INFINITY) > before ? true : null), ms, 10, pause);
    if (got === null) misses.push({ what, field, before, now: (await read())[field] });
    return got !== null;
  };
}

module.exports = { until, inputFence };
