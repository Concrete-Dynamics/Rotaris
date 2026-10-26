# Architecture proposals — MODEL slice — Summary of proposals

Part 8 of 8 of [the model proposal](../model.md), which indexes every part.

## Summary of proposals

| Id | Decision | Recommendation |
|---|---|---|
| ADR-MODEL-01 | Where the internal model boundary sits | Two ports: `ModelClient` and `AgentBackend` |
| ADR-MODEL-02 | Whether a third-party SDK sits behind `ModelClient` | Vercel AI SDK, for the streaming call only |
| ADR-MODEL-03 | How six unlike providers are structured | Frozen catalog + capability registries keyed by declared attribute |
| ADR-MODEL-04 | Credential storage and protection | Plain files, platform protection adapter, cross-process lock file |
| ADR-MODEL-05 | Where sign-in flows execute | Main process; renderer never holds a credential; token leased to run workers |
| ADR-MODEL-06 | Monetary representation | Exact-decimal type end to end; `number` never touches money |
| ADR-MODEL-07 | Discovery → snapshot → effective config | Pure pipeline over provenance-carrying model entries |
| ADR-MODEL-08 | MCP client library | Official SDK protocol layer; our own `stdio` transport |
| ADR-MODEL-09 | Connection lifecycle | Three distinct paths (discover / probe / session) over one launch primitive |
| ADR-MODEL-10 | Bundled code-intelligence runtime | Argv pass-through in the packaged binary; build-generated binding manifest |
| ADR-MODEL-11 | MCP configuration resolution | Pure pipeline with a source-tagged diagnostics sink |
| ADR-MODEL-12 | Process placement of the MCP layer | Registry lives with the session; settings probes independently |
| ADR-MODEL-13 | Secret hygiene interface | Predicates and transformations exposed separately (request to domain 05) |

**Spikes required before the architecture gate closes.**

1. Copilot responses-dialect requests through `createOpenAI({ baseURL, headers })` (ADR-MODEL-02).
2. A Windows ACL mechanism that can set an explicit DACL with inheritance disabled and read it back
   (ADR-MODEL-04).
3. MCP protocol version negotiation pinned to a mode that spawns no sibling probe process, against
   at least one modern and one legacy server (ADR-MODEL-08).
4. `windowsHide: true` verified on a packaged Electron build spawning a console application — that
   no console window appears at any point (ADR-MODEL-08, `REQ-MCP-113`).
5. The packaged binary's `builtin:code-intelligence` argv branch producing clean JSON-RPC on stdout
   with no window and the correct exit status (ADR-MODEL-10).

**Escalations.** None is proposed as a product change here, but **OQ-4** — whether a
`claude-code`-backed agent's tool calls pass through the product's permission engine and event
stream — is likely to become one, because either answer changes what the product is for a user.
