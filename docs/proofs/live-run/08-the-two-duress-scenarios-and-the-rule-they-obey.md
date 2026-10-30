# `live-run` — The two duress scenarios, and the rule they obey

Part 8 of 12 of [the live-run record](../live-run.md), which indexes every part.

## The two duress scenarios, and the rule they obey

`terminal` and `duress` exist to enter one gap `docs/architecture/codebase.md` names: the live run "runs short
tasks against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command,
and no re-spawn**" — and all seven defects one hand-driven session found lived in exactly that gap.

**The rule both obey is from the same page: replay the shape the record names, never a plausible family
resembling it.** Sixty real-PTY runs at four geometries could not reproduce a concatenation the live run had
shown, because the trigger was an *empty write between two non-empty ones* and none of the sixty carried it.
Sixty negative runs are not a negative result when none of them carries the input that failed. So `terminal`
issues the recorded commands verbatim, and asserts from `tool_calls` — what the agent passed, what came back —
rather than from what the model says it did.

**One of the shapes is a NOTE, on purpose.** The pipe-to-shell deny fires exactly as `REQ-TOOLS-036/038`
specify; its note exists to measure what it costs, not to accuse the product. A shape the model never issued is
also a NOTE. Reporting a faithful behaviour as a fault is how a scenario teaches its reader to ignore it — the
mistake the board scenario made twice. The `FAILED`-marker shape was the second NOTE until 2026-09-27: it now
replays the record's own lower-case docker line and checks that `PD-TOOLS-003` keeps it from warning, as
`diff-exit-1` guards ESC-41 — a regression guard, not a cost note.

`duress` asserts **coherence, not correctness**: a long run's failures are mostly records disagreeing with each
other, and `apps/desktop/scripts/autopsy.mjs` already computes most of them. What the model produced is never
asserted — a weak model doing the work badly is a fact about the model. Whether the run was long *at all* is
reported rather than assumed, including a note when it stopped at `--max-iterations` and was therefore bounded
by the harness rather than by the work.

**Since 2026-10-13 its launch carries the `pendingLanes` trap of finding D8** (`scripts/lib/lanes-trap.mjs`, the instrument
`pnpm update-depth-proof` runs on the scripted provider): installed before the prompt and read every two minutes, it gives a
NOTE with the commits it counted, the high of React's simulated nested-update count against the 50 at which React throws
error 185, the fibers holding the pending work and the components the commit re-rendered, and every `rotaris-lanes-trap:` line
the console relay carried into `duress/app.log` (one at each new high from 10, and one at any update-depth error). A pack
whose `reactUpdateDepthErrors` is not 0 is read beside those lines.

**Since OQ-278's ruling (2026-10-13, R-072) both are checks, not NOTEs.** Every launch, not only `duress`, FAILS when a relayed
renderer console line names React's update-depth error (React error 185), naming each line ("<name>: no relayed renderer
console line names React's update-depth error (D8, OQ-278)"); and the `duress` launch FAILS when its trap did not install or
its `rotaris-lanes-trap: installed` line did not reach `duress/app.log` through the console relay. What the trap saw stays a
NOTE. The first guarded duress pack is the D8 note's closing evidence under `docs/defects/README.md`'s rule for a note that was
never reproduced: trap installed and relayed, and `reactUpdateDepthErrors` 0 on every launch. *That pack came on 2026-10-14 at
`a3be56c` (duress `2026-10-14T05-15-42-589Z`: 78,343 commits, high 11 of 50, 0 errors; default `2026-10-14T04-30-51-088Z`: 0 on all
24 launches), and the note closed under the guard (`docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`);
both checks stay, and a recurrence opens a new note.*

**Its length comes from the work asked for, not from the fixture's weight** — ruled 2026-09-22, when a larger
fixture was considered and not taken. A five-file repository and a five-hundred-file one delegate exactly as
much as the prompt commissions, and a second fixture is a second tree to keep in step with five other
scenarios' prompts. So the prompt is **three dependent waves** — three children, then two that reconcile what
the three produced, then one that verifies all of it — because the parent's conversation grows monotonically
across waves, which is what reaches compression and re-spawn. A single wave of parallel children finishes in
minutes and measures the short path under a longer deadline. `--duress-fixture` remains for the question that
is about size specifically.

The shapes and the readers (`diagnosticOf`, `longOutputReading`, `outputOf`, `hereStringLinesReturned`, `unexpandableReading`, `replacedShellReading`) live in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned by
`terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check in the
scenario into "never attempted" without anybody being told, so the test asserts the round trip in both
directions: every shape matches its own command, and none matches another's. Each shape is read from the first send that
reached execution (`shapeSends`, `reachedShape`): a send REQ-ORCH-029's todo gate or the schema check refused before it ran
(`todo_list_owed`, `invalid_request`) is counted beside the shape in the "what the model attempted" NOTE and never read, a
shape whose every send was refused is a NOTE ("not reached: refused at the todo gate"), and a permission block is read, since
`pipe-to-shell` is measured by it (fin40; the confirming run at 0bc3eee failed "all 40 lines" by reading the refused send,
`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`).

**`terminal` was executed against a real endpoint on 2026-09-22 and every check passed**: all six shapes were
issued, the here-string terminated, forty distinct lines arrived with none concatenated and no escape sequence
surviving, `git diff` exiting 1 read as `outcome success` rather than `shell_failure` — ESC-41's carve-out
proven live on the same machine whose unit test for it is red for an unrelated timeout — and no `__rot_` marker
reached the model. One shape did not reach its question: the wedge **soft-paused before the hard cap**, so
`hardMs`'s own bound is still unmeasured live, and the scenario says so rather than implying otherwise.
**The `failed-word` guard has not run against a real endpoint**: it was written on 2026-09-27, after that run,
and the next live run of `terminal` is its first.

~~**`duress` has not been executed.** It owes its row in `docs/architecture/first-executions.md`.~~ **`duress` was
executed against a real endpoint on 2026-09-29** (pack `.live-run/runs/2026-09-29T03-06-14-929Z`; its row is in
`docs/architecture/first-executions.md`): eight children commissioned, 309 tool calls, and two checks failed. The deadline
check is genuine — 2,406 s of 2,400 s, about 98 % of it the endpoint generating — and the "failed with nothing to say"
check is the harness's false positive on a child cut off with a continuation offer. What the run let through is recorded
as notes in `docs/defects/` carrying "Live-run finding: D…" and "H-…" lines.

**Five of the scenario's own readings were wrong on that run, and were repaired on 2026-09-29 (R-067).** They now live in
`apps/desktop/scripts/lib/duress-checks.mjs`, pinned by `duress-checks.test.ts` against the recorded shapes, and in the
autopsy reader's null-summary line (`lib/autopsy-coherence.mjs`). A cut-off child's `last_response` and `cut_off` are
something to say (H-a); an error entry alone is not, because the product writes one on every failed child (corrected
2026-09-30 in the verifier's fix round 1, where the first repair had counted it and so passed the eighty-second defect's
shape). A child's terminal calls are found under its canonical name, the one `tool_calls`
records (H-b). A session that never stopped answers `unasked`, a NOTE, where it used to pass (H-c). A run that never
compressed names its largest prompt against the REQ-CONFIG-134 trigger rather than its iteration count (H-d). And the
deadline check says **where the time went** (H-h): endpoint, tools alone, launch, and the product with nothing in flight,
each from the traffic and the store. The notes are in `docs/defects/fixed/`. **Run again on 2026-09-30** (pack
`.live-run/runs/2026-09-30T05-29-56-712Z`, `katalyst`), the repaired checks read as they claim: the overrun was a NOTE
(2,406 s of 2,400 s, 99 % the endpoint generating, 1 s of the product with nothing in flight); the session came to rest
`paused`, `application_shutdown`, with its summary, so the null-summary question was asked and passed; no child
failed; the no-compression note named a largest prompt of 77,043 tokens against a trigger of 157,286; and the prompt
arrived with its line breaks (H-e). The commands question, asked at last, **failed falsely once more**: `f`, paused by
the deadline quit after 26 terminal calls, had no report yet. It is now asked only of a child with a report, and
an unsettled one is a NOTE — replayed over that pack, `b` is asked (6 commands) and `f` is noted. **Run a third time
the same day, after the verifier's fix round 1** (pack `.live-run/runs/2026-09-30T06-33-14-401Z`), the scenario
**passed**: the overrun a NOTE naming the one request the quit cut off (the last to end on its own 68 s before the
launch did), a cut-off child (`w2d`, `last_response` and `cut_off`) met live and not counted silent, the commands
question asked of the one settled child that ran commands and the paused `w3` noted.

**`LIVE_RUN_DURESS_MS` — the default stays 40 minutes, and the check says when the window was the bound (decided
2026-09-29).** The figure is the owner's of 2026-09-22, taken for this endpoint, and a harness repair does not reverse it.
What the first execution falsified was the check's reading, not the figure: 2,406 s of 2,400 s was a FAIL, and replayed
through the attribution it reads 99 % endpoint generating (200 requests, 178,627 reasoning tokens), 6 s of tools alone,
5 s of launch, 3 s of the product with nothing in flight, and a request ending 2 s before the quit. A verdict that
blames the product for the endpoint's throughput teaches its reader to ignore it (the rule above), so an overrun in
which the run was still progressing (the last request or tool call **to end on its own** ended within 120 s of the
launch's end) and the product had nothing in flight for at most a tenth of the wait is a **NOTE, "bounded by the window,
not by the product"**. "On its own" is a request the endpoint completed, or anything that ended before the instant the
wait ran out (the seam's timed-out line): a request the quit cut off ends at the quit whatever it was doing, and the
first form of this reading let a stream hung from early in the wait pass as progress (corrected 2026-09-30, the
verifier's fix round 1); such a request is named in the detail instead. The four figures are **occupancy, not a
critical path**: a request open while the run's next step waits on something else still counts to the endpoint. Any other overrun, or one with no traffic to attribute, stays a FAIL naming the shares. To ask for the
result on a reasoning endpoint like `katalyst`, give the run the time: `LIVE_RUN_DURESS_MS=5400000`, for example (90 minutes; the first
execution on `katalyst` was still in its third wave at 40, and the launch's own bound is the wait plus 180 s, so a
`timeout` around the command must sit above that).

**`LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` — duress launches with the Per-agent timeout at 45 minutes (OQ-214, reopened and
ruled again 2026-10-07 under R-072).** The duress run at `a68f121` cut a verifier and its continuation off at the product's
1200 s while each worked on its own task (finding D2), meeting OQ-214's reopening condition (a). The ruling keeps the
ceiling, the 30 s landing and "continued once, never chained", and takes the relief its earlier ruling counts on:
PD-CONFIG-003's Per-agent timeout, which the harness sets for the duress launch alone as a user on a slow reasoning model
would, writing `runtime.child_timeout: <min×60>` into the workspace's `agents.yaml` (`lib/runtime-key.mjs`, the stored value
Save writes) and restoring it after. Whole minutes from 1 to 240, the control's range; anything else stops the harness
before any launch. `=20` measures the product's default. Every other scenario keeps 1200 s. A pass at a raised limit is
never a pass at the default: the NOTE says which it was. With the children's limit raised the run needs more time: on a
reasoning endpoint like `katalyst` run it with `LIVE_RUN_DURESS_MS=7800000` (130 minutes; at `a68f121` wave three began
about 1,550 s in, and a 45-minute life cut off, its continuation and both summaries take about 5,700 s more) under a
`timeout` above the wait plus 180 s. An overrun while the run is still progressing stays a NOTE.

**The traffic is recorded through a loopback proxy**, so the sandbox's `base_url` is the proxy and the endpoint
is one hop further on. Two consequences worth knowing before reading a pack: a `model request POST` line in
`app.log` names the proxy rather than the endpoint, and it is `model-traffic.jsonl` that says the call reached
the endpoint and what it answered. The proxy forwards chunks as they arrive and buffers nothing — a streamed
completion reaches the product exactly as the endpoint sent it, which
`apps/desktop/scripts/lib/model-traffic.test.ts` pins with a case that fails if it ever stops being true.
`--no-record-traffic` takes the proxy out of the path for the run where the proxy itself is the suspect.
Credentials never reach the file: `authorization` and the api-key spellings are replaced before it is written,
and the live run asserts that in `ask`.

The sandbox holds a **real credential** — the app writes the leased key into its own store, as it would on the
owner's machine — so the credential directory is deleted on every exit path there is: the normal end, `--keep`,
a thrown error, and a Ctrl-C. `--keep` keeps the workspace and the store to read and marks the directory `KEPT`;
the next run sweeps every unmarked leftover, and takes the credentials out of the marked ones too. Live runs may
**overlap** on one host: each writes `OWNER` (its pid and start) into its sandbox as it makes it, and the sweep leaves
a sandbox whose owner is still running — its key included — and one with no `OWNER` for twelve hours
(`apps/desktop/scripts/lib/sandbox-sweep.mjs`;
[fixed](../../defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md)).
