/**
 * The autopsy reader's "retried" lines (`autopsy.mjs`, coherence): `terminal` calls grouped by what was RUN — the whole
 * command, whitespace collapsed, and the call's `session_action` — and a group of two or more printed as a retry. Until
 * 2026-10-03 the key was the command's first 120 characters alone, so a long `cd <worktree> && ` prefix collapsed different
 * commands into one line and a `send_signal` and a `query` of one background session, both carrying the command `true`,
 * read as one command retried (`docs/defects/fixed/the-autopsy-reader-counts-different-commands-as-one-retried-command.md`,
 * finding D6 of the default live run at 1763f7f). `packages/engine/src/autopsy.ts` keys the same way.
 */

/** The key and the printed label of one call's args, or null when it carries no command. */
export function retryKeyOf(args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
  const command = typeof args.command === 'string' ? args.command.replace(/\s+/g, ' ').trim() : '';
  if (command === '') return null;
  const action = typeof args.session_action === 'string' && args.session_action !== '' ? args.session_action : null;
  return { key: JSON.stringify([action, command]), label: action === null ? command : `[${action}] ${command}` };
}

/** Every group of two or more calls with one key, most repeated first: `{ label, times }`, at most `limit` of them. */
export function retriedCommands(argsList, limit = 10) {
  const groups = new Map();
  for (const args of argsList) {
    const k = retryKeyOf(args);
    if (k === null) continue;
    const g = groups.get(k.key) ?? { label: k.label, times: 0 };
    g.times += 1;
    groups.set(k.key, g);
  }
  return [...groups.values()].filter((g) => g.times > 1).sort((a, b) => b.times - a.times).slice(0, limit);
}
