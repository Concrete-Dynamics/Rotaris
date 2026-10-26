# Architecture proposals — DATA slice — ESC-3 — Silent loss of a review decision under last-writer-wins

Part 25 of 25 of [the data proposal](../data.md), which indexes every part.

## ESC-3 — Silent loss of a review decision under last-writer-wins

`REQ-LIBRARY-042` fixes the semantics and accepts the consequence: "only two writers whose read and
write genuinely interleave can lose one of the two changes, and in that case the later replacement
wins whole… The agreement guarantee of `REQ-LIBRARY-164` is an agreement about what the store holds,
not a promise that no decision can be overwritten."

So a user can approve a proposal, another window can reject it, and one decision disappears with no
report. The specification is not ambiguous about this and I would not raise it except that the
neighbouring requirement `REQ-LIBRARY-173` already builds the machinery for the adjacent case: where
an action's target is no longer present, the action writes nothing, re-reads, and **posts a warning
naming the proposal that no longer exists**. Extending that from "no longer present" to "changed
underneath you" would be small, and `REQ-LIBRARY-116` already does something very close for the Undo
path: "Given a proposal whose status was changed again from another surface after the decision the
notice announced, Undo MUST write nothing and MUST report that the proposal has since changed and
name the status it now holds."

So the product already reports a concurrent change in one place and silently loses it in another.

The options:

1. **Match the specification.** Silent loss on the ordinary write path, a stated report on the Undo
   path. Conformant. My recommendation absent a decision, because `REQ-LIBRARY-042` is explicit.
2. **Extend `REQ-LIBRARY-116`'s reporting to every write** — compare the freshly read state against
   what the surface was showing, and where they differ, write nothing and report it. This adds a
   refusal where the specification has none, which is a change to what the user experiences.

Not a decision I should take silently on grounds of correctness-mindedness. **ESCALATE.**

---

# Part 5 — Open questions

Where the specification is genuinely silent on something this slice needs.

**OQ-1 — Delivery record file granularity.** `REQ-CONFIG-192` fixes the directory, the fields and
four settings, but not whether a delivery record is one file per requirement, one per transition, or
one for the store. ADR-DATA-07 chooses one per requirement and gives its reasoning, but the choice is
mine rather than the specification's and it is observable to anyone who opens `.rotaris/`.

**OQ-2 — Ordering between the delivery state write and the audit append.** `REQ-TRACE-405` requires
both to exist; `REQ-CONFIG-192` requires the audit trail to record each transition. Neither states
which is written first, so neither states what a crash between them leaves. ADR-DATA-07 proposes
state first, audit second, on the grounds that an unrecorded transition is a lesser evil than an
audit line for a transition that never happened — but the opposite argument (the audit trail is the
evidence and must never be missing an entry) is available, and `REQ-TRACE-133` chose exactly that
opposite direction for the tombstone log: "written **before** the new generated artifact, so that a
crash between the two leaves the identifier recorded rather than forgotten." Worth confirming.

**OQ-3 — Two incompatible Windows retry schedules.** `REQ-LIBRARY-043` fixes 5 attempts completing
within **1 second** of the first. `REQ-SESSION-033` (domain 07) fixes 5 attempts with backoff
0.05 / 0.1 / 0.2 / 0.4 / 0.8 s, summing to **1.55 s**. Both describe the same mechanism on the same
platform for the same reason. Either domain 07's schedule violates domain 14's bound if one primitive
serves both, or the two stores deliberately differ. ADR-DATA-02 contains the conflict by making the
schedule a per-store policy, but the two requirements should be reconciled rather than papered over.

**OQ-4 — Durability semantics are unstated.** No requirement in this slice asks for `fsync`.
`REQ-LIBRARY-138` asks for the prompts file to be "flushed to disk", which is the only durability
verb anywhere in my domains. Every other crash-safety requirement is phrased as an *ordering*
(`REQ-TRACE-133`, `REQ-GIT-048`, `REQ-GIT-058`) or as *the replace is atomic* (`REQ-TRACE-061`,
`REQ-LIBRARY-043`). Spike 1 showed directory `fsync` is unavailable on Windows through Node, so the
POSIX rename-durability idiom cannot be applied uniformly. The question is whether "atomic" here
means only "no torn read" — which `rename` gives — or also "survives a power loss", which it does not
without an `fsync` of the file before the rename. `REQ-LIBRARY-043` says "a write interrupted by a
crash or power loss MUST leave the artifact readable", which is satisfied by either reading. I would
propose `fsync` on the staged file before `rename` and no directory `fsync`, but the requirement does
not settle it.

**OQ-5 — No cost budget for the parse-requiring checks.** `REQ-TRACE-088`'s one-second budget covers
"the sweep alone — enumeration, reading and matching". `REQ-TRACE-104`'s re-export-only test and
`REQ-TRACE-109`'s test-function collection both require a full syntax tree, and `REQ-TRACE-091`
requires them in the same verification run. No budget is stated for them. At `REQ-TRACE-088`'s scale
of 10³ source files a full-fidelity parse is materially more expensive than a regex pass, and it
would be useful to know whether that is intended to sit inside the same expectation.

**OQ-6 — User-supplied regular expressions run unbounded.** `REQ-TRACE-073` compiles four patterns
per project-declared convention and evaluates them against every claimed file's normalised text.
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern
with catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own
mitigations — the board stays usable, the last good board stays on screen — cover the *symptom* but
leave the pass wedged. ADR-DATA-08's worker-thread placement makes it terminable; whether it *should*
be terminated, and what the user is told, is not specified. Note the pattern comes from a file in the
checked-out repository, so it arrives with a project rather than from the user.

**OQ-7 — What raising `requirements.delivery.schema_version` is for.** `REQ-CONFIG-192` makes it
configurable (int ≥ 1, default 1) and says "The reader supports exactly the versions **1 through the
configured `schema_version`**, which as shipped is the single version `1`". So a user raising the key
widens what the reader will interpret, for versions the shipped build has no code to interpret. The
intent is unclear and the failure mode of setting it to 2 today is unstated.

**OQ-8 — `secrets.yaml` is given no file mode.** `REQ-CONFIG-444` requires mode `0644` for every
writer of `agents.yaml`, and `REQ-CONFIG-212` for the discovery snapshot. `REQ-CONFIG-216` requires
`secrets.yaml`'s write to be atomic and to create its directory, and says nothing about mode — so on
the plain reading it inherits the process umask. `secrets.yaml` is the one file in this slice that
holds credentials by design (`REQ-CONFIG-007`, `REQ-CONFIG-214`), and `0644` would make it
world-readable on a shared POSIX machine. This looks like an omission rather than a decision, and
`0600` would be the obvious value. Raising it rather than choosing it, because tightening a mode the
specification left unstated is still a change to an observable.

**OQ-9 — Whether the workspace service is per-window or per-application.** ADR-DATA-08 assumes one
per open workspace. Domain 12 owns window management and domain 07 owns the session model; whether
two windows on the same workspace share a service, and what that means for `REQ-GIT-091`'s
"at most one desktop checkpoint operation in flight" (is that per window or per workspace?), is not
something my domains settle. `REQ-GIT-128`'s integration lock is explicitly per base workspace, which
is a hint that workspace is the right unit.

---

# Part 6 — Findings that bear on the candidate stack

Summarised for the synthesis step.

| Candidate element | Verdict from this slice |
| --- | --- |
| **SQLite + Drizzle + better-sqlite3** | **Poor fit — recommend removing.** `REQ-TRACE-502` requires concurrent invocations never to wait and never to fail because another was running, which a lock-based store cannot provide. `REQ-TRACE-089` forbids consulting a stored summary in place of reading the files. `REQ-CONFIG-192` requires per-record forward-tolerant versioning with unsupported records left unmigrated on disk. See ADR-DATA-01. |
| **Event journal with projections** | **Partly fixed, partly misapplied.** A per-session journal is specified in detail by domain 20 and is not ours to choose. Nothing in this slice is event-sourced: configuration, worktree bindings, improvement artifacts and delivery records are documents with fixed formats, and `REQ-LIBRARY-049`'s version history holds full copies with intermediate versions pruned, which an event log cannot survive. See ADR-DATA-01 Alternative C. |
| **A separate runtime process for run execution** | **Fits, but insufficient by itself.** Configuration, the Git view, the board and the improvement library are all needed with no run active, so they cannot live in a per-run process. This slice proposes an additional long-lived per-workspace service. See ADR-DATA-08. |
| **Electron** | **Settled by product decision, and no requirement in this slice contradicts it.** `REQ-SHELL-006` frees the preference store's physical form, which Electron's `userData` path satisfies. |
| **TypeScript** | **Fits, with a named consequence.** `REQ-TRACE-075` makes the built-in annotation convention claim the implementation language's source extension, so choosing TypeScript makes the generated requirement-symbol artifact a TypeScript module, requires a TypeScript syntax tree inside the product for `REQ-TRACE-104` and `REQ-TRACE-109`, and requires a test-runner hook for `REQ-TRACE-182`. This is an input to the ARCH slice's language decision. See ADR-DATA-06. |
| **Zustand, React, Vercel AI SDK, MCP SDK, xterm.js/node-pty, electron-vite** | Outside this slice; no constraint of mine bears on them. |
| **New: a YAML library is required** | `yaml@2.9.0` recommended over `js-yaml`, because only it exposes the document AST that `REQ-CONFIG-055` to `REQ-CONFIG-057`'s tri-state and `REQ-CONFIG-248`'s key-order preservation need. See ADR-DATA-03 and Spike 2. |
| **New: no Git library** | `git` is spawned directly. `isomorphic-git`, `nodegit` and `simple-git` each fail `REQ-GIT-013`'s requirement that the error text be Git's own stderr verbatim. See ADR-DATA-04. |
