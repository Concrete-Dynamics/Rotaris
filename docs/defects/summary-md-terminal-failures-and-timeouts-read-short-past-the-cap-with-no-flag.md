## summary.md's Terminal failures, suspicious successes and Timeouts read short past the retention cap with no flag

`warningLines` (`packages/engine/src/run/summary.ts`) prints `terminal_shell_failures`, `suspicious_successes` and `timeouts`
plainly. `sessionMetrics` (`packages/engine/src/export.ts`) takes each as the larger of a count over the tool-call record
(capped at 5,000) and a count over the issues record (capped at 500). Once both rings have dropped rows, the first two read
short with nothing to say so; `timeouts` does once the tool-call record has, since its issues reading counts only the
terminal's `terminal_timeout` issues and a file or MCP tool's timeout files none of that kind. finacc3's F10 repair marks the
Permission denials and Tool errors lines `at least N` past the cap (and the Metrics lines printing the same figures); these
three, which F10 did not name, were left as found. Noticed while repairing F10, 2026-10-06.

## Specs

REQ-SESSION-133: counts taken over what a capped ring keeps describe what is stored rather than what the run produced, and
the record keeps enough to say it has dropped entries. REQ-SESSION-140's Warnings section covers terminal failures,
suspicious successes and timeouts.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines`: the three lines, and `atLeast`, the form F10 gave its two.
- `packages/engine/src/export.ts` — `sessionMetrics`: the larger-of-two readings; `records_kept` holds each ring's `dropped`.
