# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-10)
- **Depends on:** ADR-0002, ADR-0033, ADR-0054
- **Blocked by an open question (OQ-23) about what the sentinel branch must do.**

## Context

`REQ-MCP-033`: the reserved token `builtin:code-intelligence` is recognised **before every other
command-resolution rule** and is never looked up on the search path. In a frozen installation it
resolves to "the application's own executable with the same token as its first argument — one literal
serves as both the token and the sentinel, so there is nothing else to keep in step". Such a process
answers the protocol on its standard streams, **presents no user interface, opens no window**, and
terminates with the server's own exit status.

`REQ-MCP-037`: a `stdio` entry carrying the token counts as available **unconditionally**, because what
it resolves to ships with the application. `REQ-MCP-113`'s launch guarantee applies to this child too —
it is the application's own executable (ADR-0033).

`REQ-MCP-116`: **exactly one binding manifest** is the single place the pinned runtime's identifiers
are written — distribution id, pinned version, transport and mode arguments, launch subcommand, both
project-selection options, marker file name, the three setup subcommands, the indexable extension list,
and the four grant tiers' tool names plus three never-grant names. It is **not user-editable**, is not
read at run time from any location a user can write, and does not vary by workspace.

`REQ-MCP-015`, `REQ-MCP-011` and `REQ-MCP-095`: build checks verify tier cardinalities, pairwise
disjointness, the absence of never-grant names, that **every name is reported by the pinned runtime's
own tool listing**, and that a shipped entry's version string matches the setup manifest character for
character. **A failing build must not ship.** `REQ-MCP-015`'s stated purpose is that "an upstream rename
therefore fails a build rather than silently degrading a grant at run time".

`REQ-MCP-036` and `REQ-MCP-099`: the setup invocation is **derived** from the configured entry — the
resolved command plus exactly the argument prefix preceding the launch subcommand — and **no substitute
command may be used**; setup then runs three subcommands against it, at 300, 1800 and 120 seconds, with
UTF-8 child encoding, quarter-second polling, a 5-second terminate grace then force-kill of the whole
process tree, failing output truncated to its **last** 400 characters, and a status vocabulary in which
a failure stops the steps that follow.

`REQ-MCP-034`: workspace binding appends exactly two arguments at the end when the args contain the
launch subcommand and no project-selection argument, matched on the launch subcommand alone
independently of the entry's name; a server launched with a project path must not advertise its
project-switching or configuration-introspection tools. For an isolated working tree the appended path
is that tree's root, so **binding is per run, not per configuration**.

`REQ-CONFIG-181` leaves the identity of the pinned distribution to the implementation and permits it to
change between releases.

## Alternatives considered

**A — Ship the runtime as a separate bundled executable and resolve the token to its path inside the
application's resources.**

*For:* simplest mental model; the setup subcommands work because it is just the runtime's own
executable; no argv branch in the application; the process is plainly not the application, so "presents
no user interface" is trivially true.
*Against:* it contradicts `REQ-MCP-033` as written — a frozen installation is required to resolve the
token to **the application's own executable** with the token as its first argument, with the explicit
rationale that one literal serves as both the token and the sentinel. Choosing A means proposing a
change to that requirement, which is legitimate but must be stated rather than done quietly. It also
sits awkwardly with `REQ-STARTUP-002`'s single-executable rule.

**B — An early argv branch in the packaged binary that hosts the runtime in-process.**

*For:* matches `REQ-MCP-033` exactly; nothing extra to locate on disk.
*Against:* it only works if the runtime can be hosted in the application's own language runtime.
`REQ-MCP-011` pins a third-party **distribution** at an exact version and `REQ-CONFIG-181` leaves its
identity open and permits it to change — so the runtime may well not be hostable in-process, and
committing the architecture to that constrains a choice the specification deliberately left open.

**C — An early argv branch that executes or supervises the bundled runtime, passing through all
remaining arguments and propagating its exit status.** Chosen.

*For:* satisfies `REQ-MCP-033`'s letter — the token is the sentinel, the process answers the protocol on
its standard streams, no window, the parent observes the server's own exit code — while leaving
`REQ-CONFIG-181`'s freedom intact. It also answers OQ-23 in the only way that makes `REQ-MCP-036` and
`REQ-MCP-099` work: the branch is a **general pass-through**, so the setup subcommands reach the runtime
unchanged.
*Against:* an extra process in the chain, and the branch must run before **anything** in the
application bootstrap that could open a window, write to standard output, or install a crash handler
that writes to standard output — a real ordering hazard, since anything on standard output corrupts the
JSON-RPC stream.

## Decision

**Alternative C, subject to OQ-23 being confirmed.**

- The packaged binary's entry point begins with: **if the first argument is the reserved token, hand
  the remaining arguments to the bundled runtime and propagate its exit status; do nothing else first.**
  No application bootstrap, no window, no writing to standard output, ever, on this path. On Windows
  this branch needs the runtime's node-mode environment flag or an equivalent, which is a spike item.
- The bundled runtime's location inside the packaged resources is resolved **by the branch**, not by
  command resolution — command resolution's only job is to recognise the token and report the entry
  unconditionally available.
- **The binding manifest is generated at build time, not hand-maintained.** The build starts the pinned
  runtime, reads its tool listing, and emits a module containing the tier membership and the never-grant
  names, then asserts `REQ-MCP-015`'s cardinality, disjointness and coverage checks. This is the
  difference between a manifest that is *checked* against the runtime and one that **is** the runtime's
  answer; `REQ-MCP-015`'s "an upstream rename fails a build rather than silently degrading a grant" is
  only true of the latter.
- The version cross-check of `REQ-MCP-095` is the same kind of build assertion over the shipped default
  entry and the setup manifest.

## Open question carried

`REQ-MCP-033` describes the sentinel branch **only** as an MCP server on standard streams, while
`REQ-MCP-036` derives a command line from the same entry and `REQ-MCP-099` runs it with the runtime's
three setup subcommands. **Recommended reading: the sentinel branch is a general pass-through, and
`REQ-MCP-033` describes what happens when the remaining arguments select the server.** Confirm, because
it changes what the packaged binary's early-argv branch must do. If it is answered the other way, one
of the two requirements must change. See OQ-23.

## Consequences accepted

1. The application entry point acquires a **pre-bootstrap branch that must never be reordered.** Guard
   it with a test that runs the packaged binary with the sentinel and asserts: valid JSON-RPC on
   standard output; **nothing else** on standard output; no window; and the runtime's own exit status.
2. The build depends on being able to execute the pinned runtime, so continuous integration must be able
   to install it. That is already implied by `REQ-MCP-015`'s coverage check.
3. The sentinel is an argv surface that `REQ-STARTUP-015` and `REQ-MCP-033` both intend to be internal.
   It must be undocumented and unadvertised, and it must be inert if discovered: the branch's worst
   outcome is a process speaking a protocol on its streams.

## Revisit if

`REQ-CONFIG-181`'s chosen runtime turns out to be hostable in the application's own language runtime
after all, making alternative B available and removing a process from the chain; or OQ-23 resolves
against the pass-through reading.
