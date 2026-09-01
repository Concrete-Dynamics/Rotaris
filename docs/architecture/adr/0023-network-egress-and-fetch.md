# ADR-0023 — Network egress and the `fetch` tool

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-09)
- **Depends on:** ADR-0002, ADR-0017, ADR-0018, ADR-0022

## Context

`REQ-SANDBOX-047`, `REQ-SANDBOX-059`, `REQ-TOOLS-117` and `REQ-TOOLS-094` establish **two enforcement
points with different mechanisms which must not be conflated**. For `fetch` — connections the product
makes itself — per-host allow/ask/deny with pre-connection classification. For terminal commands — a
static pattern recogniser at permission time, plus, only inside confinement, a **binary** network
on/off switch. Destination-aware filtering of terminal traffic is explicitly out of scope and the
limitation must be documented.

Host canonicalisation is a fixed function with required results (`REQ-SANDBOX-006` to
`REQ-SANDBOX-008`, `REQ-SANDBOX-013`, `REQ-SANDBOX-019`): lower-case; drop user-info; drop port;
unbracket IPv6; drop one trailing root dot; IDNA/punycode for non-ASCII, with Unicode and punycode
spellings interchangeable in both directions; where IDNA conversion does not succeed the trimmed
lower-cased original stands and is still compared literally; unreadable input yields the empty string,
the "unknown host", which classifies deny, matches no pattern and counts as remote.

Pattern grammar is exact-host or a single leading `*.` and nothing else (`REQ-SANDBOX-009` to
`REQ-SANDBOX-012`, `REQ-TOOLS-085`); matching advances whole DNS labels so a hit part-way through a
label never counts; `*.example.com` covers `api.` and `a.b.` but **not** bare `example.com`; any other
use of `*` is an error naming the pattern and showing the literal supported form.

Consultation order is denied list, then allowed list, then default disposition, so a specific denial
outranks a broader allow wildcard (`REQ-SANDBOX-014`, `REQ-SANDBOX-015`). The disposition vocabulary is
exactly `allow`, `ask`, `deny` with default `ask`, matched after trim and case-fold, any other spelling
refused at load and unable to be installed later by any route including the settings surface.

"Local" is **textual and performs no name resolution** (`REQ-SANDBOX-018`, `REQ-SANDBOX-019`,
`REQ-TOOLS-087`): the three loopback names, the whole `127.0.0.0/8` range, IPv6 loopback in any
spelling canonicalising to `::1`, and IPv4-mapped or compatible literals whose embedded address is in
`127.0.0.0/8`. Everything else is remote and gated, explicitly including `0.0.0.0`, `::`, private
ranges and link-local `169.254.169.254`. A name that resolves to loopback is still remote.

`REQ-SANDBOX-022`: classification happens **before any connection is opened**, for the named URL and
again for every redirect target; a denied host observes zero connection attempts and zero requests.
`REQ-SANDBOX-023`, `REQ-SANDBOX-024` and `REQ-TOOLS-090`: redirects are **never followed
automatically**; each hop is re-classified before it is fetched; the hop budget is 20.
`REQ-SANDBOX-031` specifies redirect resolution exhaustively.

`REQ-TOOLS-091` and `REQ-SANDBOX-027` to `REQ-SANDBOX-030`: the `ask` disposition belongs to the gate,
not the executor — by execution time the named host is already approved and pre-seeded as permitted
for that request; a hop onto a **new** host classifying `ask` is refused with `egress_redirect_denied`;
a hop onto an already-permitted host is not re-gated.

`REQ-TOOLS-092` and `REQ-SANDBOX-025` close the failure-kind vocabulary at eight spellings, with
`invalid_request` spelled identically to the terminal observation's member of the same name, and each
kind carrying a fixed `error_class`. `REQ-SANDBOX-020` refuses a malformed request **before any
connection** on six enumerated conditions, and carries `timeout: 0` through as given meaning *no time
limit* — the same reading `runtime.approval_timeout_seconds: 0` carries. `REQ-SANDBOX-021`,
`REQ-CONFIG-115` and `REQ-TOOLS-093` fix a three-level timeout precedence chain, with the built-in
10.0 s reachable **only** where there is no owning run, and whichever level supplied the value reported
as `timeout_seconds`. `REQ-SANDBOX-034` fixes response shaping as window-then-cap, with lines left out
by the window alone never setting `truncated`. `REQ-SANDBOX-036` fixes the model-facing rendering
structurally.

`REQ-SANDBOX-038`, `REQ-SANDBOX-118` and `REQ-TOOLS-089`: the policy is read from the owning run's
current **saved** configuration at each call; a saved edit takes effect on the following fetch with no
restart; unsaved settings-surface edits reach nothing. `REQ-SANDBOX-037`: a fetch with no run-scoped
configuration falls back to a fully permissive policy — not ungated overall, because permission-layer
gating still applies ahead of execution. `REQ-SANDBOX-042`: the URL itself is the gated subject of a
fetch permission decision, which is exactly why `REQ-TOOLS-015` selects `url` as a command facet.

## Alternatives considered

**A — Electron's `net` module (the Chromium network stack).** Honours system proxy configuration, has a
mature TLS stack, and exposes a redirect event that can cancel a hop. Against: it lives in main or in a
session-bound context, and ADR-0002 puts tool execution in the run host; `REQ-SANDBOX-022`'s promise
that a denied host observes **zero connection attempts** is easier to guarantee when our code decides
to open a socket than when it cancels a redirect a stack has already begun. Its proxy behaviour is also
a hidden third party in a promise about which host is contacted.

**B — The runtime's built-in `fetch` with manual redirect handling, driving the chain by hand.**
Chosen.

**C — A raw HTTP/HTTPS request implementation.** Maximum control, and it would make "zero connection
attempts" trivially auditable. Against: it re-implements TLS session handling, decompression, header
parsing and character-set handling for no requirement that asks for it, and every one of those is a
place to be wrong.

## Decision

**Alternative B**, structured as three separable pieces so each is testable without a network:

- **A pure classifier.** `canonicalizeHost(input)`, `matchPattern(pattern, host)`,
  `classify(policy, host)` and `isLocal(host)` — all pure, all table-tested against the worked examples
  the requirements state, which are numerous and exact. Canonicalisation uses the WHATWG URL parser
  plus its ASCII-domain conversion for IDNA; the IPv6 and IPv4-mapped canonicalisation falls out of
  WHATWG parsing, which normalises `::ffff:127.0.0.1` and `::ffff:7f00:1` to the same form.
- **A hand-driven redirect loop.** Classify, open one request with redirects disabled, and on a 3xx
  resolve the location per `REQ-SANDBOX-031`'s exhaustive rules, classify the **resolved absolute**
  URL, and loop, up to 20 hops. A per-request `permittedHosts` set is seeded with the named host and
  grows as hosts classify `allow`, so a hop back onto a permitted host is not re-gated. A new host
  classifying `ask` mid-chain is refused, because there is no way to prompt in flight.
- **A validation front door.** `REQ-SANDBOX-020`'s six conditions are checked before anything else and
  produce `invalid_request` with a null `status_code` and a detail naming the parameter, its value and
  the constraint. `timeout: 0` is carried as **no deadline**, so it must not be handed to a helper that
  treats 0 as already expired.

Shaping is applied after the body is decoded — window first, cap second, `truncated` set only by the
cap. Rendering is one function under a snapshot test, since the block names and the sorted-keys,
nulls-omitted rule are observable.

**`REQ-TOOLS-086` and `REQ-SANDBOX-006` disagree** about whether the canonical form of an IPv6 literal
is bracketed: the first says the normaliser re-brackets bare IPv6 literals, the second requires
`http://[::1]:9000/` to canonicalise to `::1`, unbracketed, as a stated required result. **The
recommended reading is `REQ-SANDBOX-006`**, which owns egress classification and states concrete
required results; see OQ-36. This must be resolved before the classifier is written.

## Consequences accepted

1. **Classification is textual**, so an allow-listed name resolving to a private, link-local or
   metadata address is permitted, and no DNS pinning or post-resolution check is performed. This is the
   specification's deliberate choice (`REQ-SANDBOX-018` says the test performs no name resolution) and
   it must be **documented on the settings surface rather than silently strengthened** — strengthening
   it would break the requirement.
2. **Proxy behaviour is unspecified** (OQ-37). The chosen client does not honour proxy environment
   variables by default, so choosing it makes "no proxy" the de facto answer. That is the fail-closed
   direction for the zero-connection promise, but it will surprise corporate users and should be an
   explicit decision rather than a library default.
3. **On native Windows there is no egress enforcement for terminal commands at all** — only
   `REQ-TOOLS-094`'s permission heuristic — because ADR-0022 has no backend there and the in-confinement
   switch is the only other control. That is a user-visible consequence of two requirements composing
   and it belongs in the product's documentation.
4. A loopback-proxy design that would give per-host filtering for terminal traffic on every platform
   was considered and is **rejected**: `REQ-SANDBOX-047` places destination-aware filtering of terminal
   traffic explicitly out of scope, and it would require TLS interception to be effective. If the
   product owner wants it, that is a scope change, not an implementation choice.
5. The permissive fallback for a fetch with no owning run is a real code path and must be exercised in
   tests, or it will rot into the only place an allow-everything policy is constructed.

## Revisit if

OQ-36 or OQ-37 resolves; or `REQ-SANDBOX-047` is reopened; or a requirement asks for egress control
over MCP servers' own network traffic, which nothing currently covers and which this design does not
reach.
