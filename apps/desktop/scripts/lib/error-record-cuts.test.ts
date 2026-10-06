/**
 * REQ-SESSION-136's error-path cut under REQ-SESSION-194's marker, as the live run reads it from the tool-call record, pinned
 * against the shapes the default live run at c2a9444 recorded (finding M3: requirements ordinals 62, 66 and 70) and the
 * shapes the session writer stores since fin23 (`SessionWriter.settleToolCall`, `run/cut.ts`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { ERROR_RECORD_CAP, errorRecordCuts } from './error-record-cuts.mjs';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { runWideReadings } from './tool-frictions.mjs';

const ords = (calls: { ordinal: number }[]) => calls.map((c) => c.ordinal);
const longWrite = { path: '/tmp/rotaris-verify-req104.mjs', content: `import { add } from './list.js';\n${'const twoDone = toggle(list, 1);\n'.repeat(120)}` };
const longOutput = `${Array.from({ length: 120 }, (_, i) => `not ok ${i} - title: 'y', done: false`).join('\n')}\n`;

describe('errorRecordCuts (REQ-SESSION-136, REQ-SESSION-194)', () => {
  it('the c2a9444 pack, written before the repair: string arguments and an unmarked result are failures', () => {
    const calls = [
      { ordinal: 62, tool_name: 'write_file', isError: true, args: JSON.stringify(longWrite).slice(0, 2000), result: 'Path is outside workspace root' },
      { ordinal: 66, tool_name: 'write_file', isError: true, args: JSON.stringify({ ...longWrite, content: `${longWrite.content} id: 1, title: 'x'` }).slice(0, 2000), result: 'Path is outside workspace root' },
      { ordinal: 70, tool_name: 'terminal', isError: true, args: { command: 'node --test' }, result: longOutput.slice(0, 2000) },
    ];
    const r = errorRecordCuts(calls);
    expect(ords(r.errors)).toEqual([62, 66, 70]);
    expect(ords(r.stringArgs)).toEqual([62, 66]);
    expect(ords(r.unmarkedResults)).toEqual([70]);
    expect(ords(r.failures)).toEqual([62, 66, 70]);
    expect(r.markedResults).toEqual([]);
  });

  it('the shapes the writer stores since fin23: a marked result and object arguments with a marked value pass', () => {
    const marked = `${longOutput.slice(0, ERROR_RECORD_CAP - 3)}...`;
    const args = { path: longWrite.path, content: `${longWrite.content.slice(0, 1700)}...` };
    const calls = [
      { ordinal: 1, tool_name: 'write_file', isError: true, args, result: 'refused' },
      { ordinal: 2, tool_name: 'terminal', isError: true, args: { command: 'node --test' }, result: marked },
    ];
    const r = errorRecordCuts(calls);
    expect(r.failures).toEqual([]);
    expect(ords(r.markedArgs)).toEqual([1]);
    expect(ords(r.markedResults)).toEqual([2]);
    expect(r.overCapArgs).toEqual([]);
  });

  it('a call that succeeded is never read, however long; a result over the cap is a failure; arguments over it are counted (OQ-209)', () => {
    const longPath = `/ws/${'d/'.repeat(1100)}x.ts`;
    const calls = [
      { ordinal: 1, tool_name: 'terminal', isError: false, args: JSON.stringify(longWrite), result: longOutput },
      { ordinal: 2, tool_name: 'terminal', isError: true, args: { command: 'x' }, result: longOutput },
      { ordinal: 3, tool_name: 'write_file', isError: true, args: { path: longPath, content: '...' }, result: 'refused' },
    ];
    const r = errorRecordCuts(calls);
    expect(ords(r.errors)).toEqual([2, 3]);
    expect(ords(r.overlongResults)).toEqual([2]);
    expect(ords(r.overCapArgs)).toEqual([3]);
    expect(ords(r.failures)).toEqual([2]);
  });

  it('runWideReadings carries the reading for every session it reads, each call tagged with its scenario', () => {
    const r = runWideReadings([
      { scenario: 'requirements', issues: [], calls: [{ ordinal: 70, tool_name: 'terminal', status: 'failed', isError: true, callId: 'q70', failureKind: 'execution_error', args: { command: 'node --test' }, result: longOutput.slice(0, 2000) }] },
      { scenario: 'frictions', issues: [], calls: [{ ordinal: 4, tool_name: 'terminal', status: 'failed', isError: true, callId: 'f4', failureKind: 'execution_error', args: { command: 'node -e x' }, result: `${longOutput.slice(0, 1997)}...` }] },
    ]);
    expect(r.errorCuts.failures.map((c: { scenario: string; ordinal: number }) => [c.scenario, c.ordinal])).toEqual([['requirements', 70]]);
    expect(r.errorCuts.markedResults.map((c: { scenario: string; ordinal: number }) => [c.scenario, c.ordinal])).toEqual([['frictions', 4]]);
    expect(r.errorCuts.errors).toHaveLength(2);
  });
});
