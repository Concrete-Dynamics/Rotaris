# Architecture proposals — DATA slice — ADR-DATA-05 — Checkpoints are built with a private index and Git plumbing

Part 18 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-05 — Checkpoints are built with a private index and Git plumbing

### Decision to be made

By what mechanism a checkpoint captures a working tree, previews a restore, and performs a restore,
given that the user's Git state must be byte-identical afterwards.

### Constraints that bear on it

- **F5.** `REQ-GIT-004` and `REQ-GIT-030`: identical before and after — branch, HEAD, symbolic-ref
  target, **the on-disk index file byte for byte**, the reflogs of HEAD and every branch, the stash,
  the branch set, the staged entries. No reflog entry written, **no repack or garbage collection
  started**, the index "never refreshed, rewritten, or locked".
- `REQ-GIT-029`: checkpoints are ordinary Git commit objects reachable only from
  `refs/rotaris/checkpoints/<session-id>/<sequence>`.
- **F6.** `REQ-GIT-034`'s content rules, including gitignored-but-tracked paths, the executable bit,
  symlinks recorded as symlinks, and submodules recorded as a commit id only.
- **A2.** `REQ-GIT-003`'s exclusion is first-component, case-insensitive **over the ASCII letters**,
  applied to the path as the tree names it, never following a link.
- `REQ-GIT-039`: rename detection at 50 %, copy detection disabled.
- `REQ-GIT-040`: restore returns file contents, deletes files created after the checkpoint excluding
  gitignored and `.rotaris/` paths, and returns the union of paths that differed either way.
- `REQ-GIT-031`: inherited `GIT_INDEX_FILE` must be ignored **and the file it names left
  byte-identical**; `REQ-GIT-043`: all of this must work on a detached HEAD and inside a linked
  worktree, with the ref in the shared repository and the restore affecting only the linked tree.
- `REQ-GIT-033`: 30 s for ref-only invocations, 300 s for anything touching tree content.

### Alternative A — `git stash`, or a temporary branch

The obvious approaches, and both are excluded outright rather than merely awkward.
`git stash` (including `git stash create`, which does not move `refs/stash`) takes the repository
index lock and refreshes the index, which `REQ-GIT-030` forbids in terms. A temporary branch changes
the branch set, which `REQ-GIT-004` forbids. `git checkout` and `git reset` move HEAD. Every
porcelain command that would make this easy is closed off by one clause or another of those two
requirements — which is clearly deliberate, since the two requirements enumerate exactly the state
those commands touch.

### Alternative B — snapshot outside Git entirely (a content-addressed store of our own)

Copy the captured paths into a store under `.rotaris/`, with our own hashing and our own restore.
This gives total control over `REQ-GIT-003`'s exclusion rule and needs no Git at all, so it would
work on a workspace that is not a repository.

It fails `REQ-GIT-029`, which requires checkpoints to be ordinary Git commit objects reachable from
a ref, and `REQ-GIT-060`, which requires overwritten uncommitted content to be retrievable from the
safety checkpoint's **commit**. It would also have to reimplement Git's own recording of the
executable bit, symlinks and submodule gitlinks, which `REQ-GIT-034` explicitly defers to Git
("The recorded tree SHALL preserve what Git itself records for a working tree"). That phrasing is a
strong hint that the specification expects Git to do the recording.

It is worth noting what B would buy, because it is not nothing: `REQ-GIT-044`'s "a tree Git cannot
manage resolves to disabled — a workspace without undo" is a capability gap B would close. But
closing it would change what the product is, so it is not mine to close (see **ESC-3**).

### Alternative C — a private index plus plumbing

Point `GIT_INDEX_FILE` at a temporary index of our own under `.rotaris/`, stage into it, write a
tree, commit that tree with `commit-tree`, and create the ref with `update-ref`. The repository's own
index is never opened. For restore, read the checkpoint tree into a private index and materialise it
with `checkout-index`, then remove the extra paths ourselves.

This is the only mechanism that produces **F5**'s observables while satisfying `REQ-GIT-029`.

### Recommendation

**Alternative C**, with four specifics that follow from the constraints rather than from taste.

1. **The private index is ours and inherited redirection is neutralised first.** `REQ-GIT-031`
   requires the inherited `GIT_INDEX_FILE` to be ignored and the file it names left byte-identical.
   The invocation helper of ADR-DATA-04 deletes it from the environment; the checkpoint layer then
   sets its own value. The two are not in tension: neutralise, then set our own. The temporary index
   lives under `.rotaris/`, which `REQ-GIT-003` already excludes from every capture, so the index
   cannot capture itself.
2. **`.rotaris/` exclusion is applied by us, not by a Git pathspec.** Git's `:(icase)` pathspec magic
   and its `core.ignorecase` handling are not the rule `REQ-GIT-003` states — that rule is
   first-component only and case-insensitive **over the ASCII letters only**. Delegating it to a
   pathspec would produce a subtly different answer on a Turkish locale or against a path whose first
   component merely begins with `.rotaris`. The path set is therefore computed by us from explicit
   `git ls-files` queries — tracked paths, and untracked-not-ignored paths when
   `checkpoints.include_untracked` is true — filtered by our own predicate, and handed to the staging
   step as an explicit list. Paths come back NUL-separated so they are bytes rather than Git's quoted
   display form, which is also what **A8**'s byte-order sorting needs.
3. **Garbage collection is disabled per invocation.** `REQ-GIT-030` forbids a repack or a garbage
   collection being started. `-c gc.auto=0` on every checkpoint invocation makes that a property of
   the invocation rather than a hope about which commands trigger auto-gc.
4. **The nothing-to-record comparison is against a filtered HEAD tree.** `REQ-GIT-034` requires the
   comparison to be made against "HEAD's tree with every excluded path removed from it", so that a
   repository already tracking paths under `.rotaris/` can still report "nothing to record". That is
   a second tree construction, not a plain `diff-tree` against HEAD.

Restore and preview use the same private index. Preview is a diff between the checkpoint's tree and
the working tree with `--find-renames=50%` and copy detection off, per `REQ-GIT-039`; the four status
letters map to verbs by `REQ-GIT-063` and an unknown letter is carried through and rendered `change`,
so the letter is never used as an enum. `REQ-GIT-064`'s preview text is produced character-for-
character by one function and used by the one surface that shows it, `REQ-GIT-097`'s dialog.

The improvement-rollback checkpoints of `REQ-LIBRARY-067` use the same machinery against a different
ref namespace and a different retention rule, and `REQ-LIBRARY-077` explicitly inherits the
repository's line-ending normalisation from it: "a restored path MUST hold exactly the content a
fresh checkout of that checkpoint would produce in this working tree under the repository's
configured normalisation, not necessarily the same bytes the path held before the run." Using
`checkout-index` rather than writing bytes ourselves is what makes that guarantee true by
construction rather than by argument.

### Consequences accepted

- Capture cost is a full stage of the changed set into a fresh index. `REQ-GIT-033`'s 300 s budget is
  the whole budget and a repository too large to stage inside it produces the timeout error, which
  that requirement states is "a correct result of this requirement and not a defect in it".
- We depend on `git ls-files`, `hash-object`/`add`, `write-tree`, `commit-tree`, `update-ref`,
  `read-tree`, `checkout-index` and `diff-tree` being available — all long-stable plumbing.
- A workspace that is not a Git repository has no undo. That is `REQ-GIT-044`'s stated behaviour and
  `REQ-LIBRARY-163`'s ("A workspace with no Git repository MUST lose only the rollback capability").

### What would have to change to revisit this

`REQ-GIT-004` or `REQ-GIT-030` being relaxed about the index or the branch set, which would reopen
the porcelain route; or a requirement that checkpoints work outside a Git repository, which would
force Alternative B and would be a product decision rather than an architectural one.

---
