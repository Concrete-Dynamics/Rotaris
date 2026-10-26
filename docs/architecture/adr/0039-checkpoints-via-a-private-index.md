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

## Status note — 2026-09-05, the card's shell exists; the mechanism is owed (Part O)

The Git view (`packages/ui/src/GitView.tsx`) carries the "Session checkpoints" card in its **empty states only**
(REQ-GIT-086..090): the picker over the session list (`<id> · <branch>` or the bare id, disabled when empty), the
five columns, no rows, the text by cause (no session; a selected session with none recorded), and "Restore
checkpoint" disabled with REQ-GIT-089's reason. Every listing record already carries `checkpoint_count: 0`
(REQ-GIT-018) and the run-host's `session.start` records the binding the capture will need. **Not built:** the
private index, capture at iteration end, the ref namespace, the listing, the preview and the restore with its gates —
this decision has not yet been executed and nothing here is a finding about it.

## First execution — 2026-09-05, the mechanism end to end (Part P)

*Recorded under GD-10. Alternative D as decided; the four specifics, the table, the two orderings and persist-before-publish
all executed. The two claims the decision said were "to be tested, not assumed" were tested; what each found is below.*

**Built and run** (`packages/workspace/src/git/checkpoints.ts` and its test against scratch repositories; store v9 in
`packages/store/src/schema.ts`; the writer's `recordCheckpoint` and `recordRestore`; `packages/engine/src/checkpoint-port.ts`
and the one call in `run/run.ts`; `apps/desktop/src/run-host/checkpoints.ts`; the five workspace-service requests, the
run host's three asks relayed by main, the three renderer commands; `packages/ui/src/CheckpointDialogs.tsx` and the card
in `GitView.tsx`; `pnpm checkpoint-proof`, twelve launches).

**The four specifics, executed.**
1. *The private index is ours, a file, inherited redirection neutralised first.* ADR-0038's helper gained a `setEnv` seam
   applied AFTER REQ-GIT-031's scrub — "neutralise, then set our own" is now two lines in one place — and the layer sets
   `GIT_INDEX_FILE` to `<tree>/.rotaris/checkpoints/index-<sid>-<pid>-<t>-<n>`, one file per operation, removed when it
   ends. The unit test runs a capture with an inherited `GIT_INDEX_FILE` naming a file of junk bytes and an inherited
   `GIT_AUTHOR_NAME`: the file is byte-identical afterwards and the commit carries `rotaris <rotaris@local>` on both sides.
   The repository's own index file is byte-identical across every capture, preview and restore (REQ-GIT-004's fingerprint —
   HEAD, the symbolic ref, the branch list, the index bytes, the reflogs of HEAD and every branch, the stash, the staged
   set — is compared before and after, in the unit test and in the proof).
2. *The exclusion is applied by us.* The path set is `ls-files -z` minus `ls-files -z --deleted` plus `ls-files -z --others
   --exclude-standard` when untracked are included, filtered by `excludedPath` and handed to `update-index --add --remove -z
   --stdin` (the helper's second new seam: standard input). A tracked path under `.Rotaris/` and an untracked one under
   `.rotaris/` are absent from every recorded tree; an ignored file is absent; a symlink is recorded `120000` where the
   platform lets the test create one; the proof runs `ls-tree -r` over every checkpoint of every session and finds no
   `.rotaris/` path.
3. *Garbage collection off per invocation.* Every invocation carries `-c gc.auto=0`. **Found, in ADR-0038's helper:** the
   network chokepoint read "the first argument not starting with `-`" as the subcommand, so `-c gc.auto=0 push …` named
   `gc.auto=0` and a network subcommand behind a global option would have passed the refusal — the reason had been that no
   caller passed global options, which stopped being true with this record's first write. `subcommandIndex` now skips
   Git's value-taking global options; REQ-GIT-033's rendering starts at the subcommand (the reading: the global options
   before it are not "arguments passed to the subcommand"). Unit-tested.
4. *The nothing-to-record comparison is against the filtered HEAD tree.* Executed in the test where HEAD tracks
   `.rotaris/tracked.txt` and the only working-tree differences lie under `.rotaris/`: nothing to record. Built lazily —
   the staged tree is first compared with `HEAD^{tree}` and the filtered tree is constructed (a second private index,
   `read-tree HEAD`, `update-index --force-remove` of the excluded paths, `write-tree`) only when HEAD's top level holds an
   excluded entry, so the common capture costs no second tree.

**The table.** v9: `checkpoints (session_id, sequence, ref, commit_id, created_at, iteration, child_name, files JSON, kind)`
keyed by session and sequence, `sessions.last_restored_sequence`. `checkpoint_count` is a count over the rows and the
listing is `ORDER BY sequence` under the primary key — the store test asserts the plan names the autoindex and no temporary
B-tree. The listing path issues no Git command: `checkpoint.list` is answered by the run host from the DAL alone
(REQ-GIT-050), which the proof's `no-rows` and `ref-gone` launches exercise (the row for a deleted ref still lists; only the
preview says its snapshot is gone). A duplicate sequence is refused by the primary key, not by a check a caller could skip.

**The two orderings.** Capture = the service creates the ref, THEN the run host commits the row (the ask answers first).
Trim = `recordCheckpoint` deletes the rows inside the row's transaction and hands the victims back, THEN the run host asks
the service to `update-ref -d <ref> <recorded commit>` — the compare-and-swap of REQ-GIT-041, exercised in the unit test by
moving a ref from outside: the deletion refuses and the moved ref stands. The proof's `retention` launch (`max_per_session:
2`, a fourth iteration) leaves rows 3 and 4 and refs 3 and 4, with the log line "retention trimmed 2 row(s) to 2; 2 ref(s)
deleted" in that order.

**Persist before publish.** One transaction carries the row, the trim, the `checkpoint_created` entry and the
`checkpoint.created` event row; the writer returns a `publish()` the caller invokes after the refs are deleted, so the
event reaches the bus only once REQ-GIT-048's three preconditions hold — the reading taken of its third ("the refs of the
trimmed entries deleted alongside their records"), which the decision's own paragraph had left as "the ref deletions follow
it; and only then". The safety checkpoint of a restore goes the same way in the run host.

**Measured** (`pnpm checkpoint-proof`, this machine, Git 2.41 for Windows, a one-file change on a two-file repository):
a capture is **12 Git invocations** (`rev-parse --is-inside-work-tree`, `rev-parse --verify HEAD`, three `ls-files`,
`update-index`, `write-tree`, `rev-parse HEAD^{tree}`, `ls-tree` of HEAD's top level, `commit-tree`, `update-ref`,
`diff-tree`) in **1.18–1.27 s in the service, 1.26–1.36 s end to end through main** (2.0 s when the retention prune ask
follows); nothing-to-record is **9 invocations in ≈0.8 s**; a preview of one changed file against two candidates is **12
invocations in ≈1.0 s**; the restore itself (`read-tree`, `checkout-index`) is **2 invocations in ≈0.24 s**, and the
whole confirmed restore — the preview again, the safety capture, its row, the restore, its record — **≈2.5 s end to end**. Roughly 100 ms per Git start on this
machine; the unit test's fourteen cases run in ≈39 s, almost all of it process starts.

**The two things "to be tested, not assumed".** *Refs and rows diverge and numbering absorbs it* (REQ-GIT-046/059, consequence
5): the proof deletes ref 4 from outside — the row still lists, the preview refuses with gate 2's second sentence — and the
unit test captures twice under one sequence and the second is refused by `update-ref`'s empty old value; the safety
checkpoint of the `restore` launch numbers from max(rows, refs) + 1. *The index is rebuildable from the namespace*
(consequence 6): TESTED in the unit test only as far as `listRefs` reconstructing sequence and commit for every ref that
survives — the row-side rebuild (writing rows back from an enumeration after a lost database) is **not built**; no
requirement asks for it yet, and the enumeration is the whole of what it would need.

**Found.** Beside the chokepoint above, three more in existing code and one in the plan, each kept beside its
replacement: (a) ADR-0038's denylist held fourteen names but not REQ-GIT-031's fourteen — the six identity variables were
absent, so an inherited `GIT_AUTHOR_NAME` would have reached `commit-tree` had this layer not set its own; the six are
added, the extra six kept (`packages/workspace/src/index.ts`). (b) A resumed session's writer forwarded commits to the
projection owner only — `launchContinuation` set `commitTarget.run` but nothing read it — so a continuation run's events
never reached the bus and its `result` never reached main; every earlier continuation proof had asserted the store,
never the notice (`Sessions.resume`). (c) The Git view's refresh that REQ-GIT-100 orders after a restore rewrote the
repository's index file: its `diff … HEAD` porcelain refreshes the index and writes it when a restored file's stat no
longer matches — the checkpoint operations themselves left the index byte-identical (measured by hand, command by command),
and the reason had been that a read is a read; `diff-index` compares the same trees and writes nothing, `status` now takes
`--no-optional-locks`, and the proof compares the index bytes across the whole restore launch, refresh included
(`git/view.ts`, `git/repository.ts`). (d) In the plan's command line, not the product: `for-each-ref` interpolates NUL
as `%00`, not the `%x00` of `git log`'s format — the listing parsed nothing until corrected. **Found: nothing** in the
decision itself, in the table, in the two orderings, or in the flow's gates.

**Readings taken.** ~~*Capture position:* after `iteration.end` is recorded and BEFORE the hooks' `iteration_end`, so the
checkpoint records the iteration's work as the agent left it and a hook that later carries the checkpoint (REQ-HOOKS-082
with checkpoints — owed) can be handed it; awaited, so it precedes the next iteration and teardown (REQ-GIT-051).~~
*Falsified 2026-10-13 (fin41, N68; the section at the end of this record):* REQ-HOOKS-082 is an ordering requirement —
"`iteration_end` hooks SHALL finish before that iteration's checkpoint is taken" — and says nothing of a hook carrying a
checkpoint; the reading put the capture on the wrong side of the hooks, so a hook's edit reached the next iteration's
checkpoint, or none after the last. *Capture position, as built since:* after `iteration.end` is recorded and AFTER the
hooks' `iteration_end` have finished; still awaited, so it precedes the next iteration and teardown (REQ-GIT-051).
*REQ-GIT-094's open-time repair is reachable:* ADR-0005's reap at resume releases a dead lock but leaves the status
`running`, and a session never resumed keeps both; the listing repairs a persisted-active session whose liveness is
`not-live` (a lock on this host with a dead pid, no lock at all, or this process's own lock with no run behind it) —
`interrupted`, the lock released, a `session.interrupted_recovered` timeline entry, the notice — and the proof's `live`
launch exits mid-run to produce exactly that session for the `repaired` launch (its notice is raised and logged; at the
capture the first-launch provider notice, raised 200 ms later, occupies ADR-0049's one slot — the same observation the Git
proof made of "Working without Git"). *REQ-GIT-093's probe with our own pid:*
a lock this process holds with no run in the registry is read as not live, since the process that would race the restore
is this one and it runs nothing for the session. *REQ-GIT-101:* main awaits its in-flight desktop checkpoint operation
before asking the run host to stop, then sends every workspace service `shutdown`, whose handler awaits the service's
in-flight checkpoint Git before exiting; the run host's own 30 s deadline can still cut a run whose capture ask is in
flight, which leaves a ref with no row — the tolerated state. *REQ-GIT-095's 150 ms retry* is the renderer's: main declines
with `checkpoint.busy`, the view retries once against the then-selected session. *REQ-GIT-095's unavailable listing* is a
bound session whose worktree path no longer exists (a filesystem question, no Git); whether the tree is a Git working tree
is settled at preview, gate 2. *REQ-GIT-053/024:* the checkpointed tree is the effective root — the worktree of an
isolated run — and the refs land in the shared repository (`for-each-ref` from the base sees them; the proof's `isolated`
launch). *REQ-GIT-036's "value quoted"* is read as the id reproduced verbatim. *A path that is not valid UTF-8* is carried
with U+FFFD by the helper's decoding (REQ-GIT-013); staging then names a path Git does not have, which is a Git decline
recorded as REQ-GIT-045's warning; not measured. *`files` on a parentless commit* is the whole tree (REQ-GIT-038's
"relative to its parent" has no parent to name). *A submodule* is recorded by `update-index` as its gitlink and
`checkout-index` leaves it alone, which is REQ-GIT-034's "never inspected, never restored"; not exercised by a test.
*The scripted edit in a continuation* needs the file read first in that process (the edit tool's own rule), which is why
the proof's continuation scripts are `readnotes,edit,answer`.

**Not built, said so.** REQ-GIT-069's ref cleanup at session deletion (the browser has no delete); REQ-GIT-058 gate 5's
`manual` checkpoints (no surface asks for one — the vocabulary is in the schema); ~~REQ-HOOKS-082 with checkpoints~~
*(built 2026-10-13, the section at the end)*; the export
of the two events (REQ-SESSION-199); improvement checkpoints (`REQ-LIBRARY-*`, the disjoint namespace and the fixed
retention of consequence 4); the row-side rebuild of consequence 6; REQ-GIT-054's unknown-session refusal reaches the
card as a disabled Restore with the reason (built) but no proof launch names an absent session.

ADR-0002 c.4 held throughout: the run host reaches Git only through main's relay to the workspace service, and the
checkpoint rows are the run host's (its session writer holds the lock), which is the reading of ADR-0002's "checkpoint
index" line — the session checkpoints' rows are the run host's, the improvement checkpoints' would be the service's.
ADR-0043 is unchanged: the session snapshot still omits the checkpoint list, which the card reads through a command.

## Second execution — 2026-09-06, REQ-GIT-069's cleanup at deletion (Part U)

*Recorded under GD-10; the row this note closes is the first "not built" item of the note above.*

**Built and run:** the session browser's Delete (`REQ-SESSION-166`) discards the session's refs before the record goes,
in the requirement's order: the run host loads the state to find the tree — the binding's worktree path for an
isolated session, else the workspace root — decides the liveness refusal first (a run under way here, or a live or
unknowable lock, refuses with a sentence distinct from the restore's, `REQ-GIT-151`), then asks main
`checkpoint.deleteNamespace {workspaceRoot, treeRoot, sessionId}`, relayed to the workspace service of that root like
the other three checkpoint asks (ADR-0002 c.4), which runs `deleteNamespace` (`prune(…, keep 0)`: the listing, then one
`update-ref -d` per ref by compare-and-swap); only then the one transaction. Cleanup is best-effort: a tree that is not
there is not asked about at all, the leftover `refs/rotaris/checkpoints/<sid>/` is logged as a warning naming the tree,
and the session still deletes. The proof deleted a session with two refs (both gone by `for-each-ref`), a session bound
to a worktree that had vanished (deleted, the warning logged), and an isolated session whose ref lived in the shared
repository's namespace (gone from there). The worktree directory of an isolated session is not removed by the delete —
it is the user's tree under `REQ-GIT-111`'s removal, not the session's record — and the proof records it left in place.

**Found: nothing in this record.**

## The first execution's proof on Linux: the stale-session repair and the lock its live launch left — 2026-09-28 (R-062)

`pnpm checkpoint-proof` failed once in the Linux sweep of 2026-09-28, on tree `392f681`. It stopped at step (d),
`repaired`, with "the stale session reads running, not interrupted", and passed on a lone re-run. **The repair of
REQ-GIT-094 behaved as written.** The session's lock named the `live` launch's run host. On that tree, main still
left before its run host, and Electron's teardown of the run host took up to 1.8 s. The `repaired` launch was
claimed 0.22 s after main's exit, while the holder's pid still answered, so the listing read the session as live
(REQ-GIT-093). A live session is not stale, and nothing was repaired. That window is the defect recorded and
repaired in `459e7c8`: main is now gone only after its run host
([`a-session-lock-outlives-…`](../../defects/fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md)).
On `main` the proof passed at once.

What was wrong in this record's proof is that it named the wrong mechanism. Its header promised "a
persisted-running session with a dead lock", but step (c) never checked that the lock was dead. Step (c) now probes
the lock's pid the moment the `live` launch returns (`lib/lock-holder.mjs`). A holder still alive fails there,
naming REQ-SESSION-047/056. Step (d)'s assertions are unchanged. Recorded and repaired in
[`checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md`](../../defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md).

In three consecutive runs on Linux as root under Xvfb, the pid was dead at the first probe each time, and the
repair was logged 1.48 to 1.81 s after the previous main's exit. All twelve scenarios passed.

**What it could not show:** the check firing on the built app. It would need the window `459e7c8` closed, and that
was not reopened; the failing path is pinned by `lock-holder.test.ts` only. Windows and macOS were not run (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

*On Windows, 2026-10-20* (the Windows ARM64 session's C2; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `30d35b3c`). In three runs the `live` launch's lock holder was dead at the first probe each time and `repaired` read `interrupted`, lock released, notice raised, the repair logged 1.45–2.09 s after the `live` launch's last log line (the Linux figure counts from main's exit, which that line precedes by a few milliseconds). No run passed whole: two stopped at `loaded-restore`'s 15 000 ms planting guard (planted at 22 622 and 17 432 ms, the refusal itself in the log both times) and one at `isolated-restore`, whose 6 617 ms confirm-time preview left the restore running when the capture ended ([`checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md`](../../defects/checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md)). The check firing on the built app is still not shown. `hookCapture` is skipped on Windows until C3.

## The listing record's `checkpoint_count` is this record's derived count — 2026-10-03 (fin11)

A defect note asked whether `Sessions.list`, which fills each row's count with `StoreDal.checkpointCount` (a `count(*)`
over that session's rows), breaks REQ-SESSION-042's "read nothing but those listing records"
([`the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md`](../../defects/fixed/the-session-list-counts-each-sessions-checkpoints-from-the-checkpoint-table.md)).
The reading recorded here: the count this record derives **is** REQ-SESSION-030's `checkpoint_count` field, held as a count
over rows rather than stored twice. It reads no session state, transcript or history, and no Git. Nothing in the code
changed. The same note's other half (the sessions card's token, duration and detail labels) waits on OQ-192. *(Ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the labels stay and the listing record gains the three fields, [`PD-SESSION-001`](../../product/directives/pd-session-001.md#pd-session-001); the note is closed.)*

## The capture after the iteration's hooks — reported back 2026-10-13 (fin41, N68)

*The defect note is [`an-iterations-checkpoint-is-captured-before-its-iteration-end-hooks-run`](../../defects/fixed/an-iterations-checkpoint-is-captured-before-its-iteration-end-hooks-run.md); the proof is `pnpm checkpoint-proof`'s `hook-capture`
launch.*

**What was falsified, and why it stood.** The first execution's "capture position" put the capture BEFORE the
`iteration_end` hooks and gave a reason: a hook "that later carries the checkpoint" could only be handed it if the capture
came first. REQ-HOOKS-082 asks for no such hook. It fixes an order — the hooks finish, then the iteration's checkpoint is
taken — so that a hook's edit to the tree (a formatter, a build artifact) belongs to the iteration whose hooks made it.
HARD constraint H-06 and `proposals/runtime.md` C8.6 say the same. Read as a payload rather than an order, the requirement
looked unbuilt ("owed") instead of contradicted, and the engine test pinned the built order (`capture:1` before
`hook:iteration_end`). The reading is struck through above and kept.

**As built.** `Run.iterate` records `iteration.end`, fires the `iteration_end` hooks and awaits them, then awaits the
capture, in a `finally`, so hooks that raise still leave the iteration its one capture (REQ-GIT-051) and the raise goes on
as before. The capture still finishes before the next iteration and before teardown. The two closes that fire no
`iteration_end` are unchanged: the decline's close of an iteration an earlier run left open captures without hooks, and
the record of an accepted explicit cancel captures nothing (`PD-ORCH-005` clause 36).

**The window this order opens** *(added 2026-10-14, fin43, a review finding of fin41)*. With the hooks before the capture,
a crash while the `iteration_end` hooks run — each bounded by its `timeout_seconds` plus REQ-HOOKS-033's 5 s grace, the
entries one after another — leaves a closed iteration with no checkpoint, and that iteration's work is taken by the next
iteration's capture. REQ-HOOKS-082 requires the order, so the window is its cost, not a defect; it is longer than the
capture-first order's, which a crash could only meet during the capture itself. OQ-103's "Nothing open to resume"
(`open-questions.md`) names the moment — an iteration closed while "its checkpoint is captured, its `iteration_end` hooks"
run; this paragraph states how long it now lasts.

**Measured.** `checkpoints.test.ts`: the order is `iteration_end` then `capture:1`; a hook that edits the tree after an
`await` has its edit in iteration 1's snapshot — the run's last; hooks that raise still leave one capture. The first two
were red on the code before. `checkpoint-proof`'s `hook-capture` launch, against Git: a global `iteration_end` hook writes
`HOOK.txt` after the scripted agent wrote `NOTES.md`, and checkpoint 1 lists both and its tree holds the hook's text.

