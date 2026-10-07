## summary.md's Terminal failures, suspicious successes and Timeouts read short past the retention cap with no flag

`warningLines` (`packages/engine/src/run/summary.ts`) prints `terminal_shell_failures`, `suspicious_successes` and `timeouts`
plainly. `sessionMetrics` (`packages/engine/src/export.ts`) takes each as the larger of a count over the tool-call record
(capped at 5,000) and a count over the issues record (capped at 500). Once both rings have dropped rows, the first two read
short with nothing to say so; ~~`timeouts` does once the tool-call record has, since its issues reading counts only the
terminal's `terminal_timeout` issues and a file or MCP tool's timeout files none of that kind.~~ **Corrected 2026-10-07
(fin30, finacc3 A2-08):** that sentence was false. `outcomeIssues` files `terminal_timeout` for every observation whose
`failure_kind` is `timeout`, an MCP call's and a fetch's included, so `timeouts` reads short in the same case as the other
two: once both rings have dropped rows. finacc3's F10 repair marks the
Permission denials and Tool errors lines `at least N` past the cap (and the Metrics lines printing the same figures); these
three, which F10 did not name, were left as found. Noticed while repairing F10, 2026-10-06.

## Specs

REQ-SESSION-133: counts taken over what a capped ring keeps describe what is stored rather than what the run produced, and
the record keeps enough to say it has dropped entries. REQ-SESSION-140's Warnings section covers terminal failures,
suspicious successes and timeouts.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines`: the three lines, and `atLeast`, the form F10 gave its two.
- `packages/engine/src/export.ts` — `sessionMetrics`: the larger-of-two readings; `records_kept` holds each ring's `dropped`.

## Outcome

Repaired 2026-10-07 by fin30 (finacc3 round 2, finding A2-09). Each of the three figures is the larger of a count over the
tool-call record and one over the issues record, and REQ-SESSION-136 files one issue for each such call, so either reading is
the run's whole count while its ring is whole. `warningLines` (`packages/engine/src/run/summary.ts`) therefore prints
Terminal failures, Terminal suspicious successes and Timeouts as `at least N`, followed by
"<n> older tool-call records and <m> older issues dropped by the retention cap", once both
`records_kept.tool_calls.dropped` and `records_kept.issues.dropped` are above zero; with either ring whole each reads plain
as before. The metrics document is unchanged: it already carries `records_kept`. Pinned by "Terminal failures, suspicious
successes and Timeouts read as a lower bound once both rings they are counted from have dropped rows (finacc3 A2-09)" in
`packages/engine/src/run/summary.test.ts` (red before: the plain count past both caps). `pnpm sessions-proof` now asserts its
seed's whole-ring lines read plain (`- Terminal failures: N`, `- Timeouts: N (tool calls that timed out, a terminal's among
them)`), and passed; no proof or live scenario fills both rings past their caps on the built app, so the `at least` form is
shown by the unit test only.
