[Product directives](../directives.md) › PD-EVENTS-001

<a id="pd-events-001"></a>

### PD-EVENTS-001 — one local, opt-in inbound surface may drive the running application, and nothing about how a run is started or gated changes with it

**The case.** `REQ-EVENTS-178` states, as a deliberate exclusion rather than an omission, that this product offers no
embedding surface and no programmatic entry point — "there is no library, package, plugin host, or endpoint through which
code the user did not launch may start a run, drive a run, or subscribe to this application's runs" — and gives the
reason: such a surface "would be a second way to start work, carrying its own permission, approval, and sandbox behavior
to hold in step with the desktop one". The owner has ruled that the exclusion is opened **narrowly**
([R-094](../requests.md#r-094), 2026-11-04) — local only, opt-in, the existing gates, approvals and fences stay the
authority, nothing else withdrawn — and [ADR-0067](../../architecture/adr/0067-the-loopback-mcp-server-for-external-agents.md)
pins the surface down to nine points. **This directive is the amendment that ruling owes:** it authorizes the surface and
carries the dispositions below, and `REQ-MCP-119` to `REQ-MCP-130` in
[domain 16](../../spec/16-mcp-integration/07-inbound-surface.md) state it normatively.

**What is authorized.** One inbound surface, and it is this product's own process: MCP over streamable HTTP on the
loopback interface alone — `127.0.0.1` and, where the platform supplies it, `::1` — on an ephemeral port, off in every
build until the user switches it on for that session, revoked when the application quits, bounded by a per-exposure
bearer token and by an `Origin`/`Host` check against loopback, and offering exactly two tools, `rotaris_start_run` and
`rotaris_run_status`, with no proxied tool call. The run it starts is an ordinary run of the one lifecycle: the same
gate, approval chain, sandbox and workspace fence, no model of its own, and durable evidence like any other run's.
Approvals and questions are answered by a person at the desktop and never by the calling agent, and one externally
started run is active at a time — a second request is refused with a stated reason rather than queued. The listener is a
`utilityProcess` of the one shipped binary, and the surface reaches nothing beyond this machine.

**What is unchanged.** Everything the exclusion protects elsewhere: still no embedding library, no plugin host, no second
or headless executable, no account or multi-user dimension, no publication dimension, and no change to the MCP **client**
path. A way of starting a run added by this directive is inside `REQ-EVENTS-081`'s guarantee from the moment it exists,
and that requirement says so in its own words, which is why the note this directive owes it is the narrowest of the four.

> **Narrows:** REQ-EVENTS-081, REQ-EVENTS-178, REQ-STARTUP-002, REQ-STARTUP-160

*Raised by the owner, 2026-11-04; logged as [R-094](../requests.md#r-094). The surface's record is
[ADR-0067](../../architecture/adr/0067-the-loopback-mcp-server-for-external-agents.md), accepted the day this directive
was written, when its amendment round landed. `REQ-STARTUP-160` is narrowed a second time by
[`PD-STARTUP-006`](pd-startup-006.md#pd-startup-006), which names this directive in return: the two share no case — that
one fixes which moments a build names, this one adds the inbound surface to the disclosure's content — and both stand,
with a note of its own at the requirement.*
