## A signal sent just after a background start can be lost under load

`send_signal SIGINT` sent to a background session immediately after it started reported "Sent SIGINT to session …",
yet the session stayed `running` for the whole 20 s the test polls. It happened once, in a full `pnpm test` run of a
branch that touches no terminal code (the `PD-ORCH-005` phase 3 gate, 2026-09-27); the same file then passed three
times in a row on its own. The likeliest reading, not established, is a race: under load the signal reaches the
session before its shell has started the command, and nothing re-delivers it. Noticed while gating other work; not
root-caused.

It recurred on 2026-09-28 in at least three full gate runs of the merged revision 4 build of `PD-ORCH-005` (R-064),
which changed nothing under `packages/agent-tools`, listed each time as a new failure against the baseline: "Sent
SIGINT" was reported and the session list still showed it `▶ … running` twenty seconds later. The test passed alone
and its file passed 33 of 33. Still not reproduced in isolation and not repaired.

On 2026-09-29 it failed in the gate of the live-run branch (R-065), which also changes nothing under
`packages/agent-tools`, and then once in three runs of its file alone — the first failure in isolation. The race
reading was tested outside the product and did not hold: `bash -c 'sleep 30'` spawned detached, as `spawnChild` spawns
a background session, and sent SIGINT to its process group at once, ended 200 times out of 200, and 200 of 200 again with
the signal 50 ms later. Whatever keeps the session running lies in what the product does around the spawn or the
signal, not in the shell's startup. Not repaired.

## Specs

`OQ-10` as ruled by `R-044` — `send_signal SIGINT` stops a background session instead of refusing it. A signal that is
reported sent and does not stop the session contradicts it, if the race reading holds; if it does not, the defect is
the test's timing.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — "OQ-10 (R-044): send_signal SIGINT stops a background
  session instead of refusing it", which starts `sleep 30` and signals it at once.
- `packages/agent-tools/src/terminal/` — the background session and its `send_signal` path.
