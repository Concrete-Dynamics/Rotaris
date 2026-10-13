/**
 * PD-TOOLS-006 revision 8 (OQ-250, ruled 2026-10-07 under the owner's delegation, R-072): the two counts OQ-216's measure is read
 * by, over every preserved session — each `delegate` refused because its `write_scope` named a persona that cannot write files
 * (revision 3's refusal: the routing table sent a write to a reader, the duress run at a68f121's call 115), and each call a child
 * made of a tool it does not hold, refused at the gate as unknown (a brief offered it a command its entry lacks, that run's call
 * 114 then call 164). The unknown-tool count's target is 0.
 *
 * Since OQ-257 (`PD-TOOLS-006` revision 9, ruled 2026-10-13 under R-072) the write-scope count is read against a bound, not a
 * target of zero: at most one refusal per run, each answered by the coordinator's next `delegate`, which re-routes the work — an
 * accepted delegation to another persona, or to the same one without a scope. Each refusal carries the seconds to that next
 * `delegate` (between the two calls' recorded ends) and whether it re-routed; `flagged` names the scenarios over the bound: more
 * than one refusal, or a refusal not re-routed. The falsified target, kept beside it: "0 write-scope refusals" — the duress run at
 * 552d346 had one (#92, `architect`), refused in 5 ms and re-routed by the next `delegate` 30.0 s later.
 *
 * `sessions`: `{ scenario, rootNames: string[], calls: { ordinal, tool_name, agent_name, status, result, failureKind, args?, endedAt? }[] }[]`.
 */
export function routingMissReading(sessions) {
  const scopeRefusals = [];
  const unknownTools = [];
  const flagged = [];
  for (const s of sessions) {
    const roots = new Set(s.rootNames ?? []);
    const calls = s.calls ?? [];
    let refusedHere = 0;
    for (let i = 0; i < calls.length; i += 1) {
      const c = calls[i];
      const result = String(c.result ?? '');
      if (c.tool_name === 'delegate' && /rejected — write_scope was given to '[^']+', which cannot write files/.test(result)) {
        const persona = /write_scope was given to '([^']+)'/.exec(result)?.[1] ?? '?';
        const next = calls.slice(i + 1).find((n) => n.tool_name === 'delegate' && n.agent_name === c.agent_name);
        const accepted = next !== undefined && !/rejected — /.test(String(next.result ?? ''));
        const scope = next?.args?.write_scope;
        const rerouted = accepted && (next.args?.persona !== persona || !Array.isArray(scope) || scope.length === 0);
        const secondsToNext = next !== undefined && typeof next.endedAt === 'number' && typeof c.endedAt === 'number' ? Math.round((next.endedAt - c.endedAt) / 100) / 10 : null;
        scopeRefusals.push({ scenario: s.scenario, ordinal: c.ordinal, persona, secondsToNext, rerouted });
        refusedHere += 1;
        if (!rerouted) flagged.push({ scenario: s.scenario, ordinal: c.ordinal, why: next === undefined ? 'no later delegate by the same agent' : 'the next delegate did not re-route the work' });
      }
      if (!roots.has(c.agent_name) && /^Unknown tool '[^']+'\./.test(result)) {
        unknownTools.push({ scenario: s.scenario, ordinal: c.ordinal, agent: c.agent_name, tool: c.tool_name });
      }
    }
    if (refusedHere > 1) flagged.push({ scenario: s.scenario, ordinal: null, why: `${refusedHere} write-scope refusals in one run` });
  }
  return { read: sessions.map((s) => s.scenario), scopeRefusals, unknownTools, flagged };
}
