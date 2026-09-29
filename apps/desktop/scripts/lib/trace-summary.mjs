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
 * The trace account says how long script ran and not WHICH script, because a `FunctionCall` event names only the entry
 * point a task called into — React's scheduler, a microtask flush — and never the component or helper the time went to.
 * The second half of this module reads the answer out of V8's own CPU profile, which the traced launches record under
 * `disabled-by-default-v8.cpu_profiler` (`readCpuProfile`, `attributeProfile`, `summariseAppendProfile`): the sampled
 * stacks, each sample's time charged either to the browser work open on the thread at that instant or to the sampled
 * function's self time, and each function named by the source module the bundler says it came from.
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

// ── V8's CPU profile: which functions the script time went to ────────────────────────────────────────────────

/**
 * The two categories that make Chromium's tracing sample the renderer's JavaScript: the profiler, and its fine
 * interval (V8 samples every 1 ms without the second and every 100 µs with it; about 170 µs was measured on the Linux
 * host, 2026-09-29). A per-increment difference of a millisecond or two is a handful of samples at the coarse interval.
 */
export const CPU_PROFILE_CATEGORIES = Object.freeze(['disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires']);

/** The buckets whose time is the browser's own work, whatever script was on the stack when Blink did it. */
const BROWSER_BUCKETS = new Set(['style', 'layout', 'prePaint', 'paint', 'commit', 'observers', 'hitTest']);

/**
 * One thread's sampled profile, as Chromium's tracing writes it: a `Profile` event on the profiled thread carrying the
 * profile's `startTime`, and `ProfileChunk` events sharing its `id` — written from V8's profiler thread, so matched by
 * process and id rather than by thread — each carrying the call-tree nodes first seen since the last chunk
 * (`callFrame`, `parent`) and the samples taken since it (`samples`, node ids; `timeDeltas`, microseconds from the
 * previous sample, on the trace's own clock).
 *
 * A delta can be negative (the profiler thread timestamps a sample a little out of order), so the samples are placed
 * first and sorted after. A sample stands for the time to the next one, capped at `maxGapFactor` sampling intervals: a
 * gap longer than that is the profiler thread not running, not the sampled function running on, and charging it to
 * whichever leaf came before would name the wrong function. What the cap removed is reported (`cappedUs`), never hidden.
 * Answers null for a thread the trace holds no profile of.
 */
export function readCpuProfile(events, thread, { maxGapFactor = 4 } = {}) {
  if (thread === null) return null;
  const profile = events.find((e) => e.name === 'Profile' && e.pid === thread.pid && e.tid === thread.tid);
  if (profile === undefined) return null;
  const chunks = events.filter((e) => e.name === 'ProfileChunk' && e.pid === thread.pid && e.id === profile.id).sort((a, b) => a.ts - b.ts);
  const nodes = new Map();
  const samples = [];
  let t = Number(profile.args?.data?.startTime ?? profile.ts);
  for (const chunk of chunks) {
    const data = chunk.args?.data ?? {};
    for (const node of data.cpuProfile?.nodes ?? []) nodes.set(node.id, { frame: node.callFrame ?? {}, parent: node.parent ?? null });
    const ids = data.cpuProfile?.samples ?? [];
    const deltas = data.timeDeltas ?? [];
    for (let i = 0; i < ids.length; i += 1) {
      t += Number(deltas[i] ?? 0);
      samples.push({ t, node: ids[i], dur: 0 });
    }
  }
  samples.sort((a, b) => a.t - b.t);
  const gaps = [];
  for (let i = 1; i < samples.length; i += 1) if (samples[i].t > samples[i - 1].t) gaps.push(samples[i].t - samples[i - 1].t);
  const intervalUs = median(gaps) ?? 0;
  const cap = intervalUs * maxGapFactor;
  let cappedUs = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const gap = i + 1 < samples.length ? samples[i + 1].t - samples[i].t : intervalUs;
    samples[i].dur = Math.min(gap, cap);
    cappedUs += gap - samples[i].dur;
  }
  return { nodes, samples, intervalUs, cappedUs };
}

/**
 * The source module each line of a bundle came from, read off the region markers the bundler writes around every
 * module it inlines (`//#region ../../packages/ui/src/transcript/pool.ts`), so that a sampled frame names the file it
 * belongs to rather than a line of a seventy-thousand-line bundle. Lines are 0-based, as V8's call frames count them.
 */
export function bundleRegions(text) {
  const lines = text.split('\n');
  const regions = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\/\/#region (.+)$/.exec(lines[i]);
    // A virtual module is written with a literal `\0` before its name (`\0rolldown/runtime.js`); a path is relative to
    // the renderer's root, so the `../` climbing out of it is dropped and a workspace file reads `packages/…`.
    if (m) regions.push({ line: i, module: m[1].replace(/^\\0/, '').replace(/^(\.\.\/)+/, '') });
  }
  return { lines, regions };
}

/** The module a 0-based bundle line lies in, or null before the first region. */
export function moduleAt(bundle, line) {
  let lo = 0;
  let hi = bundle.regions.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bundle.regions[mid].line <= line) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at === -1 ? null : bundle.regions[at].module;
}

/**
 * A sampled frame's name: its function (or `(anonymous)`), the module it came from when the frame is in `bundle`'s
 * script, and its 1-based line in the bundle so two anonymous functions of one module stay apart. A frame V8 made up —
 * `(program)`, `(idle)`, `(garbage collector)`, `(root)` — is its own name.
 */
export function frameName(frame, bundle = null, bundleUrl = null) {
  const fn = frame.functionName || '(anonymous)';
  if (!frame.url) return fn;
  const line = Number(frame.lineNumber ?? -1);
  if (bundle !== null && bundleUrl !== null && frame.url.endsWith(bundleUrl)) {
    const module = moduleAt(bundle, line) ?? 'bundle';
    return `${fn} ${module}:${line + 1}`;
  }
  return `${fn} ${frame.url.split('/').pop()}:${line + 1}`;
}

/**
 * Where a profile's samples inside `span` went. `own` is the same thread's complete events (`selfTimes`), so each
 * sample is charged by the trace account's own rule — the nearest bucketed ancestor-or-self of the deepest event open
 * at the sample's instant — and the two accounts cannot disagree about what is script or what is idle:
 *
 *  - a sample with NO event open is the thread idle, whatever V8 labelled it;
 *  - a sample inside style, layout, pre-paint, paint, the commit, the observer delivery's own time or hit testing is
 *    the BROWSER's, whatever JavaScript was on the stack; a layout forced by script lands here, and `under` says which
 *    function was on top of the stack when it was forced (`(idle)` when none was: the frame's own rendering);
 *  - `(garbage collector)` is reported as itself, and `(program)` — native time — as `program`, together with the
 *    samples V8 labels `(idle)` although a task is running (V8 marks the isolate idle whenever Blink is outside script,
 *    so its `(idle)` cannot be read as the thread waiting: measured 2026-09-29, the frames' paint was sampled as it);
 *  - every other sample is its leaf FUNCTION's self time.
 *
 * Every figure is in microseconds; `busy` is everything but idle.
 */
export function attributeProfile(profile, own, span, { name = (frame) => frameName(frame) } = {}) {
  const functions = new Map();
  const browser = Object.fromEntries([...BROWSER_BUCKETS].map((b) => [b, 0]));
  const under = new Map();
  let idle = 0;
  let program = 0;
  let gc = 0;
  let script = 0;
  let count = 0;
  let next = 0;
  const open = [];
  const ends = (i) => own[i].ts + own[i].dur;
  const nameOf = (id) => name(profile.nodes.get(id)?.frame ?? {});
  for (const s of profile.samples) {
    if (s.t < span.start) continue;
    if (s.t >= span.end) break;
    while (next < own.length && own[next].ts <= s.t) {
      while (open.length > 0 && ends(open[open.length - 1]) <= own[next].ts) open.pop();
      open.push(next);
      next += 1;
    }
    while (open.length > 0 && ends(open[open.length - 1]) <= s.t) open.pop();
    count += 1;
    if (open.length === 0) { idle += s.dur; continue; }
    const leaf = profile.nodes.get(s.node)?.frame?.functionName ?? '';
    const bucket = chargeOf(own, open[open.length - 1]);
    if (BROWSER_BUCKETS.has(bucket)) {
      browser[bucket] += s.dur;
      const key = `${bucket} under ${nameOf(s.node)}`;
      under.set(key, (under.get(key) ?? 0) + s.dur);
      continue;
    }
    if (leaf === '(garbage collector)') { gc += s.dur; continue; }
    if (leaf === '(program)' || leaf === '(idle)' || leaf === '(root)') { program += s.dur; continue; }
    const key = nameOf(s.node);
    functions.set(key, (functions.get(key) ?? 0) + s.dur);
    script += s.dur;
  }
  const browserTotal = Object.values(browser).reduce((a, b) => a + b, 0);
  return { samples: count, idle, busy: script + browserTotal + gc + program, script, browser, gc, program, functions, under };
}

/** A function's module, read back out of `frameName`'s form; `(program)` and the other made-up frames have none. */
export function moduleOfName(key) {
  const m = / ([^ ]+):\d+$/.exec(key);
  return m === null ? key : m[1];
}

/**
 * The profile of a traced append launch, per increment: the increments are the windows whose sequence numbers the
 * launch's own samples carry (`seqs` — the attach increment is not among them), and the span is theirs, from the
 * first one's arrival to the last one's shown frame, which is the span the trace account's per-increment figures
 * read too. `bundle`/`bundleUrl` name the modules; `top` bounds the lists. Figures are milliseconds per increment.
 */
export function summariseAppendProfile(events, { seqs = null, bundle = null, bundleUrl = null, top = 40 } = {}) {
  const { thread, windows } = applyWindows(events);
  const kept = windows.filter((w) => seqs === null || seqs.has(w.seq));
  const profile = readCpuProfile(events, thread);
  if (profile === null || kept.length === 0) return null;
  const span = { start: Math.min(...kept.map((w) => w.start)), end: Math.max(...kept.map((w) => w.end)) };
  const account = attributeProfile(profile, selfTimes(events, thread.pid, thread.tid), span, { name: (frame) => frameName(frame, bundle, bundleUrl) });
  const n = kept.length;
  const per = (us) => Math.round((us / n) * 1000) / 1_000_000;
  const modules = new Map();
  for (const [key, us] of account.functions) modules.set(moduleOfName(key), (modules.get(moduleOfName(key)) ?? 0) + us);
  const ranked = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
  return {
    increments: n,
    spanMs: Math.round(span.end - span.start) / 1000,
    samples: account.samples,
    intervalUs: profile.intervalUs,
    cappedMs: Math.round(profile.cappedUs) / 1000,
    perIncrement: {
      busy: per(account.busy), idle: per(account.idle), script: per(account.script), gc: per(account.gc), program: per(account.program),
      browser: Object.fromEntries(Object.entries(account.browser).map(([k, v]) => [k, per(v)])),
    },
    functions: ranked(account.functions).slice(0, top).map(([name, us]) => ({ function: name, selfMs: per(us) })),
    modules: ranked(modules).map(([module, us]) => ({ module, selfMs: per(us) })),
    under: ranked(account.under).slice(0, top).map(([key, us]) => ({ what: key, ms: per(us) })),
    // Every function, so two launches can be compared on all of them rather than on each one's top list.
    all: Object.fromEntries([...account.functions.entries()].map(([k, us]) => [k, per(us)])),
  };
}

/**
 * Loaded minus empty, per increment, over the functions and the modules of two profiles — what the loaded transcript
 * spends that the empty one does not, ranked, with both sides' figures beside the difference.
 */
export function profileDifference(empty, loaded, { top = 30 } = {}) {
  if (empty === null || loaded === null) return null;
  const rows = (a, b) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].map((k) => ({ name: k, emptyMs: a[k] ?? 0, loadedMs: b[k] ?? 0, differenceMs: Math.round(((b[k] ?? 0) - (a[k] ?? 0)) * 1000) / 1000 }))
      .sort((x, y) => y.differenceMs - x.differenceMs);
  };
  const byModule = (s) => Object.fromEntries(s.modules.map((m) => [m.module, m.selfMs]));
  const totals = (s) => ({ busy: s.perIncrement.busy, script: s.perIncrement.script, gc: s.perIncrement.gc, program: s.perIncrement.program, ...Object.fromEntries(Object.entries(s.perIncrement.browser).map(([k, v]) => [`browser.${k}`, v])) });
  const functions = rows(empty.all, loaded.all);
  return {
    totals: rows(totals(empty), totals(loaded)),
    modules: rows(byModule(empty), byModule(loaded)),
    functions: [...functions.slice(0, top), ...functions.slice(-5)],
  };
}
