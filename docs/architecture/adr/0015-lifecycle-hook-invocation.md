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

## First execution — 2026-09-03/04, the runner against cmd.exe and the engine in the run

*Recorded under GD-10.*

**Built and run:** `@rotaris/hooks` (matcher, payload, runner, verdicts, trust gate, external import,
policy file, the per-session `HookEngine`) over the first slice of ADR-0036's loader (`@rotaris/config`:
the document tree, the `hooks:` section, the merge); the engine's `HookPort` and the gate's `ToolHooks`
filled at the run-host root with one object; the four lifecycle points in the run and the two slots in the
gate; the Hooks tab, the review dialog, the notices. Verified in the built app on this host: an unapproved
workspace withheld its two hooks (one `hook.finish` each, one `hook_trust` issue, one keyed notice) and the
six global entries its list had displaced were reinstated; the reinstated `pre_tool` guard stopped
`git push origin main` as a `blocked` row carrying REQ-HOOKS-049's text with the tool never run; `post_tool`
stderr rode in the `read_file` result; three failures switched a hook off with exactly one warning and the
advisory followed; a `session_end` hook read `status=completed` off stdin, the string the `session.end`
event carries; the review dialog allowed the set and `hook-trust.json` appeared; the approved run executed
the workspace hooks with the global list superseded; a refusal persisted and re-asked nothing; an imported
Claude Code `PreToolUse` on `Bash` fired for a terminal call under scope `external:claude-code` while the
workspace's own hooks stayed refused; `hooks.enabled: false` left nothing observable; no credential reached
a payload, the audit, the timeline or the stream.

**The three mechanics held, and one of them costs more on Windows than this record said.** Mechanic 1
(resolve on exit plus a grace, never on `close`) was exercised by a hook that spawned a detached grandchild
inheriting its pipes and sleeping 30 s: the hook resolved with its output after its own exit plus the grace.
Mechanic 3 held byte for byte: a node hook reading stdin to the end reported the payload's exact length and
`}` as its last byte. Mechanic 2 is where the cost lives. On Windows the interpreter is `cmd.exe /c`, and
`cmd.exe` runs the command as **its own child**; `ChildProcess.kill()` terminates `cmd.exe` and nothing
else, so the command survives the timeout path — the 60 s sleep under a 0.3 s budget was still running when
the invocation returned. REQ-HOOKS-033 permits exactly that ("a descendant is permitted to outlive both the
hook process and the run") and bounds collection with the grace, so **every timed-out hook on Windows
costs the full 5.0 s grace and reports empty output**; the invocation returned at 5,334 ms, inside the
bound. This is the specification's design, not a defect, but this record's "kill the started process only"
did not say that on this platform the started process is never the command. Recorded so nobody "fixes" it
with a tree kill, which REQ-HOOKS-033 forbids in terms and which the terminal path (ADR-0020) does on
purpose. **The clauses of this paragraph are true and the conclusion drawn from them — that this
is a Windows cost — is falsified; it is kept as written, and what replaces it is in the 2026-09-16 first
execution below.** OQ-9 is reading (a) by construction: no Job Object exists in this codebase yet, so nothing reaches
a hook's descendants at application exit; the question stays open for the day one does.

**Found — and it was not in this mechanism.** REQ-HOOKS-139's bound of 10 ms for a 100 KB payload exposed
kernel's redaction pass (ADR-0007) as quadratic over a long alphanumeric run: 26 s for 100,000 characters,
in the key pattern and, once that was bounded, in the unanchored URL-scheme pattern. Both are bounded and
anchored now (0.5 ms), no masking outcome changed, and the reason is on ADR-0007. It is the eighth defect of
the pattern in `implementation-conditions.md` decision 3, found by the first mechanism to run the pass at
size rather than by the pass's own first execution.

**Two decisions this record left open, taken here.** The segmenter is **not** ADR-0018's `decompose`: that
one honours `;;`, `$(…)` and backslash escapes for the policy's purposes and REQ-HOOKS-025 names a different
set with a literal backslash, so the two definitions are kept apart on purpose in `config/command-pattern.ts`
and `agent-tools/scanner.ts`. And the concurrency model is per occurrence sequential, occurrences
concurrent, with one tally: three simultaneous occurrences of a failing hook produced one switch-off and one
warning under a fake clock.

**A consequence of REQ-HOOKS-013 worth stating once, because a reviewer will read it as a bug.** A workspace
that declares any `hooks:` list *replaces* the global list. While the workspace's hooks are withheld the
displaced global entries are reinstated (REQ-HOOKS-098) and run; the moment the user allows the workspace's
hooks, the global entries are superseded and **stop running**. A global guard therefore protects an
unreviewed checkout and not a reviewed one. REQ-CONFIG-150 says list replacement "is not softened"; the tab
shows the displaced entries as `superseded` with the scope that replaced them (REQ-CONFIG-153).

**Owed and stated:** the working directory is the workspace until worktrees exist (REQ-HOOKS-030/084);
`verifier_finished` never fires (no verifier); REQ-HOOKS-082's before-the-checkpoint guarantee is vacuous
(no checkpoints); the notice slot is single (ADR-0049's note); the 50 ms / 10 ms / 1 ms bounds are tested
under vitest on this workstation, not under a benchmark harness (ADR-0053).

**2026-09-05, the hooks section inside the one configuration load.** ADR-0036's loader now reads `hooks:` as a
section of the whole load (a hook fault is fatal to the load, REQ-CONFIG-233); the run's hook port and the
Hooks category's summary keep `loadHooksConfig` for the per-file states they show. **Found: nothing.**

## First execution — 2026-09-16, the runner against `/bin/sh`

*Recorded under GD-10. The second first execution of this record, because the first measured one of the two
interpreters `REQ-HOOKS-030` fixes. `packages/hooks/src/runner.test.ts` gated its whole invocation block on
`describe.skipIf(!win)`, so until the suite ran on a POSIX host for the first time (`first-executions.md`,
2026-09-16) the `/bin/sh -c` half of the requirement, and every mechanic this record rests on, were executed
by nothing on Linux or macOS.*

**Run:** `packages/hooks/src/runner.test.ts` on Linux, `/bin/sh` being dash. The invocation proofs are now
written once and spelled twice — a per-interpreter table holds the command text and the two expectations the
shell itself decides, and every outcome assertion is shared.

**The three mechanics held on this interpreter too, and one sentence of the record above is corrected — the
platform attribution.** That record explained the full 5.0 s grace on a timed-out hook as a cost of Windows:
`cmd.exe /c` runs the command as its own child, so `ChildProcess.kill()` terminates `cmd.exe` and nothing
else. Every clause is true; the conclusion is not. **dash forks the command as well** — 5,306 ms for the same
60 s sleep under the same 0.3 s budget, against cmd.exe's 5,334 ms, with the same empty output for the same
reason. The general statement is that **the interpreter is always the started process and the command is
always its child**, on every platform; whether killing the one reaches the other is the *shell's* choice and
not the platform's, since a `/bin/sh` that execs a simple command rather than forking it dies with the
command and resolves at once, keeping whatever the command had already written. So a timed-out hook's cost,
and whether its partial output survives, both vary with which shell `/bin/sh` is — inside `REQ-HOOKS-033`'s
bound and permitted by it in terms. The proof therefore asserts the bound and not the cost, and says so.

**Reached for the first time anywhere: `REQ-HOOKS-039`'s signal path.** A hook spelled `kill -KILL $$` ends
the *started* process rather than its child, which is the outcome that requirement describes and which no
Windows command can produce — `child.kill()` there is a `TerminateProcess` and is the timeout path, a
different outcome. Measured: no exit status (`-1`), `signalled`, `timed_out = false`, and
`REQ-HOOKS-052`'s abnormal-termination warning. It is this file's one platform-specific proof, and the reason
is the platform's rather than a skip. A shell whose *command* dies by a signal is a different case and was
already correct: dash reports 137 as its own exit status, so the hook exited 137 and did not signal — the
same consequence of "the interpreter is the started process" as the paragraph above.

**`REQ-HOOKS-031`'s own example, executed on the platform it is written in.** The requirement illustrates the
no-injection rule with "a tool argument containing `; rm -rf /`", a POSIX sentence that until now could only
run under `cmd.exe`. A payload carrying a `;` separator and a `$(…)` substitution for this shell arrives whole
on stdin, byte for byte, with the marker file it would have created absent and no environment variable
carrying any of it.

**Found: nothing in this mechanism.** Interpreter selection, byte-exact stdin with `}` as the last byte,
`REQ-HOOKS-035`'s launch failure on a missing working directory (`spawn /bin/sh ENOENT`), `REQ-HOOKS-037`'s
16,384-byte per-stream cut with the total in the marker, and mechanic 1's grandchild holding the pipes open
all behaved on dash as they had on `cmd.exe`. `REQ-HOOKS-030`'s executable lookup is the interpreter's and
not this runner's: an unknown name is an exit status from a process that started, never `REQ-HOOKS-035`'s
launch failure, which is reserved for a process that never did.
