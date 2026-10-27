# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — The owner's ruling — 2026-09-11: OQ-5, OQ-38 and OQ-55 closed, and one reading of this record narrowed

Part 11 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## The owner's ruling — 2026-09-11: OQ-5, OQ-38 and OQ-55 closed, and one reading of this record narrowed

Three questions this record raised and carried three executions have been ruled, and the specification now states
what this record could only read. Nothing below is a new decision of this record. What follows is which of its
readings became the requirement, which one was narrowed in becoming it, and what stops being owed.

**OQ-5 — ratified as read, and widened to background streams.** `REQ-TOOLS-127` now states that the closing frame is
a literal replacement of the displayed text carrying an explicit marker that it is one, that its text is plain on the
terms the requirement already fixed, and that it is the only frame of a stream of which any of that is true. It also
states the reason the conflict was never real, which this record argued and could not settle: `REQ-SHELL-095` and
`REQ-SHELL-098` govern the stream **while the process is running**, and this frame is emitted after it has exited —
when there is no cursor to paint, no alternate screen left to be in, and no further output to attribute to a cell.
The two bind different instants. One thing the amendment fixes that this record had not noticed: the requirement's
closing sentence bound a **foreground** stream only, while all three executions emitted a closing frame for `bg:`
streams as well and a proof asserted it. That was the code ahead of the requirement rather than outside it, and the
amendment now covers both. **No code changes for this one.**

**OQ-38 — the ceiling-plus-flush reading is ratified, and the licence is narrowed to the person who took control.**
`REQ-CONFIG-117` now states that `terminal_stream_interval_ms` is a ceiling on batching and not a fixed cadence, that
input the user has directed at a stream whose control they have taken arms that stream's next frame, that **output
alone never arms and neither does an agent's own `is_input` call**, and that the 20 ms floor and `REQ-MONITOR-306`
are the two bounds on the licence that no configuration may relax. `REQ-TOOLS-126` cites all of it rather than
restating it, and now cites `REQ-MONITOR-306` — which incidentally discharges the half of ESC-22 that domain 05 was
recorded as owing, that "an implementer reading `REQ-TOOLS-126` alone would build per-stream sampling with no
aggregate".

*What the ruling costs this record, stated rather than repaired quietly.* The Decision's bullet said "writing user
keystrokes", and the first execution read that as including the agent's own, with a comment in
`agent-tools/src/terminal/index.ts` saying so in terms: *the agent's own keystroke arms the stream's next flush too,
the same as the user's*. **That reading is falsified and is kept beside its replacement.** It was not wrong about the
mechanism; it was wrong about whom the mechanism is for. Its price is the one this record's own third execution
measured without being able to attribute it: the licence is 50 frames/s per stream, and spending it on every stream
an agent types into is what made twenty background sessions alone offer `REQ-MONITOR-306`'s entire aggregate. Under
the ruling it is spent on at most one stream per window — the one a person is watching for their own echo — and a
background session frames at the configured period, **ten frames a second at the default rather than fifty**. The
code now carries the ruling and a regression pin asserts both halves together, because either half alone would pass
a build that had lost the other.

**OQ-55 — closed, and this record's own obligation 2 is discharged with it.** `REQ-CONFIG-116` gives
`runtime.shell_max_background_sessions` a range of **1–64**, taking `REQ-TRACE-481`'s ceiling and its reason — an
input needs some upper bound, and a figure no machine could actually service is of no use to anyone. "The cap is
load-bearing" obligation 2 asked for the unbounded background count to be measured and reported; the third execution
measured it and reported that the missing ceiling was not an agent's to supply. It now exists, and the staleness law
that execution established has both of its terms. At the maximum, `(20 agents + 64) × windows` stays under the
thousand-stream crossing for any window count a user can produce, so the worst case a **configuration** can reach is
the flat regime bounded by the drain's own one-second period, rather than the `streams × windows ÷ 1,000` seconds
that applies above it. That is what this record said a ceiling would buy, and it is what the ceiling buys.

**What is no longer owed.** The two readings carried through three executions are the specification's. Obligation 2
is discharged. Nothing in "The cap is load-bearing" is now open: obligation 1 was honoured at every execution by the
20 ms floor, and obligation 2's ceiling exists. What this record still owes is unchanged and unrelated — the
packaged-app limb and the synthetic-ladder limb noted in the third execution.
