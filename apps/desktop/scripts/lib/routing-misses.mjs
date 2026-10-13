/**
 * PD-TOOLS-006 revision 8 (OQ-250, ruled 2026-10-07 under the owner's delegation, R-072): the two counts OQ-216's target of zero
 * is measured by, over every preserved session — each `delegate` refused because its `write_scope` named a persona that cannot
 * write files (revision 3's refusal: the routing table sent a write to a reader, the duress run at a68f121's call 115), and each
 * call a child made of a tool it does not hold, refused at the gate as unknown (a brief offered it a command its entry lacks,
 * that run's call 114 then call 164). Both are NOTEs: the mechanism bounded each miss; the target for both is 0.
 *
 * `sessions`: `{ scenario, rootNames: string[], calls: { ordinal, tool_name, agent_name, status, result, failureKind }[] }[]`.
 */
export function routingMissReading(sessions) {
  const scopeRefusals = [];
  const unknownTools = [];
  for (const s of sessions) {
    const roots = new Set(s.rootNames ?? []);
    for (const c of s.calls ?? []) {
      const result = String(c.result ?? '');
      if (c.tool_name === 'delegate' && /rejected — write_scope was given to '[^']+', which cannot write files/.test(result)) {
        scopeRefusals.push({ scenario: s.scenario, ordinal: c.ordinal, persona: /write_scope was given to '([^']+)'/.exec(result)?.[1] ?? '?' });
      }
      if (!roots.has(c.agent_name) && /^Unknown tool '[^']+'\./.test(result)) {
        unknownTools.push({ scenario: s.scenario, ordinal: c.ordinal, agent: c.agent_name, tool: c.tool_name });
      }
    }
  }
  return { read: sessions.map((s) => s.scenario), scopeRefusals, unknownTools };
}
