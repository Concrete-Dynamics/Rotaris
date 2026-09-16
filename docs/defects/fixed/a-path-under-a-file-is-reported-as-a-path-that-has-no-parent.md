## `read_file` answers a path under a file by claiming its parent directory does not exist

`missingPathMessage` lists the parent directory so a missed path can be recovered from. When
`readdirSync(parent)` throws it assumes the only reason it knows — that the parent is absent — and
answers:

```
File not found: .git/HEAD. Its parent directory does not exist either.
```

`ENOTDIR` is the other reason, and it is the one an isolated run meets every time. A linked
worktree's `.git` is a **file** holding a `gitdir:` pointer, not a directory, so `.git` is right
there, readable, and the answer denies it. Observed on 2026-09-16 in session `6696f6ed`, tool call
78: the run had already been refused `<workspace>/.git/worktrees/<id>/HEAD` as outside its fence,
tried the relative spelling, was told the parent did not exist, and concluded its git state was
unverifiable. A path it could have read — `.git` itself — was never tried, because the tool had
said there was nothing there.

Permission is the third reason `readdirSync` throws, and it was in the same catch.

## Specs

- `REQ-TOOLS-134` — a missing path returns a **recovery** message: the parent listing and up to
  five close matches. The requirement does not say what to answer when the listing cannot be
  taken; the code filled that silence with a claim about the filesystem that it had not checked,
  which is the defect. The specified branch is untouched by this repair.
- `REQ-GIT-019`/`REQ-GIT-022` — an isolated run's effective root is a linked worktree, which is
  why `.git` is a file here rather than a directory.
- **Not** a fence defect: `REQ-TOOLS-129`/`REQ-TOOLS-132` refused the metadata paths above the root
  exactly as written. Whether an isolated run may read that metadata at all is `OQ-61`, raised by
  this pass and not answered by it.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — `missingPathMessage`, and the new
  `unlistableParent`, which asks the filesystem which of the three cases it is: absent parent
  (the old wording, kept), a parent that is a file, or one that cannot be read.
- `packages/agent-tools/src/tools/fence.ts` — `realPathOf` resolves the nearest existing ancestor
  and re-joins the tail, which is why `.git/HEAD` under a `.git` file resolves and reaches the
  existence check at all rather than failing earlier.

## Known and left alone

The run's actual want — HEAD, the branch, the refs — is still unreachable from an isolated
worktree, and this repair does not change that. It changes only what the tool says. `OQ-61`
carries the capability question, including the option of designating the base repository's git
directory as an additional read-only root.

## Repaired — 2026-09-16

Regression test: `packages/agent-tools/src/tools/tools.test.ts` — "a path under a file says the
parent is a file; a path under nothing keeps the absent answer (REQ-TOOLS-134)", which writes a
`gitdir:` pointer file at the workspace root and drives all three readings: `.git/HEAD` names the
file, a path under a directory that truly is absent keeps the original sentence, and `.git` itself
still reads back as content.
