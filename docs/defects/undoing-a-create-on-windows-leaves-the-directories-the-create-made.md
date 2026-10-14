## Undoing a create on Windows leaves the directories the create made

Found 2026-10-15 by the full suite on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev
tree, pwsh 7.6.7, at `b9e30052` (A1 of the Windows ARM64 session). Three cases go red, every run, alone and in the suite:
`tools.test.ts`'s "the directories a create made are removed with its file …" and "a created file another writer has
rewritten since is left in place …", and `files-undo-failure.test.ts`'s "the refused removal leaves the file and its
directory, and the next undo removes both". Each undo removes the file and answers without the clause "Also removed the
empty directory `<dir>/` the create made", and the empty directories stay on disk.

The cause, measured on this host: `mkdirSync(dirname(target), { recursive: true })` (`atomicWrite`) returns the first
directory it made in its **namespaced** spelling, `\\?\C:\…\new`, while `dirname(resolved)` is the plain `C:\…\new\deep`.
`removeCreated` walks up from `dirname(resolved)` while `dir === madeDir || dir.startsWith(madeDir + sep)`, which never holds
between the two spellings, so it removes no directory and returns none. Linux returns the plain path, which is why the
cases pass there. Whether earlier Node 24 releases on Windows returned the plain form is not measured here.

Not repaired (record-only; the session's brief repairs only where an item says so).

## Specs

REQ-TOOLS-132 and REQ-TOOLS-135: undoing a create puts the path back as it was before the write, and the create made those
directories, so the undo leaves the workspace with directories that were not there before the create. The repaired
note [`undoing-a-create-leaves-an-empty-file.md`](fixed/undoing-a-create-leaves-an-empty-file.md) fixed the file half on
Linux; this is the directory half on Windows.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `atomicWrite` (the `mkdirSync` whose return value is kept as `madeDir`),
  `removeCreated` (the comparison that never matches), and the `undo` branch that renders the "Also removed" clause.
- `packages/agent-tools/src/tools/tools.test.ts`, `packages/agent-tools/src/tools/files-undo-failure.test.ts` — the three red
  cases.
