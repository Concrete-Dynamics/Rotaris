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
(`fin46-accept1-5`). *(As written 2026-10-14; repaired the same day, below.)*

**Outcome: repaired 2026-10-14 by fin46 (`fin46-accept1-5`).** The duress run's overrun reading now lives in one composed
reader, `overrunReading` (`apps/desktop/scripts/lib/duress-checks.mjs`): the launch's log (whether and when the wait ran out),
its recorded traffic and the session's tool calls, read through `attributeWait` and `deadlineReading`, whose `window` detail
now names the variable that widens the launch's wait. The `delegation-swarm` launch takes it with `LIVE_RUN_EDIT_WAIT_MS`: an
overrun while the run still progressed and the product held at most a tenth of the wait is a NOTE ("the swarm run was bounded
by the window, not by the product"); a run that stopped moving, a product that held more, or an overrun with no recorded
traffic still FAILS; a run inside the wait passes with where its time went. The duress launch reads through the same function,
unchanged in what it decides. The model's wandering itself is the model's and is not repaired. **Pinned by**
`apps/desktop/scripts/lib/duress-checks.test.ts` ("a launch's overrun is read from its pack"): the b9e3005 shape reads
`window` naming `LIVE_RUN_EDIT_WAIT_MS`, a run that stopped moving or was not recorded reads `product`, a log with no timed-out
line reads `inside`, and `live-run.mjs`'s swarm launch reads through it with no bare timed-out check (all four red before the
change). **Shown** two ways: the reading replayed over the b9e3005 pack itself (`delegation-swarm/app.log`,
`model-traffic.jsonl` and the pack's store, session `e1818c99`) answers `window` — 848 s of 840 s, the endpoint generating
838 s (99 %, 89 requests), the product with nothing in flight 2 s (0 %), the last request ending on its own 56 s before the
launch did, one request cut by the quit — where the old check failed; and a live run of the scenario on this branch
(`live-run.mjs --confirm --skip-build --only=delegation`, pack `2026-10-14T19-07-50-924Z`, the registered self-hosted default)
PASSED, the swarm run inside its wait: "218 s of 840 s: endpoint generating 212 s (97 %; 38 requests …), the product with
nothing in flight 1 s (0 %)", its strategy checks green and three admitted delegations.

## Specs

None: the live harness is verification only, and the model's behaviour is no requirement's.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `delegation-swarm` launch (section 8f) and its wait check.
- `apps/desktop/scripts/lib/duress-checks.mjs` — `attributeWait`, `deadlineReading`, `waitRanOutAt`: the duress run's overrun
  reading.
