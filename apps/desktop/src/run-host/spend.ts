import { enforcedDepth, moneyAuditOf, moneyIntentHold, resolveMoneyStop, type IntentCategory, type MoneyLevers, type MoneyResolution, type MoneyStop } from '@rotaris/contracts';
import { applyMoneyResolution, resolveAgain, type LoadedConfiguration } from '@rotaris/config';
import type { Budget, PersonaResolver, RunSpend, SpendApplied } from '@rotaris/engine';

/**
 * PD-ORCH-021 at the run-host root: what a stop yields for one run's configuration. The engine decides when each answer is
 * read (`RunSpend`); this decides what it is: the levers resolved for the stop and the intent (`resolveMoneyStop`), laid over
 * the configuration as the files would state them (`applyMoneyResolution`), and read back as the entry role, the personas and
 * the child limits. Nothing here is written to any file.
 */
export interface SpendInputs {
  /** The configuration after ADR-0037's Tier B overlay and before any stop is applied. */
  readonly cfg: LoadedConfiguration;
  readonly levers: MoneyLevers;
  readonly startStop: MoneyStop;
  /** The persona resolver a configuration yields (`personaResolverFor`). */
  readonly personasOf: (cfg: LoadedConfiguration) => PersonaResolver;
  readonly warn: (m: string) => void;
  /** The launch's own folds (the board's permissions, the confinement mode, a restored entry persona), laid over a re-resolve. */
  readonly fold: (cfg: LoadedConfiguration) => LoadedConfiguration;
}

/** A run's child limits as the engine enforces them (PD-ORCH-019 clause 4: `max_depth` 3 or more is no limit). */
export function childBudgetOf(cfg: LoadedConfiguration): Budget {
  const r = cfg.runtime;
  return { maxDepth: enforcedDepth(r.max_depth), maxTotal: r.max_children, maxActive: r.max_active_children };
}

/** The configuration a resolution yields: the original where the resolution moves nothing or fails to apply (warned). */
export function appliedConfiguration(cfg: LoadedConfiguration, resolution: MoneyResolution, warn: (m: string) => void): LoadedConfiguration {
  const applied = applyMoneyResolution(cfg, resolution, (top, strategy) => resolveAgain(cfg, top, strategy));
  if (applied.ok) return applied.value;
  warn(`money slider: the ${resolution.stop} stop could not be applied, so the run keeps its configuration (${applied.error.lines.join('; ')})`);
  return cfg;
}

/**
 * Clause 3's strategy at the run's start: the strategy decides whether the run classifies at all, so it is the one lever read
 * before the intent is known. Every other lever is left for `RunSpend.at`.
 */
export function strategyAtStart(cfg: LoadedConfiguration, levers: MoneyLevers, stop: MoneyStop, warn: (m: string) => void): LoadedConfiguration {
  const resolution = resolveMoneyStop(levers, stop, 'none');
  if (resolution.strategy.mark?.kind !== 'moved') return cfg;
  const strategyOnly: MoneyResolution = { ...resolution, limits: null, roles: [] };
  return appliedConfiguration(cfg, strategyOnly, warn);
}

export function runSpendOf(inputs: SpendInputs): RunSpend {
  const cache = new Map<string, SpendApplied>();
  const at = (stop: MoneyStop, intent: IntentCategory | null): SpendApplied => {
    const hold = moneyIntentHold(intent);
    const memo = `${stop}/${hold}`;
    const cached = cache.get(memo);
    if (cached !== undefined) return cached;
    const resolution = resolveMoneyStop(inputs.levers, stop, hold);
    const cfg = inputs.fold(appliedConfiguration(inputs.cfg, resolution, inputs.warn));
    const personas = inputs.personasOf(cfg);
    const entryRole = resolution.roles.find((r) => r.entry);
    const entryMoved = entryRole !== undefined && (entryRole.model.mark?.kind === 'moved' || entryRole.thinking.mark?.kind === 'moved');
    const entryPersona = entryMoved ? personas.resolve(cfg.defaultPersona)?.persona : undefined;
    const applied: SpendApplied = {
      entry: entryPersona?.modelRef ? { model: entryPersona.modelRef, key: entryPersona.modelKey, thinking: entryPersona.thinking ?? 'unset' } : null,
      personas,
      budget: childBudgetOf(cfg),
      widening: resolution.budget,
      audit: moneyAuditOf(resolution),
    };
    cache.set(memo, applied);
    return applied;
  };
  return { startStop: inputs.startStop, at };
}
