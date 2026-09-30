## The scripted client counts only the steps a resumed record still shows

Since the repair of
[`the-scripted-client-restarts-its-script-for-every-run.md`](fixed/the-scripted-client-restarts-its-script-for-every-run.md),
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
