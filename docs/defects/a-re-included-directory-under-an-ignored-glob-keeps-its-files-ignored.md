## A re-included directory under an ignored glob keeps its files ignored

The workspace `.gitignore` reader compiles every rule so that it also matches everything beneath what it names (the
`(?:/.*)?` suffix), and never applies a directory-only rule to a file. The git idiom that ignores a directory's contents
but keeps one subdirectory therefore keeps nothing:

```
gen/*
!gen/keep/
```

Git ignores `gen/x.ts`, re-includes `gen/keep/` and so keeps `gen/keep/f.ts` (`gen/*`'s `*` does not cross a `/`). The
reader answers `ignoredBy(rules, 'gen/keep', true) === false` but `ignoredBy(rules, 'gen/keep/f.ts', false) === true`:
`gen/*` matches the file through the descendant suffix, and `!gen/keep/`, directory-only, is skipped for a file. A file
lookup and a pruning walk disagree, and both the search tools' scan (a walk descends into `gen/keep` and then drops each of
its files) and the contains-code classifier treat as ignored files the repository keeps.

Confirmed 2026-10-07 by a scratch case against `packages/config/src/init/gitignore.ts` at `d12f1f2` (fin27, building
OQ-219), which the ruling asked for before the note is filed. Recorded, not repaired: the reader is shared with
REQ-WORKSPACE-100's classifier and the ruling left it untouched.

## Specs

REQ-WORKSPACE-100 requires "the full gitignore pattern grammar …, negation patterns (`!`) and `**` path patterns included,
with the last pattern matching a path deciding it, so that classification agrees with what the repository itself treats as
ignored". REQ-TOOLS-139 honours the workspace's `.gitignore` for the search tools, "directories pruned during traversal,
files filtered", on the same grammar (ADR-0064).

## Relevant files

- `packages/config/src/init/gitignore.ts` — `parseGitignore` (the descendant suffix on every rule) and `ignoredBy` (the
  directory-only rule skipped for a file).
- `packages/agent-tools/src/tools/search.ts` — `walkFiles` and `scanExcludes`, which read it for every file and directory.
- `packages/config/src/init/` — the contains-code walk that shares it.
