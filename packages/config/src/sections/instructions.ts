import { FieldReader, sectionMap, typeName, type ProblemSink } from './field.js';
import { isPlainMap } from '../merge.js';

/**
 * PD-WORKSPACE-002 — the `instructions:` section: the per-file on/off policy over the instruction
 * files the discovery names.
 *
 * One key and nothing else:
 *
 * - `overrides` — stable file identity → `on | off` (absent means `on`, the baseline that is never
 *   persisted except where a lower layer states a policy for that file, REQ-CONFIG-258's sparse terms).
 *
 * The map overlays **per file identity** rather than wholesale, which the section-class merge already
 * does recursively (REQ-CONFIG-042/048, extended by the directive): a workspace file naming one file
 * leaves every other file's global policy standing.
 *
 * A value outside the vocabulary is a **schema error** (fatal, REQ-CONFIG-229) naming the file, because
 * a mistyped state would otherwise silently take the default and put a file in front of a model that
 * the user had switched off — or hide one they had asked for. The same argument REQ-CONFIG-167/168's
 * reader makes for skills.
 */
export const INSTRUCTION_STATE_VALUES = ['on', 'off'] as const;
export type InstructionState = (typeof INSTRUCTION_STATE_VALUES)[number];

export interface InstructionsSection {
  readonly overrides: Readonly<Record<string, InstructionState>>;
}

export const INSTRUCTIONS_DEFAULTS: InstructionsSection = { overrides: {} };
export const INSTRUCTIONS_KEYS = ['overrides'] as const;

export function readInstructionsSection(value: unknown, sink: ProblemSink): InstructionsSection {
  const r = new FieldReader(sectionMap(value, 'instructions', sink), 'instructions', sink);
  r.warnUnknown(INSTRUCTIONS_KEYS);
  const raw = r.raw('overrides');
  if (raw === undefined || raw === null) return { overrides: {} };
  if (!isPlainMap(raw)) {
    r.error('overrides', `must be a mapping of file identity to state, got ${typeName(raw)}`);
    return { overrides: {} };
  }
  const out: Record<string, InstructionState> = {};
  for (const [id, state] of Object.entries(raw)) {
    if (typeof state === 'string' && (INSTRUCTION_STATE_VALUES as readonly string[]).includes(state)) {
      out[id] = state as InstructionState;
      continue;
    }
    r.error(`overrides.${id}`, `'${typeof state === 'string' ? state : typeName(state)}' is not an accepted value; expected one of: ${INSTRUCTION_STATE_VALUES.join(', ')}`);
  }
  return { overrides: out };
}

/** PD-WORKSPACE-002: the setter's own rejection message, which the settings surface quotes verbatim. */
export const UNSUPPORTED_INSTRUCTION_STATE = 'Unsupported instruction state: ';

export function isInstructionState(value: string): value is InstructionState {
  return (INSTRUCTION_STATE_VALUES as readonly string[]).includes(value);
}
