## An edit reports the old string's line count as the lines it changed

`write_file`'s `edit` and `haet_edit` both answer a single replacement with "Edited <path>: <k> lines changed at line
<n>.", where `k` is the line count of `old_string` and nothing else. The count says nothing about what the edit did: a
4-line `old_string` replaced by a 9-line `new_string` is reported as "4 lines changed", while the row's own diff reads
`+5 -0`; a replacement that deletes lines, or that rewrites one line of a long `old_string`, is reported the same way. A
model that checks the report against what it asked for reads a contradiction and spends a call verifying the file.

Live-run finding: G6 of the final default live run at `27a5127`.

Recorded 2026-10-06 from the autopsy of that run.

## Specs

- `REQ-TOOLS-135`: "Success messages report lines changed/created/inserted/replaced." The edit's message reports the old
  string's size, which is neither the lines the edit changed nor the lines it replaced them with.
- `REQ-TOOLS-189` fixes `haet_edit`'s old-string/new-string surface as `write_file`'s; its message is built the same way.

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` (the `live` worktree; git-ignored), scenario `edit`, session
`06916702`:

- Tool call #16 (`write_file`, `operation: edit` on `src/todos.js`): `old_string` 4 lines, `new_string` 9 lines. Its result
  in `edit/model-traffic.jsonl` reads "Edited src/todos.js: 4 lines changed at line 38. (sha256 …)".
- `edit/transcript.md` row 28 (the row's diff): "src/todos.js +5 -0", five added lines and none removed.
- `edit/transcript.md` row 29: "Wait — the edit says "4 lines changed at line 38" — that's odd but let me verify the
  file."; row 30 (#17) re-reads `src/todos.js` to check.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:438-441` — `write_file`'s `edit`: `k = Math.max(1, lineCount(a.old_string))`
  and the message "… ${k} line(s) changed at line …".
- `packages/agent-tools/src/tools/files.ts:532-534` — `haet_edit`: the same count and message.
- `packages/agent-tools/src/tools/diff.ts` — `renderDiff`, the row's `+A -R` header, computed from the file before and
  after.

## Repaired — 2026-10-06 (fin18)

Both edit tools build a single replacement's message in one place, `replacementMessage`
(`packages/agent-tools/src/tools/files.ts`), from what the edit did rather than from `old_string`:

"Edited <path>: <k> lines replaced by <n> at line <start> (+<added> -<removed>)."

`k` is the region the match spans (the old string's lines, at least one), `n` is that region's length after the edit (`k`
plus the change in the file's line count, since no line outside the region moves), and `+added -removed` is the line LCS
of the two regions (`lineChanges`, `packages/agent-tools/src/tools/diff.ts`, the same LCS the row's `+A -R` header counts
with). A replacement that leaves no line reads "<k> lines removed at line <start> (+0 -<k>)". The run's edit would now read
"4 lines replaced by 9 at line 38 (+5 -0)", beside a row reading `+5 -0`. The words are REQ-TOOLS-135's ("lines …
replaced"), with the changed lines counted as the diff counts them. `replace_all` keeps "<n> occurrences replaced", which
was already true; the match-level note of REQ-TOOLS-136 still follows the message; `haet_edit` still ends with its
`content_hash`.

Pinned in `packages/agent-tools/src/tools/tools.test.ts`, "REQ-TOOLS-135: an edit reports the lines it replaced and the
lines it added and removed (write_file, haet_edit)": for each tool a replacement that grows (3 lines by 8, `+5 -0`, the
run's shape), shrinks (3 by 1, `+1 -3`) and keeps its line count (3 by 3, `+2 -2`), each message's counts equal to its diff
row's header; an edit inside one line ("1 line replaced by 1"), and a block removed outright. All eight were red on the
code before ("3 lines changed at line 3."). The first write_file test's message assertion follows the new form. No proof
drives an edit; the live run's `edit` scenario, the orchestrator's after landing, is where the model reads it next.

## Corrected — 2026-10-06 (fin18, repair round 1)

The region above was wrong for an edit that moves a line boundary, and is kept as written beside its replacement. "`n` is
that region's length after the edit (`k` plus the change in the file's line count, since no line outside the region
moves)" holds only while the old and new strings agree on ending in a newline: an old string ending in a newline its new
string lacks merges the following line into the replacement, a line outside the `k`-line region that did change. The
verifier's probe: `a\nb\nc\n` with `b\n` -> `x` (now `a\nxc\n`) read "1 line removed at line 2 (+0 -1)" beside a row
reading `+1 -2`, the same contradiction G6 recorded, in a new shape.

`replacementMessage` now reads the region from the file: from the match's first line to where the two texts' common
trailing lines begin, never ending before the last line the match spans. Every line outside it is equal on both sides, so
the region's line LCS is the whole file's, and the message's `+A -R` is the row's header (short of `renderDiff`'s
whole-replacement fallback past 4,000,000 cells, where the message stays exact and the row does not). The probe now reads
"2 lines replaced by 1 at line 2 (+1 -2)".

Pinned beside the earlier cases in `packages/agent-tools/src/tools/tools.test.ts`, for both tools: the old string ending
in a newline the new one lacks, the reverse, and the verifier's mid-line case (`= 1;\n` -> `= 10; `), each message's counts
equal to its row's header; and 300 seeded random single replacements over short lines, blank lines and newlines, each
message's counts equal to its header. The first, the third and the random cases were red on the round-0 region.

## Amended — 2026-10-06 (fin18, repair round 2)

"A replacement that leaves no line reads "<k> lines removed at line <start> (+0 -<k>)"" used a word REQ-TOOLS-135 does not
have: its success messages "report lines changed/created/inserted/replaced". Such a replacement now reads "<k> lines
replaced by 0 at line <start> (+0 -<k>)", the requirement's own word, with the counts unchanged. Pinned in
`packages/agent-tools/src/tools/tools.test.ts`, "a block removed outright is reported in REQ-TOOLS-135's word: replaced by
0" (red on the round-1 wording).
