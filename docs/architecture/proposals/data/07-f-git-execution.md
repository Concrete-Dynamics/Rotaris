# Architecture proposals — DATA slice — F. Git execution

Part 7 of 25 of [the data proposal](../data.md), which indexes every part.

## F. Git execution

**F1 — Every Git operation is a bounded external invocation, and the bounds differ by layer.
(hard)**
`REQ-GIT-146` gathers them: worktree-layer 30 s per invocation (`REQ-GIT-013`); checkpoint
ref-only operations 30 s and every checkpoint operation that inspects or writes tree content 300 s
(`REQ-GIT-033`); desktop Git reads 15 s each and the Git version check 15 s (`REQ-GIT-102`,
`REQ-GIT-103`); requirement-execution 30 s (`REQ-GIT-141`); the traceability layer's version-control
queries 30 s (`REQ-TRACE-170`, `REQ-TRACE-201`).
`REQ-GIT-033` is explicit that the limits are "the whole time budget and not a target: a repository
so large that staging or diffing it cannot finish inside 300 seconds SHALL produce this timeout
error rather than a longer wait, and that outcome is a correct result of this requirement and not a
defect in it." `REQ-TRACE-170`: "**No operation SHALL be able to block indefinitely on a child
process.**"

**F2 — Git's own stderr is the error text, verbatim, with exactly one exception. (hard)**
`REQ-GIT-013`: cannot start → `Could not run Git: <detail>`; non-zero exit → Git's stderr verbatim,
else stdout, else `git command failed`; timeout → `Git timed out after 30s: <command>`.
`REQ-GIT-033` fixes how `<command>` is rendered: the Git subcommand name followed by the arguments
passed to it, in invocation order, separated by single spaces, with the executable path omitted and
**"with no quoting, eliding, or truncation of any argument."**
`REQ-GIT-012` is the only case in the whole domain where Git's wording is replaced, and it is
triggered by a case-insensitive substring match against three specific phrases, with the *complete*
Git failure text — not merely the substring that matched — reproduced on line 2.
`REQ-GIT-010` matches three further case-insensitive Git message phrases to decide whether a failure
counts as a branch collision; "every other failure propagates unchanged without retrying."
`REQ-GIT-110`, `REQ-GIT-111`, `REQ-GIT-116`: Git failures surface Git's own wording.
Any layer that normalises, wraps, localises or structures Git's error output destroys these
observables.

**F3 — Git output is decoded UTF-8 with U+FFFD replacement, never strictly. (hard)**
`REQ-GIT-013`: "so a Git message carrying arbitrary bytes still yields a reported error rather than
an aborted operation." Same rule for repository files in `REQ-TRACE-006` and `REQ-TRACE-081`.

**F4 — Fourteen named Git environment variables must be neutralised, and the repository and working
tree named explicitly on every invocation. (hard)**
`REQ-GIT-031`: `GIT_INDEX_FILE`, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`,
`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_NAME`,
`GIT_COMMITTER_EMAIL`, `GIT_COMMITTER_DATE`. Each is neutralised for the invocation; the checkpoint
taken from inside a Git hook must be identical to one taken with none of them set, and the file
`GIT_INDEX_FILE` named must be byte-identical afterwards. **Every other environment variable is
passed through unchanged**, "since a checkpoint must still run under the user's PATH and locale."

**F5 — A checkpoint must leave the user's entire Git state byte-identical. (hard — the sharpest
mechanism constraint in the slice)**
`REQ-GIT-004`: identical before and after — the checked-out branch and the commit it points at, HEAD
including a detached HEAD, the symbolic-ref target, **the on-disk index file byte for byte**, the
reflogs of HEAD and of every branch, the stash, the set of branches, and the set of staged entries.
`REQ-GIT-030` adds: no reflog entry is written for HEAD or for any branch, no repack or garbage
collection is started, and **the repository's index file is never refreshed, rewritten, or locked**.
The only addition is one ref under `refs/rotaris/checkpoints/` and the objects it reaches.
This rules out `git stash`, `git add`, `git commit`, `git checkout`, `git reset`, and any temporary
branch. It requires a private index and object-level plumbing. `REQ-GIT-043` adds that this must
work on a detached HEAD and inside a linked worktree, with the ref stored in the shared repository
and the restore affecting only the linked tree.

**F6 — Capture content rules are exact. (hard)**
`REQ-GIT-034`: every tracked path at its current working-tree content **including tracked paths that
gitignore rules would otherwise cover**; plus every untracked path gitignore does not cover when
`checkpoints.include_untracked` is true; minus everything under `.rotaris/`; minus a tracked path
deleted in the working tree. Executable bit preserved. A symlink recorded as a symlink carrying its
target text, never as a copy of what it points at. A submodule recorded as the commit id the
containing repository currently has for it and nothing more — its own working tree never inspected,
captured or restored. Parent is HEAD, parentless when there is no HEAD.
The nothing-to-record comparison is made against **HEAD's tree with every excluded path removed from
it**, "so a repository that already tracks paths under `.rotaris/` can still report 'nothing to
record'".
`REQ-GIT-039`: rename detection at a similarity threshold of **50 per cent**, copy detection
**disabled**, and a status letter outside `A`/`D`/`M`/`R` carried through unchanged so a future Git
cannot make a preview unrenderable.

**F7 — Ref namespaces are fixed and disjoint; sequence numbers are never reused; deletions are
compare-and-swap. (hard)**
`REQ-GIT-029`: `refs/rotaris/checkpoints/<session-id>/<sequence>`.
`REQ-LIBRARY-067`: `refs/rotaris/improvements/<artifact_id>/<sequence>`, "disjoint from the
session-checkpoint namespace… so that neither feature's pruning can delete the other's refs".
`REQ-GIT-046` and `REQ-GIT-059`: every capture takes its sequence from **the maximum of two
sources** — the highest sequence in the recorded checkpoint list and the highest among the live refs
in that namespace — plus one. This holds numbering climbing across a prune, across a resume after an
interruption, and across a ref deleted from outside. When the live refs cannot be listed at all, the
recorded list alone is used and the capture still refuses to overwrite an existing ref.
`REQ-LIBRARY-071` states the same rule for improvement checkpoints and adds that the newest
`pre_improvement` checkpoint is never dropped by pruning.
`REQ-GIT-041`: "Ref deletions verify the recorded commit id at deletion time so a concurrently moved
ref is not silently clobbered." That is `git update-ref -d <ref> <oldvalue>` semantics, and it is the
only compare-and-swap primitive named anywhere in this slice.
`REQ-GIT-037`: listing enumerates only that session's namespace — a session id that is a prefix of
another never picks up the other's refs — keeps only numeric sequence suffixes, and sorts
**numerically** (10 after 9, not between 1 and 2).
`REQ-GIT-036`: session ids used in refs are restricted to `A–Z a–z 0–9 . _ -`, non-empty, not
starting `.`, not ending `.lock`, checked **before any Git call**.

**F8 — Branch namespaces are fixed and mutually disjoint. (hard)**
`rotaris/session/<session-id>` (`REQ-GIT-007`) with deterministic collision suffixes `-2`, `-3`, …
up to 50 attempts (`REQ-GIT-010`); `rotaris/integration/<integration-session-id>` (`REQ-GIT-130`);
`rotaris/req/…` from templates (`REQ-GIT-074`, `REQ-GIT-139`). `REQ-GIT-138` keeps the three
disjoint and puts the check at configuration load (see **D12**).
`REQ-GIT-009` fixes the branch-name rule set, and fixes an asymmetry that matters: a name the system
derives for itself is transformed into normal form and created under the transformed name, while a
name supplied by a caller or typed by a user is **never** transformed — it is accepted only if
already in normal form, so an explicitly supplied accepted name is always byte-identical to the
branch created from it. `REQ-GIT-116` requires the dialog's branch check to be "the whole rule set
of `REQ-GIT-009` and nothing narrower".

**F9 — No network Git subcommand, ever, and no write to the user's Git configuration. (hard)**
`REQ-GIT-001`: never `push`, `pull`, `fetch`, `clone`, `remote update`, `ls-remote`, "or any other
Git subcommand that opens a network connection". The checkable consequence is that with an
unreachable remote every operation produces the same user-visible result inside the same time
bounds. The only place a remote is named at all is the locally stored upstream ref, used for the
ahead/behind counters of `REQ-GIT-105`.
`REQ-GIT-012` and `REQ-GIT-114`: "No operation in this domain SHALL write to the user's Git
configuration" — including the long-path remedy, which *tells* the user the command rather than
running it. `REQ-GIT-114` also refuses the repository-setup offer outright when no Git identity is
configured, rather than inventing one.

**F10 — Repository detection asks Git, not the filesystem. (hard)**
`REQ-GIT-103`: whether the folder is a repository is decided by a Git query; whether Git is
installed at all is decided by asking Git for its version with a 15-second timeout — "a `.git`
folder on a machine without Git must not crash the window." `REQ-GIT-042`: checkpoint availability
is true exactly when Git can be run **and** the target root lies inside a Git working tree; a plain
folder or missing path degrades availability to false without raising.
`REQ-GIT-102`: "No console window SHALL appear on screen while a refresh runs" — a Windows process
spawn flag, and an easy thing to get wrong.

**F11 — Git is invoked from the desktop application under a per-read failure-tolerance rule.
(hard)**
`REQ-GIT-102`: a desktop refresh always ends in a rendered state and never raises a dialog; every
Git read that fails or is abandoned contributes its empty value instead; each read is abandoned
after 15 seconds, so a refresh finishes within 15 s × the number of reads it makes; exactly one
refresh runs at application start, after the window has first been drawn and before workspace
onboarding is offered; the interface accepts input throughout; shutdown waits for a refresh already
under way.
`REQ-GIT-101`: shutdown waits for any in-flight checkpoint Git operation rather than killing it
mid-call, bounded only by the `REQ-GIT-033` timeouts. Contrast `REQ-LIBRARY-127`, where shutdown
**abandons** the improvement analysis's provider call and must not wait.
