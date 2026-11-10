# ADR-0067 — The product opens one loopback MCP surface, off by default, that starts and watches runs and nothing else

- **Status:** accepted, 2026-11-10 — the amendment round has landed and building under this record may begin.
- **Date:** 2026-11-04
- **Origin:** [R-094](../../product/requests.md#r-094), the owner's ruling of 2026-11-04 that the deliberate exclusion of REQ-EVENTS-178 is opened for one narrow local surface.
- **Depends on:** ADR-0002 (process topology), ADR-0017 (the permission policy), ADR-0019 (approvals and the presenter capability), ADR-0029 and ADR-0030 (the credential store, sign-in flows and the loopback precedent), ADR-0033 and ADR-0034 (the MCP client), ADR-0044 (the IPC contract).
- **Requirements:** `REQ-MCP-119` to `REQ-MCP-130` (the inbound surface this record decides, minted by its amendment round, 2026-11-10); `REQ-EVENTS-178` (the exclusion this record narrows); `REQ-EVENTS-081` (whose guarantee the surface's runs fall under); `REQ-STARTUP-002`, `REQ-STARTUP-015`, `REQ-STARTUP-160`, `REQ-STARTUP-161`, `REQ-STARTUP-164` (one entry point, the reserved token, the disclosure, one instance); `REQ-MCP-033`, `REQ-MCP-113` (the internal server child, the standard streams); `REQ-EVENTS-098`, `REQ-SESSION-056`, `REQ-SESSION-080`, `REQ-SESSION-083` (one writer, the lock, one run lifecycle); `REQ-TOOLS-087`, `REQ-SANDBOX-018` (the meaning of loopback); `REQ-SHELL-150` (the 100 ms budget); `REQ-EVENTS-166`; `REQ-CONFIG-126` and `REQ-TOOLS-177` (the approval wait, and how a teardown releases it); `REQ-TRACE-464` with `PD-ORCH-005`.

## Context

Today the product is only an MCP **client**: `packages/mcp/src/` connects to servers the user configured, and
`@modelcontextprotocol/client` is the only MCP dependency. There is no server code and no `@modelcontextprotocol/server`
dependency. The one place the application hosts an MCP server is internal: it launches its own executable as a stdio
child under a reserved token to host the bundled code-intelligence tool server (`REQ-MCP-033`, `REQ-STARTUP-015`,
ADR-0035). That runs parent to child inside one instance and faces nobody.

The specification excludes the opposite on purpose. `REQ-EVENTS-178` says the product offers no embedding surface and no
programmatic entry point, and calls this a deliberate exclusion rather than an omission, because a driving surface would
be a second way to start work carrying its own permission, approval and sandbox behaviour to be kept in step with the
desktop one. `REQ-STARTUP-002` allows one executable entry point and no second surface, and ADR-0002 states four process
kinds and no others.

The owner has ruled (R-094) that the exclusion is opened, **narrowly**, so that external agents can drive the running
application: it is itself an executing application that writes code for other agents, and those agents should be able to
reach it. Scope as confirmed: local only, opt-in, the existing gates, approvals and fences stay the authority, and
nothing else is withdrawn. This is a directive-class change. This record is its record step: it pins the surface down
so that the amendment round has something exact to amend. It edits no requirement.

The repository already has loopback precedents, and they differ from this surface in the way that matters. The provider
sign-in listener (`REQ-PROVIDER-029` to `REQ-PROVIDER-031`, `REQ-PROVIDER-039`, ADR-0030) binds `127.0.0.1` but accepts
one short-lived OAuth callback. The instance hand-over (`packages/platform/src/instance.ts`) is a named pipe or Unix
socket. The verification driver listens on `127.0.0.1` with a launch secret and is compiled out of the packaged build.
None of them is a long-lived HTTP tool surface a browser could be coaxed into calling.

## Decision

**1. One new inbound surface, and it is loopback only.** The product serves MCP over **streamable HTTP** on `127.0.0.1`
and, where the platform supplies it, `::1`, on an **ephemeral port** the operating system chooses. Never a fixed port,
never `0.0.0.0`, never a LAN address. "Loopback" is the product's existing notion (`REQ-TOOLS-087`, `REQ-SANDBOX-018`),
reused for the binding and not defined again. There is no stdio transport: the client owns a child's standard streams,
a foreign agent spawning the application would collide with `REQ-STARTUP-161`, and it would not be exposing the
*running* instance. There is no server-sent-events transport either. The listener belongs to the running instance and
starts no second one.

**2. Off by default, switched on by the user, per session.** Nothing in the product turns the surface on by itself.
The user switches it on, and the port and the token are shown, in the register of the per-server enable toggle of the
MCP settings category. The switch is not persisted across launches, and quitting the application revokes it. This
record invents no configuration key.

**3. A per-exposure bearer token is the boundary, and the HTTP surface is defended besides.** The token is generated
when the exposure is switched on, shown once, never written to the log or to a session record, and required on every
request. Same-UID reasoning is rejected as a boundary: any process of the same user can see a loopback port, so the
token is what separates a caller from a bystander. `Origin` and `Host` are checked against loopback and a mismatch is
refused, which closes DNS rebinding from the user's own browser — the hazard a long-lived localhost HTTP tool surface
carries and the sign-in listener, which takes one callback, does not.

**4. The surface is coarse and run-oriented, and never proxies a tool call.** Exactly two MCP tools in this first slice:

| Tool | What it does |
| --- | --- |
| `rotaris_start_run` | starts a run in an **already open** workspace and returns the run's handle (`REQ-SESSION-080`) |
| `rotaris_run_status` | reads that run's state and stop reason, in the product's own status vocabulary |

An external agent drives **the run**, never the tools; the run does its own work through the ordinary gate.

**5. The gates stay the authority, and the parity `REQ-EVENTS-178` demands is a stated property.** A run an external
caller starts is an ordinary run of the one lifecycle: the permission gate of ADR-0017, the approval chain of ADR-0019,
the same sandbox and the same workspace fence. It has **no permission, approval or sandbox model of its own**.
**Approvals and questions are answered by a person, on the desktop, and never by the calling agent.** A caller may
observe that a run is waiting for an approval; it may not answer one. Approvals are not forwarded.

**6. One active external run, refused rather than queued.** A second external request while one is active is refused
with a stated reason. A caller cannot spend the user's model budget without bound. A per-run ceiling on the external
path is stated here in principle; its numbers are the owner's.

**7. The relay is thin, and the run host's authority is unchanged.** The MCP surface is not placed in the run host. The
run host keeps every session lock and the sole right to write a session's history (`REQ-EVENTS-098`, ADR-0002) and gains
no inbound network face. **Decided 2026-11-10, when the amendment round landed: the listener lives in a `utilityProcess` of its own**, not in main.
Main keeps its case as the instance's front door on the 100 ms interface budget (`REQ-SHELL-150`): a relay there would give
it a second endpoint role and put unbounded inbound work on the hot path, for a surface that is not a window operation and
needs nothing the window registry holds. The listener placed there costs the run host's authority nothing, because the
ordering constraint holds either way: the listener speaks to the run host in the run host's existing terms, and main never
gains the right to write a session's store. Whichever way it went, the listener is one more process of the one shipped
binary — the amendment to ADR-0002's "four process kinds, and no others" this point announced — and `REQ-MCP-127` states it.

**8. Every external invocation is as auditable as a click.** What the caller asked for is recorded where the product
records its own acts — the run record, the session's history and the timeline. This record mints no store and no event
type.

**9. What the surface is not, deliberately.** These are exclusions, not omissions, kept beside the surface they bound:

- no network reachability: no port-forwarding, tunnel or funnel;
- no second or headless executable (`REQ-STARTUP-002`);
- no multi-user or account dimension;
- no embedding library or plugin host;
- no publication or release dimension;
- no change to the MCP **client** path, which stays exactly as it is;
- nothing on the surface reads a file, runs a command, touches git, reaches the network, mints or returns a credential,
  reads a secret, or manages MCP servers.

## Alternatives considered and rejected

**stdio.** Rejected: a foreign agent spawning the application would start a second instance, which `REQ-STARTUP-161`
hands over to the first, and it would not reach the running one.

**Server-sent events.** Rejected: it is the older transport form and adds nothing streamable HTTP does not already give.

**A fixed port.** Rejected: a known port is a known target for any local process or web page, and a collision would fail
the switch. The operating system's choice, shown to the user, costs nothing.

**Trusting same-UID loopback alone, without a token.** Rejected: every process of the user can connect, and a browser
can be made to. The token is the boundary.

**A full tool proxy.** Rejected on the ground `REQ-EVENTS-178` itself states: it would be a second way to start work,
with permission, approval and sandbox behaviour to hold in step. Two run-level tools leave the gate where it is.

**Forwarding approvals to the caller.** Rejected: it lets the party being constrained answer the constraint. A person
answers, on the desktop (ADR-0019).

## Consequences

The exclusion of `REQ-EVENTS-178` is narrowed to what this record names and stays everywhere else. The attack surface
grows by one listener, off until a user switches it on, bounded by a token, a loopback check and two coarse tools. The
parity property is cheap to hold because the surface starts runs rather than performing tool calls: every consequence
of a run is the ordinary gate's.

A caller cannot unblock itself. A run started externally that reaches an approval waits for a person, as any run does, and
the wait is the ordinary one: `REQ-CONFIG-126`'s `approval_timeout_seconds`, whose `0` means wait without a limit and whose
wait runs out as a denial, and `REQ-TOOLS-177`'s teardown, which cancels waiting approvals when the approval host is
discarded. A caller may not expect a run to
outlive the application: closing it ends the run by `quit` and a later continue resumes it (`REQ-TRACE-464`, as
narrowed by `PD-ORCH-005`). That is a property of the surface, not a defect.

The listener must not endanger the 100 ms interface budget (`REQ-SHELL-150`). The client path is untouched. An incoming
listener is a new kind of thing for the network disclosure of `REQ-STARTUP-160`, and **it belongs there: decided
2026-11-10**, when the round landed — a build that carries the surface names it in the disclosure, and the requirement's
closed content clause is narrowed for it by [`PD-EVENTS-001`](../../product/directives/pd-events-001.md#pd-events-001).

## What this record does not decide, and what is owed

**The round has landed, 2026-11-10.** This section used to read "the amendment round ... is **owed and has not been
run**. Until it runs, the exclusion stands as written and **nothing may be built under this record**." It has now run,
and the prohibition is lifted with it: the surface the Decision above fixes may be built, and nothing beyond it may.
Every displacement the round made is `PD-EVENTS-001`'s, and each requirement that directive narrows carries the note at
its own definition. The round reached:

- **domain 20** — `REQ-EVENTS-178`, the exclusion itself, narrowed in its own words to the one surface this record names
  and untouched everywhere else; `REQ-EVENTS-081` needed no note, because it spans every run through the shared lifecycle
  and says in its own words that its enumeration of the ways one can be started is not closed;
- **domain 16** — the inbound server has identifiers of its own, `REQ-MCP-119` to `REQ-MCP-130`, in a new part
  ([`07-inbound-surface.md`](../../spec/16-mcp-integration/07-inbound-surface.md)); the existing outbound requirements were
  not re-read to mean an inbound surface;
- **domain 11** — `REQ-STARTUP-002` keeps its force on executables and admits this one non-executable entry point, and the
  incoming listener **joins** the disclosure of `REQ-STARTUP-160`.

Decisions the owner has not yet taken:

- the approval model, should it ever change from desktop-only;
- the quota numbers of point 6, marked *reserved* where `REQ-MCP-126` states the ceiling in principle;
- how an external caller is told that a run ended by `quit` (`REQ-TRACE-464`).

The process location is no longer one of them: point 7 decides it, and with it the amendment to ADR-0002.

No code is written under this record and no dependency is added **by it**: `@modelcontextprotocol/server` is still not a
dependency of this product, and the change that builds the surface is the one that adds it.

## Revisit if

- the owner decides the process location *(decided 2026-11-10: a `utilityProcess` of its own, `REQ-MCP-127`)*;
- the owner withdraws or narrows the decision;
- the amendment round lands and changes what the surface may do;
- a measurement of the listener contradicts a constraint above, the 100 ms budget or the loopback binding among them.
