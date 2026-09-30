## The scripted client counts only the steps a resumed record still shows

Since the repair of
[`the-scripted-client-restarts-its-script-for-every-run.md`](the-scripted-client-restarts-its-script-for-every-run.md),
the scripted client places a resumed agent in its script from the agent's own record: one assistant message per step
that answered (`resumedAt` in `scripted-client.ts`). Where the record does not hold every step the agent took, the
agent is placed too early and takes steps again:

- A root resumed in a later iteration of its run counts only that iteration's steps, where an unbroken run's counter
  counted every iteration's. In a multi-iteration run this is a smaller case of the symptom the repaired note reported.
- A record the compressing pass rewrote counts only the steps it still holds. After compression a resumed child's first
  user message may also no longer carry its TASK line, so its counter is keyed apart from the counter it had.

Neither reading has a test, and no proof scenario resumes a root in a later iteration or resumes a compressed record.
A proof that scripts either must allow for the repeated steps until this is settled.

Noticed 2026-09-29 under R-067, by the verification of that repair.

## Specs

None. The scripted client is verification only; what the product sends a resumed agent is the agent's own record,
which this does not touch.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — `resumedAt` and the first-call seeding in `stream`, whose comment
  states both readings.
- `apps/desktop/src/run-host/scripted-client.test.ts` — the resumed-agent cases, none of which covers either reading.

## Outcome

Repaired 2026-09-30 under R-067 (acceptance finding A52).

Confirmed on this branch first: four new cases in `scripted-client.test.ts` play a run in one client and resume it in a
new one, and on the unrepaired client each placed the agent too early — a root resumed in iteration 2 after three steps
took the script's second step (`glob`) instead of its fourth (`write_file`); a root whose later iteration held only a
streamed answer answered again instead of taking `git`; a child whose three steps were all compressed away took its
first step again; and one whose compression kept its last turn took its second.

The client no longer counts the messages a record still holds. Each step leaves its **ordinal** — how many of this
agent's steps that answered with a message it has taken, this one included, across every iteration — in the message it
answers with: in its tool call's id (`call-<n>-s<ordinal>`, which no surface prints) where it calls a tool, and as
` (scripted step <n>)` on the last word of a streamed or deliberated answer, so the reply streams in as many deltas as
before. `takenFrom` reads a resumed record: the last ordinal it carries, plus one for each assistant message after it
that carries none — so a record an earlier build wrote, which carries none, counts its messages exactly as before. The
scripted compressor's summary gains a last line, `Scripted steps taken: {…}`, restating every agent's ordinal by its
counter key; the rebuilt conversation carries that summary, so a record whose marked steps were all condensed away still
says where the agent stood. The second reading's key question settles in the product: `rebuild` puts the original
request first, character for character (REQ-MONITOR-084), so a compressed child's first user message still carries its
TASK line and its counter keeps its key — pinned by the compression case.

One reading remains, and it is not a count: a root resumed in a later iteration **before its first reply in that
iteration** carries no message of its own to read, and is placed as a fresh agent is. An unbroken client would have
carried on counting. No mark can reach a record that holds nothing the double wrote; it is recorded, open, as
[`the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`](../the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md).

Pinned by:
- `apps/desktop/src/run-host/scripted-client.test.ts`: the four cases above, each failing on the unrepaired client; the
  six earlier cases (a fresh agent, a resumed child and root, a wait prefix and a failed call, a record longer than the
  script, a later iteration in one client) pass unchanged, their records carrying no marks.
- The built app, as root under Xvfb with Node 24 and another workflow on the host: the marks and the restated line reach
  the product's record (`call-<n>-s<ordinal>` ids in `part-j-proof`'s and `compression-proof`'s stores, the
  `Scripted steps taken` line in `compression-proof`'s), and the neighbours that resume, continue or compress —
  `part-j-proof` (the steer-at-rest root still holds three reads), `compression-proof`, `checkpoint-proof`,
  `mission-proof`, `part-h-proof`, `questions-proof`, `resilience-proof`, `plan-gate-proof`, `chat-controls-proof`,
  `transcript-proof` and `improvements-proof` — all exit 0 on the same build.

Not shown: no proof scenario resumes a root in a later iteration or resumes a compressed record, as the note said; the
unit cases are the pin for both readings.
