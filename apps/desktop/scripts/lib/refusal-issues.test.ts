/**
 * REQ-SESSION-136 for the gate's own refusals (live-run finding a71-6): the reading the live run makes over every session
 * it keeps (since fin23; before, its `frictions` and `duress` scenarios only), pinned against the shape the duress pack of
 * 2026-10-01 recorded (session `57095770`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { refusalIssues } from './refusal-issues.mjs';

const call = (ordinal: number, callId: string | null, failureKind: string | null, status = 'failed') => ({ ordinal, tool_name: 'write_file', status, callId, failureKind });

describe('refusalIssues (REQ-SESSION-136, REQ-TOOLS-032)', () => {
  it('the duress pack of 2026-10-01: ordinals 126 and 244 were refused invalid_request and no issue named either', () => {
    const calls = [call(125, 'c125', null, 'ok'), call(126, 'chatcmpl-tool-aaee2db243cf82c8', 'invalid_request'), call(244, 'chatcmpl-tool-99a7ed2f4d42ac12', 'invalid_request')];
    // The run's own issues referenced executor-raised failures only.
    const issues = [{ kind: 'terminal_shell_failure', evidence_ref: 'tool_call_evidence#chatcmpl-tool-9c5ba4e179287733' }, { kind: 'tool_error', evidence_ref: 'tool_call_evidence#c-other' }];
    const r = refusalIssues(calls, issues);
    expect(r.refused.map((c: { ordinal: number }) => c.ordinal)).toEqual([126, 244]);
    expect(r.unfiled.map((c: { ordinal: number }) => c.ordinal)).toEqual([126, 244]);
  });

  it('a refusal referenced by a tool_error issue is filed; one referenced by another kind is not', () => {
    const calls = [call(1, 'a', 'invalid_request'), call(2, 'b', 'invalid_request')];
    const r = refusalIssues(calls, [{ kind: 'tool_error', evidence_ref: 'tool_call_evidence#a' }, { kind: 'permission_denied', evidence_ref: 'tool_call_evidence#b' }]);
    expect(r.refused).toHaveLength(2);
    expect(r.unfiled.map((c: { ordinal: number }) => c.ordinal)).toEqual([2]);
  });

  it('only failed invalid_request calls are asked: a blocked refusal, another failure kind and a call with no id read as they are', () => {
    const calls = [call(1, 'a', 'plan_gate_withheld', 'blocked'), call(2, 'b', 'execution_error'), call(3, null, 'invalid_request')];
    const r = refusalIssues(calls, []);
    expect(r.refused.map((c: { ordinal: number }) => c.ordinal)).toEqual([3]);
    expect(r.unfiled.map((c: { ordinal: number }) => c.ordinal)).toEqual([3]);
  });
});
