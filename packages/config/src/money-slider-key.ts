import { DEFAULT_MONEY_STOP, isMoneyStop, MONEY_STOPS, type MoneyStop } from '@rotaris/contracts';
import { isPlainMap, type PlainMap } from './merge.js';

type ScopeName = 'global' | 'workspace';

/**
 * PD-ORCH-021 clause 1: `rotaris.money_slider`, the default stop, read in the global and the workspace scope as every key is
 * — the workspace's value over the global one. `rotaris:` stands outside the layered merge (REQ-CONFIG-477 ground 1), so the
 * key is read here from each scope's document as written, as `rotaris.delegation_strategy` is read from the workspace's. A
 * value outside the five stops leaves the scope below in force, with a warning, so a typo never refuses a run.
 */
export interface MoneySliderSetting {
  readonly stop: MoneyStop;
  readonly origin: 'default' | ScopeName;
  readonly warnings: readonly string[];
}

export function readMoneySlider(raw: Readonly<Record<ScopeName, { readonly agents: PlainMap | null }>>, files: Readonly<Record<ScopeName, { readonly agents: string }>>): MoneySliderSetting {
  let found: MoneySliderSetting = { stop: DEFAULT_MONEY_STOP, origin: 'default', warnings: [] };
  const warnings: string[] = [];
  for (const scope of ['global', 'workspace'] as const) {
    const section = raw[scope].agents?.['rotaris'];
    if (!isPlainMap(section) || !Object.prototype.hasOwnProperty.call(section, 'money_slider')) continue;
    const value = section['money_slider'];
    if (isMoneyStop(value)) found = { stop: value, origin: scope, warnings };
    else warnings.push(`${files[scope].agents} at rotaris.money_slider (${scope} scope): '${String(value)}' is not a money-slider stop; expected one of: ${MONEY_STOPS.join(', ')}`);
  }
  return { ...found, warnings };
}

