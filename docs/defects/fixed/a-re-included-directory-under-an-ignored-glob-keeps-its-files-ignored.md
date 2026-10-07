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

## Outcome — repaired 2026-10-07 (fin30)

`parseGitignore` no longer gives a rule the descendant suffix: a rule matches the path itself and nothing beneath it.
`ignoredBy` answers in git's order: a path beneath a directory the rules ignore is ignored whatever a later rule says of
the path (git never looks inside an excluded directory, so `build/` then `!build/x/y.ts` still ignores the file), and
otherwise the last rule matching the path itself decides, a directory-only rule asked only about a directory. The walks
that prune an ignored directory before descending, the search tools' `walkFiles` and the contains-code classifier, ask
only the entry's own verdict (`ignoredHere`), since they reached it through kept directories; `scanExcludes`, which
answers for an explicit base or a named file, asks `ignoredBy`. Checked against git itself on the same tree:
`git status --ignored` keeps `gen/keep/f.ts` and `gen/keep/sub/g.ts` and ignores `gen/x.ts` and `gen/drop/f.ts`, which
is what the reader now answers. Repaired with it, from the same grammar: a run of asterisks that is not a whole segment
(`a**b`) matched across a slash; git reads it as an ordinary `*` (`a**b` keeps `ax/yb`, verified the same way).

Pinned by `packages/config/src/init/init.test.ts` ("keeps what a re-included directory under an ignored glob holds, as
git does", "counts source in a directory re-included under an ignored glob, as git keeps it", and the double-star and
anchoring cases beside them) and `packages/agent-tools/src/tools/tools.test.ts` ("a directory re-included under an
ignored glob is searched, as git keeps it"), each red on `a68f121`. The one earlier assertion that read the reader's
old answer, `ignores('build/', 'build/x/y.ts') === false` ("a directory-only rule is never asked about a file"), now
reads `true`: the file lies under an ignored directory, which git ignores. `pnpm init-proof --skip-build` drives the classifier in
the built app and passed its five scenarios on 2026-10-07 (load 8.8 to 13.4 on four CPUs, a sibling plan and the
orchestrator's live runs beside it); no proof carries a re-included tree, so the unit tests are the evidence for the
case itself.
