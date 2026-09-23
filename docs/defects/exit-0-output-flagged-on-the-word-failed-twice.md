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

**Raised with the owner, 2026-09-22 — [R-047](../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

**Ruled 2026-09-23 — [`PD-TOOLS-003`](../product/directives.md#pd-tools-003), [R-048](../product/requests.md#r-048).** The owner took the half
this note left to them: the `FAILED ` marker matches case-sensitively, so only `FAILED ` in capitals warns,
and the other four markers stay case-insensitive. Both warnings this run raised came from lower-case text and
would not fire under the directive. The note stays open until the directive is built; the repair cites
`PD-TOOLS-003` and owes its first execution.
