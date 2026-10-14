/**
 * The live run's `cut` scenario readings (fin42, N51): when the harness quits, and what it reads from the cut call. The
 * record shapes are the ones `driver-proof`'s launch 13d reads from the built app (PD-TOOLS-013), and the ones a broken
 * cancel would leave (the hard-timeout reading of live-run P2 at a68f121).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { CUT_COMMAND, CUT_PROMPT, OPEN_WITHOUT_MARKER_MS, cutVerdicts, isCutCommand, openCutCall } from './cut-scenario.mjs';

type Verdict = { verdict: 'check' | 'note'; passed?: boolean; what: string; detail?: string };
const running = (ordinal: number, command: string, tool = 'terminal') => ({ ordinal, tool_name: tool, status: 'running', entry: { args: { command, timeout: 90 } } });
const diagnostic = (fields: string) => `[terminal_diagnostic] {"detail":"…",${fields}}`;
const interruptedResult = `Terminal execution was cancelled by the run before the command completed; the session was reset and shell state was lost.\n${diagnostic('"kill_status":"session_reset","outcome_severity":"warning","timeout":false')}`;
const cutCall = (over: Record<string, unknown> = {}) => ({ ordinal: 3, tool_name: 'terminal', status: 'failed', args: { command: CUT_COMMAND, timeout: 90 }, result: interruptedResult, callId: 'c-3', failureKind: 'interrupted', outcomeKind: 'interrupted', exitCode: null, elapsedMs: 2400, ...over });
const summary = (outcomes: string, timeouts: number) => `# Session s\n\n## Metrics\n\n- Tool outcomes: ${outcomes}\n\n## Warnings\n\n- Timeouts: ${timeouts} (tool calls that timed out, a terminal's among them)\n`;
const failed = (vs: Verdict[]) => vs.filter((v) => v.verdict === 'check' && !v.passed).map((v) => v.what);

describe('the cut scenario (PD-TOOLS-013 live)', () => {
  it('asks for the sleep with an explicit timeout, which a soft-paused call would not carry', () => {
    expect(isCutCommand(CUT_COMMAND)).toBe(true);
    expect(CUT_PROMPT).toContain(CUT_COMMAND);
    expect(CUT_PROMPT).toMatch(/timeout of 90 seconds/);
    expect(isCutCommand('sleep 600')).toBe(false);
  });

  it('quits once the sleep is open and its marker written, never on another open call', () => {
    const firstSeen = new Map();
    expect(openCutCall([running(1, 'ls'), running(2, 'sleep 60', 'fetch')], { markerExists: true, now: 0, firstSeen })).toBeNull();
    expect(openCutCall([running(3, CUT_COMMAND)], { markerExists: false, now: 1_000, firstSeen })).toBeNull();
    expect(openCutCall([running(3, CUT_COMMAND)], { markerExists: true, now: 1_500, firstSeen })).toEqual({ ordinal: 3, command: CUT_COMMAND });
  });

  it('never quits on a running sleep of a session created before the launch began', () => {
    const firstSeen = new Map();
    const stale = { ...running(5, CUT_COMMAND), session_id: 'old', session_created_at: '2026-10-13T09:00:00.000Z' };
    const mine = { ...running(2, CUT_COMMAND), session_id: 'new', session_created_at: '2026-10-14T10:00:01.000Z' };
    const since = '2026-10-14T10:00:00.000Z';
    expect(openCutCall([stale], { markerExists: false, now: 10_000 + OPEN_WITHOUT_MARKER_MS, firstSeen, since })).toBeNull();
    expect(openCutCall([stale, mine], { markerExists: true, now: 20_000, firstSeen, since })).toEqual({ ordinal: 2, command: CUT_COMMAND });
  });

  it('quits a sleep the model ran without the marker once its record has stood open long enough', () => {
    const firstSeen = new Map();
    expect(openCutCall([running(4, 'sleep 60')], { markerExists: false, now: 10_000, firstSeen })).toBeNull();
    expect(openCutCall([running(4, 'sleep 60')], { markerExists: false, now: 10_000 + OPEN_WITHOUT_MARKER_MS, firstSeen })).toEqual({ ordinal: 4, command: 'sleep 60' });
  });

  it('fails a cut call whose diagnostic does not read outcome_severity warning (PD-TOOLS-013 revision 1, as driver-proof 13d reads it)', () => {
    const errorSeverity = cutCall({ result: interruptedResult.replace('"outcome_severity":"warning"', '"outcome_severity":"error"') });
    const vs: Verdict[] = cutVerdicts({ quitSent: true, calls: [errorSeverity], issues: [], summary: summary('interrupted 1', 0) });
    expect(failed(vs)).toEqual(['cut: it carries no exit code, timeout false, a session reset, and outcome_severity warning (PD-TOOLS-013 revision 1)']);
  });

  it('passes the record revision 1 leaves: interrupted, no exit code, no issue, the interrupted bucket', () => {
    const vs: Verdict[] = cutVerdicts({ quitSent: true, calls: [cutCall()], issues: [], summary: summary('success 0, tool_error 0, rejected 0, unknown 0, interrupted 1', 0) });
    expect(failed(vs)).toEqual([]);
    expect(vs.filter((v) => v.verdict === 'check')).toHaveLength(5);
  });

  it('fails the hard-timeout reading a broken cancel leaves (live-run P2 at a68f121)', () => {
    const timedOut = cutCall({ failureKind: 'timeout', outcomeKind: 'timeout', exitCode: 124, result: `The command exceeded its timeout of 90 seconds\n${diagnostic('"kill_status":"session_reset","outcome_severity":"error","timeout":true')}` });
    const vs: Verdict[] = cutVerdicts({ quitSent: true, calls: [timedOut], issues: [{ kind: 'terminal_timeout', evidence_ref: 'tool_call_evidence#c-3' }], summary: summary('timeout 1', 1) });
    expect(failed(vs)).toHaveLength(5);
  });

  it('fails a call counted as a tool error, and a session with no summary.md', () => {
    const vs: Verdict[] = cutVerdicts({ quitSent: true, calls: [cutCall()], issues: [{ kind: 'tool_error', evidence_ref: 'tool_call_evidence#c-3' }], summary: null });
    expect(failed(vs)).toEqual(['cut: the cut call files no terminal_timeout and no tool_error issue (REQ-SESSION-136)', "cut: the session's summary.md counts the call under interrupted"]);
  });

  it('is a NOTE, not a pass, when nothing was cut', () => {
    const none: Verdict[] = cutVerdicts({ quitSent: false, calls: [], issues: [], summary: null });
    expect(none).toEqual([expect.objectContaining({ verdict: 'note', detail: 'the model ran no `sleep 60` in the terminal' })]);
    const soft: Verdict[] = cutVerdicts({ quitSent: false, calls: [cutCall({ status: 'ok', args: { command: 'sleep 60' } })], issues: [], summary: null });
    expect(soft[0]).toMatchObject({ verdict: 'note' });
    expect(soft[0]?.detail).toMatch(/no timeout supplied, so soft-paused/);
  });
});
