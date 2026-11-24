import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, newVariant, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime } from 'quickjs-emscripten-core';

/**
 * PD-ORCH-019 clause 5: the isolate a workflow script runs in. One QuickJS interpreter compiled to WebAssembly per script,
 * over its own capped WebAssembly memory. The script reaches nothing but `__host`, the one function this module puts in
 * its global object, and the helpers the prelude builds on it (`agent`, `tool`, `phase`, `log`, `parallel`, `pipeline`).
 *
 * What the spike decided (`docs/architecture/spikes/quickjs-workflow-isolate.md`), kept where it binds:
 * - the memory bound is the WebAssembly memory's `maximum`. The engine's own `setMemoryLimit` did not bound an allocating
 *   script, so it is not relied on;
 * - the host runs the interpreter's pending jobs after every settlement it makes and after the evaluation, or the script
 *   waits forever on a promise the host already settled;
 * - `Date` and `Math.random` are removed before the script runs, so a script reads the same on a replay (clause 8);
 * - a script's time on the processor is bounded per entry into the interpreter by the interrupt handler. The time it
 *   spends waiting on a call is not processor time and is the caller's to bound.
 *
 * Nothing here knows what a call does. Calls are numbered in the order the script makes them, which is the order a
 * journal replays them in (`journal.ts`).
 */

/** The kinds of call a script can make of its host. */
export const WORKFLOW_CALL_KINDS = ['agent', 'tool', 'phase', 'log'] as const;
export type WorkflowCallKind = (typeof WORKFLOW_CALL_KINDS)[number];

export interface WorkflowCall {
  /** The call's position among the script's calls, from 0, in the order the script made them. */
  readonly seq: number;
  readonly kind: WorkflowCallKind;
  /** The call's arguments as the script gave them, already parsed from JSON. */
  readonly payload: unknown;
}

export interface WorkflowHost {
  /** Answers one call. The value must survive `JSON.stringify`; a rejection reaches the script as an `Error` with its message. */
  call(call: WorkflowCall): Promise<unknown>;
}

export type WorkflowOutcome =
  | { readonly ok: true; readonly value: unknown; readonly calls: number }
  | { readonly ok: false; readonly error: string; readonly reason: 'script_error' | 'stopped' | 'cpu_limit' | 'memory_limit'; readonly calls: number };

export interface WorkflowIsolateOptions {
  /** The script's heap bound, in bytes; rounded up to WebAssembly pages. */
  readonly memoryBytes?: number | undefined;
  /** The processor time one entry into the interpreter may take, in milliseconds. */
  readonly sliceMs?: number | undefined;
  /** Wall-clock milliseconds, for the interrupt handler's deadline. Never visible to the script. */
  readonly now: () => number;
  /** Stops the script: every call it waits on is rejected and the interpreter is interrupted. */
  readonly signal?: AbortSignal | undefined;
}

/** The one WebAssembly constructor this module needs; the package's TypeScript libraries declare no `WebAssembly`. */
declare const WebAssembly: { readonly Memory: new (descriptor: { initial: number; maximum: number }) => object };

export const WORKFLOW_MEMORY_BYTES = 64 * 1024 * 1024;
export const WORKFLOW_SLICE_MS = 2_000;
const WASM_PAGE = 65_536;
const INITIAL_PAGES = 256;

/**
 * The script's standard library, evaluated before it. Every helper is ordinary script code over `__host`, so a replay
 * runs it the same way. `parallel` takes functions (or promises) and resolves to their results in order; `pipeline` runs
 * each item through the stages in turn, the items side by side.
 */
const PRELUDE = `
(() => {
  const host = globalThis.__host;
  const ask = (kind, payload) => host(kind, JSON.stringify(payload === undefined ? null : payload)).then((text) => JSON.parse(text));
  const g = globalThis;
  g.agent = (prompt, options) => ask('agent', Object.assign({}, options || {}, { prompt: String(prompt) }));
  g.tool = (name, args) => ask('tool', { name: String(name), args: args || {} });
  g.phase = (title) => ask('phase', { title: String(title) });
  g.log = (message) => ask('log', { message: typeof message === 'string' ? message : JSON.stringify(message) });
  g.parallel = (items) => Promise.all(Array.from(items).map((item) => (typeof item === 'function' ? item() : item)));
  g.pipeline = (items, ...stages) => Promise.all(Array.from(items).map(async (item, index) => {
    let value = item;
    for (const stage of stages) value = await stage(value, item, index);
    return value;
  }));
  delete g.__host;
  delete g.Date;
  Math.random = undefined;
})();
`;

const errorText = (dumped: unknown): string => {
  if (dumped !== null && typeof dumped === 'object') {
    const e = dumped as { name?: unknown; message?: unknown; stack?: unknown };
    const head = `${typeof e.name === 'string' ? e.name : 'Error'}: ${typeof e.message === 'string' ? e.message : JSON.stringify(dumped)}`;
    const at = typeof e.stack === 'string' ? e.stack.split('\n').map((l) => l.trim()).find((l) => l.includes('workflow.js')) : undefined;
    return at === undefined ? head : `${head} (${at.replace(/^at\s+/, '')})`;
  }
  return String(dumped);
};

/**
 * Runs `script` as the body of an async function and resolves to what it returned, or to why it did not. It never
 * rejects: a script that throws, loops, allocates without end or is stopped is an outcome.
 */
export async function runWorkflowScript(script: string, host: WorkflowHost, options: WorkflowIsolateOptions): Promise<WorkflowOutcome> {
  const memoryBytes = options.memoryBytes ?? WORKFLOW_MEMORY_BYTES;
  const sliceMs = options.sliceMs ?? WORKFLOW_SLICE_MS;
  const maximum = Math.max(INITIAL_PAGES, Math.ceil(memoryBytes / WASM_PAGE));
  const wasmMemory = new WebAssembly.Memory({ initial: INITIAL_PAGES, maximum });
  const module = await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: wasmMemory as never }));
  const runtime: QuickJSRuntime = module.newRuntime();
  const vm: QuickJSContext = runtime.newContext();

  let calls = 0;
  let alive = true;
  let stopped = false;
  let deadline = Number.POSITIVE_INFINITY;
  let cpuExceeded = false;
  let failure: { error: string; reason: 'script_error' | 'cpu_limit' | 'memory_limit' } | null = null;
  runtime.setInterruptHandler(() => {
    if (stopped) return true;
    if (options.now() > deadline) { cpuExceeded = true; return true; }
    return false;
  });
  const classify = (text: string): 'script_error' | 'cpu_limit' | 'memory_limit' =>
    cpuExceeded ? 'cpu_limit' : /out of memory/i.test(text) ? 'memory_limit' : 'script_error';
  /** One entry into the interpreter to run what the last settlement made ready. A job that throws ends the script. */
  const pump = (): void => {
    if (!alive) return;
    deadline = options.now() + sliceMs;
    const jobs = runtime.executePendingJobs();
    deadline = Number.POSITIVE_INFINITY;
    if (jobs.error) {
      const text = errorText(vm.dump(jobs.error));
      jobs.error.dispose();
      failure ??= { error: text, reason: classify(text) };
      finish?.();
    }
  };
  let finish: (() => void) | null = null;
  const ended = new Promise<void>((resolve) => { finish = resolve; });

  const hostFunction = vm.newFunction('__host', (kindHandle: QuickJSHandle, payloadHandle: QuickJSHandle) => {
    const kind = vm.getString(kindHandle) as WorkflowCallKind;
    const text = vm.getString(payloadHandle);
    const seq = calls;
    calls += 1;
    const deferred = vm.newPromise();
    const settle = (act: () => void): void => {
      if (!alive) return;
      act();
      pump();
    };
    const reject = (message: string): void => settle(() => { const e = vm.newError(message); deferred.reject(e); e.dispose(); });
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { payload = null; }
    if (!(WORKFLOW_CALL_KINDS as readonly string[]).includes(kind)) {
      queueMicrotask(() => reject(`unknown call '${kind}'`));
      return deferred.handle;
    }
    host.call({ seq, kind, payload }).then(
      (value) => settle(() => { const h = vm.newString(JSON.stringify(value === undefined ? null : value)); deferred.resolve(h); h.dispose(); }),
      (cause: unknown) => reject(cause instanceof Error ? cause.message : String(cause)),
    );
    return deferred.handle;
  });
  vm.setProp(vm.global, '__host', hostFunction);
  hostFunction.dispose();

  const onAbort = (): void => { stopped = true; finish?.(); };
  if (options.signal?.aborted === true) stopped = true;
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let outcome: WorkflowOutcome;
  try {
    const prelude = vm.evalCode(PRELUDE, 'prelude.js');
    if (prelude.error) { const text = errorText(vm.dump(prelude.error)); prelude.error.dispose(); throw new Error(`the workflow prelude failed: ${text}`); }
    prelude.value.dispose();
    deadline = options.now() + sliceMs;
    const evaluated = vm.evalCode(`(async () => {\n${script}\n})().then((value) => JSON.stringify(value === undefined ? null : value))`, 'workflow.js');
    deadline = Number.POSITIVE_INFINITY;
    if (evaluated.error) {
      const text = errorText(vm.dump(evaluated.error));
      evaluated.error.dispose();
      outcome = { ok: false, error: text, reason: stopped ? 'stopped' : classify(text), calls };
    } else {
      const promiseHandle = evaluated.value;
      const settled = vm.resolvePromise(promiseHandle);
      promiseHandle.dispose();
      pump();
      const first = await Promise.race([settled.then((r) => ({ r })), ended.then(() => null)]);
      if (first === null) {
        // Stopped, or a pending job threw: the script's own promise may never settle, so it is not awaited.
        void settled.then((r) => { if (alive) (r.error ?? r.value).dispose(); }, () => undefined);
        const f = failure as { error: string; reason: 'script_error' | 'cpu_limit' | 'memory_limit' } | null;
        outcome = stopped || f === null ? { ok: false, error: 'the workflow was stopped', reason: 'stopped', calls } : { ok: false, error: f.error, reason: f.reason, calls };
      } else if (first.r.error) {
        const text = errorText(vm.dump(first.r.error));
        first.r.error.dispose();
        outcome = { ok: false, error: text, reason: stopped ? 'stopped' : classify(text), calls };
      } else {
        const text = vm.getString(first.r.value);
        first.r.value.dispose();
        let value: unknown = null;
        try { value = JSON.parse(text); } catch { value = text; }
        outcome = { ok: true, value, calls };
      }
    }
  } catch (cause) {
    outcome = { ok: false, error: cause instanceof Error ? cause.message : String(cause), reason: 'script_error', calls };
  }
  options.signal?.removeEventListener('abort', onAbort);
  alive = false;
  // A script cut off mid-flight leaves handles the interpreter still counts; freeing it then aborts the module. The whole
  // module instance and its memory are dropped with this function's locals either way, so a failed dispose loses nothing.
  try { vm.dispose(); runtime.dispose(); } catch { /* the instance is unreachable after this function returns */ }
  return outcome;
}
