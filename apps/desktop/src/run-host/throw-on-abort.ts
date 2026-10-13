import type { ToolExecutor } from '@rotaris/agent-tools';

/**
 * The throw-on-abort seam — verification only. `host.ts` reads its variable under `__ROTARIS_SEAMS__`, so a packaged build
 * reads nothing and hands every executor through unchanged (the variable's name is written there alone, which is what
 * `scripts/package.mjs`'s seam check looks for): each named tool's executor REJECTS the moment its call's signal is aborted,
 * as an executor that throws on the run's cancel would, instead of settling the way the shipped executor does.
 *
 * Why it exists: PD-TOOLS-013 revision 2 (a) reads a call whose executor throws while the call's signal is aborted as
 * `interrupted`, "The '<tool>' call was cancelled by the run before it completed." (`packages/agent-tools/src/gate.ts`'s
 * catch). No executor the product ships throws on its abort — fetch, the MCP executor and the terminal each return their
 * own `interrupted` observation — so without this seam the gate's branch is reached by its unit case alone, never through
 * the run host, the store and `summary.md` (N51 of the 2026-10-13 survey; `pnpm mcp-proof`'s `cancel-throw` launch).
 *
 * The wrapped executor is a prototype child of the real one, so every field and method the gate reads (`name`, `schema`,
 * `parameters`, `validationError`, `inferArguments`, `label`) is the real one's; only `execute` differs, and it still runs
 * the real executor, so a call that is never cancelled settles exactly as it would without the seam.
 */
export function throwOnAbortNames(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? '').split(',').map((name) => name.trim()).filter((name) => name !== ''));
}

/** The executor itself when its name is not listed; otherwise the real one with an `execute` that rejects on the abort. */
export function throwOnAbort(names: ReadonlySet<string>, executor: ToolExecutor): ToolExecutor {
  if (!names.has(executor.name)) return executor;
  const wrapped = Object.create(executor) as { -readonly [K in keyof ToolExecutor]: ToolExecutor[K] };
  wrapped.execute = (args, ctx) => new Promise((resolve, reject) => {
    const thrown = () => reject(new Error(`the '${executor.name}' executor threw on its aborted signal (the throw-on-abort seam)`));
    if (ctx.signal.aborted) { thrown(); return; }
    ctx.signal.addEventListener('abort', thrown, { once: true });
    executor.execute(args, ctx).then(resolve, reject).finally(() => ctx.signal.removeEventListener('abort', thrown));
  });
  return wrapped;
}
