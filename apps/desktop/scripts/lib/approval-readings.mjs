/**
 * The approval waits of one session as the record and main's log show them — read by `approvals-proof.mjs` (scripted model,
 * strict) and by `live-run.mjs`'s `away` scenario (a real model, a NOTE where the model never reached a
 * shape). Plain ESM, no product import: the store's rows and the log's lines in, facts out.
 *
 * What each reading needs:
 *   - `audit`: `permission_audit` decision rows with their `entry` merged in (`request_id`, `reason`, …) and `at` in ms;
 *   - `events`: `events` rows with `payload` parsed and `at` in ms (the `approval.requested` envelopes);
 *   - `timeline`: `timeline` rows with `metadata` parsed and `at` in ms;
 *   - `log`: main's application log (`approval <id> presented (<tool>, rule …)`, one line per dialog shown).
 */

/** PD-TOOLS-005's reason clause, as the gate words it for an ask resolved, or a wait ended, while the user is away. */
export const awayReason = (seconds) => `The user is treated as away because an earlier approval in this run went unanswered for ${seconds} seconds`;
/** REQ-TOOLS-052's timeout reason, the end of the first unanswered wait's decision. */
export const timeoutReason = (seconds) => `Denied because no answer arrived within ${seconds} seconds.`;

/** Every dialog main showed, in order, with the instant it logged the presentation. */
export function presentedDialogs(log) {
  return [...String(log).matchAll(/^\[main (\S+)\].*approval (\w+) presented \(([\w-]+), rule ([^)]+)\)/gm)]
    .map((m) => ({ at: Date.parse(m[1]), requestId: m[2], tool: m[3], rule: m[4] }));
}

/** The `approval.requested` events, their fields wherever the envelope keeps them, with the event's instant and ordinal. */
export function approvalRequests(events) {
  return events.filter((e) => e.kind === 'approval.requested').map((e) => {
    const p = e.payload ?? {};
    const fields = p.data ?? p.payload ?? p;
    return { ...fields, at: e.at, ordinal: e.ordinal };
  });
}

/**
 * PD-TOOLS-005 revisions 1 and 2 and PD-TOOLS-011, read from one session: the first wait that ended by timeout, the away mark
 * it set, the waits it ended (queued or shown, brokered before it), the asks made while away, the question tool's own approval
 * (exempt), the return and what was asked after it. A fact the session never reached is null or empty, never invented.
 */
export function awayStretch({ audit, events, timeline, log }) {
  const shown = presentedDialogs(log);
  const requests = approvalRequests(events);
  const decisionOf = (requestId) => audit.find((a) => a.request_id === requestId) ?? null;
  const shownOf = (requestId) => shown.find((p) => p.requestId === requestId) ?? null;
  const timedOut = audit.find((a) => a.source === 'timeout') ?? null;
  const first = timedOut === null ? null : requests.find((r) => r.request_id === timedOut.request_id) ?? null;
  const awayEntries = timeline.filter((t) => t.name === 'user_away');
  const returnedEntries = timeline.filter((t) => t.name === 'user_returned');
  const away = awayEntries[0] ?? null;
  const returned = returnedEntries.find((t) => away !== null && t.at >= away.at) ?? null;
  const seconds = away?.metadata?.after_seconds ?? null;
  const withReason = (d) => d !== null && seconds !== null && d.source === 'headless-policy' && String(d.reason ?? '').includes(awayReason(seconds));
  const ended = timedOut === null ? [] : requests
    .filter((r) => r.resolver === 'brokered' && r.request_id !== timedOut.request_id && r.at <= timedOut.at)
    .map((r) => ({ request: r, decision: decisionOf(r.request_id), shown: shownOf(r.request_id) }))
    .filter((w) => withReason(w.decision))
    .map((w) => ({ ...w, lagMs: w.decision.at - timedOut.at }));
  const end = returned?.at ?? Number.POSITIVE_INFINITY;
  const askedWhileAway = away === null ? [] : requests
    .filter((r) => r.resolver === 'headless' && r.at >= away.at && r.at <= end)
    .map((r) => { const d = decisionOf(r.request_id); return { request: r, decision: d, shown: shownOf(r.request_id), decidedMs: d === null ? null : d.at - r.at, awayReason: withReason(d) }; });
  // The question tool's own approval waiting when the user was marked away: the one wait the mark must not end (revision 2).
  const exempt = timedOut === null ? [] : requests
    .filter((r) => r.tool_name === 'ask_questions' && r.resolver === 'brokered' && r.at <= timedOut.at)
    .map((r) => ({ request: r, decision: decisionOf(r.request_id), shown: shownOf(r.request_id) }));
  const askedAfterReturn = returned === null ? [] : requests.filter((r) => r.at > returned.at)
    .map((r) => ({ request: r, decision: decisionOf(r.request_id), shown: shownOf(r.request_id) }));
  return {
    shown, requests,
    first: first === null ? null : { request: first, decision: timedOut, shown: shownOf(first.request_id), waitedMs: timedOut.at - first.at },
    away, awayCount: awayEntries.length, seconds,
    ended, askedWhileAway, exempt,
    returned, returnedCount: returnedEntries.length, askedAfterReturn,
    claimsNoUi: audit.filter((a) => /No approval UI is available/.test(String(a.reason ?? ''))),
  };
}

/**
 * The live run's `away` scenario read from one session (PD-TOOLS-005, PD-TOOLS-011 against a real model): every dialog is
 * left unanswered, so the first ask must time out and mark the user away, and every later ask must be denied at once with
 * the directive's reason and no dialog. Returns the verdicts in order, each `{ verdict: 'check' | 'note', passed, what,
 * detail }`; a shape the model never reached is a NOTE, never a pass or a failure.
 */
export function awayLiveVerdicts(stretch, { seconds, sessionLog = '', answer = '' }) {
  const out = [];
  const check = (passed, what, detail) => out.push({ verdict: 'check', passed: Boolean(passed), what, detail: detail ?? null });
  const note = (what, detail) => out.push({ verdict: 'note', passed: true, what, detail });
  const { first, away, askedWhileAway, shown } = stretch;
  if (first === null && shown.length === 0) {
    note('away: the model asked for nothing that prompts, so no approval could go unanswered', 'PD-TOOLS-005 is unasked this run');
    return out;
  }
  check(first !== null, 'away: the first approval left unanswered ended by timeout (REQ-TOOLS-052)', first === null ? `${shown.length} dialog(s) shown, none timed out` : `${first.request.tool_name}, waited ${first.waitedMs} ms`);
  if (first === null) return out;
  check(String(first.decision.reason ?? '').endsWith(timeoutReason(seconds)) && first.waitedMs >= seconds * 1000 - 50, `away: it waited the full ${seconds} s and kept REQ-TOOLS-052's reason`, `${first.waitedMs} ms — ${first.decision.reason}`);
  check(away !== null && stretch.awayCount === 1 && stretch.seconds === seconds && away.actor === 'rotaris', 'away: the run marked its user away once, a user_away entry naming the timeout (PD-TOOLS-011)', away === null ? 'no user_away entry' : `${stretch.awayCount} entr${stretch.awayCount === 1 ? 'y' : 'ies'}, after_seconds ${stretch.seconds}, actor ${away.actor}`);
  const line = sessionLog.split('\n').find((l) => /user away: an approval in this run went unanswered for/.test(l)) ?? null;
  check(line !== null && / WARNING /.test(line), 'away: the session log carries the away line at WARNING', line ?? 'no such line');
  check(shown.length === 1, 'away: no dialog was shown after the first went unanswered', shown.map((p) => p.tool).join(', '));
  if (askedWhileAway.length === 0) note('away: the model asked nothing more after the timeout', 'clause 2 (an ask while away is denied at once) is unasked this run');
  else {
    const wrong = askedWhileAway.filter((w) => !w.awayReason || w.shown !== null || w.decidedMs === null || w.decidedMs > 1000);
    check(wrong.length === 0, `away: every ask while away (${askedWhileAway.length}) was denied at once with the directive's reason and no dialog`, wrong.length === 0 ? askedWhileAway.map((w) => `${w.request.tool_name} ${w.decidedMs} ms`).join(', ') : wrong.map((w) => `${w.request.tool_name}: ${w.decision?.source} ${w.decidedMs} ms, ${w.shown === null ? 'no dialog' : 'a dialog'} — ${w.decision?.reason}`).join(' | '));
  }
  check(stretch.claimsNoUi.length === 0, 'away: no decision claims that no approval UI is available', stretch.claimsNoUi.map((d) => d.reason).join(' | ') || undefined);
  const said = String(answer).trim();
  note('away: what the model said after its asks were refused', said === '' ? '(no answer recorded)' : `${/away|approv|unanswered|denied|refused|permission/i.test(said) ? 'names the refusal' : 'does not name the refusal'}: ${said.slice(0, 300)}`);
  return out;
}
