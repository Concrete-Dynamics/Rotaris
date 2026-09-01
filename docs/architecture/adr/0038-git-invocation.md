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
