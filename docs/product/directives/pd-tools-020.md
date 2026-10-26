[Product directives](../directives.md) › PD-TOOLS-020

<a id="pd-tools-020"></a>

### PD-TOOLS-020 — level 3 matches blank lines by having no visible character

**The case, stated exhaustively.** An edit's `old_string` matches nowhere at REQ-TOOLS-136 level 1 or level 2, and level 3 is
tried, each line read with one trailing `\r` set aside ([`PD-TOOLS-019`](pd-tools-019.md#pd-tools-019)). Then:

1. a line of `old_string` with no visible (non-whitespace) character SHALL match a window line with no visible character, at any
   shift and whatever whitespace either holds, and SHALL NOT match a window line that holds one;
2. the leading prefix SHALL be measured on `old_string`'s first line that holds a visible character and the window's line at the
   same index (`PD-TOOLS-015`'s O and W), and SHALL be added to or removed from only the lines that hold a visible character,
   each such pair equal once it is;
3. an `old_string` with no visible character SHALL NOT match at level 3.

Levels 1, 2 and 4, their order, and the rule that the first matching level decides are unchanged.

**Disjoint from the other narrowings of REQ-TOOLS-136.** This directive and `PD-TOOLS-019` decide **which windows match** at
level 3; [`PD-TOOLS-015`](pd-tools-015.md#pd-tools-015) decides **what a level-3 apply writes** for `write_file`'s single window (it already
writes a `new_string` line with no visible character as given); [`PD-TOOLS-016`](pd-tools-016.md#pd-tools-016) decides **the bytes** — by its
revision 4, a blank line of `new_string` paired with a blank line of `old_string` is written as the window's own line, byte for
byte; [`PD-TOOLS-017`](pd-tools-017.md#pd-tools-017) governs level 1 and `replace_all`. [`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014) revision 4 names the
lines that hold a visible character in its level-3 sentence when the window holds a blank one. None restates another.

**Why, and what it costs.** REQ-TOOLS-136's level 3 adds or removes "one and the same leading-whitespace prefix … to every line of
the candidate", and is silent on a line with no visible character. As built, a blank line took the prefix like any other — the bare
prefix in the deeper direction, a failed `startsWith` in the shallower — while the file's blank line is empty, so an indentation-
shifted block holding a blank line never matched at level 3 ([OQ-295](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295)). Measured with
`matchEdit` on `a`, `\t\tx = 1;`, an empty line, `\t\ty = 2;`, `z`: the block one tab shallow or one tab deep reached level 4 on an
LF file (similarity 0.89 and 0.90), where `write_file` applied it unshifted beside "Verify the result.", and nothing on a CRLF file.
A blank line inside a function body or between two statements is the commonest shape a multi-line edit carries, so the guarantee
`PD-TOOLS-015` was ruled for — a mis-indented block never lands beside a success — did not hold for it, and `haet_edit` gave the
plain miss. Editors do not indent blank lines consistently, so a blank line says nothing about the block's depth; reading it by
having no visible character is the reading `PD-TOOLS-015` already gives a blank `new_string` line. What it costs: level 3 takes
cases level 4 took, and a whitespace-only line of the file is matched by an empty one of `old_string` (and kept, byte for byte,
by `PD-TOOLS-016` revision 4); a blank line can no longer tell two otherwise equal windows apart at level 3; and the product
departs from an implementation built from the specification alone, which shifts every line.

> **Narrows:** REQ-TOOLS-136

*Ruled under the owner's delegation, 2026-10-14 ([OQ-295](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295); dated 2026-10-13 until fin46
corrected it from the consortium's ruling record); logged as
[R-072](../requests.md#r-072). Narrows REQ-TOOLS-136 at level 3 only. Comes with `PD-TOOLS-014` revision 4 and `PD-TOOLS-016`
revision 4, ruled with it; names `PD-TOOLS-015`, `PD-TOOLS-017` and `PD-TOOLS-019`, the other narrowings of REQ-TOOLS-136, each
carrying an in-place note where its text meets this one. The build's reading, kept as the falsified one: a blank line takes part
in level 3's shift like any other.*

> **First execution, 2026-10-14, built under [R-072](../requests.md#r-072) (fin44, `fin44-supervision-and-match`), with
> `PD-TOOLS-014` revision 4 and `PD-TOOLS-016` revision 4:** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) finds `old_string`'s first line with a visible character, skips a window whose line
> at that index is blank or at the same depth, takes the prefix from those two lines, and compares each pair — two blank lines
> equal, a blank and a visible one unequal, two visible ones by the shifted equality as before; `starts` and `shifts` keep their
> shape. `carryWindow` takes `new_string` as the caller gave it (the level-3 caller passes `a.new_string`) and at level 3 writes
> each line `linePairs` pairs with a blank `old_string` line as the window's own; the CRLF carry and `PD-TOOLS-016` clause 4's
> no-op refusal are unchanged. `nearMissMessage`'s level-3 sentence adds "that holds a visible character" only when a window line
> has none. **What was measured.** Nine cases under "PD-TOOLS-020" in `packages/agent-tools/src/tools/tools.test.ts`, each red
> on `a3be56c` (the defect note's four cells through `write_file`; a blank first line of `old_string`; a whitespace-only window
> line kept byte for byte; a blank `old_string` line never matching a visible window line; `haet_edit`'s qualified near miss and
> its quote retried at level 1; a `PD-TOOLS-015` clause 4 refusal in the qualified wording), and a guard case green before and
> after (no visible character never at level 3; level 2 first); every earlier `PD-TOOLS-014` to `PD-TOOLS-019` case unchanged
> and green. In the built app, `pnpm edits-proof` green at load 1.7 to 2.5 on 4 CPUs with a new `blank-lf` step on the CRLF
> fixture (`lib/crlf-fixture.mjs`'s `BLANK_LINES`): "Match level: 3." with the shift sentence and the CRLF sentence, "(+1 -1)",
> the exact bytes, the blank line the file's own `\r\n`; on a build with `a3be56c`'s `files.ts` the same step failed — "Match
> level: 4 (similarity: 0.89). Verify the result.", the block one tab too shallow. **Found:** on that nine-line CRLF file the
> as-built result was level 4, not the "no match" the defect note's five-line file gave; the cell depends on the window's
> similarity, and both readings are outside level 3. **What was not measured.** No live run: the `crlf` scenario, which fails a
> level-4 window edit whose `old_string` was a uniform indent off, is the orchestrator's. Repairs
> [`a-block-with-a-blank-interior-line-never-matches-at-level-3`](../../defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
