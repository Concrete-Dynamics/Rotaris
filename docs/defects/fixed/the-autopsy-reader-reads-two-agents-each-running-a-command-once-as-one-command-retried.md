## The autopsy reader reads two agents each running a command once as one command "retried"

Both autopsy readers group a session's `terminal` calls by the whole command (whitespace collapsed) and the call's
`session_action`, and print every group of two or more as `retried N×: <command>`. The key does not include the agent that
made the call. So two agents that each ran the same command once read as one command run twice, a retry nobody made.

Observed in the orchestrator's final duress live run at origin/main `27a5127` (2026-10-06, 01:48 to 02:44 UTC, against the
self-hosted endpoint; pack `2026-10-06T01-47-53-900Z`, finding H8 of its autopsy). `duress/autopsy.txt` reads
"retried 2×: cd …/workspace && node --test 2>&1 | tail -40". In the pack's `workspace.db` those are two calls by two agents,
41 minutes apart, each running the suite once:

- `tool_calls` ordinal 137, `agent_name` `wave2d-reconcile-docs`, started 01:55:23.661;
- `tool_calls` ordinal 300, `agent_name` `wave3-verification-report` (the continuation), started 02:37:04.711.

That is one misleading efficiency line in the evidence pack, which an autopsy has to re-derive from the store. The earlier
repair of this line (`docs/defects/fixed/the-autopsy-reader-counts-different-commands-as-one-retried-command.md`, D6 at
`1763f7f`) made the key the whole command and the session action. This is a different cause: those two commands are
byte-identical, and the agent is what differs.

## Specs

None contradicted directly: the reader is a harness (R-043's run-autopsy snapshot printer, covering REQ-SESSION-136's
tool-call record fields, `agent_name` among them, and REQ-SESSION-139's metrics document rebuilt from the records). Its
"retried" line claims a repetition by one agent that the records do not show.

## Relevant files

- `packages/engine/src/autopsy.ts` — `readAutopsy`'s `commands` map, keyed on `[session_action, command]`, which feeds
  `coherence.retried_commands`.
- `apps/desktop/scripts/lib/autopsy-retries.mjs` — `retryKeyOf` and `retriedCommands`, the same key for the script reader.
- `apps/desktop/scripts/autopsy.mjs` — passes each `terminal` call's args alone to `retriedCommands`, so the agent never
  reaches the key.

Noticed 2026-10-06 by the autopsy of the final duress live run at `27a5127` (H8); recorded by plan fin19 before any repair.

## Outcome (2026-10-06, fin19, repaired)

A retry is now keyed on what one agent ran again: the whole command (whitespace collapsed), the call's `session_action` and
its `agent_name`. D6's repair stands: the whole command and the session action are still in the key. The script reader's
`retriedCommands` (`apps/desktop/scripts/lib/autopsy-retries.mjs`) takes each call as `{ agent, args }`; `autopsy.mjs`
passes the row's `agent_name` and prints `retried N× by <agent>: <command>`. The engine's `readAutopsy` keys
`coherence.retried_commands` the same way, and each entry now carries `agent`.

Pinned by "H8 (27a5127): the same command run once by each of two agents is no retry; the same agent running it twice still
is" in `apps/desktop/scripts/lib/autopsy-retries.test.ts`, and "H8 (27a5127): a command is retried only by the agent that ran
it again …" in `packages/engine/src/autopsy.test.ts`. Both use the pack's two calls: the suite by `wave2d-reconcile-docs` and
by `wave3-verification-report`, then the latter's second run. Both were red before the repair, which printed or returned
`times: 2` for the two agents' single runs. D6's cases still pass, now written as calls by one agent; the engine's literal
gained `agent: 'a'`.

Shown on the evidence pack's own store, a private copy of the pack's `workspace.db`:
`node apps/desktop/scripts/autopsy.mjs <copy> 5a8e7446-12f6-4645-8d4c-882a1e1431a9`. Its output now equals the pack's
`duress/autopsy.txt` except for the store path line, the trailing blank line, and the missing
"retried 2×: cd …/workspace && node --test 2>&1 | tail -40". No other retried line appears, since no agent of that run ran a
command twice.
