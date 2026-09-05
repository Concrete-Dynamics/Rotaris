import { join } from 'node:path';
import { mergePlaybookOverrides, readIntentMapping, readPlaybookOverrides } from '@rotaris/config';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { isAnswerOnly, type ModelTier } from '@rotaris/contracts';
import { carryOver, classifyIntent, intentGrant, resolveIntentMapping, resolvePlaybooks, ROLE_VOCABULARY, type RungMemory, type ClassifierSlots, type Preflight, type PreflightContext } from '@rotaris/engine';
import type { AgentBackend, ModelRef } from '@rotaris/model';
import type { Clocks } from '@rotaris/kernel';

/**
 * The run-host root's pre-flight (REQ-ORCH-005): classify, grant, resolve the playbooks, clamp. The three
 * model slots come from the configuration resolved for the run (ADR-0036: `small_model`, `fallback_model`,
 * `default_summary_model`; none reachable → no request, the fallback intent with the stated reason).
 * The entry role's tier (REQ-ORCH-023) comes from the configuration since Part K — the slot alias its model
 * resolved through; none → undetermined → medium with the header. `ROTARIS_MODEL_TIER` was the stopgap until
 * then. Decision 5: the intent mapping may be overridden by `<config>/intent-tools.yaml`;
 * playbook overrides live in `<config>/playbooks/` and `<workspace>/.rotaris/playbooks/`. Every read is a
 * fresh read (REQ-CONFIG-014, REQ-ORCH-026's reload).
 */
export interface PreflightDeps {
  readonly clocks: Clocks;
  readonly backend: AgentBackend;
  readonly runModel: ModelRef;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly modelTimeoutMs: number;
  readonly globalDir: string;
  readonly tier: ModelTier | null;
  readonly slots: ClassifierSlots;
  readonly runOverride: 'single' | 'swarm' | null;
  readonly memory: RungMemory;
  readonly log: (m: string) => void;
}

export async function runPreflight(ctx: PreflightContext, deps: PreflightDeps): Promise<Preflight> {
  const warnings: string[] = [];
  const warn = (m: string) => { warnings.push(m); ctx.warn(m); };
  const freshIntent = await classifyIntent(
    { prompt: ctx.prompt, metadata: { entrypoint: 'desktop', workspace_hash: String(ctx.workspaceRoot.length) } },
    deps.slots,
    { backend: deps.backend, timers: deps.clocks.timers, credentialFor: deps.credentialFor, modelTimeoutMs: deps.modelTimeoutMs, memory: deps.memory, warn },
    ctx.signal,
  );
  const intent = carryOver(freshIntent, ctx.previousIntent ?? null, ctx.hasUnfinishedWork ?? null);
  deps.log(`intent: ${intent.category}${intent.fallback ? ` (fallback: ${intent.reason})` : intent.confidence === null ? '' : ` (${intent.confidence})`}${intent.rung ? ` via ${intent.rung}` : ''}`);
  const mapping = resolveIntentMapping(readIntentMapping(join(deps.globalDir, 'intent-tools.yaml')));
  if (mapping.warning !== '') warn(mapping.warning);
  const grant = intentGrant(intent.category, deps.runOverride, mapping.mapping);
  const g = readPlaybookOverrides(join(deps.globalDir, 'playbooks'));
  const w = readPlaybookOverrides(join(ctx.workspaceRoot, WORKSPACE_SCOPE_DIR, 'playbooks'));
  for (const m of [...g.warnings, ...w.warnings]) warn(m);
  const tier = deps.tier;
  const resolved = resolvePlaybooks({ intent: intent.category, tier, roles: [...ROLE_VOCABULARY], entryRole: 'orchestrator', overrides: mergePlaybookOverrides(g.overrides, w.overrides) });
  for (const m of resolved.warnings) warn(m);
  const resolvedPlaybooks: Record<string, NonNullable<Preflight['resolvedPlaybooks'][string]> | null> = {};
  for (const [role, p] of Object.entries(resolved.perRole)) resolvedPlaybooks[role] = p ? { row: p.row, cell: p.cell, text: p.text } : null;
  return {
    intent, grant, route: isAnswerOnly(intent.category) ? 'answer' : 'work',
    resolvedPlaybooks,
    playbookFor: (role) => resolved.perRole[role]?.text ?? '',
    budgetCell: resolved.budgetCell, warnings,
  };
}
