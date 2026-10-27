[Product directives](../directives.md) › PD-TOOLS-015

<a id="pd-tools-015"></a>

### PD-TOOLS-015 — a level-3 `write_file` edit carries the window's shift into `new_string` when `new_string` shares `old_string`'s indentation, and refuses when it cannot tell

**The case, stated exhaustively.** `write_file` is called with `operation: edit`, `replace_all` false, `old_string` and
`new_string` different, and `old_string` holding a visible (non-whitespace) character; `old_string` matches nowhere at
REQ-TOOLS-136 levels 1 and 2, and it matches exactly one window at level 3 with the leading prefix P (added to `old_string`'s
lines when the file's are deeper, removed from them when the file's are shallower). Let O be the leading whitespace of
`old_string`'s first line that holds a visible character, W the leading whitespace of the window's corresponding line, and N
the leading whitespace of `new_string`'s first line that holds a visible character. Level 3 requires O and W to differ, so the
clauses below are disjoint. Everything outside this case — several level-3 windows, levels 1, 2 and 4, `replace_all`, an
`old_string` with no visible character, and `haet_edit` and its alias `haet` ([`PD-TOOLS-014`](pd-tools-014.md#pd-tools-014)) — is
REQ-TOOLS-135's and REQ-TOOLS-136's, exactly as written.

> Level 3's comparison is narrowed by [`PD-TOOLS-019`](pd-tools-019.md#pd-tools-019) ([OQ-280](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)).

> *Since [`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020) (2026-10-14, [OQ-295](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295)):* this case now reaches
> blocks holding blank lines — a line of `old_string` with no visible character matches a window line with none at any shift —
> and O and W above are where level 3 measures its prefix. The clauses are unchanged; what a blank line of `new_string` paired
> with a blank line of `old_string` writes is `PD-TOOLS-016` revision 4's.

1. **No visible character.** When `new_string` holds no visible character (a deletion), it SHALL be written as given and the
   reply SHALL be REQ-TOOLS-136's, unchanged.
2. **N equals O: the shift.** `new_string` SHALL take the window's shift. In the deeper direction P is prepended to every line
   of `new_string` that holds a visible character. In the shallower direction every such line must begin with P, and P is
   removed from each. Lines with no visible character are written as given. The success SHALL keep REQ-TOOLS-135's message and
   "Match level: 3." and add: `new_string was shifted by the same leading prefix <P as JSON> (<n> character(s) added|removed)
   to the file's indentation.`
3. **N equals W: as given.** `new_string` SHALL be written as given, and the success SHALL add after "Match level: 3.":
   `new_string already carries the file's indentation and was written as given.`
4. **Otherwise: refused.** In every other case — N equal to neither, or a shallower shift that a line of `new_string` holding a
   visible character cannot take because it does not begin with P — the edit SHALL NOT be applied, the file SHALL NOT be
   written, no undo entry SHALL be pushed, and the read record SHALL NOT change; the call fails. The reply SHALL open
   `old_string matches <path> only at match level 3 (indentation shift), and new_string's indentation matches neither
   old_string's nor the file's, so nothing was written.` — or, when a line lacks P, name that line of `new_string` and the
   prefix in place of the second clause — and then give `PD-TOOLS-014`'s clauses 1, 2, 5 and 6 with these differences: there
   is no hash, so its clause 3 is the opening's "nothing was written"; its clause 4 asks that both `old_string` and
   `new_string` carry the file's indentation; the quote, sent back as `old_string`, needs no hash; and every pointer names
   `read_file`. The window is quoted as one JSON string of at most 30,000 characters; a longer window is not quoted and the
   reply gives `read_file`'s offset and limit instead. The facts SHALL come before the quote, so that REQ-SESSION-136's
   2,000-character error record keeps them. Since `PD-TOOLS-014` revision 2 (2026-10-13, [OQ-252](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-252)),
   this clause inherits revised clause 5's flag, in `write_file`'s voice (`read_file`, no hash): a quote whose text occurs more
   than once in the file at level 1 is preceded by the count and the lines, is not said to match exactly, and asks for a
   neighbouring line, unchanged, in both strings.

**Why, and what it costs.** REQ-TOOLS-136 says a level-3 window "still matches" and that "a window match replaces whole
lines", and is silent on whether the replacement takes the shift that let `old_string` match; the build wrote `new_string`
unshifted (OQ-233). The only measurement points one way: in OQ-231's replay of the final duress pack at `a68f121`, all six
level-3 misses (#292, #297, #304, #315, #321, #382) carried the same extra space in `new_string` as in `old_string`, so through
`write_file` each would have landed one space off beside a success — a Markdown list item or code block changed, a Python or
YAML meaning changed. Shifting unconditionally breaks the opposite case, a `new_string` already at the file's depth, which as
built writes correctly. The indentation of `new_string`'s first visible line separates the two readable cases, and the tool
already holds the prefix (`EditMatch.shifts`); where the line matches neither, the tool cannot tell what the caller meant, and
a refusal costs one call where a wrong success costs a corrupted file the user may never notice. What it costs: one failed call
and one REQ-SESSION-136 `tool_error` issue per ambiguous level-3 edit; `write_file` and `haet_edit` differ at level 3 (the one
refuses every level-3 match, the other applies two of its cases); an implementation built from the specification alone writes
unshifted; and a caller that deliberately indents a block by exactly P while sharing `old_string`'s wrong indentation is shifted
twice, which takes a coincidence.

> **Narrows:** REQ-TOOLS-136
> **Extends:** REQ-TOOLS-135

*Ruled under the owner's delegation, 2026-10-13 ([OQ-233](../../architecture/open-questions/50-spikes-and-later-questions-17.md#oq-233)); logged as [R-072](../requests.md#r-072).
Narrows REQ-TOOLS-136 (a level-3 match the case names is refused rather than applied, and one is applied with a shifted
`new_string`); extends REQ-TOOLS-135 (one sentence added to the edit's success).*

> **First execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin35):** the rule held as written. `shiftNewString`
> (`packages/agent-tools/src/tools/files.ts`) returns the replacement — `shifted`, `as-given`, `blank` — or `refuse` with the
> line of `new_string` lacking the prefix; `writeFileTool`'s edit branch calls it for one level-3 window of an `old_string`
> with a visible character, applies the result with the clause's sentence after "Match level: 3.", or refuses through
> `nearMissMessage`, which now takes the tool's wording (`NearMissVoice`: opening sentence, hash sentence or none, the request,
> `haet_read` or `read_file`) so that `haet_edit`'s replies stay byte-identical; `EditMatch.shifts`'s comment no longer says
> `write_file` ignores it, and `write_file`'s description gains one sentence. **What was measured.** Nine cases under
> "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts` and one added expectation on the existing "level 3" case,
> red on the code before with seven of the nine (one space too deep in both strings, shifted; a tab too shallow, shifted; blank and
> whitespace-only lines of `new_string` left as given in both directions; the pinned case's "already carries the file's
> indentation"; a third depth refused with the file's bytes and undo stack unchanged and the quote applying when sent back; a
> shallower shift a line cannot take, refused naming line 2; a window over 30,000 characters not quoted, `read_file`'s offset
> and limit given), and two guards green before and after (a deletion's reply unchanged; levels 2 and 4, two level-3 windows,
> `replace_all` and `haet_edit`'s level-3 near miss word for word). **The pack replayed.** `docs/verification.md` rebuilt from the
> `a68f121` duress pack's store (`write_file` #289's create, then every `haet_edit` and `replace_content` that succeeded, in
> order; the hash of every `haet_edit` checked against the rebuilt bytes: every applied one, and 7 of the 8 that failed, #326 stale in the run too), and the
> six level-3 misses sent through the built `write_file`: #292, #297, #304, #315, #321 and #382 each applied with `new_string
> was shifted by the same leading prefix " " (1 character removed)`, the replacement's first line at the window's own
> depth (6 of 6); #290 still applies at level 4. **What was not measured.** No live run: `haet_edit` is preferred, so the next
> default and duress runs may not send a `write_file` edit that matches only at level 3; no proof script drives `write_file`
> in the built app, and the executor runs unchanged inside the run host. **Found:** the level-2 apply beside it writes
> `new_string`'s LF lines into a CRLF file, which this directive does not decide (raised as
> [OQ-246](../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-246),
> [`a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones`](../../defects/fixed/a-write-file-edit-at-match-level-2-on-a-crlf-file-writes-lf-lines-among-crlf-ones.md)).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No `write_file` edit result said "shifted" or was refused; each `old_string` was among the lines the agent had read
> or written, so all matched at level 1 by that proxy. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written, for the `old_string` that reaches level 3 on a CRLF file.** `shift`: an `old_string` one tab shallow that carries the file's `\r`s matched at level 3 and applied with "new_string was shifted by the same leading prefix \"\t\" (1 character added) to the file's indentation." and `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth and every line CRLF. **Found:** the shape a model sends, an LF `old_string` one tab shallow (`shift-lf`, recorded and not asserted), does not reach level 3 on a CRLF file: it applied at "Match level: 4 (similarity: 0.91). Verify the result." and wrote the block one tab too shallow beside a success — the case this directive was ruled to prevent, one level down ([`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md), raised as [OQ-280](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Since `PD-TOOLS-019`, 2026-10-14 (fin43):** the one-tab-shallow LF `old_string` on a CRLF file that `edits-proof`'s `shift-lf` step recorded at level 4 now matches at level 3, so clause 2 applies to it: `shift-lf` is asserted ("Match level: 3." with this directive's shift sentence, then `PD-TOOLS-016`'s CRLF sentence, the block at the file's depth), and clause 4's refusal carries `PD-TOOLS-014` revision 3's line-ending sentence through clause 2 (pinned in `tools.test.ts` under "PD-TOOLS-019"); the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
