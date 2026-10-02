## `haet_edit` applies an edit whose old and new strings are identical

`haet_edit` accepts an `old_string` equal to its `new_string`, pushes an undo entry, rewrites the file with the same
bytes, and reports "1 line(s) changed". `write_file`'s edit operation refuses the same call ("old_string and
new_string are identical; nothing to change."). The model noticed: "the first one was a no-op which should have
errored but didn't".

Live-run finding: L5 (live runs of 2026-09-29)

## Specs

- No requirement binds `haet_edit` here: `REQ-TOOLS-135` states the identical-string refusal for `write_file`'s edit,
  and `REQ-TOOLS-189` is silent. A repair only on a faithful reading of the pair; otherwise an OQ.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `360c8ac1` (`requirements`), tool call #27: the same content hash in and out, diff "+0 -0"; thinking
  row 55.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:497-515` — `haet_edit`'s apply path, no identical-string check.
- `packages/agent-tools/src/tools/files.ts:410` — `write_file`'s refusal.
