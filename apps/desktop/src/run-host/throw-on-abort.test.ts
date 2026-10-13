import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolContext, ToolExecutor } from '@rotaris/agent-tools';
import { throwOnAbort, throwOnAbortNames } from './throw-on-abort.js';

/**
 * `ROTARIS_CAPTURE_THROW_ON_ABORT` (verification only): the named executor rejects once its call's signal aborts, and is
 * otherwise the real executor. `pnpm mcp-proof`'s `cancel-throw` launch drives PD-TOOLS-013 revision 2 (a) through it.
 */
const ctxWith = (signal: AbortSignal): ToolContext => ({
  workspaceRoot: '/w', sessionId: 's', agentName: 'a', persona: 'p', signal, warn: () => undefined,
  monotonic: { now: () => 0 } as unknown as ToolContext['monotonic'], wall: { now: () => 0 } as unknown as ToolContext['wall'],
});

function slowExecutor(settle: (signal: AbortSignal) => Promise<{ text: string; isError: boolean }>): ToolExecutor {
  return {
    name: 'slow', description: 'Answer after a delay.', schema: z.object({ ms: z.number().optional() }) as z.ZodType<unknown>,
    parameters: { type: 'object' }, label: () => 'slow label',
    execute: (_args, ctx) => settle(ctx.signal),
  };
}

describe('throwOnAbort (the ROTARIS_CAPTURE_THROW_ON_ABORT seam)', () => {
  it('names the tools a comma list gives, blanks dropped', () => {
    expect([...throwOnAbortNames(' slow , fetch,,')]).toEqual(['slow', 'fetch']);
    expect(throwOnAbortNames(undefined).size).toBe(0);
  });

  it('leaves an executor it does not name untouched', () => {
    const real = slowExecutor(() => new Promise(() => undefined));
    expect(throwOnAbort(new Set(['fetch']), real)).toBe(real);
  });

  it('rejects the moment the signal aborts, while the real executor is still running', async () => {
    const real = slowExecutor(() => new Promise(() => undefined));
    const wrapped = throwOnAbort(new Set(['slow']), real);
    const run = new AbortController();
    const pending = wrapped.execute({ ms: 60_000 }, ctxWith(run.signal));
    run.abort();
    await expect(pending).rejects.toThrow("the 'slow' executor threw on its aborted signal");
  });

  it('rejects at once for a signal already aborted', async () => {
    const run = new AbortController();
    run.abort();
    await expect(throwOnAbort(new Set(['slow']), slowExecutor(() => new Promise(() => undefined))).execute({}, ctxWith(run.signal))).rejects.toThrow(/threw on its aborted signal/);
  });

  it('settles as the real executor does when the call is never cancelled, and keeps every other field', async () => {
    const real = slowExecutor(async () => ({ text: 'slept 1', isError: false }));
    const wrapped = throwOnAbort(new Set(['slow']), real);
    await expect(wrapped.execute({ ms: 1 }, ctxWith(new AbortController().signal))).resolves.toEqual({ text: 'slept 1', isError: false });
    expect(wrapped).not.toBe(real);
    expect(wrapped.name).toBe('slow');
    expect(wrapped.schema).toBe(real.schema);
    expect(wrapped.parameters).toBe(real.parameters);
    expect(wrapped.label?.({})).toBe('slow label');
  });
});
