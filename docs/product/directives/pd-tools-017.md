[Product directives](../directives.md) › PD-TOOLS-017

<a id="pd-tools-017"></a>

### PD-TOOLS-017 — an exact or replace-all edit keeps a CRLF file's line endings

**The case, stated exhaustively.** `write_file` is called with `operation: edit` and `old_string` matches at REQ-TOOLS-136
level 1, or `replace_all` is true; or `haet_edit` or its alias `haet` is called with a current `content_hash` and `old_string`
matches at level 1, or `replace_all` is true; in every case `old_string` is not empty and differs from `new_string`. Levels 2 to 4
stay [`PD-TOOLS-016`](pd-tools-016.md#pd-tools-016)'s, [`PD-TOOLS-015`](pd-tools-015.md#pd-tools-015)'s (level 3, `replace_all` false) and
[`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014)'s, so the cases are disjoint; matching itself is unchanged, and everything
outside this case is REQ-TOOLS-135's, REQ-TOOLS-136's and REQ-TOOLS-189's, exactly as written.

1. **The test, for each occurrence.** The touched lines run from the line holding the span's first character to the line
   holding its last (a line break belongs to the line it ends). The occurrence is CRLF by `PD-TOOLS-016` clause 2's test read on
   those lines: at least one of them is followed by a line break in the file, and every such line ends in `\r`. When no touched
   line is followed by a line break, the file's other lines are read the same way.
2. **The write.** For a CRLF occurrence, every `\n` that lies within the written replacement, and a `\n` that is the character
   directly after it in the result, SHALL gain a `\r` when the character before it in the result is not `\r`. A `\r` is never
   doubled, and no other byte changes. Every other occurrence is written as given.
3. **No-op.** When the result's bytes equal the file's, the call SHALL fail before writing: no undo entry is pushed and the read
   record does not change. The reply SHALL be: `old_string and new_string differ only in line endings, which an edit keeps as
   the file's; nothing to change. Use write_file's 'overwrite' to change a file's line endings.`
4. **Success.** When at least one `\r` was added, the success SHALL add the sentence `new_string was written with the file's
   CRLF line endings.` after REQ-TOOLS-135's message, and for `haet_edit` and `haet` before ` content_hash:`. The line counts
   describe the bytes written.

**Why, and what it costs.** REQ-TOOLS-136's level 1 is "exact" and its replace-all "replaces every exact occurrence as plain
text", and REQ-TOOLS-189's `haet_edit` matches "exact text"; the build wrote `new_string` as given, so on a CRLF file a one-line
anchor replaced by several lines written with `\n` alone left LF lines among CRLF ones beside a clean success: probed by fin36,
`one\r\ntwo\r\n` edited `one` → `ONE\nX` left `ONE\nX\r\ntwo\r\n`, through both tools and `replace_all`
([OQ-254](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-254)). Windows is the only platform shipped (`PD-STARTUP-001`), where CRLF files are
ordinary, and this is the commonest small edit. `PD-TOOLS-016` already ruled that line endings belong to the file and say
nothing of the caller's intent; its own recovery path finished mixed too, since `PD-TOOLS-014`'s quote ends in the file's `\r`
(`one\r\ntwo\r`) and a retry with `ONE\ntwo` took that `\r` with it, which is why clause 2 reads the result and covers the
break after the span. Level-1 drift also defeated `PD-TOOLS-016` later, since a window holding an LF line fails its test. What it
costs: an edit can no longer write LF lines into a CRLF file (`write_file`'s `overwrite` still can; `haet_edit` has no
overwrite); an edit that differs only in line endings is refused rather than applied; a mixed file keeps the old behaviour; a
model that predicts its own bytes may meet one `PD-TOOLS-014` near miss over a span it wrote with LF; and an implementation built
from the specification alone writes `new_string` as given.

> **Narrows:** REQ-TOOLS-136, REQ-TOOLS-189
> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-254](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-254)); logged as [R-072](../requests.md#r-072).
Narrows REQ-TOOLS-136 (level 1's "exact" and replace-all's "as plain text" keep a CRLF occurrence's line endings) and
REQ-TOOLS-189 (`haet_edit`'s level-1 apply, whose matching stays exact); extends REQ-TOOLS-135 (one success sentence and one
refusal).*

> **First execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin38):** the rule held as written. `carryExact`
> (`packages/agent-tools/src/tools/files.ts`) walks the occurrences of one exact `old_string` — the single level-1 match, or every
> `replace_all` occurrence — and builds the result as it goes, so clause 2's "the character before it in the result" is read on
> what is already written, the previous occurrence's replacement included; `crlfLines`, factored out of `carryWindow`, is the one
> test both directives read. `writeFileTool`'s edit branch and `haetEditTool` call it at level 1 and for `replace_all`, refuse
> through clause 3 before the undo entry and the write, append clause 4's sentence, and pass the written replacements to
> `replaceAllMessage`, which now splices them into each region; `applyMatch` lost its level-1 branch and became `applyWindow`.
> Both descriptions say "An edit keeps a CRLF file's line endings". **What was measured.** Nine cases under "PD-TOOLS-017" and
> the reversed pinned case under "PD-TOOLS-016" in `packages/agent-tools/src/tools/tools.test.ts`, nine red on the code before
> (the probe, `ONE\r\nX\r\ntwo\r\n` with "1 line replaced by 2 at line 1 (+2 -1)" and the sentence; `haet_edit` and `haet` at level
> 1, the sentence before ` content_hash:`; the `PD-TOOLS-014` retry `one\r\ntwo\r` → `ONE\ntwo`, giving `ONE\r\ntwo\r\nthree\r\n`;
> `\r\ntwo` → `\nTWO`; `replace_all` through both tools, counted "2 lines replaced by 4 (+4 -2)", and over a CRLF region and an
> LF region, carried in the CRLF region only; the no-op `a\r\nb` → `a\nb` refused through both tools and by `replace_all`, the
> file and the undo stack unchanged; a span in the unterminated last line read from the file's other lines; the descriptions),
> one group of guards green before and after (a `new_string` already in CRLF, no doubled `\r` and no sentence; an LF file; a
> mixed span; a one-line `new_string`). Every earlier `write_file`, `haet_edit`, `replace_all` and diff case is unchanged.
> **Found:** the probe the ruling asked for — a `PD-TOOLS-016` window edit can land on the file's own bytes beside a success:
> `one \ntwo` → `one\ntwo` on `one\r\ntwo\r\nthree\r\n` answers "(+0 -0). Match level: 2. new_string was written with the file's
> CRLF line endings." with the file unchanged and an undo entry pushed, recorded as
> [`a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success`](../../defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md)
> and raised as [OQ-260](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-260); and `insert` writes LF lines into a CRLF file
> (`a\r\nb\r\n` with `X` at line 1 gives `a\r\nX\nb\r\n`), recorded as
> [`a-write-file-insert-writes-lf-lines-into-a-crlf-file`](../../defects/fixed/a-write-file-insert-writes-lf-lines-into-a-crlf-file.md) and
> raised as [OQ-259](../../architecture/open-questions/55-spikes-and-later-questions-22.md#oq-259). A `replace_all` whose `old_string` is empty is outside the case
> and keeps its build. **Found in review (fin38):** `crlfLines` walked every line of the file for each question, and a `replace_all` asks once
> per occurrence, so carrying one grew with the square of the file's length — 2,852 ms for 50,000 CRLF lines with a token on each
> (load 1.8 on 4 CPUs), where the split and join it replaced was linear. It now reads only the lines it tests, and the unterminated
> last element's other lines once per call; the same file carries in 27 ms and 200,000 lines in 141 ms (load 0.8), and a case
> under "PD-TOOLS-017" counts the test's reads (at most 4 for two lines of 10,000; 10,004 before the repair).
> **What was not measured.** No live run: the live-run fixtures are LF files on Linux, and none of the six
> autopsies records an edit on a CRLF file; no proof script drives `write_file` or `haet_edit` in the built app, and the
> executors run unchanged inside the run host. Repairs
> [`a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file`](../../defects/fixed/a-level-1-edit-writes-new-strings-lf-lines-into-a-crlf-file.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `exact`: a one-line anchor replaced by two LF lines at level 1 landed CRLF with clause 4's sentence and no match level named; `replace-all`: `alpha` replaced by two LF lines at both occurrences landed CRLF with the sentence; `noop-endings`: an exact `old_string` with CRLF and `new_string` the same with LF was refused in clause 3's words; `retry` (`haet_edit`) placed the sentence before ` content_hash:` (clause 4). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First live execution, 2026-10-20** (the Windows ARM64 session's live run; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; packs `2026-10-20T07-55-35-723Z` (terminal, frictions) and `2026-10-20T08-14-16-333Z` (crlf), endpoint `katalyst`, unmetered; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../../architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)). `crlf` completed and passed: the two-line `replace_all` on `list.txt` (#17) and the multi-line `haet_edit` on `greet.js` (#23) each kept every CRLF and said they wrote the file's CRLF endings. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
