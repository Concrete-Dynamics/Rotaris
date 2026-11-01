[Product directives](../directives.md) › PD-TOOLS-016

<a id="pd-tools-016"></a>

### PD-TOOLS-016 — a window-match `write_file` edit keeps the file's line endings and the bytes of the lines it leaves unchanged

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-254](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-254)) — **level 1 and
`replace_all` are [`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017)'s**: the case's "Everything outside this case" names it, and the cost sentence
no longer says an exact `old_string` converts endings; revision 1's text is quoted beneath each.*

*Revision 3 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-260](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-260)) — **a window
edit whose carried result equals the file is refused**: clause 4 is added, and the cost sentence says so; revision 2's cost
text is quoted beneath it. The case is unchanged: it already held the edit clause 4 refuses.*

*Revision 4 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-295](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295) with
[`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020)) — **level 3's blank lines are the window's own**: clause 1's heading and scope read "at level 2,
and at level 3 for blank lines"; revision 3's clause 1 heading is quoted beneath it.*

**The case, stated exhaustively.** `write_file` is called with `operation: edit`, `replace_all` false, `old_string` and
`new_string` different, and `old_string` matches nowhere at REQ-TOOLS-136 level 1 and exactly one window at level 2, 3 or 4. At
level 3 this directive applies after [`PD-TOOLS-015`](pd-tools-015.md#pd-tools-015) has decided the replacement, and its refusal is unchanged.
Everything outside this case — several windows, and `haet_edit` and its alias `haet` at levels 2 and 3
([`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014)) — is REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as written; level 1 and `replace_all`, through
both tools, keep a CRLF file's line endings by [`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017), which reads clause 2's test; and REQ-TOOLS-136's
levels and their order are unchanged *(— revision 2)*.

> Level 3's comparison is narrowed by [`PD-TOOLS-019`](pd-tools-019.md#pd-tools-019) ([OQ-280](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)).

> Revision 1 said, and no longer governs: "Everything outside this case — level 1, `replace_all`, several windows, and
> `haet_edit` and its alias `haet` ([`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014)) — is REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as
> written, and REQ-TOOLS-136's levels and their order are unchanged."

1. **Pairing, at level 2, and at level 3 for blank lines** *(— revision 4)*. The lines of `new_string` SHALL be paired with the
   lines of `old_string` by exact text equality: first the longest run of equal leading lines; then the longest run of equal trailing lines, which does not overlap
   the leading run; then a longest common subsequence of the lines between, chosen by this walk from the front — pair the two
   current lines when they are equal; otherwise skip the `old_string` line when that leaves the remaining common subsequence no
   shorter, and skip the `new_string` line otherwise. When the lines between are more than 4,000,000 line pairs (the product of
   their counts), only the two runs pair. Every paired line of `new_string` SHALL be written as the corresponding line of the
   window, verbatim, including its trailing whitespace and carriage return. At level 3 the pairing runs over `old_string` and
   `new_string` as the caller gave them, before `PD-TOOLS-015`'s shift, and only a pair whose `old_string` line holds no visible
   character is written as the window's line; every other line of the replacement is `PD-TOOLS-015`'s *(— revision 4)*.

   > Revision 3 said, and no longer governs, the heading alone: "**Pairing, at level 2 only.**" — under which a blank line that
   > `PD-TOOLS-020` matches without its whitespace would be written as `new_string` gave it, dropping a whitespace-only line's
   > bytes or a CRLF window's `\r` where clause 2 does not restore it.
2. **Line endings, at levels 2, 3 and 4.** The window is CRLF when at least one of its lines is followed by a line break in the
   file and every such line ends in `\r`; a window with no such line is CRLF when the file's lines outside it pass the same
   test. On a CRLF window, every line of the replacement that a line break follows in the result SHALL gain `\r` when it lacks
   one; a `\r` is never doubled, and the replacement's last line is followed by a line break exactly when the window's last line
   was. Any other window's unpaired lines are written as given.
3. **Success.** When clause 2 added at least one `\r`, the success SHALL add the sentence `new_string was written with the
   file's CRLF line endings.` after "Match level: N." — after `PD-TOOLS-015`'s sentence at level 3, and after "Verify the
   result." at level 4. Every other success is unchanged.
4. **No-op, at levels 2, 3 and 4** *(— revision 3)*. When the single window's result, after `PD-TOOLS-015` and clauses 1 and
   2, equals the file's bytes, the call SHALL fail before writing: no undo entry is pushed and the read record does not change.
   The reply SHALL be: `old_string matches <p> only at match level <N> (lines <a>-<b>), and those lines already hold new_string
   as this edit would write it; nothing to change. Use write_file's 'overwrite' to write a file exactly as given.` — for a
   one-line window `(line <a>)`. The lines are the window's, numbered from 1 and cut at the file's last line.

**Why, and what it costs.** REQ-TOOLS-136 says "a window match replaces whole lines" and is silent on what the replacement lines
carry. On a CRLF file a multi-line `old_string` written with `\n` alone matches only at level 2, since stripping trailing
whitespace strips the `\r`, and the build wrote `new_string`'s LF lines over the window: probed at `d1f081c`, `one\r\ntwo\r\nthree\r\n`
edited `one\ntwo` → `ONE\ntwo` left `ONE\ntwo\nthree\r\n` beside "2 lines replaced by 2 at line 1 (+2 -2)", the unchanged `two`
counted as changed because it lost its `\r`, and a replaced line's trailing spaces that `new_string` does not repeat (a Markdown
hard break) were dropped. Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are ordinary, so this is the
common multi-line edit. Line endings belong to the file and say nothing of the caller's intent, and a line the caller repeats
from `old_string` unchanged was not meant to change, so the tool already knows what to write; there is nothing ambiguous to
refuse, and a level-2 refusal would fix nothing (its retry matches at level 1 and writes `new_string`'s LF lines verbatim).
Levels 3 and 4 share the apply: an LF `old_string` with a typo on a CRLF file matches at level 4 and wrote the same mixed
endings. The walk is the one the diff row's line LCS already takes, written out so a second implementation can reproduce it.
Clause 4 *(— revision 3)*: carried this way, a window edit can land on the window's own bytes, and the build rewrote the
file unchanged beside a success — probed by fin38, `one\r\ntwo\r\nthree\r\n` edited `one \ntwo` → `one\ntwo` answered "2 lines
replaced by 2 at line 1 (+0 -0). Match level: 2. new_string was written with the file's CRLF line endings.", false three times
over, with an undo entry that restored the same content and pushed a real one out of REQ-TOOLS-132's ten; an LF file does the
same at level 2 (`foo ` → `foo` on `foo`), and a level-4 retry of an edit that already landed does it on any file. Every other
edit path refuses its no-op (REQ-TOOLS-135's identical strings, `haet_edit`, `PD-TOOLS-017` clause 3), and clause 4's reply
differs from `PD-TOOLS-017`'s because at levels 2 to 4 the difference may be whitespace, indentation or a fuzzy near miss
rather than line endings. What it costs: a window edit can no longer convert CRLF lines to LF, nor strip an unchanged line's
trailing whitespace, and a window edit that would leave the file's bytes unchanged is refused rather than applied *(— revision
3)* —
`overwrite` still does either, and an exact level-1 `old_string` still strips an unchanged line's trailing whitespace other
than its `\r` ([`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017)) *(— revision 2)*; where `old_string` repeats a line, the walk fixes which copy's
bytes a paired line takes; `write_file` and `haet_edit` still differ at level 2 (one applies, the other refuses with the
quote); and an implementation built from the specification alone writes `new_string` as given.

> Revision 1 said, and no longer governs: "`overwrite` or an exact level-1 `old_string` still does either" — false once
> `PD-TOOLS-017` keeps a CRLF file's line endings at level 1 too.

> Revision 2 said, and no longer governs: "What it costs: a window edit can no longer convert CRLF lines to LF, nor strip an
> unchanged line's trailing whitespace —" — it applied an edit that changed nothing as a success.

> **Extends:** REQ-TOOLS-136, REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-246](../../archive/architecture/open-questions/52-spikes-and-later-questions-19.md#oq-246)); logged as [R-072](../requests.md#r-072).
Extends REQ-TOOLS-136 (fills its silence on what a window match's replacement lines carry) and REQ-TOOLS-135 (one sentence
added to the edit's success).*

> **First execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin36):** the rule held as written. `carryWindow`
> (`packages/agent-tools/src/tools/files.ts`) returns the replacement and whether it added a `\r`; `writeFileTool`'s edit branch
> calls it for every single-window match above level 1, after `shiftNewString` at level 3, and appends clause 3's sentence;
> clause 1's pairing is `linePairs` in `diff.ts`, which shares the head-and-tail trim and the table walk (`commonEnds`,
> `tableWalk`) with `lcsChanges`, so the pairing and the diff row's count come from one walk and the row's drawing is unchanged;
> `write_file`'s description gains one sentence. **What was measured.** Twelve cases under "PD-TOOLS-016" in
> `packages/agent-tools/src/tools/tools.test.ts`, ten red on the code before (the probe, now `ONE\r\ntwo\r\nthree\r\n` with
> "(+1 -1)" and the sentence; an added line; an interior hard break between two changed lines; a changed line's own trailing
> spaces; a window ending at the unterminated last line; a one-line window read from the file, and an LF file beside it; a level-4
> LF `old_string`; a level-3 shift; the walk's choice between repeated lines; and the guard, red on the description sentence
> alone), two guards green before and after (a `new_string` already in CRLF, no doubled `\r`, no sentence; a mixed window), and
> four `linePairs` cases in `diff.test.ts`, one checking that every unpaired line is one the diff row counts. Every earlier
> `write_file`, `haet_edit` and diff case is unchanged. **Found:** the walk's tie rule chooses a later copy of a repeated
> line (`p q q r` → `P q R` pairs the second `q`), as the directive states; and level 1 is not covered: an exact match writes
> `new_string`'s LF lines into a CRLF file through both tools and `replace_all`, recorded as
> [`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md)
> and raised as [OQ-254](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-254) for a ruling. **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six
> autopsies records a level-2 `write_file` edit; no proof script drives `write_file` in the built app, and the executor runs
> unchanged inside the run host. Repairs
> [`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones`](../../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 3's first execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin39):** clause 4 held as written.
> `writeFileTool`'s edit branch compares the window path's result with the file right after `applyWindow` and before the undo
> entry, the read record and the write, and refuses a result equal to the file through `windowNoOpMessage`
> (`packages/agent-tools/src/tools/files.ts`); the level-1 and `replace_all` paths and `haetEditTool` are unchanged, and the
> description lists no edit outcome, so it is unchanged for this clause. **What was measured.** Four cases under "PD-TOOLS-016
> revision 3" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before and each asserting the exact reply, the
> file's bytes, the read record and `undo` answering "No edit history for <p>.": the probe (`one \ntwo` → `one\ntwo` on
> `one\r\ntwo\r\nthree\r\n`, level 2, "lines 1-2"); an LF file at level 2 (`foo ` → `foo` on `foo\n`, "line 1"); a level-3
> as-given `new_string` equal to the window (`a\nb` → `  a\n  b`); a level-4 retry of an edit already applied (an `old_string`
> with a typo, `new_string` the file's lines). One guard group is green before and after: a level-2 edit changing one byte applies
> with its success, and `PD-TOOLS-017`'s no-op keeps its text. **Found:** the clause's "lines <a>-<b>" needed a reading for a
> window that takes in the empty element after the file's final line break (`foo \n` → `foo\n` on `foo\n` matches a two-element
> window at level 2); the lines are cut at the file's last line, so it reads "line 1", stated in the clause and pinned by a case.
> *Corrected 2026-10-13 (fin40):* the build cut only the window's last line, so a window wholly in that empty element (`' '` →
> `''` on `foo\n`, level 2 at element 1) still named "(line 2)" for a one-line file (fin39's reviewer); `windowNoOpMessage` now
> cuts the first line too and it reads "line 1", pinned beside the case above
> ([`a-window-no-op-refusal-names-a-line-after-the-files-last-line`](../../defects/fixed/a-window-no-op-refusal-names-a-line-after-the-files-last-line.md)).
> **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six autopsies records a
> window edit that lands on the file's own bytes; no proof script drives `write_file` in the built app. Repairs
> [`a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success`](../../defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. The fixtures are LF files on Linux and no edit needed a window match.
> Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 4's first execution, 2026-10-14 (fin44):** reported under [`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020), with which it was
> built and measured (`tools.test.ts`, "PD-TOOLS-020": a whitespace-only window line paired with blank `old_string` and
> `new_string` lines written byte for byte, red on `a3be56c`; `edits-proof`'s `blank-lf`, the CRLF blank line the file's own).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `window`: a two-line LF `old_string` matched the CRLF file at level 2 only and applied with "Match level: 2." and the CRLF sentence, the unchanged line written verbatim and the file CRLF throughout (clauses 1 to 3); `noop-window`: the same window with `new_string` already what the file holds was refused in clause 4's words, "old_string matches crlf/window.js only at match level 2 (lines 2-3), and those lines already hold new_string as this edit would write it; …" (revision 3), the bytes unchanged; `shift` carried the endings at level 3 after `PD-TOOLS-015`'s sentence. **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First live execution, 2026-10-20** (the Windows ARM64 session's live run; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; packs `2026-10-20T07-55-35-723Z` (terminal, frictions) and `2026-10-20T08-14-16-333Z` (crlf), endpoint `katalyst`, unmetered; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)). `crlf` completed and passed: the `render.js` window edit kept every line's CRLF and landed at match level 2, its block at the file's depth. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
