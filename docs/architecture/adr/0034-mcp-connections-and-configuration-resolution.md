# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-09, ADR-MODEL-11, ADR-MODEL-12)
- **Depends on:** ADR-0002, ADR-0005, ADR-0007, ADR-0033, ADR-0036

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

## Context — configuration resolution

`REQ-MCP-025`, `REQ-MCP-026` and `REQ-MCP-008`: merge order is defaults, discovered, global YAML,
workspace YAML, field-wise for same-named entries, with a machine-maintained origin map that is never
user-settable. `REQ-MCP-002` and `REQ-MCP-023`: **the same defect is fatal from YAML — reporting every
defect, not the first — and non-fatal from a discovered file, dropping that entry alone.**
`REQ-MCP-027`: discovered files are consumed strictly read-only and must be byte-for-byte identical
after any number of loads; an unrecognised key inside an entry is warned about at most once per (file,
server, key) **per load** and does not skip the entry.

Four different warning de-duplication scopes coexist: per load (`REQ-MCP-027`), once per server per
**process** (`REQ-MCP-041`), once per identity (`REQ-MCP-048`), once per (server, tool) per process
(`REQ-MCP-058`), once per server per **session** (`REQ-MCP-069`).

`REQ-MCP-055`: grant resolution has five named cases and cases (b) "no entry means everything" and (c)
"empty list means nothing" must be **distinguishable in the resulting surface**. `REQ-MCP-004` and
`REQ-MCP-056`: denial outranks every grant. `REQ-MCP-057`: candidate spellings are the literal name
**plus** the unprefixed remainder under three provider prefixes — added, never substituted.
`REQ-MCP-005`: renaming applies only to survivors, makes the replacement the only callable name, and is
matched **against the server-reported name only** for disable and grant purposes — "renaming is a
presentation decision and never a permission decision". `REQ-MCP-006`: an entry's static `tools` list
is inert.

`REQ-MCP-043`: the normalised runtime description has an **exactly-equal key set** with one key absent
when the timeout is unset, "so a consumer can compare the description's key set against this list
exactly"; filtering, renaming and grants are applied *before* it is produced and are never expressed as
keys; a remote entry is never PATH-checked while producing it.

`REQ-MCP-061`: a persona's callable tool set is a **function of configuration alone**, and the identical
filtered set is observed whether the persona runs in a watched run or a background one. `REQ-MCP-009`:
resolving a persona's server set is side-effect free on configuration, including its argument list,
under repeated resolution. `REQ-MCP-117`: every ordered presentation uses ascending code-point order
over the raw string, case-sensitive and locale-independent, identical on every platform.

`REQ-MCP-101` and `REQ-MCP-102` fix the prompt rendering byte-exactly, and the printed names are exactly
the callable names after denial, grants and renaming. `REQ-MCP-044`: warnings reach the user through
exactly **two** channels — an 8-second warning toast and a persisted session issue with a fixed kind,
severity and actor. `REQ-MCP-107`: a launch failure whose cause chain holds an MCP connection error
produces **exactly one** diagnostic, never zero, never two.

`REQ-MCP-078`, `REQ-MCP-115` and `REQ-MCP-094`: enablement is consulted afresh at every persona
resolution, changing it mid-run never crashes the run and takes effect on the next iteration, and there
are exactly two controls and no third store — the durable field and a session-only desktop override
discarded at exit.

## Alternatives considered

**Connections — A: one pool serving all three paths with a cache policy per caller.** Faster, one place
that knows how to open a connection. Against: it makes `REQ-MCP-054` hard to honour and easy to
violate — a probe that reuses a session connection is not "contacting the server" in the sense the
requirement means — and it puts `REQ-MCP-047`'s memo and `REQ-MCP-054`'s explicit non-caching in the
same object with opposite policies.

**Connections — C: a supervisor per stdio server with automatic restart.** Robust; a crashed server
comes back. Against: `REQ-MCP-069` forbids it in terms, and automatic restart would break
`REQ-MCP-067`'s process count and make `REQ-MCP-054`'s "reports what it observes at that moment"
untrue.

**Configuration — A: resolve lazily at the point of use, emitting warnings where they arise.** Least
ceremony. Against: it makes the four de-duplication scopes into four ad-hoc caches scattered through the
code, makes `REQ-MCP-009`'s side-effect-freedom uncheckable, and makes `REQ-MCP-061`'s
function-of-configuration-alone a claim rather than a theorem.

**Configuration — C: validate with a schema library and let it produce the diagnostics.** Good for
shape. Against: the interesting defects are cross-field (stdio needs a command, remote entries need a
URL), **source-dependent in severity**, and deliberately lenient about unknown keys in the opposite
direction from the snapshot. A schema library is a good component inside the chosen design and a poor
replacement for it.

## Decision

**Three connection paths over one shared launch primitive** (ADR-0033's transport factory and the
nine-value identity function, both used by all three so launch behaviour is identical everywhere, which
is what `REQ-MCP-050` requires):

- `ToolDiscovery` — its own short-lived connection, memoised by the nine-value identity, with an
  **outer watchdog** giving the 35 s bound independently of the transport's own timeout.
- `HealthProbe` — its own connection every time, closed every time, 8-second budget, two outcomes,
  never raising, writing nothing into any cache.
- `SessionConnections` — the shared registry: a map from server name to a promise of a connected,
  hook-completed session, created under a **keyed single-flight** so two concurrent first-demands share
  one promise, plus a **shutdown latch** that makes post-shutdown requests fail, plus an idempotent
  `closeAll()`. Because the single-flight is keyed per server, "while one server is still starting,
  calls to already-connected servers complete without waiting" falls out rather than being arranged.

The connected-session value holds the client, the **unfiltered** tool list (so post-connect probes and
`REQ-MCP-064` are satisfied without a second listing), the current callable set per persona, the
**connect-time** callable set (retained so `REQ-MCP-060`'s "a name the update introduces shall not
become callable" can be enforced), and a warned-unreachable flag.

**Configuration resolution is a pure pipeline returning a value *and* a diagnostics list.** Each stage
— load discovered files, merge, resolve environment, resolve commands, compute availability, resolve
persona, describe for the backend, render the prompt section — is pure over its inputs. Every diagnostic
is a value carrying its severity, its de-duplication key and its **scope** (`load`, `process`,
`session`), and **one diagnostic sink** applies the scope rules and fans out to the two channels of
`REQ-MCP-044`. The fatal YAML case is "accumulate, then reject at the end", never "throw on the first",
because `REQ-MCP-002` requires every defect to be reported.

Two representation details this decision fixes:

- **Grants are `undefined` (no entry, unrestricted) versus the empty list (nothing), never collapsed**,
  so `REQ-MCP-055`'s cases (b) and (c) stay distinguishable through the whole pipeline.
- **All ordering uses an explicit code-point comparator.** Locale-aware collation is banned in this area
  by lint rule, because `REQ-MCP-117` requires identical order on every platform and under every
  locale, and the default sort's code-unit order differs from code-point order for astral characters —
  a real difference for a tool name containing an emoji, which is not hypothetical for MCP servers.

**Placement.** The MCP library is written with **no process assumptions and no Electron imports**, and
is instantiated in whichever process owns a session — the run host — while the settings surface
instantiates the discovery and probe paths in its own process. That is what `REQ-MCP-047` already
describes and permits: per-process, never-shared caching means a probe from the window and a discovery
inside a run are *supposed* to be independent observations, and `REQ-MCP-054`'s "reports the state of
the server at the moment it runs" endorses the difference. The alternative — one central MCP service
with the run calling tools over IPC — was rejected because it puts the run's tool latency and the
window's responsiveness on one channel, which `REQ-MCP-068` and `REQ-MCP-108`'s 100 ms budget both
press on.

## Consequences accepted

1. **Probing is more expensive than reusing a connection — deliberately.** The status-check control
   probes sequentially off the interface thread, which bounds the cost.
2. **An stdio server may be running twice at once** — once for a run's session, once transiently for a
   probe or a discovery. `REQ-MCP-067`'s one-process guarantee is scoped to the session's shared
   connection, so this is conformant, but it is surprising and must be documented for whoever writes a
   test that counts processes.
3. Two processes may hold different tool lists for one server, and that is correct behaviour rather
   than a bug.
4. Threading a diagnostics list through every stage is verbose, bought for testability of the
   requirements that matter most.
5. **`REQ-MCP-087` and `REQ-MCP-090` fix the precedence among the sources of the environment map but
   never say whether the resulting map replaces or overlays the parent environment.** Servers launched
   through package runners plainly need a search path, and `REQ-MCP-037` judges availability by a path
   lookup, so some inheritance is implied — but "some" is not a contract, and the SDK's own default is a
   curated safe subset, which would be a third behaviour. The signature of the environment-resolution
   stage differs depending on the answer, so this blocks that stage. See OQ-22.

## Revisit if

A requirement appears that makes probe results reusable, or that requires automatic reconnection — both
would contradict `REQ-MCP-054` and `REQ-MCP-069` as written; or all child-process spawning must be
centralised for sandbox or audit reasons, which would make the central-service shape required and would
need its latency concerns answered.
