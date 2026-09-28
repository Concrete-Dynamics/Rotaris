## The terminal SIGINT test fails intermittently under full-suite load

`packages/agent-tools/src/terminal/terminal.test.ts` › "OQ-10 (R-044): send_signal SIGINT stops a background session
instead of refusing it" failed in two of the full gate runs of the merged revision 4 build of `PD-ORCH-005` (R-064,
2026-09-28) and was listed as a new failure against the baseline. It passed alone, its file passed 33 of 33, and other
full gate runs were clean. That build changed nothing under `packages/agent-tools`. The test starts `sleep 30` as a
background session, sends it SIGINT at once, and polls the session list for up to twenty seconds for the ended mark. In
the failing run the SIGINT was reported sent ("Sent SIGINT to session …"), yet the list still showed the session
`▶ … running` twenty seconds later: the signal was delivered but did not end the command. The likeliest reading is a
race — under load the signal reaches the session's shell before `sleep` has started, and is lost — which would make it
a product defect as well as a flaky test: `send_signal` reports a signal sent that stopped nothing. Not reproduced in
isolation and not repaired.

## Specs

If the race reading holds, OQ-10's reading of `send_signal` (R-044: SIGINT stops a background session instead of being
refused) is not met for a session signalled as soon as it starts, and the tool's "Sent SIGINT" result overstates what
happened. Otherwise none is contradicted, and the defect is in the test's reliability under load.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the test, its 30 s timeout and its 80 × 250 ms poll of the
  session list.
- `packages/agent-tools/src/terminal/` — the terminal manager whose SIGINT delivery and end detection the test waits on.
