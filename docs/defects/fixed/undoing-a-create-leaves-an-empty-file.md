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

## Repaired — 2026-10-06 (fin24)

The reading is the requirements' own, so no open question was raised: `REQ-TOOLS-132` keeps each path's ten most recent
writes available to `undo`, and undoing a write puts the path back as it was before it; before a create it held no file.
`REQ-CHAT-050`'s "the diff of the restoration" then reads as the file's lines removed, in the header grammar it fixes (no
marker beyond ` [Created]`).

- `FileToolState`'s stack now holds an `UndoEntry` per write: the previous content, or `null` for a create together with the
  first directory that create made for the file (`atomicWrite` returns it from `mkdirSync`).
- `write_file`'s `undo` of a create removes the file, then each directory the create made, deepest first, while it is empty.
  A directory that was already there, or one that has gained another entry since, stays. It answers
  `Removed <p>: it did not exist before the create this undoes (<n> lines removed).`, adding
  `Also removed the empty directory <d>/ the create made.` when it took one, with the diff `<p> +0 -<n>` and the lines.
- A file gone since its create is not written back: `<p> did not exist before the create this undoes, and it does not exist
  now: nothing to remove.` A removal that fails puts the entry back and answers the error, so the write stays undoable.
- An undo of any other write still writes the previous content back and answers `Restored <p> to its previous content …`;
  `haet_edit`'s writes stay on the same stack (`REQ-TOOLS-189`).
- `write_file`'s description, which the model reads, now says `undo {path} (undoing a create removes the file it made)`: the
  child in the run reasoned "I can't delete files with these tools".
- The fence and the write scope are unchanged: `undo` resolves its path through the write fence as every operation does,
  and `PD-TOOLS-006`'s scope refuses every `write_file` operation into a claimed path, `undo` included.

Pinned by the describe "undo puts the path back as it was before the write: a create is undone by removing the file
(REQ-TOOLS-132, REQ-TOOLS-135, REQ-CHAT-050)" in `packages/agent-tools/src/tools/tools.test.ts`: create then undo removes
(and a second undo has no history), the directories a create made, a file removed since, edit then undo restores, the
create-overwrite-haet_edit chain walked back by three undos, and an inferred create (`PD-TOOLS-007`). Every one of the five
failed on the code before the repair ("Restored … to its previous content (0 lines)"). The architecture's runtime view
carries a paragraph on the file tools' shared state.

Not shown by a live run yet: an undone create in a run should leave no file behind, answer "Removed …", and its diff row
should read `+0 -<n>`.
