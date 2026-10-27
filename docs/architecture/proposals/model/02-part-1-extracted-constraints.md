# Architecture proposals — MODEL slice — Part 1 — Extracted constraints

Part 2 of 8 of [the model proposal](../model.md), which indexes every part.

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
