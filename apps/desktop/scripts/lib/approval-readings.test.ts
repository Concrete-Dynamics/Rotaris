/**
 * The approval readings `approvals-proof` and the live run's `away` scenario share, pinned against the shape the first
 * built-app away stretch left (fin42, 2026-10-13: `approvals-proof`'s `away` launch, timeout 12 s) and against the shapes a
 * broken gate would leave.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { approvalRequests, approvalsLiveVerdicts, awayLiveVerdicts, awayReason, awayStretch, presentedDialogs, sessionScopedWrites, timeoutReason } from './approval-readings.mjs';

const T0 = Date.parse('2026-10-13T18:19:00.000Z');
const at = (ms: number) => T0 + ms;
const line = (ms: number, text: string) => `[main ${new Date(at(ms)).toISOString()}] info    ${text}`;
const request = (ordinal: number, ms: number, id: string, tool: string, agent: string, resolver: 'brokered' | 'headless') => ({
  ordinal, kind: 'approval.requested', at: at(ms),
  payload: { event: 'approval.requested', request_id: id, tool_name: tool, agent_name: agent, resolver, timeout_seconds: resolver === 'brokered' ? 12 : null, unattended_reason: resolver === 'brokered' ? '' : 'headless-policy' },
});
const decision = (ms: number, id: string, tool: string, source: string, reason: string) => ({ at: at(ms), request_id: id, tool_name: tool, source, decision: source.startsWith('user-o') ? 'allow' : 'deny', reason });
const ASK = "No rule matched; permission mode 'ask' defaults to ask.";

/** The stretch the first built-app run recorded, reduced to what the reader reads. */
function recorded() {
  const events = [
    request(43, 0, 'A', 'write_file', 'one', 'brokered'),
    request(49, 1_000, 'B', 'write_file', 'two', 'brokered'),
    request(55, 7_800, 'Q', 'ask_questions', 'orchestrator', 'brokered'),
    request(68, 12_020, 'C', 'write_file', 'one', 'headless'),
    request(75, 12_025, 'D', 'write_file', 'two', 'headless'),
    request(102, 39_000, 'T', 'todo', 'orchestrator', 'brokered'),
  ];
  const audit = [
    decision(12_000, 'A', 'write_file', 'timeout', `${ASK} ${timeoutReason(12)}`),
    decision(12_006, 'B', 'write_file', 'headless-policy', `${ASK} ${awayReason(12)}, so the request was denied.`),
    decision(12_022, 'C', 'write_file', 'headless-policy', `${ASK} ${awayReason(12)}, so the request was denied.`),
    decision(12_027, 'D', 'write_file', 'headless-policy', `${ASK} ${awayReason(12)}, so the request was denied.`),
    decision(15_360, 'Q', 'ask_questions', 'user-once', "The user approved 'ask_questions' once (rule 'preset:ask' asked)."),
    decision(40_000, 'T', 'todo', 'user-once', "The user approved 'todo' once (rule 'preset:ask' asked)."),
  ];
  const timeline = [
    { name: 'user_away', actor: 'rotaris', at: at(12_000), metadata: { after_seconds: 12 } },
    { name: 'user_returned', actor: 'user', at: at(15_358), metadata: { after_seconds: 12 } },
  ];
  const log = [
    line(300, 'approval A presented (write_file, rule preset:ask); 0 waiting'),
    line(300, 'capture: approval dialog (write_file) left unanswered'),
    line(12_350, 'approval Q presented (ask_questions, rule preset:ask); 0 waiting'),
    line(39_300, 'approval T presented (todo, rule preset:ask); 0 waiting'),
  ].join('\n');
  return { events, audit, timeline, log };
}

describe('presentedDialogs and approvalRequests', () => {
  it('read main\'s presentation lines with their instant, and the request events\' fields', () => {
    const { log, events } = recorded();
    expect(presentedDialogs(log).map((p: { requestId: string; tool: string; at: number }) => [p.requestId, p.tool, p.at - T0])).toEqual([['A', 'write_file', 300], ['Q', 'ask_questions', 12_350], ['T', 'todo', 39_300]]);
    expect(approvalRequests(events).map((r: { request_id: string; resolver: string }) => `${r.request_id}:${r.resolver}`)).toEqual(['A:brokered', 'B:brokered', 'Q:brokered', 'C:headless', 'D:headless', 'T:brokered']);
  });
  it('read an envelope that nests its fields under data', () => {
    expect(approvalRequests([{ ordinal: 1, kind: 'approval.requested', at: 5, payload: { data: { request_id: 'X', resolver: 'brokered' } } }])[0]).toMatchObject({ request_id: 'X', resolver: 'brokered', at: 5 });
  });
});

describe('awayStretch (PD-TOOLS-005 revisions 1 and 2, PD-TOOLS-011)', () => {
  it('reads the recorded stretch: the timeout, the mark, the queued wait ended, the asks denied at once, the exemption, the return', () => {
    const r = awayStretch(recorded());
    expect(r.first.request.request_id).toBe('A');
    expect(r.first.waitedMs).toBe(12_000);
    expect(r.away.metadata.after_seconds).toBe(12);
    expect(r.seconds).toBe(12);
    expect(r.ended.map((e: { request: { request_id: string }; lagMs: number; shown: unknown }) => [e.request.request_id, e.lagMs, e.shown])).toEqual([['B', 6, null]]);
    expect(r.askedWhileAway.map((w: { request: { request_id: string }; decidedMs: number; awayReason: boolean; shown: unknown }) => [w.request.request_id, w.decidedMs, w.awayReason, w.shown])).toEqual([['C', 2, true, null], ['D', 2, true, null]]);
    expect(r.exempt).toHaveLength(1);
    expect(r.exempt[0].shown.requestId).toBe('Q');
    expect(r.exempt[0].decision.source).toBe('user-once');
    expect(r.returned.actor).toBe('user');
    expect(r.askedAfterReturn.map((a: { request: { request_id: string } }) => a.request.request_id)).toEqual(['T']);
    expect(r.claimsNoUi).toEqual([]);
  });

  it('revision 1\'s shape: a queued wait that ran its own full timeout is not read as ended by the mark', () => {
    const s = recorded();
    s.audit[1] = decision(13_000, 'B', 'write_file', 'timeout', `${ASK} ${timeoutReason(12)}`);
    expect(awayStretch(s).ended).toEqual([]);
  });

  it('an ask while away that reached a dialog, or claims no approval UI, is read as such', () => {
    const s = recorded();
    s.log += `\n${line(12_030, 'approval C presented (write_file, rule preset:ask); 0 waiting')}`;
    s.audit[2] = decision(12_022, 'C', 'write_file', 'headless-policy', `${ASK} No approval UI is available in this host, so the request was denied.`);
    const r = awayStretch(s);
    expect(r.askedWhileAway[0].shown).not.toBeNull();
    expect(r.askedWhileAway[0].awayReason).toBe(false);
    expect(r.claimsNoUi).toHaveLength(1);
  });

  it('a session no approval timed out in reads as unreached, never invented', () => {
    const r = awayStretch({ audit: [], events: [], timeline: [], log: '' });
    expect(r.first).toBeNull();
    expect(r.away).toBeNull();
    expect(r.ended).toEqual([]);
    expect(r.askedWhileAway).toEqual([]);
    expect(r.returned).toBeNull();
  });
});

describe('awayLiveVerdicts (the live run\'s away scenario)', () => {
  const away = 'user away: an approval in this run went unanswered for 12 seconds; until …';
  const sessionLog = `2026-10-13T18:19:12.000Z WARNING ${away}`;
  it('the recorded stretch, read live: every check passes, the answer is noted', () => {
    const verdicts = awayLiveVerdicts;
    const s = recorded();
    // Live, every dialog is left: only the first is shown.
    s.log = s.log.split('\n').filter((l) => /approval A presented/.test(l)).join('\n');
    const r = awayStretch(s);
    const out = verdicts(r, { seconds: 12, sessionLog, answer: 'Both writes were refused because the approval went unanswered.' });
    expect(out.filter((v: { verdict: string; passed: boolean }) => v.verdict === 'check' && !v.passed)).toEqual([]);
    expect(out.at(-1)).toMatchObject({ verdict: 'note', detail: expect.stringMatching(/^names the refusal/) });
  });
  it('a dialog shown while away, or no away mark, fails', () => {
    const verdicts = awayLiveVerdicts;
    const s = recorded();
    const failed = verdicts(awayStretch(s), { seconds: 12, sessionLog }).filter((v: { verdict: string; passed: boolean }) => v.verdict === 'check' && !v.passed).map((v: { what: string }) => v.what);
    expect(failed).toEqual(['away: no dialog was shown after the first went unanswered']);
    const unmarked = { ...s, timeline: [] };
    expect(verdicts(awayStretch(unmarked), { seconds: 12, sessionLog: '' }).some((v: { what: string; passed: boolean }) => /marked its user away/.test(v.what) && !v.passed)).toBe(true);
  });
  it('a model that asked for nothing is a NOTE, not a pass or a failure', () => {
    const verdicts = awayLiveVerdicts;
    expect(verdicts(awayStretch({ audit: [], events: [], timeline: [], log: '' }), { seconds: 12 })).toEqual([{ verdict: 'note', passed: true, what: expect.stringMatching(/asked for nothing/), detail: expect.any(String) }]);
  });
});

describe('sessionScopedWrites and approvalsLiveVerdicts (PD-TOOLS-004)', () => {
  const grant = { tool_name: 'write_file', source: 'user-session', decision: 'allow', reason: "The user approved 'write_file' for this session (rule 'preset:ask' asked); session rule 'session:allow:1' added." };
  const rule = { tool_name: 'write_file', source: 'session-rule', decision: 'allow', rule_id: 'session:allow:1', reason: "Rule 'session:allow:1' (Approved for this session: …) resolved 'write_file' to allow." };
  const calls = [
    { ordinal: 1, tool_name: 'write_file', status: 'ok', args: { operation: 'create', path: 'NOTES.md' } },
    { ordinal: 2, tool_name: 'read_file', status: 'ok', args: { path: 'NOTES.md' } },
    { ordinal: 3, tool_name: 'write_file', status: 'ok', args: { operation: 'edit', path: 'NOTES.md' } },
  ];
  const log = line(100, 'approval W presented (write_file, rule preset:ask); 0 waiting');
  it('reads the built-app launch: one dialog, one grant, the edit allowed by the session rule', () => {
    const w = sessionScopedWrites({ audit: [grant, rule], calls, log });
    expect(w.shown).toHaveLength(1);
    expect(w.grants).toHaveLength(1);
    expect(w.unasked).toHaveLength(1);
    expect(w.byPath['NOTES.md'].map((c: { operation: string }) => c.operation)).toEqual(['create', 'edit']);
    const out = approvalsLiveVerdicts(w, { path: 'NOTES.md', fileText: '# Notes\nsecond line\n', wanted: ['second line'] });
    expect(out.filter((v: { passed: boolean }) => !v.passed)).toEqual([]);
  });
  it('under REQ-TOOLS-024 alone the edit asks again, and the live reading fails', () => {
    const asked = { ...grant, source: 'user-once', reason: "The user approved 'write_file' once (rule 'preset:ask' asked)." };
    const w = sessionScopedWrites({ audit: [grant, asked], calls, log: `${log}\n${line(900, 'approval X presented (write_file, rule preset:ask); 0 waiting')}` });
    const failed = approvalsLiveVerdicts(w, { path: 'NOTES.md' }).filter((v: { passed: boolean }) => !v.passed).map((v: { what: string }) => v.what);
    expect(failed).toHaveLength(2);
  });
  it('a model that never granted, or wrote the path once, is a NOTE', () => {
    expect(approvalsLiveVerdicts(sessionScopedWrites({ audit: [], calls: [], log: '' }), { path: 'NOTES.md' })).toEqual([expect.objectContaining({ verdict: 'note' })]);
    const once = sessionScopedWrites({ audit: [grant], calls: calls.slice(0, 1), log });
    expect(approvalsLiveVerdicts(once, { path: 'NOTES.md' }).map((v: { verdict: string }) => v.verdict)).toEqual(['check', 'note']);
  });
});
