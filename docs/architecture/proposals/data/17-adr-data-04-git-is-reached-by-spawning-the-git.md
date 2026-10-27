# Architecture proposals — DATA slice — ADR-DATA-04 — Git is reached by spawning the `git` executable

Part 17 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-04 — Git is reached by spawning the `git` executable

### Decision to be made

Whether Git operations go through the `git` command-line executable, an in-process Git
implementation (`isomorphic-git`), native bindings (`nodegit`/libgit2), or a wrapper over the CLI
(`simple-git`).

### Constraints that bear on it

- **F1** per-layer invocation timeouts — five different values, each bounding **one invocation**.
- **F2** the error text is Git's own stderr verbatim; `<command>` is rendered as the subcommand plus
  its arguments with "no quoting, eliding, or truncation of any argument"; three case-insensitive
  substring matches decide the long-path remedy (`REQ-GIT-012`) and three more decide what counts as
  a branch collision (`REQ-GIT-010`).
- **F3** output decoded as UTF-8 with U+FFFD replacement.
- **F4** fourteen `GIT_*` variables neutralised per invocation, repository and working tree named
  explicitly on every invocation, everything else passed through.
- **F5** HEAD, the index bytes, the reflogs, the stash and the branch set left identical.
- **F9** no network subcommand ever; never write the user's Git configuration.
- **F10** repository detection and Git presence decided by asking Git, with a 15 s version check; no
  console window on Windows.
- `REQ-GIT-105` needs `git worktree list`, ahead/behind counts, a 30-commit log with abbreviated
  hashes and diff totals; `REQ-GIT-108` needs merge-base reachability against an upstream ref.

### Alternative A — `isomorphic-git` (pure JavaScript)

Real advantages: no external dependency, so `REQ-GIT-104`'s "Git is not installed" state would never
arise; no process spawn, so no console-window problem and no per-invocation cost; and complete
control over the object layer, which is genuinely attractive for **F5**.

It fails on **F2** decisively. `REQ-GIT-013` makes Git's **own stderr** the error text of every failed
worktree operation; `REQ-GIT-110`, `REQ-GIT-111` and `REQ-GIT-116` surface "Git's own wording" to the
user; and `REQ-GIT-012` matches three phrases Git emits and reproduces the complete Git failure text.
A JavaScript reimplementation emits its own messages. We would be authoring strings purporting to be
Git's, for every failure, across every Git version — which is not reporting Git's own wording but
fabricating it.

It also fails on **F10**: `REQ-GIT-103` requires repository detection to "ask Git, not the
filesystem", and requires the Git-installed question to be answered by asking Git for its version. A
pure-JS implementation has no version to report and would make `REQ-GIT-104`'s notice unreachable.
And it does not implement `git worktree` at all, which is the centre of domain 06.

### Alternative B — libgit2 bindings (`nodegit`)

Real advantages: an actual index API, so **F5**'s private index is a first-class operation rather
than an environment-variable arrangement; and no process spawn.

It fails on **F2** for the same reason as A — libgit2's error strings are libgit2's, not Git's — and
on **F4** more subtly: `REQ-GIT-031` requires the repository and working tree to be "named explicitly
on **every Git invocation** this domain makes" and the fourteen variables neutralised *for the
invocation*. libgit2 reads its own configuration and has its own environment handling; matching
Git's behaviour exactly, `core.longpaths` included, becomes our problem rather than Git's. It is also
a native module, carrying the Electron-rebuild and prebuilt-binary burden — on a project that has
just removed its other native dependency in ADR-DATA-01.

### Alternative C — `simple-git` (a promise wrapper over the CLI)

The right mechanism, wrapped. It spawns `git`, so **F2**, **F3** and **F10** are reachable in
principle. But it parses and reshapes output for many commands, normalises errors into its own error
type, and manages its own environment and task queue. The integration would consist of fighting it
back towards raw bytes: **F2** needs untouched stderr, **F4** needs precise per-invocation
environment control, **F1** needs a timeout bounding *one invocation* and reporting a specific
string, and `REQ-GIT-102` needs the Windows no-window spawn flag. What remains of the library after
those is the `spawn` call.

### Recommendation

**Spawn the `git` executable directly**, through a single small invocation helper owned by this
slice. No Git library.

The helper is the only place in the product that spawns `git`, and it is where **F1** to **F4** live.
It takes an argument vector; applies the caller's timeout; builds the environment by deleting the
fourteen named variables from a copy of the process environment and passing everything else through;
prepends the explicit repository and working-tree arguments; sets the Windows no-window flag;
captures stdout and stderr as bytes; decodes them as UTF-8 with replacement; and returns the raw
texts and the exit status without interpretation. The `<command>` rendering of `REQ-GIT-033` is
computed from the same argument vector, which is what makes it impossible for the rendered command
and the executed command to disagree.

Everything above it is a thin, testable mapping from that raw result to the message each requirement
fixes. `REQ-GIT-012`'s three phrases, `REQ-GIT-010`'s three phrases and `REQ-GIT-013`'s
stderr-else-stdout-else-`git command failed` ladder are all pure functions of the raw result and can
be tested with no repository present.

`REQ-GIT-001`'s no-network guarantee gets a mechanical enforcement point here: the helper rejects an
argument vector whose subcommand is in the network set, so the guarantee is a property of one
chokepoint rather than a discipline spread over every call site. `REQ-GIT-036`'s ref-name character
check likewise runs "before any Git call" at this boundary.

### Consequences accepted

- Git must be on `PATH`. The specification already accepts this and specifies the degraded state in
  full: `REQ-GIT-104`'s persistent notice with a fixed identity so refreshes replace rather than
  stack it, `REQ-GIT-042`'s availability rule, `REQ-GIT-112`'s sentinel message.
- Process-spawn cost per operation. `REQ-GIT-102` already bounds a refresh at 15 s × the number of
  reads, so the budget is stated — but a refresh issuing a dozen spawns is measurable, and the read
  set should be kept small rather than convenient.
- Output parsing is ours. Where a machine-readable form exists (`--porcelain`, `-z`,
  `--null-terminated`) it should be used, because `REQ-GIT-057`'s byte-order path sorting and
  `REQ-GIT-003`'s path handling both need paths as bytes rather than as Git's quoted display form.

### What would have to change to revisit this

A requirement that the product function with no Git installed, which `REQ-GIT-104` currently
contradicts by specifying that state in detail; or `REQ-GIT-013` being relaxed so error text need not
be Git's own — that single constraint is doing most of the work here.

---
