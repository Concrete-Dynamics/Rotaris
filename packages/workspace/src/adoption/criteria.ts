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

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Read the claims out of a run's summary: by number under the heading where the report has one, by the criterion's own words otherwise. */
export function parseCriteriaClaims(summary: string | null, criteria: readonly { readonly text: string; readonly checked: boolean; readonly line: number }[]): CriterionClaim[] {
  const claims: CriterionClaim[] = criteria.map((c, index) => ({ index, text: c.text, checked: c.checked, claim: 'unstated' as const }));
  if (summary === null || criteria.length === 0) return claims;
  const lines = summary.split(/\r?\n/);
  const at = lines.findLastIndex((l) => norm(l.replace(/^#+\s*/, '')) === norm(CRITERIA_HEADING) || norm(l) === norm(`${CRITERIA_HEADING}:`));
  const body = at < 0 ? lines : lines.slice(at + 1);
  for (const raw of body) {
    const line = raw.replace(/^\s*[-*+]\s+/, '').trim();
    const m = /^(?:(\d{1,3})[.):]\s*)?(?:\[?\s*)?(met|unmet|not met|done|failed|pass(?:ed)?|fail)\b\s*\]?\s*[:—–-]?\s*(.*)$/i.exec(line) ?? /^(\d{1,3})[.):]\s*(.*?)\s*[:—–-]\s*(met|unmet|not met)\b\s*[:—–-]?\s*(.*)$/i.exec(line);
    if (m === null) continue;
    const numberFirst = m.length === 4;
    const n = m[1] === undefined ? undefined : Number(m[1]);
    const word = (numberFirst ? m[2]! : m[3]!).toLowerCase();
    const rest = (numberFirst ? m[3]! : `${m[2]!} ${m[4]!}`).trim();
    const met = word === 'met' || word === 'done' || word.startsWith('pass');
    let index = n !== undefined && n >= 1 && n <= criteria.length ? n - 1 : -1;
    if (index < 0) index = criteria.findIndex((c) => norm(c.text) !== '' && norm(rest).includes(norm(c.text)));
    if (index < 0) continue;
    const evidence = rest.replace(new RegExp(`^${criteria[index]!.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:—–-]?\\s*`, 'i'), '').trim();
    claims[index] = { ...claims[index]!, claim: met ? 'met' : 'unmet', ...(evidence !== '' ? { evidence: evidence.slice(0, 600) } : {}) };
  }
  return claims;
}
