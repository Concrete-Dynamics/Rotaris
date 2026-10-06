## Undoing a `write_file` create removes the file even when another writer has rewritten it since

Since fin24 (`0df2239`, landed at `4fa5908`) `write_file`'s `undo` of a create removes whatever the path holds when the
undo runs. A terminal command or another agent that rewrote the file after the create loses its content: the fin24
verifier's probe created a file, rewrote it outside the file tools to `someone else\nwrote\n`, undid the create, and the
undo removed the file and answered `Removed <p>: it did not exist before the create this undoes (2 lines removed).` The
undo stack keeps nothing of what the create wrote, so it cannot tell the file it made from one written over it since.

Two smaller findings of the same verifier: the answer's `Also removed the empty directory <d>/ …` text is built with
`rel.split(/[\\/]/)`, which on POSIX splits a file or directory name holding a literal backslash and names the wrong
directory; and the fixed note of fin24 does not say that an undone create leaves the path in the read record.

## Specs

- `REQ-TOOLS-132`: "For each path the 10 most recent writes stay available to `undo`". Undoing a write takes back that
  write; content another writer put there afterwards was never the write's to take back.
- `REQ-TOOLS-135`: `undo` "pops the per-path undo stack", and success messages report what changed: `2 lines removed`
  reports the removal of lines the create never wrote.
- `REQ-TOOLS-189` gives the shape of the nearest refusal the specification words, `haet_edit`'s: it names the path,
  states that the file changed since, directs the caller to read it again, and does not quote the file's content.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `UndoEntry` (no record of what a create wrote), `write_file`'s `undo` case
  (removes the file unconditionally), and the directory text built with `rel.split(/[\\/]/)`.
- `packages/agent-tools/src/tools/tools.test.ts` — the describe "undo puts the path back as it was before the write";
  none rewrites a created file before undoing it.
- `docs/defects/fixed/undoing-a-create-leaves-an-empty-file.md` — fin24's repair and its limits.

## Repaired — 2026-10-06 (fin26)

No open question was raised. The specification words no refusal for `undo`; the build reads `REQ-TOOLS-132`'s "the 10
most recent writes stay available to `undo`" as taking back the write and nothing written after it, and borrows the shape
of the nearest refusal it does word, `haet_edit`'s changed-since refusal (`REQ-TOOLS-189`).

- A create's `UndoEntry` now keeps `written`, the SHA-256 of the content it wrote (`FileToolState.pushUndo` takes the whole
  entry). The `undo` of a create compares the digest of the file's bytes on disk with it, and removes the file (and the
  empty directories the create made) only when they match. Bytes rewritten to exactly what the create wrote match.
- A file that differs is left in place and the undo answers, as an error,
  `Cannot undo the create of <p>: the file changed since it was created, so it was left in place. Read it again before changing it.`
  It names the path and quotes nothing of the file. The refusal changes nothing, so the entry goes back on the stack: the
  undo refuses again while the other content stands, and removes the file once it holds what the create wrote again. A file
  another writer made binary is refused earlier, as before, by `Binary file. Cannot edit <p>.`, which pops nothing.
- A write through the file tools after the create (an edit, an overwrite, `haet_edit`) is its own entry above the create's,
  so undoing it first brings the file back to what the create wrote and the create's undo then removes it, as before.
- The answer's `Also removed the empty directory <d>/ the create made.` takes `<d>` as the path's parent once per segment
  between that directory and the file, through the platform's path module (`dirname`), where it split `rel` on both `/`
  and `\`. On POSIX a backslash is part of a name: a create of `we\ird/x.txt` undone names `we\ird/`, where it named `we/ird/`.

Pinned in the describe "undo puts the path back as it was before the write: a create is undone by removing the file
(REQ-TOOLS-132, REQ-TOOLS-135, REQ-CHAT-050)" of `packages/agent-tools/src/tools/tools.test.ts`: "an untouched create is
removed by its undo" (bytes rewritten to the same content still match), "a created file another writer has rewritten since
is left in place" (the verifier's `someone else\nwrote\n`: refused, the content kept, refused again, then removed with its
directory once restored), and "the directory the answer names is the platform's parent of the path" (POSIX only; skipped on
Windows, where a backslash is a separator). The second and third failed on the code before the repair (the file removed
with `2 lines removed`; `we/ird/`).

What the repair does not do:

- **The read record.** An undone create leaves its path in `FileToolState.read` (`REQ-TOOLS-133`), as fin24's repair did:
  the path was recorded as read by the create's write and nothing takes it out. A file another writer later puts at that
  path can then be edited or overwritten through `write_file` without being read first. Recorded, not changed: the
  requirement says every successful write records the content as read and says nothing of an undo.
- **An undo of any other write** still writes the previous content back whatever the file holds when it runs: content another
  writer put there after that write is replaced. This repair is bounded to the create, as its task was.

The architecture's runtime view says so in its file-tools paragraph.

Not shown by a live run yet: no live scenario rewrites a created file outside the file tools before undoing it. A run whose
agent creates a file and undoes it untouched should still leave no file and answer `Removed …`.
