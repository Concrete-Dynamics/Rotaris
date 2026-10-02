/**
 * The arithmetic behind `transcript-proof`'s trace account (REQ-CHAT-055, ADR-0045): self time attributed upward,
 * a forced layout recognised as a layout under script, a window's buckets adding up to at most its length, and
 * the marks paired by sequence number. Pinned against a synthetic trace so the proof's verdict about WHERE an
 * append's frames go cannot rest on arithmetic nobody checked.
 *
 * The second half pins the CPU-profile account the 2026-09-29 round added (the note's "CPU profile" section): the
 * samples placed on the trace clock across chunks and sorted, a gap longer than a few intervals capped rather than
 * charged to one function, each sample charged by the trace account's own bucket rule — so a forced layout is the
 * browser's and V8's `(idle)` inside a task is not the thread waiting — and functions named by their bundle module.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the summariser is plain ESM beside the scripts that run it.
import { BUCKET_NAMES, CPU_PROFILE_CATEGORIES, accountWindow, applyWindows, attributeProfile, bucketOf, bundleRegions, frameName, median, moduleAt, moduleOfName, profileDifference, readCpuProfile, readTrace, selfTimes, spread, summariseAppendProfile, summariseAppendTrace } from './trace-summary.mjs';

const PID = 7;
const TID = 7;
const x = (name: string, ts: number, dur: number, args: Record<string, unknown> = {}, cat = 'devtools.timeline') => ({ ph: 'X', name, ts, dur, args, cat, pid: PID, tid: TID });
const mark = (name: string, ts: number) => ({ ph: 'R', name, ts, cat: 'blink.user_timing', pid: PID, tid: TID, args: {} });

/**
 * One apply window from 1,000 µs to 41,000 µs (40 ms), shaped like a real one: the increment's task with React's
 * microtask flush and a forced layout inside it, then a main-thread frame with style, layout, an observer delivery
 * carrying a callback, pre-paint, paint and a commit, then idle until the second frame.
 */
function oneWindow() {
  return [
    mark('rotaris:apply:12', 1_000),
    x('RunTask', 1_000, 8_000, {}, 'disabled-by-default-devtools.timeline'),
    x('FunctionCall', 1_100, 1_000, { data: { functionName: 'onIncrement', lineNumber: 10, columnNumber: 2 } }),
    x('RunMicrotasks', 2_200, 6_000, {}, 'v8.execute'),
    x('UpdateLayoutTree', 6_000, 500, { elementCount: 7 }),
    x('Layout', 6_600, 1_000, { beginData: { totalObjects: 40, dirtyObjects: 3 } }),
    x('ProxyMain::BeginMainFrame', 12_000, 9_000, {}, 'cc,benchmark'),
    x('UpdateLayoutTree', 12_100, 1_000, { elementCount: 3 }),
    x('Document::updateStyle', 12_200, 400, {}, 'blink'),
    x('Layout', 13_200, 2_000, { beginData: { totalObjects: 160, dirtyObjects: 20 } }),
    x('LocalFrameView::NotifyResizeObservers', 15_300, 1_500, {}, 'blink,benchmark'),
    x('FunctionCall', 15_400, 1_000, { data: { functionName: '', lineNumber: 99, columnNumber: 1 } }),
    x('PrePaint', 16_900, 500),
    x('Paint', 17_500, 1_200),
    x('Commit', 18_800, 600, {}, 'disabled-by-default-devtools.timeline'),
    x('ScrollableArea::SetScrollOffset', 19_500, 10, { offset: '[0 30000]' }, 'blink'),
    x('ProxyMain::BeginMainFrame', 38_000, 500, {}, 'cc,benchmark'),
    mark('rotaris:shown:12', 41_000),
  ];
}

describe('trace-summary: REQ-CHAT-055 measurement round — the account of an apply window', () => {
  it('reads both trace file shapes and refuses anything else', () => {
    const events = oneWindow();
    expect(readTrace(events)).toBe(events);
    expect(readTrace({ traceEvents: events, metadata: {} })).toBe(events);
    expect(() => readTrace({ nothing: true })).toThrow(/not a Chromium trace/);
  });

  it('knows the buckets and charges an unknown name to nobody by itself', () => {
    expect(BUCKET_NAMES).toEqual(['style', 'layout', 'prePaint', 'paint', 'commit', 'observers', 'script', 'hitTest']);
    expect(bucketOf('Layout')).toBe('layout');
    expect(bucketOf('LocalFrameView::NotifyResizeObservers')).toBe('observers');
    expect(bucketOf('Document::updateStyle')).toBeNull();
  });

  it('computes self time as duration less children, with nesting from start order and length', () => {
    const own = selfTimes(oneWindow(), PID, TID);
    const byName = (name: string) => own.filter((e: { name: string }) => e.name === name);
    // The task holds the call and the microtask flush; the flush holds the forced style and layout.
    const task = byName('RunTask')[0];
    expect(task.self).toBe(8_000 - 1_000 - 6_000);
    const flush = byName('RunMicrotasks')[0];
    expect(flush.self).toBe(6_000 - 500 - 1_000);
    expect(flush.parent).toBe(own.indexOf(task));
    // Blink's internal style event sits under the frame's UpdateLayoutTree and takes its time out of it.
    const frameStyle = byName('UpdateLayoutTree')[1];
    expect(frameStyle.self).toBe(1_000 - 400);
    expect(own[byName('Document::updateStyle')[0].parent].name).toBe('UpdateLayoutTree');
    // Events on another thread are not this thread's.
    expect(selfTimes([...oneWindow(), { ...x('Layout', 5, 5), tid: 99 }], PID, TID).filter((e: { name: string }) => e.name === 'Layout')).toHaveLength(2);
  });

  it('pairs the marks by sequence number and reports an apply the trace never saw shown', () => {
    const events = [...oneWindow(), mark('rotaris:apply:13', 50_000)];
    const { thread, windows, unfinished } = applyWindows(events);
    expect(thread).toEqual({ pid: PID, tid: TID });
    expect(windows).toEqual([{ seq: 12, start: 1_000, end: 41_000 }]);
    expect(unfinished).toEqual([13]);
  });

  it('charges every microsecond upward once, so the buckets add up to the busy time and never exceed the window', () => {
    const events = oneWindow();
    const own = selfTimes(events, PID, TID);
    const account = accountWindow(own, applyWindows(events).windows[0]);
    expect(account.ms).toBe(40);
    const sum = BUCKET_NAMES.reduce((s: number, name: string) => s + account[name], 0) + account.other;
    expect(sum).toBeCloseTo(account.busy, 3);
    expect(account.busy + account.idle).toBeCloseTo(40, 3);
    // Style: the forced recalculation (0.5) plus the frame's (1.0, of which 0.4 is Blink's own child) = 1.5 ms.
    expect(account.style).toBeCloseTo(1.5, 3);
    // Layout: the forced one (1.0) and the frame's (2.0).
    expect(account.layout).toBeCloseTo(3.0, 3);
    // The observer delivery keeps its own time; the callback inside it is script.
    expect(account.observers).toBeCloseTo(0.5, 3);
    expect(account.script).toBeCloseTo(1.0 + 4.5 + 1.0, 3);
    expect(account.prePaint).toBeCloseTo(0.5, 3);
    expect(account.paint).toBeCloseTo(1.2, 3);
    expect(account.commit).toBeCloseTo(0.6, 3);
    // The task's own 1 ms, the two frames' own time (2.19 and 0.5) and the scroll write (0.01) are nobody's bucket.
    expect(account.other).toBeCloseTo(3.7, 3);
    expect(account.busy).toBeCloseTo(17.5, 3);
  });

  it('names a layout under script as forced, and counts frames, scrolls and what Blink laid out', () => {
    const events = oneWindow();
    const account = accountWindow(selfTimes(events, PID, TID), applyWindows(events).windows[0]);
    expect(account.forcedLayouts).toBe(2);
    expect(account.forcedLayout).toBeCloseTo(1.5, 3);
    expect(account.frames).toBe(2);
    expect(account.scrolls).toBe(1);
    expect(account.layoutDirty).toBe(23);
    expect(account.layoutTotal).toBe(160);
    expect(account.styleElements).toBe(10);
    expect(account.tasks).toBe(1);
    expect(account.longestTask).toBe(8);
  });

  it('clips an event straddling the window edge and ignores what lies outside it', () => {
    const events = [
      mark('rotaris:apply:1', 10_000),
      x('Paint', 9_000, 2_000),           // half inside: 1 ms counted
      x('Layout', 19_500, 2_000),         // starts inside, ends outside: 0.5 ms counted
      x('Paint', 30_000, 1_000),          // outside
      mark('rotaris:shown:1', 20_000),
    ];
    const account = accountWindow(selfTimes(events, PID, TID), applyWindows(events).windows[0]);
    expect(account.paint).toBeCloseTo(1.0, 3);
    expect(account.layout).toBeCloseTo(0.5, 3);
    expect(account.busy).toBeCloseTo(1.5, 3);
  });

  it('aggregates windows into medians and means and ranks the script functions by self time', () => {
    const second = oneWindow().map((e) => ({ ...e, ts: e.ts + 100_000, name: e.name.replace(':12', ':14') }));
    const summary = summariseAppendTrace([...oneWindow(), ...second]);
    expect(summary.thread).toEqual({ pid: PID, tid: TID });
    expect(summary.windows.map((w: { seq: number }) => w.seq)).toEqual([12, 14]);
    expect(summary.aggregate.windows).toBe(2);
    expect(summary.aggregate.median.ms).toBe(40);
    expect(summary.aggregate.mean.layout).toBeCloseTo(3.0, 2);
    expect(summary.topFunctions[0]).toEqual({ function: 'onIncrement@10:2', selfMs: 2 });
    expect(summary.topFunctions[1]).toEqual({ function: '(anonymous)@99:1', selfMs: 2 });
    expect(summary.windows[0]).not.toHaveProperty('functions');
  });

  it('answers an empty account for a trace with no marks rather than guessing a thread', () => {
    const summary = summariseAppendTrace([x('Layout', 1, 1)]);
    expect(summary).toEqual({ thread: null, windows: [], unfinished: [], aggregate: null, topFunctions: [] });
  });

  it('describes a sample set by its median and its spread', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const s = spread([10, 12, 11, 30, 13]);
    expect(s).toEqual({ n: 5, median: 12, p25: 11, p75: 13, iqr: 2, min: 10, max: 30, mad: 1 });
    expect(spread([]).n).toBe(0);
  });
});

// ── V8's CPU profile ────────────────────────────────────────────────────────────────────────────────────────────

const PROFILER_TID = 9;
const BUNDLE = 'index-abc.js';
const profileEvent = (startTime: number, id = '0x1', tid = TID) => ({ ph: 'P', name: 'Profile', id, pid: PID, tid, ts: startTime, cat: 'disabled-by-default-v8.cpu_profiler', args: { data: { startTime } } });
const chunk = (ts: number, nodes: unknown[], samples: number[], timeDeltas: number[], id = '0x1') => (
  { ph: 'P', name: 'ProfileChunk', id, pid: PID, tid: PROFILER_TID, ts, cat: 'disabled-by-default-v8.cpu_profiler', args: { data: { cpuProfile: { nodes, samples }, timeDeltas } } });
const node = (id: number, functionName: string, parent?: number, lineNumber = -1) => (
  { id, ...(parent === undefined ? {} : { parent }), callFrame: { functionName, url: lineNumber < 0 ? '' : `app://renderer/assets/${BUNDLE}`, lineNumber, columnNumber: 0, scriptId: lineNumber < 0 ? 0 : 3 } });
const NODES = [
  node(1, '(root)'), node(2, '(program)', 1), node(3, '(idle)', 1), node(4, '(garbage collector)', 1),
  node(5, 'onIncrement', 1, 1), node(6, '', 5, 4),
];
/** Samples every 500 µs from 1,000 µs; the node of each, in order. */
function sampled(ids: number[]) {
  return [profileEvent(1_000), chunk(1_000, NODES, ids, ids.map((_, i) => (i === 0 ? 0 : 500)))];
}

describe('trace-summary: which functions the script time went to (the 2026-09-29 CPU-profile round, REQ-CHAT-055)', () => {
  it('asks the trace for the profiler and its fine interval', () => {
    expect(CPU_PROFILE_CATEGORIES).toEqual(['disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires']);
  });

  it('places the samples on the trace clock across chunks, sorts a negative delta back into order and gathers nodes from every chunk', () => {
    const events = [
      profileEvent(10_000),
      chunk(10_100, [node(1, '(root)'), node(5, 'onIncrement', 1, 1)], [5, 5], [0, 500]),
      // A later chunk introduces a node and one sample timestamped before the previous one.
      chunk(10_200, [node(6, '', 5, 4)], [6, 5], [-200, 700]),
      // Another profile's chunk, and another process's, are not this one's.
      chunk(10_300, [], [5], [1], '0x2'),
      { ...chunk(10_300, [], [5], [1]), pid: 99 },
    ];
    const profile = readCpuProfile(events, { pid: PID, tid: TID });
    expect([...profile.nodes.keys()]).toEqual([1, 5, 6]);
    expect(profile.samples.map((s: { t: number; node: number }) => [s.t, s.node])).toEqual([[10_000, 5], [10_300, 6], [10_500, 5], [11_000, 5]]);
    // Positive gaps 300, 200, 500: the interval is their median, and a sample stands for the gap to the next one.
    expect(profile.intervalUs).toBe(300);
    expect(profile.samples.map((s: { dur: number }) => s.dur)).toEqual([300, 200, 500, 300]);
    expect(profile.cappedUs).toBe(0);
    expect(readCpuProfile(events, { pid: PID, tid: 1234 })).toBeNull();
    expect(readCpuProfile(events, null)).toBeNull();
  });

  it('caps a gap of many intervals rather than charging it to the function sampled before it, and says how much it removed', () => {
    const events = [profileEvent(0), chunk(1, NODES, [5, 5, 5, 5, 5], [0, 100, 100, 5_000, 100])];
    const profile = readCpuProfile(events, { pid: PID, tid: TID });
    expect(profile.intervalUs).toBe(100);
    expect(profile.samples.map((s: { dur: number }) => s.dur)).toEqual([100, 100, 400, 100, 100]);
    expect(profile.cappedUs).toBe(4_600);
  });

  it('names a function by the bundle module its line lies in, and a made-up frame by itself', () => {
    const bundle = bundleRegions([
      '//#region \\0rolldown/runtime.js', 'var x = 1;', '//#endregion',
      '//#region ../../packages/ui/src/transcript/pool.ts', 'function estimateHeight() {}', '//#endregion',
    ].join('\n'));
    expect(bundle.regions).toEqual([{ line: 0, module: 'rolldown/runtime.js' }, { line: 3, module: 'packages/ui/src/transcript/pool.ts' }]);
    expect(moduleAt(bundle, 4)).toBe('packages/ui/src/transcript/pool.ts');
    expect(moduleAt(bundle, 1)).toBe('rolldown/runtime.js');
    expect(moduleAt(bundleRegions('var x;\n//#region a.js\n'), 0)).toBeNull();
    const at = (functionName: string, lineNumber: number, url = `app://renderer/assets/${BUNDLE}`) => ({ functionName, url, lineNumber });
    expect(frameName(at('estimateHeight', 4), bundle, BUNDLE)).toBe('estimateHeight packages/ui/src/transcript/pool.ts:5');
    expect(frameName(at('', 1), bundle, BUNDLE)).toBe('(anonymous) rolldown/runtime.js:2');
    expect(frameName(at('invoke', 1, 'node:electron/js2c/sandbox_bundle'), bundle, BUNDLE)).toBe('invoke sandbox_bundle:2');
    expect(frameName({ functionName: '(garbage collector)', url: '', lineNumber: -1 })).toBe('(garbage collector)');
    expect(moduleOfName('estimateHeight packages/ui/src/transcript/pool.ts:5')).toBe('packages/ui/src/transcript/pool.ts');
    expect(moduleOfName('get scrollHeight index.js:12')).toBe('index.js');
    expect(moduleOfName('(program)')).toBe('(program)');
  });

  it('charges each sample by the trace account\'s own rule: a forced layout is the browser\'s, no open event is idle, V8\'s (idle) inside a task is not', () => {
    const events = [
      x('RunTask', 1_000, 4_000, {}, 'disabled-by-default-devtools.timeline'),
      x('FunctionCall', 1_100, 2_900, { data: { functionName: 'onIncrement' } }),
      x('Layout', 2_000, 1_000, { beginData: { dirtyObjects: 3, totalObjects: 40 } }),
      x('Paint', 6_000, 1_000),
      // 1,000 RunTask only · 1,500 the call · 2,000 and 2,500 the forced layout · 3,000 the call again · 3,500 a
      // collection · 4,000 and 4,500 the task with no script (V8 says idle, then program) · 5,000 and 5,500 nothing
      // open · 6,000 and 6,500 the frame's paint (V8 says idle) · 7,000 to 10,500 nothing open.
      ...sampled([2, 5, 6, 6, 6, 4, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]),
    ];
    const profile = readCpuProfile(events, { pid: PID, tid: TID });
    const own = selfTimes(events, PID, TID);
    const account = attributeProfile(profile, own, { start: 1_000, end: 11_000 });
    expect(account.samples).toBe(20);
    expect(account.idle).toBe(10 * 500);
    expect(account.browser.layout).toBe(1_000);
    expect(account.browser.paint).toBe(1_000);
    expect(account.gc).toBe(500);
    expect(account.program).toBe(3 * 500);
    // Without a bundle a function is named by its script's file and 1-based line.
    expect(Object.fromEntries(account.functions)).toEqual({ 'onIncrement index-abc.js:2': 500, '(anonymous) index-abc.js:5': 500 });
    expect(account.script).toBe(1_000);
    expect(account.busy).toBe(1_000 + 2_000 + 500 + 1_500);
    expect(account.busy + account.idle).toBe(10_000);
    // Which script was on top of the stack when Blink did the work: the forced layout names the function, the frame's paint names none.
    expect(Object.fromEntries(account.under)).toEqual({ 'layout under (anonymous) index-abc.js:5': 1_000, 'paint under (idle)': 1_000 });
    // A span clips the samples it reads.
    const clipped = attributeProfile(profile, own, { start: 2_000, end: 3_000 });
    expect(clipped.samples).toBe(2);
    expect(clipped.browser.layout).toBe(1_000);
  });

  it('summarises a traced launch per increment over the increments it names, by function and by module, and ranks loaded minus empty', () => {
    const bundle = bundleRegions(['//#region ../../packages/ui/src/app.ts', 'function onIncrement() {', '', '', '  (() => {})();', '}'].join('\n'));
    const launch = (pinSamples: number) => {
      const ids = [5, ...Array.from({ length: pinSamples }, () => 6)];
      return [
        mark('rotaris:apply:2', 0), mark('rotaris:shown:2', 900), // the attach: not among the launch's increments
        mark('rotaris:apply:3', 1_000), mark('rotaris:shown:3', 2_000 + pinSamples * 500),
        x('RunTask', 1_000, 1_000 + pinSamples * 500, {}, 'disabled-by-default-devtools.timeline'),
        x('FunctionCall', 1_000, 1_000 + pinSamples * 500, { data: { functionName: 'onIncrement' } }),
        profileEvent(1_000), chunk(1_000, NODES, ids, ids.map((_, i) => (i === 0 ? 0 : 500))),
      ];
    };
    const options = { seqs: new Set([3]), bundle, bundleUrl: BUNDLE };
    const empty = summariseAppendProfile(launch(1), options);
    const loaded = summariseAppendProfile(launch(4), options);
    expect(empty.increments).toBe(1);
    expect(empty.intervalUs).toBe(500);
    expect(empty.perIncrement.script).toBe(1);
    expect(loaded.perIncrement.script).toBe(2.5);
    expect(loaded.functions[0]).toEqual({ function: '(anonymous) packages/ui/src/app.ts:5', selfMs: 2 });
    expect(loaded.modules).toEqual([{ module: 'packages/ui/src/app.ts', selfMs: 2.5 }]);
    const difference = profileDifference(empty, loaded);
    expect(difference.functions[0]).toEqual({ name: '(anonymous) packages/ui/src/app.ts:5', emptyMs: 0.5, loadedMs: 2, differenceMs: 1.5 });
    expect(difference.modules[0]).toMatchObject({ name: 'packages/ui/src/app.ts', differenceMs: 1.5 });
    expect(difference.totals.find((t: { name: string }) => t.name === 'script')).toMatchObject({ emptyMs: 1, loadedMs: 2.5, differenceMs: 1.5 });
    expect(profileDifference(null, loaded)).toBeNull();
    // A trace with no profile of the marks' thread has nothing to say.
    expect(summariseAppendProfile(launch(1).filter((e) => e.name !== 'Profile'), options)).toBeNull();
  });
});
