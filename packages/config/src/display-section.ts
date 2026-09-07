import { FieldReader, sectionMap, type ProblemSink } from './sections/field.js';

/**
 * The `display:` section (REQ-CHAT-166; REQ-CONFIG-172/175), the reader `SECTION_KEYS` has declared since the key
 * table was written and nothing stood behind. Four workspace-configuration values, all of which affect **only what
 * is drawn** — the session record retains the full text (REQ-CHAT-046), so raising a cap or reopening the session
 * shows the rest without re-running anything.
 *
 * The line caps are `1 | 2 | 5 | 10 | 20 | 50 | unlimited`, and `unlimited` is spelled two ways because a file
 * written by hand and a file written by the settings surface should mean the same thing: the word `unlimited`, or
 * `null`. Both read as `null`, which the transcript treats as no cap. A number outside the offered set is NOT
 * rejected — the offered values are what the surface offers, and REQ-CHAT-166 fixes no lower or upper bound on
 * what a file may state; anything below zero is refused because a negative cap has no meaning.
 *
 * The **Display settings category** of REQ-CONFIG-472 — the surface that offers these four controls, and the write
 * path behind it — is NOT built here and is owed to the configuration part that already owes the five categories.
 * This file is the read path and nothing else.
 */
export interface DisplaySection {
  readonly show_tool_results: boolean;
  readonly show_tool_inputs: boolean;
  /** null = unlimited. */
  readonly tool_result_lines: number | null;
  readonly tool_input_lines: number | null;
}

export const DISPLAY_DEFAULTS: DisplaySection = {
  show_tool_results: true,
  show_tool_inputs: true,
  tool_result_lines: 10,
  tool_input_lines: 2,
};
export const DISPLAY_KEYS = Object.keys(DISPLAY_DEFAULTS) as readonly (keyof DisplaySection)[];
/** REQ-CHAT-166: the values the settings surface offers, in the order it offers them. `null` is "unlimited". */
export const DISPLAY_LINE_CAP_CHOICES: readonly (number | null)[] = [1, 2, 5, 10, 20, 50, null];

/** `10`, `unlimited` and `null` are all accepted; `unlimited` and `null` mean no cap. */
function lineCap(r: FieldReader, key: keyof DisplaySection, dflt: number | null): number | null {
  if (!r.has(key)) return dflt;
  const raw = r.raw(key);
  if (raw === null) return null;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'unlimited') return null;
  const n = r.int(key, dflt ?? 0, { min: 0 });
  return n;
}

export function readDisplaySection(value: unknown, sink: ProblemSink): DisplaySection {
  const r = new FieldReader(sectionMap(value, 'display', sink), 'display', sink);
  r.warnUnknown(DISPLAY_KEYS);
  const d = DISPLAY_DEFAULTS;
  return {
    show_tool_results: r.bool('show_tool_results', d.show_tool_results),
    show_tool_inputs: r.bool('show_tool_inputs', d.show_tool_inputs),
    tool_result_lines: lineCap(r, 'tool_result_lines', d.tool_result_lines),
    tool_input_lines: lineCap(r, 'tool_input_lines', d.tool_input_lines),
  };
}

/**
 * REQ-CHAT-166's drawn form of one capped value: at most `cap` lines, and when it was cut short, a final line
 * stating that and **how many further lines exist**. REQ-CHAT-168 binds the wording — the count is written for
 * the count it carries, so one further line reads "1 more line" and never "1 more line(s)".
 */
export function capLines(text: string, cap: number | null): string {
  if (cap === null || text === '') return text;
  const lines = text.split('\n');
  if (lines.length <= cap) return text;
  const hidden = lines.length - cap;
  return [...lines.slice(0, cap), `… cut short — ${hidden} more ${hidden === 1 ? 'line' : 'lines'}`].join('\n');
}
