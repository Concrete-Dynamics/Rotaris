## part-j-proof's queue launch types its queued prompt at a fixed appointment that a slow run start can follow

Seen by acceptance plan hrda's bundle `hrda-accept1-6` on 2026-11-04, twice in six `part-j-proof --skip-build` runs in
`C:/dev/Rotaris-wt-hrda-a1-6` (Windows 11 ARM64, Node 26.13.0; `origin/main` `a10ad853` plus the bundle's commits, which change
only the proofs' expectations, never the queue launch): at 20:48 UTC and 21:07 UTC, CPU at 100 % at each launch with
`C:/dev/Rotaris-wt-accept`'s Electron running beside it. The first launch of the suite failed:

```
the queued run did not complete two iterations: {"execution_status":"completed","iterations_completed":1,"todo":"… \"first task\" …"}
```

The store held no queued prompt at all (`queued_prompts` empty; the timeline `run_start`, `iteration_end`, `run_end`,
`notice`), and the application log orders the typed step against the run's start. In the 21:07 run the workspace opened 7.6 s
after the window loaded (`run host: opened … workspace.db` at 21:07:10.704), `capture: typed "and then this"` came at
21:07:12.966, and the session's first run-host line (`checkpoints: disabled for session 00d1bac4…`) only at 21:07:13.120: the
text was typed and submitted before the launch prompt's run had begun, so it was never a message "queued during the run"
(REQ-CHAT-040), and the run ended after its one iteration at 21:07:20.422. In the 20:48 run the typed step came during the run
(20:48:22.705, the run ending at 20:48:27.885) and the prompt was still not queued; the store of that run was replaced by the
next one before it was read, so what became of that text is not established.

`ROTARIS_CAPTURE_TYPE`'s step (`and then this>>composer@2200`) is an appointment on the main process's clock
(`apps/desktop/src/main/capture/seams.ts`), not a precondition: nothing waits for the run to be active before it types. The
other four runs met the queue launch. The same shape was repaired for the steer launch
(`docs/archive/defects/part-j-proofs-steer-launch-presses-steer-at-an-appointment-the-runs-start-can-miss.md`).

Not one of the known Windows readings the acceptance brief lists. Whether the 20:48 case is the product's (a prompt typed while
the run is active that is not queued) is not shown: the 21:07 case is the harness's appointment.

**Other reds of the same six runs**, each once, each before the pair stage and at the same load, listed here for the
acceptance round to triage rather than noted one by one: `steer-early` "did not open the dialog inside the settling send's
window: the text was typed before the reply was released" (20:59 UTC; `lib/steer-early.mjs` names that reading the proof's
own red); `steer` "did not press every step on its own control: … \"Steer the run\" never pressed, \"Steer\" never pressed"
(21:03 UTC, eight Electron processes of another tree at launch); and the queue launch's own store read failing
`SqliteError: disk I/O error` (`SQLITE_IOERR_TRUNCATE`) at `part-j-proof.mjs`'s `db.prepare` after the app had exited
(21:01 UTC). The first run's red (20:46 UTC) was `pause`'s known EPERM
(`docs/defects/part-j-proofs-pause-launch-is-refused-eperm-opening-its-workspace-store-on-windows.md`). The pair stage, run
alone from a scratch copy of the script, was green (the two-window note's outcome).

## Specs

REQ-CHAT-040 (a message submitted while a run is active is queued and consumed at the iteration boundary) is what the launch
reads; it contradicts none as far as the 21:07 reading goes, since the run was not yet active when the text arrived.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs` — scenario 1, `launch('queue', …, { ROTARIS_CAPTURE_TYPE: 'and then this>>composer@2200', … })`.
- `apps/desktop/src/main/capture/seams.ts` — `ROTARIS_CAPTURE_TYPE`, an appointment with no `@~` precondition form.
