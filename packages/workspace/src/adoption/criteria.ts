import type { CriterionClaim } from '@rotaris/contracts';

/**
 * PD-TRACE-002 clause 7 (REQ-ADOPT-049): the agent proposes, the review confirms. A run started from the board is given the
 * requirement's acceptance criteria as what it is to meet and is asked to report on each in a fixed form at the end of
 * its final message; it ticks nothing. The review reads those claims back out of the run's summary. A claim is the
 * agent's word, not a measurement: a criterion the report does not name is `unstated`, never assumed met.
 */
export const CRITERIA_HEADING = 'Acceptance criteria';

export function criteriaPromptTail(criteria: readonly { readonly text: string; readonly checked: boolean }[]): string {
  if (criteria.length === 0) return '';
  const list = criteria.map((c, i) => `${i + 1}. ${c.text}${c.checked ? ' (already ticked in the document)' : ''}`).join('\n');
  return `\n\nAcceptance criteria — this run is done when each is met:\n${list}\n\nDo not tick or untick a criterion's check box in the requirement document, and do not change its status there: the reviewer does that when accepting. End your final message with a section headed exactly "${CRITERIA_HEADING}" that reports every criterion on its own line, by its number, as "N. met — <the evidence: the test, the file, the command and its result>" or "N. unmet — <why>".`;
}

/**
 * One report line read by a scan rather than by one regular expression: a line is the agent's output, and a pattern
 * with several optional whitespace runs around optional groups backtracks polynomially on a long run of tabs (CodeQL,
 * code-scanning 247 and 248). Each step below consumes a fixed token or one whitespace run, once.
 * Two forms: `N. met — evidence` (the word first, the number optional) and `N. criterion text — met — evidence`.
 */
const CLAIM_WORDS = ['not met', 'unmet', 'met', 'done', 'failed', 'passed', 'pass', 'fail'] as const;
const SEPARATORS = ':—–-';
const isSpace = (c: string | undefined): boolean => c === ' ' || c === '\t';
function skipSpace(line: string, at: number): number {
  let i = at;
  while (isSpace(line[i])) i += 1;
  return i;
}
function wordAt(lower: string, at: number): string | undefined {
  return CLAIM_WORDS.find((w) => lower.startsWith(w, at) && !/[a-z0-9_]/.test(lower[at + w.length] ?? ''));
}
export function readClaimLine(raw: string): { readonly n: number | undefined; readonly word: string; readonly rest: string } | null {
  let line = raw.trim();
  if (line.length > 4_000) return null;
  if ((line[0] === '-' || line[0] === '*' || line[0] === '+') && isSpace(line[1])) line = line.slice(skipSpace(line, 1));
  const lower = line.toLowerCase();
  let i = 0;
  let n: number | undefined;
  while (i < 3 && lower[i] !== undefined && lower[i]! >= '0' && lower[i]! <= '9') i += 1;
  if (i > 0 && (lower[i] === '.' || lower[i] === ')' || lower[i] === ':')) { n = Number(line.slice(0, i)); i = skipSpace(line, i + 1); } else i = 0;
  // The word first.
  let k = i;
  if (lower[k] === '[') k = skipSpace(line, k + 1);
  const first = wordAt(lower, k);
  if (first !== undefined) {
    k += first.length;
    if (lower[k] === ']') k += 1;
    k = skipSpace(line, k);
    if (SEPARATORS.includes(lower[k] ?? '\u0000') && lower[k] !== undefined) k = skipSpace(line, k + 1);
    return { n, word: first, rest: line.slice(k).trim() };
  }
  // The criterion's text, a separator, then the word: only with a number, as the prompt asks.
  if (n === undefined) return null;
  for (let at = i; at < lower.length; at += 1) {
    if (!SEPARATORS.includes(lower[at]!)) continue;
    const w = skipSpace(line, at + 1);
    const word = wordAt(lower, w);
    if (word === undefined || (word !== 'met' && word !== 'unmet' && word !== 'not met')) continue;
    let e = skipSpace(line, w + word.length);
    if (SEPARATORS.includes(lower[e] ?? '\u0000') && lower[e] !== undefined) e = skipSpace(line, e + 1);
    return { n, word, rest: `${line.slice(i, at).trim()} ${line.slice(e).trim()}`.trim() };
  }
  return null;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Read the claims out of a run's summary: by number under the heading where the report has one, by the criterion's own words otherwise. */
export function parseCriteriaClaims(summary: string | null, criteria: readonly { readonly text: string; readonly checked: boolean; readonly line: number }[]): CriterionClaim[] {
  const claims: CriterionClaim[] = criteria.map((c, index) => ({ index, text: c.text, checked: c.checked, claim: 'unstated' as const }));
  if (summary === null || criteria.length === 0) return claims;
  const lines = summary.split(/\r?\n/);
  const at = lines.findLastIndex((l) => norm(l.replace(/^#+\s*/, '')) === norm(CRITERIA_HEADING) || norm(l) === norm(`${CRITERIA_HEADING}:`));
  const body = at < 0 ? lines : lines.slice(at + 1);
  for (const raw of body) {
    const claim = readClaimLine(raw);
    if (claim === null) continue;
    const { n, word, rest } = claim;
    const met = word === 'met' || word === 'done' || word.startsWith('pass');
    let index = n !== undefined && n >= 1 && n <= criteria.length ? n - 1 : -1;
    if (index < 0) index = criteria.findIndex((c) => norm(c.text) !== '' && norm(rest).includes(norm(c.text)));
    if (index < 0) continue;
    const evidence = rest.replace(new RegExp(`^${criteria[index]!.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:—–-]?\\s*`, 'i'), '').trim();
    claims[index] = { ...claims[index]!, claim: met ? 'met' : 'unmet', ...(evidence !== '' ? { evidence: evidence.slice(0, 600) } : {}) };
  }
  return claims;
}
