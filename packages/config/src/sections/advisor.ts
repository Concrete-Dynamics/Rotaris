import { FieldReader, sectionMap, type ProblemSink } from './field.js';

/**
 * `advisor:` (PD-TOOLS-022 clauses 6 and 8): whether agents are offered the `advisor` tool at all, and how many times one
 * agent may consult within a run. The advisor's model is no key of this section: it is the `advisor_model` slot
 * (clause 5), which resolves to the large tier when unset.
 */
export interface AdvisorSection {
  readonly enabled: boolean;
  readonly max_uses: number;
}

export const ADVISOR_DEFAULTS: AdvisorSection = { enabled: true, max_uses: 3 };
export const ADVISOR_KEYS = Object.keys(ADVISOR_DEFAULTS) as readonly (keyof AdvisorSection)[];
/** The most consults one agent may be given; the screen's clamp and the save schema's bound. */
export const ADVISOR_MAX_USES_LIMIT = 50;

export function readAdvisorSection(value: unknown, sink: ProblemSink): AdvisorSection {
  const r = new FieldReader(sectionMap(value, 'advisor', sink), 'advisor', sink);
  r.warnUnknown(ADVISOR_KEYS);
  const d = ADVISOR_DEFAULTS;
  return {
    enabled: r.bool('enabled', d.enabled),
    max_uses: r.int('max_uses', d.max_uses, { min: 0, max: ADVISOR_MAX_USES_LIMIT }),
  };
}
