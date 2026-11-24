/**
 * PD-TOOLS-022: the `advisor` tool's result as text, written by the tool and read back by the transcript, so the row that
 * draws a consult (clause 7) and the agent that reads the advice hold the same words. One builder and one parser, in the
 * package both sides import, as the skill-load marker has (PD-CHAT-016).
 */
export const ADVISOR_TOOL_NAME = 'advisor';

const HEAD = /^Advisor \(([^)\n]+)\), consult (\d+) of (\d+):\n\n/;

/** What one answered consult carries: the advisor's model as the person reads it, which consult of how many, and the advice. */
export interface AdvisorConsult {
  readonly model: string;
  readonly use: number;
  readonly of: number;
  readonly advice: string;
}

/** The tool's result for an answered consult. A parenthesis or a line break in the model's label is flattened, so the head stays one line. */
export function advisorResultText(consult: AdvisorConsult): string {
  const model = consult.model.replace(/[()\s]+/g, ' ').trim();
  return `Advisor (${model}), consult ${consult.use} of ${consult.of}:\n\n${consult.advice.trim()}`;
}

/** An answered consult taken apart, or `null` for any other text (a refusal, a failure, another tool's result). */
export function parseAdvisorResult(text: string): AdvisorConsult | null {
  const m = HEAD.exec(text);
  if (m === null) return null;
  const advice = text.slice(m[0].length);
  if (advice.trim() === '') return null;
  return { model: m[1]!, use: Number(m[2]), of: Number(m[3]), advice };
}

/** The question of an `advisor` call, from its recorded arguments (a JSON object or its text); empty when it names none. */
export function advisorQuestionOf(input: unknown): string {
  let args: unknown = input;
  if (typeof input === 'string') { try { args = JSON.parse(input); } catch { return ''; } }
  if (typeof args !== 'object' || args === null) return '';
  const q = (args as Record<string, unknown>)['question'];
  return typeof q === 'string' ? q.trim() : '';
}
