/**
 * `artifacts-proof`'s publish launch (REQ-LIBRARY-136): the empty Library is read when the Artifacts tab has loaded,
 * not at an appointment a startup stall can push past the leave
 * (`docs/defects/fixed/artifacts-proofs-publish-launch-reads-the-empty-library-in-a-window-a-startup-stall-closes.md`).
 * The schedule is read through the capture seam's own parser, so a step written in the waiting form is seen as one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../../src/main/capture/host.js';
// @ts-expect-error — the schedule is plain ESM beside the proof that runs it.
import { ARTIFACTS_TAB, BEFORE_PUBLISH, BEFORE_PUBLISH_AT, LOADED_ARTIFACTS, PUBLISH_SCHEDULE, emptyBeforePublish } from './library-refresh.mjs';

const schedule = PUBLISH_SCHEDULE as Record<string, string>;
const views = parseSteps(schedule['ROTARIS_CAPTURE_VIEWS']);
const clicks = parseSteps(schedule['ROTARIS_CAPTURE_CLICKS']);
const reading = parseSteps(schedule['ROTARIS_CAPTURE_PROBE_AT']);
const prompt = Number(schedule['ROTARIS_CAPTURE_PROMPT_MS']);
const tab = ARTIFACTS_TAB as string;
const before = BEFORE_PUBLISH as string;

describe("artifacts-proof's publish schedule (REQ-LIBRARY-136)", () => {
  it('opens the Library, and leaves it by nothing but the prompt seam\'s own Ctrl+2 until it returns', () => {
    // The defect: a separate Ctrl+2 at 2000 ms, 400 ms after the reading, which a 1.5 s stall put ahead of it.
    expect(views.map((v) => v.selector)).toEqual(['6', '6']);
    expect(views[0]!.until).toBe(false);
    expect(views[1]!.at).toBeGreaterThan(prompt);
  });

  it('presses the Artifacts tab when it is drawn, looking from the view switch on, and gives up before the leave', () => {
    const first = clicks[0]!;
    expect(first.selector).toBe(tab);
    expect(first.until).toBe(true);
    expect(first.from).toBe(views[0]!.at);
    expect(first.at).toBeLessThan(prompt);
  });

  it('takes the empty-Library reading as ONE waited-for probe of the loaded tab, before the leave', () => {
    expect(reading).toHaveLength(1);
    const r = reading[0]!;
    expect(r.selector).toBe(before);
    expect(r.selector.startsWith(`${LOADED_ARTIFACTS as string} `)).toBe(true);
    expect(r.until).toBe(true);
    expect(r.from).toBe(views[0]!.at);
    expect(r.at).toBeLessThan(prompt);
    expect(BEFORE_PUBLISH_AT).toBe(`~${r.at}`);
  });

  it('presses the tab again on the return the same way, before the end probes', () => {
    const back = clicks[1]!;
    expect(back.selector).toBe(tab);
    expect(back.until).toBe(true);
    expect(back.from).toBe(views[1]!.at);
    expect(back.at).toBeLessThan(Number(schedule['ROTARIS_CAPTURE_AFTER_MS']));
  });

  it('is the schedule the proof\'s publish launch runs, with no appointment of its own, and the proof reads the press back', () => {
    const proof = readFileSync(new URL('../artifacts-proof.mjs', import.meta.url), 'utf8');
    const start = proof.indexOf("await launch('publish', {");
    const launch = proof.slice(start, proof.indexOf('});', start));
    expect(start).toBeGreaterThan(-1);
    expect(launch).toContain('...PUBLISH_SCHEDULE');
    expect(launch).not.toMatch(/ROTARIS_CAPTURE_(VIEWS|CLICKS|PROBE_AT|PROMPT_MS|AFTER_MS)/);
    expect(proof).toContain('unpressedClicks(r.log, [ARTIFACTS_TAB])');
    expect(proof).toContain('emptyBeforePublish(r.log)');
  });
});

describe('the empty Library read back from the log', () => {
  const line = (found: unknown) => `[main] capture: probe-at ${BEFORE_PUBLISH_AT as string} ${before} → ${JSON.stringify(found)}`;
  const empty = { text: 'No artifacts have been published in this session.', data: { 'data-ui-component': 'EmptyState', 'data-testid': 'library-artifacts-empty' } };
  const row = { text: 'The scripted plan', data: { 'data-artifact-id': 'art_ekYNQMpm', 'data-artifact-slug': 'scripted-plan' } };

  it('answers null for the loaded tab\'s empty state alone', () => {
    expect(emptyBeforePublish(line([empty]))).toBeNull();
  });

  it('names a row drawn before the run published', () => {
    expect(emptyBeforePublish(line([row]))).toBe('the Library showed 1 row(s) before the run published');
  });

  it('names a reading that found nothing, and says when the loaded tab never came within the deadline — run 1\'s red', () => {
    const at = (BEFORE_PUBLISH_AT as string).slice(1);
    expect(emptyBeforePublish(line([]))).toBe('the empty state was not shown before the run published');
    expect(emptyBeforePublish(`[main] capture: ${before} never matched within ${at} ms\n${line([])}`)).toBe(`the empty state was not shown before the run published (the loaded Artifacts tab was not drawn within ${at} ms)`);
  });

  it('names a launch that never took the reading', () => {
    expect(emptyBeforePublish('[main] capture: probe-at 1600 [data-testid="library-artifacts-empty"] → []')).toBe('the reading before the run published was never taken');
  });

  it('reads a CRLF log the same way', () => {
    expect(emptyBeforePublish(`${line([empty])}\r\n`)).toBeNull();
  });
});
