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
