import { z } from 'zod';
import { DELEGATION_STRATEGY_NAMES, depthLimitLabel, type DelegationStrategyName } from './delegation.js';
import { intentGroup, type IntentCategory, type ModelTier } from './intent.js';

/**
 * PD-ORCH-021: the money slider — how willing the user is to spend, in five stops. A posture and never an amount: nothing
 * here states, estimates or enforces a sum. One pure resolution (`resolveMoneyStop`) says what a stop does to the levers a
 * user left unset; the run host lays it over the configuration at a run's start and at each delegation, and the composer's
 * preview draws the same answer, so what the popover promises is what the run gets.
 */
export const MONEY_STOPS = ['money_saver', 'small_budget', 'regular', 'strong_budget', 'token_burner'] as const;
export type MoneyStop = (typeof MONEY_STOPS)[number];
export const MoneyStopSchema = z.enum(MONEY_STOPS);
/** The shipped default: at `regular` nothing the directive states changes what a run does. */
export const DEFAULT_MONEY_STOP: MoneyStop = 'regular';
export function isMoneyStop(value: unknown): value is MoneyStop {
  return typeof value === 'string' && (MONEY_STOPS as readonly string[]).includes(value);
}

/** Clause 9's fixed names, in its order. */
export const MONEY_STOP_LABELS: Readonly<Record<MoneyStop, string>> = {
  money_saver: 'Money saver', small_budget: 'Small budget', regular: 'Regular', strong_budget: 'Strong budget', token_burner: 'Token burner',
};
/**
 * Clause 9: one sentence per stop. The composer brief's §6 copy, with one change found by building: `runtime.max_depth`
 * reads 3 as no limit since PD-ORCH-019 clause 4, so no stop moves the depth and Token burner's sentence names none.
 */
export const MONEY_STOP_SENTENCES: Readonly<Record<MoneyStop, string>> = {
  money_saver: 'One agent does the work and delegates nothing, one tier and one reasoning level lower except on a large build.',
  small_budget: 'The entry role delegates only when it chooses, and every agent it delegates to runs one tier lower.',
  regular: 'Runs as configured: this stop moves nothing.',
  strong_budget: 'The entry role runs one tier and one reasoning level higher, and a run may start more agents.',
  token_burner: 'Every agent runs one tier and one reasoning level higher, and a run may start 40 agents, 12 at once.',
};
/** Clause 9: the chip is drawn in the design language's warning state at the two upper stops. */
export function isWarningStop(stop: MoneyStop): boolean {
  return stop === 'strong_budget' || stop === 'token_burner';
}
/** The rule a stop's result depends on, written as the rule (clause 9), for a reader who does not yet know the intent. */
export const MONEY_STOP_RULES: Readonly<Record<MoneyStop, string | null>> = {
  money_saver: 'Except on a large build, where the entry role keeps its tier and reasoning level.',
  small_budget: 'A lead run classifies nothing, so this holds whatever you ask.',
  regular: null,
  strong_budget: 'Except on an answer, a clarification or a micro edit, which run as at Regular.',
  token_burner: 'Except on an answer, a clarification or a micro edit, which run as at Regular.',
};
export const MONEY_RULE_ALL_SET = 'You have set every lever, so no stop moves anything. Clear a value in Settings to let the slider choose it.';

/**
 * Clause 4: how the classified intent bounds the stop. `unknown` is a reader's that does not yet know it (the preview, or
 * the run's start before its classification), and resolves as `none` does — the rule is then written beside the result.
 */
export type MoneyIntentHold = 'unknown' | 'none' | 'answer' | 'large_build';
export function moneyIntentHold(intent: IntentCategory | null): MoneyIntentHold {
  if (intent === null) return 'none';
  const group = intentGroup(intent);
  if (group === 'answer' || group === 'clarify' || group === 'micro') return 'answer';
  if (group === 'large-build') return 'large_build';
  return 'none';
}

/**
 * Where a lever's effective value comes from. Clause 2: `global`, `workspace` and `session` are **set**, and no stop moves a
 * set lever; `default` (the shipped value) and `discovered` (the discovery snapshot, which is no choice of the user's) are not.
 */
export const LEVER_ORIGINS = ['default', 'discovered', 'global', 'workspace', 'session'] as const;
export type LeverOrigin = (typeof LEVER_ORIGINS)[number];
export function isSetOrigin(origin: LeverOrigin): boolean {
  return origin === 'global' || origin === 'workspace' || origin === 'session';
}
const leverOf = <T extends z.ZodType>(value: T) => z.object({ value, origin: z.enum(LEVER_ORIGINS) });
export interface Lever<T> { readonly value: T; readonly origin: LeverOrigin }

export const TIER_SLOTS = ['small_model', 'medium_model', 'large_model'] as const;
export type TierSlot = (typeof TIER_SLOTS)[number];
export function tierOfSlot(slot: TierSlot): ModelTier {
  return slot === 'small_model' ? 'small' : slot === 'medium_model' ? 'medium' : 'large';
}

/**
 * Everything a stop reads: the levers of clause 2 with where each comes from, and what each tier slot holds. Computed once,
 * by `@rotaris/config` (`moneyLeversOf`), for the run host and for the snapshot the composer's preview reads, so the two
 * cannot read the configuration differently.
 */
export const MoneyLeversSchema = z.object({
  strategy: leverOf(z.enum(DELEGATION_STRATEGY_NAMES)),
  maxActive: leverOf(z.number().int()),
  maxDepth: leverOf(z.number().int()),
  maxTotal: leverOf(z.number().int()),
  entryRole: z.string(),
  /** Each role: its model as configured (a tier alias, clause 5's "configured on a tier alias", or a model key) and its own level. */
  roles: z.array(z.object({ role: z.string(), model: leverOf(z.string()), thinking: leverOf(z.string().nullable()) })),
  /** The model key each tier slot holds; null where it holds none. */
  slots: z.object({ small_model: z.string().nullable(), medium_model: z.string().nullable(), large_model: z.string().nullable() }),
  /** Clause 6: the reasoning levels each model key offers, in their order (`offeredReasoningLevels`). */
  offered: z.record(z.string(), z.array(z.string())),
});
export type MoneyLevers = z.infer<typeof MoneyLeversSchema>;
export type RoleLevers = MoneyLevers['roles'][number];

/** Why a lever a stop would move stays as configured (clauses 5 and 6's ends). */
export type StaysReason = 'largest tier' | 'smallest tier' | 'no larger model configured' | 'no smaller model configured' | 'no tier' | 'highest level' | 'lowest level' | 'no levels';
export type LeverMark =
  | { readonly kind: 'moved'; readonly direction: 'up' | 'down' | 'changed'; readonly from: string }
  | { readonly kind: 'set'; readonly origin: LeverOrigin }
  | { readonly kind: 'stays'; readonly reason: StaysReason };
export interface LeverResult<T> { readonly value: T; readonly mark: LeverMark | null }

export interface RoleResult {
  readonly role: string;
  readonly entry: boolean;
  /** The model as the role will be configured: a tier alias or a model key. */
  readonly model: LeverResult<string>;
  /** The model key the role runs on: the slot's model where `model` is an alias; null where the slot holds none. */
  readonly modelKey: string | null;
  readonly tier: ModelTier | null;
  /** The level the role will run at, written into its configuration; null where it names none of its own (unchanged). */
  readonly thinking: LeverResult<string | null>;
  /** The levels the resulting model offers: empty means none, and no stop changes it. */
  readonly offered: readonly string[];
}

/** Clause 8: how the resolved cell's BUDGET clamps at this stop. */
export type BudgetWidening = 'cell' | 'one_wider' | 'wide';
export interface MoneyResolution {
  readonly stop: MoneyStop;
  readonly hold: MoneyIntentHold;
  readonly strategy: LeverResult<DelegationStrategyName>;
  /** Null where the strategy is `single`: no child exists, so no limit applies. */
  readonly limits: { readonly maxActive: LeverResult<number>; readonly maxDepth: LeverResult<number>; readonly maxTotal: LeverResult<number> } | null;
  readonly roles: readonly RoleResult[];
  readonly budget: BudgetWidening;
  /** The intent rule the result depends on, written as the rule (clause 9); null where none, or the intent is known. */
  readonly rule: string | null;
  /** True where every lever is set, so no stop moves anything. */
  readonly allSet: boolean;
}

const TIER_STEP: Readonly<Record<TierSlot, { up: TierSlot | null; down: TierSlot | null }>> = {
  small_model: { up: 'medium_model', down: null },
  medium_model: { up: 'large_model', down: 'small_model' },
  large_model: { up: null, down: 'medium_model' },
};
const NAMES_NO_LEVEL: ReadonlySet<string> = new Set(['default', 'provider_default', 'auto']);

function isTierSlot(name: string): name is TierSlot {
  return (TIER_SLOTS as readonly string[]).includes(name);
}

/** What each stop asks of each lever, before clause 2 (set levers) and clauses 5 and 6 (the ends) are applied. */
interface StopAsk {
  readonly strategy: DelegationStrategyName | null;
  readonly entry: -1 | 0 | 1;
  readonly delegated: -1 | 0 | 1;
  /** Reasoning moves with the tier for the roles it names. */
  readonly entryReasoning: -1 | 0 | 1;
  readonly delegatedReasoning: -1 | 0 | 1;
  readonly limits: { readonly maxActive: number; readonly maxTotal: number } | null;
  readonly budget: BudgetWidening;
}
const NOTHING: StopAsk = { strategy: null, entry: 0, delegated: 0, entryReasoning: 0, delegatedReasoning: 0, limits: null, budget: 'cell' };

/** Clause 3 as bounded by clause 4. */
function askOf(stop: MoneyStop, hold: MoneyIntentHold): StopAsk {
  switch (stop) {
    case 'money_saver':
      return hold === 'large_build' ? { ...NOTHING, strategy: 'single' } : { ...NOTHING, strategy: 'single', entry: -1, entryReasoning: -1 };
    case 'small_budget':
      return { ...NOTHING, strategy: 'lead', delegated: -1 };
    case 'regular':
      return NOTHING;
    case 'strong_budget':
      return hold === 'answer' ? NOTHING : { ...NOTHING, entry: 1, entryReasoning: 1, limits: { maxActive: 8, maxTotal: 30 }, budget: 'one_wider' };
    case 'token_burner':
      return hold === 'answer' ? NOTHING : { ...NOTHING, entry: 1, delegated: 1, entryReasoning: 1, delegatedReasoning: 1, limits: { maxActive: 12, maxTotal: 40 }, budget: 'wide' };
  }
}

function tierStep(levers: MoneyLevers, role: RoleLevers, step: -1 | 0 | 1): LeverResult<string> {
  const configured = role.model.value;
  if (isSetOrigin(role.model.origin)) return { value: configured, mark: step === 0 ? null : { kind: 'set', origin: role.model.origin } };
  if (step === 0) return { value: configured, mark: null };
  if (!isTierSlot(configured)) return { value: configured, mark: { kind: 'stays', reason: 'no tier' } };
  const next = step > 0 ? TIER_STEP[configured].up : TIER_STEP[configured].down;
  if (next === null) return { value: configured, mark: { kind: 'stays', reason: step > 0 ? 'largest tier' : 'smallest tier' } };
  if (levers.slots[next] === null) return { value: configured, mark: { kind: 'stays', reason: step > 0 ? 'no larger model configured' : 'no smaller model configured' } };
  return { value: next, mark: { kind: 'moved', direction: step > 0 ? 'up' : 'down', from: configured } };
}

function modelKeyOf(levers: MoneyLevers, model: string): string | null {
  return isTierSlot(model) ? levers.slots[model] : model;
}

/** Clause 6: a step along the levels the resulting model offers, counted from the middle where the role names none. */
function reasoningStep(role: RoleLevers, offered: readonly string[], step: -1 | 0 | 1): LeverResult<string | null> {
  const configured = role.thinking.value;
  if (isSetOrigin(role.thinking.origin)) return { value: configured, mark: step === 0 ? null : { kind: 'set', origin: role.thinking.origin } };
  if (step === 0) return { value: configured, mark: null };
  if (offered.length === 0) return { value: configured, mark: { kind: 'stays', reason: 'no levels' } };
  const own = configured !== null && !NAMES_NO_LEVEL.has(configured) ? offered.indexOf(configured) : -1;
  const from = own >= 0 ? own : Math.floor((offered.length - 1) / 2);
  const to = from + step;
  if (to < 0) return { value: offered[0]!, mark: { kind: 'stays', reason: 'lowest level' } };
  if (to >= offered.length) return { value: offered[offered.length - 1]!, mark: { kind: 'stays', reason: 'highest level' } };
  return { value: offered[to]!, mark: { kind: 'moved', direction: step > 0 ? 'up' : 'down', from: configured ?? 'default' } };
}

function limitLever(lever: Lever<number>, wanted: number | null): LeverResult<number> {
  if (wanted === null || wanted === lever.value) return { value: lever.value, mark: null };
  if (isSetOrigin(lever.origin)) return { value: lever.value, mark: { kind: 'set', origin: lever.origin } };
  return { value: wanted, mark: { kind: 'moved', direction: wanted > lever.value ? 'up' : 'down', from: String(lever.value) } };
}

export function resolveMoneyStop(levers: MoneyLevers, stop: MoneyStop, hold: MoneyIntentHold = 'unknown'): MoneyResolution {
  const ask = askOf(stop, hold);
  const strategy: LeverResult<DelegationStrategyName> = ask.strategy === null || ask.strategy === levers.strategy.value
    ? { value: levers.strategy.value, mark: null }
    : isSetOrigin(levers.strategy.origin)
      ? { value: levers.strategy.value, mark: { kind: 'set', origin: levers.strategy.origin } }
      : { value: ask.strategy, mark: { kind: 'moved', direction: 'changed', from: levers.strategy.value } };
  const roles = levers.roles.map((role): RoleResult => {
    const entry = role.role === levers.entryRole;
    const model = tierStep(levers, role, entry ? ask.entry : ask.delegated);
    const modelKey = modelKeyOf(levers, model.value);
    const offered = modelKey === null ? [] : levers.offered[modelKey] ?? [];
    const thinking = reasoningStep(role, offered, entry ? ask.entryReasoning : ask.delegatedReasoning);
    return { role: role.role, entry, model, modelKey, tier: isTierSlot(model.value) ? tierOfSlot(model.value) : null, thinking, offered };
  });
  const limits = strategy.value === 'single' ? null : {
    maxActive: limitLever(levers.maxActive, ask.limits?.maxActive ?? null),
    maxDepth: limitLever(levers.maxDepth, null),
    maxTotal: limitLever(levers.maxTotal, ask.limits?.maxTotal ?? null),
  };
  const leverOrigins: LeverOrigin[] = [levers.strategy.origin, levers.maxActive.origin, levers.maxTotal.origin, ...levers.roles.flatMap((r) => [r.model.origin, r.thinking.origin])];
  return {
    stop, hold, strategy, limits, roles,
    // Clause 8 reaches a run that resolves a cell; a `lead` run resolves none, and then nothing reads this.
    budget: ask.budget,
    rule: hold === 'unknown' ? MONEY_STOP_RULES[stop] : null,
    allSet: leverOrigins.every(isSetOrigin),
  };
}

/** The child limits as a reader sees them: `12 at once · no limit deep · 40 in all`. */
export function childLimitsLabel(limits: NonNullable<MoneyResolution['limits']>): string {
  const depth = depthLimitLabel(limits.maxDepth.value);
  return `${limits.maxActive.value} at once · ${depth === 'no limit' ? 'no depth limit' : `${depth} deep`} · ${limits.maxTotal.value} in all`;
}

/** REQ-ORCH-027 extended by clause 7: the audit payload's statement of the stop and, per lever, moved or set. */
export interface MoneyAudit {
  readonly stop: MoneyStop;
  readonly levers: Readonly<Record<string, 'moved' | 'set' | 'unchanged'>>;
}
export function moneyAuditOf(resolution: MoneyResolution): MoneyAudit {
  const word = (mark: LeverMark | null): 'moved' | 'set' | 'unchanged' => (mark?.kind === 'moved' ? 'moved' : mark?.kind === 'set' ? 'set' : 'unchanged');
  const levers: Record<string, 'moved' | 'set' | 'unchanged'> = { strategy: word(resolution.strategy.mark) };
  if (resolution.limits) {
    levers['runtime.max_active_children'] = word(resolution.limits.maxActive.mark);
    levers['runtime.max_depth'] = word(resolution.limits.maxDepth.mark);
    levers['runtime.max_children'] = word(resolution.limits.maxTotal.mark);
  }
  for (const r of resolution.roles) {
    levers[`personas.${r.role}.model`] = word(r.model.mark);
    levers[`personas.${r.role}.thinking`] = word(r.thinking.mark);
  }
  return { stop: resolution.stop, levers };
}
