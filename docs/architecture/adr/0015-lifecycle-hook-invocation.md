# ADR-0015 — Lifecycle hook invocation

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** RUNTIME (ADR-RUNTIME-08), EXEC (C-119, ADR-EXEC-01 consequence on kill groups)
- **Depends on:** ADR-0002, ADR-0006, ADR-0008
- **Contains a cross-slice tension neither slice caught alone.**

## Context

`REQ-HOOKS-030` and `REQ-HOOKS-084`: the interpreter is fixed by platform (`/bin/sh -c`, or
`ComSpec`/`cmd.exe` `/c`) and **must not vary with the content of `command`**; the working directory is
the tree the run is changing, while the payload's `workspace` reports the base workspace.

`REQ-HOOKS-031` and `REQ-HOOKS-067`: the payload is delivered as **exactly one UTF-8 JSON object on
stdin, which is then closed**; the last byte is the closing brace, with **no trailing newline**; no
part of the payload may be placed on the command line or in the environment; a hook writing to
stdout or stderr before or while reading must not stall the invocation.

`REQ-HOOKS-033` is the sharpest. An invocation returns no later than `timeout_seconds` plus **5.0 s**
grace plus the time to start one process. Termination reaches **only the started process and must not
be widened to its process group**; descendants may outlive the hook and the run, and the run must
neither wait for, track, nor report them. **Collecting output must not block on a stream a surviving
descendant still holds open** — the grace period bounds that collection, and expiring it yields empty
output.

`REQ-HOOKS-040`: every applicable hook for an occurrence **runs, in declaration order, one after
another, even after one has decided to stop the call**; the decision that takes effect is the first
stopping outcome, determined once all have finished; dispatch must not stop early, and the difference
is observable. `REQ-HOOKS-042` and `REQ-HOOKS-055`: with several tool calls outstanding, a hook
consuming its entire budget on one call **must not delay the hooks of any other outstanding call**;
the failure tally is per stable id for the whole session; one switch-off warning however many calls
met the failing hook at once; one event pair and one timeline entry per invocation; and these are
invariants at every degree of concurrency, with no maximum concurrency fixed.

`REQ-HOOKS-080`, `REQ-HOOKS-081`, `REQ-HOOKS-082` and `REQ-SESSION-088`: hooks **run in line with the
run loop** — a hook that consumes its whole budget holds the run up for that long, and
`timeout_seconds` is the user's means of controlling it; the `iteration_end` hook for iteration N
finishes **before iteration N+1 begins** and **before that iteration's checkpoint is taken**, so an
edit it makes is captured by that checkpoint; `session_end` runs on every exit path, after the final
status has been decided, and before shutdown, with the status string **derived once and used for both
destinations** so the value on stdin is character-for-character the value on the `session.end` event.

`REQ-HOOKS-121` and `REQ-HOOKS-039`: the durable diagnostics entry is written **before** the
corresponding completion event is published, and degrades to a log line where diagnostics cannot be
written. `REQ-HOOKS-131` and `REQ-HOOKS-069`: the hook set is **fixed when the run starts**.
`REQ-HOOKS-122` and `REQ-SANDBOX-124`: hooks are **exempt from the tool permission policy and from any
sandbox**, executed in the user's own shell on the host, and the diagnostics of `REQ-HOOKS-118` to
`REQ-HOOKS-121` are the *sole* evidence that a hook executed. `REQ-HOOKS-129`, `REQ-HOOKS-072` and
`REQ-HOOKS-085`: **no hook-related condition may end a run**, alter its terminal status, or leave it
waiting beyond the per-hook bound. `REQ-HOOKS-041` and `REQ-HOOKS-127`: where a session has no eligible
hook for an event, **nothing observable happens**. `REQ-HOOKS-139` and `REQ-HOOKS-135` bound resolving
the set, validating configuration, computing the workspace fingerprint and applying the trust gate at
**50 ms** each at 100 entries; building one payload at **10 ms** at 100 KB; deciding an occurrence has
no applicable hook at under **1 ms**.

## Alternatives considered

**A — Run hooks off the run loop, fire-and-forget, so a slow hook never holds the run.** This is what
a reviewer will propose, and it is explicitly refused: `REQ-HOOKS-080` says a hook that consumes its
whole budget holds the run up for that long. More concretely it would break `REQ-SESSION-088`'s
checkpoint guarantee — an `iteration_end` hook that reformats sources must have finished before the
checkpoint is taken, and a detached hook cannot promise that. Rejected on the requirement, not on
taste.

**B — A persistent shell process per hook, fed commands.** Cheaper per invocation and would help
`REQ-HOOKS-139`. Rejected: `REQ-HOOKS-030` requires a **newly started process** handed to the
interpreter, and `REQ-HOOKS-036` requires a per-invocation, platform-independent "no exit status" state
that a persistent shell cannot produce.

**C — A fresh process per invocation, with a two-level runner.** Chosen.

## Decision

Per **occurrence** — one `pre_tool` for one tool call, one `iteration_end`, and so on — hooks run
strictly one after another in declaration order, each finishing before the next starts, with the
stopping verdict decided only after all have finished. **Occurrences run concurrently with one
another.** The shared, session-scoped state is the failure tally and the switched-off set, keyed by
stable hook id, and it must be safe against concurrent occurrences with exactly-once switch-off
semantics.

Three mechanics the constraints fix and which are easy to get wrong:

1. **Resolve on process exit, not on stream close.** A close event waits for all standard streams to
   end, and a surviving grandchild that inherited the pipe can hold them open indefinitely.
   `REQ-HOOKS-033` forbids waiting on exactly that. The runner therefore resolves on exit plus a grace
   timer and treats whatever was collected as final.
2. **Do not spawn detached and do not signal a process group.** `REQ-HOOKS-033` forbids widening
   termination to the group. This is the **opposite** of `REQ-ORCH-128`, where a verification-check
   skip *must* deliver the terminal interrupt to the process group, wait 5 s and then terminate and
   tear down the terminal session. **The two paths must not share a kill implementation** — the hook
   runner kills a process, the command-execution path kills a group.
3. **Write the exact payload bytes and end the stream.** `REQ-HOOKS-031` fixes the last byte as the
   closing brace with no trailing newline, so the payload is serialised once and written with a single
   write followed by an end; nothing may append a separator.

The eligibility check is a **precomputed per-event lookup built at run start**. `REQ-HOOKS-131` makes
the set immutable for the run, so it can be indexed by event once, which is what makes
`REQ-HOOKS-135`'s sub-millisecond no-applicable-hook decision achievable.

## Cross-slice tension recorded

**`REQ-HOOKS-033` and `REQ-TOOLS-111` pull against each other, and neither slice noticed.** RUNTIME
established that hook descendants **may outlive the hook and the run** and that the run must neither
track nor report them. EXEC established that `REQ-TOOLS-111` requires that once the application has
exited, **no background command it started is still running** — whatever ended it — and proposed a
Windows Job Object with kill-on-close covering the run host's subtree to satisfy it (ADR-0002,
consequence 5).

A Job Object covering the run host's whole subtree would kill hook descendants at application exit.
Whether that is a violation depends on whether `REQ-TOOLS-111`'s "background command it started" reads
as *background terminal sessions only* (domain 05's subject) or as *every process the application
started*. Two readings, two designs:

- **(a)** The Job Object covers only terminal-session children, and hook processes are spawned outside
  it. `REQ-HOOKS-033` is satisfied literally; `REQ-TOOLS-111` is satisfied on its narrow reading.
- **(b)** The Job Object covers the whole subtree. `REQ-TOOLS-111` is satisfied on its broad reading;
  `REQ-HOOKS-033`'s "descendants may outlive the run" becomes false at application exit.

**Recommendation: (a)**, because `REQ-TOOLS-111` sits in the terminal-execution section of domain 05
and `REQ-HOOKS-033` states its allowance in terms. Raised as open question OQ-9 rather than settled.

## Consequences accepted

1. A hook can hold an iteration boundary for `timeout_seconds` plus 5 s, by design, and the user
   controls it. The run's own budgets are unaffected because they are boundary-evaluated (ADR-0006).
2. Hook descendants may outlive the run. The specification says so, forbids tracking them, and forbids
   reporting them beyond a log line. Accepted without mitigation, subject to OQ-9.
3. Hooks bypass the permission policy and the sandbox entirely, so the hook diagnostics are the only
   evidence a hook ran. That makes `REQ-HOOKS-121`'s durable-before-event ordering load-bearing rather
   than tidy, and it makes the boundary a thing to state in **product documentation**, not only in the
   specification.
4. Building the payload reads the workspace fingerprint and the trust gate under 50 ms bounds at 100
   entries — a performance obligation on configuration resolution that ADR-0036 must respect.

## Revisit if

OQ-9 resolves toward reading (b); or `REQ-HOOKS-139`'s 50 ms bound cannot be met at 100 entries —
noting that the bound covers *resolving and validating* the set, not invoking, so process-per-
invocation is not in tension with it.
