/**
 * The live run's reading of the improvement passes it lets finish (fin42, N58): the capture's wait, each pass's outcome
 * against the notice it owes, and the retrospective's instruction-file line.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { INDICATOR, passOutcome, postRunVerdict, refusalWait, retrospectiveArtifactVerdict, retrospectiveInstructionFiles, retrospectiveRefusalVerdict, runsStarted, settledAfterMs, settledWait, unauthorizedRequests } from './analysis-reading.mjs';

describe('analysis reading (live-run `ask`, REQ-LIBRARY-123..127, PD-LIBRARY-002)', () => {
  it('the wait holds only once the named pass was seen and no indicator stands', () => {
    const wait = settledWait('post_run');
    expect(wait.startsWith('js:')).toBe(true);
    // The expression evaluated the way the capture does, over a stand-in document and window.
    let shown: { pass: string } | null = null;
    const win: Record<string, unknown> = {};
    const document = { querySelector: (s: string) => (s === INDICATOR && shown !== null ? { getAttribute: () => shown!.pass } : null) };
    const run = () => Boolean(new Function('document', 'window', `return ${wait.slice(3)};`)(document, win));
    expect(run()).toBe(false); // nothing seen yet
    shown = { pass: 'retrospective' };
    expect(run()).toBe(false); // another pass is not this one
    shown = null;
    expect(run()).toBe(false);
    shown = { pass: 'post_run' };
    expect(run()).toBe(false); // seen, still running
    shown = null;
    expect(run()).toBe(true);
    expect(() => settledWait('other')).toThrow();
  });

  it('reads how long the wait took, and null when it ran out', () => {
    expect(settledAfterMs(`[main] info    capture: wait for js:(() => { … })() satisfied after 81234 ms`)).toBe(81234);
    expect(settledAfterMs(`[main] info    capture: wait for js:(() => { … })() timed out after 780000 ms`)).toBeNull();
  });

  it('an outcome is matched to the notice it owes: proposals, a timeout with its limit, an empty pass, none', () => {
    expect(passOutcome({ proposals: [{}, {}], notes: null }, [{ text: 'iSuccess2 improvement proposals readyDetailsCollected in impart_x.' }])).toMatchObject({ outcome: 'proposals', proposals: 2, noticeMatches: true });
    expect(passOutcome({ proposals: [{}], notes: null }, [{ text: '1 retrospective proposal ready' }], { retrospective: true })).toMatchObject({ outcome: 'proposals', noticeMatches: true });
    const timedOut = passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, [{ text: 'Improvement analysis complete — no proposalsDetailsThe review of this run reached its 300-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.' }]);
    expect(timedOut).toMatchObject({ outcome: 'timed-out', limitS: 300, noticeMatches: true });
    expect(passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }])).toMatchObject({ outcome: 'timed-out', noticeMatches: false });
    expect(passOutcome({ proposals: [], notes: 'Suppressed duplicate proposals already covered by: impart_a.' }, [{ text: 'The retrospective found nothing to proposeDetailsNothing was proposed in impart_b.' }], { retrospective: true })).toMatchObject({ outcome: 'empty', noticeMatches: true });
    expect(passOutcome(null, [])).toEqual({ outcome: 'none', proposals: 0, notes: null, noticeMatches: null });
  });

  it('the live `ask` verdict: proposals or a timeout pass, an analyst that proposed nothing is a NOTE, no artifact or two fail', () => {
    const notice = [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }];
    expect(postRunVerdict(1, passOutcome({ proposals: [{}], notes: null }, []))).toBe('pass');
    expect(postRunVerdict(1, passOutcome({ proposals: [], notes: 'collector timed out after 300 seconds' }, []))).toBe('pass');
    // REQ-LIBRARY-124's no-proposals outcome, notes null: the model found nothing over a one-file run, not a product failure.
    const empty = passOutcome({ proposals: [], notes: null }, notice);
    expect(empty).toMatchObject({ outcome: 'empty', noticeMatches: true });
    expect(postRunVerdict(1, empty)).toBe('note');
    expect(postRunVerdict(0, passOutcome(null, []))).toBe('fail');
    expect(postRunVerdict(2, passOutcome({ proposals: [{}], notes: null }, []))).toBe('fail');
  });

  it('the retrospective\'s instruction files: the root\'s alone, a file from another base, and none at all', () => {
    expect(retrospectiveInstructionFiles('run host: retrospective: 1 of 3 enabled instruction file(s) at the workspace root (workspace:AGENTS.md) for /w')).toEqual({ handed: 1, enabled: 3, ids: ['workspace:AGENTS.md'], rootOnly: true });
    expect(retrospectiveInstructionFiles('run host: retrospective: 2 of 2 enabled instruction file(s) at the workspace root (workspace:AGENTS.md, user-agents:AGENTS.md) for /w')?.rootOnly).toBe(false);
    expect(retrospectiveInstructionFiles('run host: retrospective: 0 of 1 enabled instruction file(s) at the workspace root for /w')).toEqual({ handed: 0, enabled: 1, ids: [], rootOnly: true });
    expect(retrospectiveInstructionFiles('no such line')).toBeNull();
  });

  /*
   * The live run at ce5f952 (F4): ask-retrospective PASSed "one retrospective artifact …" and "the notice on screen is the one the
   * retrospective's outcome owes" over an artifact whose notes read "collector crashed: Unauthorized" and the notice "The
   * retrospective found nothing to propose". A crashed collector is no outcome a pass owes: it never reached the model.
   */
  it('a crashed collector is its own outcome: the zero-proposal notice no longer matches it, and the post-run verdict fails on it', () => {
    const crashed = passOutcome({ artifact_id: 'impart_dL3YK5Xd', proposals: [], notes: 'collector crashed: Unauthorized' }, [{ text: 'iThe retrospective found nothing to proposeDetailsNothing was proposed in impart_dL3YK5Xd.CopyDismiss' }], { retrospective: true });
    expect(crashed).toMatchObject({ outcome: 'crashed', crashed: true, noticeMatches: false });
    expect(postRunVerdict(1, passOutcome({ artifact_id: 'impart_x', proposals: [], notes: 'collector crashed: Unauthorized' }, [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }]))).toBe('fail');
    // Not a crash: the timed-out, the suppressed-duplicates and the null notes keep their outcomes.
    expect(passOutcome({ proposals: [], notes: 'Suppressed duplicate proposals already covered by: impart_a.' }, [], { retrospective: true }).outcome).toBe('empty');
  });

  /*
   * PD-LIBRARY-005 (OQ-285): a crashed or unparseable collector owes its pass's failure warning — the title, and the artifact's
   * id in the detail saying it holds no proposals — and a timed-out retrospective's info notice states its limit.
   */
  it('a failed collector matches only its pass\'s failure warning naming the artifact (PD-LIBRARY-005)', () => {
    const retroWarning = [{ text: "wThe retrospective could not be completedDetailsThis workspace's own history was not reviewed: the analysis call failed (Unauthorized). impart_dL3YK5Xd holds no proposals.CopyDismiss" }];
    expect(passOutcome({ artifact_id: 'impart_dL3YK5Xd', proposals: [], notes: 'collector crashed: Unauthorized' }, retroWarning, { retrospective: true })).toMatchObject({ outcome: 'crashed', crashed: true, noticeMatches: true });
    // Another artifact's id, or the post-run pass's title, is not this warning.
    expect(passOutcome({ artifact_id: 'impart_00000000', proposals: [], notes: 'collector crashed: Unauthorized' }, retroWarning, { retrospective: true }).noticeMatches).toBe(false);
    expect(passOutcome({ artifact_id: 'impart_dL3YK5Xd', proposals: [], notes: 'collector crashed: Unauthorized' }, retroWarning).noticeMatches).toBe(false);

    const postWarning = [{ text: "wThe completed run could not be reviewed for improvementsDetailsSession s-1 was not reviewed for improvements: the model's answer could not be read (collector output is invalid JSON). impart_x holds no proposals." }];
    const unreadable = passOutcome({ artifact_id: 'impart_x', proposals: [], notes: 'collector parse failed: collector output is invalid JSON' }, postWarning);
    expect(unreadable).toMatchObject({ outcome: 'parse-failed', noticeMatches: true });
    expect(unreadable).not.toHaveProperty('crashed');
    // The model's answer, not the product's failure: a NOTE, as a pass that proposed nothing is; a crash stays a FAIL.
    expect(postRunVerdict(1, unreadable)).toBe('note');
    expect(postRunVerdict(1, passOutcome({ artifact_id: 'impart_x', proposals: [], notes: 'collector crashed: Unauthorized' }, postWarning))).toBe('fail');
    expect(passOutcome({ artifact_id: 'impart_x', proposals: [], notes: 'collector parse failed: x' }, [{ text: 'Improvement analysis complete — no proposalsDetailsNothing was proposed in impart_x.' }]).noticeMatches).toBe(false);
  });

  it('a parse failure\'s long detail is read from the probe\'s head and tail, as the probe keeps it (PD-LIBRARY-005, finding L5)', () => {
    // The default live run at b9e3005: the validator's issues quoted as JSON pushed the artifact id past the probe's old
    // 400-character cut. What the probe logged then names no artifact; what it keeps since (`PROBE_TEXT` in
    // `src/main/capture/probe.ts`: the whole text to 2,000 characters, past that its first 1,600 and last 400) does.
    const artifact = { artifact_id: 'impart_47kGY2xb', proposals: [], notes: 'collector parse failed: [ unrecognized_keys … ]' };
    const issues = JSON.stringify([{ code: 'unrecognized_keys', keys: ['when', 'check'], path: ['proposals', 0, 'proposed_verifier_section'], message: 'Unrecognized keys: "when", "check"' }], null, 2);
    const warning = `!The retrospective could not be completedDetailsThis workspace's own history was not reviewed: the model's answer could not be read (${issues}). impart_47kGY2xb holds no proposals.`;
    expect(passOutcome(artifact, [{ text: warning.slice(0, 400) }], { retrospective: true })).toMatchObject({ outcome: 'parse-failed', noticeMatches: false });
    expect(passOutcome(artifact, [{ text: warning }], { retrospective: true })).toMatchObject({ outcome: 'parse-failed', noticeMatches: true });
    const many = `!The retrospective could not be completedDetailsThis workspace's own history was not reviewed: the model's answer could not be read (${issues.repeat(12)}). impart_47kGY2xb holds no proposals.`;
    expect(many.length).toBeGreaterThan(2_000);
    expect(passOutcome(artifact, [{ text: `${many.slice(0, 1_600)} … ${many.slice(-400)}` }], { retrospective: true }).noticeMatches).toBe(true);
  });

  it('a timed-out retrospective matches only the info notice stating its limit (PD-LIBRARY-005)', () => {
    const artifact = { artifact_id: 'impart_r', proposals: [], notes: 'collector timed out after 120 seconds' };
    expect(passOutcome(artifact, [{ text: 'iThe retrospective found nothing to proposeDetailsThe retrospective reached its 120-second limit before it proposed anything.' }], { retrospective: true }))
      .toMatchObject({ outcome: 'timed-out', limitS: 120, noticeMatches: true });
    expect(passOutcome(artifact, [{ text: 'iThe retrospective found nothing to proposeDetailsNothing was proposed in impart_r.' }], { retrospective: true }).noticeMatches).toBe(false);
  });

  /*
   * The ask-retrospective scenario as fin43 (F4) left it, held under OQ-285's wording: a crashed collector fails the artifact check
   * whatever notice it posted, and its notice check passes only on PD-LIBRARY-005's warning; a sound pass passes both.
   */
  it('ask-retrospective: a crashed collector fails the artifact check and owes the ruled warning; a sound pass passes both', () => {
    const ask = 'ask-session-1';
    const row = (artifact: Record<string, unknown>) => ({ artifact_id: artifact['artifact_id'], source_session_id: null, artifact });
    const crashedArtifact = { artifact_id: 'impart_dL3YK5Xd', proposals: [], considered_session_ids: [ask], notes: 'collector crashed: Unauthorized' };
    const warning = [{ text: "!The retrospective could not be completedDetailsThis workspace's own history was not reviewed: the analysis call failed (Unauthorized). impart_dL3YK5Xd holds no proposals.CopyDismiss" }];
    const crashed = passOutcome(crashedArtifact, warning, { retrospective: true });
    expect(retrospectiveArtifactVerdict([row(crashedArtifact)], ask, crashed)).toMatchObject({ passed: false });
    expect(crashed.noticeMatches).toBe(true);
    // At ce5f952 the crashed collector showed the zero-proposal notice: under the ruling that notice is wrong for it.
    expect(passOutcome(crashedArtifact, [{ text: 'iThe retrospective found nothing to proposeDetailsNothing was proposed in impart_dL3YK5Xd.' }], { retrospective: true }).noticeMatches).toBe(false);

    const sound = { artifact_id: 'impart_s0und000', proposals: [{}], considered_session_ids: [ask], notes: null };
    const proposed = passOutcome(sound, [{ text: 'sSuccess1 retrospective proposal readyDetailsCollected in impart_s0und000 from this workspace\'s own history.' }], { retrospective: true });
    expect(retrospectiveArtifactVerdict([row(sound)], ask, proposed)).toMatchObject({ passed: true });
    expect(proposed.noticeMatches).toBe(true);
    const suppressed = { artifact_id: 'impart_empty000', proposals: [], considered_session_ids: [ask], notes: 'Suppressed duplicate proposals already covered by: impart_a.' };
    const nothing = passOutcome(suppressed, [{ text: 'iThe retrospective found nothing to proposeDetailsNothing was proposed in impart_empty000.' }], { retrospective: true });
    expect(retrospectiveArtifactVerdict([row(suppressed)], ask, nothing)).toMatchObject({ passed: true });
    expect(nothing.noticeMatches).toBe(true);

    // The rest of the check: one artifact, belonging to no session, having read the ask session.
    expect(retrospectiveArtifactVerdict([], ask, passOutcome(null, [])).passed).toBe(false);
    expect(retrospectiveArtifactVerdict([], ask, passOutcome(null, [])).detail).toBe('none stored');
    expect(retrospectiveArtifactVerdict([row(sound), row(suppressed)], ask, proposed).passed).toBe(false);
    expect(retrospectiveArtifactVerdict([{ ...row(sound), source_session_id: ask }], ask, proposed).passed).toBe(false);
    expect(retrospectiveArtifactVerdict([row({ ...sound, considered_session_ids: ['another'] })], ask, proposed).passed).toBe(false);
    expect(retrospectiveArtifactVerdict([row(crashedArtifact)], ask, crashed).detail).toContain('impart_dL3YK5Xd: crashed, 0 proposal(s)');
  });

  it('reads the run host\'s unauthenticated model requests and the runs a launch started (F2\'s shape: no run before the retrospective)', () => {
    const log = [
      '[main 2026-10-13T23:10:22.440Z] info    run host: credentials: leased for openai-compatible--katalyst (workspace /w)',
      '[main 2026-10-13T23:10:22.488Z] info    run host: model request POST http://127.0.0.1:36079/chat/completions (no authorization header)',
    ].join('\n');
    expect(unauthorizedRequests(log)).toBe(1);
    expect(unauthorizedRequests('run host: model request POST http://127.0.0.1:1/chat/completions')).toBe(0);
    expect(runsStarted(log)).toBe(0);
    expect(runsStarted('[main] info    run host: session 0791fa1e-70df-4a20-95c4-906ceb8aa71b started; row 0 recorded; the run is executing')).toBe(1);
  });
});

describe('live-run\'s ask scenario puts the analyst timeout back whatever happens', () => {
  it('restores the workspace file in a finally, as cutoff restores its limit', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const ask = text.slice(text.indexOf("if (wanted.includes('ask')) {"), text.indexOf('// ── 3. One real run'));
    expect(ask).toMatch(/const agentsBeforeAsk = readFileSync\(agentsFile, 'utf8'\);[\s\S]*?\n  try \{\n/);
    expect(ask).toMatch(/\n  \} finally \{\n    writeFileSync\(agentsFile, agentsBeforeAsk\);\n  \}\n/);
  });
});

/**
 * PD-LIBRARY-002 revision 5 (OQ-300): the live run's `ask-retrospective-unauth` reads one refusal notice — REQ-WORKSPACE-137's
 * headline, the retrospective's sentence, the "Open Models settings" action — and no artifact stored by the press.
 */
describe('the retrospective\'s authentication refusal (live-run `ask-retrospective-unauth`, PD-LIBRARY-002 revision 5)', () => {
  const refusal = { text: '!Provider authentication requiredDetailsAuthenticate at least one configured provider before running a retrospective.Open Models settingsCopyDismiss' };
  it('passes on the one notice the ruling owes, with nothing stored', () => {
    expect(retrospectiveRefusalVerdict([refusal], 1, 1)).toMatchObject({ passed: true, refusals: 1, worded: true, actioned: true, queued: 0 });
  });
  it('fails the as-built notice, a continuation\'s sentence, a missing action, a doubled notice and a stored artifact', () => {
    const asBuilt = { text: '!The retrospective could not be startedDetailsProvider authentication required: Authenticate at least one configured provider before continuing this run.CopyDismiss' };
    expect(retrospectiveRefusalVerdict([asBuilt], 0, 0).passed).toBe(false);
    expect(retrospectiveRefusalVerdict([{ text: refusal.text.replace('running a retrospective', 'continuing this run') }], 0, 0).passed).toBe(false);
    expect(retrospectiveRefusalVerdict([{ text: refusal.text.replace('Open Models settings', '') }], 0, 0).passed).toBe(false);
    expect(retrospectiveRefusalVerdict([refusal, refusal], 0, 0).passed).toBe(false);
    expect(retrospectiveRefusalVerdict([refusal], 0, 1).passed).toBe(false);
    expect(retrospectiveRefusalVerdict([], 0, 0)).toMatchObject({ passed: false, refusals: 0 });
  });
  it('the wait holds once a notice names the headline', () => {
    const wait = refusalWait();
    expect(wait.startsWith('js:')).toBe(true);
    const run = (texts: string[]) => Boolean(new Function('document', `return ${wait.slice(3)};`)({ querySelectorAll: () => texts.map((textContent) => ({ textContent })) }));
    expect(run([])).toBe(false);
    expect(run(['Something else'])).toBe(false);
    expect(run([refusal.text])).toBe(true);
  });
});
