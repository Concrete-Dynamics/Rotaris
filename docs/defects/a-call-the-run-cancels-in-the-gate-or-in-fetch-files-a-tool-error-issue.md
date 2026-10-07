## A call the run cancels in the gate or in fetch files a `tool_error` issue

PD-ORCH-005 clause 3 records a call the run's rest cut off as interrupted, and the gate files no outcome-driven issue for an
observation whose failure kind is `interrupted` (a released wait, a withdrawn question, and since PD-TOOLS-013 a cancelled
terminal call). Two other cancel paths do not say so:

- **The gate's catch.** An executor that throws once the run's signal is aborted gets the observation "The '<tool>' call
  was cancelled before it completed." with failure kind `cancelled`, a word no vocabulary holds. It is not `interrupted`,
  so the result is not marked interrupted by the gate (the turn still reads the aborted signal), and `outcomeIssues` files a
  `tool_error` warning for it.
- **fetch.** A fetch the run's signal ends is recorded `network_error` (`NetworkError`, "The fetch of <url> was cancelled by
  the run before it completed."), so the cancel lands in the same failure kind as a real transport fault and files a
  `tool_error` warning.

A quit, a stop or a pause past the tool deadline therefore files a warning issue for such a call, where the terminal's
cancelled call (PD-TOOLS-013), a released wait and a withdrawn question file none.

Noticed by the R-072 consortium while ruling OQ-226 (2026-10-07, finding P2 of the final default live run at `a68f121`),
which records this and does not repair it. Recorded by fin31, not repaired.

## Specs

- PD-ORCH-005 clause 3: a call the rest cut off is recorded as interrupted.
- PD-TOOLS-013 extends REQ-SESSION-136 (its disposition block; `PD-SESSION-003` holds the narrowing) so a call recorded
  as interrupted files no outcome-driven issue; these two paths record a cancel under another kind, so the extension does
  not reach them.
- REQ-TOOLS-092 (fetch's closed vocabulary) has no cancellation kind; ADR-0023's reading records the cancel as
  `network_error`.

## Relevant files

- `packages/agent-tools/src/gate.ts`: the `catch` after `executor.execute` (`failureKind: aborted ? 'cancelled' : …`) and
  `outcomeIssues`.
- `packages/agent-tools/src/tools/fetch.ts`: `transportFailure`, the `ctx.signal.aborted` branch.
