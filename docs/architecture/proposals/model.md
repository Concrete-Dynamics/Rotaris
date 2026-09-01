---
slice: MODEL
domains: ["04-model-providers-auth", "16-mcp-integration"]
status: proposal
date: 2026-08-31
---

# Architecture proposals — MODEL slice

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

## Part 1 — Extracted constraints

Labels: **HARD** — the specification fixes an observable only some designs can produce.
**HINT** — not fixed, but one design makes several requirements natural. **FREE** — implementation
choice. **CONFLICT** — two live requirements cannot both be satisfied as written; carried into the
open questions.

### A. Provider catalog

- **A1 — HARD.** Exactly six providers, fixed identifiers, fixed display names, fixed enumeration
  order with the hosted provider first; an unknown id is an error (`REQ-PROVIDER-001`,
  `REQ-PROVIDER-007`). The catalog is build data, not runtime state: nothing in the running product
  writes the availability attribute, and the "coming soon" marking of `concrete-cloud` is never
  flipped by a health check, a remote flag, configuration or a user action (`REQ-PROVIDER-006`).
  This forbids a catalog that is loaded from a mutable file or synchronised from a server, and it
  makes the catalog a frozen module-level constant with a compile-time-checkable shape.
- **A2 — HARD.** Each entry carries a closed attribute set, and integrity rules are enforced as
  errors rather than warnings: every entry declares a connection mode from
  `hosted-cloud | direct | local-sdk | custom`; hosted-cloud and direct entries must yield a
  non-empty destination host from their base URL; a `local-sdk` entry must declare *neither* a
  discovery endpoint nor a base URL; a custom-mode entry must not declare a fixed operator; an
  unavailable entry must supply a reason (`REQ-PROVIDER-002`, `REQ-PROVIDER-003`,
  `REQ-PROVIDER-004`). A build that violates any of these is rejected — so this is a build-time or
  start-time assertion, not a runtime tolerance.
- **A3 — HARD.** Absence must be representable distinctly from emptiness. For `claude-code` both
  the discovery URL and the base URL "are absent rather than holding a placeholder string … Asking
  this entry for a discovery URL or a base URL SHALL yield nothing; a code path that requires one
  SHALL fail before opening any connection rather than falling back to another entry's value"
  (`REQ-PROVIDER-005`). A design that models these as `string` with `""` as the empty case cannot
  produce the required failure; the type must make the absent case unconstructible into a request.
- **A4 — HARD.** Discovery URL and base URL are independent: `deepseek`'s discovery URL is
  deliberately not `<base>/models`, and the `<base>/models` derivation applies only to
  user-supplied `openai-compatible` instances (`REQ-PROVIDER-005`, `REQ-PROVIDER-053`).
- **A5 — CONFLICT.** `REQ-PROVIDER-002` declares the catalog attribute set closed. Three other live
  requirements add attributes to it: `REQ-CONFIG-370` names catalog fields `service_name`,
  `operator_name`, `destination_host` and a connection-mode vocabulary spelled
  `local-sdk | rotaris-cloud | direct | custom` (`rotaris-cloud`, not `hosted-cloud`);
  `REQ-CONFIG-371` renders a **Quick Start** action "only for a provider whose catalog entry carries
  a quick-start URL"; and `REQ-MONITOR-021` makes "whether a provider's quota is consumed by
  concurrent calls against a single account … a declared property of that provider's catalogue
  entry". See open question **OQ-1**.

### B. Credential store

- **B1 — HARD.** One JSON file per provider at
  `<per-user data dir for "rotaris">/tokens/<provider_id>.json`, five keys, 2-space indentation,
  tolerant load for three of them; the directory is never inside a workspace
  (`REQ-PROVIDER-014`, `REQ-PROVIDER-017`). `REQ-CONFIG-011` confirms credentials never appear in a
  configuration file. Note the data directory is *not* the configuration directory of
  `REQ-CONFIG-001` — the snapshot and the credentials live in different per-user roots.
- **B2 — HARD.** Protection is applied explicitly on every platform and never inherited. POSIX:
  directory `0700`, files `0600`, no group or other bit ever set. Windows: no POSIX bits set and
  none reported; an explicit ACL granting full control to the owning user and to LocalSystem and to
  nobody else, **with inheritance from the parent disabled**. If the protection cannot be applied
  the credential is not written and the failure names the store path (`REQ-PROVIDER-016`). The same
  protection covers the Copilot gateway staging directory (`REQ-PROVIDER-063`). Node's `fs.chmod`
  is a no-op for Windows ACLs, so this requirement forces a Windows-specific ACL mechanism — a
  concrete technology constraint, not a detail.
- **B3 — HARD.** Writes are atomic: staged in a temp file inside the credential directory whose
  name starts with the provider id and ends `.tmp`, mode `0600` on POSIX, renamed onto the target;
  a failed write deletes the temp file and reports; once any credential operation has finished the
  directory holds nothing but `<provider_id>.json` files (`REQ-PROVIDER-018`). The last clause is
  observable and rules out leaving orphaned temp files behind on crash-free failure paths.
- **B4 — HARD.** Every read-modify-write over a credential file *or* over the snapshot is performed
  while holding an exclusive lock on an adjacent lock file; acquisition failure after 5 seconds
  fails the operation with a retryable message and the operation never proceeds without the lock; a
  lock left by a dead process is reclaimed, a lock held by a live process is never broken; reads
  take no lock (`REQ-PROVIDER-152`). This is a cross-*process* lock, not an in-process mutex, and it
  is required because more than one application instance may run.
- **B5 — HARD.** A credential-status query performs no network I/O, is a function of the stored
  credential and the current clock alone, and returns one of `authenticated | unauthenticated |
  expired` — `refreshing` is in the vocabulary but is never returned (`REQ-PROVIDER-010`,
  `REQ-PROVIDER-059`). Two queries at the same clock reading must agree, which forbids any
  memoised, in-flight-request-derived or optimistic status.
- **B6 — HARD.** Per-provider classification rules differ and are not a shared predicate: Copilot
  reads `unauthenticated` when the refresh token is not `ghu_`-prefixed and `expired` within 60
  seconds of expiry (`REQ-PROVIDER-024`, `REQ-PROVIDER-027`); codex ignores granted scopes entirely
  and never refuses locally on scope grounds (`REQ-PROVIDER-034`); `claude-code` re-runs token
  *validation* as its status check (`REQ-PROVIDER-045`); DeepSeek is authenticated iff a key is
  stored (`REQ-PROVIDER-050`).
- **B7 — HARD.** The `sk-` key derived by the RFC 8693 token exchange lives in process memory only,
  is never written to the store, the snapshot, a log, an event or any other file, and is re-derived
  on rejection or process restart; a failed exchange fails that one model call and never invalidates
  the stored codex credential (`REQ-PROVIDER-035`).
- **B8 — HARD.** Bridge artifacts are rewritten as part of every credential save and are on disk
  before the save returns, so an external consumer can never read an older credential than the store
  holds; a failure to write one is a warning, never a failed save (`REQ-PROVIDER-061`,
  `REQ-PROVIDER-134`). Run-start priming also re-stages for a credential it found valid and did not
  renew.
- **B9 — HINT (strong).** Because the file path, the JSON key names, the indentation and the
  permission bits are all observable, the store cannot be an OS keychain, an encrypted blob, or a
  database. A plain-file store with an explicit permission/ACL step and a lock file is the only
  shape that satisfies B1–B4 together.

### C. Authentication flows

- **C1 — HARD.** Exactly three sign-in methods with a closed machine-readable vocabulary
  `device-code | browser-pkce | api-key`, one label each, used identically on every surface; a
  provider that resolves to no method has neither token nor label (`REQ-PROVIDER-008`,
  `REQ-PROVIDER-148`, `REQ-PROVIDER-009`).
- **C2 — HARD.** The application runs a local HTTP listener. For `codex` it binds `127.0.0.1` on a
  build-declared ordered port list — shipped as `1455, 1457` — tried in order, never any other port,
  path `/auth/callback`; every listed port busy fails the sign-in naming the ports tried
  (`REQ-PROVIDER-029`). For `concrete-cloud` it binds an **ephemeral** port with path `/callback`
  and also opens the system browser (`REQ-PROVIDER-039`). Other paths get HTTP 404, three distinct
  HTML result pages are rendered, and a state mismatch is treated as CSRF and yields no code
  (`REQ-PROVIDER-030`).
- **C3 — HARD.** However the wait ends — code received, cancelled, or timed out at 300 seconds — the
  listener is closed and its port released **before the sign-in call returns**, on every supported
  operating system, and a sign-in started immediately afterwards binds 1455 successfully
  (`REQ-PROVIDER-031`). This is a testable resource-lifetime guarantee, not best-effort cleanup.
- **C4 — HARD.** Cancellation must abort a pending device/PKCE wait early rather than waiting out
  the multi-minute timeout, and cancellation is raised from a UI Cancel button
  (`REQ-PROVIDER-116`, `REQ-PROVIDER-023`, `REQ-PROVIDER-031`). Authentication runs off the UI
  thread.
- **C5 — HARD.** A caller that cannot wait must get an outcome within 30 seconds; past it the
  attempt is failed, nothing is stored, and when the failure happens before any provider was
  contacted, the failure result is the *only* output — no traceback, warning or other diagnostic
  anywhere (`REQ-PROVIDER-013`). "No log line at all" is an observable a naive
  log-everything-then-return design violates.
- **C6 — HARD.** Device-code polling arithmetic is fixed: sleep `interval + 3.0` per cycle;
  `slow_down` adopts a positive integer server interval, otherwise adds 5 seconds; the resulting
  token must be `ghu_`-prefixed or the flow is rejected outright (`REQ-PROVIDER-023`,
  `REQ-PROVIDER-024`).
- **C7 — HARD.** OIDC discovery requires exact issuer equality and the presence of authorization,
  token and revocation endpoints; the endpoints are recorded in the credential extras so refresh and
  revocation work without re-discovery; a credential missing them refuses to refresh
  (`REQ-PROVIDER-038`, `REQ-PROVIDER-040`). Issuer and API base come from layered configuration and
  are overridden by `ROTARIS_OIDC_ISSUER` / `ROTARIS_API_BASE_URL` **in the environment the
  application was started with** (`REQ-PROVIDER-037`) — so the process environment must be captured
  at startup, not read lazily.
- **C8 — HARD.** The account id is derived by reading claims from an id token and then an access
  token, taking the first of three claim shapes present (`REQ-PROVIDER-032`). That means decoding a
  JWT payload without verifying it — a deliberate, narrow capability that must not be mistaken for
  token validation.
- **C9 — HARD.** `claude-code` mints nothing: every caller other than the paste-token sign-in fails
  with an instruction to run the external tool's `claude setup-token`, and its refresh makes no
  external call (`REQ-PROVIDER-044`, `REQ-PROVIDER-046`). Token validation is a fixed prefix ladder
  (`sk-ant-api` rejected as an API key, anything not `sk-ant-oat` rejected) (`REQ-PROVIDER-045`).
- **C10 — HARD.** Ordering invariant: for key-based providers the credential is persisted only
  *after* successful discovery, with exactly two named exceptions (`REQ-PROVIDER-133`,
  `REQ-PROVIDER-050`, `REQ-PROVIDER-052`, `REQ-PROVIDER-054`, `REQ-PROVIDER-108`). A registration
  whose snapshot write fails rolls back by deleting the just-saved credential
  (`REQ-PROVIDER-054`) — a two-store compensating action that has to be written deliberately.
- **C11 — FREE.** Exact wording of nearly every message; the specification fixes information content
  (resolution record item 5). The exceptions are the strings it quotes literally — for example
  `"Deleted stored tokens for <id>"`, `"Copilot session exchange failed: <detail>"`,
  `"Token poll HTTP <status>"`, `"Refusing to write snapshot: secret-like field detected: <path>"`.

### D. Model discovery

- **D1 — HARD.** Dispatch is per-provider, not uniform: `codex` uses a dedicated subscription
  endpoint with `client_version`, `originator`, `OpenAI-Beta` and conditional `chatgpt-account-id`
  headers (`REQ-PROVIDER-076`); `claude-code` returns a fixed offline catalog of exactly three
  aliases with **no network call and no HTTP status** (`REQ-PROVIDER-047`); everything else is a
  `GET` with `Authorization: Bearer` and `User-Agent: rotaris/discovery` at a 10-second timeout
  (`REQ-PROVIDER-069`). Copilot additionally requires the full editor-identity header set or the
  endpoint returns nothing usable, and swaps scheme and host to the tenant base while keeping the
  `/models` path (`REQ-PROVIDER-070`).
- **D2 — HARD.** The error mapping is **total**: timeout/transport, 401/403, ≥500, non-JSON body,
  non-object payload, absent-or-non-list `data`, non-object `data` entry, and every other non-2xx
  status each map to a stated outcome; 429 additionally conveys a rate limit; an empty `data` list
  is a *success* with zero models. "No response is left unclassified, and no unmapped status is
  silently treated as success" (`REQ-PROVIDER-071`). An error that came from an HTTP response also
  reports its status code, so the result type must carry an optional status alongside the message.
- **D3 — HARD.** Copilot catalog handling separates dropping from annotating: non-`chat` capability
  types are dropped; everything else is kept and annotated with `available | policy_disabled |
  no_supported_route` plus, when available, the chosen API mode. The payload *key paths* are build
  data declared once in a catalog-payload mapping (`REQ-PROVIDER-073`). Route choice is a fixed
  normalisation of advertised endpoints — trim, discard non-paths, prepend `/v1` when no `/v<digits>`
  prefix, dedupe first-occurrence — then chat wins over responses when both are present
  (`REQ-PROVIDER-074`).
- **D4 — HARD.** Canonical limit extraction reads a fixed key order for input and for output and
  takes the first *acceptable* value, where a boolean never qualifies whatever its numeric value and
  a float with a fractional part does not (`REQ-PROVIDER-078`). The known-limits table is keyed
  `provider/model` or `provider/`, with a lookup ladder that strips `-latest`, `-YYYY-MM-DD`,
  `-YYYYMMDD` and a DeepSeek four-digit suffix successively, reads `codex` and `copilot` as
  `openai`, and tries an `openai-compatible--<slug>` under its own id then the bare family
  (`REQ-PROVIDER-079`); it fills gaps only (`REQ-PROVIDER-080`).
- **D5 — HARD.** Tier assignment is deterministic and its determinism is the requirement: ties break
  on the lowest qualified id in ascending code-point order, so the same catalog always produces the
  same three picks whatever order discovery returned; the invariants (no `mini`/`nano` as large,
  distinct picks) hold whatever the preference lists say (`REQ-PROVIDER-081`). Gaps close in a fixed
  order, and a slot still empty takes the available model with the lowest qualified id — "defined
  for every catalog and independent of discovery order and of the snapshot's stored ordering"
  (`REQ-PROVIDER-082`). Only `available` models may fill a slot; unavailable ones are still written
  to the snapshot.
- **D6 — HARD.** Previously known models a refresh did not re-discover are **preserved** (sorted,
  appended) and counted separately, and every model row carries one shared ISO-8601 UTC discovery
  timestamp per refresh (`REQ-PROVIDER-083`). Refresh is therefore a merge, not a replace, and the
  preserved count is surfaced to the user (`REQ-PROVIDER-147`).
- **D7 — HARD.** Image-input declaration has a three-source precedence — explicit YAML, then the
  most recent successful discovery, then shipped model-capability metadata — with a later discovery
  replacing a discovery-or-metadata value but never an explicit YAML declaration; absent means "does
  not announce image input" everywhere; it is never inferred from a name (`REQ-PROVIDER-149`). Image
  token cost follows the same precedence and is ignored for a model that does not accept images
  (`REQ-PROVIDER-150`). The provenance of a value must therefore be retained, not just the value.
- **D8 — HARD.** Consumed remote contracts: unknown fields are accepted and ignored; a missing
  required value fails *that read* with the owning requirement's error and is never repaired by
  guessing; no read of a remote payload fails a run, deletes a credential, or changes a catalog
  attribute except where stated (`REQ-PROVIDER-151`). This forbids strict schema rejection on
  unknown keys for wire payloads — and note it is the exact opposite of the snapshot rule (E1).

### E. Snapshot persistence

- **E1 — HARD.** `project_settings.yaml` in the per-user configuration directory (`REQ-CONFIG-001`),
  `version: 1` with any other version rejected, **unknown keys rejected**, mapping keys emitted in
  written order rather than sorted, non-ASCII written literally, mode `0644`, atomic write, two
  reads with no write between them equal, a parse or schema violation failing the read with
  `"Invalid project snapshot at <path>: <detail>"` (`REQ-PROVIDER-084`, `REQ-PROVIDER-085`).
  Insertion-order-preserving, non-escaping YAML emission is a real library constraint.
- **E2 — HARD.** Every write is preceded by a scan of the whole payload and refused if anything
  secret-like is found — the key test of `REQ-TOOLS-172` plus two local triggers (a `session`
  segment, and `ghu_` appearing anywhere in a lower-cased key), and the value-prefix list of
  `REQ-TOOLS-171` compared case-insensitively at a token boundary. The refusal reports the *path* of
  the offending field. The exempt set is exactly two families — the two per-token price keys under
  `pricing` and the token-limit keys under `limits` — and no further key may ever be added to it
  (`REQ-PROVIDER-086`). A recursive walk that yields `(path, key, value)` triples is therefore
  required, and the exemption must be path-scoped rather than name-scoped.
- **E3 — HARD.** The snapshot is under the same cross-process lock as the credential store for
  upsert and remove (`REQ-PROVIDER-087`, `REQ-PROVIDER-152`).
- **E4 — CONFLICT.** `REQ-PROVIDER-072` maps the hosted provider's decimal-string per-token prices
  "to floating-point input/output cost per token", and the Data & Formats block types
  `input_cost_per_token` / `output_cost_per_token` as `<float>` — while `REQ-PROVIDER-121` states
  "every monetary amount the domain computes or displays is produced under it, **including the
  per-token pricing carried through discovery (REQ-PROVIDER-072)** … No amount is computed in binary
  floating point anywhere." The same format block types `image_cost_per_image` as a decimal string.
  See **OQ-2**.

### F. Configuration, routing and slots

- **F1 — HARD.** Seven capability slots with a single definition, a fixed unset-resolution chain
  (`fallback_model` ← `small_model`; `default_summary_model` ← `small_model`;
  `improvement_collector_model` ← `medium_model`; `gatekeeper_model` ← `small_model`, then
  `default_summary_model`, then `fallback_model`), literal slot names used in place of a model
  replaced during load, and an alias whose slot is empty resolving to `fallback_model` or else
  leaving the field unset with a validation warning — never failing the load (`REQ-PROVIDER-088`).
  Every resolution source is another slot and never a literal model name.
- **F2 — HARD.** `<slot>_thinking` accepts exactly `low | medium | high | max`; unset is the one way
  to say "the provider decides"; `auto` is explicitly not in the vocabulary and a configuration
  carrying it is rejected (`REQ-PROVIDER-088`). Which levels a model may legally take is derived
  from shipped model-capability metadata, and changing a model re-derives them and resets a
  now-illegal value to unset (`REQ-PROVIDER-137`, `REQ-PROVIDER-144`).
- **F3 — HARD.** A model's API mode is `chat | responses | unset`, filled by discovery and
  user-overridable, with a separate switch to disable the responses API; a Copilot model discovered
  as responses-only is invocable, its requests go to the responses endpoint, and it reports both
  per-token costs as zero (`REQ-PROVIDER-089`, `REQ-PROVIDER-092`). **Two request dialects against
  the same base URL, chosen per model, are mandatory** — not an optimisation.
- **F4 — HARD.** Unavailable models live in a separate map from usable models and *no code path can
  construct a model client from one*, while pickers still display the row with its reason
  (`REQ-PROVIDER-090`, `REQ-PROVIDER-075`). Making that unconstructible is a type-level obligation,
  not a runtime check scattered at call sites.
- **F5 — HARD.** Snapshot-into-configuration merge: authenticated snapshot providers seed the root
  slots; each snapshot model becomes a configured entry keyed by qualified id with a synthesized
  provider family, stripped model id, sign-in provider, base URL, limits, API mode and pricing; a
  user-authored YAML entry with a complete provider and model id **always** overrides; models marked
  unavailable land in the unavailable map unless the user named them in YAML; an invalid snapshot is
  ignored with a warning (`REQ-PROVIDER-091`, `REQ-PROVIDER-136`, `REQ-CONFIG-207`).
- **F6 — HARD.** A configured model naming a sign-in provider is dispatched with a credential from
  the store, never a static key, and an expired credential is renewed *before the request leaves*
  (`REQ-PROVIDER-092`). Credential acquisition is therefore inside the request path, not a
  precondition checked earlier.
- **F7 — HARD.** The session model override outranks both the active model and the persistent slot
  for every call it covers; clearing it restores the persistent value and has no other effect; it is
  never written to `.rotaris/agents.yaml`, never merged into the snapshot, and never outlives the
  session (`REQ-PROVIDER-122`, `REQ-PROVIDER-146`).
- **F8 — HARD.** Startup recovery: a load that fails because a configured model entry is incomplete
  triggers exactly one non-interactive bulk refresh and one retry, at most once per load attempt
  (`REQ-PROVIDER-110`).
- **F9 — CONFLICT.** `REQ-CONFIG-095` fixes per-provider `max_parallel` defaults by name —
  `deepseek` → 3, `claude-code` → 2, everything else unlimited — while `REQ-MONITOR-021` states the
  cap is a *declared property of the catalogue entry* yielding a uniform automatic cap of 2, and
  `REQ-PROVIDER-049` explicitly disclaims holding "a list of provider names that carry one". See
  **OQ-3**.

### G. Run-time credential lifecycle

- **G1 — HARD.** The priming set is the union of the sign-in providers behind all slot models, all
  personas, and every configured model — all primed regardless of which personas the run uses
  (`REQ-PROVIDER-066`).
- **G2 — HARD.** One priming pass at run start. Within the 300-second refresh margin, an
  *unconditional renew* is performed rather than a token fetch, because a fetch would hand back a
  still-valid but nearly expired token (`REQ-PROVIDER-058`, `REQ-PROVIDER-067`). Failures collect
  into an unresolved map with reasons and are logged as warnings — priming never fails the run.
- **G3 — HARD.** The run is wrapped in a keep-fresh scope that checks at least every 60 seconds for
  its whole duration; credentials with no expiry are never renewed on that schedule; a credential
  already unresolved at run start is not retried and is reported once in the opening report; a
  failed check warns and the remaining providers are still checked; **no refresh happens after the
  run ends** (`REQ-PROVIDER-068`). Scope-bounded lifetime, cancellable, with a report value.
- **G4 — HARD.** Every failure path records a retrievable per-provider last error and every success
  clears it (`REQ-PROVIDER-057`, `REQ-PROVIDER-058`, `REQ-PROVIDER-060`). This is durable-enough
  in-process state read by the provider list and settings.

### H. Money, percentages and usage

- **H1 — HARD.** One money rule for the whole domain: exact decimal arithmetic, never binary
  floating point; balances rounded *down* toward negative infinity, every other amount half-up; 2
  decimal places, or 4 when the magnitude is below $0.01; `$`/`€`/`£` for USD/EUR/GBP and
  `<amount> <CODE>` otherwise (`REQ-PROVIDER-121`). It covers per-token pricing and any image
  pricing (`REQ-PROVIDER-150`). Balance is computed as `balance_atomic ÷ atomic_scale` in exact
  decimal arithmetic (`REQ-PROVIDER-130`).
- **H2 — HARD.** Percentages clamp to 0–100 then round half-up to a whole number, one rule for every
  percentage the domain displays; reset labels have fixed formats
  (`in <1m`, `in Xd[ Yh]`, `in Xh[ Ym]`, `in Xm`, `<Mon> <day>`); numeric parsing accepts integers,
  floats and comma-grouped strings and **rejects booleans** (`REQ-PROVIDER-127`).
- **H3 — HARD.** Subscription usage supports exactly `codex`, `copilot`, `claude-code`; 5-second
  timeout; redirects followed; all failures raise a dedicated error type; nothing is retried at that
  layer (`REQ-PROVIDER-123`). Fetches run concurrently, one worker per provider, so startup waits at
  most one provider timeout, and a failure degrades to a fixed placeholder row that stays visible
  (`REQ-PROVIDER-119`).
- **H4 — HARD.** Copilot usage must authenticate with the durable `ghu_` token from the credential's
  refresh-token field; the short-lived model bearer "is not accepted here, so it is never sent"
  (`REQ-PROVIDER-125`). A single "the credential's access token" abstraction cannot express this.
- **H5 — HARD.** Credit is read once on window open, every 120,000 ms while the window is open, and
  on demand; **at most one read is outstanding**, and a refresh asked for during a read is declined
  and starts nothing (`REQ-PROVIDER-121`). Single-flight with drop-not-queue semantics. The Loading
  rendering appears only when no balance has yet been shown; once a balance is on screen it stays
  until replaced (`REQ-PROVIDER-120`).
- **H6 — HARD.** The credit `state` maps to `available | exhausted | overdrafted` with unknown
  backend values degrading to `unknown` for forward compatibility, and a partially unusable
  latest-usage record is dropped rather than failing the whole read (`REQ-PROVIDER-130`).
- **H7 — HARD (cross-domain).** Token counts must come from the provider where available: the
  compression trigger "prefers the real last-prompt token count reported by the model provider" and
  records which source it used (`REQ-MONITOR-081`); per-agent metrics persist token usage and cost
  (`REQ-MONITOR-102`); `usage.update` carries cumulative `tokens` and `cost` objects and is not
  emitted when it would carry no figures (`REQ-EVENTS-053`). The model call must therefore surface
  per-call usage, and the layer above must accumulate.

### I. Secret hygiene

- **I1 — HARD.** One shared redaction pass, owned by `REQ-TOOLS-171`, backs the log, the event
  stream, error text, persisted documents and hook payloads; no venue carries rules of its own;
  domain 04 and domain 16 explicitly hold no second copy (`REQ-PROVIDER-131`, `REQ-MCP-081`). The
  marker is `***`; the display mask is `****` for ≤4 characters and `first2 + **** + last2`
  otherwise, with a fixed-width middle so a rendering never discloses length; the two are never
  substituted for one another (`REQ-TOOLS-171`).
- **I2 — HARD.** The display mask is the *only* user-interface rendering of a stored key anywhere in
  domain 04, and no surface offers a control that would reveal one (`REQ-PROVIDER-107`,
  `REQ-PROVIDER-140`). For MCP secrets the substitution is **unconditional** — it does not depend on
  the key looking secret or the value carrying a recognized prefix, because presence in the store is
  what establishes it as a credential — and no reveal control and no clipboard path exists
  (`REQ-MCP-081`, `REQ-MCP-109`).
- **I3 — HINT (strong).** Because the snapshot screen (E2) refuses the write outright while the text
  pass masks, and because both read the same key test and prefix list, the shared module must expose
  the *predicates* separately from the *transformations*.

### J. MCP configuration model

- **J1 — HARD.** The server-entry schema is closed and singly defined — fifteen fields with stated
  types and defaults — and a document that presents, validates, stores, merges or documents an entry
  cites it rather than restating (`REQ-MCP-001`, with `enabled` behavior at `REQ-CONFIG-465`).
- **J2 — HARD.** Defects behave differently by source: a defect in a YAML-scope entry fails the
  configuration load and **every** defect is reported, not only the first; the same defect in an
  `mcp.json` entry drops that entry alone with a warning and never fails the load
  (`REQ-MCP-002`, `REQ-MCP-023`). Validation must therefore accumulate diagnostics and be
  parameterised by source severity.
- **J3 — HARD.** `request_timeout` is per call, measured from dispatch to receipt of result, uniform
  across that server's tools, does not govern discovery or probing, defaults to 300 seconds, and a
  zero/negative/non-whole value is rejected at load rather than treated as unset. Exhaustion yields
  a failed tool result the agent receives, a `failed` tool row, an open and still-usable connection,
  and a run that continues; the product does not retry (`REQ-MCP-003`).
- **J4 — HARD.** Name algebra: candidate spellings are the literal name **plus** the unprefixed
  remainder when the name begins `<server>_`, `mcp-<server>-` or `mcp__<server>__` — added, never
  substituted (`REQ-MCP-057`). Denial by `disabled_tools` outranks every grant (`REQ-MCP-004`,
  `REQ-MCP-056`). Renames apply only to survivors, leave descriptions unchanged, make the
  replacement the only callable name, and are matched **against the server-reported name only** for
  disable and grant purposes — "renaming is a presentation decision and never a permission decision"
  (`REQ-MCP-005`). Two collisions are configuration errors.
- **J5 — HARD.** The static `tools` list on an entry has no effect on what is advertised or callable
  (`REQ-MCP-006`) — it exists in the schema and is inert.
- **J6 — HARD.** Grant resolution has five named cases and cases (b) "no entry → everything" and (c)
  "empty list → nothing" must be **distinguishable in the resulting surface** (`REQ-MCP-055`). A
  representation that collapses "absent" and "empty" cannot produce this.
- **J7 — HARD.** Three shipped defaults with fixed names, transports, enablement and — for
  `web_search` — a 600-second timeout; only `code_intelligence` is enabled; no field beyond those
  named may be set on them (`REQ-MCP-010`, `REQ-CONFIG-181`). No `lsp` and no git-inspection server
  ships (`REQ-MCP-012`, `REQ-MCP-013`).
- **J8 — HARD.** Exactly one **code-intelligence binding manifest** is the single place the pinned
  runtime's identifiers are written — distribution id, pinned `MAJOR.MINOR.PATCH`, transport and
  mode arguments, launch subcommand, both project-selection options, marker file name, the three
  setup subcommands, the indexable extension list, and the four tiers' tool names plus three
  never-grant names. It is not user-editable, is not read at run time from any location a user can
  write, and does not vary by workspace (`REQ-MCP-116`). Build checks verify tier cardinalities
  (10/7/2/1), pairwise disjointness, absence of never-grant names, and that every name is reported
  by the pinned runtime's `tools/list`; a failing build must not ship (`REQ-MCP-015`,
  `REQ-MCP-011`, `REQ-MCP-095`).
- **J9 — HARD.** Merge order is defaults → discovered → global YAML → workspace YAML, field-wise for
  same-named entries, with a machine-maintained origin map recording `yaml | discovered-project |
  discovered-user | default` that is never user-settable (`REQ-MCP-025`, `REQ-MCP-026`,
  `REQ-MCP-008`).
- **J10 — HARD.** `mcp.json` files are consumed strictly read-only and must be **byte-for-byte
  identical** after any number of loads; an unrecognised key inside an entry is warned about at most
  once per (file, server, key) per load and does *not* skip the entry (`REQ-MCP-027`). Warning
  de-duplication is per load, not per process — a different scope than the once-per-process rules
  elsewhere in the domain (`REQ-MCP-041`, `REQ-MCP-048`, `REQ-MCP-058`). Discovery reads at most two
  files at fixed platform locations, skipping user-level discovery entirely when `APPDATA` is unset
  (`REQ-MCP-017`).
- **J11 — HARD.** Command resolution is an ordered rule set in which the reserved token
  `builtin:code-intelligence` is recognised **before every other rule** and is never looked up on
  PATH (`REQ-MCP-033`), path-like forms are never rewritten (`REQ-MCP-028`), a fixed 23-name
  known-executable set passes through (`REQ-MCP-029`), `uvx:` / `npm:` / `@scope` shorthands expand
  (`REQ-MCP-030`, `REQ-MCP-031`), and any other bare name passes through with no guessing
  (`REQ-MCP-032`).
- **J12 — HARD.** The normalized runtime description has an exactly-equal key set with `timeout`
  absent when `request_timeout` is unset, "so a consumer can compare the description's key set
  against this list exactly"; filtering, renaming and grants are applied *before* it is produced and
  are never expressed as keys; a remote entry is never PATH-checked while producing it; and **it is
  produced for every agent backend the product supports — a backend that cannot be given external
  tool servers is not a supported backend** (`REQ-MCP-043`).
- **J13 — HARD.** One ordering rule for every ordered presentation in the domain: ascending
  code-point order over the raw string, case-sensitive, locale-independent, identical on every
  platform (`REQ-MCP-117`). This forbids `String.prototype.localeCompare` and forbids `Intl`
  collation anywhere in this domain.

### K. MCP runtime

- **K1 — HARD.** Discovery is `initialize` then `tools/list` over the configured transport with a
  30-second default, and **every** request returns no later than the timeout plus 5 seconds,
  for every caller and every surface; an outstanding discovery must never delay process exit past
  that bound (`REQ-MCP-046`, `REQ-MCP-053`). A watchdog independent of the transport's own timeout
  is required.
- **K2 — HARD.** Discovery is memoised on an identity of exactly nine values — name, `type`,
  `command`, `args`, `env`, `cwd`, `url`, `headers`, workspace root — and a difference in any one
  re-interrogates; a configuration reload invalidates every entry. It is **per process and never
  shared**: never written to disk, never cached across launches, never coordinated between
  instances, and two instances may legitimately hold different tool lists (`REQ-MCP-047`).
- **K3 — HARD.** Discovery failure never raises: it returns an empty list, warns at most once per
  identity, and remembers the failure so later persona resolutions can warn (`REQ-MCP-048`,
  `REQ-MCP-042`). A stdio teardown error *after* the list was received is ignored and logged at
  debug; before, it is a failure (`REQ-MCP-051`).
- **K4 — HARD.** A health probe is deliberately uncached: probing n times contacts the server n
  times, no probe reports a carried-over outcome, it returns within 8 seconds, never raises, leaves
  discovery state untouched, and still runs for a server whose discovery failed (`REQ-MCP-054`).
  Probe and discovery must not share a connection or a cache.
- **K5 — HARD.** Exactly one shared connection per server per session — and for `stdio`, exactly one
  server process — opened on first demand, reused by every agent, closed exactly once at session end
  (lock release or application exit). Two concurrent requests for the same server yield one
  connection; while one server is starting, calls to already-connected servers must complete without
  waiting; a request after shutdown fails naming the server and leaves nothing open; releasing a
  superseded connection leaves the current one usable; shutdown is idempotent (`REQ-MCP-066`,
  `REQ-MCP-067`). This is a keyed single-flight registry with a shutdown latch.
- **K6 — HARD.** A child conversation ending leaves connections and stdio processes alive for the
  next child. Concurrent calls over one connection all complete and each receives its own response,
  and **the session keeps emitting its events while a call is outstanding** — `tool.start` is
  observable before the call returns and every other catalog event is emitted at its normal point,
  however many calls are outstanding (`REQ-MCP-068`). This forbids serialising a connection behind a
  mutex and forbids blocking the event pump on a tool call.
- **K7 — HARD.** Post-connect hooks read the **unfiltered** tool list so no grant configuration can
  disarm them (`REQ-MCP-064`). The `lsp` init hook is keyed on the *configured name* `lsp` and a
  reported tool `lsp_init`, 15 seconds, and on failure that server contributes nothing to the
  triggering agent but a later agent retries from scratch (`REQ-MCP-070`). The code-intelligence
  binding probe is keyed on the built-in name, matches the memory-listing tool by trailing segment,
  15 seconds, and on failure warns but leaves the connection open and the tools offered
  (`REQ-MCP-071`).
- **K8 — HARD.** A mid-run `tools/list` update recomputes the callable set by the same decision and
  may only ever **narrow** it: a withdrawn or now-denied name stops being callable immediately, a
  newly introduced name never becomes callable for the rest of that connection, and an update in
  which nothing survives empties that server's contribution. Narrowing does not close the
  connection, fail the run, or re-render the prompt (`REQ-MCP-060`, `REQ-MCP-062`).
- **K9 — HARD.** A server that becomes unreachable after connecting is handled per call and never by
  failing the run: the call in flight fails like an exhausted allowance, one warning per server per
  session, **no retry and no automatic reconnection**, and a later call may re-establish the
  connection and succeed (`REQ-MCP-069`).
- **K10 — HARD.** Windows `stdio` launch guarantee, stated as a host condition to be tested
  negatively: the application is a graphical process owning no console whose own standard streams may
  be absent, closed, or not usable pipes. The product creates the child's three standard streams
  itself for every launch, never inherits or reuses the parent's, never requires a console to exist,
  and never allocates or shows one — **no console window at any point**. The same rule applies on
  every platform and to the reserved token's child, which is the application's own executable
  (`REQ-MCP-113`).
- **K11 — HARD.** The reserved token resolves to the bundled server: in a frozen installation
  "through the application's own executable with the same token `builtin:code-intelligence` as its
  first argument"; such a process answers MCP on its standard streams, **presents no user interface,
  opens no window**, and terminates with the server's own exit status (`REQ-MCP-033`).
- **K12 — HARD.** Warnings reach the user through exactly two channels — an 8-second warning toast
  and a persisted session issue with kind `mcp_config`, severity `warning`, actor `orchestrator`
  (`REQ-MCP-044`). A launch failure whose cause chain holds an MCP connection error produces
  **exactly one** diagnostic — never zero, never two — chosen by the first of two cases
  (`REQ-MCP-107`).
- **K13 — HARD.** Prompt rendering is byte-exact where it is stated: `_No MCP servers configured._`
  as the entire body when nothing is active; `` `name` `` for a server with no known tools versus
  ``**`name`**`` for one with tools; `- `, code-formatted tool name, and ` — ` before a non-empty
  description; both levels ordered by J13; and the printed names are exactly the callable names
  after denial, grants and renaming (`REQ-MCP-101`, `REQ-MCP-062`). The memories protocol block is
  gated on two specific grants and must carry the same characters in the same order in every prompt
  that has it (`REQ-MCP-102`).
- **K14 — HARD.** Enablement is consulted afresh at every persona resolution; changing it mid-run
  never crashes the run and takes effect on the next iteration (`REQ-MCP-078`). There are exactly
  two controls and no third store: the durable `enabled` field and a session-only desktop override
  discarded at exit (`REQ-MCP-115`, `REQ-MCP-094`).

### L. MCP secrets and environment

- **L1 — HARD.** `secrets.yaml` per scope beside `agents.yaml`, atomic writes with parent directories
  created; unreadable/invalid/non-mapping loads as empty; non-mapping server values skipped; keys
  and values coerced to strings; an empty key or empty coerced value skipped at load with a warning
  and **refused** at write, so masking's shortest input is one character (`REQ-MCP-082`,
  `REQ-MCP-084`). Merged view is global then workspace with workspace winning (`REQ-MCP-083`).
- **L2 — HARD.** Environment resolution happens **during loading**, so agent construction, discovery
  and probes all see the same resolved values: a value that is exactly `${VAR}` is replaced from the
  process environment and the key is **omitted entirely** when the variable is unset — the literal
  placeholder is never passed to a server; any other value is kept as-is; stored secrets overlay
  last and always win (`REQ-MCP-087`, `REQ-MCP-090`). For remote servers `${VAR}` inside the URL is a
  *substring* substitution with stored secret before process environment, and an unresolvable
  placeholder stays literal with a warning (`REQ-MCP-088`) — which is how the `web_search` entry is
  marked unavailable until the key is supplied (`REQ-CONFIG-181`, `REQ-CONFIG-225`).
- **L3 — OPEN.** Whether the spawned child inherits the parent process environment beyond the
  resolved `env` map is not stated anywhere in domain 16. See **OQ-5**.

### M. Setup and packaging

- **M1 — HARD.** Warm-step derivation is fully specified: only `stdio` entries whose resolved
  command *file name* matches `uvx | uvx.cmd | npx | npx.cmd` **case-insensitively on every
  platform**; per-family package extraction rules; the `uvx` executable argument taken from the
  first resolved argument after the spec that does not begin with `-`, with the step omitted rather
  than guessed when there is none; `npx` resolved to an absolute path and the step omitted when
  `npx` is absent; ids `warm:<family>:<package>`, labels `Warm <package>`, capability tag
  `"<server> MCP server"`, duplicates collapsed to one step (`REQ-MCP-096`).
- **M2 — HARD.** Project setup runs three ordered steps at 300 / 1800 / 120 seconds with UTF-8 child
  encoding, 0.25-second polling, a 5-second terminate grace then force-kill (on Windows the whole
  process tree), failing output truncated to its **last** 400 characters, and the status vocabulary
  `succeeded | failed | skipped-no-code | not-attempted` with a failure stopping the steps that
  follow (`REQ-MCP-099`).
- **M3 — HARD.** "Contains code" is a bounded filesystem walk honoring version-control ignore rules,
  traversing non-excluded dot directories, following no symlink out of the workspace, stopping at
  the first qualifying file, performed once per setup run and reused for both gated steps
  (`REQ-MCP-099`).
- **M4 — HARD.** The command line for setup is *derived* from the configured entry — resolved
  command plus exactly the argument prefix preceding the launch subcommand — and no substitute
  command may be used; a remote entry, an empty command, or arguments with no launch subcommand
  produce a non-retryable failure (`REQ-MCP-036`).
- **M5 — HARD.** Workspace binding appends exactly two arguments (the project-path option and the
  run's workspace root) at the end when the args contain the launch subcommand and no
  project-selection argument, matched on the launch subcommand alone independently of the entry's
  name; a server launched with a project path must not advertise its project-switching or
  configuration-introspection tools (`REQ-MCP-034`). For an isolated working tree the appended path
  is that tree's root, so binding is per-run, not per-configuration.
- **M6 — CONFLICT.** `REQ-MCP-033` specifies the sentinel argv branch as answering "the MCP protocol
  as the code-intelligence server on its standard streams", while `REQ-MCP-036` + `REQ-MCP-099`
  require the same derived command to accept the runtime's `create`, `index` and memory
  subcommands. See **OQ-6**.

---

## Part 2 — Open questions

These are places where the specification is genuinely silent or where two live requirements
disagree. None is invented requirement; each is raised so the gap is decided rather than guessed.

- **OQ-1 — The provider catalog attribute set is declared closed but is extended by three other
  requirements.** `REQ-PROVIDER-002` fixes the attribute set and `REQ-PROVIDER-003` rejects a build
  that violates it. `REQ-CONFIG-370` names `service_name`, `operator_name` and `destination_host`
  as catalog fields and spells the hosted connection mode `rotaris-cloud` where `REQ-PROVIDER-002`
  spells it `hosted-cloud`; `REQ-CONFIG-371` requires a quick-start URL on the entry;
  `REQ-MONITOR-021` requires a declared concurrency-quota property. **Ask:** is
  `REQ-PROVIDER-002`'s set to be extended with these four (recommended, since three other domains
  depend on them), and which spelling of the hosted mode is canonical? A single spelling matters
  because `REQ-CONFIG-371` branches on it to decide availability.
- **OQ-2 — Per-token prices: float in the format, exact decimal in the arithmetic.**
  `REQ-PROVIDER-072` maps the hosted provider's decimal-string prices to floating-point, and the
  snapshot format types them `<float>`, while `REQ-PROVIDER-121` states that no monetary amount —
  "including the per-token pricing carried through discovery (REQ-PROVIDER-072)" — is computed in
  binary floating point anywhere. The same format block already types `image_cost_per_image` as a
  decimal string. **Recommended reading, subject to confirmation:** the price is carried and
  persisted as a decimal string like the image price, and `<float>` in `REQ-PROVIDER-072` and in
  the format block is the defect, because a value that has already been through a binary float
  cannot afterwards be made exact. Confirm before implementation; this changes a persisted format.
- **OQ-3 — Per-provider concurrency defaults are stated twice, differently.** `REQ-CONFIG-095`
  gives `deepseek` → 3 and `claude-code` → 2 by name; `REQ-MONITOR-021` gives a uniform automatic
  cap of 2 to any provider whose catalogue entry declares the quota-sharing property and explicitly
  refuses to hold a list of names; `REQ-PROVIDER-049` disclaims holding one too. **Ask:** does the
  catalogue property carry a *number* (letting DeepSeek declare 3) or a *boolean* (making the cap
  uniformly 2 and `REQ-CONFIG-095`'s figure of 3 stale)? A number resolves both cleanly.
- **OQ-4 — Do tool calls made by a `claude-code`-backed agent pass through the product's permission
  engine and event stream?** `REQ-PROVIDER-117` says the product "invokes the Claude Agent SDK
  installed locally; traffic goes through that SDK", `REQ-PROVIDER-049` describes an external
  local-runtime subprocess, and `REQ-MCP-043` requires the normalized server description to be
  produced "for every agent backend the product supports". No requirement states whether the
  approval flow of domain 05, the `tool.start` / `tool.finish` events of `REQ-EVENTS-041`, and the
  transcript rows of domain 03 are produced for tool calls that the external runtime performs
  itself. This is the largest unresolved question in the slice; it decides whether `claude-code` is
  a model or a whole agent, and it is likely an **ESCALATE** (see ADR-MODEL-01, alternative C).
- **OQ-5 — Does a spawned MCP `stdio` child inherit the parent process environment?**
  `REQ-MCP-087` and `REQ-MCP-090` fix the precedence among the sources of the `env` map but never
  say whether the resulting map replaces or overlays the parent environment. Servers launched via
  `npx` / `uvx` plainly need `PATH`, and `REQ-MCP-037` judges availability by a `PATH` lookup, so
  some inheritance is implied — but "some" is not a contract, and the official MCP SDK's default is
  a curated safe subset rather than the full parent environment, which would be a third behavior.
  **Ask:** state the rule explicitly.
- **OQ-6 — The `builtin:code-intelligence` sentinel must do more than serve stdio.**
  `REQ-MCP-033` describes the sentinel argv branch only as an MCP server on standard streams, but
  `REQ-MCP-036` derives a command line from the same entry and `REQ-MCP-099` runs it with the
  runtime's `create`, `index` and memory subcommands. **Recommended reading:** the sentinel branch
  is a general pass-through to the bundled runtime, and `REQ-MCP-033` describes what happens when
  the remaining arguments select the server. Confirm, because it changes what the packaged binary's
  early-argv branch must do.
- **OQ-7 — What "shipped model-capability metadata" is.** `REQ-PROVIDER-137` and
  `REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
  reasoning-effort parameter is supported, which levels are disclaimed, and whether images are
  accepted. Nothing states where it comes from, how it is keyed, or how it is updated. Treating it
  as build data alongside the known-limits table of `REQ-PROVIDER-079` is the obvious reading, but
  it is a third table of third-party model facts and its update policy should be decided
  deliberately.
- **OQ-8 — `REQ-PROVIDER-013`'s "no diagnostic anywhere" versus ordinary logging.** The 30-second
  non-interactive attempt that fails before contacting a provider must produce the failure result
  and nothing else — no traceback, warning, or other diagnostic in the log or the interface. Every
  other failure path in the domain records a per-provider last error (`REQ-PROVIDER-057`).
  **Ask:** does the last-error record count as "shown anywhere in the interface"? Read literally it
  does, so this one path must skip it.

---

## Part 3 — ADR proposals

Numbering is provisional; the synthesis step assigns final numbers.

---

### ADR-MODEL-01 — The internal model boundary is two ports, not one

**Decision to be made.** The product decision fixes that feature code never calls a vendor SDK
directly and that an internal abstraction sits in between. It does not fix *where* that boundary is
drawn. The choice is whether the abstraction is a single language-model port that every provider
including `claude-code` is adapted to, or a pair of ports at two different levels.

**Constraints that bear on it.**

- `claude-code` is not an HTTP model endpoint. Its catalog entry declares no discovery URL and no
  base URL at all, and a code path that requires one must fail before opening any connection
  (A3, `REQ-PROVIDER-005`). It is reached by invoking a locally installed agent SDK as a subprocess
  with the token injected as `CLAUDE_CODE_OAUTH_TOKEN` (`REQ-PROVIDER-049`), preceded by a
  conflicting-credential precheck run "before every subscription-runtime prompt"
  (`REQ-PROVIDER-048`), and its destination host is empty (`REQ-PROVIDER-004`). The desktop tells
  the user in as many words that "Rotaris invokes the Claude Agent SDK installed locally; traffic
  goes through that SDK" (`REQ-PROVIDER-117`).
- `REQ-MCP-043` speaks of "every agent backend the product supports" and forbids any run path from
  substituting a backend that silently drops the MCP surface (J12). The specification therefore
  already assumes more than one backend exists.
- The same run-level machinery must work across backends: per-child hard timeout with one retry on
  the role's fallback model (`REQ-ORCH-088`), unresponsive-model fallback keyed on "before ANY model
  event has been received" (`REQ-ORCH-090`), token usage and cost per agent (`REQ-MONITOR-102`),
  and the provider's own last-prompt token count preferred over an estimate (`REQ-MONITOR-081`).
- Unavailable models must be unconstructible into a client (F4, `REQ-PROVIDER-090`); a model with a
  sign-in provider takes its credential from the store at dispatch and renews an expired one before
  the request leaves (F6, `REQ-PROVIDER-092`).

**Alternative A — one port: `LLM` is a streaming language-model call, and `claude-code` is adapted
to it.** The port is roughly "given messages, tools, and options, produce a stream of text,
reasoning, tool-call and usage parts". The `claude-code` adapter spawns the external runtime, drives
it, and translates its output back into that stream.

*For:* one interface for the whole product; the run loop, permission engine, transcript and event
stream are written once; `REQ-MCP-062`'s prompt/callable equality and the approval flow apply
uniformly because the product still owns the loop.
*Against:* the adaptation is a fiction. The external runtime runs its own turn loop, calls its own
tools and manages its own context; pretending it is a single stateless model call means either
re-entering it per turn (throwing away context the product cannot reconstruct) or buffering an
entire agent session behind one "call", which breaks `REQ-ORCH-090`'s "before any model event has
been received" trigger and makes per-call usage accounting a fiction.

**Alternative B — two ports: `ModelClient` below, `AgentBackend` above.** `ModelClient` is the
streaming language-model call and is what the Vercel AI SDK (or direct HTTP) sits behind.
`AgentBackend` owns a turn: given a persona, a prompt, a tool surface and a set of normalized MCP
server descriptions, it emits the run's event vocabulary and returns a result. The product ships
one default `AgentBackend` implemented over `ModelClient` — that is the backend every HTTP provider
uses — and a second `AgentBackend` for `claude-code` that supervises the external runtime.

*For:* it names what is actually there. `REQ-MCP-043`'s "every agent backend" becomes a real
interface with a real conformance obligation. `claude-code` never has to pretend to have a base URL,
so A3 falls out of the type rather than being enforced by a guard. The `ModelClient` port stays
small and honest, which is what makes ADR-MODEL-02's SDK choice reversible.
*Against:* two backends mean two implementations of the run-level obligations — event emission,
usage accounting, timeout and fallback behavior — and a real risk that the external-runtime backend
silently produces a thinner event stream. That risk must be answered by a shared conformance test
suite both backends run against, not by discipline.

**Alternative C — one port at the agent level only.** Everything is an `AgentBackend`; there is no
`ModelClient` port at all, and each backend talks to whatever it talks to.

*For:* fewest layers; no temptation to leak SDK types upward.
*Against:* it discards the one place the product genuinely has many similar things. Six providers,
plus arbitrarily many `openai-compatible` instances, plus two request dialects per base URL (F3),
share one call shape; giving each its own backend duplicates streaming, usage extraction, retry and
abort logic six-plus times and makes F4's "no client constructible from an unavailable entry"
something to be re-checked in each.

**Recommendation: Alternative B.**

The specification has already committed to more than one backend (`REQ-MCP-043`) and to one provider
that is an agent runtime rather than a model (`REQ-PROVIDER-005`, `REQ-PROVIDER-049`,
`REQ-PROVIDER-117`). Modelling that as a single language-model port would be an abstraction chosen
against the evidence. The two-port shape also puts the vendor-SDK question entirely inside
`ModelClient`, which is exactly where the product decision wants it.

Concretely, `ModelClient` must expose, because a requirement demands each: a **streaming** call
producing text deltas, reasoning/thinking parts, incremental tool calls and a terminal usage record
(`REQ-MONITOR-081`, `REQ-MONITOR-102`, `REQ-EVENTS-053`); **image content parts** on input
(`REQ-CHAT-171`, `REQ-PROVIDER-149`); a **dialect** selector of `chat | responses` resolved per
model (F3, `REQ-PROVIDER-089`, `REQ-PROVIDER-092`); a **thinking level** of
`low | medium | high | max | unset` (F2, `REQ-PROVIDER-088`); a **per-call abort signal** and a
per-model timeout (`REQ-CONFIG-115`, `REQ-CONFIG-086`); a **retry count** defaulting to 5
(`REQ-PROVIDER-089`); an **error** preserving the HTTP status and the provider's own message so
`REQ-NOTIFY-088`'s quota classification, `REQ-NOTIFY-091`'s rate-limit classification and
`REQ-PROVIDER-098`'s 401/403 hygiene path can all read it without pattern-matching on prose; and a
**credential resolver** invoked inside the request path rather than a token captured earlier (F6).

**Consequences accepted.**

- Two backend implementations must be kept behaviorally equivalent. Mitigation: one conformance
  suite, parameterised over backends, asserting the event kinds and ordering of `REQ-EVENTS-041`,
  the MCP description key set of `REQ-MCP-043`, and the usage fields of `REQ-EVENTS-053`.
- The external-runtime backend is a supervised subprocess with all that implies (stream ownership,
  cancellation, exit-status handling) — the same discipline `REQ-MCP-113` already demands for MCP
  `stdio`, so the process-launch primitive is shared with ADR-MODEL-09.
- If **OQ-4** resolves as "the external runtime's tool calls do not pass through the product's
  permission engine", that is a user-visible narrowing and must be **ESCALATE**d, not absorbed here.
  This ADR does not decide it.

**Revisit if.** OQ-4 resolves such that the `claude-code` provider is dropped, or is reduced to a
plain Anthropic-API call carrying a subscription token — in which case the second backend disappears
and Alternative A becomes correct. Also revisit if a third backend is proposed: two is justifiable,
three is a plugin surface needing its own decision.

---

### ADR-MODEL-02 — The Vercel AI SDK sits behind `ModelClient` for the request/stream step only

**Decision to be made.** Whether a third-party SDK implements the `ModelClient` port of
ADR-MODEL-01, or the providers are called directly over HTTP.

**Constraints that bear on it.**

- The SDK can only ever serve one step. Domain 04 carries 134 live requirements, and the ones an SDK
  could plausibly help with are the request itself. Discovery (D1–D8), the credential store (B1–B9),
  the sign-in flows (C1–C11), the snapshot (E1–E4), slot assignment (D5), priming (G1–G4), and usage
  and credit (H1–H6) are outside any model SDK's scope and must be written regardless.
- Two dialects against one base URL, chosen per model, are mandatory (F3, `REQ-PROVIDER-074`,
  `REQ-PROVIDER-092`).
- Per-request headers vary by provider and by call: Copilot's editor-identity header set
  (`REQ-PROVIDER-070`), codex's `originator` / `OpenAI-Beta` / conditional `chatgpt-account-id`
  (`REQ-PROVIDER-076`), and a bearer that must be resolved and possibly renewed at dispatch (F6).
- Usage must be surfaced per call including the provider's real input-token count (H7).
- Money must never be computed in binary floating point (H1), so cost must not be delegated to a
  library that does it in `number`.
- `REQ-PROVIDER-071`'s classification is total and status-bearing; whatever performs an HTTP call
  must expose the status code and the raw body (the latter cut to its first 500 characters before
  being shown or logged, `REQ-PROVIDER-035`).

**What was checked.** Context7, AI SDK documentation at `ai-sdk.dev` (current published docs,
covering the v5→v6 line): `createOpenAICompatible` accepts `baseURL`, `apiKey`, `headers`,
`queryParams`, a custom `fetch`, `includeUsage`, `transformRequestBody` and a `metadataExtractor`;
`@ai-sdk/openai` exposes `openai.chat()` and `openai.responses()` as separate model constructors and
`createOpenAI` accepts a `baseURL`; the usage type carries `inputTokens`, `outputTokens`,
`totalTokens`, `reasoningTokens` and `cachedInputTokens`. Those four facts are what the
recommendation rests on.

**Alternative A — AI SDK behind `ModelClient`.**

*For:* SSE parsing, tool-call fragment assembly (arguments arriving split across deltas), reasoning
parts, usage extraction, abort and retry are genuinely fiddly and genuinely done. The custom `fetch`
hook is the natural seam for injecting the resolved credential, the per-provider headers, the
concurrency permit of OQ-3 and the redaction of anything logged — so provider-specific behavior
lands in one function rather than spreading through a request builder. `.responses()` plus a
`baseURL` covers F3 for Copilot's responses-only models.
*Against:* the provider-package type surface has moved across majors (`LanguageModelV2` in the v5
line, `LanguageModelV4Usage` in the current custom-provider documentation), so upgrades will cost
adapter work. `createOpenAICompatible` is chat-dialect only; responses mode against a non-OpenAI
base URL goes through `@ai-sdk/openai`, a supported but less-travelled configuration that should be
spiked against Copilot before being relied on. And the SDK contributes nothing to the rest of the
domain, so it does not reduce the slice's overall size much.

**Alternative B — direct HTTP for everything, no model SDK.**

*For:* one fewer dependency on a fast-moving package; complete control over headers, body shape and
error classification, which `REQ-PROVIDER-071` and `REQ-PROVIDER-073`/`-074` demand in unusual
detail anyway; nothing to fight when a provider's payload changes, which `REQ-PROVIDER-151`
explicitly anticipates. The discovery path is hand-written regardless, so the HTTP plumbing exists
either way.
*Against:* we would re-implement streaming tool-call assembly for two dialects, and do it worse at
first. That code has no requirement of its own to guide it — it is pure protocol detail — so bugs in
it surface as mysterious agent misbehavior rather than as a failed conformance test. It is the least
interesting code in the slice and the easiest to get subtly wrong.

**Recommendation: Alternative A, scoped tightly.**

Use the AI SDK for the streaming model call and nothing else:

- `ModelClient` is implemented by an adapter that constructs an AI SDK language model per
  `(base URL, dialect, headers)` and calls `streamText`. No AI SDK type crosses the port.
- Discovery, usage, credit, OIDC, device code, PKCE and token exchange use plain `fetch`. They are
  not model calls and gain nothing from the SDK.
- Cost is never computed by the SDK. Usage tokens come out of it; money is computed by the decimal
  layer of ADR-MODEL-06.
- `maxRetries` is set from the per-model retry count, default 5 (`REQ-PROVIDER-089`), not the SDK's
  default of 2.
- All provider-specific decoration — credential resolution and renewal (F6), the concurrency permit,
  header injection, and redaction of anything reaching a log — lives in the custom `fetch` handed to
  the provider factory, so there is exactly one place a request is decorated.

**Consequences accepted.**

- A dependency whose major versions rename core types. Mitigated by the port, which is mandated
  anyway; the blast radius is one adapter file.
- Copilot responses-mode via `createOpenAI({ baseURL })` needs a spike before the architecture gate
  closes. If it does not work, the fallback is a hand-written responses-dialect implementation
  behind the same port — a contained loss, not a redesign.
- We accept that the SDK gives little leverage overall. It is chosen for one step, on the merits of
  that step, not as a framework.

**Revisit if.** The Copilot responses spike fails; or a provider's request needs a body the SDK
cannot express even through `transformRequestBody`; or the SDK's usage record stops carrying a real
provider input-token count, which `REQ-MONITOR-081` depends on.

---

### ADR-MODEL-03 — Providers are a frozen data catalog plus per-provider capability modules, not a class hierarchy

**Decision to be made.** How the six built-in providers, the `openai-compatible` family and its
instances are structured in code, given that they differ in almost every dimension the
specification names.

**Constraints that bear on it.**

- The catalog is frozen build data with a closed attribute set, integrity rules enforced as build
  errors, and an availability attribute nothing in the running product writes (A1, A2,
  `REQ-PROVIDER-001`, `-002`, `-003`, `-006`).
- Providers differ irreducibly: three sign-in methods (C1), five discovery behaviors (D1), five
  status-classification rules (B6), two bridge-artifact shapes (B8), three usage endpoints with
  three payload shapes (H3), and one provider with no endpoint at all (A3).
- Some per-provider knowledge is explicitly *build data that may change without changing behavior*:
  the Copilot payload key paths for capability type, policy state and policy terms
  (`REQ-PROVIDER-073`), the known-limits table rows (`REQ-PROVIDER-079`), and the tier preference
  fragment lists (`REQ-PROVIDER-081`). The specification fixes what is done with each value, not
  where it is found.
- An `openai-compatible--<slug>` instance is *not* a provider entry: it carries its own endpoint and
  base URL, leaves the catalog entry it was seeded from unchanged (`REQ-PROVIDER-002`), and the
  generic family id is never itself credentialed (`REQ-PROVIDER-135`).
- Provider id resolution has no aliases and an unknown id must be refused, except that an id tagged
  with the `openai-compatible` family resolves as API-key style (`REQ-PROVIDER-009`).

**Alternative A — a `Provider` interface with six implementing classes.** Each class carries its
own `signIn`, `refresh`, `status`, `discover`, `usage` and `stageBridge`.

*For:* obvious and familiar; each provider's oddities sit together.
*Against:* it hides the catalog's frozen-data nature behind behavior, which makes A1's "nothing
writes availability" and A2's build-time integrity checks awkward to state and easy to violate. It
also forces every provider to answer every method — including `usage` for `deepseek`, which supports
none (`REQ-PROVIDER-123`), and `discover` for `claude-code`, which makes no request at all — so the
interface fills with unsupported-operation stubs. And the `openai-compatible` instances, which are
many and dynamic, do not fit an enumerated class set.

**Alternative B — one frozen catalog record per entry, plus small capability modules selected by a
declared field.** The catalog is a `readonly` array validated once against A2's rules. Alongside it
sit four registries keyed by the *declared* attribute rather than by the provider id: an
authenticator registry keyed by sign-in method (`device-code`, `browser-pkce`, `api-key`), a
discovery registry keyed by a discovery-strategy tag, a usage-reader registry over exactly the three
providers `REQ-PROVIDER-123` names, and a bridge-writer registry over exactly the two
`REQ-PROVIDER-061` names. Provider-specific data that the specification calls build data —
Copilot payload key paths, the known-limits table, the tier preference fragments, the model
capability metadata of OQ-7 — lives in separate data modules, not in code branches.

*For:* it matches the specification's own division. `REQ-PROVIDER-148` already keys behavior on the
sign-in method token rather than on the id; `REQ-PROVIDER-123` and `REQ-PROVIDER-061` already
enumerate exactly which providers have a usage reader and a bridge writer, so a registry that is
empty for the others is the honest encoding rather than a stub. A2's integrity rules become a single
validation over the frozen array. An `openai-compatible--<slug>` instance is a record derived from
the family entry with its own endpoint, which is what `REQ-PROVIDER-002` describes.
*Against:* a provider's behavior is spread across four registries plus a data module, so
understanding "what does Copilot do" means reading five places. That is a real cost, paid to keep
the frozen-data property enforceable.

**Alternative C — a table-driven interpreter: one generic engine parameterised entirely by per-
provider declarative descriptors (endpoints, headers, JSON paths, mappings).**

*For:* maximum uniformity; adding a provider is adding data; `REQ-PROVIDER-073`'s "the payload key
paths are build data" and `REQ-PROVIDER-151`'s "following a provider's payload change costs a
build's mapping data and no behavior" read like an invitation to exactly this.
*Against:* it does not survive contact with the actual differences. `REQ-PROVIDER-074`'s endpoint
normalisation and route choice, `REQ-PROVIDER-025`'s session exchange with its 401/404-versus-
everything-else split, `REQ-PROVIDER-032`'s three-way claim ladder, and `REQ-PROVIDER-078`'s
acceptability predicate (booleans excluded, integral floats accepted) are algorithms, not mappings.
A descriptor language rich enough to express them is a programming language with worse tooling.

**Recommendation: Alternative B.**

Take from C only what the specification actually calls data — key paths, tables, preference lists —
and leave the algorithms as code. Concretely:

- `catalog.ts`: a frozen array of six records; a `validateCatalog()` run in a build-time test *and*
  at process start, implementing A2 exactly. Discovery URL and base URL are typed as an explicit
  optional so A3's "yields nothing" is the type's answer, and the accessor that a request path uses
  returns a discriminated result rather than a string.
- `authenticators/`: three modules keyed by `REQ-PROVIDER-148`'s tokens, plus the two flows that
  need provider-specific parameters (Copilot's device flow constants, codex's and cloud's PKCE
  parameters) passed in as data from the catalog.
- `discovery/`: a generic HTTP discoverer implementing `REQ-PROVIDER-069`/`-071`/`-072`, plus three
  strategy overrides — Copilot (`-070`, `-073`, `-074`), codex (`-076`), claude-code offline
  (`-047`).
- `data/`: the known-limits table (`-079`), tier preferences (`-081`), Copilot payload key paths
  (`-073`), model capability metadata (OQ-7). Each is a plain module with a shape test.
- Instance records for `openai-compatible--<slug>` are constructed from the family entry plus the
  stored `api_base`, and the family id itself is excluded from every credentialed path
  (`REQ-PROVIDER-135`).

**Consequences accepted.** Reading one provider end-to-end means visiting several files; mitigated
by a per-provider documentation page that indexes them and by naming registries after the
requirement that enumerates their members. Adding a seventh provider is a catalog record plus at
most one entry in each registry, plus amendments to `REQ-PROVIDER-001` and this document.

**Revisit if.** The catalog stops being build data — for instance, if OQ-1 is answered by making
availability or a quick-start URL server-driven, which would break A1 and change this ADR's premise.

---

### ADR-MODEL-04 — The credential store is a plain-file store with a platform protection adapter and a cross-process advisory lock

**Decision to be made.** How credentials are stored and protected, given that the file path, the
JSON shape, the indentation and the permission model are all specified observables.

**Constraints that bear on it.** B1–B4 and B9: fixed path and format; explicit POSIX modes *and*
explicit Windows ACLs with inheritance disabled; refusal to write when protection cannot be applied;
atomic staging with a named temp pattern and a clean directory afterwards; a cross-process exclusive
lock with a 5-second budget, stale-lock reclamation, and reads that take no lock
(`REQ-PROVIDER-014`, `-016`, `-017`, `-018`, `-019`, `-152`). Also B7 (a derived key that is never
persisted) and B8 (bridge artifacts on disk before the save returns).

**Alternative A — OS keychain / credential manager (Keychain, DPAPI, libsecret), with the JSON file
as a compatibility shim.**

*For:* it is the conventional answer, and the strongest one on pure security grounds: a keychain
protects against another process running as the same user, which file ACLs do not.
*Against:* `REQ-PROVIDER-014` and `REQ-PROVIDER-017` make the file's path, key names and indentation
observable, `REQ-PROVIDER-019` makes enumeration "the sorted basenames of `*.json` files in the
credential directory", and `REQ-PROVIDER-018` makes the directory's post-operation contents
observable. A keychain plus a shim would have to write the same file anyway, so it adds a second
store and a synchronisation problem without removing the first. It also cannot express B4's
cross-process lock semantics over the file. **This alternative is unavailable, and saying so is the
point: the specification has already decided it.**

**Alternative B — plain files, protection applied through a platform adapter, locking through an
adjacent lock file.**

- `protect(path, kind)` has two implementations. POSIX: `chmod` to `0700`/`0600`, then verify by
  reading the mode back, because "no group or other bit is ever set" is an observable and `umask`
  and filesystem behavior vary. Windows: build an explicit DACL granting the owning user and
  LocalSystem, with inheritance disabled, and apply it to the directory and each file. Failure
  anywhere aborts the write before the target is touched.
- Atomic write: create `<provider_id><random>.tmp` inside the credential directory, protect it,
  write, `fsync`, rename onto the target; on any failure unlink the temp file. `REQ-PROVIDER-018`'s
  "the directory holds nothing but `<provider_id>.json` files" is a post-condition worth asserting
  in tests, including on the failure path.
- Lock: an adjacent `<provider_id>.json.lock` acquired exclusively before every read-modify-write.
  Staleness is decided by recording the holder's process id and start time in the lock file and
  reclaiming only when that process is provably gone — `REQ-PROVIDER-152` forbids breaking a lock a
  live process holds, so a time-based expiry alone is not sufficient.

*For:* it satisfies every observable, and each obligation maps to one testable behavior.
*Against:* Windows ACL manipulation is not in Node's standard library, so it needs either a native
module or shelling out to `icacls`. Both are unpleasant: a native module complicates packaging and
code signing; `icacls` means parsing a localized command's exit status and is a process spawn on
every credential write. This is a genuine cost and it should be spiked before the gate.

**Alternative C — plain files as in B, but Windows protection is best-effort and the failure is a
warning rather than a refusal.**

*For:* avoids the native-module/`icacls` decision; simpler; matches what many desktop applications
actually do.
*Against:* it contradicts `REQ-PROVIDER-016` in the most direct way available — "If the required
protection cannot be applied, the credential is NOT written". Downgrading a refusal to a warning is
a security decision that belongs to the product owner, not to this document.

**Recommendation: Alternative B**, with the Windows ACL mechanism chosen by spike before the
architecture gate closes. Preference order for that spike: (1) a maintained native binding if one
can be packaged and signed without complicating the updater of domain 11; (2) `icacls` invoked with
SID literals rather than localized account names, checked by reading the resulting DACL back rather
than by parsing output text. Whichever wins, the *verification read-back* is the part that satisfies
`REQ-PROVIDER-016`, so it is not optional in either.

**Consequences accepted.**

- Credentials are protected against other users, not against other processes of the same user. That
  is what the specification asks for; it is worth recording explicitly so nobody later believes
  otherwise.
- A cross-process lock file appears in the credential directory. `REQ-PROVIDER-018`'s "holds nothing
  but `<provider_id>.json` files" is stated about the *credential* operation's temp files; a lock
  file adjacent to the target is required by `REQ-PROVIDER-152` and the two requirements must be
  read together. Flagged for confirmation — if the directory-contents rule is meant literally and
  exhaustively, the lock file must live elsewhere, which `REQ-PROVIDER-152`'s word "adjacent"
  would then have to permit.
- Every credential save also writes bridge artifacts before returning (B8), so the save path is a
  composite operation whose partial failure is defined: the credential save still succeeds and the
  artifact failure is a warning (`REQ-PROVIDER-061`).

**Revisit if.** The Windows ACL spike shows no acceptable mechanism, which would make
`REQ-PROVIDER-016` unimplementable as written and would be an escalation rather than a redesign.

---

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
