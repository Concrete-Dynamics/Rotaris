/**
 * The arithmetic behind `transcript-proof`'s trace account (REQ-CHAT-055, ADR-0045): self time attributed upward,
 * a forced layout recognised as a layout under script, a window's buckets adding up to at most its length, and
 * the marks paired by sequence number. Pinned against a synthetic trace so the proof's verdict about WHERE an
 * append's frames go cannot rest on arithmetic nobody checked.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the summariser is plain ESM beside the scripts that run it.
import { BUCKET_NAMES, accountWindow, applyWindows, bucketOf, median, readTrace, selfTimes, spread, summariseAppendTrace } from './trace-summary.mjs';

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
