## The scripted client places a root resumed before its first reply as a fresh agent

Since the repair of
[`the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md`](the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md),
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

## Outcome

Repaired 2026-10-01 under the fin2 harness bundle (triage of the open notes on `origin/main` 46b897c).

Confirmed on this branch first. Three new cases in `scripted-client.test.ts` play a run in one client and resume it in a
new one, and on the unrepaired client each took a step the unbroken client would not have: a root resumed before its
first reply in iteration 2, after a `hang` its first call there began, took `read_file`, the script's first step, where
the next was `write_file`; a root whose first call in iteration 2 was cut during a `wait:` prefix took `read_file` where
the step after the wait was `glob`; and a root whose last step was `fail:429` took the rate limit again where the next
step was `glob`. The second reading, which the note gave as read and not measured, is measured by the third case.

The repair does not follow the triage's sketch, because what the sketch would read is not there. A later iteration's root
is handed its own record only, opening with the iteration's task (`firstMessage` in `run.ts`): no earlier iteration's
call ids and no text the double wrote. A failed or aborted step pushes nothing into the conversation (`runTurn` returns
on a failed report before the assistant message is pushed), so no mark in an error result can reach the record either.
Nothing a step writes reaches a record that holds no reply.

So the client now keeps the counter where the next client can read it. `StandingLedger` in `scripted-client.ts`: when an
agent's call begins, its entry records the script position its next call takes, counted as the environment names the
list, every step and a wait prefix included (`position`, which a completed wait's splice does not shift), over a digest
of the conversation the call was handed; when the call answers, the entry is cleared, since the record then carries the
step's own mark. A new client reads an entry only at an agent's first call, and only when the conversation it is handed
begins with the one the entry was written over (a continue's message may follow it), and places the agent at the later
of that position and the one its record's marks give. Entries are keyed by the counter key and the digest of the
conversation's opening message, so two sessions' roots in one process keep their own. The run host keeps the ledger in
`scripted-standing.json` in the data directory (`fileLedger`, `host.ts`), under `__ROTARIS_SEAMS__`, so a packaged build
has none and places a resumed agent from its record alone, as before; `scripts/package.mjs`'s seam check refuses a
packaged bundle that still names the file. With no ledger passed, the client is unchanged, which is how every earlier
case in the test file runs.

One reading is stated, not guarded: a fresh agent whose conversation begins as one an earlier client's call left
unanswered (a failed or cancelled first call, then a new run with the same prompt in the same data directory) is placed
as that agent would have resumed. A step that answered leaves no entry, so the common case, the same prompt run again
after a reply, starts from the first step; a case pins it.

Pinned by:
- `apps/desktop/src/run-host/scripted-client.test.ts`: the three cases above, each failing on the unrepaired client, and
  three more — a step that answered clears its entry, so a fresh root with the same prompt starts from the first step; an
  entry left over another conversation does not place a fresh agent; the file ledger reads back, in a new ledger over the
  same file, what the last one wrote. The ten earlier cases pass unchanged.
- `part-j-proof`'s new scenario 6 (`quit-before-reply`, then `resume-before-reply`), in the built app as root under Xvfb
  with Node 24: the first launch's root reads and answers, the queued message opens iteration 2, whose root's first call
  (`wait:60000`) the application's quit cuts; the store shows iteration 2 open by `quit` with a record holding only its
  task, and the ledger file in the data directory. The relaunch's Continue resumes that root, whose calls are `["glob"]`,
  and the session completes. With the ledger file removed between the two launches (a scratch copy of the scenario, not
  kept) the resumed root's calls were `["read_file"]` and the scenario failed on its assertion, as the unrepaired client
  places it. The proof's other scenarios, the steer-rest resume among them (three reads), pass on the same build.

The proof neighbours that continue, relaunch or script message-less steps ran on the same build, `--skip-build`, with the
other plan's agents on the host: `resilience-proof`, `mission-proof`, `compression-proof`, `plan-gate-proof`,
`questions-proof`, `part-h-proof`, `chat-controls-proof` and `transcript-proof` exit 0. `checkpoint-proof` failed three
times at scenario 9, before any model call: the session browser pushed the row's Open out of its dialog under this
worktree's path, so the resume's click loaded nothing. A build of `origin/main` passed it from a shorter path and from
one of the same length whose longest unbroken run is shorter, and it is recorded on its own
([`the-session-browsers-table-pushes-each-rows-open-out-of-its-dialog-under-a-long-workspace-path.md`](the-session-browsers-table-pushes-each-rows-open-out-of-its-dialog-under-a-long-workspace-path.md));
its scenarios before 9, the relaunches of a session a crash left among them, passed. The row is in
[`../../architecture/first-executions.md`](../../architecture/first-executions.md).

Noticed along the way, and not repaired here: a `wait:` prefix is spliced out of the step list every child shares, so a
fan-out's children take each other's steps
([`the-scripted-clients-wait-prefix-is-spliced-out-of-the-list-every-child-shares.md`](the-scripted-clients-wait-prefix-is-spliced-out-of-the-list-every-child-shares.md);
repaired 2026-10-02, and its counter `position` folded into `calls` there).
