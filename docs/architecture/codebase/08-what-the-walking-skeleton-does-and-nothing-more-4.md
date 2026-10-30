# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more (continued)

Part 8 of 22 of [the codebase record](../codebase.md), which indexes every part.

**The five decisions this scenario was held on were taken on 2026-09-22**, four by the owner and one delegated:
the endpoint is the unmetered `katalyst`, the wall clock is **40 minutes** (*2026-09-29: the first execution overran it
by 6 s with the endpoint generating for 99 % of the wait; the figure stands, and an overrun the endpoint held while
the run progressed is now reported as the window's bound, a NOTE — `docs/proofs/live-run.md`, "`LIVE_RUN_DURESS_MS`"*), it stays **opt-in**, its assertions
stay coherence-shaped, and **`--max-iterations` rises from 15 to 500**. That last one is a bound being loosened
and is recorded as such. Fifteen was a bound while every scenario here was a short task; the long run turned it
into the thing being measured — a delegating run reaches 15 while it is still commissioning and then reports its
own ceiling as a result about the product. The accounting gate between scenarios still holds and so do
`--budget` and `--max-tokens`; what no longer holds is a tight bound **within** one run, which is why the raise
is safe on the unmetered endpoint it was made for and worth naming explicitly on one that charges. The fixture
was the delegated decision and the ruling was **not** to add a larger tree: a five-file repository and a
five-hundred-file one delegate exactly as much as the prompt commissions, and a second fixture is a second tree
to keep in step with five other scenarios' prompts. The length comes from **three dependent waves** instead —
three children, two reconciling what they produced, one verifying all of it — under which the parent's
conversation grows monotonically, which is what reaches compression and re-spawn. A single wave of parallel
children finishes in minutes and measures the short path under a longer deadline.

**`faults` and `terminal` were first executed on 2026-09-22 and the product answered every question they were
built to ask** — the row is in `first-executions.md`. The stall was noticed by the idle bound at **120.5 s**,
classified `transient_llm_error` and retried, which is the **first live evidence that the eighty-second
defect's repair holds**; `git diff` exiting 1 read as `outcome success`, which is **ESC-41's carve-out proven
live** on the same machine whose unit test for it is red for an unrelated timeout. What was wrong was the
harness, twice. The stalled call's record was written only on release and the product recovered first, so the
one call the scenario exists for was the one call missing from the pack
(`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`). And
`stop_reason !== 'user_cancelled'` passes just as well on a run that met no fault at all, so it now carries a
positive half read from the product's own `issues` table — the stall must be shown to have been noticed, and
what it was classified as must not be fatal. Two smaller ones: the wedge **soft-paused before the hard cap**,
so `hardMs`'s own question is still unmeasured live and now says so (*corrected 2026-10-13, fin42: a silent wedge can never
reach the cap, since the 30 s soft pause comes first; the `steady` shape that prints past 100 s asks it, and
`pnpm tool-shapes-proof` reached it in the built app*); and `duress`'s `zero cost with tokens`
check would have reported a fault on an unmetered endpoint that has no cost to record, so it is conditioned on
the accounting kind — caught before the forty-minute scenario was run rather than after. *Corrected 2026-09-29 (live-run
finding K2(b)): the condition is gone. The reader was wrong, not the endpoint: `autopsy.mjs` now reads the session's
`cost_qualifier` and answers `false` where no request had a figure (`scripts/lib/autopsy-coherence.mjs`), and `duress`
asks the question unconditionally.* ~~`duress` has not been
executed; it owes its row.~~ *`duress` was executed on 2026-09-29 and has its row in `first-executions.md`.*

**What the board's live path found on its first execution — 2026-09-11, and the eighty-first defect.** The fifth
scenario was written after a hand-driven precursor took the same path, and the precursor is what found the defect;
the scenario passed 21 checks at once and found nothing of its own. **The eighty-first: a requirement store whose
every document the engine REJECTED read exactly like a store nobody had written to.** `RequirementsView` decided its
body state from the card count alone, so a configured source with no cards printed `EMPTY_STORE_SENTENCE` — "holds no
requirement documents yet" — and named nothing, while `BoardProjection.parseErrors` had carried the engine's own
errors the whole time and the no-source branch two lines above was already rendering them. The fix is `bodyStateOf`
in the board's pure model (REQ-TRACE-380), a fourth stated state for a store that will not parse, and — the same
defect in its quieter form — a stated count and error list when the store parses only in PART, since REQ-TRACE-026
drops each rejected document silently and a board missing a requirement looks exactly like a board that has them all.
**Why it hid is the finding, and it is the fixture's fault rather than the board's:** `fixtures/todo-app` shipped
`req-id: REQ-TODO-001..003`, which REQ-TRACE-022 does not admit as identifiers at all, and no check ever noticed
because the live run reads those documents only as **prose** for the agent — the one surface that parses them is the
board, and until this scenario existed the board had never been pointed at that workspace. The store is renumbered to
an epic and four children; the live run's fixture section (`docs/proofs/live-run.md`) now states both constraints as load-bearing.
**`REQ-TRACE-515` was minted for this on 2026-09-11**, because the board's obligation here was inferred from a field
the projection already carried and was stated nowhere — which is exactly why the build satisfied it in the no-source
branch and not in the other; the round is recorded in `docs/spec/resolutions/08-requirements-traceability.md`. **The tally
stands at eighty-one.** The precursor also produced two *harness* mistakes worth keeping separate from it: it read
transcript tool rows as `kind = 'tool_call'` where they are `kind = 'tool'`, and it asserted an elevation disclosure
in a sandbox that opts in to unattended work, where REQ-TRACE-474 requires there to be none.

**A third harness mistake in the same scenario, found 2026-09-13 and repaired the same day: it pressed the review
decision on a clock.** The four presses after the release fired at offsets measured from the end of
`LIVE_RUN_BOARD_MS`, whatever the board happened to be showing by then. Against `qwen3.8-flash-next` — the model the
endpoint now serves, and the one `--no-discover-model` no longer hides — 240 s expired with the board-started run
about half-way through, and **one timing failure became three**, two of which accused the product of faults it had
not committed: "the card rests in running", "the history lacks the accept". Both were true statements about a card
that accept had been pressed at while it was still running, which the board had correctly declined to move. Re-running
the one scenario at 900 s with nothing else changed passed every check, which is how the harness was shown to be the
wrong one — the live run's standing rule (`docs/proofs/live-run.md`) is to believe the harness first, and that rule is what makes a harness that
manufactures false product symptoms expensive rather than merely annoying.

The repair is the one the scenario's own comment now carries: **nothing it presses is pressed on a clock.** The
`selector@~ms` deadline that clicks already had was extended to `ROTARIS_CAPTURE_KEYS` (`Return>>selector@~ms`,
because Enter opens the *focused* card under REQ-TRACE-484 and means nothing before the click has landed) and to
`ROTARIS_CAPTURE_EVAL_AT` (`expression>>selector@~ms`, because a read of what something left behind has a
precondition, while a read that watches a value *change* wants the appointment and keeps the plain form). A third
form, `ROTARIS_CAPTURE_WAIT=js:<expression>`, ends the capture when the accept lands rather than at the far end of
the window — so the deadline became a bound that a quick model does not pay, where the old shape always cost
`window + 17 s`. An expiry is now **one** failure, and the presses never made are noted with what each wait did
rather than reported as evidence about the board. The note is
a defect note (removed once repaired); it stays, with its repair recorded in it.

**The first repair was itself wrong, and the live run caught it before it landed** — kept beside its replacement
because it sharpens the finding. Enter was gated on `[data-req-card="REQ-104"]:focus`, which matched **63 ms into
the run**, because the opening click focuses the card: Enter opened the detail at 3 s, the Review control appeared,
and the press waiting for that control opened a review pane over a card that had not been released. The board work
itself was sound in that run — the card reached `review` in 520 s, `completedCount` was exported, the worktree's
suite was green — and the scenario still failed. **A state-driven press aimed at a state that is also true before
the thing it waits for is no better than a clock, and is harder to see**, because the clock at least fails visibly.
The gate became `[data-req-card="REQ-104"][data-column="review"]:focus`, which cannot hold before the release.

**A measured negative, kept so it is not re-attempted: turning `code_intelligence` OFF makes the board scenario
slower, not faster.** The scenario costs six to thirteen minutes against this endpoint, nearly all of it the model's
own loop, and the spread between two runs of identical code had looked like the symbol server's doing — seven tool
names and 153 k input tokens in six minutes where the agent stayed off it, seventeen and 291 k in 12.9 minutes where
it did not, including three `*_memory` calls over a workspace deleted at the end. A `--lean` flag disabling the one
shipped-enabled server (REQ-MCP-010) was built to test that reading and **falsified it on the first run**: without
the symbol server the agent brute-forces the same task with `read_file` 44 times, `terminal` 41 and `grep` 37 —
**144 tool calls and no review at all** inside the 900 s deadline, against 7 to 17 calls when it has the server. The
flag was discarded rather than merged. Removing a capability does not remove the work; it moves it into more, cheaper
round trips, and round trips are what the wall clock measures. Harness iteration belongs in
`pnpm requirements-runs-proof`, which drives the real delivery service, traceability engine, store and Git helper
with only the run host scripted and no model at all.

That failing run is also the repair above proving itself under the exact condition that produced the defect: **one**
failure for the expiry — "the window expired with the card where the trail leaves it" — and a `NOTE` reading "the
review was never offered, so the accept was not pressed — review control: expired; decision: expired; confirmation:
expired". No accusation against the board, where the old shape would have manufactured two.

**What an owner's own run found — 2026-09-12, and the seven defects eighty-two to eighty-eight.** Not a harness
and not a scenario: a 22-minute run in a scratch workspace, twelve children, 226 tool calls, 686k tokens, stopped
by hand because it was going in circles. It commissioned the same architecture design three times and produced
seven markdown files and no code. Reading the session store afterwards found seven defects, and the reason it
found them where 26 green live-run checks had not is worth stating plainly: `pnpm live-run` runs short tasks
against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command, and no
re-spawn**. Every one of the seven lived in exactly that gap.

**The eighty-second, and the one that explains the circling: a model timeout reported itself as a user abort.**
`AbortSignal.any([req.signal, timeoutSignal])` merged the two, and both failure paths collapsed them into
`fromError`'s single `aborted` flag, which returns `code: 'aborted'` unconditionally. `classifyFailure` reads
that as *the run is stopping* and returns `fatal` — no retry, no wait, no same-tier fallback, and the streamed
text discarded. Four of eleven children died that way with an empty `final_response`, each **125.2, 125.5 and
125.6 s** after its last tool call: `model_timeout` at 120 s plus report assembly. Two things were wrong, not
one. The class is now decided by **which** signal fired, and the bound is an **idle** bound re-armed on every
part, because REQ-CONFIG-115 fixes "the model HTTP timeout" and applying it to total stream duration means no
answer longer than two minutes can ever complete. ADR-0027's fourth execution has it. **A reading falsified in
the brief this was built from, kept here:** the `catch` path was described as already correct because it read
`req.signal.aborted || timeoutSignal.aborted`; that expression is precisely the collapse, and the thrown path
was as wrong as the streamed one.

**Eighty-three to eighty-six, all in the terminal, all in ADR-0020's note.** `hardMs` was passed by `index.ts`
and read nowhere in the repository, so a foreground call that supplied no `timeout` had the soft pause and **no
hard cap at all** — REQ-TOOLS-097 requires both bounds with the first to fire governing. An `as` cast on the
same line is what stripped the excess-property check `tsc` would have failed on. Two commands sat wedged for
68 s and 49 s and were killed by hand while the diagnostic reported `timeout_seconds: 100`. A multi-line command
lost its newlines in the PTY, so a here-string never terminated; carrying it needs the payload sent whole, and
**the approved shape was falsified twice by measurement** — `&` runs it in a child scope, and neither `&` nor
dot-sourcing propagates `$?`, so the marker protocol gained a nonce-named `$global:<end>_ok` and consequence 1's
forgery argument is unchanged. The capture was VT-stripped where ADR-0020's own words had said the ADR-0021
emulator would land with streaming; it landed for the live stream in Part AL and the agent's capture was left
behind, so the terminal window and the agent read different renderings of the same bytes. And the end marker
leaked into what the model read — `Property : __rot_…_e:0`, verbatim — because detection matched it **unanchored**
while removal matched it **anchored**, the sibling of the seventh first-execution defect on the removal side.

**The strongest finding of the day is not any of the seven; it is how the fourth was nearly mis-attributed.**
Sixty real-PTY runs at four geometries could not reproduce the concatenation the run showed, and the conclusion
drawn was that the evidence belonged to the newline fold instead. The store falsifies that without a shell:
ordinals 193 and 200 are **503 and 385 characters on one line**, so the fold cannot reach them. The trigger the
sixty missed is narrow — an **empty write between two non-empty ones** — present in both production commands and
in none of the sixty. Reproduced against the unfixed strip it returns the production strings byte for byte.
**Sixty negative runs are not a negative result when none of them carries the input that failed**, and the
reproduction was owed to the recorded command rather than to a plausible family resembling it.

**Eighty-seven and eighty-eight, the record describing a run that did not happen.** The session `compressions`
aggregate was declared, rehydrated and copied into every save, and nothing ever added to it — three
`context_compressed` entries against a persisted `0`, while REQ-MONITOR-086's per-agent counter said three
(REQ-SESSION-139, ADR-0008). And the child report hardcoded `commands: []` at all three construction sites and
took `edited_files` from whatever the summarising model wrote: the child that wrote five files and ran eight
commands reported neither, another reported a prose sentence where the schema asks for paths. Both are now
derived from the transcript the report is built from. **The bound on that, stated rather than hidden:** a
compression replaces the conversation (REQ-MONITOR-084), so a child compressed mid-task no longer carries its
earliest calls, and the derived lists are of what survives. **And nothing yet reads `report.commands`** — the
field is correct and no surface shows it.

**Why the tests did not catch four of the seven, which is one shape repeated.** A test asserted the mechanism in
the single configuration where it worked. REQ-TOOLS-097's hard timeout had a passing test that supplied an
explicit `timeout` — the path where the timer *is* armed — while the no-timeout test asserted only the soft
pause, so the requirement's actual claim, *whichever bound is reached first*, was never tested. `Aggregates`
rehydrated `compressions: 0` and asserted `0` came back, an assertion that could only ever see zero. `report.ts`
had no test file at all. And `ai-sdk-client.test.ts` aborted only the caller's signal. **A further trap, recorded
because it would have produced a green suite over a broken build:** `FakeClock` cannot be used for the timeout
tests, since `AbortSignal.timeout` reads the platform clock and a controlled clock makes both new tests pass
against the unfixed code. They read real time under a 300 ms bound. **The tally stands at eighty-eight.**

**Verified on merged main** (`76e3667`): the symbol generator unchanged at 4,399 identifiers, `tsc --noEmit`
green, `eslint` and `check-line-endings` green, the suite at **1,532 passed and 25 skipped** with one red —
`mcp.test.ts`'s stderr capture, which passes alone and whose own fixed 400 ms wait for a spawned child is the
same class of defect as the three terminal time-guesses this work hardened. The baseline before the merges
failed **four** under the same load; three of them were those terminal tests and are now stable. Each of the
seven fixes was checked by reverting its source against its new test and reading the red, rather than by
trusting the report that it had been.

**That last red, closed the same way, and this time the failure itself was reproduced (2026-09-12).**
`mcp.test.ts`'s stderr capture started a second Node process, slept a fixed **400 ms**, and then read the log. The
arrival was measured rather than guessed: **61, 68 and 93 ms** with that file alone, **239 ms** under the full suite —
**161 ms of margin**, the same knife edge the resilience probes sat on — and **446 and 472 ms** under the suite with
eight cores deliberately busy, which is past the bound. Under sixteen busy cores the unfixed test fails verbatim as the
sweep saw it, `AssertionError: expected undefined to be defined`, and the deadline form passes on the same machine in
the same minute with the line arriving at 446 ms. A module-level `until(hit, boundMs = 10_000)` now polls every 25 ms
and returns the milliseconds waited, or `null` at the bound, so the assertion that follows fails for its own reason and
says how long it gave. `pnpm check` is green with **nothing red**, which it had not been. **What the sweep found
beside it:** with eight cores busy, `checkpoints.test.ts` blew vitest's own 30 s `testTimeout` doing real Git work —
a load artifact of that measurement, not an appointment, and it did not recur unloaded. Two fixed sleeps of the same
shape remain and are named here rather than changed under this commit: `terminal.test.ts:230` (3,500 ms) and
`streams.test.ts:392` (2,300 ms), both waiting on a real PTY; `streams.test.ts` already carries the `until` helper
they want, at its line 313 (both lines as of 2026-09-28, R-062).

**What `pnpm overview-proof` does.** It builds Electron and carries one scratch profile across four launches against
a scratch Git repository it creates (one commit, one untracked file): (1) a fresh launch — Overview is the first view
painted, the onboarding empty state, the repository read logged with its time; (1b) the same with `PATH` emptied of
Git — the reads end in the empty state and no dialog; (2) a scripted run whose first model call waits 21 s
(`wait:<ms>`, three sample periods), delegates one child and reads a file, driven from the Workspace view with the
Overview read afterwards through `ROTARIS_CAPTURE_END_VIEW` and `ROTARIS_CAPTURE_PROBE` — the header, the tokens card
against the store, the sparkline's sample count, the cost qualifier, the tool chips against `tool_calls`, the agents
caption against the ledger and the configured caps, the branch, the session row with its duration and focused
marker; (3) a relaunch — the samples identical and a pane split written to the preference store restored. Evidence
under `.proof/overview-proof/`. On 2026-09-05 it passed once the start-time read was corrected (entry 19).

**What `pnpm fetch-proof` does.** It builds Electron, starts a `node:http` server on 127.0.0.1 that records every
request path, and launches the app seven times against a scratch workspace whose `agents.yaml` it rewrites between
launches, each run scripted `fetch:<url>,answer`: `/ok` under `autonomous`; the same under `ask` with zero approval
requests; `/redirect` (302 to `localhost`, a different host name) refused, then followed once `localhost` is
allow-listed; `127.0.0.1` denied so the server sees nothing; `/404` as `http_error` with the body; `/slow` under a
one-second `tool_call_timeout`. The tool row's observation is read from `tool_calls`; the per-call policy read's cost
from the run host's log. Evidence under `.proof/fetch-proof/`.

**What `pnpm git-proof` does.** It builds Electron, makes a scratch repository with a local bare remote (one commit
ahead, so a local-tinted row and `ahead 1` exist) and a `.gitignore` holding `.rotaris/`, and launches the app seven
times: the Git view painted (header, the one worktree row with its markers, three history rows, the checkpoints
card's sentence, the strip, the divider moved by keyboard and written to `panels/git`); a worktree created through
the dialog beside the workspace; an isolated session started through the launch dialog whose scripted `write_file`
lands in `.rotaris/worktrees/<sid>` and not in the base; the manual worktree deleted through the two-step confirm
against Git's real refusal; a relaunch restoring the split; `PATH` without Git (the empty header, the notice, no
dialog); a plain folder in the OS temp directory (no notice). Since 2026-10-04 (fin14) the isolated launch and the
worktree-ahead launch also measure every heading and body cell of the worktree table (`scripts/lib/cell-paint.mjs`) at
1440×900, and the worktree-ahead launch again resized to the 1000×680 minimum (`worktree-ahead-minimum.png`): no run may
paint past its cell or be cut outside Branch and Session, and the base row's `main` is drawn whole at 1440×900 — the State
column is measured to its widest phrase over a `10ch` floor (`stateColumnFit`, REQ-GIT-109). Since 2026-10-04 (fin16)
the worktree-ahead launch also requires the bound row among the rows measured at both sizes, and a launch `presented`
(3c) persists the session as `paused_message_limit` while the app is closed and reads `paused · ready` in the bound row's
State cell — the presented status, never the persisted word (`statePhrase` through `presentationStatus`,
REQ-NOTIFY-048/049). The same day (fin16) every row's Branch cell, at each size those launches measure, must draw at least
its name's first character with the marker, lay out no tag past the cell's edge, and span its row's height (the line is
a flex box inside the cell, and the Branch column keeps the widest line with the name at its `2ch` floor and its tags
whole — `branchLineFloor`, `--git-branch-fit`); the base row drew neither `main` nor `active` at 1000×680 before.
Since 2026-10-04 (fin17) a name the cell cuts must be cut by its own box's `text-overflow: ellipsis` over a cut it can
mark (`runMarksElision`; the room check alone, `runShowsLeadingChars`, passed a name sliced off with no marker), and both
fits are measured again when a row's path changes (`branchFitKey`, `stateFitKey`), since the row is keyed by it.
Since 2026-10-06 (fin22) launch 6c, `unborn-branch`, opens a fresh `git init` outside the repository and requires the
strip's branch item to be REQ-WORKSPACE-020's empty item for REQ-WORKSPACE-029's empty branch name: no text, no branch
icon, no tooltip, no accessible description. Ten launches run in all; the script's header block lists each as
`<label>. <name>` and its registry record (`docs/proofs/git-proof.md`) names every lettered one, both kept by
`scripts/git-proof-index.test.ts`
(finacc3: the row and the header had missed 6c,
`docs/defects/fixed/agents-md-git-proof-row-omits-the-unborn-branch-launch.md`).
Evidence under `.proof/git-proof/`.

**What `pnpm checkpoint-proof` does.** It builds Electron and launches the app thirteen times against a scratch repository:
two scripted iterations capture checkpoints 1 and 2 (the refs, the fixed identity, the message, HEAD and the index bytes
unchanged, the card's rows); a read-only run records nothing; a hand edit then a restore of checkpoint 1 through the
preview-first dialog (the warning, the checkbox, the safety checkpoint holding the edit, `last_restored_sequence`, the
notice); a session with no rows, a ref deleted from outside, a live run's refusal, a stale session repaired on opening; a
retention of two trimming rows and refs together; an isolated run whose checkpoints land in the shared repository and
whose restore touches the worktree only; `enabled: false`. Figures — invocations and times per capture, preview and
restore — land in `.proof/checkpoint-proof/results.json`. The Git proof's isolated launch now asserts one checkpoint row where it asserted the card's
empty sentence: an isolated run records a checkpoint by REQ-GIT-044's default, which the merge found by failing that launch. The live
run's lock is probed dead the moment that launch returns, so a lock that outlived its application fails there, naming
REQ-SESSION-047/056, and not one launch later as a failed repair (2026-09-28, R-062;
[the note](../../defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md)). The
thirteenth launch, `loaded-restore`, restores a session that stays loaded after its run released the lock, once a second
holder naming another machine has taken it: the restore stops at gate 5 with the file untouched and that lock kept
(ADR-0005, REQ-EVENTS-098; 2026-09-29, R-067, acceptance A14;
[the note](../../defects/fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md)).
