# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Context — three interactions, three incompatible caching rules

Part 1 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Context — three interactions, three incompatible caching rules

**Discovery** is memoised per process on an identity of exactly nine values — name, type, command,
args, env, cwd, url, headers, workspace root — and a difference in any one re-interrogates; a
configuration reload invalidates every entry; and it is **per process and never shared**: never written
to disk, never cached across launches, never coordinated between instances, and two instances may
legitimately hold different tool lists (`REQ-MCP-047`). Failure never raises: an empty list, a warning
at most once per identity, and the failure remembered so later persona resolutions can warn
(`REQ-MCP-048`, `REQ-MCP-042`).

**Probing** is deliberately **never cached**: probing n times contacts the server n times, no probe
reports a carried-over outcome, it returns within 8 seconds, never raises, leaves discovery state
untouched, and still runs for a server whose discovery failed (`REQ-MCP-054`).

**Session calls** use exactly one shared connection per server for the whole session, opened on first
demand, reused by every agent, closed exactly once at session end — lock release or application exit.
Two concurrent first-demands yield one connection; while one server is starting, calls to
already-connected servers must complete **without waiting**; a request after shutdown fails naming the
server and leaves nothing open; releasing a superseded connection leaves the current one usable;
shutdown is idempotent (`REQ-MCP-066`, `REQ-MCP-067`). A child conversation ending leaves connections
and stdio processes alive for the next child (`REQ-MCP-068`).

`REQ-MCP-064`, `REQ-MCP-070` and `REQ-MCP-071`: post-connect hooks read the **unfiltered** tool list so
no grant configuration can disarm them, and the two shipped hooks have **different failure semantics
from one another**. `REQ-MCP-069`: a server that becomes unreachable after connecting is handled per
call and never by failing the run — the call in flight fails, one warning per server per session, **no
retry and no automatic reconnection**, and a later call may re-establish the connection and succeed.
