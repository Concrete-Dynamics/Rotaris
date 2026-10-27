# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — Consequences accepted

Part 5 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

## Consequences accepted

1. The application entry point acquires a **pre-bootstrap branch that must never be reordered.** Guard
   it with a test that runs the packaged binary with the sentinel and asserts: valid JSON-RPC on
   standard output; **nothing else** on standard output; no window; and the runtime's own exit status.
2. The build depends on being able to execute the pinned runtime, so continuous integration must be able
   to install it. That is already implied by `REQ-MCP-015`'s coverage check.
3. The sentinel is an argv surface that `REQ-STARTUP-015` and `REQ-MCP-033` both intend to be internal.
   It must be undocumented and unadvertised, and it must be inert if discovered: the branch's worst
   outcome is a process speaking a protocol on its streams.
