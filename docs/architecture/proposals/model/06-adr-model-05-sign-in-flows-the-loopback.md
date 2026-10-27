# Architecture proposals — MODEL slice — ADR-MODEL-05 — Sign-in flows, the loopback listener and every credential read live in the main process; the renderer never holds a credential

Part 6 of 8 of [the model proposal](../model.md), which indexes every part.

### ADR-MODEL-05 — Sign-in flows, the loopback listener and every credential read live in the main process; the renderer never holds a credential

**Decision to be made.** Where the authentication flows execute in an Electron application, and what
crosses the process boundary.

**Constraints that bear on it.**

- A local HTTP listener must bind `127.0.0.1` — fixed ports `1455, 1457` for codex with path
  `/auth/callback`, an ephemeral port with `/callback` for the cloud flow — serve three HTML result
  pages, 404 everything else, and be **closed with its port released before the sign-in call
  returns**, on every platform (C2, C3, `REQ-PROVIDER-029`, `-030`, `-031`, `-039`).
- The system default browser is opened by the cloud flow (`REQ-PROVIDER-039`), and the authentication
  dialog renders links that open the system browser (`REQ-PROVIDER-116`).
- Cancel must abort a pending device/PKCE wait early rather than waiting out the multi-minute
  timeout, and authentication runs off the UI thread (C4, `REQ-PROVIDER-116`).
- No credential value is readable in a log, in user-visible error text, in a snapshot, in an event
  stream or in a hook payload (I1, `REQ-PROVIDER-131`), and the display mask is the only rendering
  of a stored key any interface shows (I2, `REQ-PROVIDER-107`, `REQ-PROVIDER-140`).
- Runs may execute in a separate worker process, and the two must be observationally identical
  (`REQ-MONITOR-299`, `REQ-MONITOR-246`) — so credential access is not exclusive to the window that
  started the run.
- The credential store is reachable by more than one application instance and every read-modify-write
  is serialised by a cross-process lock (B4, `REQ-PROVIDER-152`).
- The environment overrides `ROTARIS_OIDC_ISSUER` and `ROTARIS_API_BASE_URL` are read from "the
  environment the application was started with" (`REQ-PROVIDER-037`).

**Alternative A — flows in the main process; the renderer drives them over IPC and receives only
prompts, statuses and masked values.** An `authenticate(providerId, options)` IPC call returns an
outcome; prompts (verification URI, user code, interval, lifetime; or the authorization URL) are
pushed to the renderer as they occur; a cancel message resolves the abort signal; the loopback
server, the browser opening, the token exchange and the credential write all happen in main.

*For:* the loopback listener needs a real Node HTTP server and deterministic port release, which the
main process has and the renderer does not. `REQ-PROVIDER-037`'s "environment the application was
started with" is naturally the main process's own environment. It puts I1/I2 on a process boundary
rather than on a code-review convention: if no credential value is ever sent over IPC, the renderer
cannot leak one into a devtools log or a crash report.
*Against:* every provider-settings interaction becomes an IPC round trip, and the renderer needs a
state model for "in flight" that mirrors main's. `REQ-PROVIDER-141`'s "leaves the window responsive
to input within 100 ms" and "closing while a validation is still running neither loses the window
nor blocks it" then depend on IPC discipline — a real risk, but one that a request-id-keyed
subscription model addresses directly.

**Alternative B — flows in a dedicated utility/worker process, with main as a router.**

*For:* keeps the main process free of long-lived HTTP servers and provider I/O; matches the
"separate runtime process" idea in the candidate stack; a crash in a provider integration does not
take the window down.
*Against:* the loopback listener has a hard resource-lifetime guarantee (C3) that is easier to reason
about in one long-lived process than across a process that may be recycled. It also puts a second
process between the user's Cancel click and the abort signal, which C4 makes latency-sensitive. And
because runs may already execute in a worker (`REQ-MONITOR-299`), credential access would then be
spread across three processes rather than two, all contending on the same cross-process lock.

**Alternative C — credential reads in whichever process needs them, coordinated only by the file
lock.** The run worker reads and refreshes credentials itself; main does the same for the UI.

*For:* no IPC on the hot path; `REQ-PROVIDER-152` already makes this safe against corruption, and it
is explicitly designed for multiple instances.
*Against:* safe against corruption is not the same as correct. `REQ-PROVIDER-057`'s per-provider last
error and `REQ-PROVIDER-068`'s keep-fresh scope are *in-process* state; two processes refreshing the
same credential independently would both renew, both write, and disagree about last-error, and
`REQ-PROVIDER-140`'s provider list would show whichever process's view the window happens to hold.

**Recommendation: Alternative A, with a narrow exception.**

Authentication flows, the loopback listener, browser opening, the credential store and the keep-fresh
scope all live in the main process. The renderer receives prompts, statuses, masked values and
outcomes, and never a credential value. The narrow exception: a run worker must be able to obtain a
*token for a request* without a round trip per call — so main leases the resolved bearer to the
worker for the duration of a run and re-leases it on renewal, rather than the worker reading the
store. That keeps `REQ-PROVIDER-068`'s keep-fresh in one place and `REQ-PROVIDER-057`'s last-error
single-valued, while satisfying `REQ-PROVIDER-092`'s "no request carries a credential the store
already knows to be expired".

**Consequences accepted.**

- A leased token exists in a second process's memory for the life of a run. That is unavoidable
  once runs execute out of process; it is bounded by the run and never written to disk by the
  worker. The redaction pass (I1) applies to everything the worker logs or emits.
- IPC shapes for this slice must be defined as never carrying `access_token`, `refresh_token`, or a
  raw secret value. That is testable: a schema assertion over the IPC surface.
- The loopback listener is a real HTTP server in the main process. It must bind only `127.0.0.1`,
  serve only the two callback paths, and be torn down in a `finally` that the sign-in call awaits —
  `REQ-PROVIDER-031` makes "the call always returns rather than hanging" an explicit obligation, so
  a test that starts two sign-ins back to back and asserts the second binds 1455 belongs in the
  conformance suite.

**Revisit if.** The runtime-process slice concludes that runs must be able to start with the window
closed or the main process unavailable, in which case credential leasing needs a different owner.

---

### ADR-MODEL-06 — Money is an exact-decimal type carried end to end; `number` never touches a monetary value

**Decision to be made.** How monetary amounts and per-token prices are represented, computed and
persisted, given that binary floating point is forbidden for every amount the domain produces.

**Constraints that bear on it.**

- "Amounts are computed and rendered in exact decimal arithmetic, never in binary floating point …
  This is the one money rule for this domain: every monetary amount the domain computes or displays
  is produced under it, including the per-token pricing carried through discovery
  (`REQ-PROVIDER-072`) and any image pricing a model entry declares (`REQ-PROVIDER-150`). No amount
  is computed in binary floating point anywhere" (H1, `REQ-PROVIDER-121`).
- Rounding differs by kind: a balance is rounded **down** toward negative infinity; every other
  amount is rounded **half-up**; both to 2 decimal places, or 4 when the magnitude is below $0.01
  (`REQ-PROVIDER-121`).
- The balance is `balance_atomic ÷ atomic_scale` in exact decimal arithmetic, with a non-number and
  a non-positive scale each a named error (`REQ-PROVIDER-130`).
- Cost per agent is persisted (`REQ-MONITOR-102`) and cumulative cost is carried on `usage.update`
  (`REQ-EVENTS-053`), so the representation must survive persistence and the event stream.
- The hosted provider reports per-token prices as decimal strings; image pricing is carried as a
  decimal string; the snapshot format types the two per-token prices as `<float>` — E4 / **OQ-2**.
- Percentages are a separate, simpler rule: clamp then round half-up to a whole number
  (`REQ-PROVIDER-127`), and boolean inputs are rejected by the numeric parser.

**Alternative A — compute in `number`, round at the edges.**

*For:* nothing to add; JavaScript's `number` is exact for integers up to 2^53 and the amounts are
small.
*Against:* it is prohibited in terms, and for a good reason that shows up immediately here.
Per-token prices are of the order 1e-6 to 1e-8; multiplying such a price by a token count and
accumulating over thousands of calls is precisely where binary representation error becomes visible,
and cumulative cost is displayed to the user to two or four decimal places. A rounding rule that
distinguishes floor from half-up (H1) is also unreliable in binary: a value that is mathematically
exactly `x.005` may be stored as slightly less, and half-up then rounds the wrong way. The rule
exists because this is a real failure mode.

**Alternative B — a `Decimal` value type from an arbitrary-precision library, with a `Money` wrapper
carrying a currency, used from the point a price or an amount enters the product to the point it is
rendered.**

Prices are parsed from their decimal string form into `Decimal` and never converted to `number`.
Token counts stay integers. Cost is `Decimal × integer`. Rendering applies the two rounding modes.
Persistence writes the canonical decimal string. The event stream carries decimal strings, so
`REQ-EVENTS-017`'s "each of the type stated there" is satisfied by a string-typed cost field.

*For:* it satisfies H1 literally rather than approximately, and it puts the two rounding modes in
one place where they can be tested against the stated examples. Carrying the currency in the type
makes `REQ-PROVIDER-121`'s symbol table a property of the value rather than of the formatter.
*Against:* a dependency, and a discipline: every arithmetic site must use the type, and a single
`Number(x)` re-introduces the defect silently. That is addressed by a lint rule banning arithmetic
operators on the branded type and by keeping the field types as strings in the persisted and event
schemas, so an accidental `number` fails a schema check rather than passing quietly.

**Alternative C — integer minor units (or integer nano-units) throughout.**

*For:* no dependency; exact; fast.
*Against:* per-token prices are far below a minor unit, so the scale has to be picked in advance
(nano-dollars? pico-dollars?) and a provider that reports a price finer than the chosen scale is
silently truncated — which `REQ-PROVIDER-151`'s "SHALL NOT be repaired by guessing" and H1's spirit
both refuse. `REQ-PROVIDER-130`'s balance is already given as an atomic value with a **provider-
supplied** scale, so the product cannot fix one scale of its own. It also makes the 4-decimal-below-
$0.01 rule and the two rounding modes hand-written integer arithmetic, which is exactly the kind of
code that hides an off-by-one.

**Recommendation: Alternative B.**

Adopt an arbitrary-precision decimal library (the `decimal.js` / `big.js` family; a spike should
confirm the chosen one supports both `ROUND_FLOOR` and `ROUND_HALF_UP` explicitly and is stable
under the packaging of domain 11). Define:

- `Decimal` for unitless exact numbers (per-token prices, atomic scale).
- `Money = { amount: Decimal, currency: string }` with rendering per `REQ-PROVIDER-121`.
- Two formatters: `formatBalance` (floor) and `formatAmount` (half-up), each choosing 2 or 4 places
  by magnitude, and a `formatPercent` implementing `REQ-PROVIDER-127` separately — percentages are
  not money and must not share the money formatter.
- Persisted and event-carried monetary fields are **strings** in their canonical decimal form.

**Consequences accepted.**

- **OQ-2 must be resolved before the snapshot format is fixed.** This ADR's recommendation is
  coherent only if per-token prices are persisted as decimal strings; if the product owner confirms
  `<float>` as written, then the exactness `REQ-PROVIDER-121` demands is unattainable for any amount
  derived from a persisted price, and that is a specification defect to be recorded rather than a
  design to be built around.
- A dependency and a lint rule. The lint rule is the load-bearing part: without it the discipline
  decays.
- Comparisons and equality on money go through the type, so tests must compare canonical strings
  rather than numbers.

**Revisit if.** OQ-2 is resolved toward floats; or a provider begins reporting prices in a form the
decimal parser cannot accept without loss, which would be a `REQ-PROVIDER-151` read failure rather
than a silent conversion.

---

### ADR-MODEL-07 — Discovery → snapshot → effective configuration is a pure pipeline over provenance-carrying model entries

**Decision to be made.** How a discovered catalog becomes an effective, routable configuration —
and where the many determinism obligations are enforced.

**Constraints that bear on it.**

- Slot assignment must be deterministic and independent of discovery order and of the snapshot's
  stored ordering, with a code-point tie-break and stated invariants (D5, `REQ-PROVIDER-081`,
  `-082`); server-side suggestions replace picks per role (`REQ-PROVIDER-077`).
- The snapshot is ordered picks-first-then-sorted, preserves models a refresh did not re-discover,
  and counts them separately (D6, `REQ-PROVIDER-083`).
- Every model entry carries an image-input declaration with a three-source precedence in which a
  later discovery replaces a discovery-or-metadata value but never an explicit YAML declaration
  (D7, `REQ-PROVIDER-149`, `-150`). **Provenance, not just value, must be retained.**
- The merge into effective configuration has its own precedence, including "a user-authored YAML
  entry with a complete provider and model id always overrides", and unavailable models land in a
  separate map unless the user named them (F5, `REQ-PROVIDER-091`, `-136`, `-090`).
- The snapshot write is refused outright if the payload contains anything secret-like, with the
  offending field's path reported (E2, `REQ-PROVIDER-086`).
- Slot aliases are substituted during load, an empty slot resolves through a fixed chain, and a
  still-empty alias records a validation warning rather than failing the load (F1,
  `REQ-PROVIDER-088`).
- A load failure caused by an incomplete model entry triggers exactly one bulk refresh and one retry
  (F8, `REQ-PROVIDER-110`).

**Alternative A — a service that mutates a live configuration object as discovery results arrive.**
Discovery writes into the in-memory configuration; the snapshot is a serialisation of it.

*For:* one representation; the UI reads what the runtime uses.
*Against:* every determinism obligation becomes a statement about mutation order, which is exactly
what `REQ-PROVIDER-081`'s "the same catalog always produces the same three picks whatever order
discovery returned it in" forbids relying on. `REQ-PROVIDER-083`'s preservation of
not-re-discovered models becomes a diff against live state rather than a function of two inputs, and
`REQ-PROVIDER-149`'s precedence becomes "whoever wrote last".

**Alternative B — four named pure functions over immutable inputs, with impure I/O confined to the
ends.**

1. `discover(provider, credential) → DiscoveryResult` — the only network step
   (`REQ-PROVIDER-069`–`-076`).
2. `assignSlots(models, suggestions) → SlotPicks` — pure, total, deterministic
   (`REQ-PROVIDER-081`, `-082`, `-077`).
3. `mergeSnapshot(previousProviderRecord, DiscoveryResult, SlotPicks) → ProviderRecord` — pure;
   implements ordering and preservation (`REQ-PROVIDER-083`) and yields the preserved count the
   refresh action reports (`REQ-PROVIDER-147`).
4. `resolveEffectiveConfig(snapshot, yamlGlobal, yamlWorkspace, catalog) → { models, unavailable,
   slots, warnings }` — pure; implements `REQ-PROVIDER-091`, `-088`, `-090`, `-136`.

The impure edges are: reading credentials and performing HTTP (step 1); and writing the snapshot
under lock, preceded by the secret screen (E2, E3).

*For:* every determinism requirement becomes a property test over a pure function — "shuffle the
discovery order, assert identical picks" is one line. `REQ-PROVIDER-110`'s recovery becomes a
retry of step 4 with a refreshed snapshot rather than a re-entrant mutation. The secret screen (E2)
becomes a validator applied to the value about to be serialised, with the field path available
because the walk is over a plain value.
*Against:* it means an explicit re-computation whenever an input changes, and the pipeline must be
re-run on configuration reload, on refresh and on sign-in. That is more plumbing than a mutable
service, and there is a temptation to cache the result, which reintroduces staleness.

**Recommendation: Alternative B**, with one structural addition: a model entry is
**provenance-carrying**. Each of the capability fields governed by `REQ-PROVIDER-149`/`-150` is
stored as a value plus its source (`yaml` | `discovery` | `shipped-metadata` | absent), because the
precedence rule is stated in terms of source and not of recency, and "a later discovery replaces a
value that came from an earlier discovery or from shipped metadata, and never overrides an explicit
YAML declaration" cannot be implemented without it. The same technique answers `REQ-CONFIG-222`'s
provenance expectations on the settings side.

The three build-data tables (D4's known limits, D5's tier preferences, OQ-7's capability metadata)
are inputs to the pure functions, not globals reached into, so a test can substitute them.

**Consequences accepted.**

- The pipeline is re-run on every configuration reload; its cost is bounded by catalog size and is
  not on any hot path. Caching, if ever added, must be keyed on the full input tuple.
- The snapshot record and the effective model entry are two different types with an explicit
  mapping, rather than one type reused. That is more code and it is the point: `REQ-PROVIDER-084`
  fixes the persisted shape and `REQ-PROVIDER-089` fixes the routing shape, and they are not the
  same set of fields.
- `assignSlots` must be total — `REQ-PROVIDER-082` guarantees a choice exists for every non-empty
  catalog of available models, and the "lowest qualified id in ascending code-point order" fallback
  is what makes it total. A catalog with no available models leaves slots unset, which
  `REQ-PROVIDER-088`'s resolution then handles without failing the load.

**Revisit if.** OQ-2 changes the persisted price type (which changes the snapshot record); or the
hosted suggestions endpoint gains roles beyond the four of `REQ-PROVIDER-077`.

---

### ADR-MODEL-08 — Use the official MCP TypeScript SDK's protocol layer, but own the stdio transport

**Decision to be made.** Whether the MCP client is the official TypeScript SDK, a hand-written
JSON-RPC client, or a mixture — and if the SDK, how much of it.

**Constraints that bear on it.**

- Three transports are required — `stdio`, streamable `http`, `sse` — under one vocabulary
  (J12, `REQ-MCP-001`, `REQ-MCP-043`).
- **Exactly one server process per stdio server per session** (K5, `REQ-MCP-067`), stated as an
  observable a test can count.
- The Windows launch guarantee is unusually explicit: the product creates the child's three standard
  streams itself for **every** `stdio` launch, never inherits or reuses the parent's, never requires
  a console to exist, never allocates or shows one, and no console window appears at any point; the
  same rule applies on every platform and to the reserved token's child (K10, `REQ-MCP-113`).
- Per-call timeouts are 300 s by default and 600 s for `web_search`; discovery is 30 s with a hard
  35 s outer bound that must hold for every caller and must not delay process exit; probes are 8 s;
  post-connect hooks are 15 s (J3, K1, K4, K7).
- Concurrent calls over one connection must all complete, each receiving its own response, and the
  session's event emission must not stall behind an outstanding call (K6, `REQ-MCP-068`).
- A mid-connection `tools/list` change must be observed and must narrow the callable set (K8,
  `REQ-MCP-060`).
- Discovery must return an empty list rather than raising, on any connection, protocol or timeout
  error (K3, `REQ-MCP-048`), and a teardown error after the list arrived is ignored
  (`REQ-MCP-051`).

**What was checked.** Context7, `modelcontextprotocol/typescript-sdk` (v1.x line, with a
2.0.0-alpha published): `Client` accepts any object implementing the `Transport` interface —
`start`, `send`, `close`, `onmessage`, `onerror`, `onclose` — and the package exports `ReadBuffer`
and `serializeMessage` for framing, with a documented custom-transport guide. `RequestOptions`
carries `timeout`, `resetTimeoutOnProgress` and `maxTotalTimeout`, with a 60 s default request
timeout. `StdioServerParameters` is exactly `{ command, args?, env?, stderr?, cwd?, maxBufferSize? }`
— **there is no passthrough for Node spawn options**, so `windowsHide` and detachment are not
reachable through it. The migration notes also describe a version-negotiation **probe policy** in
which, for the standard `StdioClientTransport`, "the probe executes on a short-lived sibling process
spawned with identical parameters", reaped once the protocol era is determined.

**Alternative A — the official SDK wholesale, including `StdioClientTransport`.**

*For:* least code; protocol version negotiation, capability handling, notification dispatch and
schema validation are maintained upstream; new protocol revisions arrive as a dependency bump.
*Against:* two of its behaviors collide with stated observables. The sibling-process probe means a
single logical connection can transiently spawn **two** processes, which sits badly with
`REQ-MCP-067`'s countable one-process guarantee and doubles the launch cost of the bundled
code-intelligence runtime. And because `StdioServerParameters` exposes no spawn options, the
guarantees of `REQ-MCP-113` — that *we* create the three streams and that no console window appears
at any point — are not things we can assert; they become properties of a dependency's internals.
`REQ-MCP-113` is written to be tested negatively, and a design that cannot state where the spawn
happens cannot pass that test honestly.

**Alternative B — hand-written JSON-RPC client over our own transports.**

*For:* total control; every timing and process obligation is ours to state; no surprise from an
upstream negotiation policy.
*Against:* MCP is a moving protocol with version negotiation, capability declaration, notification
semantics and an evolving schema. Re-implementing that is real work whose failure mode is
incompatibility with servers we do not control — the exact thing `REQ-MCP-151`-style consumed-
contract discipline cannot save us from, because here we are the *client* of a protocol, not a
consumer of a payload. It also loses the SDK's schema validation, which is doing quiet work behind
`REQ-MCP-052`'s "entries with an empty or non-string name SHALL be dropped".

**Alternative C — the SDK's `Client` and protocol layer, with our own `Transport` implementations
for `stdio` (and the SDK's for `http`/`sse`).**

*For:* the split falls exactly along the line the requirements draw. Protocol behavior — handshake,
negotiation, request correlation, notification dispatch, schema validation — is the SDK's and is not
something the specification constrains. Process behavior — who spawns, with which stdio
configuration, with `windowsHide`, with which environment, and how it is killed — is precisely what
`REQ-MCP-113`, `REQ-MCP-067` and `REQ-MCP-099` constrain, and it becomes ours. `ReadBuffer` and
`serializeMessage` are exported for exactly this, and the custom-transport contract is documented
(never call `start()` yourself; `close()` must fire `onclose`; throw from `send` for failures the
sender must observe).
*Against:* a custom transport is a maintenance surface that must track framing changes, and the
version-negotiation probe behavior must be understood well enough to configure rather than to
inherit — if negotiation is transport-coupled, our transport must either implement its side or the
client must be pinned to an explicit negotiation mode. That needs a spike.

**Recommendation: Alternative C.**

Use `@modelcontextprotocol/client`'s `Client` for the protocol. Supply:

- `OwnedStdioTransport` — spawns with `stdio: ['pipe','pipe','pipe']` and `windowsHide: true`,
  never inheriting the parent's descriptors, capturing `stderr` to the log after redaction (I1),
  framing with `ReadBuffer` / `serializeMessage`, and owning termination (terminate, 5-second grace,
  force-kill, Windows process tree — the same primitive `REQ-MCP-099` needs and the same one
  ADR-MODEL-01's external-runtime backend needs).
- The SDK's `StreamableHTTPClientTransport` and `SSEClientTransport` for `http` and `sse`, since
  `REQ-MCP-037` explicitly does not probe remote reachability at configuration time and there is no
  process obligation to own.

Timeouts are passed explicitly at every call site — never left to the SDK's 60 s default: 300 s or
`request_timeout` for tool calls (`REQ-MCP-003`), 30 s for discovery with a `maxTotalTimeout` giving
`REQ-MCP-053`'s 35 s outer bound, 8 s for probes, 15 s for post-connect hooks. `resetTimeoutOnProgress`
is **not** enabled for tool calls, because `REQ-MCP-003` measures the allowance "from the dispatch of
the call to the receipt of its result" and progress notifications must not extend it.

Version negotiation is pinned to an explicit mode rather than left on `auto`, so no sibling probe
process is spawned and `REQ-MCP-067`'s process count stays literally one. This is the item most in
need of a spike before the gate: confirm that pinning does not break servers that only speak the
newer negotiation.

**Consequences accepted.**

- We own a transport. It is roughly one file plus a process-supervision helper shared with two other
  call sites, and it is where three hard requirements are satisfied, so it earns its keep.
- Pinning negotiation may need revisiting as the protocol moves; that is a dependency-bump-shaped
  cost, not a redesign.
- `windowsHide: true` must be verified, not assumed: Node's documented default for
  `child_process.spawn` is `false`, and a GUI-subsystem Electron process spawning a console
  application is exactly the case where a window appears. `REQ-MCP-113` makes "no console window at
  any point" observable, so this needs an actual on-Windows check, not a code reading.

**Revisit if.** The negotiation spike shows pinning is unworkable; or the SDK gains spawn-option
passthrough on `StdioClientTransport` covering `windowsHide` and stream ownership, which would make
Alternative A viable and reduce our surface.

---
