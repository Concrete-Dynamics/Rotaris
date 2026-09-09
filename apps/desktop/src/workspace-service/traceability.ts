/// <reference types="electron-vite/node" />
import type { ProcessReply, WorkspaceServiceRequest } from '@rotaris/contracts';
import type { Clocks } from '@rotaris/kernel';
import { createTraceabilityEngine, createWorkerExecutor, fsArtifactIo, type OperationName, type TraceabilityEngineHandle } from '@rotaris/workspace';
import createTraceabilityWorker from './traceability-worker?nodeWorker';

/**
 * ADR-0040 (Part AJ): the traceability engine's home in the workspace service — the ONE I/O owner for the five
 * repository artifacts (specific 6), with every pass on a terminable worker thread (`traceability-worker.ts`,
 * bundled by electron-vite's `?nodeWorker` factory). The four desktop operations of REQ-TRACE-508..511 arrive as
 * `traceability.operate` against the open workspace's root (REQ-TRACE-512 — the service discovers the repository
 * root from it; a renderer never nominates one), and REQ-TRACE-226's cancel as `traceability.cancel`.
 *
 * One engine per service process, created on first use so the composition root's handler table gains one `case`
 * block and nothing else. The worker is terminated with the process (`shutdown` exits it).
 */
type OperateRequest = Extract<WorkspaceServiceRequest, { kind: 'traceability.operate' }>;
type CancelRequest = Extract<WorkspaceServiceRequest, { kind: 'traceability.cancel' }>;

const OPERATION: Readonly<Record<OperateRequest['operation'], OperationName>> = { check: 'check', regenerate: 'regenerate', baselines: 'updateBaselines', compare: 'compare' };

let engine: TraceabilityEngineHandle | null = null;

export function engineFor(clocks: Clocks, log: (message: string, level?: 'info' | 'warn') => void): TraceabilityEngineHandle {
  if (engine) return engine;
  engine = createTraceabilityEngine({
    executor: createWorkerExecutor(() => createTraceabilityWorker({}), clocks.timers),
    io: fsArtifactIo(clocks.timers),
    clocks,
    log: (m) => log(m, 'warn'),
  });
  return engine;
}

export async function traceabilityOperate(req: OperateRequest, clocks: Clocks, log: (message: string, level?: 'info' | 'warn') => void): Promise<ProcessReply> {
  const e = engineFor(clocks, log);
  const started = Number(clocks.monotonic.now());
  const controller = new AbortController();
  // REQ-TRACE-212/216: the phases are logged by name; a board channel for them is AK's (channel 10, `progress?`).
  const options = { signal: controller.signal, progress: (r: { kind: string; phase: string }) => { if (r.kind === 'phase') log(`traceability ${req.operation} (${req.workspaceRoot}): phase ${r.phase}`); } };
  const result = req.operation === 'check' ? await e.check(req.workspaceRoot, options)
    : req.operation === 'regenerate' ? await e.regenerate(req.workspaceRoot, options)
      : req.operation === 'baselines' ? await e.updateBaselines(req.workspaceRoot, options)
        : await e.compare(req.workspaceRoot, req.base, options);
  const elapsedMs = Math.max(0, Math.round(Number(clocks.monotonic.now()) - started));
  log(`traceability ${req.operation} (${req.workspaceRoot}): ${result.ok ? 'ok' : `refused: ${result.error.kind}`} in ${elapsedMs} ms`, result.ok ? 'info' : 'warn');
  return { kind: 'traceability.result', operation: req.operation, root: req.workspaceRoot, elapsedMs, result: result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error } };
}

export function traceabilityCancel(req: CancelRequest, clocks: Clocks, log: (message: string, level?: 'info' | 'warn') => void): ProcessReply {
  const cancelled = engineFor(clocks, log).cancel(req.workspaceRoot, OPERATION[req.operation]);
  log(`traceability cancel ${req.operation} (${req.workspaceRoot}): ${cancelled ? 'signalled' : 'nothing in flight'}`);
  return { kind: 'traceability.cancelled', cancelled };
}
