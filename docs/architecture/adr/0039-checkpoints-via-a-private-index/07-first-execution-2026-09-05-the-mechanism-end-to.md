# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — First execution — 2026-09-05, the mechanism end to end (Part P)

Part 7 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

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
