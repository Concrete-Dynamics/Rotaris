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
