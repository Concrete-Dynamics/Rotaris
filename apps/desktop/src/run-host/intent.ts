import { join } from 'node:path';
import { mergePlaybookOverrides, readIntentMapping, readPlaybookOverrides } from '@rotaris/config';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { isAnswerOnly, isModelTier, type ModelTier } from '@rotaris/contracts';
import { carryOver, classifyIntent, intentGrant, resolveIntentMapping, resolvePlaybooks, ROLE_VOCABULARY, type RungMemory, type ClassifierSlots, type Preflight, type PreflightContext } from '@rotaris/engine';
import type { AgentBackend, ModelRef } from '@rotaris/model';
import type { Clocks } from '@rotaris/kernel';

/**
 * The run-host root's pre-flight (REQ-ORCH-005): classify, grant, resolve the playbooks, clamp. Decision 4
 * of the plan: the three model slots and the tier are environment stopgaps until ADR-0036/0028 —
 * `ROTARIS_SMALL_MODEL_ID`, `ROTARIS_FALLBACK_MODEL_ID`, `ROTARIS_SUMMARY_MODEL_ID` (ids on the run model's
 * base URL and credential; none set → no request, the fallback intent with the stated reason) and
 * `ROTARIS_MODEL_TIER` (unset → undetermined → medium with REQ-ORCH-023's header). Decision 5: the intent
 * mapping may be overridden by `<config>/intent-tools.yaml`; playbook overrides live in `<config>/playbooks/`
 * and `<workspace>/.rotaris/playbooks/`. Every read is a fresh read (REQ-CONFIG-014, REQ-ORCH-026's reload).
 */
export const INTENT_ENV_KEYS = {
  smallModel: 'ROTARIS_SMALL_MODEL_ID',
  fallbackModel: 'ROTARIS_FALLBACK_MODEL_ID',
  summaryModel: 'ROTARIS_SUMMARY_MODEL_ID',
  modelTier: 'ROTARIS_MODEL_TIER',
} as const;

export interface PreflightDeps {
  readonly clocks: Clocks;
  readonly backend: AgentBackend;
  readonly runModel: ModelRef;
  readonly resolveCredential: () => Promise<string>;
  readonly modelTimeoutMs: number;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runOverride: 'single' | 'swarm' | null;
  readonly memory: RungMemory;
  readonly log: (m: string) => void;
}

export function slotsFromEnv(env: Readonly<Record<string, string | undefined>>, runModel: ModelRef): ClassifierSlots {
  const ref = (key: string): ModelRef | null => { const id = (env[key] ?? '').trim(); return id === '' ? null : { ...runModel, modelId: id }; };
  return { small: ref(INTENT_ENV_KEYS.smallModel), fallback: ref(INTENT_ENV_KEYS.fallbackModel), summary: ref(INTENT_ENV_KEYS.summaryModel) };
}

export function tierFromEnv(env: Readonly<Record<string, string | undefined>>, warn: (m: string) => void): ModelTier | null {
  const raw = (env[INTENT_ENV_KEYS.modelTier] ?? '').trim().toLowerCase();
  if (raw === '') return null;
  if (isModelTier(raw)) return raw;
  warn(`unrecognised model tier '${raw}'; the tier is undetermined (REQ-ORCH-023)`);
  return null;
}

export async function runPreflight(ctx: PreflightContext, deps: PreflightDeps): Promise<Preflight> {
  const warnings: string[] = [];
  const warn = (m: string) => { warnings.push(m); ctx.warn(m); };
  const freshIntent = await classifyIntent(
    { prompt: ctx.prompt, metadata: { entrypoint: 'desktop', workspace_hash: String(ctx.workspaceRoot.length) } },
    slotsFromEnv(deps.env, deps.runModel),
    { backend: deps.backend, timers: deps.clocks.timers, resolveCredential: deps.resolveCredential, modelTimeoutMs: deps.modelTimeoutMs, memory: deps.memory, warn },
    ctx.signal,
  );
  const intent = carryOver(freshIntent, ctx.previousIntent ?? null, ctx.hasUnfinishedWork ?? null);
  deps.log(`intent: ${intent.category}${intent.fallback ? ` (fallback: ${intent.reason})` : intent.confidence === null ? '' : ` (${intent.confidence})`}`);
  const mapping = resolveIntentMapping(readIntentMapping(join(deps.globalDir, 'intent-tools.yaml')));
  if (mapping.warning !== '') warn(mapping.warning);
  const grant = intentGrant(intent.category, deps.runOverride, mapping.mapping);
  const g = readPlaybookOverrides(join(deps.globalDir, 'playbooks'));
  const w = readPlaybookOverrides(join(ctx.workspaceRoot, WORKSPACE_SCOPE_DIR, 'playbooks'));
  for (const m of [...g.warnings, ...w.warnings]) warn(m);
  const tier = tierFromEnv(deps.env, warn);
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
