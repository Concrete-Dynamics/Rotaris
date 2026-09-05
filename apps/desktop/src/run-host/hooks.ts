import { hookDisplayName, loadHooksConfig, type HookEntry } from '@rotaris/config';
import { applyGate, buildSummary, claudeSettingsPath, clearDecision, discoverClaudeCodeHooks, HookEngine, hookOn, importedEntry, policyPath, readPolicy, withToggle, writeDecision, writePolicy, type HookSinks } from '@rotaris/hooks';
import { asSessionId, err, ok, redact, type Clocks, type Result } from '@rotaris/kernel';
import type { HookAgentId, HooksSummary } from '@rotaris/contracts';
import type { StoreDal } from '@rotaris/store';
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
    // REQ-HOOKS-116/117/131: the policy toggles are read once here, when the set is assembled, and never again for this run.
    const policy = readPolicy(policyPath(deps.env, deps.globalDir));
    // REQ-HOOKS-116/117: the surviving native, trust-gated hooks in declaration order, then the enabled usable imported ones.
    const imported = discoverClaudeCodeHooks(claudeSettingsPath(deps.env)).records.filter((r) => r.usable && hookOn(policy, 'claude-code', r.id)).map(importedEntry);
    permitted = [...gate.permitted.filter((h) => hookOn(policy, 'rotaris', h.id)), ...imported];
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
    // REQ-GIT-019: a hook runs where the work happens — the worktree of an isolated run; the set was loaded from the base.
    sessionId: ctx.sessionId, workspace, cwd: ctx.effectiveRoot ?? ctx.workspaceRoot, env: deps.env, timers: deps.clocks.timers, monotonic: deps.clocks.monotonic, sinks,
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

/** REQ-HOOKS-103..105/137: everything the Hooks tab renders, re-read from the sources on every call (REQ-CONFIG-014). */
export function hooksSummaryFor(o: { readonly workspaceRoot: string; readonly globalDir: string; readonly env: Readonly<Record<string, string>>; readonly dal: StoreDal | null; readonly sessionId?: string | undefined }): HooksSummary {
  const load = loadHooksConfig({ globalDir: o.globalDir, workspaceRoot: o.workspaceRoot });
  const gate = load.ok ? applyGate(load.value, o.workspaceRoot) : null;
  const policy = readPolicy(policyPath(o.env, o.globalDir));
  const sid = o.dal && o.sessionId ? asSessionId(o.sessionId) : null;
  const timeline = sid && o.dal ? o.dal.timelineOf(sid) : [];
  const issues = sid && o.dal ? o.dal.issuesOf(sid) : [];
  const switchedOff = issues.filter((i) => i.kind === 'hook_failure' && i.message.includes('is disabled for the rest of this session')).flatMap((i) => { try { const m = JSON.parse(i.metadata) as { hook_id?: string }; return m.hook_id ? [m.hook_id] : []; } catch { return []; } });
  const imported = discoverClaudeCodeHooks(claudeSettingsPath(o.env)).records;
  return buildSummary({ workspace: o.workspaceRoot, load, gate, policy, imported, timeline, switchedOff });
}

/** REQ-HOOKS-092/093/096/097: the decision is recorded against the fingerprint of the in-memory set just resolved. */
export async function decideHooks(workspaceRoot: string, globalDir: string, trusted: boolean, nowIso: string): Promise<Result<{ readonly fingerprint: string }, { readonly reason: string }>> {
  const load = loadHooksConfig({ globalDir, workspaceRoot });
  if (!load.ok) return err({ reason: 'the hook configuration could not be read, so no decision can be recorded against it' });
  const gate = applyGate(load.value, workspaceRoot);
  if (load.value.entries.filter((h) => h.source === 'workspace').length === 0) return err({ reason: 'this workspace declares no hooks' });
  const w = await writeDecision(workspaceRoot, gate.fingerprint, trusted, nowIso);
  return w.ok ? ok({ fingerprint: gate.fingerprint }) : err(w.error);
}

export function clearHooksDecision(workspaceRoot: string): Result<void, { readonly reason: string }> {
  return clearDecision(workspaceRoot);
}

/** REQ-HOOKS-109/115: a checkbox change is saved to the policy file; it governs runs started afterwards. */
export async function setHookToggle(env: Readonly<Record<string, string>>, globalDir: string, agent: HookAgentId, hookId: string | null, on: boolean): Promise<Result<void, { readonly reason: string }>> {
  const path = policyPath(env, globalDir);
  return writePolicy(path, withToggle(readPolicy(path), agent, hookId, on));
}
