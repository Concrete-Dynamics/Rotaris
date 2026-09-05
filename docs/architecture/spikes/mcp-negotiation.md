# MCP negotiation spike — protocol version negotiation over `OwnedStdioTransport`

- **Date:** 2026-09-05
- **Host:** Windows 11 Pro 10.0.26200, x64; Node 24.11.0
- **Command:** `pnpm -s exec vitest run packages/mcp/src/negotiation.test.ts` (the spike is the test; it stays
  as the regression). `MCP_SPIKE_OUT=<file>` writes the twelve-cell table.
- **Requirements:** REQ-MCP-046, REQ-MCP-048, REQ-MCP-067, REQ-MCP-113
- **Decision records:** ADR-0033 consequence 2, ESC-12; spike-list item 3 in `open-questions.md`
- **Dependency measured:** `@modelcontextprotocol/client` 2.0.0 (MIT; `@modelcontextprotocol/core` 2.0.0
  below it). Its legacy `initialize` offer list `SUPPORTED_PROTOCOL_VERSIONS` is `2025-11-25, 2025-06-18,
  2025-03-26, 2024-11-05, 2024-10-07`; its one modern revision is `2026-07-28`, reached by `server/discover`.

## What was asked

ADR-0033 chose the 2.x line because "pinning negotiation to an explicit mode is what keeps the process count
at literally one" — and noted that the sibling-probe policy is documented for the SDK's **own** stdio
transport, which the ADR replaces. Establish what negotiation does over our transport before assuming a pin
is needed; confirm that the chosen mode reaches both a modern and a legacy server; say whether ESC-12's
balance changes.

## What ran

Four hand-written fixture servers (`apps/desktop/scripts/fixtures/mcp-fixture-server.mjs`, newline-delimited
JSON-RPC over stdio, no SDK) × three client modes, one connection each, `tools/list` after connect, the
fixture appending its pid to a file per launch so the number of **launches** per connection is counted:

| Fixture era | Behaviour |
|---|---|
| `2025` | answers `initialize`; `-32601` to `server/discover` and every unknown method |
| `2025-strict` | a 2025 server that **exits** on any request before `initialize` — the shape the SDK's disposable sibling exists for |
| `2026` | answers `server/discover` with `supportedVersions: ['2026-07-28']`, and still answers a legacy `initialize` |
| `2026-only` | answers `server/discover`; rejects `initialize` with `-32601` |

Modes: `'legacy'` (no probe), `'auto'` (probe with `server/discover`, fall back to `initialize`), `{ pin:
'2026-07-28' }`. The transport is `packages/mcp/src/transport.ts` — three piped streams, `windowsHide`, the
SDK's `ReadBuffer`/`serializeMessage` for framing.

## Result

| Era | Mode | Connected | Negotiated | Tools | Launches | Wall time |
|---|---|---|---|---|---:|---:|
| 2025 | legacy | yes | 2025-11-25 | 5 | 1 | 134 ms |
| 2025 | auto | yes | 2025-11-25 | 5 | 1 | 119 ms |
| 2025 | pin 2026 | **no** — "the server did not offer pinned protocol version 2026-07-28" | — | 0 | 1 | 112 ms |
| 2025-strict | legacy | yes | 2025-11-25 | 5 | 1 | 112 ms |
| 2025-strict | auto | yes (after the fallback below) | 2025-11-25 | 5 | **2, sequential** | 220 ms |
| 2025-strict | pin 2026 | **no** — the connection closed during the probe | — | 0 | 1 | 110 ms |
| 2026 | legacy | yes | 2025-11-25 | 5 | 1 | 114 ms |
| 2026 | auto | yes | **2026-07-28** | 5 | 1 | 140 ms |
| 2026 | pin 2026 | yes | 2026-07-28 | 5 | 1 | 114 ms |
| 2026-only | legacy | **no** — "Method not found" | — | 0 | 1 | 113 ms |
| 2026-only | auto | yes | 2026-07-28 | 5 | 1 | 114 ms |
| 2026-only | pin 2026 | yes | 2026-07-28 | 5 | 1 | 109 ms |

**Answers.**

1. **No sibling probe is spawned over our transport under any mode.** The SDK spawns its disposable sibling
   only for its own `StdioClientTransport` — `readStdioServerParams` looks for a `_dispose` member on the
   transport's prototype and a `_serverParams.command`; a transport without them "probes in place" on the one
   connection. Eleven of the twelve cells show exactly one launch. The process count of REQ-MCP-067 is
   therefore held by the transport's shape, not by a pin.
2. **`'auto'` reaches every era**: the 2025 server's `-32601` falls back to the plain `initialize`; the
   2026 and 2026-only servers take the modern era. It is the only mode that connects all four fixtures.
3. **A 2026 pin breaks every 2025-era server** (ESC-12 option (c)'s cost, now measured, two cells).
4. **`'legacy'` cannot reach a server that speaks only the new negotiation** (one cell) — ESC-12 option
   (b)'s cost, measured.
5. **The one case the sibling design exists for is real:** a strict 2025 server exits on the in-place
   `server/discover` probe, and `'auto'` alone fails it ("the connection closed during the server/discover
   probe (this transport probed in place…)"). `openClient` (`packages/mcp/src/client.ts`) therefore retries
   **once**, under `'legacy'`, on a fresh transport, **sequentially** — the first child is gone before the
   second is spawned, so at no moment do two processes coexist and REQ-MCP-067's "exactly one process once
   both requests have been served" holds; the cost is a second launch for that class of server only (the
   fifth row: two launches, 220 ms).
6. The SDK classifies a transport that exposes `stderr` and `pid` as stdio-shaped, which makes a probe
   **timeout** read as "legacy server" (fallback) rather than "outage" (reject). `OwnedStdioTransport`
   exposes both so a silent legacy server falls back rather than failing.

## Two fixture corrections the SDK forced (kept because they say what a 2026 server owes)

The 2026 era's `tools/list` result must carry `resultType: 'complete'` and a cache hint (`ttlMs`,
`cacheScope`) — the SDK refuses the list otherwise ("servers implementing protocol revision 2026-07-28 MUST
include it"). The first two runs of the spike failed on exactly those two omissions; the fixture now sends
them for the 2026 eras and not for the 2025 ones.

## Decision taken

**ESC-12: option (a) stands — the 2.x line with the pre-2026 offered list retained — and its balance has
changed in one respect: no pin is needed for REQ-MCP-067.** The mode shipped is `'auto'` with the sequential
legacy fallback of answer 5; `'legacy'` remains reachable for a caller that wants the plain 2025 sequence.
ADR-0033's decision text "version negotiation is pinned to an explicit mode … so no sibling probe process is
spawned" is falsified as a *reason* (the transport's shape is what prevents the sibling) and kept in the ADR
beside its replacement. Recorded in the ADR-0033 first-execution note and in `open-questions.md` under
ESC-12.

## Not measured

A real third-party server (only the fixture); the two remote transports (the SDK's own, not replaced — a
loopback HTTP server was not stood up in this spike); negotiation under a probe **timeout** (a server that
neither answers nor exits on `server/discover`) — covered by the SDK's stdio-shaped verdict (answer 6) but
not exercised here.
