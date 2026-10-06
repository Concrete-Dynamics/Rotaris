/**
 * The autopsy reader's "retried" lines (`autopsy.mjs`, coherence): `terminal` calls grouped by what was RUN AGAIN — the
 * whole command, whitespace collapsed, the call's `session_action`, and the agent that made the call — and a group of two
 * or more printed as a retry. Until 2026-10-03 the key was the command's first 120 characters alone, so a long
 * `cd <worktree> && ` prefix collapsed different commands into one line and a `send_signal` and a `query` of one background
 * session, both carrying the command `true`, read as one command retried
 * (`docs/defects/fixed/the-autopsy-reader-counts-different-commands-as-one-retried-command.md`, finding D6 of the default
 * live run at 1763f7f). Until 2026-10-06 the key carried no agent, so two agents each running the suite once read as one
 * command "retried 2×" (`docs/defects/fixed/the-autopsy-reader-reads-two-agents-each-running-a-command-once-as-one-command-retried.md`,
 * finding H8 of the duress live run at 27a5127). `packages/engine/src/autopsy.ts` keys the same way.
 */

/** The key and the printed label of one call by `agent`, or null when its args carry no command. */
export function retryKeyOf(args, agent = '') {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
  const command = typeof args.command === 'string' ? args.command.replace(/\s+/g, ' ').trim() : '';
  if (command === '') return null;
  const action = typeof args.session_action === 'string' && args.session_action !== '' ? args.session_action : null;
  return { key: JSON.stringify([agent, action, command]), label: action === null ? command : `[${action}] ${command}` };
}

/**
 * Every group of two or more calls with one key, most repeated first: `{ agent, label, times }`, at most `limit` of them.
 * Each call is `{ agent, args }`: the store's `agent_name` and the `terminal` call's args.
 */
export function retriedCommands(calls, limit = 10) {
  const groups = new Map();
  for (const call of calls) {
    const agent = typeof call?.agent === 'string' ? call.agent : '';
    const k = retryKeyOf(call?.args ?? null, agent);
    if (k === null) continue;
    const g = groups.get(k.key) ?? { agent, label: k.label, times: 0 };
    g.times += 1;
    groups.set(k.key, g);
  }
  return [...groups.values()].filter((g) => g.times > 1).sort((a, b) => b.times - a.times).slice(0, limit);
}
