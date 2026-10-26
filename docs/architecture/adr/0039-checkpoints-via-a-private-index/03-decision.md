# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Decision

Part 3 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

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
