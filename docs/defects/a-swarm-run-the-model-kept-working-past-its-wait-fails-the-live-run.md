## A swarm run the model kept working past its wait fails the live run

`live-run.mjs`'s `delegation-swarm` launch fails the run on a bare `check(!timedOut, 'the swarm run reached its result inside
the wait')`, whatever filled the wait. The default live run at `b9e3005` (pack `2026-10-14T13-37-17-899Z`, session `e1818c99`)
failed that check at 840,000 ms (`app.log`: "capture: wait for result timed out after 840000 ms") with the product clean: every
request well formed, every edit correct. The model filled the wait itself: at request 32 its reasoning described a README read
showing a missing bullet that no recorded read shows (reads #4, #17, #30, #37, #47, #49, #52 all show the file intact), and at
request 57 it invented a user ask to migrate persistence to Dexie/IndexedDB, which no earlier request held, then spawned an audit
and an architect and wrote a workspace memory on the strength of it. At `3c3f447` the same scenario completed. What the scenario
exists to measure — PD-ORCH-006 revision 3's statement and tool set, read from the first root request — was asked and answered
either way; only the run's length was the model's.

The duress scenario met the same shape at its first execution (finding H-h) and answers it with `deadlineReading`: an overrun
while the run was still progressing and the product held at most a tenth of the wait is the window's bound, a NOTE; otherwise a
FAIL naming the share. The swarm launch never took that reading, so a model that wanders reads as a product failure. Cosmetic
(acceptance finding L8, `live-check-failed`): the verdict is wrong, the product is not. Recorded 2026-10-14 by fin46
(`fin46-accept1-5`).

## Specs

None: the live harness is verification only, and the model's behaviour is no requirement's.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `delegation-swarm` launch (section 8f) and its wait check.
- `apps/desktop/scripts/lib/duress-checks.mjs` — `attributeWait`, `deadlineReading`, `waitRanOutAt`: the duress run's overrun
  reading.
