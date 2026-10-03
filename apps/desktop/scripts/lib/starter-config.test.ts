/**
 * `live-run`'s sign-in check reads the starter document (REQ-CONFIG-025, REQ-WORKSPACE-038) rather than the file's
 * existence, which a file holding only the initialization record satisfied
 * (`docs/defects/fixed/live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md`),
 * and `slice-proof`'s first-launch scenario reads it rather than the persona line alone
 * (`docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`).
 * The reader is held to the product's own `starterDocument`, so the two cannot drift apart unseen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starterDocument } from '@rotaris/config';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { STARTER_NULL_KEYS, STARTER_PERSONA, starterMissing } from './starter-config.mjs';

const keys = STARTER_NULL_KEYS as readonly string[];
/**
 * F1's observed file, byte for byte as acceptance round 1's slice-proof left it (2026-10-03, 137 bytes): initialization's
 * record alone, created by the per-field writer before the sign-in.
 */
const INITIALIZATION_ONLY = ['initialization:', '  completed:', '    - code-intelligence-setup', '  skipped: []', '  last_run: 2026-10-03T05:12:42.233Z', '  classification: non-code', ''].join('\n');

describe('the starter agents.yaml read by its content (REQ-CONFIG-025, REQ-WORKSPACE-038)', () => {
  it('finds nothing missing in the starter the product writes', () => {
    expect(starterMissing(starterDocument())).toEqual([]);
  });

  it('names REQ-CONFIG-025\'s twelve null keys, in its order, and the shipped persona', () => {
    expect(keys).toEqual(['default_summary_model', 'default_summary_model_thinking', 'large_model', 'large_model_thinking', 'medium_model', 'medium_model_thinking', 'small_model', 'small_model_thinking', 'fallback_model', 'fallback_model_thinking', 'improvement_collector_model', 'improvement_collector_model_thinking']);
    expect(STARTER_PERSONA).toBe('orchestrator');
  });

  it('names everything the starter states for a file holding only the initialization record — F1\'s file, which existsSync passed', () => {
    expect(starterMissing(INITIALIZATION_ONLY)).toEqual(['the comment header', 'default_persona: orchestrator', ...keys]);
  });

  it('accepts the starter after initialization recorded into it and a sign-in pinned a slot', () => {
    const later = `${starterDocument().replace(/^large_model: null$/m, 'large_model: katalyst/model')}${INITIALIZATION_ONLY}`;
    expect(starterMissing(later)).toEqual([]);
  });

  it('names a key the starter states that the file lacks, and a persona that is not the shipped one', () => {
    const text = starterDocument().replace(/^fallback_model_thinking: null\n/m, '').replace('default_persona: orchestrator', 'default_persona: coder');
    expect(starterMissing(text)).toEqual(['default_persona: orchestrator', 'fallback_model_thinking']);
  });

  it('does not take an indented key, a nested mapping\'s, for the starter\'s top-level one', () => {
    const text = starterDocument().replace(/^small_model: null$/m, 'models:\n  small_model: null');
    expect(starterMissing(text)).toEqual(['small_model']);
  });

  it('reads a CRLF file the same way', () => {
    expect(starterMissing(starterDocument().replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it('is what live-run\'s sign-in scenario checks, rather than the file\'s existence alone', () => {
    const run = readFileSync(new URL('../live-run.mjs', import.meta.url), 'utf8');
    const at = run.indexOf("'the starter agents.yaml was bootstrapped'");
    const line = run.slice(run.lastIndexOf('\n', at) + 1, run.indexOf('\n', at));
    expect(line).toContain('starterLacks.length === 0');
    expect(line).not.toContain('existsSync(agentsFile)');
    expect(run).toContain("starterMissing(readFileSync(agentsFile, 'utf8'))");
  });

  it('names what a file with the persona line alone lacks, which slice-proof\'s old persona-only check passed', () => {
    expect(starterMissing(`default_persona: orchestrator\n${INITIALIZATION_ONLY}`)).toEqual(['the comment header', ...keys]);
  });

  it('is what slice-proof\'s first-launch scenario checks, rather than the persona line alone', () => {
    const proof = readFileSync(new URL('../slice-proof.mjs', import.meta.url), 'utf8');
    const at = proof.indexOf('the starter agents.yaml was not bootstrapped');
    expect(at).toBeGreaterThan(-1);
    const line = proof.slice(proof.lastIndexOf('\n', at) + 1, proof.indexOf('\n', at));
    expect(line).toContain('starterLacks.length > 0');
    expect(proof).toContain("starterMissing(readFileSync(agentsFile, 'utf8'))");
    expect(proof).not.toContain(".includes('default_persona: orchestrator')");
  });
});
