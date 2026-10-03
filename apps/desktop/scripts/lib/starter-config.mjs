// @ts-check
/**
 * Whether a scope's `agents.yaml` holds the starter document of REQ-CONFIG-025 / REQ-WORKSPACE-038: a comment header,
 * `default_persona` at its shipped value, and the twelve model-slot and thinking keys the requirement names as explicit
 * nulls. A key's VALUE beyond `default_persona` is not read, since a sign-in or a slot edit may already have written one;
 * what is read is that the starter's keys are there at the top level, as the starter put them.
 *
 * `live-run`'s sign-in scenario used to check only that the file existed. Initialization now records into a missing
 * workspace file before anyone signs in, creating it with `initialization:` alone, so that check passed over a workspace
 * that never received the starter (acceptance F1 and F3, 2026-10-03;
 * `docs/defects/fixed/live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md`).
 *
 * Nothing here is product code. It runs only from the live run and its test; the test holds it to the product's own
 * `starterDocument`, so the two cannot drift apart unseen.
 */

/** The shipped `default_persona` (REQ-CONFIG-025, REQ-CONFIG-063). */
export const STARTER_PERSONA = 'orchestrator';

/**
 * The twelve keys REQ-CONFIG-025 names as explicit nulls, in its order. The product's starter also states the
 * retrospective slot and its companion (`retrospective_model`, `retrospective_model_thinking`, PD-LIBRARY-002); this
 * reader requires the twelve the requirement names and does not object to more.
 */
export const STARTER_NULL_KEYS = Object.freeze([
  'default_summary_model', 'default_summary_model_thinking',
  'large_model', 'large_model_thinking',
  'medium_model', 'medium_model_thinking',
  'small_model', 'small_model_thinking',
  'fallback_model', 'fallback_model_thinking',
  'improvement_collector_model', 'improvement_collector_model_thinking',
]);

/**
 * What of the starter document `text` lacks, in the starter's order; empty when it holds the starter.
 * @param {string} text the file's contents
 * @returns {string[]}
 */
export function starterMissing(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = lines.find((l) => l.trim() !== '');
  const missing = [];
  if (first === undefined || !first.startsWith('#')) missing.push('the comment header');
  if (!lines.some((l) => new RegExp(`^default_persona:\\s*${STARTER_PERSONA}\\s*(#.*)?$`).test(l))) missing.push(`default_persona: ${STARTER_PERSONA}`);
  for (const key of STARTER_NULL_KEYS) if (!lines.some((l) => l.startsWith(`${key}:`))) missing.push(key);
  return missing;
}
