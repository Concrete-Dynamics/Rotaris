import { DISPLAY_FILE_KEYS, DISPLAY_LINE_CAP_CHOICES, displayCapFromFile } from '@rotaris/contracts';
import { FieldReader, sectionMap, type ProblemSink } from './sections/field.js';

export { DISPLAY_LINE_CAP_CHOICES };

/**
 * The `display:` section (REQ-CHAT-166; REQ-CONFIG-172/175), the reader `SECTION_KEYS` has declared since the key
 * table was written and nothing stood behind. Four workspace-configuration values, all of which affect **only what
 * is drawn** — the session record retains the full text (REQ-CHAT-046), so raising a cap or reopening the session
 * shows the rest without re-running anything.
 *
 * The line caps are `1 | 2 | 5 | 10 | 20 | 50 | unlimited`, and unlimited is spelled three ways because a file
 * written by hand and a file written by the settings surface should mean the same thing: `0` (REQ-CONFIG-172's own
 * spelling, which REQ-CONFIG-472 requires the surface to write), the word `unlimited`, or `null`. All three read
 * as `null`, which the transcript treats as no cap. A number outside the offered set is NOT rejected — the offered
 * values are what the surface offers, and REQ-CHAT-166 fixes no lower or upper bound on what a file may state;
 * anything below zero is refused because a negative cap has no meaning.
 *
 * **Part Z's spelling was wrong on both counts, and is kept here beside its replacement rather than repaired
 * quietly.** It read the keys `tool_result_lines` and `tool_input_lines`, which no requirement states, and it
 * passed `0` through as a literal cap of zero lines — so a file written exactly as REQ-CONFIG-172 words it drew
 * *nothing* where it had asked for *everything*. REQ-CONFIG-172 fixes the keys `tool_result_max_lines` and
 * `tool_input_max_lines` and states that `0` means no limit; that is what this reader now reads. The falsified
 * reason was that the view's own field names could stand in for the file's — they cannot, because only the file
 * round-trips. The resolved view keeps its field names (`tool_result_lines`), since the requirement governs the
 * key in the document and not the shape carried between our own processes.
 *
 * The **Display settings category** of REQ-CONFIG-472 — the surface that offers these four controls — is Part AG's
 * `DisplaySettings`; this file remains the read path and the cap behaviour.
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
/** REQ-CONFIG-172: what the file may state, which is what an unknown-key warning is measured against. */
export const DISPLAY_KEYS = DISPLAY_FILE_KEYS;

/** `10`, `0`, `unlimited` and `null` are all accepted; the last three mean no cap (REQ-CONFIG-172). */
function lineCap(r: FieldReader, key: string, dflt: number | null): number | null {
  if (!r.has(key)) return dflt;
  const raw = r.raw(key);
  if (raw === null) return null;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'unlimited') return null;
  return displayCapFromFile(r.int(key, dflt ?? 0, { min: 0 }));
}

export function readDisplaySection(value: unknown, sink: ProblemSink): DisplaySection {
  const r = new FieldReader(sectionMap(value, 'display', sink), 'display', sink);
  r.warnUnknown(DISPLAY_KEYS);
  const d = DISPLAY_DEFAULTS;
  return {
    show_tool_results: r.bool('show_tool_results', d.show_tool_results),
    show_tool_inputs: r.bool('show_tool_inputs', d.show_tool_inputs),
    tool_result_lines: lineCap(r, 'tool_result_max_lines', d.tool_result_lines),
    tool_input_lines: lineCap(r, 'tool_input_max_lines', d.tool_input_lines),
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
