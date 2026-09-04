import { FieldReader, sectionMap, type ProblemSink } from './sections/field.js';

/**
 * `circuit_breaker:` (REQ-CONFIG-136..138): the enabled flag, the classifier model (a tier alias by
 * default), the activation mode and the nine thresholds. The section carries NO timeout key: the bound is
 * `runtime.loop_classification_timeout` (REQ-CONFIG-467), and a `timeout_seconds` here is an unknown key —
 * reported like any other unknown key in a merged section, which REQ-CONFIG-233 makes a warning, not a
 * failure (the first slice of this reader made it an error; corrected against the severity taxonomy).
 */
export type CircuitBreakerActivationMode = 'independent' | 'weighted';

export interface CircuitBreakerSection {
  readonly enabled: boolean;
  readonly model: string;
  readonly activation_mode: CircuitBreakerActivationMode;
  readonly tool_call_threshold: number;
  readonly message_count_threshold: number;
  readonly tool_weight: number;
  readonly message_weight: number;
  readonly target_score: number;
  readonly max_recent_events: number;
  readonly max_transcript_chars: number;
  readonly repetition_threshold: number;
  readonly cycle_threshold: number;
}

export const CIRCUIT_BREAKER_DEFAULTS: CircuitBreakerSection = {
  enabled: true, model: 'small_model', activation_mode: 'independent',
  tool_call_threshold: 60, message_count_threshold: 60, tool_weight: 0.6, message_weight: 0.4, target_score: 1,
  max_recent_events: 24, max_transcript_chars: 8000, repetition_threshold: 4, cycle_threshold: 3,
};
export const CIRCUIT_BREAKER_KEYS = Object.keys(CIRCUIT_BREAKER_DEFAULTS) as readonly (keyof CircuitBreakerSection)[];

export function readCircuitBreakerSection(value: unknown, sink: ProblemSink): CircuitBreakerSection {
  const r = new FieldReader(sectionMap(value, 'circuit_breaker', sink), 'circuit_breaker', sink);
  r.warnUnknown(CIRCUIT_BREAKER_KEYS);
  const d = CIRCUIT_BREAKER_DEFAULTS;
  return {
    enabled: r.bool('enabled', d.enabled),
    model: r.string('model', d.model),
    activation_mode: r.vocabulary('activation_mode', d.activation_mode, ['independent', 'weighted'] as const),
    tool_call_threshold: r.int('tool_call_threshold', d.tool_call_threshold, { min: 1 }),
    message_count_threshold: r.int('message_count_threshold', d.message_count_threshold, { min: 1 }),
    tool_weight: r.float('tool_weight', d.tool_weight, { min: 0, max: 1 }),
    message_weight: r.float('message_weight', d.message_weight, { min: 0, max: 1 }),
    target_score: r.float('target_score', d.target_score, { exclusiveMin: 0 }),
    max_recent_events: r.int('max_recent_events', d.max_recent_events, { min: 4 }),
    max_transcript_chars: r.int('max_transcript_chars', d.max_transcript_chars, { min: 500 }),
    repetition_threshold: r.int('repetition_threshold', d.repetition_threshold, { min: 2 }),
    cycle_threshold: r.int('cycle_threshold', d.cycle_threshold, { min: 2 }),
  };
}
