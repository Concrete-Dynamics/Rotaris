## transcript-proof's append comparison goes red under host load, and records no load to tell it by

`pnpm transcript-proof`'s append stage compares the shown-update time of appends at 1,200 rows with an empty transcript
(REQ-CHAT-055's append clause). Each side is two launches, alternating empty and loaded (`APPEND_LAUNCHES = 2`), and the
verdict is that the loaded side's median is at most the empty side's median plus one measured frame (about 17 ms). With so
few launches, one launch that lands in a burst of other work on the host moves its side's median by two frames or more, and
the comparison goes red on the host rather than on the product.

The verifiers of fin4 recorded reds of 164.1 against 130.0 ms (load average 14.7), 110.1 against 90.9 ms (5 to 7) and 175.9
against 135.6 ms (5.9 to 6.6), all on 4 CPUs with the other plan's proofs running. In the second, the loaded launches had no
changed delivery, so they ran none of the code fin4's hold added
([the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md](the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md)).
An earlier whole run went red at 103.45 against 53.8 ms (load 5 to 6), and the next run, taken at once, passed.

The stage records no host load, so a red cannot be told apart from a regression by its own evidence: `append.json` holds
the samples, the frame cadence and the verdict, and nothing about what else the host was doing. `terminal-proof` has
recorded `os.loadavg()` and the CPU count beside its echo reading since fin4, and the host's rule is that a red above the
CPU count is re-run alone (`.agents/skills/orchestrated-build/references/environment.md`, "Load").

Seen by the verifiers of plan fin4 (2026-10-02) and triaged in the fourth triage of open notes as an observation with no
note; recorded here before any repair.

## Specs

- REQ-CHAT-055: "appending a row MUST cost no more than it does on an empty transcript". The product is not shown to break
  it; the proof that is its evidence goes red on host load and cannot say so.
- REQ-CHAT-157: the budgets are "measured on the machine under test". Whether the clause holds on a host whose CPUs other
  processes oversubscribe is the same question OQ-176 asks of REQ-SHELL-166's echo; this note does not rule it.

## Relevant files

- `apps/desktop/scripts/transcript-proof.mjs`: `APPEND_LAUNCHES`, `appendRun` (no load recorded), the alternating launches
  and the verdict (loaded median at most empty median plus one measured frame), and where the verdict is enforced.
- `docs/architecture/adr/0045-what-paints-the-transcript.md`: the measurement point under a burst and its later rounds.

## Outcome (2026-10-02, fin7, repaired in the proof)

The append stage now records the host's load beside each launch and judges a red taken above the CPU count once more. Each
launch carries `host: { start, end }`, the one, five and fifteen minute load averages (`os.loadavg()`) and the CPU count
(`os.availableParallelism()`), at its start and its end. `append.json` keeps them per launch (`sets.first.launches`), and
the verdict prints them: the line `append (REQ-CHAT-055): … load average 0.78 to 2.56 on 4 CPUs` on a pass and the same
words in a red's message. When the verdict is red and any launch of the set ran at a one-minute load average above the CPU
count, the four alternating launches run once more (`append-empty-rerun-1` …) and the verdict is judged on that second
set. Both sets are kept in `append.json` (`sets.first` with its figures, `sets.rerun` with the call that took it), and the
verdict's words name the re-run and the first set's load. The slack (one measured frame) and the statistic (the medians)
are unchanged. A red with no launch above the CPU count stands, and so does a red on the second set, whatever its load.
Each side's launches append to one session of their own (`S0` empty, `S1200` loaded), so the re-run's "empty" launches
start from the rows the first set's empty launches appended (some sixty), not from none; the first set's second empty
launch already starts from the rows its first empty launch appended. That leans
the "empty" side toward the loaded one, and so toward a pass, by the cost of those rows; it was so before this repair and
the re-run adds no new kind of it.

The decision lives in `apps/desktop/scripts/transcript-proof/append-rerun.mjs`, beside the script rather than in
`lib/` (another plan's area this round), so that it has a test of its own: `append-rerun.test.ts`, six cases (the load
reading, a launch above the CPU count at its start or its end, a red re-run and judged on the second set with both kept, a
red at or below the CPU count standing with no re-run, a pass never re-run, and one re-run only). The script does the
launching (`appendSet`, `judgeAppendSet`).

**No regression from fin4's delivery hold.** Before relying on the re-run, `transcript-proof --skip-build --only=append`
was alternated between this branch's build (origin/main dc796f5's product) and f2bddcf's (the commit before fin4's
render-under-load merge, 9f8d31b's first parent), three runs each, the same script on both, as root under Xvfb, Node 24,
the other plan's agents on the host:

| Run | Build | Load average at the launches (4 CPUs) | Every update, loaded / empty (ms) | Difference | Row appends, loaded / empty (ms) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | dc796f5 | 0.78 to 2.56 | 102.1 / 108.8 | −6.7 | 95.35 / 105.3 | pass |
| 1 | f2bddcf | 0.64 to 2.33 | 124 / 127 | −3 | 112.15 / 123.95 | pass |
| 2 | dc796f5 | 1.9 to 2.86 | 86.95 / 106.95 | −20 | 77.3 / 104.6 | pass |
| 2 | f2bddcf | 3.82 to 4.78 | 171.95 / 155.55 | +16.4 | 165.55 / 151.05 | pass |
| 3 | dc796f5 | 3.04 to 3.68 | 78.45 / 101.2 | −22.75 | 70.75 / 98.65 | pass |
| 3 | f2bddcf | 1.75 to 3.52 | 126.6 / 127.4 | −0.8 | 122.4 / 122.3 | pass |

Sixty-two pooled samples a side in every run; the slack was 16.7 ms in all six. Every comparison passed, and the build
with the hold read the loaded side lower than the build without it in all three pairs, so the reds this note records are
not the hold's. (Two of the three f2bddcf runs exited red after the comparison, on the ResizeObserver loop line that build
still has and fin4 repaired; the append verdict is read from `append.json`, written before that check.)

Not shown: a live re-run. No run here went red, so the re-run path ran only in its test; a run beside added CPU-bound loops,
which would have exercised it, was not taken because launching them was refused by the session's permission system.
