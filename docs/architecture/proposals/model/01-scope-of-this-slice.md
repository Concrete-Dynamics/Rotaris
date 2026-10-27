# Architecture proposals — MODEL slice — Scope of this slice

Part 1 of 8 of [the model proposal](../model.md), which indexes every part.

## Scope of this slice

This slice owns two things.

**The model layer (domain 04, `REQ-PROVIDER-001`…`REQ-PROVIDER-152`).** The built-in provider
catalog and its transparency metadata; the three sign-in methods and the flows behind them
(device code, browser authorization-code + PKCE, pasted key/token) including the loopback HTTP
listener those flows need; the per-user credential store, its on-disk format, its platform
protection, its atomicity and its cross-process locking; credential bridge artifacts written for
programs the application runs; model-catalog discovery per provider and the persisted
`project_settings.yaml` snapshot; automatic capability-slot assignment and the seven-slot routing
surface; run-start credential priming and keep-fresh; subscription-usage and hosted-cloud credit
reads; and the money and percentage arithmetic all of that displays.

**Tool servers (domain 16, `REQ-MCP-001`…`REQ-MCP-117`).** The server-entry schema and its three
merge sources; `mcp.json` auto-discovery; command resolution including the reserved bundled-runtime
token; availability and drop-not-fail semantics; tool discovery, caching and health probing; the
per-persona grant algebra; the session-scoped shared connection registry across `stdio`, `http` and
`sse`; post-connect probes; the secrets store and environment resolution; the prompt rendering of
the MCP surface; and the machine-setup and project-setup child processes.

**What this slice does not own but depends on.** The redaction and display-mask algorithms
(`REQ-TOOLS-171`, `REQ-TOOLS-172` — domain 05); the provider status vocabulary (`REQ-NOTIFY-200` —
domain 19); the layered configuration surface, its scopes and its settings categories
(`REQ-CONFIG-001`, `REQ-CONFIG-269`, `REQ-CONFIG-465` — domain 15); the run loop, retry-on-fallback
and quota-wait behavior (`REQ-ORCH-088`, `REQ-ORCH-090`, `REQ-NOTIFY-070`, `REQ-NOTIFY-083`); the
event catalog (`REQ-EVENTS-041`); and image attachment gating (`REQ-CHAT-171`, `REQ-CHAT-174`).

**Candidate stack items this slice must rule on.** The internal `LLM` abstraction (settled by
product decision that it exists; its shape is open); whether the Vercel AI SDK Core sits behind it;
whether the official MCP TypeScript SDK is used and how much of it.

Requirement identifiers below are cited as they appear in `docs/spec/`. Where a claim rests on
external library behavior, the library and the documentation source consulted are named.

---
