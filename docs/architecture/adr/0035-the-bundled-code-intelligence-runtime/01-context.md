# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — Context

Part 1 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

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
