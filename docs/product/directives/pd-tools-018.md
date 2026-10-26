[Product directives](../directives.md) › PD-TOOLS-018

<a id="pd-tools-018"></a>

### PD-TOOLS-018 — a `write_file` insert keeps a CRLF file's line endings

**The case, stated exhaustively.** `write_file` is called with `operation: insert` on an existing, previously read file, with
`insert_line` in bounds and `content` not empty. Everything else is REQ-TOOLS-135's, [`PD-TOOLS-016`](pd-tools-016.md#pd-tools-016)'s and
[`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017)'s, exactly as written; `create` and `overwrite` still write the caller's bytes.

1. **The test.** The insertion is CRLF by `PD-TOOLS-016` clause 2's test, read on the file's line before the insertion point and
   the line at it, where those exist: at least one of them is followed by a line break in the file, and every such line ends in
   `\r`. When neither is followed by a line break, the file's other lines are read the same way. An empty file is not CRLF.
2. **The write.** For a CRLF insertion, every line break the insert writes SHALL gain `\r` when the character before it in the
   result is not `\r`: the break after each inserted line that a break follows, and the break added after a previously
   unterminated last line. A `\r` is never doubled, no byte of the file's existing lines changes, and every other insertion is
   written as given.
3. **Success.** When at least one `\r` was added, the success SHALL add the sentence `content was written with the file's CRLF
   line endings.` after "Inserted N lines into <p> at line L.". The line counts are unchanged.

**Why, and what it costs.** REQ-TOOLS-135's `insert` names `insert_line` and its bounds and is silent on the line endings the
inserted lines carry. The build joined the file's lines and `content`'s with `\n`, so on a CRLF file the inserted lines were LF
among CRLF ones beside a clean success: probed by fin38, `a\r\nb\r\n` with `X` at line 1 left `a\r\nX\nb\r\n`
([OQ-259](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-259)). Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files
are ordinary, and a model writing JSON tool arguments almost never sends `\r`. `PD-TOOLS-016` and `PD-TOOLS-017` ruled that line
endings belong to the file and say nothing of the caller's intent, and LF lines an insert leaves behind later fail their test, so
their guarantees decayed wherever an insert had been. It is a directive of its own rather than a revision of `PD-TOOLS-017`,
whose case is `operation: edit` and whose no-op and `content_hash:` clauses cannot apply to an insert. What it costs: an insert
can no longer write LF lines into a CRLF file (`overwrite` and `create` still write the caller's bytes); the test is local, so a
mixed neighbourhood is written as given and existing drift is not repaired; and an implementation built from the specification
alone writes `content` as given.

> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-259](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-259)); logged as [R-072](../requests.md#r-072).
Extends REQ-TOOLS-135 (fills its silence on the line endings an insert writes, and adds one success sentence). Names
`PD-TOOLS-016`, whose clause 2 test it reads, and `PD-TOOLS-017`, whose write rule and sentence it mirrors; neither is revised.*

> **First execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin39):** the rule held as written. `carryInsert`
> (`packages/agent-tools/src/tools/files.ts`) places the inserted lines as the insert always did and, for non-empty `content`,
> reads `crlfLines` (the test `PD-TOOLS-016` and `PD-TOOLS-017` share) on `text.split('\n')` at the line before the insertion
> point and the line at it; on a CRLF insertion each inserted line a line break follows, and a previously unterminated last line
> the insert extends, gains `\r` when it lacks one. `writeFileTool`'s insert branch calls it and appends clause 3's sentence; its
> description says "An edit or an insert keeps a CRLF file's line endings" (`haet_edit`'s, which has no insert, is unchanged).
> **What was measured.** Seven cases under "PD-TOOLS-018" in `packages/agent-tools/src/tools/tools.test.ts`, red on the code
> before: the probe (`a\r\nb\r\n` + `X` at 1 → `a\r\nX\r\nb\r\n`, "Inserted 1 line into p.txt at line 1." and the sentence); a
> three-line insert; line 0; the end of a terminated CRLF file (`a\r\nb\r\nX\r\n`); the end of an unterminated one (`a\r\nb` +
> `X\n` → `a\r\nb\r\nX\r\n`, and + `c` → `a\r\nb\r\nc`); undo restoring the original bytes after a carried insert; the
> description. One guard group is green before and after: content already in CRLF (no doubled `\r`, no sentence), an LF file, an
> empty file, a mixed neighbourhood written as given; and the existing insert case is unchanged. **Found:** nothing beyond the
> ruling; the empty file, line 0 and both ends come out of `crlfLines`' fallback as the ruling read them. **What was not
> measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six autopsies records an insert into a CRLF
> file; no proof script drives `write_file` in the built app, and the executor runs unchanged inside the run host. Repairs
> [`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](../../defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `insert`: two LF lines inserted at line 0 of a CRLF file landed CRLF with "Inserted 2 lines into crlf/exact.js at line 0." and clause 3's sentence. Red with clause 1's test forced false (the pre-directive insert): the two inserted lines LF-only and no sentence. **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).


> **First live execution, 2026-10-20** (the Windows ARM64 session's live run; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; packs `2026-10-20T07-55-35-723Z` (terminal, frictions) and `2026-10-20T08-14-16-333Z` (crlf), endpoint `katalyst`, unmetered; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)). `crlf` completed and passed: the insert into `greet.js` (#25) kept every CRLF and said "content was written with the file's CRLF line endings". The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
