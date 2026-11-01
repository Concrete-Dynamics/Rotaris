[Product directives](../directives.md) › PD-TOOLS-014

<a id="pd-tools-014"></a>

### PD-TOOLS-014 — a `haet_edit` miss that matches but for whitespace names the level and quotes the file's lines

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-252](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-252)) — **a quote
whose text occurs more than once**: clause 5 and the "Several windows" paragraph each gain the flag, and revision 1's text is
quoted beneath each.*

*Revision 3 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-280](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280) with
[`PD-TOOLS-019`](pd-tools-019.md#pd-tools-019)) — **the line endings at level 3**: the case's level-3 parenthetical names the carriage return
set aside, and clause 2 at level 3 adds one sentence when the line endings differ too; revision 2's text is quoted beside each
changed clause. [`PD-TOOLS-015`](pd-tools-015.md#pd-tools-015) clause 4's refusal inherits the sentence through clause 2.*

*Revision 4 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-295](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-295) with
[`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020)) — **blank lines at level 3**: the case's level-3 parenthetical names the lines with no visible
character, and clause 2's level-3 sentence names the lines that hold one when the window holds a blank line; revision 3's text
is quoted beneath each. `PD-TOOLS-015` clause 4's refusal inherits the wording through clause 2.*

**The case, stated exhaustively.** `haet_edit` or its alias `haet` is called with a `content_hash` equal to the SHA-256 of the
file's current bytes, `old_string` and `new_string` different, `replace_all` false; `old_string` matches nowhere at REQ-TOOLS-136
level 1; and it matches at level 2 (each line equal once trailing whitespace, a carriage return included, is ignored) or level 3
(each line equal once one uniform leading prefix is added or removed, a carriage return ending a line set aside
(`PD-TOOLS-019`), and a line with no visible character matching a line with none, whatever whitespace either holds
(`PD-TOOLS-020`)) *(— revision 4)*. Everything outside this case is REQ-TOOLS-189's, exactly as written.

> Revision 3 said, and no longer governs: "… or level 3 (each line equal once one uniform leading prefix is added or removed, a
> carriage return ending a line set aside (`PD-TOOLS-019`))" — under which a blank line took part in the shift, so a block with a
> blank interior line never reached level 3 and its miss was the plain one.

> Revision 2 said, and no longer governs: "… or level 3 (each line equal once one uniform leading prefix is added or removed)."
> — which, as built, compared the `\r` of a CRLF line, so an LF `old_string` one indent off never reached level 3 on a CRLF file.

**One window.** The edit SHALL NOT be applied, the file SHALL NOT be written, no undo entry SHALL be pushed, and the read
record SHALL NOT change; the call fails. Its reply SHALL open with the sentence `old_string was not found exactly in <path>.`
and then:

1. name the match level in the specification's words ("match level 2" or "match level 3") and the window's 1-based line range;
2. say in words what differs: at level 2, the lines whose trailing whitespace or carriage return differs; at level 3, the
   leading prefix the file's lines carry in addition to, or instead of, `old_string`'s, quoted as JSON with its length, and,
   when any window line and its `old_string` line differ by a trailing `\r`, the sentence `The line endings differ too: CRLF in
   the file and LF in old_string. The quoted text carries the file's line endings.` (or, the other way round, `LF in the file
   and CRLF in old_string`, read on the first such line) *(— revision 3)*; when the window holds a line with no visible
   character, the level-3 sentence reads `Every line of the file that holds a visible character carries the leading prefix …
   in addition to old_string's indentation.` (deeper) or `Every line of old_string that holds a visible character carries the
   leading prefix … that the file's lines do not.` (shallower), and is otherwise unchanged *(— revision 4)*;

   > Revision 3 said, and no longer governs, the level-3 sentence alone: "Every line of the file carries the leading prefix …"
   > (and "Every line of old_string carries …") — false of a blank line once `PD-TOOLS-020` leaves it out of the shift.

   > Revision 2 said, and no longer governs: "say in words what differs: at level 2, the lines whose trailing whitespace or
   > carriage return differs; at level 3, the leading prefix the file's lines carry in addition to, or instead of,
   > `old_string`'s, quoted as JSON with its length;" — silent on the line endings a level-3 window and `old_string` may differ
   > in once `PD-TOOLS-019` sets the `\r` aside.
3. state that the caller's content_hash is still current and that nothing was written;
4. ask that `new_string` carry the file's indentation and line endings;
5. quote the window's exact text — the file's lines over that range joined by `\n`, so that sent back as `old_string` with the
   same hash it matches at level 1 — as one JSON string, when that string is at most 30,000 characters. A longer window SHALL
   NOT be quoted, and the reply SHALL direct `haet_read` with that window's offset and limit instead. When the quoted text
   occurs more than once in the file at REQ-TOOLS-136 level 1, the reply SHALL say so among its facts, before the quote: it
   SHALL name the count and the line where each occurrence starts, listing at most 10 and then "and N more"; it SHALL NOT say
   the quote matches exactly when sent back alone; and it SHALL ask that a neighbouring line, unchanged, be added to both
   `old_string` and `new_string`, giving `haet_read`'s offset and limit for the window and one line on each side, clamped to the
   file. The over-30,000-character direction carries the same sentence. The quote SHALL NOT be widened *(— revision 2)*;

   > Revision 1 said, and no longer governs: "quote the window's exact text — the file's lines over that range joined by `\n`,
   > so that sent back as `old_string` with the same hash it matches at level 1 — as one JSON string, when that string is at
   > most 30,000 characters. A longer window SHALL NOT be quoted, and the reply SHALL direct `haet_read` with that window's
   > offset and limit instead;" — silent on whether that level-1 match is unique, so a quote whose text recurs inside a longer
   > line was promised to match exactly and the retry was refused "Found 2 occurrences".
6. end with: if these are not the lines meant, read the file again with `haet_read`.

The facts SHALL come before the quote, so that REQ-SESSION-136's 2,000-character error record keeps them.

**Several windows.** When more than one window matches at the deciding level, the reply SHALL open with the same sentence,
name the level and each window's starting line, quote nothing, and direct `haet_read` with an offset and limit. When any
window's text occurs more than once in the file at level 1, the reply SHALL add clause 5's sentence for those windows: the
count and the lines where each occurrence starts, at most 10, and a neighbouring line, unchanged, in both `old_string` and
`new_string`, with `haet_read`'s offset and limit for the window and one line on each side *(— revision 2)*.

> Revision 1 said, and no longer governs: "When more than one window matches at the deciding level, the reply SHALL open with
> the same sentence, name the level and each window's starting line, quote nothing, and direct `haet_read` with an offset and
> limit." — whose "send its exact text as old_string" fails the same way when the windows' text is identical.

**Unchanged.** A level-4 match and no match reply as REQ-TOOLS-189 fixes ("… Read it again with haet_read."); `replace_all`
true keeps its own miss; the stale-hash refusal keeps its words and its rule that it SHALL NOT quote the file's content; and
`haet_edit` still applies a level-1 match only. REQ-TOOLS-136's levels are unchanged, and `write_file` is untouched.

**Why, and what it costs.** The final duress live run at `a68f121` (finding D5; pack `2026-10-07T07-09-30-708Z`, session
`e6747bd0`) measured the miss as built: wave3 failed 6 of its 14 `haet_edit` calls with "not found exactly" and followed each
near miss with a `sed -n … | cat -A` probe (#293, #298, #305, #322), and wave3b did the same after #382 (#380, #385, #386) —
7 failed edits, about 14 extra steps and 63 s inside the two children the 1200 s ceiling cut off. Replayed through the build's
`matchEdit` over `docs/verification.md` rebuilt from the store (every `haet_edit`'s hash checked against the rebuilt bytes),
#292, #297, #304, #315, #321 and #382 each match one window at level 3; #290 only at level 4. The build had computed that fact
and discarded it, and a re-read shows the caller the same invisible whitespace it misjudged. The quote is safe because it is
sent only after the hash matched: it is text the caller's hash already names, and the stale-hash case, where the content has
moved, keeps its rule. A JSON string is chosen over REQ-TOOLS-134's `N: line` form because these misses are about characters
nobody can see — a trailing space, a tab, a `\r`. On a CRLF file a multi-line `old_string` written with LF matches only at
level 2, and the quote shows the `\r`. Applying at level 2 or 3 was rejected: `write_file`'s level-3 apply writes `new_string`
unshifted, so a caller wrong about the indentation in `old_string` would land a mis-indented block beside a success, and a
level-2 apply drops trailing spaces and `\r`. What it costs: each near miss is still one failed call and one `tool_error` issue
(REQ-SESSION-136); a second implementation built from the specification alone returns the plain miss; and a near-miss reply
carries up to the window's size.

> **Narrows:** REQ-TOOLS-189

*Raised under the owner's delegation, 2026-10-07, ruling live-run finding D5 (OQ-231); logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin32):** the rule held as written. `matchEdit`
> (`packages/agent-tools/src/tools/files.ts`) returns an `EditMatch` whose level-3 result carries each window's `shifts`;
> `haetEditTool`'s miss branch answers a level-2 or level-3 match through `nearMissMessage` and keeps REQ-TOOLS-189's reply for
> a level-4 match or none; `haet_edit`'s description gains the sentence. **What was measured.** Five cases under "PD-TOOLS-014"
> in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before (trailing spaces; a CRLF file with an LF
> `old_string`, the quote carrying `\r` and the retry leaving no LF-only line; two spaces more, one fewer and a tab; several
> windows; a window over 30,000 characters), and a sixth guarding the unchanged replies (level 4, no match, `replace_all`, the
> stale hash naming no hash and quoting nothing). The pack's own misses, replayed through the built tool over
> `docs/verification.md` rebuilt from the store: #290 still reads the plain miss (level 4); #292, #297, #304, #315, #321 and
> #382 each name their lines at match level 3 and "the leading prefix \" \" (1 character) that the file's lines do not", and
> each quote sent back with the same hash applied (6 of 6). **Found:** every one of the six carried the same extra space in
> `new_string`, so a retry with the quote and the model's own `new_string` would still write the block one space deep; the
> reply's "Give new_string the file's indentation" is the only guard, and `write_file`'s level-3 apply, which writes such a
> `new_string` unshifted beside a success, is raised as OQ-233. **What was not measured.** No live run: the next default and
> duress runs are the measurement, read by `live-run.mjs`'s NOTE (`lib/near-miss-edits.mjs`: near misses, terminal probes
> before the next edit, target 0, and retries that succeeded). No proof script drives `haet_edit` in the built app; the
> executor runs unchanged inside the run host. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Found by the bundle's review, 2026-10-07, before it landed:** the build first took every level-2 or level-3 result as a
> near miss, and `matchEdit` finds an empty or whitespace-only `old_string` at level 2 on any blank line; the reply then quoted
> `""` (or a blank line) and promised it would match exactly, which clause 5's quote never can, so the caller retried the same
> string forever. The miss branch now answers through `nearMissMessage` only when `old_string` holds a visible character, and an
> empty or whitespace-only `old_string` keeps REQ-TOOLS-189's plain reply; with a visible character every matching window holds
> it, so the quote is non-empty text of the file and clause 5 holds. Pinned by a seventh case under "PD-TOOLS-014", red on the
> code before ([`haet-edit-quotes-an-empty-window-for-a-blank-old-string`](../../defects/fixed/haet-edit-quotes-an-empty-window-for-a-blank-old-string.md)).
>
> **Revision 2's first execution, 2026-10-13, built under [R-072](../requests.md#r-072) (fin36):** the rule held as written.
> `nearMissMessage` (`packages/agent-tools/src/tools/files.ts`) counts each quoted window's occurrences with `levelOneLines`,
> the search `matchEdit`'s level 1 runs, and adds the flag only when the text occurs more than once; both voices (this
> directive's and `PD-TOOLS-015`'s) take it through the one function. **What was measured.** Four cases under "PD-TOOLS-014"
> and one under "PD-TOOLS-015" in `packages/agent-tools/src/tools/tools.test.ts`, each red on the code before: `x = 1` /
> `max = 1` with `old_string` `x = 1 ` (the flag before the quote, no "matches exactly", the bare retry refused "Found 2
> occurrences of old_str at lines 1, 2", the retry with line 2 in both strings applied); twelve occurrences listed as ten "and 2
> more"; a window over 30,000 characters that recurs; identical several windows flagged, distinct ones word for word; and
> `write_file`'s level-3 refusal in `read_file`'s voice, its retry the same. **Found:** the several-windows case pinned since
> revision 1 (`x \ny\nx \ny\n`, `old_string` `x\ny`) has two identical windows, so its reply now carries the flag — the
> ruling's reading that identical windows are the several-windows reply's common case, met by the very case that pinned it;
> its expectation was updated, and a distinct-windows case keeps revision 1's words. **What was not measured.** No live run: the
> next default and duress runs are the measurement, read by `live-run.mjs`'s NOTE (`lib/near-miss-edits.mjs` now counts
> retries refused "Found N occurrences", target 0). Repairs
> [`a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly`](../../defects/fixed/a-near-miss-quote-that-occurs-more-than-once-is-promised-to-match-exactly.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Every `haet_edit` and `write_file` edit applied first time or failed on a stale hash, never on a level-2 or level-3
> near miss (3 + 9 edits at `552d346`'s default pack, 13 + 5 in its duress pack, 21 at `0bc3eee`), and the harness NOTE read "no
> haet_edit miss matched at match level 2 or 3" each time. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **In the built app, 2026-10-13 (fin42, N52):** `pnpm edits-proof` drove this directive through the run host on a CRLF, tab-indented fixture it generates (`apps/desktop/scripts/lib/crlf-fixture.mjs`), the scripted coordinator's calls sent by the new step `tool:<key>`; load average 6.8 to 12.2 on four CPUs beside a sibling plan. **Held as written.** `near`: a `haet_edit` whose two-line LF `old_string` met the CRLF file at match level 2 was refused, named "match level 2" and lines 2-3 before the quote, and quoted the window as `"\tconst greeting = 'Hello';\r\n\tif (name) {\r"`; `retry`, that quote sent back with the same hash, applied with `PD-TOOLS-017`'s sentence before ` content_hash:`; the file stayed CRLF throughout, and `lib/near-miss-edits.mjs`'s reading counted one level-2 miss, retried, not probed. **Found:** on a CRLF file an LF `old_string` one indent off never reaches level 3 (the `\r` takes part in level 3's comparison), so this directive's level-3 near miss is not given there: the plain miss is ([`on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3`](../../defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md), raised as [OQ-280](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280)). **What was not measured.** No live run. The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`, default set) is written and unit-tested and is the orchestrator's to run; what it reads depends on the shapes the model chooses. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Revision 4's first execution, 2026-10-14 (fin44):** reported under [`PD-TOOLS-020`](pd-tools-020.md#pd-tools-020), with which it was
> built and measured (`tools.test.ts`, "PD-TOOLS-020": the qualified sentence in `haet_edit`'s near miss and in `PD-TOOLS-015`
> clause 4's refusal, both red on `a3be56c`).

> **Since `PD-TOOLS-019` and revision 3, 2026-10-14 (fin43):** the "Found" above is repaired: level 3 sets a line's trailing `\r` aside, so an LF `old_string` one indent off on a CRLF file is this directive's level-3 near miss, and the reply names the line endings (clause 2, revision 3). `edits-proof`'s new `near-lf` step asserts it in the built app, with its quote retried by `retry-lf` and applied; the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
