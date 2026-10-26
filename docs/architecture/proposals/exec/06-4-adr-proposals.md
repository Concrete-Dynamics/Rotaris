# EXEC slice — architecture proposals — 4. ADR proposals

Part 6 of 9 of [the exec proposal](../exec.md), which indexes every part.

## 4. ADR proposals

Numbers are slice-local (`ADR-EXEC-NN`); the synthesis step assigns final numbers.

---

### ADR-EXEC-01 — Tool execution runs in one long-lived runtime process, not in the Electron main process

**Decision to be made.** Which process hosts the permission gate, the tool executors, the terminal
sessions, the confinement wrapper and the egress client — and how many such processes exist.

**Constraints that bear on it.** C-01 (one shipped executable), C-02 (one process hosts several
runs, no cross-run leakage), C-03 (nothing survives application exit), C-05 (availability verdict
must be stable for application lifetime), C-06 and C-07 (100 ms budgets; the 5.0 s trial must not sit
on them), C-72 (long-lived shells), C-73 (per-session foreground serialization, cross-session
concurrency), C-91 (real PTYs), C-144 and C-147 (plugin code runs in the host process with its
privileges), C-150 (no state crosses a session or run).

**Alternatives.**

1. *Everything in the Electron main process.* Native modules load there; there is no IPC hop between
   the gate and the approval dialog; the availability cache trivially has application lifetime (C-05);
   teardown on quit is one code path. Against: the main process owns window management and services
   every renderer IPC message, and this slice puts genuinely heavy, genuinely blocking work on it —
   SHA-256 over files for `haet_read` (REQ-TOOLS-189), real-path resolution on every path-scoped
   decision (C-24), JSONL compaction (C-63), tokenizing every command line, and PTY read pumps for
   every live session at up to 50 samples/second each (C-88). Missing REQ-SHELL-150's 100 ms gesture
   budget under load is a build failure, not a degradation. Worse, a crash in a native module or in
   plugin code (C-144, which is by definition unconfined third-party code) takes the windows with it.
2. *One runtime process per run.* Maximal isolation; a run that wedges cannot affect another; kill is
   trivially scoped. Against: the specification repeatedly *assumes* the opposite — "two runs in one
   process never lend each other an allow-list" (REQ-TOOLS-089), "when one process hosts two live
   runs, one confined and one not" (REQ-SANDBOX-096), "two concurrent runs in one process each apply
   their own lists" (REQ-SANDBOX-038). Those requirements remain satisfiable under per-run processes
   (vacuously), but the availability cache of C-05 would then be per-run, and REQ-SANDBOX-067's
   "at most once per process, cached" would either re-probe per run (a 5 s cost per launch, and a
   verdict that can differ between two live runs, which C-05 forbids) or need a separate owner
   anyway. Per-run processes also multiply the cost of the shared machinery — the redaction pass, the
   tokenizer, the policy tables — for no requirement that asks for it.
3. *One dedicated runtime process, forked from the shipped binary, hosting all runs.* Chosen.

**Recommendation.** Alternative 3: one long-lived runtime process, created at application start and
living exactly as long as the application, forked via `electron.utilityProcess.fork` (checked against
the current Electron `utility-process` API documentation: forks a Node-enabled child using Chromium's
Services API, with `MessagePortMain` transport, `stdio` control and native-addon support). Main keeps
windows, dialogs, settings persistence and the approval presenter; the renderer draws. Runs are
objects inside the runtime, and every run-scoped value — policy, sandbox specification, egress
configuration, artifact store — is carried in an explicit `RunContext` threaded through dispatch
rather than read from module state (C-02, C-150). A call with no `RunContext` takes the
`unrestricted` default of C-04; a call with an ambiguous one is refused.

Reasoning: it satisfies C-01 because `utilityProcess.fork` re-enters the shipped Electron binary with
a bundled script path — no second executable is installed or published, and it is *not* the reserved
`builtin:code-intelligence` argv token, which stays reserved for REQ-MCP-033. It satisfies C-07 by
construction, because nothing this slice does sits on main's message loop. It gives crash isolation
for C-144's unconfined plugin code. And because the runtime's lifetime equals the application's,
C-05's "within one process the verdict never changes … cleared only by the explicit re-check or by
restarting the application" is directly implementable there.

**Consequences accepted.**

- The approval flow crosses a process boundary (ADR-EXEC-05 handles the failure modes).
- Terminal frames cross a process boundary. Given C-91's 100 ms echo budget, a `MessagePortMain`
  should be transferred to the renderer for terminal traffic rather than relaying every frame through
  main.
- Native modules (the PTY binding, and the SQLite driver if the runtime touches it) must be rebuilt
  against Electron's ABI (`@electron/rebuild`) and shipped unpacked from the asar. This is a
  build-pipeline obligation the packaging slice inherits.
- Killing the runtime does **not** by itself satisfy C-03: descendants outlive their parent on both
  platforms. The runtime must own an explicit kill group — a POSIX process group per background
  session (already mandated by REQ-TOOLS-107) and, on Windows, a Job Object with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` covering the subtree — so that "whatever ends it" includes a
  crash and not only a quit. Without the Job Object, C-03 is unmet on Windows and should be recorded
  as unmet rather than assumed.
- Diagnostics (REQ-STARTUP-134) must be able to count and name the runtime's execution contexts.

**Revisit if.** The product gains a second window class needing synchronous access to execution state;
or a plugin host arrives that must be a separate process anyway (ADR-EXEC-12), in which case the "one
runtime" premise should be re-opened rather than a second process added silently; or Electron's
utility-process API stops supporting native addons.

---

### ADR-EXEC-02 — The tool registry is a declarative capability table with a direction-aware, fail-closed accessor

**Decision to be made.** How the eighteen public tool names, their capability declarations and the two
tool classes are represented, and how a rule anywhere in the product asks what a tool does.

**Constraints.** C-09 (closed name set, alias `haet`), C-10 (three independent facets, a property of
the tool not of its arguments, stated in exactly one place), C-11 (undeclared tools read fail-closed
*in the direction of the reading rule*), C-12 (two classes stated against the declaration and held
consistent by construction; membership is not itself a facet), C-13 (four-stage removal-only
pipeline), C-14 (prompt listing and callable set from one resolution), C-15/C-16 (degradation with
stable reason codes).

**Alternatives.**

1. *Facets as properties on each tool implementation object* — each executor declares its own facets
   beside its handler. Natural for an author and keeps the declaration next to the code. Against:
   C-10 requires the registry to be "the product's single definition", and C-11 requires that a tool
   *outside* the registry has no declaration at all. If facets live on implementations, a plugin or
   MCP tool can assert facets it must not have and nothing structural stops it. It also turns C-12's
   class-consistency invariant into a runtime assertion rather than a compile-time fact.
2. *A single frozen table keyed by name, with the classes declared beside it and a typed accessor
   whose signature demands the reading direction.* Chosen.
3. *Facets inferred from a tool's JSON schema* — a tool with a `path` argument reads files, a tool
   with a `command` argument runs commands. Superficially attractive because it would extend to
   plugin and MCP tools and would remove the awkwardness of undeclared tools. Ruled out flatly by
   C-10 and C-11: `terminal` declares running commands whatever it is given, `git_commit` declares
   reading *and* writing despite leaving the working tree alone, and no facet may be inferred from a
   name, a description, or anything a tool says about itself. Recorded because it is the design a
   reader will reach for when the undeclared-tool rule starts to hurt.

**Recommendation.** Alternative 2. One module owns a frozen record from tool name to
`{ readsWorkspaceFiles, writesWorkspaceFiles, runsCommands }`, with the alias table beside it. The
read-only class and the network class are literal sets in the same module, guarded by a
test-enforced invariant that no read-only member declares writing or running and that the network
class is a subset of the read-only class (C-12). The accessor is not `getFacets(name)` but a pair —
`grantsOn(name, facet)` and `withholdsOn(name, facet)` — so C-11's direction-sensitivity lives in the
type system rather than in a reviewer's memory: an unknown name answers `false` to the first and
`true` to the second, always.

Narrowing (C-13) is a fold over an explicitly ordered array of four stage functions, each of type
`Set<ToolName> -> Set<ToolName>` and each asserted (in tests) to return a subset of its input.
`coordinator_only` is expressed as removal of the closed five-name list REQ-TOOLS-006 states, so
adding a read tool later needs no edit here. The resolution runs once per agent construction and its
single result feeds both the prompt renderer and the callable set (C-14) — one value, two readers,
which is the only shape that cannot drift.

**Consequences accepted.**

- Adding a public tool name is a code change in one file plus a declaration and cannot be done by
  configuration. That is the point: C-09 makes the set closed.
- Plugin and MCP tools get nothing from the registry, so any rule that widens on a facet never widens
  for them. Plugin authors will find this restrictive; C-11 requires it.
- The `tools:` validator needs the workspace's configured MCP server list, because an entry naming a
  configured server must fail with an extra sentence pointing at `mcp_servers` (C-09, C-148). That is
  a real coupling and belongs in the module boundary rather than being discovered later.

**Revisit if.** A requirement adds a fourth facet — REQ-TOOLS-001 anticipates growth in *names*, not
in facets; or plugin tools gain a declared and validated capability contract, which is a
product-owner decision rather than an architectural one.

---

### ADR-EXEC-03 — The policy is an immutable ordered value with matchers compiled at build time

**Decision to be made.** How a permission policy is represented, evaluated, validated and replaced
while a run is live.

**Constraints.** C-18 (three-value vocabulary, never raises), C-19 (unconditional fail-closed with a
fixed rule id and a host-interactivity-dependent outcome), C-20 (twelve decision sources), C-23 (five
facets, compact-JSON argument comparison), C-24 (path scope over seven keys, real-path resolution,
unresolvable counts as outside), C-25 (ordered, first match wins, four validity conditions, never
decides a call when invalid), C-26 (session approvals before policy rules, most recent first,
surviving replacement), C-31 (replacement governs the very next call, no rebuild), C-38 (command
patterns validated eagerly at build, host patterns lazily at classification), C-42/C-43 (fixed preset
set and fixed family composition order), C-32 (in-memory shape free).

**Alternatives.**

1. *Policy as a compiled decision function per preset* — three hand-written closures: fast, type-safe,
   no interpretation. Against: C-25's validity conditions are conditions on a *list of rules with
   ids* ("two rules carry the same id", "any rule id is empty"), which a closure has no
   representation of. C-26's session approvals must be matched ahead of the closure with ids numbered
   in grant order. And the audit's `rule_id`, the refusal text's `<rule_id>`, and the settings
   surface all need the rule table to be inspectable data. A closure would carry a parallel table
   anyway, at which point the table is the real representation.
2. *Policy as data, matchers interpreted per call* — a plain array of rule records, patterns tokenized
   and globbed on every evaluation. Simple, obviously correct, no build step. Against: C-38 requires a
   non-tokenizable or empty pattern to be a **policy-build-time** error with a specific message;
   interpreting per call defers that to the first matching request, which REQ-TOOLS-034 explicitly
   rejects ("so typos fail loudly rather than silently matching nothing"). It also re-tokenizes the
   same ~40 starter patterns on every dispatch, on a path that gates every tool call.
3. *An immutable value whose matchers are compiled once when the policy is built.* Chosen.

**Recommendation.** Alternative 3. `Policy` is a frozen `{ presetName, defaultDecision, rules }` where
each rule holds its id, description, outcome and up to five pre-compiled facet matchers. Building a
policy is a pure function of (preset name, egress configuration, workspace root): it composes the four
rule families in REQ-TOOLS-041's fixed order, tokenizes every command pattern eagerly and throws
REQ-TOOLS-034's error on failure, and runs C-25's four validity checks. Building is the only step that
can fail; evaluation cannot.

Evaluation is a pure function `(Policy, SessionApprovals, PermissionRequest) -> Decision`, wrapped by
a single `try` implementing C-19 and nothing else. Session approvals are a separate per-session list
scanned most-recent-first *before* the policy (C-26), which is precisely what lets them survive policy
replacement with no migration step — they were never part of the policy.

Argument comparison uses one canonical-JSON encoder (keys sorted ascending by code point, shortest
round-tripping numbers, no insignificant whitespace) per C-23; strings compare as themselves.
Path-scope evaluation (C-24) is the one impure step because it must resolve real paths through
symlinks and junctions; it takes an injected resolver so the "unresolvable counts as outside" branch
is directly testable, and a resolver failure produces a *non-match*, never an exception that would
divert the call into C-19's fail-closed path by accident.

Replacement (C-31) is an atomic pointer swap on a per-run `PolicyContext`. Because `Policy` is frozen
and evaluation is pure, an in-flight decision reading the old value and the next decision reading the
new one is exactly the specified behaviour, with no lock and no agent rebuild.

**Consequences accepted.**

- The fixed rule ids of REQ-TOOLS-039, REQ-TOOLS-042 to REQ-TOOLS-045, REQ-TOOLS-085 and the Data &
  Formats identifier list become string constants under a snapshot test. A typo in any of them is a
  conformance failure, so they belong in one table rather than at construction sites.
- Host-pattern validation stays lazy (C-38), so a policy can build successfully and a fetch can still
  fail with `egress_policy_error`. That asymmetry is specified and must be preserved, not tidied away.
- The gate must know host interactivity before the approval flow, to satisfy C-19's ask-versus-deny
  split. The evaluation environment therefore carries an attendedness flag derived from the *same*
  presenter-registration fact as C-46 — one source of truth, read twice.

**Revisit if.** OQ-7 resolves toward user-authored rules, which adds a configuration-to-policy
compilation step and per-rule settings validation; or a requirement makes evaluation depend on mutable
state (a rate limit, a per-run counter), at which point "evaluation is pure" stops being free.

---

### ADR-EXEC-04 — A purpose-built shell tokenizer and segmenter, not a general shell parser and not regular expressions

**Decision to be made.** What implements C-33 to C-37 — tokenization, compound-line decomposition,
glob token matching and the unconfident predicate.

**Constraints.** C-33 (token-by-token glob matching, trailing `*` matching zero or more), C-34 (first
token folds case, later tokens do not, identically everywhere), C-35 (seven operators, longest first,
quote- and escape-aware, introducing operator retained with the segment), C-36 (closed unconfident
predicate, including redirection stripping and two closed head lists), C-37 (never raises; exactly one
unconfident segment on total failure), C-38 (pattern errors at build time), C-40 (the network
catalogue runs on the same machinery), C-41 (one POSIX-shaped tokenizer everywhere, PowerShell
included).

**Alternatives.**

1. *An off-the-shelf shell parser or lexer.* Gets quoting and escaping right without new code and is
   the obvious reuse. Against: C-37 requires the decomposer to *never raise* and to yield exactly one
   unconfident segment on unparseable input; general parsers raise, and wrapping one in a `catch` that
   fabricates a segment reproduces most of the work anyway. C-35 requires the introducing operator to
   be retained per segment — a detail no general lexer exposes, yet the pipe-to-shell matcher needs to
   know a segment followed `|` specifically. C-36's redirection rule ("anything beginning with `>` or
   `<`") and its detection of `$( )` and backticks *including inside double quotes* are product rules,
   not shell rules. A library would end up driven and post-processed to the point where it contributes
   only its quote state machine.
2. *Regular expressions over the raw command line.* Rejected outright by C-33 — matching is defined
   token-by-token and never against raw text, and REQ-TOOLS-033 states the failing consequences
   (`git status` must not fire on `git status-check`). Recorded because it is the cheap path someone
   will propose when the scanner needs a small change.
3. *A small purpose-built scanner producing (introducing operator, tokens, unconfident reason) tuples
   per segment.* Chosen.

**Recommendation.** Alternative 3: one scanner that walks the line once tracking single-quote,
double-quote and backslash state; emits operator boundaries longest-first; collects tokens per
segment; stops the matched token stream at the first redirection token; and records a reason when a
segment is unconfident. It exposes exactly two entry points — `decompose(line)` for command lines,
never throwing, and `tokenizePattern(text)` for rule patterns, throwing REQ-TOOLS-034's error. Glob
matching per token is a small `*`/`?` matcher rather than a translation to a regular expression, so a
`*` in a pattern token cannot acquire regex semantics; the first token compares case-folded and every
later token does not (C-34).

Reasoning: the required behaviour is a *closed* specification, not "POSIX shell semantics". Every edge
the spec cares about is enumerated in C-35 and C-36, and every edge it does not care about is not
required to be right. Owning the scanner makes C-37's never-raises property structural, makes the
unconfident reason available for diagnostics, and makes the whole thing table-testable against the
worked consequences the requirements already state.

**Consequences accepted.**

- We own a security-relevant parser. It must be fuzzed against the invariant that `decompose` never
  throws and always returns at least one segment, and property-tested in the fail-closed direction:
  any input the scanner is unsure about classifies unconfident, never confident-and-empty.
- C-41 stands: on Windows this POSIX-shaped scanner reads PowerShell lines, so backtick escapes and
  `$( )` subexpressions classify as command substitution and therefore *ask* under `restricted` and
  `ask`. That over-triggers rather than under-triggers and matches the domain's posture, but it is a
  real friction for Windows users and belongs in the tool description rather than being discovered.
- One scanner serves the network catalogue (C-40), the starter rules (C-39) and any future matcher, so
  a change to tokenization changes all of them at once. That is desirable and must be stated: the
  scanner has one behaviour, versioned by its tests.

**Revisit if.** A requirement asks for platform-native tokenization (a PowerShell-shaped scanner on
Windows), which REQ-TOOLS-033's "identically on every platform and every backend" currently forbids;
or the unconfident predicate stops being closed.

---

### ADR-EXEC-05 — The approval wait registry lives with the gate; the presenter is a revocable remote capability

**Decision to be made.** Where pending approvals are held, how an `ask` reaches a person, and what
happens when the presenter is absent, slow, broken, or on the far side of a process boundary that has
just gone away.

**Constraints.** C-51 (one call suspended, session keeps running), C-52 (three options, three terminal
states, fixed mappings), C-53 (the enumerated registry semantics, including "waiting on an unknown id
resolves cancelled immediately" and bulk cancel), C-54 (one shared budget, `0` = indefinite), C-55
(nine-field JSON-serializable payload mirrored into session state), C-56 (`approval.requested`
published for headless asks too, with `resolver` and null `timeout_seconds`), C-57 (answers only from
the host UI), C-58 (presenter-error and fail-closed paths), C-59 (headless policy: never a silent
allow, never a hang), C-60 (single dialog per window, ordered queue, 100 ms hand-off, revocation,
undeliverable-answer state), C-61 (strict both-sided pairing), C-46 (attended ⇔ a presenter is
registered), C-19 (fail-closed ask-vs-deny depends on attendedness), C-151 (teardown cancels every
waiter).

**Alternatives.**

1. *Registry in the Electron main process, gate calls out and awaits.* The dialog, the queue and the
   pending map all sit next to the window; C-60's "one dialog per window, oldest first" is local
   bookkeeping. Against: C-19 and C-59 require that an `ask` raised when the presenter is unreachable
   resolves *without a prompt and without a hang*. If the registry is in main and the channel to main
   is what has failed, the runtime has no registry to fall back to and must invent a timeout-based
   guess. The gate would also have to make a cross-process call on the decision path even to discover
   that there is nothing to call, which puts C-19's fail-closed branch behind an IPC round trip.
2. *Registry in the runtime; the presenter is a capability registered by main over the channel.*
   Chosen.
3. *No registry — the gate blocks on a promise per call with no central map.* Rejected against C-53:
   duplicate-id rejection, resolve/cancel of unknown ids, bulk cancel, and C-55's "pending approvals
   are visible in session state as a mapping from request id to payload" all require a first-class,
   enumerable map. Recorded because a promise-per-call is the natural first sketch.

**Recommendation.** Alternative 2. The runtime owns a `PendingApprovals` map per session, keyed by
request id, implementing C-53's semantics exactly, including the deliberately odd ones (waiting on an
unknown id resolves *cancelled*, not rejected). "Attended" is one boolean per session in the runtime:
true exactly while main holds a live presenter registration for that session (C-46). Registration is
explicit and revocable, and it is revoked automatically when the channel to main closes — so a lost
channel makes every session unattended, which routes every ask to the headless policy of C-59 and
makes C-19 resolve `deny` rather than `ask`. That is the correct fail-closed direction and it is
reached without a timeout.

Flow: the gate resolves `ask` → publishes `approval.requested` with `resolver: "brokered"` and the
configured `timeout_seconds` (C-56) → inserts the payload into `PendingApprovals` and mirrors it into
session state (C-55) → posts a present-request to main → awaits a settled outcome. Main owns the
per-window dialog queue (C-60) and nothing else: it never decides, it only presents and returns one
of the three answers. If presenting raises, main returns a `presenter-error` outcome and the runtime
discards the pending entry and denies (C-58). If the answer cannot be delivered — the runtime settled
the wait first, by timeout or cancellation — main is told, and the dialog enters C-60's
buttons-disabled status-line state rather than closing on an answer nobody received.

For a session with no presenter the gate never posts anything: it publishes `approval.requested` with
`resolver: "headless"`, `timeout_seconds: null` and `unattended_reason: "headless-policy"` (C-56),
applies `runtime.headless_approval_policy`, and returns. No wait is created at all, which is what
"meaning no wait occurs" in REQ-TOOLS-061 requires.

The timeout is implemented as an explicit deadline on the wait rather than a per-wait timer, with `0`
meaning *no deadline registered* (C-54) — the wait is then released only by an answer or by a
cancellation. Bulk cancel (C-53, C-151) walks the map for a session or for everything and settles each
waiter `cancelled`, which the mapping of C-52 turns into `deny` with source `cancelled`.

Pairing (C-61) is enforced at the point the decision record is built: the request id is attached only
when the source is one of the seven approval-resolution sources *and* the session id and tool name
match the pending payload; otherwise the field is empty. That check reads the payload, so it must
happen before the entry is removed from the map.

**Consequences accepted.**

- The runtime, not main, decides that a session is unattended, so main must register and revoke
  presenters explicitly and promptly — in particular on window close and on session focus change
  (REQ-SHELL-110, REQ-SHELL-111) — or a torn-down presenter will be treated as live until the channel
  notices.
- A run that starts while main is wedged (not crashed) will still see a live registration and will
  post present-requests that never resolve. C-54's timeout is the only backstop, and with
  `approval_timeout_seconds: 0` there is none. This is a genuine liveness hole created by the
  specification's "0 means wait forever" (C-54) combined with C-60's undeliverable-answer state; it
  should be mitigated by a channel-level liveness signal rather than by shortening the user's
  configured wait.
- C-60's queue is per *window*, but the wait registry is per *session*, and a window can change which
  session it is focused on. The mapping between the two is main's, and the ordering guarantee
  ("oldest first by `approval.requested` publication order") must therefore be carried in the payload
  as a monotonic sequence number rather than inferred from arrival order at main.
- Session state mirroring (C-55) means a pending approval is written to persisted session state and
  removed on settlement, so a crash can leave a stale pending entry. Resume must treat any pending
  entry read from disk as cancelled, since C-57 forbids anything but the host UI from answering it and
  the waiting agent no longer exists.

**Revisit if.** The product gains a second presenter kind (a system notification that can be answered,
a remote approver), at which case "registered presenter" stops being a boolean and C-46's definition
of attended needs re-reading; or `approval_timeout_seconds: 0` is reconsidered.

---
