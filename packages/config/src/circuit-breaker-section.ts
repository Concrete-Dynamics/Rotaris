import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@rotaris/kernel';
import { asMap, parseConfig, plainOf, triOf, typeNameOf, vocabularyText, type ParsedConfig, type Tri } from './document.js';

export type CircuitBreakerActivationMode = 'independent' | 'weighted';

export interface CircuitBreakerLayer {
  readonly enabled: Tri<boolean>;
  readonly model: Tri<string>;
  readonly activationMode: Tri<CircuitBreakerActivationMode>;
  readonly loopClassificationTimeout: Tri<number>;
}

export interface CircuitBreakerResolved {
  readonly enabled: boolean;
  readonly model: string;
  readonly activationMode: CircuitBreakerActivationMode;
  readonly loopClassificationTimeout: number;
}

export interface CircuitBreakerConfigError {
  readonly path: string;
  readonly message: string;
  readonly file?: string;
}

export const CIRCUIT_BREAKER_DEFAULTS: CircuitBreakerResolved = {
  enabled: true,
  model: 'small_model',
  activationMode: 'independent',
  loopClassificationTimeout: 2,
};

export const EMPTY_CIRCUIT_BREAKER_LAYER: CircuitBreakerLayer = {
  enabled: { kind: 'absent' },
  model: { kind: 'absent' },
  activationMode: { kind: 'absent' },
  loopClassificationTimeout: { kind: 'absent' },
};

const value = <T>(tri: Tri<unknown>, parse: (raw: unknown) => T | null): Tri<T> => {
  if (tri.kind !== 'value') return { kind: tri.kind };
  const parsed = parse(plainOf(tri.value as never));
  return parsed === null ? { kind: 'null' } : { kind: 'value', value: parsed };
};

/** REQ-CONFIG-136/467: read the two registered sections from one agents.yaml layer. */
export function readCircuitBreakerSections(parsed: ParsedConfig): Result<CircuitBreakerLayer, CircuitBreakerConfigError[]> {
  const errors: CircuitBreakerConfigError[] = [];
  const breaker = triOf(parsed.root, 'circuit_breaker');
  const runtime = triOf(parsed.root, 'runtime');
  const breakerMap = breaker.kind === 'value' ? asMap(breaker.value) : null;
  const runtimeMap = runtime.kind === 'value' ? asMap(runtime.value) : null;
  if (breaker.kind === 'value' && !breakerMap) errors.push({ path: 'circuit_breaker', message: `circuit_breaker must be a mapping, got ${typeNameOf(breaker.value)}` });
  if (runtime.kind === 'value' && !runtimeMap) errors.push({ path: 'runtime', message: `runtime must be a mapping, got ${typeNameOf(runtime.value)}` });

  const known = new Set(['enabled', 'model', 'activation_mode']);
  if (breakerMap) {
    for (const pair of breakerMap.items) {
      const key = String(plainOf(pair.key as never));
      if (!known.has(key)) errors.push({ path: `circuit_breaker.${key}`, message: `unknown circuit_breaker key '${key}'` });
    }
  }

  let enabled: Tri<boolean> = { kind: 'absent' };
  let model: Tri<string> = { kind: 'absent' };
  let activationMode: Tri<CircuitBreakerActivationMode> = { kind: 'absent' };
  let loopClassificationTimeout: Tri<number> = { kind: 'absent' };

  if (breakerMap) {
    const enabledRaw = triOf(breakerMap, 'enabled');
    if (enabledRaw.kind === 'value' && typeof plainOf(enabledRaw.value) !== 'boolean') errors.push({ path: 'circuit_breaker.enabled', message: `circuit_breaker.enabled must be a boolean, got ${typeNameOf(enabledRaw.value)}` });
    else enabled = value(enabledRaw, (raw) => typeof raw === 'boolean' ? raw : null);

    const modelRaw = triOf(breakerMap, 'model');
    if (modelRaw.kind === 'value' && (typeof plainOf(modelRaw.value) !== 'string' || String(plainOf(modelRaw.value)).trim() === '')) errors.push({ path: 'circuit_breaker.model', message: 'circuit_breaker.model must be a non-blank string' });
    else model = value(modelRaw, (raw) => typeof raw === 'string' && raw.trim() ? raw : null);

    const modeRaw = triOf(breakerMap, 'activation_mode');
    if (modeRaw.kind === 'value') {
      const text = vocabularyText(modeRaw.value);
      if (text !== 'independent' && text !== 'weighted') errors.push({ path: 'circuit_breaker.activation_mode', message: `circuit_breaker.activation_mode must be independent or weighted, got '${String(text)}'` });
      else activationMode = { kind: 'value', value: text };
    } else activationMode = { kind: modeRaw.kind };
  }

  if (runtimeMap) {
    const timeoutRaw = triOf(runtimeMap, 'loop_classification_timeout');
    if (timeoutRaw.kind === 'value') {
      const raw = plainOf(timeoutRaw.value);
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) errors.push({ path: 'runtime.loop_classification_timeout', message: 'runtime.loop_classification_timeout must be a number greater than zero' });
      else loopClassificationTimeout = { kind: 'value', value: raw };
    } else loopClassificationTimeout = { kind: timeoutRaw.kind };
  }

  return errors.length > 0 ? err(errors) : ok({ enabled, model, activationMode, loopClassificationTimeout });
}

export function mergeCircuitBreaker(layers: readonly CircuitBreakerLayer[]): CircuitBreakerResolved {
  let resolved = { ...CIRCUIT_BREAKER_DEFAULTS };
  for (const layer of layers) {
    if (layer.enabled.kind === 'value') resolved = { ...resolved, enabled: layer.enabled.value };
    if (layer.model.kind === 'value') resolved = { ...resolved, model: layer.model.value };
    if (layer.activationMode.kind === 'value') resolved = { ...resolved, activationMode: layer.activationMode.value };
    if (layer.loopClassificationTimeout.kind === 'value') resolved = { ...resolved, loopClassificationTimeout: layer.loopClassificationTimeout.value };
  }
  return resolved;
}

function readLayer(file: string): Result<CircuitBreakerLayer, CircuitBreakerConfigError[]> {
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? ok(EMPTY_CIRCUIT_BREAKER_LAYER) : err([{ path: '', file, message: `could not read configuration: ${String(cause)}` }]);
  }
  const parsed = parseConfig(text);
  if (!parsed.ok) return err([{ path: '', file, message: parsed.error.reason }]);
  if (parsed.value.root === null && parsed.value.topLevelType !== 'null') return err([{ path: '', file, message: `agents.yaml must be a mapping, got ${parsed.value.topLevelType}` }]);
  const layer = readCircuitBreakerSections(parsed.value);
  return layer.ok ? layer : err(layer.error.map((e) => ({ ...e, file })));
}

/** Real two-file round trip: defaults → global → workspace. */
export function loadCircuitBreakerConfig(globalDir: string, workspaceRoot: string): Result<CircuitBreakerResolved, CircuitBreakerConfigError[]> {
  const global = readLayer(join(globalDir, 'agents.yaml'));
  const workspace = readLayer(join(workspaceRoot, '.rotaris', 'agents.yaml'));
  if (!global.ok && !workspace.ok) return err([...global.error, ...workspace.error]);
  if (!global.ok) return err(global.error);
  if (!workspace.ok) return err(workspace.error);
  return ok(mergeCircuitBreaker([global.value, workspace.value]));
}
