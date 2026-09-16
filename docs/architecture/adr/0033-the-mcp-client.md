# ADR-0033 — The MCP client: the official SDK's protocol layer, our own stdio transport

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-08)
- **Depends on:** ADR-0001, ADR-0002, ADR-0026
- **Requires two spikes before the gate closes.**
- **Contains an escalation.**

## Context

Three transports are required — `stdio`, streamable HTTP, and server-sent events — under one vocabulary
(`REQ-MCP-001`, `REQ-MCP-043`).

`REQ-MCP-066` and `REQ-MCP-067`: **exactly one shared connection per server per session and, for
`stdio`, exactly one server process**, stated as an observable a test can count.

`REQ-MCP-113` is unusually explicit and is stated as a host condition to be tested negatively: the
application is a graphical process owning no console whose own standard streams may be absent, closed
or not usable pipes. **The product creates the child's three standard streams itself for every launch,
never inherits or reuses the parent's, never requires a console to exist, and never allocates or shows
one — no console window at any point.** The same rule applies on every platform and to the reserved
token's child, which is the application's own executable.

Timeouts are layered and explicit: per-call 300 s by default and 600 s for one shipped entry
(`REQ-MCP-003`, `REQ-CONFIG-181`); discovery 30 s with a hard 35 s outer bound that must hold **for
every caller and every surface** and must not delay process exit past it (`REQ-MCP-046`,
`REQ-MCP-053`); probes 8 s (`REQ-MCP-054`); post-connect hooks 15 s (`REQ-MCP-070`, `REQ-MCP-071`).
`REQ-MCP-003` measures the per-call allowance "from the dispatch of the call to the receipt of its
result".

`REQ-MCP-068`: concurrent calls over one connection must **all** complete, each receiving its own
response, and **the session keeps emitting its events while a call is outstanding** — `tool.start` is
observable before the call returns and every other catalogue event is emitted at its normal point,
however many calls are outstanding. This forbids serialising a connection behind a mutex and forbids
blocking the event pump on a tool call.

`REQ-MCP-060` and `REQ-MCP-062`: a mid-connection tool-list change must be observed and may only ever
**narrow** the callable set. `REQ-MCP-048` and `REQ-MCP-051`: discovery must return an empty list rather
than raising on any connection, protocol or timeout error, and a teardown error *after* the list
arrived is ignored and logged at debug while one *before* is a failure. `REQ-MCP-052` drops entries with
an empty or non-string name.

**What was checked.** Context7, the official MCP TypeScript SDK's own documentation, and the npm
registry, 2026-08-31. The SDK is MIT and ships as **two lines**: `@modelcontextprotocol/sdk` 1.30.0,
and a 2.0.0 released 2026-07-27 that splits into `@modelcontextprotocol/client`,
`@modelcontextprotocol/server` and `@modelcontextprotocol/node`. On both lines the client accepts any
object implementing the transport interface — `start`, `send`, `close`, and `onmessage`, `onerror`,
`onclose` — and the package exports `ReadBuffer`, `serializeMessage` and `deserializeMessage` for
newline-delimited framing, with a documented custom-transport guide. Request options are exactly
`onprogress`, `signal`, `timeout`, `resetTimeoutOnProgress`, `maxTotalTimeout` and
`allowInputRequired`, with a 60 s default request timeout. The stdio server parameters are exactly
`command`, `args`, `env`, `stderr`, `cwd` and a buffer size — **there is no passthrough for spawn
options**, so hiding a console window and controlling stream ownership are not reachable through them.

**The two lines differ in the one place this record cares about.** 1.30.0's latest protocol version is
`2025-11-25` and its client options carry **no negotiation control at all**. The 2.x line adds the
2026-07-28 era and with it a documented `versionNegotiation` client option — a mode plus a probe timeout
and retry count — together with a `supportedProtocolVersions` list that shapes which eras are offered.
Under `mode: 'auto'` the SDK's **own** stdio transport "executes the probe on a short-lived sibling
process spawned with identical parameters", reaped once the era is determined; the same documentation
advises that spawn-per-invocation stdio clients should not default to `'auto'` for exactly that reason.
Note that the sibling-probe policy is stated for the SDK's standard stdio transport, which this record
replaces — what a *custom* transport does under negotiation is not documented and is part of spike 3.

## Alternatives considered

**A — The official SDK wholesale, including its stdio transport.**

*For:* least code; protocol version negotiation, capability handling, notification dispatch and schema
validation are maintained upstream; new protocol revisions arrive as a dependency bump.
*Against:* two of its behaviours collide with stated observables. The **sibling-process probe** means a
single logical connection can transiently spawn **two** processes, which sits badly with
`REQ-MCP-067`'s countable one-process guarantee and doubles the launch cost of the bundled runtime. And
because the stdio parameters expose no spawn options, `REQ-MCP-113`'s guarantees — that *we* create the
three streams and that no console window appears at any point — are not things we can assert; they
become properties of a dependency's internals. `REQ-MCP-113` is written to be tested negatively, and a
design that cannot state where the spawn happens cannot pass that test honestly.

**B — A hand-written JSON-RPC client over our own transports.**

*For:* total control; every timing and process obligation is ours to state; no surprise from an
upstream negotiation policy.
*Against:* MCP is a moving protocol with version negotiation, capability declaration, notification
semantics and an evolving schema. Re-implementing that is real work whose failure mode is
**incompatibility with servers we do not control** — the exact thing consumed-contract discipline
cannot save us from, because here we are the *client* of a protocol, not a consumer of a payload. It
also loses the SDK's schema validation, which is doing quiet work behind `REQ-MCP-052`.

**C — The SDK's client and protocol layer, with our own transport for `stdio` and the SDK's for the two
remote transports.** Chosen.

## Decision

**Alternative C, on the official SDK's 2.x line — `@modelcontextprotocol/client` (MIT).** The
version-line criterion is `REQ-MCP-067`: pinning negotiation to an explicit mode is what keeps the
process count at literally one, `versionNegotiation` is the control that does the pinning, and that
control exists only on 2.x. The 1.x line would satisfy `REQ-MCP-067` by having no negotiation to pin,
at the cost of not speaking the current protocol era at all — see the escalation.

The split falls exactly along the line the requirements draw: **protocol behaviour** — handshake,
negotiation, request correlation, notification dispatch, schema validation — is the SDK's and is not
something the specification constrains; **process behaviour** — who spawns, with which stdio
configuration, with which environment, with a hidden window, and how it is killed — is precisely what
`REQ-MCP-113`, `REQ-MCP-067` and `REQ-MCP-099` constrain, and it becomes ours.

- **`OwnedStdioTransport`** spawns with all three streams piped and the console window suppressed,
  never inheriting the parent's descriptors, capturing the child's error stream to the log **after
  redaction** (ADR-0007), framing with the SDK's exported read buffer and serialiser, and owning
  termination — terminate, 5-second grace, force-kill, whole process tree on Windows. **That
  termination primitive is shared** with the setup child processes of `REQ-MCP-099` and with the
  external-runtime backend of ADR-0026.
- **The SDK's own transports for HTTP and server-sent events**, since `REQ-MCP-037` explicitly does not
  probe remote reachability at configuration time and there is no process obligation to own.
- **Timeouts are passed explicitly at every call site**, never left to the SDK's default: 300 s or the
  entry's `request_timeout` for tool calls, 30 s for discovery with a maximum-total-timeout giving the
  35 s outer bound, 8 s for probes, 15 s for post-connect hooks. **Reset-on-progress is not enabled for
  tool calls**, because `REQ-MCP-003` measures the allowance from dispatch to result and progress
  notifications must not extend it.
- **Version negotiation is pinned to an explicit mode** rather than left on `'auto'`, so no sibling
  probe process is spawned and `REQ-MCP-067`'s process count stays literally one. **The offered-versions
  list retains its pre-2026 entries**, because dropping them makes a connection to a server that speaks
  only an older era fail outright, and `REQ-MCP-048` requires discovery to degrade to an empty list
  rather than to raise — a distinction a user reads as "my server stopped working".

## Escalation — which protocol era floor the product ships with

The SDK line is not only a dependency choice; it decides **which of a user's existing tool servers
connect**. The 2.x line is one month old at the time of writing and is the only line that speaks the
2026-07-28 era or exposes the negotiation control this decision needs; the 1.x line is the longer-lived
one and tops out at the `2025-11-25` era with no negotiation surface. The options are: **(a)** the 2.x
line with pre-2026 entries retained — the widest server compatibility, at the cost of depending on a
young major for the product's entire tool story; **(b)** the 1.x line — a settled dependency, but
servers that speak only the current era are unreachable and, under `REQ-MCP-048`, present to the user as
servers offering no tools; **(c)** the 2.x line with pre-2026 entries dropped, which is simpler and
breaks every 2025-era server the user already has. **The record recommends (a)** and flags it because
the choice is not reversible cheaply once configurations exist, and because what a user observes — which
servers work — differs under all three.

## Consequences accepted

1. We own a transport. It is roughly one file plus a process-supervision helper shared with two other
   call sites, and it is where three hard requirements are satisfied, so it earns its keep.
2. Pinning negotiation may need revisiting as the protocol moves; that is a dependency-bump-shaped
   cost, not a redesign. **Spike required:** confirm that pinning does not break servers that only
   speak the newer negotiation, against at least one modern and one legacy server — and, since the
   sibling-probe policy is documented for the SDK's own stdio transport rather than for ours, establish
   what negotiation does over `OwnedStdioTransport` before assuming the pin is even needed there.
3. **Spike required:** console-window suppression must be **verified, not assumed**. The runtime's
   documented default does not hide a window, and a graphical-subsystem process spawning a console
   application is exactly the case where one appears. `REQ-MCP-113` makes "no console window at any
   point" observable, so this needs an actual on-Windows check against a packaged build, not a code
   reading.
4. Nothing serialises concurrent calls on one client, and the event pump never awaits a tool call.
   `REQ-MCP-068` makes that observable through `tool.start` appearing before the call returns, so it
   belongs in the conformance suite rather than in a comment.

## Revisit if

The negotiation spike shows pinning is unworkable; or the SDK gains spawn-option passthrough on its
stdio transport covering window suppression and stream ownership, which would make alternative A viable
and reduce our surface; or the offered-versions list acquires a pre-2026 floor upstream, which would
turn the escalation's option (c) into the only one available and make it a compatibility announcement
rather than a choice.

## First execution — 2026-09-05, Part S (the two spikes, the transport, the client factory)

*Recorded under GD-10. The dependency pinned exactly: `@modelcontextprotocol/client` **2.0.0** (MIT), with
`@modelcontextprotocol/core` 2.0.0 below it; declared in `packages/mcp/package.json` and, so that electron-vite
externalises it and the installer carries it (ADR-0056's rule), in `apps/desktop/package.json`.*

**Spike 3 — negotiation over our transport (`spikes/mcp-negotiation.md`; the test
`packages/mcp/src/negotiation.test.ts` stays as the regression).** Four fixture eras × three modes, one launch counted
per connection. **No sibling probe is spawned over `OwnedStdioTransport` under any mode**: the SDK spawns its
disposable sibling only for its own `StdioClientTransport` (it looks for `_serverParams` behind a `_dispose`
prototype member); every other transport "probes in place". `'auto'` reaches all four eras; a 2026 pin refuses
every 2025-era server; `'legacy'` cannot reach a 2026-only server; a strict 2025 server that exits on the
pre-`initialize` probe fails `'auto'` and is reached by one **sequential** retry under `'legacy'` (two launches,
never two processes at once). **The decision's stated reason is falsified and kept:** the text above says
negotiation "is pinned to an explicit mode … so no sibling probe process is spawned" — the process count of
`REQ-MCP-067` is held by the transport's shape, not by a pin; the mode shipped is `'auto'` with the fallback
(`packages/mcp/src/client.ts`, `DEFAULT_NEGOTIATION`). ESC-12: option (a) taken, the balance changed as recorded
under the escalation. The offered list retains its pre-2026 entries (`SUPPORTED_PROTOCOL_VERSIONS`).

**Spike 4 — console-window suppression on the packaged build (`spikes/mcp-console-suppression.md`;
`apps/desktop/scripts/mcp-console-spike.mjs`).** **PASS.** The packaged `Rotaris.exe` (electron-builder's `--dir` output, rules 1a and 4 green) ran a scripted session whose persona carried `console` — `cmd.exe /c node <fixture>`, a console application through a console application — and `token` (the reserved `builtin:code-intelligence`). Sampled with PowerShell during the run, every process started after the launch (`cmd`, `node`, and the headless `conhost` that every `CREATE_NO_WINDOW` child gets) had `MainWindowHandle` 0 and a `tasklist` window title of `N/A` at every sample; the `echo` call succeeded in the store; the fixture was launched twice (discovery, session), both invisible. The reserved token's child fails **at spawn** — `spawn builtin:code-intelligence ENOENT` in 108 ms, `REQ-MCP-107` case 1 — not with a window, and discovery degrades to the empty list; that stands until ADR-0035. Beside the spike: `pnpm package` was refused twice by electron-builder's `pnpm ls` hitting `EMFILE` on this tree (reproducible in the main checkout too); the passing build ran with a descriptor-gating shim on `NODE_OPTIONS` — a toolchain finding for the map's pitfalls, not this part's to fix.

**Built.** `OwnedStdioTransport` (`packages/mcp/src/transport.ts`): three piped streams, `windowsHide` through
`platform`'s one spawn helper, the child's stderr to the log after `redact()` (a `ghp_` token in the fixture's
stderr reached the log as `***` — the test), the SDK's `ReadBuffer`/`serializeMessage` for framing, `terminateTree`
(terminate → 5 s grace on the Timers port → force-kill, `taskkill /T /F` on Windows) exported for ADR-0026's backend
and `REQ-MCP-099`. The client factory (`client.ts`): our transport for `stdio`, the SDK's for `http` (streamable
HTTP) and `sse`; every timeout passed explicitly (`connectTimeoutMs`; discovery 30 s + the 35 s outer watchdog;
probes 8 s; hooks 15 s; calls 300 s or `request_timeout`, `resetTimeoutOnProgress: false` and `maxTotalTimeout`
equal to the allowance — `REQ-MCP-003`'s dispatch-to-result measure). Consequence 4 held in the proof:
`tool.start` was recorded before the fixture answered a deliberately slow call and the three interleaved calls of
the unit test each received their own answer.

**Found in existing code — the tally's twenty-ninth (recorded in the ADR-0034 note as well; Part R's two, found the same day, are the twenty-seventh and twenty-eighth).** The transport's
first launch of a package-runner entry on Windows failed with `spawn npx ENOENT`: `npx`/`uvx` are `.cmd` scripts
that `spawn` cannot start by bare name, and Node refuses to start a `.cmd`/`.bat` without a shell since its
CVE-2024-27980 hardening. The reason this decision rested on — one spawn helper with `windowsHide` serves every
launch — is kept in `packages/platform/src/spawn.ts` beside `windowsLaunchOf`: a command whose PATH resolution
ends in `.cmd`/`.bat` is launched through `cmd.exe /d /s /c "<quoted line>"` with the arguments verbatim, the way
ADR-0015's hook children already reach the interpreter; `findExecutable` is the one PATH lookup (`REQ-MCP-037`).
A test spawns a batch runner through the transport.

**Not tested:** a real third-party server (the hand-written fixture only, in both eras); the two remote transports
against a live endpoint; a probe **timeout** on `server/discover` (the SDK's stdio-shaped verdict falls back;
not exercised).

**At the merge (the manager, 2026-09-05).** The MCP category's PNG from the merged tree still read `spawn npx ENOENT` on
the shipped `browser` row — the failure the twenty-ninth's fix wrapped. Node's own directory holds an **extensionless**
`npx` (a POSIX shell script) beside `npx.cmd`, and `findExecutable` returned the extensionless file first, so the wrap
never saw `.cmd` and `spawn` was handed a file Windows cannot start. Windows executes a name only under a PATHEXT
extension; on win32 a base without one is now tried with the extensions only (`packages/platform/src/spawn.ts`, the
falsified candidate list kept beside it; a test with the twin files). The row still read `ENOENT` on the next build: the
child was spawned with the description's map alone and never the parent environment, so the lookup had no PATH at all —
recorded under the ADR-0034 note's OQ-22 paragraph, which had claimed the overlay. Both a defect in the fix, not a new
entry in the tally. With both corrected the `browser` row probes the real `npx.cmd` and reports what the runtime answers
within the 8 s budget — the server's own outcome, not a host failure (`REQ-MCP-113`).

**The token's launch path — 2026-09-06, Part T (ADR-0035's first execution).** The reserved token no longer fails at
spawn: command resolution expands it to the application's own executable with the token first and `--` second, and the
transport launches that like any other stdio child — three piped streams, hidden window — so `REQ-MCP-113`'s guarantee
covers it by the same code (the proof sampled the packaged `Rotaris.exe` and its `python` at 300 ms: no window handle at
any of 12 samples). Two things this transport learned from that child: the launch line is now logged at debug level (the
proof reads the appended `--project` from it), and **whitespace before the first byte of the first message is dropped** —
Electron's binary writes CR LF to standard output ~50 ms after start on Windows, before any JavaScript
(`spikes/code-intelligence-branch.md` §2); a blank line is not a message under newline framing, and nothing else is
tolerated. The stdin-end close path ends the runtime by itself (measured: exit 0 within a second), so `terminateTree`'s
kill is the grace path only.

**A real third-party server, at last — 2026-09-16.** The first-execution record above ends with "**Not tested:** a real
third-party server (the hand-written fixture only, in both eras)". One ran: `serena`, configured as
`code_intelligence`, on a plan-mode launch (`/tmp/rotaris-launch.log`, session `6696f6ed`).

**The decision holds and the mechanism worked.** `'auto'` reached it, over one process, with the legacy fallback doing
exactly what the spike said it would: serena answers `server/discover` with `-32602` — invalid params, not `-32601` —
and stays alive, so the era resolves to 2025-11-25 and the connection proceeds. Neither the pin nor a sibling process
was needed, and `REQ-MCP-067`'s process count held against something nobody wrote.

**What the fixture could not show: the probe is not free on a server built from a validating SDK.** Serena's Python
SDK checks the raw request against a union of request shapes and writes the whole pydantic failure to stderr at
WARNING — **55 lines per connection**, before answering. Multiply by the three paths that connect to one server
(`ToolDiscovery`, `SessionConnections`, `HealthProbe`, ADR-0034) and one launch carried it three times. Nothing was
broken; the launch log was simply unreadable. Two answers, both in the mechanism rather than in the decision:

- **The era is remembered per server for the process** (`negotiatedEras` in `packages/mcp/src/client.ts`, keyed by
  `launchIdentity` — what is launched, not the caller's label, so the three paths share one entry). Only the LEGACY
  outcome is remembered: a modern server answers the probe as designed at the cost of one request, while `{ pin }` has
  no fallback, and remembering a pin would turn a server that changes era between connections into a hard failure for
  the rest of the process. A caller's explicit `negotiation` still wins, which is what keeps the spike's table honest.
- **The child's stderr is forwarded at `debug`, not `info`** (`transport.ts`), and the run host stopped flattening
  `debug` into `info` on the way to the log (`run-host/mcp.ts`; the wire has carried four levels all along). It is the
  child's diagnostic stream, not this product's finding. `REQ-MCP-107`'s `stderrTail` is untouched, so a failure still
  explains itself.

**Still not measured, and now separable:** a third-party server in the MODERN era (serena is 2025-era; the probe was
answered, not honoured), and a probe **timeout**, which remains what the original record said it was. The application
log's own verbosity is spec-silent — `REQ-CONFIG-121` fixes the per-session log level and nothing fixes this one — so a
`debug` line still reaches the launch log, now saying what it is.

**Confirmed against a fresh launch, 2026-09-16 (R-026's sixth finding).** The repair above landed about an
hour after the run whose log raised the finding, so the finding's own evidence pre-dates it and could not
show whether it worked. Measured on the built app driven through `pnpm app:drive` against a throwaway
workspace, with the bundled runtime present and one scripted run started from the composer — 195 lines of
application log, of which:

- `run host info: mcp code_intelligence stderr:` — **0**,
- `run host debug: mcp code_intelligence stderr:` — **141**, 44 of them serena's own `INFO` records.

So the level the product forwards a child's stderr at is now `debug` for every line of it, and the run
host no longer flattens it. What the sentence above predicted is what happened: the lines still reach the
launch log, now saying what they are. That residue is **OQ-63** — the application log reads no level at
all, and the 141 lines are the measurement of it.
