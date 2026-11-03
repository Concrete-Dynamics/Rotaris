[Product directives](../directives.md) › PD-SESSION-004

<a id="pd-session-004"></a>

### PD-SESSION-004 — the session log holds at most 32 MiB as one file, its oldest lines dropped

The per-session log of REQ-SESSION-142 (restated by REQ-MONITOR-238) SHALL remain a single file, `session.log`, in
the session's place on disk (REQ-SESSION-002), and SHALL hold at most 32 MiB. No segment, rotated, sibling or
temporary file SHALL be written in that place for it, so REQ-SESSION-002's closed set and the open and reveal actions
of REQ-SESSION-191 are unchanged. When an append would take the file past the bound, the appender SHALL compact it
before appending: it SHALL keep the most recent 16 MiB of the file, starting at the first line boundary within that
tail, SHALL rewrite the file in place with that tail, and SHALL place before it exactly one line in the log's own line
format at level WARNING stating that the log reached its 32 MiB bound and the cumulative number of bytes dropped since
the file was created (a later compaction replaces that line and adds to the total). The newest lines SHALL always be
kept and the oldest dropped; no line SHALL be cut in the middle. The appender SHALL take its starting size from the
file on disk when it is opened, because a session's later runs append to the same file, and SHALL count bytes in
memory thereafter. A compaction that fails SHALL NOT fail the run and SHALL raise no notice or dialog: the appender
SHALL write one WARNING to the application log and SHALL append nothing further to the session log for the rest of
that run, so the file never grows past the bound. The bound and the retained size SHALL be named constants beside
`fileAppender` in the run host (`apps/desktop/src/run-host/tools.ts`), not configuration keys; the specification names
none.

**Why, and what it costs.** REQ-SESSION-142 states no bound, and at DEBUG a run left on for hours appends without
limit on the disk the session store shares (REQ-SESSION-198), so a debug aid could cost the user their record; and a
multi-gigabyte file defeats the requirement's own purpose, a file a person opens in an ordinary text reader.
REQ-STARTUP-133 already accepts this trade for diagnostics and fixes 32 MiB per stream; its segment shape is not taken
because this log is "a file" the user opens as one target, not JSON-lines a tool joins. The cost is the start of a
very long raised-level session, its configuration and earliest tool calls, which the marker line makes visible but
cannot restore; an in-place rewrite is not atomic on Windows, so a crash mid-compaction may leave a truncated debug
log; a reader holding the file open sees it change under it; and the figures are borrowed, not measured for this log.

> **Narrows:** REQ-SESSION-142, REQ-MONITOR-238

*Raised as [OQ-465](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-465) by the hardening
request [R-091](../requests.md#r-091), 2026-11-01, and ruled the same day by the orchestrator's consortium under the
owner's delegation ([R-072](../requests.md#r-072)); minted because the bound departs from the unbounded file the
requirement states. Built by the hardening plan's bundle `log-sinks`.*

> **First execution, 2026-11-03 (hardening D2, `log-sinks`):** built as written. `SESSION_LOG_MAX_BYTES` (32 MiB) and
> `SESSION_LOG_RETAINED_BYTES` (16 MiB) stand beside `fileAppender` in `apps/desktop/src/run-host/tools.ts`; the appender reads
> the file's size when a run opens it and counts in memory after that; an append that would pass the bound first rewrites the
> file in place (`writeFileSync` over the one file, no sibling) with its newest 16 MiB from a line boundary behind one line
> `<instant> WARNING session log reached its 32 MiB bound; <n> bytes dropped since the file was created`, the instant from the
> wall-clock port, an earlier marker's total read back and replaced. A failed compaction writes one `warn` line to the
> application log through the run host's `log` and ends that run's writing. **The text met the code once:** a single line
> longer than the room a compaction leaves cannot be kept whole within the bound, and the directive forbids cutting one; it is
> not written, and its bytes are counted in the marker of the compaction it forced, so the bound, "no line cut" and the
> marker's cumulative total all hold. *(Corrected 2026-11-04 by the bundle's review: this read "its bytes join the next
> marker's total"; they waited in memory for a later compaction, so a run that ended first left the total on disk short of
> the bytes dropped, and a later run never counted them. The same compaction's marker counts them now, pinned by "writes no
> line longer than the room a compaction leaves".)* Measured by unit tests
> with a 1,000-byte bound and a 500-byte retention (`run-host/tools.test.ts`, "the session log's bound"), not by a run that
> wrote 32 MiB in the built app. The row is in [`../../architecture/first-executions.md`](../../architecture/first-executions.md).
