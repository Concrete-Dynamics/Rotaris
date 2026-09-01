# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-2 and SR-4
- **Origin:** DATA (ADR-DATA-05)
- **Depends on:** ADR-0038

> **Two different things are called an index in this area and they go different ways.** The *private
> Git index* is a scratch file handed to `git` through `GIT_INDEX_FILE`; it stays a file, because a
> foreign tool reads it and because `REQ-GIT-031` names it as a path. The *checkpoint index* — the
> session's recorded list of checkpoints — becomes rows. The checkpoint **commits and refs** move
> nowhere: they are and remain ordinary objects in the user's own repository.

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

## Alternatives considered

**A — Stashing, or a temporary branch.** The obvious approaches, and both are excluded outright rather
than merely awkward. Stashing — including the form that does not move the stash reference — takes the
repository index lock and refreshes the index, which `REQ-GIT-030` forbids in terms. A temporary branch
changes the branch set, which `REQ-GIT-004` forbids. Checking out and resetting move HEAD.

**B — Snapshot outside Git entirely, in a content-addressed store of our own.** Total control over the
exclusion rule and no Git needed, so it would work on a workspace that is not a repository. It fails
`REQ-GIT-029`, which requires checkpoints to be ordinary Git commit objects reachable from a reference,
and `REQ-GIT-060`, which requires overwritten uncommitted content to be retrievable from the safety
checkpoint's **commit**. It would also have to reimplement Git's own recording of the executable bit,
symlinks and submodule links, which `REQ-GIT-034` explicitly defers to Git — a strong hint that the
specification expects Git to do the recording.

  It is worth noting what B would buy, because it is not nothing: `REQ-GIT-044`'s "a tree Git cannot
  manage resolves to disabled — a workspace without undo" is a capability gap B would close. **ESC-4
  ruled the gap accepted as specified**, on the basis that checkpoints are ordinary commits; the
  arrival of a database does not reopen it, and this is the trap SR-4 most invites here. A checkpoint
  table is not a checkpoint store: **the content lives in commits and only the list lives in rows.**

**C — A private Git index plus plumbing, with the recorded list in the session's persisted JSON.**
The previous decision. Correct about Git, and it was correct about the list too under ADR-0003's
files-only rule. What it cost is set out in the decision below: a read-modify-write of a whole session
document for every capture and every trim, a two-artifact ordering with no transaction between the
checkpoint list and the timeline, and a debounced whole-file save sitting in front of an event
`REQ-GIT-048` requires to be published only after the write is durable.

**D — A private Git index plus plumbing, with the recorded list, the count and the last-restored
sequence as rows in the workspace database.** Chosen.

## Decision

**Alternative D.** Git does the recording; the database does the bookkeeping; nothing moves out of the
user's repository.

### The Git side is unchanged

Point `GIT_INDEX_FILE` at a temporary index of our own under the product's workspace directory, stage
into it, write a tree, commit that tree, and create the reference. **The repository's own index is never
opened.** For restore, read the checkpoint tree into a private index and materialise it, then remove the
extra paths ourselves. This is the only mechanism that produces `REQ-GIT-004`'s observables while
satisfying `REQ-GIT-029`.

Four specifics follow from the constraints rather than from taste:

1. **The private index is ours, it is a file, and inherited redirection is neutralised first.**
   `REQ-GIT-031` requires the inherited index-file variable to be ignored **and the file it names left
   byte-identical**. ADR-0038's helper deletes it from the environment; the checkpoint layer then sets
   its own value. The two are not in tension: neutralise, then set our own. The temporary index lives
   under the product's workspace directory, which `REQ-GIT-003` already excludes from every capture, so
   the index cannot capture itself. **It stays a file under SR-4's own principle** — `git` is another
   tool, `GIT_INDEX_FILE` takes a path and nothing else, and the file is scratch state consumed by a
   child process. It is not a candidate for a table and never was.
2. **The exclusion is applied by us, not by a Git pathspec.** Git's case-insensitivity magic and its
   configuration handling are not the rule `REQ-GIT-003` states — that rule is first-component only and
   case-insensitive **over the ASCII letters**. Delegating it to a pathspec would produce a subtly
   different answer under some locales and against a path whose first component merely *begins with* the
   directory name. The path set is therefore computed by us from explicit file-listing queries —
   tracked paths, and untracked-not-ignored paths when the setting says so — filtered by our own
   predicate, and handed to the staging step as an explicit list. Paths come back NUL-separated so they
   are **bytes** rather than Git's quoted display form, which is also what `REQ-GIT-057`'s byte-order
   sorting needs.
3. **Garbage collection is disabled per invocation.** `REQ-GIT-030` forbids a repack or a garbage
   collection being started; setting the automatic-collection configuration to off **on every checkpoint
   invocation** makes that a property of the invocation rather than a hope about which commands trigger
   it.
4. **The nothing-to-record comparison is against a filtered HEAD tree** — a second tree construction,
   not a plain diff against HEAD.

Restore and preview use the same private index. Preview is a diff between the checkpoint's tree and the
working tree at the 50 per cent rename threshold with copy detection off; the status letters map to
verbs by `REQ-GIT-063` and an unknown letter is carried through and rendered generically, **so the
letter is never used as an enumeration**. `REQ-GIT-064`'s preview text is produced character for
character by one function and used by the one surface that shows it.

The improvement-rollback checkpoints use the same machinery against a different reference namespace and
a different retention rule. `REQ-LIBRARY-077` explicitly inherits the repository's line-ending
normalisation from it: "a restored path must hold exactly the content a fresh checkout of that checkpoint
would produce in this working tree under the repository's configured normalisation, not necessarily the
same bytes the path held before the run". **Materialising through Git rather than writing bytes
ourselves is what makes that guarantee true by construction rather than by argument.**

### The checkpoint index is a table

`REQ-SESSION-019`'s `checkpoints` list, `REQ-GIT-018`'s `checkpoint_count` and `REQ-SESSION-195`'s
`last_restored_sequence` become rows and columns in the workspace database, alongside the rest of the
session record that SR-4 moves there.

- **One row per checkpoint**, keyed by session id and sequence, carrying `REQ-GIT-016`'s field set
  unchanged. `files` is a list of paths that nothing queries by element, so it is stored as one
  serialised value on the row rather than a child table; `kind` is `REQ-GIT-067`'s closed vocabulary and
  is stored as its own column because listing and retention read it.
- **`checkpoint_count` is derived, not stored twice.** It is a count over that session's checkpoint
  rows. `REQ-GIT-018`'s guarantee that the listing "produces identical output on a machine where Git is
  not installed, where the repository has been moved away, or where the checkpoint refs have been
  deleted" survives verbatim, in a stronger form: **the listing path issues no Git command at all.**
  That is a property to assert in a test, not to assume.
- **`last_restored_sequence` is a column on the session row**, absent by default, written **in the same
  transaction** that records the restore as successful and untouched by every refusal and every failure
  (`REQ-SESSION-195`, `REQ-GIT-155`).
- **Ordering is a query, not a stored order.** `REQ-SESSION-019` fixes the list as oldest-first and
  `REQ-GIT-037` fixes numeric sorting; both are `ORDER BY sequence`, which removes the class of defect
  where sequence 10 sorts between 1 and 2 because something sorted the stored representation as text.

### Two orderings that the transaction does not decide, and how they are decided

A transaction covers the rows. It does not cover a Git ref, so the ref-versus-row order still has to be
chosen, and `REQ-GIT-049` chooses it: the forbidden state is **a recorded checkpoint without its ref**,
while a ref without a record is explicitly tolerated and is exactly what `REQ-GIT-046` and
`REQ-GIT-059`'s maximum-of-both-sources numbering exists to absorb. Therefore:

- **Capture:** write the tree, write the commit, create the ref, **then** commit the row. A crash in
  between leaves a ref with no record — tolerated, and it cannot cause a sequence to be reused because
  numbering consults the live refs too.
- **Trim:** commit the row deletions **first**, then delete the refs (with `REQ-GIT-041`'s
  compare-and-swap on the recorded commit id). A crash in between leaves a ref with no record —
  tolerated again. Doing it the other way round would leave the one state the requirement forbids.

Both directions fall out of the same clause, and stating the derivation is the point: it is not a
preference.

### Persist before publish

`REQ-GIT-048` is a persist-before-publish rule with its own explicit list of preconditions. Under
ADR-0010 the durable anchor was "the event has been appended to `evidence/events.jsonl` and flushed".
**The anchor is now the transaction commit.** One transaction inserts the checkpoint row, applies the
retention trim to the rows, and writes the `checkpoint_created` timeline row with `REQ-GIT-048`'s fixed
actor, message and metadata; the ref deletions for the trimmed entries follow it; and only then does the
`checkpoint.created` event become observable. A consumer that reads the session record on receipt of the
event therefore finds the checkpoint the event names and finds the retention limit already respected —
which is `REQ-GIT-048`'s stated purpose, now true because the three writes commit together rather than
because three separate writes were carefully sequenced.

The general persist-before-publish rule, and its carve-out for `REQ-MONITOR-219`'s 50 ms intra-row
growth ticks — which have no event of their own because `REQ-EVENTS-052` gives a row exactly two events
and none for any state in between — belong to ADR-0010 and are **neither broadened nor narrowed here**.
This ADR uses the rule for one event with its own stated preconditions.

### What SR-2 changes

`REQ-SESSION-066` requires a session persisted in an active status whose owning process is gone to be
observable in two ways at once: a checkpoint restore is refused and restores nothing, leaving the
working tree byte-identical (`REQ-SESSION-164`), and the list shows the session's stored status marked
stale (`REQ-SESSION-182`); after the repair action reports the session repaired, the same restore
succeeds and the list shows `interrupted`.

Under SR-2 that is the **only** shape this condition takes. A session is either live and owned by this
application's run host, or it is a persisted record. There is no foreign owner whose checkpoints are
permanently unreachable: a session left by a crash is stale, the reap path settles it, and its
checkpoints then restore like any other session's. The refusal in `REQ-SESSION-164` is therefore a
refusal *until repair*, never a refusal *forever* — and `REQ-GIT-058` gate 2's unmanaged-tree refusal is
untouched, being about the tree rather than about ownership.

Whatever replaces the session lock must still settle a session whose owner is gone, and must still carry
`REQ-SESSION-183`'s pid and host vocabulary. This ADR depends on that settling happening; it does not
own the mechanism.

### What SR-4 dissolves here

Recorded so a reader of the history sees the removals were deliberate:

- **The read-modify-write of a whole session document per capture.** `REQ-GIT-059` requires a safety
  checkpoint to be "appended to a **freshly re-read** session snapshot (checkpoints recorded by a
  still-running session since the restore began are not lost)". That instruction describes a defence
  against lost updates in a whole-document rewrite. A row insert has no lost-update problem, so the
  re-read is not merely satisfied, it is **unnecessary** — the concurrently recorded checkpoints were
  never at risk. The guarantee stands; the dance behind it goes.
- **The ten-second debounced whole-file state save.** It existed because every save rewrote a whole
  JSON document. Checkpoint rows are written individually, so `REQ-GIT-048`'s persist-before-publish no
  longer sits behind a debounce, and no delay floor is introduced anywhere on this path.
- **The two-artifact ordering between the checkpoint list and the timeline.** One transaction.
- **The atomic-replace machinery for the session document on this path** — staging, `fsync`, rename,
  and the read-side empty-read guard — together with ADR-0004 rule 3 and constraint D-28, which never
  applied to this store's own writes and are dissolved product-wide.

**Not dissolved:** `REQ-GIT-041`'s compare-and-swap on ref deletion. It is the only such primitive in
this area and it is about **Git refs**, which a database transaction does not cover. It stays exactly
as it was.

**Not dissolved:** `REQ-GIT-095`'s single-flight and its 150 ms retry, and `REQ-GIT-091`'s one desktop
checkpoint operation in flight. Those are interface-level concurrency rules about what a user can ask
for, not storage rules, and SR-3's no-polling ruling does not touch them: the 150 ms retry is a
one-shot response to a busy operation, not a cadence.

## Consequences accepted

1. Capture cost is a full stage of the changed set into a fresh index. `REQ-GIT-033`'s 300 s budget is
   the whole budget and a repository too large to stage inside it produces the timeout error, which that
   requirement states is "a correct result of this requirement and not a defect in it".
2. We depend on a set of long-stable plumbing subcommands being available.
3. **A workspace that is not a Git repository has no undo.** That is `REQ-GIT-044`'s stated behaviour
   and `REQ-LIBRARY-163`'s. ESC-4 accepted it, and the database does not change it: rows record where a
   commit is, and there is no commit without a repository.
4. Retention differs deliberately between the two namespaces: session checkpoints are **configurable**
   at a documented default with a minimum enforced at load, while improvement checkpoints are fixed at a
   constant with the newest pre-improvement checkpoint never dropped (`REQ-GIT-049`, `REQ-GIT-071`,
   `REQ-LIBRARY-071`). Two retention policies, deliberately, and they must not be unified — the fact
   that both are now `DELETE` statements over the same table makes unifying them one careless line
   away.
5. **Refs and rows can still diverge, and that is stated behaviour.** `REQ-GIT-049` says so in terms: a
   ref pruned by hand, lost with a repository restored from backup, or gone with a repository that was
   moved leaves the list and the refs divergent. The maximum-of-both-sources numbering absorbs it. The
   database changes nothing about this.
6. **The blast radius is bounded, and the index is rebuildable.** SR-4 concentrates the crash domain:
   one database per workspace where there was one directory per session. The mitigation specific to
   *this* store is that the database holds no checkpoint content — every checkpoint is a commit
   reachable from `refs/rotaris/checkpoints/`, so a lost database loses the mapping from iteration to
   commit, not a single byte of captured work, and the refs enumerate what survived. That is a real
   argument for putting the list in a row and it should be tested, not assumed: an enumeration of the
   namespace reconstructs sequence, ref and commit for every checkpoint the repository still holds.
7. `REQ-GIT-016`'s `files` list rides on the row as a serialised value. It is not queryable, and if a
   later requirement wants to query it — "which checkpoints touched this path" — that is the change
   that introduces a child table.

## Revisit if

`REQ-GIT-004` or `REQ-GIT-030` is relaxed about the index or the branch set, which would reopen the
porcelain route; or a requirement appears that checkpoints work outside a Git repository, which would
force alternative B and would be a product decision rather than an architectural one (ESC-4); or a
requirement makes the recorded checkpoint list itself something a user or another tool reads, which
would pull it back out of the database under SR-4's own principle.
