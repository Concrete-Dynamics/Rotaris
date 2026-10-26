# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Context

Part 1 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Context

`REQ-GIT-004` is the sharpest mechanism constraint in the whole record. A checkpoint must leave the
user's entire Git state **identical before and after**: the checked-out branch and the commit it points
at, HEAD including a detached HEAD, the symbolic-reference target, **the on-disk index file byte for
byte**, the reference logs of HEAD and of every branch, the stash, the set of branches, and the set of
staged entries. `REQ-GIT-030` adds: no reference-log entry is written for HEAD or for any branch, no
repack or garbage collection is started, and **the repository's index file is never refreshed, rewritten
or locked**. The only addition is one reference under the checkpoint namespace and the objects it
reaches.

This rules out stashing, staging, committing, checking out, resetting, and any temporary branch. **Every
porcelain command that would make this easy is closed off by one clause or another**, which is clearly
deliberate, since the two requirements enumerate exactly the state those commands touch.

`REQ-GIT-029`: checkpoints are ordinary Git commit objects reachable only from
`refs/rotaris/checkpoints/<session-id>/<sequence>`. `REQ-GIT-060`: a forced restore preserves the
overwritten uncommitted content **inside the safety checkpoint's commit** — the discarded contents are
retrievable from that commit. `REQ-LIBRARY-067` gives improvement checkpoints a **disjoint** namespace
"so that neither feature's pruning can delete the other's refs". `REQ-GIT-043`: all of this must work on
a **detached HEAD and inside a linked worktree**, with the reference stored in the shared repository and
the restore affecting only the linked tree.

`REQ-GIT-034` fixes the capture content exactly: every tracked path at its current working-tree content
**including tracked paths that ignore rules would otherwise cover**; plus every untracked path the
ignore rules do not cover when the setting says so; **minus everything under the product's workspace
directory**; minus a tracked path deleted in the working tree. The executable bit is preserved; a
symlink is recorded as a symlink carrying its target text, never as a copy of what it points at; a
submodule is recorded as the commit id the containing repository currently has for it and nothing more.
The parent is HEAD, parentless when there is no HEAD. **The nothing-to-record comparison is made against
HEAD's tree with every excluded path removed from it**, so a repository that already tracks paths under
the product's directory can still report "nothing to record".

`REQ-GIT-003`: the exclusion is a **first-component, case-insensitive, name-based test that never
follows links**, applied to the path as the tree names it; a symlink or junction is an ordinary entry at
its own path and its target is never read, written or deleted. This forbids any path filter implemented
by resolving real paths, and it forbids reusing the ignore matcher — ignored paths are excluded
separately and by a different rule.

`REQ-GIT-031`: the inherited `GIT_INDEX_FILE` must be ignored **and the file it names left
byte-identical**, along with thirteen other inherited Git environment variables, each neutralised per
invocation with the repository and working tree named explicitly instead.

`REQ-GIT-039`: rename detection at a similarity threshold of **50 per cent**, copy detection
**disabled**, and a status letter outside the four expected ones carried through unchanged so a future
Git cannot make a preview unrenderable. `REQ-GIT-040`: restore returns file contents, deletes files
created after the checkpoint excluding ignored and product-directory paths, and returns the union of
paths that differed either way.

**The recorded checkpoint list.** `REQ-SESSION-019` and `REQ-SESSION-162`: the session state carries a
`checkpoints` list, ordered oldest-first, each entry mapping an iteration to the ref and commit that
restore the tree as it stood at the end of that iteration; the list is the **durable checkpoint
mapping**, must survive a resume, and is what keeps checkpoints restorable after a crash. The record's
field set is `REQ-GIT-016`'s — `sequence`, `ref`, `commit`, `created_at`, `iteration`, `child_name`,
`files`, `kind`, with `kind` drawn from `REQ-GIT-067`'s closed vocabulary. `REQ-SESSION-195` and
`REQ-GIT-155` add `last_restored_sequence`, defaulting to absent, written as part of the same durable
write that reports a restore successful and left untouched by every refusal and failure.

`REQ-GIT-018`: the session's metadata carries `checkpoint_count`, equal to the number of checkpoint
records the session holds, and the listing shows per session whether it has at least one recorded
checkpoint — **and because the metadata alone determines that, the listing produces identical output on
a machine where Git is not installed, where the repository has been moved away, or where the checkpoint
refs have been deleted.**

`REQ-GIT-046` and `REQ-GIT-059`: every capture takes its sequence from **the maximum of two sources** —
the highest sequence in the recorded list and the highest among the live references in that namespace —
plus one, so numbering climbs across a prune, across a resume, and across a reference deleted from
outside; when the live references cannot be listed at all the recorded list alone is used and the
capture still refuses to overwrite an existing reference. `REQ-GIT-041`: **reference deletions verify the
recorded commit id at deletion time** so a concurrently moved reference is not silently clobbered.
`REQ-GIT-037`: listing enumerates only that session's namespace, keeps only numeric suffixes, and sorts
**numerically**.

`REQ-GIT-049`: retention defaults to 50 per session, minimum 1 enforced at configuration load, and trims
the Git refs and the recorded list **together, so that no operation of this domain ever leaves a
recorded checkpoint without its ref** — while the reverse divergence, a ref with no record, is
explicitly tolerated and is why `REQ-GIT-046` and `REQ-GIT-059` number from the maximum of both sources.

`REQ-GIT-048`: a `checkpoint.created` event **shall not become observable to any consumer** until the
session's persisted record lists the new checkpoint, that list has been trimmed to the retention limit
with the trimmed entries' refs deleted alongside their records, and the session's timeline holds a
`checkpoint_created` entry with its fixed actor, message and metadata.

`REQ-GIT-058` gate 5 and `REQ-LIBRARY-075`: a safety checkpoint is recorded, and **must succeed**,
before a restore touches a file, and failure to create or persist it stops the restore with no file
modified; "an irreversible rollback is forbidden".

`REQ-GIT-091`, `REQ-GIT-095` and `REQ-GIT-146`: at most one desktop checkpoint operation in flight; a
listing request arriving while another is in flight is retried once, 150 ms later, for whichever session
is selected at that moment; a listing settles exactly once into rows, unavailable or empty; and a
session store that cannot be read yields an empty listing with the error "Rotaris could not reach the
session store for this workspace."
