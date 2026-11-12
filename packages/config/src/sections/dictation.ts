import { DICTATION_BACKEND_NAMES, DICTATION_CONFIG_DEFAULT, dictationFieldProblem, type DictationConfigView } from '@rotaris/contracts';
import { FieldReader, sectionMap, type ProblemSink } from './field.js';

/**
 * OQ-457, PD-CONFIG-010 — the `dictation:` section: which model turns the composer's microphone into text, and how to reach it.
 *
 * A workspace's `agents.yaml` comes with the repository, so this section holds no program, no path and no credential: `local_model`
 * is a bare name main resolves under the Whisper cache, and a name that is not one is a schema error rather than a value passed
 * along. Main reads the section at each press; the run host reads none of it (OQ-458: the endpoint's bearer is a stored credential
 * of its own, read in main).
 */
export const DICTATION_KEYS = ['backend', 'local_model', 'base_url', 'model', 'language'] as const;

export function readDictationSection(value: unknown, sink: ProblemSink): DictationConfigView {
  const r = new FieldReader(sectionMap(value, 'dictation', sink), 'dictation', sink);
  r.warnUnknown(DICTATION_KEYS);
  const backend = r.string('backend', DICTATION_CONFIG_DEFAULT.backend);
  if (!(DICTATION_BACKEND_NAMES as readonly string[]).includes(backend)) r.error('backend', `'${backend}' is not an accepted value; expected one of: ${DICTATION_BACKEND_NAMES.join(', ')}`);
  const out: DictationConfigView = {
    backend: (DICTATION_BACKEND_NAMES as readonly string[]).includes(backend) ? backend as DictationConfigView['backend'] : DICTATION_CONFIG_DEFAULT.backend,
    local_model: r.string('local_model', DICTATION_CONFIG_DEFAULT.local_model),
    base_url: r.stringOrNull('base_url'),
    model: r.stringOrNull('model'),
    language: r.stringOrNull('language'),
  };
  for (const key of ['local_model', 'base_url', 'language'] as const) {
    const problem = dictationFieldProblem(key, out[key]);
    if (problem !== null) r.error(key, problem);
  }
  return dictationFieldProblem('local_model', out.local_model) === null ? out : { ...out, local_model: DICTATION_CONFIG_DEFAULT.local_model };
}
