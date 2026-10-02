## Exit-0 output flagged on the word FAILED twice in one run

Observed 2026-09-20, run `2e21e324`: two commands that exited 0 were recorded `suspicious_success` on the literal `FAILED ` marker. `tool_calls` ord 114 (`docker info --format …; docker compose version`) warned `Output contains the failure marker 'FAILED'.` on docker's `failed to connect to the docker API` line; ord 229 (`git --no-pager diff -- …`) warned the same on git's `LF will be replaced by CRLF` lines matching `failed` case-insensitively. Timeline ord 7 and 22 filed both as `terminal_suspicious_success` warnings, and transcript row 382 shows the agent explaining one away (`The "FAILED" marker is a false positive`).

## Specs

REQ-TOOLS-113 — literal failure markers searched case-insensitively, `FAILED ` with the trailing space. The warnings fired as specified; recorded here for cost, not contradiction.

## Relevant files

- `packages/agent-tools/src/terminal/classify.ts` — `MARKERS`, `outputWarnings`.
- `packages/agent-tools/src/gate.ts` — the `terminal_suspicious_success` issue on `suspicious_success`.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.

**Improved 2026-09-22, and not closed — the half that remains is the owner's.** The warning now quotes the
line the marker matched on, capped at 120 characters:

```
Output contains the failure marker 'FAILED', in: failed to connect to the docker API
```

REQ-TOOLS-113's own clause — the text "names the marker that matched" — is untouched, and the marker is
still named first; the line is added after it. That is what the run paid for twice: from the warning alone
neither the agent nor a reader could tell docker's connection notice, or git's chatter, from a test runner's
`FAILED test_a`, so the judgement cost a second pass over the whole output. It is now one read.

**What is not repaired, and why it may not be here.** Which outputs warn is fixed by the requirement —
literal markers, case-insensitive, anywhere in the output, `FAILED ` with its trailing space — and the code
is faithful to every word of it. Narrowing the match is *behaviour the owner wants instead of a live
requirement*, which `docs/product/README.md`'s table sends to a `PD`, not to a repair; an implementer may
not mint one. Until the owner rules, the two commands in this run would warn again, with a better message.

Measured: `packages/agent-tools/src/terminal/terminal.test.ts`'s REQ-TOOLS-113 case, extended with this
run's own docker line and with the cap, is green.

**Raised with the owner, 2026-09-22 — [R-047](../../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

**Ruled 2026-09-23 — [`PD-TOOLS-003`](../../product/directives.md#pd-tools-003), [R-048](../../product/requests.md#r-048).** The owner took the half
this note left to them: the `FAILED ` marker matches case-sensitively, so only `FAILED ` in capitals warns,
and the other four markers stay case-insensitive. Both warnings this run raised came from lower-case text and
would not fire under the directive. The note stays open until the directive is built; the repair cites
`PD-TOOLS-003` and owes its first execution.

## Repaired 2026-09-27 ([R-055](../../product/requests.md#r-055))

Built as [`PD-TOOLS-003`](../../product/directives.md#pd-tools-003) rules it: the fifth marker, `FAILED `, matches
case-sensitively, and the other four markers, the error count, the banner check and the pipeline check keep their
casing. In `packages/agent-tools/src/terminal/classify.ts` each entry of `MARKERS` now carries its own
`caseSensitive` flag, and one predicate, `containsMarker`, answers both questions the warning asks: whether the
output carries the marker, and which line to quote. The quoted line had been found by a lower-cased search of its
own, so narrowing only the search would have quoted a `failed ` line ahead of the `FAILED ` line that matched.
Nothing outside that file changed behaviour: `gate.ts` still files `terminal_suspicious_success` on every
`suspicious_success`, and a lower-case `failed ` no longer makes one through the marker. The live run's
`failed-word` shape (`apps/desktop/scripts/lib/terminal-shapes.mjs`) printed `FAILED` in capitals; it now prints
this run's docker line in lower case, and `live-run.mjs` checks that the line reached the output at exit 0 with no
marker warning and no `suspicious_success` — a regression guard for this repair that has not yet run against a
real endpoint.

Evidence: `packages/agent-tools/src/terminal/terminal.test.ts`. *PD-TOOLS-003 / REQ-TOOLS-113: run `2e21e324`'s
docker line no longer warns, so its exit-0 command reads success* feeds this run's docker output
(`failed to connect to the docker API`) through `outputWarnings` and `classifyOutcome` and reads no warning and
`success` / `info` — the ord 114 warning would not fire now. The ord 229 git line is not recorded verbatim; this
note records only that it matched in lower case, so it is covered by the casing cases rather than replayed:
`failed `, `Failed ` and `fAILED ` do not warn. The other cases pin the rest: `FAILED test_a.py::test_x` still
warns and is quoted; a `failed ` line ahead of a `FAILED ` line quotes the capital one; and the four other markers
in other casings, a lower-case `=== 1 failed in 0.1s ===` banner and a lower-case `failed` through a `|` all still
warn. With `FAILED ` made case-insensitive again, the three new cases fail; with only the quoted line's search
lower-cased again, the ordering case fails.
