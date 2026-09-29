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
