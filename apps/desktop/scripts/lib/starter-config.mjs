// @ts-check
/**
 * Whether a scope's `agents.yaml` holds the starter document of REQ-CONFIG-025 / REQ-WORKSPACE-038: its three-line
 * comment header, `default_persona` at its shipped value, and the twelve model-slot and thinking keys the requirement
 * names as explicit nulls. A key's VALUE beyond `default_persona` is not read, since a sign-in or a slot edit may already have written one;
 * what is read is that the starter's keys are there at the top level, as the starter put them.
 *
 * `live-run`'s sign-in scenario used to check only that the file existed. Initialization recorded into a missing
 * workspace file before anyone signed in, creating it with `initialization:` alone, so that check passed over a workspace
 * that never received the starter (acceptance F1 and F3, 2026-10-03;
 * `docs/defects/fixed/live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md`).
 * Since F1's repair the workspace's open writes the starter before initialization records, and initialization's writer
 * asks for it first (REQ-WORKSPACE-040); the reader still refuses the file F1 left.
 *
 * `slice-proof`'s first-launch scenario read only the `default_persona` line; it asks this reader too (2026-10-03,
 * `docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`).
 *
 * Nothing here is product code. It runs only from the live run, the slice proof and its test; the test holds it to the
 * product's own `starterDocument`, so the two cannot drift apart unseen.
 */

/**
 * The starter's comment header, REQ-WORKSPACE-038's three lines as the product words them (`starterDocument` in
 * `packages/config/src/writers.ts`; the test holds the two equal). Read whole, since a header that merely starts with
 * `#` passed over one lacking the requirement's clauses (2026-10-03,
 * `docs/defects/fixed/the-starter-agents-yaml-header-never-says-models-are-wired-up-by-authenticating-a-provider.md`).
 */
export const STARTER_HEADER = Object.freeze([
  '# A minimal starting configuration for this scope; anything left null or absent is inherited from the layer below.',
  '# Editing it overrides the built-in personas, models and tool servers; sections merge per field, lists whole.',
  '# Real models are wired up by authenticating a provider in the Models category of Settings.',
]);

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
  const start = lines.findIndex((l) => l.trim() !== '');
  const header = start === -1 ? [] : lines.slice(start, start + STARTER_HEADER.length);
  const missing = [];
  if (header.length !== STARTER_HEADER.length || header.some((l, i) => l.trimEnd() !== STARTER_HEADER[i])) missing.push('the comment header');
  if (!lines.some((l) => new RegExp(`^default_persona:\\s*${STARTER_PERSONA}\\s*(#.*)?$`).test(l))) missing.push(`default_persona: ${STARTER_PERSONA}`);
  for (const key of STARTER_NULL_KEYS) if (!lines.some((l) => l.startsWith(`${key}:`))) missing.push(key);
  return missing;
}
