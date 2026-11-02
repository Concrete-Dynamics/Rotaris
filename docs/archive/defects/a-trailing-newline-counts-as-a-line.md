## A trailing newline counts as one more line in `write_file` and `read_file`

`write_file` and `read_file` count lines as `content.split('\n').length`, so a file whose last line ends in a newline
is reported one line longer than it is: `probe-ok\n` (9 bytes) is "2 line(s) created", its diff shows an empty line 2,
and `read_file` reports `total_lines: 2`. The model doubted its own write and spent a terminal call on `cat -A` and `wc`
to check it. The same messages carry the literal "(s)" plural marker.

Live-run finding: L6 (live runs of 2026-09-29)

## Specs

- No requirement defines the count (`REQ-TOOLS-134`). `REQ-TOOLS-110` and `REQ-TOOLS-134` themselves spell "byte(s)" and
  "match(es)"; `REQ-SHELL-044` forbids the literal "(s)" only where text reaches a surface (the "(s)" half is L11's).

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `aef2f7f4` (`frictions`): #7 wrote `probe-ok\n`, "Created friction-probe.txt: 2 line(s) created.",
  diff "+2 -0"; #19 `read_file` `total_lines: 2`; thinking row 13 "The file says 2 lines created? … Let me verify" → #8.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:163-164` — `read_file`'s `totalLines`.
- `packages/agent-tools/src/tools/files.ts:385`, `:392` — `write_file`'s create and overwrite messages.

## Repaired — 2026-09-29 under R-067

`packages/agent-tools/src/tools/lines.ts` reads a final newline as ending the last line, not starting another: an empty
file has no lines, and an unterminated last line is still a line. `read_file`'s `total_lines` and shown lines, every
`write_file` and `haet_edit` count, the no-match refusals' "the file has N lines", and the edit-diff row
(`REQ-CHAT-050`, `diff.ts`) go through it. An empty file now reads `shown: lines 0-0` rather than naming a line that is
not there.

`insert`'s positions changed with its count, or the count would have lied about what it did. Line N+1 after a final
newline is no longer a place to insert after. A newline-terminated `content` is inserted as its lines, with no blank
line after them. The file keeps its final newline, and gains one only when the insert lands at the end and its
content ends in one. Line-window matching (`REQ-TOOLS-136`) still splits on every newline, because it rejoins what it
split.

Pinned in `packages/agent-tools/src/tools/tools.test.ts` by the three tests under "line counts: a trailing newline
ends the last line …". Each fails on the code before the repair. The read_file header test's `total_lines: 4` for a
three-line file, which had pinned the defect, now reads 3. Shown live by `pnpm live-run --confirm --only=frictions`:
its new check "every write_file create reported the lines its content holds" passed on `probe-ok\n` with "Created
friction-probe.txt: 1 line(s) created." The pack is `.live-run/runs/2026-09-30T03-31-53-798Z` of the
`fix-file-tools-plurals` worktree (git-ignored). The literal "(s)" in that message is L11's
([`a-literal-plural-marker-is-rendered-in-sign-in-notices.md`](a-literal-plural-marker-is-rendered-in-sign-in-notices.md)).
Repaired 2026-09-29 under R-067.
