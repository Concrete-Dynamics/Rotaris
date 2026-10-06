## Undoing a `write_file` create leaves an empty file instead of removing it

`write_file`'s undo stack records `null` for "the file did not exist" when a `create` writes, but the `undo` operation
writes `previous ?? ''` and answers `Restored <p> to its previous content (0 lines).` Undoing a create therefore leaves an
empty file where there was none, a second undo answers `No edit history for <p>.`, and an agent with no terminal has no
way left to remove the file. The diff row the undo carries reads `<p> +0 -1`, as if one line had been taken out of a file
that stays.

Live-run finding: N2 (the final duress run at `c2a9444`, 2026-10-06).

## Specs

- `REQ-TOOLS-132`: "For each path the 10 most recent writes stay available to `undo`". Undoing a write puts the path back
  as it was before that write; before a create the path held no file.
- `REQ-TOOLS-135`: `undo` "pops the per-path undo stack", and success messages report what changed. "Restored … to its
  previous content (0 lines)" names a previous content the path never had.
- `REQ-CHAT-050`: an undo renders the diff of the restoration; the restoration of a create is the file's lines removed.

## Evidence

- Pack `.live-run/runs/2026-10-06T17-59-41-271Z/` (the live-run worktree; git-ignored), `duress/transcript.md`: the
  continuation child's tool call #241 creates `.tmp-run-tests.sh` ("placeholder", diff `[Created] +1 -0`), #242 undoes it
  ("Restored .tmp-run-tests.sh to its previous content (0 lines)", diff `+0 -1`), #247 to #249 glob and read the file
  (it exists, 0 lines), #250 undoes again ("No edit history"). Its reasoning at rows 451, 456, 459 and 462: "undo should
  have deleted it … I can't delete files with these tools".
- The stray file then cost the coordinator a read and a write-scope entry, the verifier an `rm` and two findings in its
  `docs/verification.md`, and a line of the user's answer.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `FileToolState.undo` (`null` = the file did not exist) and `write_file`'s
  `undo` case, which writes `previous ?? ''`.
- `packages/agent-tools/src/tools/tools.test.ts` — the `write_file` tests; none undoes a create.
