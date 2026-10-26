[Product directives](../directives.md) › PD-TOOLS-003

<a id="pd-tools-003"></a>

### PD-TOOLS-003 — the `FAILED ` marker matches in capitals only

Of the five literal failure markers REQ-TOOLS-113 searches for in the output of a command that exited 0,
the fifth, `FAILED ` (with its trailing space), SHALL match **case-sensitively**: the output must contain
exactly `FAILED ` in capitals for it to warn. `failed `, `Failed ` and every other casing SHALL NOT
produce the marker warning.

Everything else REQ-TOOLS-113 fixes still governs unchanged. The other four markers are still searched
case-insensitively; the order of the five, the single marker warning naming the earliest marker present,
the error-count check, the test-runner banner check (which still matches `failed` in any casing inside a
`=`-framed line), the pipeline check, and the de-duplication rule are untouched.

**Why, and what it costs.** Test runners print this marker in capitals (`FAILED tests/test_a.py::test_x`,
`FAILED (failures=1)`), and the false warnings the product raised came from ordinary lower-case prose —
Docker's `failed to connect to the docker API` and a line of git output. Each false warning cost the
agent a second pass over the whole output to decide it was harmless. What is given up: a tool that
reports a real failure in lower case with `failed ` and still exits 0 is no longer flagged by this
marker. That combination is rare, because a runner whose tests fail exits non-zero; and a `=`-framed
banner containing `failed` in any casing still warns through the banner check.

> **Narrows:** REQ-TOOLS-113

*Raised by the owner, 2026-09-23; logged as [R-048](../requests.md#r-048).*

> **First execution, 2026-09-27, built under [R-055](../requests.md#r-055):** the rule held as written, and building it
> moved one thing the text does not name. Since 2026-09-22 the marker warning quotes the line the marker matched on,
> and that line was found by a second, lower-cased search of its own. Narrowing only the search would have left an
> output with `failed ` on an earlier line and `FAILED ` on a later one warning on the capital line while quoting the
> lower-case one. The casing is therefore stated once, on the marker, and one predicate serves both the search and the
> quoted line (`packages/agent-tools/src/terminal/classify.ts`). Two unit assertions had pinned the old reading. One
> had a lower-case `==== 1 failed ====` banner raise the marker warning and the banner warning; it now uses a capital
> `==== 1 FAILED ====` banner, which still raises both, and a new case pins a lower-case banner raising the banner
> warning alone, the banner check still catching it as the cost paragraph above says. The other expected run
> `2e21e324`'s docker line to be quoted in a marker warning; it moved to a case of its own, which now expects no
> warning and `success`. ADR-0020's "consequence 2 as met today" stated the banner reading as conformant; the sentence
> is kept there with a dated note beside it. The live run's `failed-word` shape printed `FAILED` in capitals, the
> other side of the rule from the record it claimed to replay. It now prints the record's lower-case docker line and
> checks that the line reached the output at exit 0 with no marker warning and no `suspicious_success`, a regression
> guard as `diff-exit-1` is for ESC-41. Writing that guard's positive half found that the here-string's own check
> reads its command back and cannot fail, recorded as
> [`the-here-string-check-reads-its-own-command-back.md`](../../defects/fixed/the-here-string-check-reads-its-own-command-back.md).
> Two things were not measured. Run `2e21e324`'s git line is not recorded verbatim anywhere in the record, so only its
> docker line is replayed. And the guard has not run against a real endpoint; the next live run of `terminal` is its
> first. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13:** the sentence "the guard has not run against a real endpoint" no longer holds. The live
> run's `terminal` scenario has run the guard against the owner's self-hosted endpoint since 2026-09-29 (its earliest
> recorded pack, `2026-09-29T02-41-56-779Z`, `live-run PASSED`), and every default live run since has passed its three
> checks, the last at `552d346` and `0bc3eee` on 2026-10-13: "the docker line was printed and exited 0", "a lower-case
> failed at exit 0 was not classified suspicious_success" and "no failure-marker warning on the lower-case line". Run
> `2e21e324`'s git line is still not replayed. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
