# Architecture proposals — MODEL slice — ADR-MODEL-09 — One session-scoped connection registry owns supervision; discovery, probing and calls are three distinct paths through it

Part 7 of 8 of [the model proposal](../model.md), which indexes every part.

### ADR-MODEL-09 — One session-scoped connection registry owns supervision; discovery, probing and calls are three distinct paths through it

**Decision to be made.** How MCP connections are created, shared, supervised and torn down, given
three different lifetimes with three different caching rules.

**Constraints that bear on it.**

- Three interactions with different rules over the *same* configuration:
  - **Discovery** — memoised per process on a nine-value identity, invalidated by configuration
    reload, never persisted or shared between instances, failure yielding an empty list and a
    remembered failure (K2, K3, `REQ-MCP-047`, `-048`).
  - **Probing** — deliberately *never* cached; n probes contact the server n times; 8-second budget;
    never raises; leaves discovery state untouched; runs even for a server whose discovery failed
    (K4, `REQ-MCP-054`).
  - **Session calls** — exactly one shared connection and one stdio process per server for the
    whole session, opened on first demand, surviving the end of each child conversation, closed once
    at session end (K5, K6, `REQ-MCP-066`, `-067`, `-068`).
- Concurrency: two simultaneous first-demands yield one connection; calls to already-connected
  servers must not wait for another server's startup; concurrent calls on one connection must all
  complete with correct correlation; the event stream must keep flowing while a call is outstanding
  (`REQ-MCP-067`, `-068`).
- Failure after connect is per call: fail the call, warn once per server per session, no retry, no
  automatic reconnect, later calls may reconnect (K9, `REQ-MCP-069`).
- Post-connect hooks run before tools are offered, read the **unfiltered** list, and have different
  failure semantics from one another (K7, `REQ-MCP-064`, `-070`, `-071`).
- Shutdown is idempotent; a request after shutdown fails naming the server and leaves nothing open
  (`REQ-MCP-067`).

**Alternative A — one connection pool serving all three paths, with a cache policy per caller.**

*For:* one place that knows how to open a connection; probes and discovery reuse a warm connection,
which is faster.
*Against:* it makes `REQ-MCP-054` hard to honour and easy to violate: a probe that reuses a session
connection is not "contacting the server" in the sense the requirement means, and "probing the same
server n times SHALL cause the server to be contacted n times" would become an argument about what
counts as contact. `REQ-MCP-047`'s discovery memo and `REQ-MCP-054`'s explicit non-caching would
live in the same object with opposite policies.

**Alternative B — three separate paths over one shared launch primitive.**

- `ToolDiscovery` — opens its own short-lived connection, memoised by the nine-value identity, with
  an outer watchdog giving `REQ-MCP-053`'s bound independent of the transport's own timeout.
- `HealthProbe` — opens its own connection every time, closes it every time, 8-second budget, two
  outcomes, never raises, writes nothing into any cache.
- `SessionConnections` — the shared registry: a map from server name to a promise of a connected,
  hook-completed session, created under a keyed single-flight so two concurrent first-demands share
  one promise; a shutdown latch that makes post-shutdown requests fail; `closeAll()` idempotent.

All three use one `OwnedStdioTransport` / remote-transport factory (ADR-MODEL-08) so launch
behavior is identical everywhere, which is what `REQ-MCP-050`'s "discovery SHALL use the same
resolved command and arguments as launch" requires.

*For:* each requirement lands in exactly one object with exactly one policy, and the policies that
contradict each other never share code. The keyed single-flight is the direct expression of
`REQ-MCP-067`; because it is keyed per server, "while one server is still starting, tool calls to
servers that are already connected SHALL complete without waiting" falls out rather than being
arranged.
*Against:* three connection paths mean three opportunities to diverge on launch details. Mitigated
by the shared factory, and by `REQ-MCP-047`'s nine-value identity being computed by one function
that all three use.

**Alternative C — a supervisor process per stdio server, with automatic restart.**

*For:* robustness; a crashed server comes back.
*Against:* `REQ-MCP-069` forbids it in terms — "the product SHALL neither retry the call nor
reconnect on its own", with recovery happening only because a *later* call re-establishes the
connection. Automatic restart would also break `REQ-MCP-067`'s process count and would make
`REQ-MCP-054`'s "reports what it observes at that moment" untrue, since a probe could observe a
freshly restarted server rather than the failure.

**Recommendation: Alternative B.**

Additional decisions this ADR fixes:

- The connected-session value in the registry holds the client, the **unfiltered** tool list (so
  post-connect probes and `REQ-MCP-064` are satisfied without a second `tools/list`), the current
  callable set per persona, and a `warnedUnreachable` flag giving `REQ-MCP-069`'s once-per-server-
  per-session warning.
- `tools/list_changed` is handled by recomputing the callable set with the same decision function
  and applying `REQ-MCP-060`'s narrow-only rule against the set captured at connect time. The
  connect-time set is retained precisely so "a name the update introduces … SHALL NOT become
  callable" can be enforced.
- Calls are dispatched concurrently on one client; nothing serialises them. The event pump must not
  await a tool call — `REQ-MCP-068` makes that observable via `tool.start` appearing before the call
  returns, so it belongs in the conformance suite rather than in a comment.
- Teardown runs on session-lock release and at application exit (`REQ-MCP-066`), and `closeAll()` is
  safe to call repeatedly.

**Consequences accepted.**

- Probing is more expensive than reusing a connection — deliberately, because `REQ-MCP-054` asks for
  a fresh observation. The "Check status" button probes sequentially on a background thread
  (`REQ-MCP-092`), which bounds the cost.
- Discovery opens a connection separate from the session's. For a `stdio` server that means an extra
  short-lived process during discovery. That is consistent with `REQ-MCP-067`, whose one-process
  guarantee is scoped to the session's shared connection, but it is worth stating so nobody reads a
  process count in a test and concludes there is a leak.
- Three paths must be kept aligned on launch details; the shared factory and the shared identity
  function are the mechanism.

**Revisit if.** A requirement appears that makes probe results reusable, or that requires automatic
reconnection — both would contradict `REQ-MCP-054` and `REQ-MCP-069` as written and would be
specification changes rather than design changes.

---

### ADR-MODEL-10 — The bundled code-intelligence runtime is reached through a general argv pass-through in the packaged binary, driven by one generated binding manifest

**Decision to be made.** How `builtin:code-intelligence` is packaged and launched, and how the
pinned runtime's identifiers are kept in one place.

**Constraints that bear on it.**

- The token is recognised before every other command-resolution rule and is never looked up on PATH
  (J11, `REQ-MCP-033`). In a frozen installation it resolves to "the application's own executable
  with the same token `builtin:code-intelligence` as its first argument — one literal serves as both
  the token and the sentinel". Such a process answers MCP on its standard streams, **presents no
  user interface, opens no window**, and terminates with the server's own exit status.
- A `stdio` entry carrying the token counts as available **unconditionally** (`REQ-MCP-037`),
  because what it resolves to ships with the application.
- The Windows launch guarantee applies to this child too — it is the application's own executable
  (K10, `REQ-MCP-113`).
- Exactly one binding manifest holds every one of the runtime's identifiers: distribution id, pinned
  `MAJOR.MINOR.PATCH`, transport and mode arguments, launch subcommand, both project-selection
  options, marker file name, the three setup subcommands, indexable extensions, the four grant tiers
  and the three never-grant names. Not user-editable, not read at run time from any user-writable
  location, not workspace-varying (J8, `REQ-MCP-116`).
- Build checks: tier cardinalities 10/7/2/1, pairwise disjointness, no never-grant name in a tier,
  and every name reported by the pinned runtime's `tools/list`; a failing build must not ship
  (`REQ-MCP-015`). The `browser` package's version string must match the setup manifest character
  for character, also checked by the build (`REQ-MCP-095`).
- The derived setup invocation is the resolved command plus the argument prefix before the launch
  subcommand, and no substitute command may be used (M4, `REQ-MCP-036`); setup then runs three
  subcommands against it (M2, `REQ-MCP-099`). Hence **OQ-6**.

**Alternative A — ship the runtime as a separate bundled executable and resolve the token to its
path inside the application's resources.**

*For:* simplest mental model; the setup subcommands work because it is just the runtime's own
executable; no argv branch in the application; the process is plainly not the app, so "presents no
user interface" is trivially true.
*Against:* it contradicts `REQ-MCP-033` as written — a frozen installation is required to resolve
the token to *the application's own executable* with the token as its first argument, with the
explicit rationale that "one literal serves as both the token and the sentinel, so there is nothing
else to keep in step". Choosing A means proposing a change to that requirement, which is legitimate
but must be stated as such rather than done quietly.

**Alternative B — an early argv branch in the packaged binary that hosts the runtime in-process.**

*For:* matches `REQ-MCP-033` exactly; nothing extra to locate on disk.
*Against:* it only works if the runtime can be hosted in the application's own language runtime.
`REQ-MCP-011` pins a third-party **distribution** at an exact version, and `REQ-CONFIG-181` leaves
the identity of that distribution to the implementation and permits it to change between releases —
so the runtime may well not be a Node package, and hosting it in-process is not generally possible.
Committing the architecture to in-process hosting constrains a choice `REQ-CONFIG-181` deliberately
left open.

**Alternative C — an early argv branch that *exec*s or supervises the bundled runtime, passing
through all remaining arguments and propagating its exit status.**

*For:* satisfies `REQ-MCP-033`'s letter (the token is the sentinel; the process answers MCP on its
standard streams; no window; the parent observes the server's own exit code) while leaving
`REQ-CONFIG-181`'s freedom intact — the bundled runtime can be any executable, hosted or exec'd.
It also answers OQ-6 in the only way that makes `REQ-MCP-036` and `REQ-MCP-099` work: the branch is
a general pass-through, so `create`, `index` and the memory subcommand reach the runtime unchanged.
*Against:* an extra process in the chain when the runtime is exec'd rather than hosted, and the
branch must run before **anything** in the application bootstrap that could open a window, log to
stdout, or install a crash handler that writes to stdout — a real ordering hazard in an Electron
main entry point, since anything written to stdout corrupts the JSON-RPC stream.

**Recommendation: Alternative C**, subject to OQ-6 being confirmed.

- The packaged binary's entry point begins with: if `argv[1] === 'builtin:code-intelligence'`, hand
  the remaining arguments to the bundled runtime and propagate its exit status; do nothing else
  first. No Electron app bootstrap, no window, no logging to stdout, ever, on this path. On Windows
  this branch will need `ELECTRON_RUN_AS_NODE` or an equivalent, which is a spike item.
- The bundled runtime's location inside the packaged resources is resolved by the branch, not by
  command resolution — command resolution's only job is to recognise the token
  (`REQ-MCP-033`) and report the entry unconditionally available (`REQ-MCP-037`).
- The **binding manifest is generated at build time**, not hand-maintained. The build starts the
  pinned runtime, reads its `tools/list`, and emits a TypeScript module containing the tier
  membership and the never-grant names, then asserts `REQ-MCP-015`'s cardinality, disjointness and
  coverage checks. This is the difference between a manifest that is *checked* against the runtime
  and one that *is* the runtime's answer; `REQ-MCP-015`'s "an upstream rename therefore fails a
  build rather than silently degrading a grant at run time" is only true of the latter.
- `REQ-MCP-095`'s browser-version cross-check is the same kind of build assertion over the shipped
  default entry and the setup manifest.

**Consequences accepted.**

- The application entry point acquires a pre-bootstrap branch that must never be reordered. Guard it
  with a test that runs the packaged binary with the sentinel and asserts (a) valid JSON-RPC on
  stdout, (b) nothing else on stdout, (c) no window, (d) the runtime's own exit status.
- The build depends on being able to execute the pinned runtime, so CI must be able to install it.
  That is already implied by `REQ-MCP-015`'s coverage check.
- If OQ-6 is answered the other way — the sentinel serves only the stdio server — then
  `REQ-MCP-036`'s derived invocation cannot drive `REQ-MCP-099`'s setup steps and one of the two
  requirements must change.

**Revisit if.** `REQ-CONFIG-181`'s chosen runtime turns out to be a Node package after all, making
Alternative B available and removing a process from the chain; or OQ-6 resolves against the
pass-through reading.

---

### ADR-MODEL-11 — MCP configuration resolution is a pure pipeline with a source-tagged diagnostics channel

**Decision to be made.** How the three configuration sources become one server map and a per-persona
callable tool set, given that the same defect must fail a load from one source and drop an entry
from another, and that warnings have three different de-duplication scopes.

**Constraints that bear on it.**

- Merge order defaults → discovered → global YAML → workspace YAML, field-wise, with a
  machine-maintained origin map (J9, `REQ-MCP-025`, `-026`, `-008`).
- The same defect is fatal from YAML (reporting **every** defect, not the first) and non-fatal from
  `mcp.json` (dropping that entry alone) (J2, `REQ-MCP-002`, `-023`).
- `mcp.json` is byte-for-byte read-only, and an unrecognised key inside an entry is warned once per
  (file, server, key) **per load** and does not skip the entry (J10, `REQ-MCP-027`).
- Other warning scopes differ: once per server **per process** for the unavailable-command detail
  line (`REQ-MCP-041`), once per identity for discovery failure (`REQ-MCP-048`), once per
  (server, tool) per process for an inert grant (`REQ-MCP-058`), once per server **per session** for
  a post-connect unreachability (`REQ-MCP-069`).
- The grant algebra has five cases in which "no entry" and "empty list" must be distinguishable in
  the resulting surface (J6, `REQ-MCP-055`), denial outranks every grant (`REQ-MCP-004`), candidate
  spellings are additive (`REQ-MCP-057`), and renaming is applied after filtering and is never a
  permission decision (`REQ-MCP-005`).
- The normalized runtime description has an exactly-equal key set and is produced only after
  filtering, renaming and grants (J12, `REQ-MCP-043`).
- Every ordered presentation uses code-point order, locale-independent (J13, `REQ-MCP-117`).
- Resolving a persona's server set is side-effect free on configuration, including its `args` list,
  under repeated resolution (`REQ-MCP-009`).
- Warnings from agent construction reach the user through exactly two channels (K12,
  `REQ-MCP-044`).

**Alternative A — resolve lazily at the point of use, with warnings emitted where they arise.**

*For:* least ceremony; a warning is logged where the condition is noticed.
*Against:* it makes the four different de-duplication scopes into four ad-hoc caches scattered
through the code, and it makes `REQ-MCP-009`'s side-effect-freedom a property nobody can check. It
also makes `REQ-MCP-061`'s "a persona's callable tool set SHALL be a function of configuration
alone … the identical filtered set SHALL be observed whether the persona runs in a run the user is
watching or in a run the application performs in the background" a claim rather than a theorem.

**Alternative B — a pure resolution pipeline returning a value *and* a diagnostics list, with
emission and de-duplication handled by one sink.**

```
loadDiscoveryFiles()  -> { entries, diagnostics }      // per REQ-MCP-017..-024, -027
mergeServers(defaults, discovered, yamlGlobal, yamlWorkspace)
                      -> { servers, origins, diagnostics }   // REQ-MCP-025, -026
resolveEnvironment(servers, processEnv, secrets)
                      -> { servers, diagnostics }      // REQ-MCP-087, -088, -090
resolveCommands(servers)   -> servers                  // REQ-MCP-028..-036
computeAvailability(servers, path) -> availability     // REQ-MCP-037, one rule, all surfaces
resolvePersona(persona, servers, discoveredTools)
                      -> { active, dropped, grants, diagnostics }  // REQ-MCP-038..-042, -055..-059
describeForBackend(server) -> NormalizedDescription    // REQ-MCP-043
renderPromptSection(active, grants) -> string          // REQ-MCP-101, -102
```

Each function is pure over its inputs; every diagnostic is a value carrying its severity, its
de-duplication key and its scope (`load` | `process` | `session`). One `DiagnosticSink` applies the
scope rules and fans out to the two channels of `REQ-MCP-044`.

*For:* `REQ-MCP-061`'s function-of-configuration-alone becomes literally true and testable;
`REQ-MCP-009`'s side-effect-freedom is a property of pure functions rather than a convention;
`REQ-MCP-002`'s "every defect found SHALL be reported" is natural when diagnostics are accumulated
rather than thrown; and the four de-duplication scopes live in one sink instead of four caches.
`REQ-MCP-037`'s "no two surfaces may disagree on availability" is guaranteed by there being one
`computeAvailability`.
*Against:* threading a diagnostics list through every stage is verbose, and there is a temptation to
throw for the fatal YAML case instead of accumulating. That temptation must be resisted precisely
because `REQ-MCP-002` requires all defects, so the fatal case is "accumulate, then reject at the
end".

**Alternative C — validate with a schema library and let it produce the diagnostics.**

*For:* schema libraries give per-path errors for free, which suits `REQ-MCP-001`'s closed field set
and `REQ-MCP-002`'s report-everything rule.
*Against:* it only covers shape. The interesting defects are cross-field (`stdio` needs `command`,
`http`/`sse` need `url`), source-dependent in severity, and — for `mcp.json` — deliberately *lenient*
about unknown keys in the opposite direction from the snapshot (D8 versus E1). A schema library is a
good component inside Alternative B and a poor replacement for it.

**Recommendation: Alternative B**, using a schema library for the field-shape layer only.

Two details this ADR fixes:

- Grants are represented as `undefined` (no entry → unrestricted) versus `[]` (empty list → nothing),
  never collapsed, so `REQ-MCP-055` cases (b) and (c) stay distinguishable through the whole
  pipeline.
- All ordering uses an explicit code-point comparator. `localeCompare` and `Intl.Collator` are
  banned in this slice by lint rule, because `REQ-MCP-117` requires identical order "on every
  platform and under every locale", and the default JavaScript sort's UTF-16 code-unit order differs
  from code-point order for astral characters — a real difference for a tool name containing an
  emoji, which is not hypothetical for MCP servers.

**Consequences accepted.**

- Verbosity in the plumbing, bought for testability of the requirements that matter most.
- The diagnostics sink is a small piece of shared machinery that must be correct; its scope rules
  are directly traceable to `REQ-MCP-027`, `-041`, `-048`, `-058`, `-069`.
- OQ-5 must be resolved before `resolveEnvironment` is written: the function's signature differs
  depending on whether the resolved map replaces or overlays the parent environment.

**Revisit if.** A fourth configuration source is added, or the origin vocabulary of `REQ-MCP-026`
gains a value.

---

### ADR-MODEL-12 — The connection registry lives with the session; the settings surface probes independently

**Decision to be made.** Which process owns MCP connections, given that runs may execute in a
separate worker process while the settings surface probes from the window.

**Constraints that bear on it.**

- Connections are **session**-scoped: one per server for the life of a session, torn down at
  session-lock release and at application exit (K5, `REQ-MCP-066`).
- A run performed in the background uses the same shared-connection behavior as a watched run
  (`REQ-MCP-066`), and a run's observable outcome must not depend on where it executes
  (`REQ-MONITOR-299`).
- Discovery caching is "per process and never shared … Two instances open at once may therefore hold
  different tool lists for the same server, each correctly reporting what it observed, and neither
  SHALL wait on, lock against, or invalidate the other" (K2, `REQ-MCP-047`).
- Probing is a settings-surface action running sequentially on a background thread without blocking
  the UI (`REQ-MCP-092`), and the MCP settings category must respond within 100 ms
  (`REQ-MCP-108`).
- Secrets and enablement are read at configuration load and take effect on the next load
  (`REQ-MCP-087`, `REQ-MCP-110`, `REQ-MCP-078`).

**Alternative A — one central MCP service in the main process; the run worker calls tools over
IPC.**

*For:* one connection registry; the settings surface and runs see the same state; only one process
spawns children.
*Against:* every tool call becomes an IPC round trip carrying arguments and results, some of them
large. Worse, it puts the run's tool latency and the window's responsiveness on the same channel,
which `REQ-MCP-068`'s "the session SHALL keep emitting its events while a tool call is outstanding"
and `REQ-MCP-108`'s 100 ms budget both press on. It also makes the session lifetime of
`REQ-MCP-066` a cross-process concern.

**Alternative B — the registry lives in the process that owns the session; the settings surface
probes from its own process.**

*For:* it is what `REQ-MCP-047` already describes and permits. Per-process, never-shared caching
means a probe from the window and a discovery inside a run worker are *supposed* to be independent
observations. Tool calls stay in-process with the run, so `REQ-MCP-068`'s concurrency and event-flow
guarantees are local properties. Session teardown is local to the session's owner.
*Against:* an `stdio` server may be running twice at once — once for a run's session, once
transiently for a probe. `REQ-MCP-067`'s one-process guarantee is scoped to the session's shared
connection, so this is conformant, but it is surprising and must be documented for whoever writes a
test that counts processes. It also means the settings surface's health view and a running session's
experience can genuinely differ, which `REQ-MCP-054`'s "reports the state of the server at the
moment it runs" endorses.

**Recommendation: Alternative B.**

The MCP client library, the resolution pipeline of ADR-MODEL-11 and the registry of ADR-MODEL-09 are
all written as a plain library with no process assumptions, and are instantiated in whichever process
owns a session; the settings surface instantiates the discovery and probe paths only. Nothing about
MCP crosses a process boundary except the *configuration* (which is already file-based and layered)
and the *diagnostics* (which reach the user through `REQ-MCP-044`'s two channels).

**Consequences accepted.**

- Two processes may hold different tool lists for one server, and that is correct behavior rather
  than a bug (`REQ-MCP-047`).
- Machine setup and project setup (`REQ-MCP-095`, `-099`, `-112`) run where their surface lives —
  the window's process — and spawn their own children with the same launch primitive.
- The library must be free of Electron imports so it can run in a worker; that is a lint-enforceable
  boundary.

**Revisit if.** The runtime-process slice concludes that all child-process spawning must be
centralised — for example for sandbox or audit reasons in domain 10 — which would make Alternative A
the required shape and would need its latency concerns answered.

---

### ADR-MODEL-13 — Secret hygiene is one shared module exposing predicates and transformations separately (cross-slice request)

**Decision to be made.** What interface the shared redaction module — owned by domain 05, not by
this slice — must expose for this slice's obligations to be satisfiable without a second copy of any
rule.

This is recorded as an ADR because it is a design constraint this slice places on another, and
because getting it wrong means duplicating a rule that three requirements insist exists exactly once.

**Constraints that bear on it.**

- `REQ-TOOLS-171` is the single definition of the redaction algorithm, the marker `***`, the display
  mask, and the credential value-prefix list; `REQ-TOOLS-172` is the single definition of the
  secret-looking key test. `REQ-PROVIDER-131` and `REQ-MCP-081` both state they hold no second copy.
- This slice needs **four different things** from those two requirements:
  1. *Transform text* — redact a string on its way to a log, an event, an error message or a hook
     payload (`REQ-PROVIDER-131`).
  2. *Test a key* — decide whether a mapping key is secret-looking, used by the snapshot screen,
     which then **refuses the write** rather than masking (`REQ-PROVIDER-086`).
  3. *Test a value prefix* — the same screen tests whether a string value begins with a credential
     prefix, at a token boundary, case-insensitively (`REQ-PROVIDER-086`).
  4. *Display-mask a stored value* — unconditionally for anything read out of the MCP secrets store
     (`REQ-MCP-081`) and for every rendering of a stored provider key (`REQ-PROVIDER-107`).
- The two output forms must never be substituted for one another (`REQ-TOOLS-171`,
  `REQ-PROVIDER-131`).
- The snapshot screen adds two triggers of its own — a `session` key segment and `ghu_` anywhere in
  a lower-cased key — on top of `REQ-TOOLS-172`'s test (`REQ-PROVIDER-086`), so composition must be
  possible without re-implementing the base test.

**Alternative A — a single `redact(text)` function.**

*For:* smallest surface; hardest to misuse for its intended purpose.
*Against:* it cannot serve needs 2, 3 and 4. The snapshot screen must *detect and refuse*, not mask;
the display mask is a different output; and `REQ-MCP-081`'s masking is unconditional and therefore
not a function of the text's content at all. Forcing all four through one function guarantees a
second copy of the key test appears somewhere, which is exactly what `REQ-PROVIDER-086` and
`REQ-MCP-081` forbid.

**Alternative B — one module exposing `redactText`, `isSecretLookingKey`, `hasCredentialPrefix`,
`displayMask`, and the prefix list as a read-only export.**

*For:* each of this slice's four needs maps to one export; the snapshot screen composes
`isSecretLookingKey(k) || hasSessionSegment(k) || containsGhu(k)` without restating the base test;
`REQ-MCP-081`'s unconditional masking calls `displayMask` directly with no predicate; and the
never-substitute rule is expressible as two differently-named functions with different return
shapes.
*Against:* a larger surface invites misuse — someone could call `displayMask` on a log line. Answer:
name the functions for their venue (`displayMaskStoredSecret`, `redactForOutput`) and put the
never-substitute rule in a test that asserts each venue's output form.

**Recommendation: Alternative B**, requested of the domain-05 slice.

This slice additionally commits to:

- The snapshot screen (`REQ-PROVIDER-086`) walks the value about to be serialised and yields
  `(path, key, value)` triples, so the refusal can name the offending field's path. The exempt set
  is matched **by path** — `pricing.*` per-token keys and `limits.*` — not by bare key name, because
  `REQ-PROVIDER-086` closes the exempt set and a name-based match would exempt a same-named key
  elsewhere in the document.
- No venue in this slice defines a redaction rule. The IPC surface of ADR-MODEL-05 and the
  diagnostics sink of ADR-MODEL-11 both call the shared module.

**Consequences accepted.** A dependency on another slice's module for a security-relevant behavior;
mitigated by the fact that the specification requires exactly that and forbids the alternative.

**Revisit if.** Domain 05 declines the shape, in which case the duplication it forces must be raised
as a specification conflict rather than absorbed.

---
