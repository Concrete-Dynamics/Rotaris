## summary.md's Permission denials and Tool errors read short past the retention cap with no flag

`warningLines` (`packages/engine/src/run/summary.ts`) prints `permission_denials` and `issues_by_kind.tool_error` as plain
counts. Both are counted over rings REQ-SESSION-133 caps — the permission audit at 5,000 entries, the issues record at 500 —
so once a cap has dropped its oldest entries each count describes what is stored, not what the run produced, and reads short
with nothing to say so. The Metrics section's Permission decisions and Issues lines print the same figures the same way.
`summaryFactsOf` already reads each ring's `dropped` (`ringState(...)`) into `records_kept`, and the Agents section already
reads `n/a` for a figure its record has dropped rows of; these lines do not. Found by fin22's verifiers (finding 12; fin23
moved Tool errors onto the issues ring, which is capped too); acceptance finding F10 of finacc3.

## Specs

REQ-SESSION-133: "counts taken over what remains describe what is stored rather than what the run produced", and the record
retains enough to say that it has dropped entries. REQ-SESSION-140's Warnings section covers permission denials and tool
errors; a figure the file knows may be short and presents as whole says something false about the run.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines` (Permission denials, Tool errors) and `metricsLines` (Permission
  decisions, Issues) print the ring counts plainly; `summaryFactsOf` reads the rings' `dropped`.
- `packages/engine/src/export.ts` — `sessionMetrics`: `records_kept.permission_audit.dropped`, `records_kept.issues.dropped`.

## Outcome

Repaired 2026-10-06 by finacc3's repair bundle `finacc3-accept1-9` (acceptance finding F10). `warningLines` and
`metricsLines` (`packages/engine/src/run/summary.ts`) print each count over the permission audit or the issues record as
`at least N` once that ring's `records_kept.<ring>.dropped` is above zero, and say how many rows the cap dropped — Permission
denials and Tool errors in Warnings, Permission decisions (its denials and mode changes) and Issues in Metrics; each ring is
judged on its own, and a whole ring's count reads plain as before. The live run's reader
(`apps/desktop/scripts/lib/summary-sections.mjs`) reads the Tool errors line in either form, so its agreement check with the
Issues line is not skipped past the cap. Pinned by "a count over a ring the cap has dropped rows of reads as a lower bound and
says how many were dropped" in `packages/engine/src/run/summary.test.ts` (red before: the plain count) and by "past the
retention cap the counts read `at least`, and the Tool errors line is still held to its Issues line" in
`apps/desktop/scripts/lib/summary-sections.test.ts` (red on the reader's old pattern). `pnpm sessions-proof` passes on the
repaired build, its seed's whole rings reading plain (`Permission denials: 0`, `Tool errors: 1`); no proof or live scenario
fills a ring past its cap on the built app, so the `at least` form is shown by the unit tests only. Terminal failures,
suspicious successes and Timeouts, which this finding did not name, are recorded on their own in
`docs/defects/summary-md-terminal-failures-and-timeouts-read-short-past-the-cap-with-no-flag.md`.
