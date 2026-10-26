# The codebase — how the architecture is laid out in code — The first two product directives (2026-09-12)

Part 13 of 22 of [the codebase record](../codebase.md), which indexes every part.

## The first two product directives (2026-09-12)

`PD-SHELL-001` (a chosen folder may be opened in an additional main window) and `PD-WORKSPACE-001` (choosing
the folder already open offers a new session) are the first entries in `docs/product/`, written the day after
the layer that holds them. The classification, the dispositions and the back-pointers are recorded there and
in `requests.md`; what belongs here is what writing them cost.

**The eighty-seventh — the register's own proof assumed the register would stay empty.** `pnpm
directive-proof` fell from 25/25 to 21/25 the moment two real directives existed, and neither the generator
nor the directives were wrong: the proof appended each fixture to the *committed* register and then asserted
absolutes about the result — `DIRECTIVE_COUNT = 1`, each precedence map anchored at its first line. Three of
the four failures were that arithmetic. The fourth was a check that had **stopped checking**: the
counterfactual for a disposition with no directive above it injects a bare disposition line, and appended
below two committed directives there was always a directive above it, so the generator was right to accept it
— the proof would have gone on printing a pass for a refusal it no longer exercised. The fixture register is
written in full now rather than appended to, and what the committed register claims is checked against the
artifact by a test that knows neither count: `DIRECTIVE_COUNT` equals the number of `PD` symbols beside it.
25/25.

The same genre as the eighty-sixth above, one register apart: a check that passed on a condition nobody had
promised would hold. There it was a cheap first paint; here it was an empty register, which is the one thing a
register exists to stop being.
