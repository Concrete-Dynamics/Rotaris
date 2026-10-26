# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — Alternatives considered

Part 2 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

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
