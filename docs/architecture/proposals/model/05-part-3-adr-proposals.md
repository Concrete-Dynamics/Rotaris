# Architecture proposals — MODEL slice — Part 3 — ADR proposals

Part 5 of 8 of [the model proposal](../model.md), which indexes every part.

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
