import { hookDisplayName, loadHooksConfig, type HookEntry } from '@rotaris/config';
import { applyGate, HookEngine, type HookSinks } from '@rotaris/hooks';
import { redact, type Clocks } from '@rotaris/kernel';
import type { HookPort, HookPortContext } from '@rotaris/engine';

/**
 * The run-host root's side of the hooks (ADR-0015): resolve the set from the two file scopes once at run
 * start (REQ-HOOKS-131), apply the trust gate to the in-memory set that was fingerprinted (REQ-HOOKS-097),
 * build the session's engine over the session writer, and hand the engine's `HookPort` and the gate's
 * `ToolHooks` back as one object. A set that cannot be resolved leaves the run with no hooks and one
 * warning (REQ-HOOKS-085). The hook process inherits this process's environment (REQ-HOOKS-032) and runs
 * in the workspace, which is the tree the run is changing until worktrees exist (REQ-HOOKS-030/084).
 */
export interface HookRootDeps {
  readonly clocks: Clocks;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string>>;
}

export const HOOKS_LOAD_WARNING = "Could not resolve this run's hooks; continuing without them.";

export function createHookPort(ctx: HookPortContext, deps: HookRootDeps): HookPort {
  const load = loadHooksConfig({ globalDir: deps.globalDir, workspaceRoot: ctx.workspaceRoot });
  let loadWarning = '';
  let permitted: readonly HookEntry[] = [];
  let withheld: readonly HookEntry[] = [];
  let gateNotice = '';
  let reinstated = 0;
  let workspace = ctx.workspaceRoot;
  let fingerprint = '';
  if (!load.ok) {
    loadWarning = HOOKS_LOAD_WARNING;
    ctx.log(`${HOOKS_LOAD_WARNING} ${load.error.errors.map((e) => `${e.scope} ${e.file}${e.path ? ` ${e.path}` : ''}: ${e.message}`).join('; ')}`);
  } else {
    const gate = applyGate(load.value, ctx.workspaceRoot);
    permitted = gate.permitted;
    withheld = gate.withheld;
    gateNotice = gate.notice;
    reinstated = gate.reinstated.length;
    workspace = gate.workspace;
    fingerprint = gate.fingerprint;
  }
  const { writer } = ctx;
  const sinks: HookSinks = {
    event: (kind, payload) => { const r = writer.recordEvent(kind, payload as unknown as Record<string, unknown>); if (!r.ok) throw new Error(`${r.error.code}`); },
    timeline: (name, actor, message, metadata) => { const r = writer.appendTimeline(name, actor, message, metadata); if (!r.ok) throw new Error(`${r.error.code}`); },
    issue: (i) => { const r = writer.recordIssue(i); if (!r.ok) throw new Error(`${r.error.code}`); },
    warn: ctx.warn,
    log: ctx.log,
  };
  const engine = new HookEngine(permitted, withheld, {
    sessionId: ctx.sessionId, workspace, cwd: ctx.workspaceRoot, env: deps.env, timers: deps.clocks.timers, monotonic: deps.clocks.monotonic, sinks,
  });
  return {
    auditSnapshot: () => permitted.filter((h) => h.enabled).map((h) => ({ hook_id: h.id, name: hookDisplayName(h), event: h.event, matcher: h.matcher, source: h.source, command: redact(h.command) })),
    trust: () => ({ withheld: withheld.length, reinstated, notice: gateNotice, workspace, fingerprint, loadWarning }),
    announceWithheld: () => engine.announceWithheld(),
    hasHooksFor: (event) => engine.hasHooksFor(event),
    fireLifecycle: (event, fields) => engine.fireLifecycle(event, fields),
    advisory: () => engine.advisory(),
    toolHooks: {
      preTool: async (call) => { const r = await engine.fireTool('pre_tool', call); return { blocked: r.blocked, refusal: r.refusal }; },
      postTool: async (call) => { const r = await engine.fireTool('post_tool', call); return { feedback: r.feedback }; },
    },
  };
}
