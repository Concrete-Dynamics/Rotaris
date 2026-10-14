# ADR-0038 — Git is reached by spawning the `git` executable

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** DATA (ADR-DATA-04)
- **Depends on:** ADR-0001, ADR-0002
- **Constrains:** ADR-0039

## Context

`REQ-GIT-146` gathers the per-layer invocation timeouts, and they differ by layer: worktree operations
30 s (`REQ-GIT-013`); checkpoint ref-only operations 30 s and every checkpoint operation that inspects
or writes tree content 300 s (`REQ-GIT-033`); desktop Git reads 15 s each and the version check 15 s
(`REQ-GIT-102`, `REQ-GIT-103`); requirement execution 30 s (`REQ-GIT-141`); the traceability layer's
version-control queries 30 s (`REQ-TRACE-170`). `REQ-GIT-033` is explicit that a limit is "the whole time
budget and not a target: a repository so large that staging or diffing it cannot finish inside 300
seconds shall produce this timeout error rather than a longer wait, and that outcome is a correct result
of this requirement and not a defect in it." `REQ-TRACE-170`: **no operation shall be able to block
indefinitely on a child process.**

`REQ-GIT-013`: **Git's own stderr is the error text, verbatim** — cannot start yields a fixed prefix;
non-zero exit yields Git's stderr, else its stdout, else a fixed sentence; timeout yields a fixed
sentence naming the command. `REQ-GIT-033` fixes how the command is rendered: the subcommand name
followed by the arguments passed to it, in invocation order, separated by single spaces, with the
executable path omitted and **"no quoting, eliding, or truncation of any argument"**. `REQ-GIT-012` is
the only case in the whole domain where Git's wording is replaced, and it is triggered by a
case-insensitive substring match against three specific phrases, with the *complete* Git failure text
reproduced. `REQ-GIT-010` matches three further phrases to decide whether a failure counts as a branch
collision, and "every other failure propagates unchanged without retrying". `REQ-GIT-110`,
`REQ-GIT-111` and `REQ-GIT-116` surface Git's own wording to the user.

`REQ-GIT-013` and `REQ-TRACE-006`: output is decoded UTF-8 with replacement characters, never strictly,
"so a Git message carrying arbitrary bytes still yields a reported error rather than an aborted
operation".

`REQ-GIT-031`: **fourteen named Git environment variables must be neutralised** for the invocation and
the repository and working tree **named explicitly on every invocation**; a checkpoint taken from inside
a Git hook must be identical to one taken with none of them set, and the index file the environment
names must be byte-identical afterwards. **Every other environment variable is passed through
unchanged**, since a checkpoint must still run under the user's path and locale.

`REQ-GIT-001`: **never** a network subcommand — push, pull, fetch, clone, remote update, remote listing,
"or any other Git subcommand that opens a network connection". The checkable consequence is that with an
unreachable remote every operation produces the same user-visible result inside the same time bounds.
`REQ-GIT-012` and `REQ-GIT-114`: **no operation in this domain writes to the user's Git configuration**
— including the long-path remedy, which *tells* the user the command rather than running it — and the
repository-setup offer is refused outright when no Git identity is configured rather than one being
invented.

`REQ-GIT-103`: whether the folder is a repository is decided by **asking Git**, not by the filesystem;
whether Git is installed at all is decided by asking Git for its version with a 15-second timeout — "a
`.git` folder on a machine without Git must not crash the window". `REQ-GIT-042`: checkpoint
availability is true exactly when Git can be run **and** the target root lies inside a Git working tree.
`REQ-GIT-102`: **no console window shall appear on screen while a refresh runs**, and a desktop refresh
always ends in a rendered state, never raises a dialog, contributes an empty value for every read that
fails or is abandoned, and finishes within 15 s times the number of reads it makes.

`REQ-GIT-057`: ascending path order is ascending **byte** order of the path's UTF-8 encoding,
deterministic and independent of locale and platform, for the whole of domain 06.

## Alternatives considered

**A — A pure-language Git implementation.** Real advantages: no external dependency, so the
"Git is not installed" state would never arise; no process spawn, so no console-window problem and no
per-invocation cost; and complete control over the object layer, which is genuinely attractive for the
checkpoint mechanism.

It fails on the error-text rule decisively. `REQ-GIT-013` makes **Git's own stderr** the error text of
every failed worktree operation; three other requirements surface "Git's own wording" to the user; and
`REQ-GIT-012` matches three phrases Git emits and reproduces the complete Git failure text. A
reimplementation emits its own messages. We would be **authoring strings purporting to be Git's**, for
every failure, across every Git version — which is not reporting Git's own wording but fabricating it.
It also fails `REQ-GIT-103`, which requires repository detection to ask Git and requires the
Git-installed question to be answered by asking Git for its version, and it does not implement the
worktree subcommand at all, which is the centre of domain 06.

**B — Native bindings to a Git library.** Real advantages: an actual index API, so the private index of
ADR-0039 is a first-class operation; and no process spawn. It fails the error-text rule for the same
reason as A — the library's error strings are the library's, not Git's — and fails `REQ-GIT-031` more
subtly: the repository and working tree must be named explicitly on **every Git invocation this domain
makes** and the fourteen variables neutralised *for the invocation*, while a library reads its own
configuration and has its own environment handling, so matching Git's behaviour exactly, long-path
handling included, becomes our problem rather than Git's. It is also a native module, on a record that
has just removed its other native dependency (ADR-0003).

**C — A promise wrapper over the command line.** The right mechanism, wrapped. It spawns Git, so the
error-text, decoding and detection rules are reachable in principle. But it parses and reshapes output
for many commands, normalises errors into its own error type, and manages its own environment and task
queue. The integration would consist of fighting it back towards raw bytes: untouched stderr, precise
per-invocation environment control, a timeout bounding *one invocation* and reporting a specific string,
and the no-window spawn flag. What remains of the library after those is the spawn call.

## Decision

**Spawn the `git` executable directly**, through a single small invocation helper owned by the workspace
service. **No Git library.**

The helper is the only place in the product that spawns Git. It takes an argument vector; applies the
caller's timeout; builds the environment by **deleting the fourteen named variables from a copy of the
process environment and passing everything else through**; prepends the explicit repository and
working-tree arguments; sets the no-window spawn flag; captures stdout and stderr **as bytes**; decodes
them as UTF-8 with replacement; and returns the raw texts and the exit status **without
interpretation**.

The command rendering of `REQ-GIT-033` is computed from the **same argument vector**, which is what
makes it impossible for the rendered command and the executed command to disagree.

Everything above the helper is a thin, testable mapping from that raw result to the message each
requirement fixes. The three phrase matches of `REQ-GIT-012`, the three of `REQ-GIT-010` and
`REQ-GIT-013`'s stderr-else-stdout-else-fixed-sentence ladder are all **pure functions of the raw
result** and can be tested with no repository present.

`REQ-GIT-001`'s no-network guarantee gets a **mechanical enforcement point** here: the helper rejects an
argument vector whose subcommand is in the network set, so the guarantee is a property of one chokepoint
rather than a discipline spread over every call site. `REQ-GIT-036`'s reference-name character check
likewise runs "before any Git call" at this boundary.

## Consequences accepted

1. **Git must be on the search path.** The specification already accepts this and specifies the degraded
   state in full: a persistent notice with a fixed identity so refreshes replace rather than stack it,
   an availability rule, and a sentinel message.
2. Process-spawn cost per operation. `REQ-GIT-102` already bounds a refresh at 15 s times the number of
   reads, so the budget is stated — but a refresh issuing a dozen spawns is measurable, and the read set
   should be kept small rather than convenient.
3. **Output parsing is ours.** Where a machine-readable form exists it must be used, because
   `REQ-GIT-057`'s byte-order path sorting and `REQ-GIT-003`'s path handling both need paths as
   **bytes** rather than as Git's quoted display form.
4. The helper lives in the workspace service (ADR-0002), so every Git invocation is off both the window
   loop and the run host's loop. The run host reaches Git only through the workspace service.

## Revisit if

A requirement appears that the product function with no Git installed, which `REQ-GIT-104` currently
contradicts by specifying that state in detail; or `REQ-GIT-013` is relaxed so error text need not be
Git's own — that single constraint is doing most of the work here.

## First execution — 2026-09-05, the repository card's five reads (Part M)

*Recorded under GD-10. The helper as decided; nothing in this record was falsified.*

**Built and run** (`packages/workspace/src/git/invoke.ts`, `git/repository.ts`; the workspace service answers
`repository.read`): the one helper — an argument vector in, `-C <workspace>` prepended so the working tree is named on
every invocation, REQ-GIT-031's fourteen variables deleted from a copy of the environment and everything else passed
through, `windowsHide` so no console window appears (REQ-GIT-102), stdout and stderr captured as bytes and decoded
UTF-8 with replacement, the caller's timeout from the clock port (never `Date.now`, which the lint refused on the
first draft), the raw texts and the exit status returned without interpretation; REQ-GIT-001's network set refused
at the chokepoint before anything spawns; REQ-GIT-033's rendering computed from the same vector. Above it,
REQ-MONITOR-168's reads in order — `--version` (REQ-GIT-103: whether Git exists is asked of Git), `rev-parse
--is-inside-work-tree` (whether the folder is a repository, asked of Git), the branch, the upstream and the
left-right count, `status --porcelain` — each bounded at 15 s, each failure an empty value and a name in `failed`.

**Measured** (`pnpm overview-proof`, this machine, Git 2.41 for Windows): the five reads on a one-commit repository
take **≈430 ms** together, at start and again after a run; with `PATH` emptied of Git the version read fails, every
value is empty and **no dialog appears** — the window keeps painting. The unit test exercises the scrub, the
refusal, the rendering, a missing executable, a non-repository and a fresh repository it creates (≈1.6 s for the
five reads there, the first `git` start included).

**What was not built, said so:** consequence 1's fixed-identity notice when Git is missing (the card shows its
empty state; the notice is the Git view's), the three phrase matches of REQ-GIT-010/012, REQ-GIT-036's reference-name
check, every operation that writes; and the timeout path has no test that reaches it (no Git read on this machine
takes 15 s) — it is read, not measured.

## Second execution — 2026-09-05, the Git view's reads and the first writes (Part O)

*Recorded under GD-10. The helper as decided; nothing in the decision was falsified.*

**Built and run** (`packages/workspace/src/git/view.ts`, `git/worktrees.ts`, `git/paths.ts`; the workspace service answers
`git.view`, `worktree.create`, `worktree.remove`, `worktree.checkAttach`): every read and every write through the one
helper. **The reads** (REQ-GIT-105): the two gates, the branch, the upstream and its left-right count, the workspace's
`status --porcelain -z` and `diff --numstat -z HEAD`, `worktree list --porcelain`, `rev-parse --git-common-dir`, `log -30`
and the local set `rev-list <upstream>..HEAD` — then two per linked worktree (the count and the merge-base diff, both
against the base tree's branch), each bounded at **15 s**, each failure its empty value and its name in `failed`. The
base tree is the entry whose path is the common directory's parent, never a branch name (REQ-GIT-106); every path is
counted under REQ-GIT-003's exclusion on the path as named; the local flag is the reachability set, never a position
(REQ-GIT-108). **The writes** (REQ-GIT-005..013, 110, 111): `worktree add -b <branch> <path> <base>` after the two
REQ-GIT-006 checks and the path check, collision-safe by REQ-GIT-010's exact three phrases with `-2`..`-50`,
`worktree remove [--force]` with Git's own "contains modified or untracked files, use --force to delete it" recognised
as the ONE refusal force would cure, and the attach check by common directory — each bounded at **30 s**, each failure
REQ-GIT-013's ladder verbatim, REQ-GIT-012's two-line replacement the only rewording. Consequence 1's notice now
exists: `git.missing`, "Working without Git", raised once per application session from main when a refresh answers
`gitAvailable: false`; a non-repository raises nothing.

**Measured** (`pnpm git-proof`, this machine, Git 2.41 for Windows): a refresh of a three-commit repository with one
linked worktree is **11 reads in 710–876 ms**; the unit test's repository with a bare remote and a linked tree reads in
≈1.5 s with the first Git start. A session worktree is created under `.rotaris/worktrees/<sid>` and the scripted run's
`write_file` lands `NOTES.md` in it and not in the base, which stays clean (`.rotaris/` ignored). The two-step delete
was executed against a real refusal: Git's phrase matched, the forced removal took the directory with it.

*Reported back 2026-10-13 (fin41): the configured storage subpath, first executed.* The sentence above names the default
directory because the default was the only one ever used: main sent `worktree.create`'s session target with no `subpath`, and the
`worktree_storage_subpath` the loader read reached nothing
([`a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md`](../../defects/fixed/a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md)).
Main now reads the key from the service's `config.read` snapshot and sends it; `pnpm git-proof` launch 7 (`configured-subpath`)
creates, writes and lists a session tree at `.rotaris/trees/sessions/<sid>` with no `.rotaris/worktrees/` made. The write path of
this record (REQ-GIT-005's placement and its `Worktree storage path must stay inside .rotaris.` refusal in
`sessionWorktreePath`) held as written; the defect was upstream of it. REQ-GIT-138's directory half, which the record did not
place, is now made at load (`worktreeStorageCollision`); a value that contains the requirement directory loads, ruled (OQ-263, confirmed as built,
2026-10-13 under R-072).

**REQ-GIT-010/012's phrase matches, now executed:** the collision phrase was hit by a real `worktree add` on an existing
branch (`a branch named '…' already exists`), the suffix `-2` taken; the long-path phrases are matched against a
Git-shaped fixture only — no path on this machine exceeds the limit, so that branch is tested, not measured.
**The 30 s timeout path** is now reached by the unit test with a 1 ms bound: the text is the fixed sentence with the
rendered command. **Found:** nothing in the helper or the reads. Two things beside them, both in the verification
seams and neither a mechanism of this record: an occluded Electron window stops painting, so a capture returned a frame
older than the DOM the probes read (background throttling is now off while capturing); and a folder under the product's
own checkout is inside a repository — the "plain folder" scenario had to live in the OS temp directory, which is
REQ-GIT-103 behaving exactly as written. **Readings taken:** REQ-GIT-107's untracked paths count in `files` and in
`uncommitted` with no line count read (a line count would mean reading the file); REQ-GIT-019/022's "re-rooted" is
read as "the record and the configuration stay with the base, the work happens in the tree"; REQ-GIT-022/023's order
with a main-minted id is "bind first, then ask for the session", so a failed bind has no session to delete.

## Third execution — 2026-09-05, the checkpoint layer (Part P; ADR-0039's first)

*Recorded under GD-10. The helper as decided, with two seams it needed and two defects it held.* Every checkpoint invocation
goes through it under REQ-GIT-033's two limits (30 s ref-only, 300 s tree content), each carrying `-c gc.auto=0`
(ADR-0039 §3). **Seams added:** `stdin` (the NUL-separated path list `update-index --stdin` consumes) and `setEnv`, applied
AFTER REQ-GIT-031's scrub so the private `GIT_INDEX_FILE` and REQ-GIT-032's fixed identity are set once the inherited
ones are gone — the "neutralise, then set our own" of ADR-0039 §1, now two lines in one place. **Found:** (1) the network
chokepoint took the first non-dash argument as the subcommand, so a global option's value stood in for it and `-c gc.auto=0
push` would have passed — `subcommandIndex` now skips Git's value-taking global options, and REQ-GIT-033's rendering starts
at the subcommand; (2) the denylist's fourteen names were not REQ-GIT-031's fourteen — the six identity variables were
missing and six others present; the six are added and the others kept; (3) the Git view's own refresh, run after a
checkpoint restore (REQ-GIT-100), rewrote the repository's index file — `diff … HEAD` refreshes the index and writes it
once a restored file's stat is stale, which REQ-GIT-004/030 forbid of the flow as a whole; the numstat is now
`diff-index --numstat HEAD` (the same trees, nothing written) and every `status` read takes `--no-optional-locks`; the
figures of REQ-GIT-105/107 are unchanged. The **300 s limit** is reached by the checkpoint
unit test with a 1 ms bound: the text is `Git timed out after 1s: ls-files -z` — the limit rendered in whole seconds
(rounded up) with the rendered command and without the global option. Measured through this layer: a capture is 12
invocations in ≈1.2 s on this machine, roughly 100 ms per Git start; a preview is 12 in ≈1.0 s, the restore's two in ≈0.24 s.
