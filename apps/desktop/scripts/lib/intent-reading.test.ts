/**
 * The live run's per-launch intent-classifier NOTE (item N67; OQ-258, PD-ORCH-011 revision 2). The audit rows and log lines
 * below are the shapes the default pack at `0bc3eee` (pack `2026-10-13T12-18-40-282Z`) recorded: the edit launch classified on
 * the strict rung, the requirements launch cut at the 12 s bound after the endpoint had streamed into it.
 */
import { describe, expect, it } from 'vitest';
import { IntentResultSchema } from '@rotaris/contracts';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { auditIntent, classificationTiming, classifierNote, classifierReading, cutTraffic } from './intent-reading.mjs';

const EDIT = 'c691fa97-0318-4eca-8636-82b578d7ce17';
const REQS = '691a07e9-e2c3-429f-9265-2878865e9494';
const audit = (runIntent: Record<string, unknown>) => JSON.stringify({ config_snapshot: {}, run_intent: runIntent, intent_grant: 'none' });
const editAudit = audit({ category: 'small_feature', confidence: 0.92, reason: 'a small feature', fallback: false, carried_over: false, rung: 'json_schema' });
const reqsAudit = audit({ category: 'moderate_feature', confidence: null, reason: 'the classification call timed out after 12 s', fallback: true, carried_over: false });
const editLog = [
  '[main 2026-10-13T12:19:13.127Z] info    capture: the prompt was submitted 2526 ms after the wait was installed',
  `[main 2026-10-13T12:19:13.182Z] info    run host: session ${EDIT} started; row 0 recorded; the run is executing`,
  '[main 2026-10-13T12:19:13.192Z] info    run host: model request POST http://127.0.0.1:39029/chat/completions',
  '[main 2026-10-13T12:19:16.593Z] info    run host: intent: small_feature (0.92) via json_schema',
].join('\n');
const reqsLog = [
  `[main 2026-10-13T12:23:04.370Z] info    run host: session ${REQS} started; row 0 recorded; the run is executing`,
  '[main 2026-10-13T12:23:16.374Z] info    run host: intent: moderate_feature (fallback: the classification call timed out after 12 s)',
].join('\n');
const reqsTraffic = [
  { at: '2026-10-13T12:23:04.390Z', ms: 11973, outcome: 'aborted', responseBody: 'data: {"choices":[]}\n'.repeat(10) },
  { at: '2026-10-13T12:23:16.476Z', ms: 2021, outcome: 'complete', responseBody: 'data: {}' },
];

describe('the intent-classifier reading per launch (N67, OQ-258)', () => {
  it('reads every field the launch audit\'s run_intent carries, and the audits the product writes parse', () => {
    expect(IntentResultSchema.safeParse(JSON.parse(editAudit).run_intent).success).toBe(true);
    expect(IntentResultSchema.safeParse(JSON.parse(reqsAudit).run_intent).success).toBe(true);
    expect(auditIntent(editAudit)).toEqual({ category: 'small_feature', confidence: 0.92, reason: 'a small feature', fallback: false, carriedOver: false, rung: 'json_schema' });
    expect(auditIntent(reqsAudit)).toMatchObject({ category: 'moderate_feature', confidence: null, fallback: true, rung: null });
    expect(auditIntent(null)).toBeNull();
    expect(auditIntent('{"run_intent":null}')).toBeNull();
    expect(auditIntent('not json')).toBeNull();
  });

  it('times the classification from the session\'s start to its intent line, since run_intent has no elapsed field', () => {
    expect(classificationTiming(editLog, EDIT)?.elapsedMs).toBe(3411);
    expect(classificationTiming(reqsLog, REQS)?.elapsedMs).toBe(12004);
    // Another session's start is not this one's; a log with no intent line after the start reads nothing.
    expect(classificationTiming(editLog, REQS)).toBeNull();
    expect(classificationTiming(editLog.split('\n').slice(0, 3).join('\n'), EDIT)).toBeNull();
  });

  it('finds the cut request in the traffic and how much the endpoint had sent into it (0 is a queueing endpoint)', () => {
    const timing = classificationTiming(reqsLog, REQS);
    expect(cutTraffic(reqsTraffic, timing)).toEqual({ bytes: reqsTraffic[0]!.responseBody.length, ms: 11973 });
    expect(cutTraffic([{ ...reqsTraffic[0], responseBody: '' }], timing)?.bytes).toBe(0);
    expect(cutTraffic([reqsTraffic[1]], timing)).toBeNull();
    expect(cutTraffic(null, timing)).toBeNull();
  });

  it('counts the launches, the fallbacks and the cuts, and names each launch in the NOTE', () => {
    const reading = classifierReading([
      { scenario: 'edit', sessionId: EDIT, payload: editAudit, log: editLog, traffic: null },
      { scenario: 'requirements', sessionId: REQS, payload: reqsAudit, log: reqsLog, traffic: reqsTraffic },
      { scenario: 'shell', sessionId: 'none', payload: null, log: '', traffic: null },
    ]);
    expect(reading).toMatchObject({ classified: 2, fallbacks: 1, cuts: 1, cutsWithBytes: 1, carried: 0 });
    const note = classifierNote(reading);
    expect(note.title).toBe('intent classification over 2 launch(es): 1 fell back (1 cut at REQ-ORCH-008\'s bound, 1 after the endpoint had sent bytes) (OQ-258, PD-ORCH-011 revision 2) — OQ-258\'s reopening limb: 3 or more cuts in 10 launches with bytes received');
    expect(note.detail).toBe(`edit small_feature 0.92 via json_schema, 3.4 s; requirements moderate_feature FALLBACK (the classification call timed out after 12 s), ${reqsTraffic[0]!.responseBody.length} byte(s) received before the cut, 12.0 s`);
  });

  it('names OQ-258\'s reopening limb only at 3 cuts with bytes in 10 launches, and a carried-over intent as unclassified', () => {
    const launch = (i: number, cut: boolean) => ({
      scenario: `s${i}`, sessionId: `id-${i}`,
      payload: cut ? reqsAudit : editAudit,
      log: `[main 2026-10-13T12:00:00.000Z] info    run host: session id-${i} started\n[main 2026-10-13T12:00:12.000Z] info    run host: intent: x`,
      traffic: cut ? [{ at: '2026-10-13T12:00:00.010Z', ms: 11990, outcome: 'aborted', responseBody: 'data: x' }] : null,
    });
    const two = classifierReading(Array.from({ length: 10 }, (_, i) => launch(i, i < 2)));
    expect(two.cuts).toBe(2);
    expect(classifierNote(two).title).not.toContain('reopening limb');
    const three = classifierReading(Array.from({ length: 10 }, (_, i) => launch(i, i < 3)));
    expect(classifierNote(three).title).toContain('reopening limb');
    // Three cuts that received nothing are a queueing endpoint's, which the limb excludes.
    const queued = classifierReading(Array.from({ length: 10 }, (_, i) => ({ ...launch(i, i < 3), traffic: i < 3 ? [{ at: '2026-10-13T12:00:00.010Z', ms: 11990, outcome: 'aborted', responseBody: '' }] : null })));
    expect(queued).toMatchObject({ cuts: 3, cutsWithBytes: 0 });
    expect(classifierNote(queued).title).not.toContain('reopening limb');
    const carried = classifierReading([{ scenario: 'resume', sessionId: 'r', payload: audit({ category: 'small_feature', confidence: null, reason: 'carried', fallback: false, carried_over: true }), log: '', traffic: null }]);
    expect(carried.carried).toBe(1);
    expect(classifierNote(carried).detail).toBe('resume small_feature carried over, unclassified, time unread');
    expect(classifierNote(classifierReading([])).detail).toBe('no launch audit carried an intent');
  });
});
