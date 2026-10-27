# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Spikes 8 and 18 — 2026-09-03, taken with the session writer

Part 16 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Spikes 8 and 18 — 2026-09-03, taken with the session writer

*Recorded under GD-10 and the spike ruling. Both reports are in `../spikes/`.*

**Spike 8** (`store-schema-and-open-path.md`): the declared indexes cost +37 % / +42 % on the
publish-path commit and shorten the checkpoint period below 100 commits; the open sequence is ~3 ms
and `REQ-EVENTS-179`'s probe 0.15 ms; log recovery after a kill is whole and ~11 ms; **an integrity
check costs ~2.8 ms per MB and may not sit on the startup path** (462 ms on a 167 MB store); listing
and summary are index reads at 1–5 ms; the trim is ~35 ms per 2,500 appends; the binding cannot open
a path over 260 characters unprefixed, which the store's own path never is. **It found the fifth
defect of consequence 17's pattern**: an index declared for a budgeted axis that the planner never
used. Consequence 17's estimate is unchanged and its count is now five — **six** with the run loop's, in the next section, and **seven** with the terminal's (ADR-0020's marker protocol read the PTY's echo before the shell's frame; recorded there, 2026-09-03), and **eight** with the redaction pass's (ADR-0007, quadratic over a long run, found by the hooks' payload bound the day after; recorded there).

**Spike 18** (`two-writers-one-store.md`): two compliant writer processes on one store — zero
`SQLITE_BUSY` in 6,000 contended commits, nothing lost, +12 % at p50, aggregate throughput unchanged,
and **one sample of 258 ms** in 6,000, the first this record has seen cross `REQ-MONITOR-222` on a
compliant path. Rule 4 stands; a third writer is not measured.
