import { FieldReader, sectionMap, type ProblemSink } from './field.js';

/**
 * `compressor:` (REQ-CONFIG-132..134): the model (a tier alias by default, substituted like every other
 * reference), the budget figures and the threshold — accepted from a file over 1–100 while every editing
 * surface offers 50–95 (REQ-CONFIG-446). Compression itself is not built; the section loads, validates
 * and round-trips so a file authored for it is honoured when it is.
 */
export interface CompressorSection {
  readonly model: string;
  readonly timeout_seconds: number;
  readonly default_threshold: number;
  readonly threshold_percentage: number;
  readonly chars_per_token: number;
  readonly preserve_recent_turns: number;
  /** REQ-CONFIG-133: retained for compatibility, never consulted. */
  readonly auto_threshold_ratio: number;
}

export const COMPRESSOR_DEFAULTS: CompressorSection = {
  model: 'small_model', timeout_seconds: 120, default_threshold: 265_000, threshold_percentage: 60, chars_per_token: 4, preserve_recent_turns: 4, auto_threshold_ratio: 0.35,
};
export const COMPRESSOR_KEYS = Object.keys(COMPRESSOR_DEFAULTS) as readonly (keyof CompressorSection)[];

export function readCompressorSection(value: unknown, sink: ProblemSink): CompressorSection {
  const r = new FieldReader(sectionMap(value, 'compressor', sink), 'compressor', sink);
  r.warnUnknown(COMPRESSOR_KEYS);
  const d = COMPRESSOR_DEFAULTS;
  return {
    model: r.string('model', d.model),
    timeout_seconds: r.int('timeout_seconds', d.timeout_seconds, { min: 1 }),
    default_threshold: r.int('default_threshold', d.default_threshold, { min: 0 }),
    threshold_percentage: r.int('threshold_percentage', d.threshold_percentage, { min: 1, max: 100 }),
    chars_per_token: r.int('chars_per_token', d.chars_per_token, { min: 1 }),
    preserve_recent_turns: r.int('preserve_recent_turns', d.preserve_recent_turns, { min: 0 }),
    auto_threshold_ratio: r.float('auto_threshold_ratio', d.auto_threshold_ratio, { min: 0 }),
  };
}

/** REQ-CONFIG-134: the trigger with the four inputs that produced it (REQ-CONFIG-135's statement). */
export function compressionTrigger(section: CompressorSection, model: { context_compression_threshold: number | null; max_input_tokens: number | null }): { tokens: number; thresholdPercentage: number; capacity: number; advertisedInputLimit: number | null; defaultThreshold: number } {
  const fallback = section.default_threshold > 0 ? section.default_threshold : 265_000;
  const capacity = model.context_compression_threshold ?? (model.max_input_tokens !== null ? Math.min(model.max_input_tokens, fallback) : fallback);
  return { tokens: Math.floor((capacity * section.threshold_percentage) / 100), thresholdPercentage: section.threshold_percentage, capacity, advertisedInputLimit: model.max_input_tokens, defaultThreshold: section.default_threshold };
}
