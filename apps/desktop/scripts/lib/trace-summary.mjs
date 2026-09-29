/**
 * What a Chromium trace says about one apply-to-paint sample (REQ-CHAT-055's measurement point, ADR-0045).
 *
 * `transcript-proof`'s append comparison launches the built app with Chromium's own startup-tracing switches
 * (`--trace-startup`, `--trace-startup-file`, `--trace-startup-format=json`), and the renderer brackets every
 * transcript increment it applies with two user-timing marks — `rotaris:apply:<seq>` at the moment the increment
 * arrived and `rotaris:shown:<seq>` at the frame after the one that showed it (`apps/desktop/src/renderer/shell.ts`).
 * This module reads the trace back and says, for each such window, how the renderer's main thread spent it:
 * style recalculation, layout, pre-paint, paint, the compositor commit, the `ResizeObserver` delivery, script, or
 * nothing. It is the measurement the defect note `appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript`
 * asked for in its second step (R-048), and it is pure so that `trace-summary.test.ts` can pin its arithmetic.
 *
 * Two readings that keep the sums honest:
 *
 *  - **Self time, attributed upward.** A trace event's self time is its duration less its children's. Each event's
 *    self time is charged to the nearest bucketed ancestor-or-self, so Blink's internal events under
 *    `UpdateLayoutTree` count as style and a `FunctionCall` inside a `ResizeObserver` delivery counts as script. The
 *    buckets of one window therefore add up to at most the window's length; what is left is the main thread idle,
 *    waiting for the next frame.
 *  - **A forced layout is a layout under script.** `Layout` or `UpdateLayoutTree` whose ancestor chain holds a
 *    script event ran because script read a layout-dependent property; those are summed apart, because the note's
 *    second candidate was exactly that — a pin-to-bottom scroll write forcing a synchronous layout.
 *
 * Nothing here is product code. It runs only from the proofs.
 */

/** The event names charged to each bucket. A name outside every list is charged to its nearest bucketed ancestor. */
export const BUCKETS = Object.freeze({
  style: ['UpdateLayoutTree'],
  layout: ['Layout'],
  prePaint: ['PrePaint'],
  paint: ['Paint'],
  commit: ['Commit', 'UpdateLayerTree'],
  observers: ['LocalFrameView::NotifyResizeObservers'],
  script: ['FunctionCall', 'RunMicrotasks', 'EvaluateScript', 'v8.callFunction', 'V8.Execute', 'TimerFire', 'EventDispatch'],
  hitTest: ['HitTest'],
});
export const BUCKET_NAMES = Object.freeze(Object.keys(BUCKETS));
const SCRIPT_BUCKET = 'script';
const LAYOUT_LIKE = new Set([...BUCKETS.style, ...BUCKETS.layout]);

/** One main-thread frame, as the compositor's main-side proxy names it; the count of these in a window is its frame count. */
export const MAIN_FRAME_EVENT = 'ProxyMain::BeginMainFrame';
/** The scroll offset of a scroller being set — the tail pin, or the reader. */
export const SCROLL_EVENT = 'ScrollableArea::SetScrollOffset';

const bucketByName = new Map();
for (const [bucket, names] of Object.entries(BUCKETS)) for (const name of names) bucketByName.set(name, bucket);

/** The bucket a trace event name belongs to, or null when it is charged to its ancestor. */
export function bucketOf(name) {
  return bucketByName.get(name) ?? null;
}

/** The events of a trace file whichever of the two shapes it was written in. */
export function readTrace(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.traceEvents)) return raw.traceEvents;
  throw new Error('not a Chromium trace: neither an event array nor an object with traceEvents');
}

/**
 * The complete (`X`) events of one thread, each with its self time in microseconds, its depth and the index of its
 * parent, in start order. Children are events that start inside a parent and end no later than it; ties on start
 * are ordered longest first so a parent precedes its children.
 */
export function selfTimes(events, pid, tid) {
  const own = events
    .filter((e) => e.ph === 'X' && e.pid === pid && e.tid === tid && typeof e.ts === 'number')
    .map((e) => ({ name: e.name, ts: e.ts, dur: e.dur ?? 0, args: e.args ?? {}, self: e.dur ?? 0, depth: 0, parent: -1, cat: e.cat ?? '' }))
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const stack = [];
  for (let i = 0; i < own.length; i += 1) {
    const e = own[i];
    while (stack.length > 0) {
      const top = own[stack[stack.length - 1]];
      if (e.ts >= top.ts + top.dur) stack.pop();
      else break;
    }
    if (stack.length > 0) {
      const parent = own[stack[stack.length - 1]];
      e.parent = stack[stack.length - 1];
      e.depth = parent.depth + 1;
      parent.self -= e.dur;
    }
    stack.push(i);
  }
  for (const e of own) if (e.self < 0) e.self = 0;
  return own;
}

/** The nearest bucketed ancestor-or-self of `index`, or 'other'. */
function chargeOf(own, index) {
  for (let i = index; i !== -1; i = own[i].parent) {
    const bucket = bucketOf(own[i].name);
    if (bucket !== null) return bucket;
  }
  return 'other';
}

/** Whether any strict ancestor of `index` is a script event — the definition of a forced layout here. */
function underScript(own, index) {
  for (let i = own[index].parent; i !== -1; i = own[i].parent) if (bucketOf(own[i].name) === SCRIPT_BUCKET) return true;
  return false;
}

/** The `rotaris:apply:<seq>` / `rotaris:shown:<seq>` marks, paired by sequence number, with the thread they came from. */
export function applyWindows(events, { applyPrefix = 'rotaris:apply:', shownPrefix = 'rotaris:shown:' } = {}) {
  const applies = new Map();
  const showns = new Map();
  let thread = null;
  for (const e of events) {
    if (typeof e.name !== 'string' || (e.ph !== 'R' && e.ph !== 'I' && e.ph !== 'i' && e.ph !== 'n')) continue;
    if (e.name.startsWith(applyPrefix)) {
      applies.set(Number(e.name.slice(applyPrefix.length)), e.ts);
      thread ??= { pid: e.pid, tid: e.tid };
    } else if (e.name.startsWith(shownPrefix)) {
      showns.set(Number(e.name.slice(shownPrefix.length)), e.ts);
    }
  }
  const windows = [];
  const unfinished = [];
  for (const [seq, start] of [...applies.entries()].sort((a, b) => a[0] - b[0])) {
    const end = showns.get(seq);
    if (end === undefined) { unfinished.push(seq); continue; }
    windows.push({ seq, start, end });
  }
  return { thread, windows, unfinished };
}

function zeroBuckets() {
  const out = { other: 0 };
  for (const name of BUCKET_NAMES) out[name] = 0;
  return out;
}

const toMs = (us) => Math.round(us) / 1000;

/**
 * One apply window's account. Every figure is in milliseconds except the counts.
 *
 *  - `ms`: the window's length — the same quantity the renderer's sample calls `ms`, read from the trace clock;
 *  - `busy`: the main thread's self time inside the window, and `idle` what remains;
 *  - one field per bucket (`style`, `layout`, `prePaint`, `paint`, `commit`, `observers`, `script`, `hitTest`, `other`);
 *  - `forcedLayout`: the inclusive time of layouts and style recalculations that ran under script, and their count;
 *  - `frames`: main-thread frames begun inside the window; `scrolls`: scroll offsets set;
 *  - `layoutDirty` / `styleElements`: the layout objects Blink reported as needing layout and the elements it
 *    restyled, summed over the window — the figures that say whether the layout's SCOPE grows with the transcript
 *    rather than only its duration; `layoutTotal` is the largest layout-object count any layout in the window saw,
 *    which is the size of the whole tree, not of the work;
 *  - `tasks`: top-level tasks begun inside the window and the longest one.
 */
export function accountWindow(own, window) {
  const buckets = zeroBuckets();
  let busy = 0;
  let forcedLayout = 0;
  let forcedLayouts = 0;
  let frames = 0;
  let scrolls = 0;
  let layoutDirty = 0;
  let layoutTotal = 0;
  let styleElements = 0;
  let tasks = 0;
  let longestTask = 0;
  const functions = new Map();
  for (let i = 0; i < own.length; i += 1) {
    const e = own[i];
    if (e.ts >= window.end) break;
    if (e.ts + e.dur <= window.start) continue;
    // Self time is charged where the event starts; an event straddling the window's edge is clipped to it.
    const clippedSelf = e.ts < window.start ? Math.max(0, Math.min(e.self, e.ts + e.dur - window.start)) : Math.min(e.self, window.end - e.ts);
    const charge = chargeOf(own, i);
    buckets[charge] += clippedSelf;
    busy += clippedSelf;
    if (e.ts < window.start) continue;
    if (LAYOUT_LIKE.has(e.name) && underScript(own, i) && !(e.parent !== -1 && LAYOUT_LIKE.has(own[e.parent].name))) { forcedLayout += e.dur; forcedLayouts += 1; }
    if (e.name === MAIN_FRAME_EVENT) frames += 1;
    if (e.name === SCROLL_EVENT) scrolls += 1;
    if (e.name === 'Layout') { layoutDirty += Number(e.args?.beginData?.dirtyObjects ?? 0); layoutTotal = Math.max(layoutTotal, Number(e.args?.beginData?.totalObjects ?? 0)); }
    if (e.name === 'UpdateLayoutTree') styleElements += Number(e.args?.elementCount ?? 0);
    if (e.name === 'RunTask' && (e.parent === -1 || own[e.parent].name !== 'RunTask')) { tasks += 1; if (e.dur > longestTask) longestTask = e.dur; }
    if (e.name === 'FunctionCall') {
      const d = e.args?.data ?? {};
      const key = `${d.functionName || '(anonymous)'}@${d.lineNumber ?? '?'}:${d.columnNumber ?? '?'}`;
      functions.set(key, (functions.get(key) ?? 0) + e.self);
    }
  }
  const ms = toMs(window.end - window.start);
  const out = { seq: window.seq, ms, busy: toMs(busy), idle: toMs(Math.max(0, window.end - window.start - busy)) };
  for (const name of [...BUCKET_NAMES, 'other']) out[name] = toMs(buckets[name]);
  out.forcedLayout = toMs(forcedLayout);
  out.forcedLayouts = forcedLayouts;
  out.frames = frames;
  out.scrolls = scrolls;
  out.layoutDirty = layoutDirty;
  out.layoutTotal = layoutTotal;
  out.styleElements = styleElements;
  out.tasks = tasks;
  out.longestTask = toMs(longestTask);
  out.functions = functions;
  return out;
}

/** The median of a numeric list, or null for an empty one. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The spread of a sample set: its median, quartiles, extremes and median absolute deviation. The proof reports these
 * beside every median it compares, because a median without its spread is how a harness's own noise passed as a
 * product's cost twice in three runs (the note's second round).
 */
export function spread(values) {
  const n = values.length;
  if (n === 0) return { n: 0, median: null, p25: null, p75: null, iqr: null, min: null, max: null, mad: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  const med = median(sorted);
  const mad = median(sorted.map((v) => Math.abs(v - med)));
  const r = (v) => Math.round(v * 100) / 100;
  return { n, median: r(med), p25: r(at(0.25)), p75: r(at(0.75)), iqr: r(at(0.75) - at(0.25)), min: r(sorted[0]), max: r(sorted[n - 1]), mad: r(mad) };
}

/**
 * The account of every apply window in a trace: each window, the medians and means across them, the top script
 * functions by self time, and which applies the trace did not see to the end.
 */
export function summariseAppendTrace(events, options = {}) {
  const { thread, windows, unfinished } = applyWindows(events, options);
  if (thread === null) return { thread: null, windows: [], unfinished: [], aggregate: null, topFunctions: [] };
  const own = selfTimes(events, thread.pid, thread.tid);
  const accounts = windows.map((w) => accountWindow(own, w));
  const numeric = ['ms', 'busy', 'idle', ...BUCKET_NAMES, 'other', 'forcedLayout', 'forcedLayouts', 'frames', 'scrolls', 'layoutDirty', 'layoutTotal', 'styleElements', 'tasks', 'longestTask'];
  const aggregate = { windows: accounts.length, median: {}, mean: {} };
  for (const key of numeric) {
    const values = accounts.map((a) => a[key]);
    aggregate.median[key] = accounts.length === 0 ? null : Math.round(median(values) * 100) / 100;
    aggregate.mean[key] = accounts.length === 0 ? null : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
  }
  const functions = new Map();
  for (const a of accounts) for (const [key, self] of a.functions) functions.set(key, (functions.get(key) ?? 0) + self);
  const topFunctions = [...functions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, self]) => ({ function: key, selfMs: toMs(self) }));
  return {
    thread,
    windows: accounts.map(({ functions: _dropped, ...rest }) => rest),
    unfinished,
    aggregate,
    topFunctions,
  };
}
