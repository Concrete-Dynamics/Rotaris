import { hookDisplayName, type HookEntry, type HooksLoad, type LoadFailure } from '@rotaris/config';
import { EXTERNAL_CLAUDE_CODE_SCOPE, type HookAgentId, type HookInvocation, type HookRow, type HookRowStatus, type HooksSummary } from '@rotaris/contracts';
import type { Result } from '@rotaris/kernel';
import { agentOn, hookOn, type ExternalPolicy } from './policy.js';
import type { GateResult } from './trust.js';

/**
 * What the Hooks tab and the review dialog work from (REQ-HOOKS-103..105, REQ-HOOKS-137, REQ-CONFIG-354..359):
 * one row per hook under its agent group with the status chosen in the load-bearing precedence order,
 * the workspace's review entries (the only place a command travels — REQ-HOOKS-102/106), and the
 * invocations of the session being looked at. Command text appears in `review` and nowhere else.
 */
export interface ImportedRecord {
  readonly id: string;
  readonly name: string;
  readonly event: string;
  readonly usable: boolean;
  readonly reason: string;
  readonly command: string;
  readonly toolNames: readonly string[];
  readonly timeoutSeconds: number;
}

export interface TimelineLike {
  readonly name: string;
  readonly actor: string;
  readonly message: string;
  readonly metadata: string;
}

export interface SummaryInputs {
  readonly workspace: string;
  readonly load: Result<HooksLoad, LoadFailure>;
  readonly gate: GateResult | null;
  readonly policy: ExternalPolicy;
  readonly imported: readonly ImportedRecord[];
  readonly timeline: readonly TimelineLike[];
  readonly switchedOff: readonly string[];
}

export const SOURCE_LABELS: Readonly<Record<string, string>> = {
  default: 'Built-in defaults',
  global: 'Your global configuration',
  workspace: "This workspace's .rotaris/agents.yaml",
  [EXTERNAL_CLAUDE_CODE_SCOPE]: 'Claude Code global settings',
};
export function sourceLabel(scope: string): string {
  return SOURCE_LABELS[scope] ?? scope;
}

/** REQ-CONFIG-359's precedence, exactly in this order. */
export function rowStatus(input: { superseded: string | null; featureOff: boolean; entryEnabled: boolean; usable: boolean; agentOn: boolean; hookOn: boolean; withheld: boolean }): { status: HookRowStatus; reason: string } {
  if (input.superseded !== null) return { status: 'superseded', reason: `Declared in a lower-precedence scope and replaced by ${input.superseded}.` };
  if (input.featureOff) return { status: 'inactive', reason: 'hooks.enabled is false in the configuration.' };
  if (!input.entryEnabled) return { status: 'inactive', reason: 'The entry is declared with enabled: false.' };
  if (!input.usable) return { status: 'inactive', reason: 'This record cannot run in Rotaris.' };
  if (!input.agentOn) return { status: 'disabled by agent', reason: "The agent's hooks are switched off for future sessions." };
  if (!input.hookOn) return { status: 'disabled', reason: 'Switched off for future sessions.' };
  if (input.withheld) return { status: 'blocked — not reviewed', reason: 'Withheld by the trust gate until this workspace is reviewed and allowed.' };
  return { status: 'active', reason: 'Runs during future sessions.' };
}

export function buildSummary(inputs: SummaryInputs): HooksSummary {
  const rows: HookRow[] = [];
  const gate = inputs.gate;
  const withheldIds = new Set(gate?.withheld.map((h) => h.id) ?? []);
  const loadError = inputs.load.ok ? '' : inputs.load.error.errors.map((e) => `${e.scope}${e.path ? ` ${e.path}` : ''}: ${e.message}`).join('; ');
  if (inputs.load.ok) {
    const featureOff = !inputs.load.value.enabled;
    const entries = [...inputs.load.value.entries, ...(gate?.reinstated ?? [])];
    const seen = new Set<string>();
    const push = (h: HookEntry, superseded: string | null) => {
      if (seen.has(h.id)) return;
      seen.add(h.id);
      const s = rowStatus({ superseded, featureOff, entryEnabled: h.enabled, usable: true, agentOn: agentOn(inputs.policy, 'rotaris'), hookOn: hookOn(inputs.policy, 'rotaris', h.id), withheld: withheldIds.has(h.id) });
      rows.push({ agent: 'rotaris', id: h.id, name: hookDisplayName(h), event: h.event, matcher: h.matcher, sourceLabel: sourceLabel(h.source), scope: h.source, status: s.status, statusReason: s.reason, checkable: superseded === null, checked: hookOn(inputs.policy, 'rotaris', h.id), hasCommand: h.command !== '' });
    };
    for (const h of entries) push(h, null);
    // REQ-CONFIG-153: a displaced entry is disclosed with the scope that replaced it and no checkbox.
    const winner = inputs.load.value.entries[0]?.source ?? 'workspace';
    for (const h of inputs.load.value.superseded) push(h, sourceLabel(winner));
  }
  for (const r of inputs.imported) {
    const s = rowStatus({ superseded: null, featureOff: false, entryEnabled: true, usable: r.usable, agentOn: agentOn(inputs.policy, 'claude-code'), hookOn: hookOn(inputs.policy, 'claude-code', r.id), withheld: false });
    rows.push({ agent: 'claude-code', id: r.id, name: r.name, event: r.event, matcher: '', sourceLabel: sourceLabel(EXTERNAL_CLAUDE_CODE_SCOPE), scope: EXTERNAL_CLAUDE_CODE_SCOPE, status: s.status, statusReason: r.usable ? s.reason : r.reason, checkable: r.usable, checked: hookOn(inputs.policy, 'claude-code', r.id), hasCommand: r.command !== '' });
  }
  const workspaceEntries = inputs.load.ok ? inputs.load.value.entries.filter((h) => h.source === 'workspace') : [];
  const review = workspaceEntries.map((h) => ({ name: hookDisplayName(h), event: h.event, matcher: h.matcher, timeoutSeconds: h.timeoutSeconds, required: h.required, enabled: h.enabled, command: h.command }));
  const invocations = invocationsOf(inputs.timeline, gate?.withheld ?? [], inputs.switchedOff);
  return {
    workspace: gate?.workspace ?? inputs.workspace,
    status: gate?.status ?? 'none',
    fingerprint: gate?.fingerprint ?? '',
    declaredCount: workspaceEntries.length,
    notice: gate?.notice ?? '',
    rows, review, invocations,
    decisionStored: gate?.decision !== null && gate?.decision !== undefined,
    loadError,
  };
}

/** REQ-HOOKS-137: the invocations in the order they happened, withheld hooks by stable id with their reason, switched-off ones marked after their last invocation. */
export function invocationsOf(timeline: readonly TimelineLike[], withheld: readonly HookEntry[], switchedOff: readonly string[]): HookInvocation[] {
  const out: HookInvocation[] = [];
  for (const h of withheld) out.push({ hookId: h.id, name: h.id, event: h.event, toolName: '', exitCode: -1, durationMs: 0, timedOut: false, blocked: false, stdout: '', stderr: '', withheld: true, switchedOff: false, reason: 'untrusted_workspace' });
  const lastOf = new Map<string, number>();
  for (const t of timeline) {
    if (t.name !== 'hook_run') continue;
    let m: Record<string, unknown> = {};
    try { m = JSON.parse(t.metadata) as Record<string, unknown>; } catch { /* an unreadable entry is shown by its message alone */ }
    const hookId = String(m['hook_id'] ?? '');
    out.push({
      hookId, name: String(m['hook_name'] ?? t.actor), event: String(m['event'] ?? ''), toolName: String(m['tool_name'] ?? ''),
      exitCode: typeof m['exit_code'] === 'number' ? m['exit_code'] : -1, durationMs: typeof m['duration_ms'] === 'number' ? m['duration_ms'] : 0,
      timedOut: m['timed_out'] === true, blocked: m['blocked'] === true, stdout: String(m['stdout'] ?? ''), stderr: String(m['stderr'] ?? ''),
      withheld: false, switchedOff: false, reason: '',
    });
    lastOf.set(hookId, out.length - 1);
  }
  for (const id of switchedOff) {
    const i = lastOf.get(id);
    if (i !== undefined) out[i] = { ...out[i]!, switchedOff: true };
  }
  return out;
}

export function agentIds(): readonly HookAgentId[] {
  return ['rotaris', 'claude-code'];
}
