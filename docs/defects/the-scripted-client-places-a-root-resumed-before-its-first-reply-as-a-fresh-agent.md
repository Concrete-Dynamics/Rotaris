## The scripted client places a root resumed before its first reply as a fresh agent

Since the repair of
[`the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md`](fixed/the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md),
the scripted client places a resumed agent by the ordinal its last step left in its own record. A root resumed in a
later iteration of its run **before its first reply in that iteration** — the quit or pause landed while its first call
there was in flight, a `wait:` or a `hang` for instance — carries no message the double wrote: its record holds only the
iteration's task. It is placed as a fresh agent, at the script's first step, where an unbroken client would have carried
on from the steps the root took in the earlier iterations.

No proof scripts this. A proof that does must allow for the root taking its first steps again until it is settled, or
script the later iteration's first step as a tool call so the root replies before the pause.

A second reading of the same kind, which the ordinal marks did not change: `resumedAt` stops at the step just after the
last one that answered with a message. So a step that answers with none (`fail`, `fail:context`, a `fail:<fault>`,
`hang`), if it was the last step an agent took before a cross-client resume, is taken again by the new client, where an
unbroken client would have moved past it. The client worked this way before the marks too. This is read from
`resumedAt`, not measured: no proof ends a record on such a step and then resumes it in a new client.

Noticed 2026-09-30 under R-067, by the repair named above.

## Specs

None. The scripted client is verification only; what the product sends a resumed agent is its own record, which this
does not touch.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — `takenFrom`, which reads the record, `resumedAt`, which places the
  agent after the last step that answered with a message, and the first-call seeding in
  `stream`. The record is the only thing a continue's new client is handed; the run's earlier iterations are in the
  store, which the double does not read.
- `apps/desktop/src/run-host/scripted-client.test.ts` — the later-iteration cases, which resume a root after a reply.
