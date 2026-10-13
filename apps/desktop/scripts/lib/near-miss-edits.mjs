/**
 * PD-TOOLS-014 (OQ-231, ruled under the owner's delegation, R-072, 2026-10-07) as the live run reads it from each preserved
 * session's `tool_calls`: a `haet_edit` or `haet` refusal whose reply names "match level 2" or "match level 3" is a near
 * miss the product quoted. The directive's measure is what the agent did next (finding D5 of the final duress run at
 * `a68f121`: each of six level-3 misses was followed by a `sed -n … | cat -A` or `awk … indent=` probe before the retry).
 *
 * `sessions`: `{ scenario, calls: { ordinal, tool_name, agent_name, args, result, isError }[] }[]`, the calls in ordinal
 * order. Returns, over every session: `misses` — each near miss (`{ scenario, ordinal, agent, path, level }`); `probed` —
 * those followed by a `terminal` call of the same agent before its next `haet_edit`/`haet` call, or, where the agent never
 * edits again, within its next `PROBE_WINDOW` calls (target 0); `retried` —
 * those whose same agent's next `haet_edit`/`haet` call edited the same path and succeeded; `ambiguous` — those whose same
 * agent's next `haet_edit`/`haet` call on the same path was refused "Found <n> occurrences", the retry `PD-TOOLS-014`
 * revision 2 exists to spare (OQ-252, R-072, 2026-10-13: a quote whose text recurs is flagged; target 0).
 */
const EDIT_TOOLS = new Set(['haet_edit', 'haet']);
const LEVEL = /\bat match level ([23]) \(/;
const AMBIGUOUS = /^Found \d+ occurrences of old_str\b/;
/**
 * Where the agent never edits again, how many of its next calls can be the probe. Before fin35 every later call could, so a
 * terminal call late in the agent's life counted the miss as probed (fin32's review); D5's probes came at the next call.
 */
const PROBE_WINDOW = 3;

const pathOf = (call) => {
  const args = call.args ?? {};
  return typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : null;
};

export function nearMissReading(sessions) {
  const misses = [];
  const probed = [];
  const retried = [];
  const ambiguous = [];
  for (const { scenario, calls } of sessions) {
    calls.forEach((call, i) => {
      if (!EDIT_TOOLS.has(call.tool_name) || call.isError !== true) return;
      const level = LEVEL.exec(String(call.result ?? ''));
      if (level === null) return;
      const miss = { scenario, ordinal: call.ordinal, agent: call.agent_name, path: pathOf(call), level: Number(level[1]) };
      misses.push(miss);
      const later = calls.slice(i + 1).filter((c) => c.agent_name === call.agent_name);
      const next = later.findIndex((c) => EDIT_TOOLS.has(c.tool_name));
      const between = next === -1 ? later.slice(0, PROBE_WINDOW) : later.slice(0, next);
      if (between.some((c) => c.tool_name === 'terminal')) probed.push(miss);
      if (next !== -1 && later[next].isError !== true && pathOf(later[next]) === miss.path) retried.push(miss);
      if (next !== -1 && later[next].isError === true && pathOf(later[next]) === miss.path && AMBIGUOUS.test(String(later[next].result ?? ''))) ambiguous.push(miss);
    });
  }
  return { misses, probed, retried, ambiguous };
}
