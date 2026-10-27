[Product directives](../directives.md) › PD-TOOLS-019

<a id="pd-tools-019"></a>

### PD-TOOLS-019 — a match at level 3 compares each line without its carriage return

**The case, stated exhaustively.** An edit's `old_string` matches nowhere at REQ-TOOLS-136 level 1 or level 2. Level 3 SHALL
then compare each line of every candidate window, and each line of `old_string`, with one trailing `\r` set aside. The leading
prefix SHALL be measured, added and removed on those lines. A window equal under that reading matches at level 3. Levels 1, 2
and 4, their order, and the rule that the first matching level decides are unchanged.

What a level-3 match then does stays as follows: [`PD-TOOLS-015`](pd-tools-015.md#pd-tools-015) for `write_file`'s single window,
[`PD-TOOLS-016`](pd-tools-016.md#pd-tools-016) for the bytes written (whose clause 2 carries the CRLF endings), and
[`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014) for `haet_edit`'s near miss, whose revision 3 names the line endings when a window line and its
`old_string` line differ by a trailing `\r`. The quote stays the file's exact lines joined by `\n`, `\r`s included.

**Disjoint from the earlier narrowings of REQ-TOOLS-136.** This directive changes **which windows match** at level 3;
`PD-TOOLS-015` governs **what a level-3 apply writes**; [`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017) governs level 1 and `replace_all`. None
of the three restates another.

> *Since [`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020) (2026-10-14, [OQ-295](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295)):* which windows match at
> level 3 is decided by this directive and `PD-TOOLS-020` together — this one sets one trailing `\r` aside on every line, and
> `PD-TOOLS-020` then compares lines with no visible character by having none and measures the prefix on the first visible line.
> The two are disjoint: neither restates the other.

**Why, and what it costs.** On a CRLF file every line ends in `\r`, and an `old_string` a model writes in a JSON string almost
never carries one. Level 2 already strips the `\r` with the trailing whitespace, but level 3 compared lines exactly, so an LF
`old_string` one uniform indent off never matched a CRLF file at level 3 ([OQ-280](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)).
Measured in the built app (`pnpm edits-proof`, `shift-lf`) and with the tools directly: `write_file` applied the three-line block
at "Match level: 4 (similarity: 0.91). Verify the result." and wrote it **one tab too shallow beside a success**, and `haet_edit`
gave the plain miss with no quote; a shorter window read "not found at any of the four match levels". That is the case
`PD-TOOLS-015` was ruled to prevent (OQ-233's reason: a mis-indented block never lands beside a success), one level down, and
Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary. What it costs: some edits that applied at
level 4 are shifted, written as given or refused at level 3 instead; the near-miss quote of such a window carries `\r`s the
caller must send back; and the product departs from an implementation built from the specification alone, which compares level
3 exactly.

> **Narrows:** REQ-TOOLS-136

*Ruled under the owner's delegation, 2026-10-13 ([OQ-280](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)); logged as [R-072](../requests.md#r-072).
Narrows REQ-TOOLS-136 (level 3's comparison sets one trailing `\r` aside on both sides). Names `PD-TOOLS-015` and `PD-TOOLS-017`,
the earlier narrowings of REQ-TOOLS-136, and `PD-TOOLS-014` (revision 3, ruled with it) and `PD-TOOLS-016`; none of the last
three is otherwise revised.*

> **First execution, 2026-10-14, built under [R-072](../requests.md#r-072) (fin43):** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) reads each window line and each `old_string` line through `body` (one trailing `\r`
> removed) at level 3 only, and computes the indent, the shift and the comparison on those; `starts` and `shifts` are returned as
> before, so `shiftNewString`, `carryWindow` and both tools' branches still receive the window's raw lines. `nearMissMessage`'s
> level-3 branch adds `PD-TOOLS-014` revision 3's sentence, read on the first line whose `\r` differs. **What was measured.**
> Eight cases under "PD-TOOLS-019" in `packages/agent-tools/src/tools/tools.test.ts`, seven red on the code before: the CRLF
> `render` loop with an LF `old_string` one tab shallow through `write_file` (level 3, `PD-TOOLS-015`'s shift sentence then
> `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth with no LF-only line), the same one tab deep, a `new_string` at the
> file's depth written as given, one at a third depth refused with the bytes and the undo stack unchanged and the reply naming the
> line endings, `haet_edit`'s level-3 near miss naming them with a quote carrying `\r` and its retry applying at level 1 wholly
> CRLF (`PD-TOOLS-017`), the defect note's short `check` window reaching level 3, and a `\r`-carrying `old_string` on an LF file
> (the reply naming the endings the other way round); the eighth guards agreeing endings (no sentence) and the level-4 typo test.
> The existing `\r`-carrying level-3 case and the level-4 LF case stay green unchanged. In the built app, `pnpm edits-proof` green
> at load 1.0 to 1.5 on four CPUs: `shift-lf` asserted (level 3, both sentences, exact bytes), and the new `near-lf` and
> `retry-lf` steps through `haet_edit` (the level-3 near miss naming the line endings, its quote applying, the file wholly CRLF).
> **Found:** a block with a blank interior line never reaches level 3, on LF and CRLF alike — not decided by this ruling, recorded
> as [`a-block-with-a-blank-interior-line-never-matches-at-level-3`](../../defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md)
> and raised as [OQ-295](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295). **What was not measured.** A live run: the `crlf` scenario
> (`lib/crlf-scenario.mjs`) now fails a level-4 window edit whose `old_string` was a uniform indent off, checks a level-3 one lands
> at the file's depth and a level-3 near miss names the endings, and is the orchestrator's to run. Repairs
> [`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First live execution, 2026-10-20** (the Windows ARM64 session's live run; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; packs `2026-10-20T07-55-35-723Z` (terminal, frictions) and `2026-10-20T08-14-16-333Z` (crlf), endpoint `katalyst`, unmetered; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)). `crlf` completed and passed: not asked: the window edit landed at level 2, so neither the level-4 FAIL nor the level-3 depth check was reached, and the model made no level-3 near miss with an LF `old_string`. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
