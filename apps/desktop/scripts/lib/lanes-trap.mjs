// @ts-check
/**
 * The `pendingLanes` trap for live-run finding D8
 * (`docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`): React error 185
 * ("Maximum update depth exceeded") was thrown seven times from the preload's push handler while two children streamed in
 * the `a68f121` duress run, and the production build's message names no component. fin32 drove the built app with a trap
 * on the React root's `pendingLanes` installed through the driver's `eval`, but kept none of it in the repository; fin35 and
 * fin38 asked for it on the duress launch. This is that trap, kept, and installed through `ROTARIS_CAPTURE_EVAL_AT`.
 *
 * What React counts (fin35's reading of `react-dom-client` 19.2.8): at the end of a commit that leaves Sync, InputContinuous
 * or Default work pending on the root (`root.pendingLanes & 42`) the nested-update count rises, otherwise it resets, and an
 * update scheduled while it is above 50 throws 185. The trap watches the same thing from outside the build:
 *
 *   - a COMMIT is the root's `current` being replaced (React swaps it once per commit), observed through an accessor
 *     defined on the FiberRoot that `#root`'s container key points at;
 *   - after each commit, in a microtask queued during it (ahead of the microtask React queues for sync work a commit
 *     schedules), it reads `root.pendingLanes & 42`: work left pending extends the RUN of such commits, none resets it —
 *     React's count, simulated; `maxRun` is its high-water mark, and at a new high it names the fibers holding the pending
 *     lanes (`fiber.lanes & 42`), walking only the subtrees whose `childLanes` carry them, and the components the commit
 *     re-rendered (a function, class, forwardRef or memo fiber whose state or props differ from its alternate's). The
 *     holders can be empty: an update React has not yet moved out of its concurrent queue marks the root's lanes before any
 *     fiber's, and only a development build's message names the component that scheduled it;
 *   - commits made before the microtask runs form a BURST (a synchronous chain of commits in one task);
 *   - each new high of the run at or past `warnAt`, and every uncaught error naming React's update-depth error, is written
 *     with `console.warn` as one `rotaris-lanes-trap: {…}` line, which the capture's console relay carries into the
 *     launch's `app.log` (`capture: renderer console: …`). The line never repeats React's own message, so the harness's
 *     count of those (`renderer-console.mjs`) is not changed by the trap;
 *   - since OQ-278 (2026-10-13), the install writes one `rotaris-lanes-trap: installed` line the same way, and the duress
 *     launch FAILS when the trap did not install or that line did not reach its log (`lanesTrapGuard`).
 *
 * It reads; it changes nothing React does — the accessor stores and returns the same value. Nothing here is product code.
 */

/** The prefix every line the trap writes carries. */
export const LANES_TRAP_PREFIX = 'rotaris-lanes-trap:';

/**
 * The one line the trap writes when it installs (OQ-278): its arrival in the launch's log, relayed as
 * `capture: renderer console: rotaris-lanes-trap: installed (…)`, shows the console relay carries the trap's lines, so a
 * pack with none of its other lines is read as "nothing crossed the threshold", not "nothing reached the log".
 */
export const LANES_TRAP_INSTALLED = `${LANES_TRAP_PREFIX} installed`;

/** React 19's SyncLane | InputContinuousLane | DefaultLane — the lanes whose pending work keeps the count rising. */
export const COUNTING_LANES = 42;

/**
 * The renderer expression that installs the trap (once per window) and answers its summary. It holds no `;;` and no `>>`,
 * so it is a whole `ROTARIS_CAPTURE_EVAL_AT` step body (`parseSteps`).
 * @param {{ warnAt?: number }} [options]
 */
export function lanesTrapSource({ warnAt = 10 } = {}) {
  const body = `
(() => {
  const w = window;
  if (w.__rotarisLanesTrap) return w.__rotarisLanesTrap.summary();
  const container = document.getElementById('root');
  const key = container ? Object.keys(container).find((k) => k.startsWith('__reactContainer$')) : undefined;
  const hostRoot = key ? container[key] : null;
  const root = hostRoot ? hostRoot.stateNode : null;
  if (!root || !('pendingLanes' in root) || !('current' in root)) return { installed: false, reason: key ? 'the container holds no FiberRoot' : 'no React root on #root' };
  const LANES = ${COUNTING_LANES};
  const WARN_AT = ${Number(warnAt)};
  const PREFIX = ${JSON.stringify(LANES_TRAP_PREFIX)};
  const s = { installed: true, installedAt: Date.now(), commits: 0, evaluations: 0, counting: 0, run: 0, maxRun: 0, maxRunAt: null, maxRunHolders: [], maxRunRendered: [], burst: 0, maxBurst: 0, maxBurstAt: null, warnings: 0, updateDepthErrors: 0, lastHolders: [] };
  const nameOf = (f) => {
    const t = f.type;
    if (t === null || t === undefined) return f.tag === 3 ? 'HostRoot' : 'tag ' + f.tag;
    if (typeof t === 'string') return t;
    return t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)) || 'anonymous';
  };
  const holders = () => {
    const out = [];
    const stack = [root.current];
    let seen = 0;
    while (stack.length > 0 && seen < 50000 && out.length < 12) {
      const f = stack.pop();
      seen += 1;
      if ((f.lanes & LANES) !== 0) out.push(nameOf(f) + ' (lanes ' + (f.lanes & LANES) + ')');
      if (f.sibling) stack.push(f.sibling);
      if (f.child && (f.childLanes & LANES) !== 0) stack.push(f.child);
    }
    return out;
  };
  const rendered = () => {
    const counts = new Map();
    const stack = [root.current];
    let seen = 0;
    while (stack.length > 0 && seen < 50000) {
      const f = stack.pop();
      seen += 1;
      const a = f.alternate;
      if ((f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) && a && (a.memoizedState !== f.memoizedState || a.memoizedProps !== f.memoizedProps)) { const n = nameOf(f); counts.set(n, (counts.get(n) || 0) + 1); }
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([n, k]) => (k === 1 ? n : n + ' x' + k));
  };
  const warn = (what, extra) => {
    s.warnings += 1;
    console.warn(PREFIX + ' ' + JSON.stringify(Object.assign({ what, commits: s.commits, run: s.run, maxRun: s.maxRun, maxBurst: s.maxBurst, holders: s.lastHolders, rendered: rendered() }, extra || {})));
  };
  let scheduled = false;
  const evaluate = () => {
    scheduled = false;
    s.evaluations += 1;
    const burst = s.burst;
    s.burst = 0;
    if (burst > s.maxBurst) { s.maxBurst = burst; s.maxBurstAt = Date.now(); if (burst >= WARN_AT) { s.lastHolders = holders(); warn('burst', { burst }); } }
    if ((root.pendingLanes & LANES) !== 0) {
      s.counting += 1;
      s.run += 1;
      if (s.run > s.maxRun) {
        s.maxRun = s.run;
        s.maxRunAt = Date.now();
        s.lastHolders = holders();
        s.maxRunHolders = s.lastHolders;
        s.maxRunRendered = rendered();
        if (s.run >= WARN_AT) warn('run', { pendingLanes: root.pendingLanes & LANES });
      }
    } else {
      s.run = 0;
    }
  };
  let current = root.current;
  Object.defineProperty(root, 'current', {
    configurable: true,
    enumerable: true,
    get() { return current; },
    set(v) {
      current = v;
      s.commits += 1;
      s.burst += 1;
      if (!scheduled) { scheduled = true; queueMicrotask(evaluate); }
    },
  });
  w.addEventListener('error', (e) => {
    const m = String((e && e.message) || (e && e.error && e.error.message) || '');
    if (/[#]185\\b|Maximum update depth/.test(m)) { s.updateDepthErrors += 1; s.lastHolders = holders(); warn('update-depth error', { pendingLanes: root.pendingLanes & LANES }); }
  });
  const summary = () => ({ installed: true, installedAt: s.installedAt, commits: s.commits, evaluations: s.evaluations, counting: s.counting, run: s.run, maxRun: s.maxRun, maxRunAt: s.maxRunAt, maxRunHolders: s.maxRunHolders, maxRunRendered: s.maxRunRendered, maxBurst: s.maxBurst, maxBurstAt: s.maxBurstAt, warnings: s.warnings, updateDepthErrors: s.updateDepthErrors });
  w.__rotarisLanesTrap = { summary };
  console.warn(${JSON.stringify(LANES_TRAP_INSTALLED)});
  return summary();
})()`;
  return body.replace(/\n\s*/g, ' ').trim();
}

/** The renderer expression that answers the installed trap's summary. */
export const LANES_TRAP_READ = '(window.__rotarisLanesTrap ? window.__rotarisLanesTrap.summary() : { installed: false, reason: "not installed" })';

/**
 * The `ROTARIS_CAPTURE_EVAL_AT` value: the trap installed at `installAtMs`, then read every `readEveryMs` up to `untilMs`.
 * @param {{ installAtMs: number, readEveryMs: number, untilMs: number, warnAt?: number }} options
 */
export function lanesTrapSteps({ installAtMs, readEveryMs, untilMs, warnAt }) {
  if (!(installAtMs > 0 && readEveryMs > 0 && untilMs > installAtMs)) throw new Error(`lanesTrapSteps: install ${installAtMs} ms, every ${readEveryMs} ms, until ${untilMs} ms`);
  const out = [`${lanesTrapSource(warnAt === undefined ? {} : { warnAt })}@${installAtMs}`];
  for (let at = installAtMs + readEveryMs; at <= untilMs; at += readEveryMs) out.push(`${LANES_TRAP_READ}@${at}`);
  return out.join(';;');
}

/**
 * What a launch's log says the trap saw: whether it installed, whether its install line reached the log through the console
 * relay (`relayed`, OQ-278), its last summary, and the lines it wrote (the install line is not one of them).
 * @param {string} log
 */
export function lanesTrapReading(log) {
  /** @type {Array<{ at: number, value: any }>} */
  const readings = [];
  /** @type {any[]} */
  const lines = [];
  let relayed = false;
  for (const line of String(log).split('\n')) {
    const evaluated = /capture: eval-at (\d+) (.*) → (.*)$/.exec(line);
    if (evaluated && (evaluated[2].includes('__rotarisLanesTrap'))) {
      try { readings.push({ at: Number(evaluated[1]), value: JSON.parse(evaluated[3]) }); } catch { readings.push({ at: Number(evaluated[1]), value: { unreadable: evaluated[3] } }); }
      continue;
    }
    const at = line.indexOf(`capture: renderer console: ${LANES_TRAP_PREFIX} `);
    if (at >= 0) {
      const text = line.slice(at + `capture: renderer console: ${LANES_TRAP_PREFIX} `.length).replace(/ \([^()]*:\d+\)\s*$/, '');
      if (`${LANES_TRAP_PREFIX} ${text}` === LANES_TRAP_INSTALLED) { relayed = true; continue; }
      try { lines.push(JSON.parse(text)); } catch { lines.push({ unreadable: text }); }
    }
  }
  const installed = readings.find((r) => r.value && r.value.installed === true) ?? null;
  const last = [...readings].reverse().find((r) => r.value && r.value.installed === true) ?? null;
  return {
    installed: installed !== null,
    relayed,
    reason: installed === null ? (readings[0]?.value?.reason ?? 'no reading of the trap in the log') : null,
    readings: readings.length,
    last: last?.value ?? null,
    lines,
  };
}

/**
 * The duress launch's check of the instrument itself (OQ-278, ruled 2026-10-13 under R-072): the trap installed, and its
 * install line reached `duress/app.log` through the console relay. Either missing is a FAILURE, since a guard whose
 * instrument did not run cannot close the note it guards (`docs/defects/README.md`, closing an unreproduced note).
 * @param {{ installed: boolean, relayed: boolean, reason: string | null }} reading `lanesTrapReading`'s answer
 */
export function lanesTrapGuard(reading) {
  const what = "the long run's pendingLanes trap installed and its install line reached duress/app.log through the console relay (D8 guard, OQ-278)";
  if (!reading.installed) return { passed: false, what, detail: `the trap did not install: ${reading.reason ?? 'no reading'}` };
  if (!reading.relayed) return { passed: false, what, detail: `the trap installed, but no relayed "${LANES_TRAP_INSTALLED}" line is in the log: the console relay did not carry it` };
  return { passed: true, what, detail: undefined };
}
