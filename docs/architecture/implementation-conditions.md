# Conditions that bind at implementation time

Created 2026-09-02 by owner ruling GD-3.

This file holds obligations that are **not** conditions of the Architecture Gate but **are** conditions on
building the thing they name. It exists because the alternative to holding a whole gate for one mechanism's
measurement is not "trust the reasoning" — it is "bind the measurement to the mechanism". Without somewhere
to write that down, deciding an obligation is an implementation-time condition is indistinguishable from
deciding it is nothing.

**How an entry here binds.** The work it names may not be reported as complete until its condition is
discharged. Discharging a condition means recording the result where the entry says, in the record, whether
or not it passed — a condition that quietly disappears has not been discharged. Nothing here may be
downgraded by the person doing the work; a condition is removed by the same authority that set it.

**How an entry gets here.** Someone with the authority to set a gate condition decides that an obligation
binds the mechanism rather than the gate. The entry names what must be shown, what would count as showing
it, and where the result goes.

---

## IC-1 — the corrected restore is re-measured before its implementation is signed off

**Set by:** GD-3, 2026-09-02. **Binds:** the first implementation of the store restore of ADR-0058 and
`REQ-SESSION-201`. **Discharged into:** a dated spike report in `docs/architecture/spikes/`, and a note on
ADR-0058.

**Why it exists.** Spike 22 built ADR-0058's restore for the first time and it failed in 30 of 30 attempts,
destroyed a live session, and had a reversal that failed in exactly the case it exists for. Those three
defects are now corrected — **on paper**, which is precisely the state ADR-0058 consequence 17 records as
not being evidence. Three mechanisms in this record have gone from paper to first execution and all three
held a defect no reading had caught. The corrections have not been run.

**What must be shown.** Two experiments, both narrow, and both aimed at the corrections rather than at the
mechanism generally:

1. **The window is closed.** Launch a run into the interval between the refusal of new runs being put in
   force and the run host's acknowledgement of it, and confirm the second liveness evaluation refuses the
   restore, that the run continues, and that its session and every row it wrote survive intact. This is the
   defect that destroyed a session at twenty rows a second in the measured run, so the counterfactual is
   already known: without the correction, the session and all its rows are gone.
2. **The reversal survives the case it exists for.** Force the install rename to fail with the target name
   occupied — the case where the original reversal failed with the identical error — and confirm
   displace-then-rename returns the target store byte-identical to its state before the restore began, and
   that no store directory exists holding no database.

**What would count as failing it.** Either experiment producing a result the corrected ADR-0058 does not
predict. A run that cannot be raced into the window is not a pass; it is an inconclusive result and the
harness needs fixing, because the unmodified mechanism admitted one on the first attempt.

**What it does not cover.** The eight defects spike 22 found and did not correct (D3, D5, D6, D7, D8, D9,
D10, D11) are open items in their own right and are not discharged by this condition.

---

## IC-2 — no screen is built before the approved visual design reference is available

**Set by:** GD-1, 2026-09-02. **Binds:** the construction of any of the seven primary views, the benchmark
card, and the diagnostics view. **Discharged by:** the reference being approved and available, and OQ-30
being closed against it.

**Why it exists.** GD-1 ruled that the reference does not block the Architecture Gate, because every
mechanism in the record was shown to be independent of it. The same paragraph of `open-questions.md` that
establishes that independence also states the other half: **no screen can be built without it**. Recording
only the half that unblocks the gate would be reading the finding selectively.

**What is still owed from the reference**, beyond OQ-30's theme palettes and token values: the information
architecture inside each of the seven primary views; the visual form of the benchmark card and the
diagnostics view, both of which have specified content and specified budgets and no specified layout; and
the glyph vocabulary that `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

**What is explicitly not blocked.** Everything the record settles about mechanism — process topology, where
state lives, what crosses a boundary, what paints a row, the recycler, theme application as data. ADR-0050's
theme mechanism in particular is buildable and testable with placeholder values, because it computes
corrections and asserts contrast from rendered pixels rather than depending on which values are present.

**What is no longer blocked by the reference.** OQ-31, the Markdown dialect, was ruled without it by GD-1.
