# EXEC slice — architecture proposals — ADR-EXEC-10 — Redaction is one pure pass behind a branded type, applied at construction

Part 8 of 9 of [the exec proposal](../exec.md), which indexes every part.

### ADR-EXEC-10 — Redaction is one pure pass behind a branded type, applied at construction

**Decision to be made.** How the single redaction pass is placed so that seven surfaces cannot drift,
including under the specification's unusual "no matter which of its fields were set last" clause.

**Constraints.** C-138 (one pass, seven surfaces, none carrying rules of its own), C-139 (four ordered
layers with exact token semantics), C-140 (fixed segmentation and a closed sixteen-word list; whole
value masked when the key is secret-looking), C-141 (`***`, idempotent, complete recognized set),
C-142 (the display mask is a different function, never substituted), C-143 (the invariant holds
however the event was assembled), C-22 (request summary vs argument summary, never substituted),
C-66 (audit entries carry no argument values beyond the redacted facet).

**Alternatives.**

1. *Redact at each sink* — the audit writer, the event publisher, the logger and the dialog each call
   the pass. Simple and obvious. Against C-138 and C-143: a new sink is one forgotten call away from
   leaking, and C-143's "no matter which of its fields were set last" is specifically a statement about
   *assembly*, not about output, which a sink-side pass cannot make.
2. *Redact at one serialization choke point* — a single encoder through which every persisted or
   published value passes. Better; the sink count drops to one. Against: the approval dialog is not a
   serialization surface, and neither is user-visible error text; both are named in C-138. And a value
   that is copied out of an event before encoding (a log line assembled from the same object) escapes.
3. *A branded `Redacted` type produced only by the pass, with every event, audit and payload shape
   typed to accept only it.* Chosen.

**Recommendation.** Alternative 3. One module exports `redact(text): Redacted`,
`displayMask(secret): string`, and the branded type; the brand is unforgeable outside the module.
Every field the specification requires to be redacted — `summary` on `permission.decision` and
`approval.requested`, `command` and `argument_summary` on the approval payload, `arguments` on
`tool.start`, the hook payload's argument rendering, the audit entry's `summary` — is typed
`Redacted`, so a value that has not been through the pass cannot be assigned to it. C-143 is then a
compile-time property rather than a review discipline: there is no assembly order in which an
unredacted string reaches one of those fields.

The pass itself is a pure string function implementing C-139's four layers in order with C-141's
idempotence as a property test (`redact(redact(x)) === redact(x)` for arbitrary `x`). The key test of
C-140 is a separate pure predicate, reused by layers 1 and 2 and by the structured-payload rule that
masks a whole value under a secret-looking mapping key.

`displayMask` lives in the same module precisely so a reader sees both and sees that they are
different (C-142), and it is typed to return a plain string, not `Redacted`, so the two can never be
substituted by accident.

The two *renderings* of C-22 are separate functions with separate types (`RequestSummary`,
`ArgumentSummary`), both producing `Redacted`, so that the audit writer cannot be handed an argument
summary and the dialog cannot be handed a request summary. The specification is emphatic that these
are never substituted; making them distinct types is the cheapest way to guarantee it.

**Consequences accepted.**

- The brand is viral in the types that carry it. That is the cost of C-143 and it is worth paying only
  on the fields the specification names, not on every string in the product.
- The recognized set is closed (C-141), which means the pass will *not* catch a credential shape the
  list does not name. That is specified — "an implementation recognizing exactly those and nothing
  further is conformant" — and it must not be quietly extended, because REQ-TOOLS-171 also guarantees
  that a string carrying none of them reaches its destination unaltered. Adding a heuristic would
  break that guarantee.
- Layer 3's one-value-token rule produces `--token *** def`, which looks like a bug to a first-time
  reader. It is specified verbatim (C-139) and needs a comment citing the requirement, or someone will
  "fix" it.
- C-94 means the audit file has a second producer — user keystrokes taken in the terminal window —
  which must go through the same pass and the same writer (ADR-EXEC-11).

**Revisit if.** A requirement adds a credential prefix or a key word, which would be a change to a
closed vocabulary and therefore a specification amendment; or a surface appears that must show a
stored secret in clear, which C-142 currently forbids outright.

---

### ADR-EXEC-11 — Evidence files are append-and-compact JSONL behind one serialized writer per session

**Decision to be made.** How the permission audit trail and the verification-gate evidence file are
written, given that they are workspace-observable files with a ring-retention rule, two producers, and
a "never break dispatch" obligation.

**Constraints.** C-62 (fixed path, one object per line, decision order, interleaved mode changes),
C-63 (never altered, never inserted ahead, trimmed to the 5000 most recent, a reader sees a suffix
byte-for-byte as written), C-64 (every decision recorded; a raising sink warns and never breaks
dispatch), C-65 (correct session, or no entry at all and no error), C-66 (fixed fields; no argument
values), C-67 (per-entry side effects: issue, timeline event, stream event), C-68 (concurrent deciders,
one ordering), C-94 (a second producer: user terminal input), C-138 (redaction before writing).

**Alternatives.**

1. *SQLite as the store of record, with the JSONL file materialized on read.* Fits the candidate
   stack's persistence choice, gives cheap retention (`DELETE` by rowid) and cheap queries. Against:
   C-62 fixes the file as a workspace-observable artifact and C-63 fixes byte-level properties of it —
   "every retained entry byte-for-byte as it was written". Materializing on read means the file does
   not exist between reads, which is not what "are written to" describes, and a crash would lose
   entries a caller believes were recorded. Materializing on write means a dual write, at which point
   SQLite is a cache for a file that is already the contract.
2. *Plain append with periodic compaction, behind one serialized writer per session file.* Chosen.
3. *Segmented files with whole-segment deletion* (write to `permissions.0.jsonl`, roll, delete old).
   Avoids rewriting a large file. Against C-62's fixed single path: a reader is promised one file at
   one location, and segment rolling would either break that or need a merge on read.

**Recommendation.** Alternative 2. One writer object per session file, owning an in-process queue so
that concurrent deciders serialize into decision order (C-68) and mode-change entries interleave in
the same stream (C-62). Writes are appends. Retention is a compaction step, triggered when the entry
count exceeds the 5000 cap by a hysteresis margin rather than on every entry: read, drop the oldest
prefix, write a temporary file, `fsync`, rename over the original. Rename is what preserves C-63's
"every retained entry byte-for-byte" — a reader either sees the pre-compaction file or the
post-compaction file, never a half-rewritten one. The writer keeps its own entry count so compaction
does not need to re-read to decide.

Both producers go through the same writer: the gate's decisions and mode changes, and the terminal
window's user-originated input entries (C-94), the latter arriving from main and being redacted by the
same pass (C-138) before they reach the queue. Two writers on one file would break C-63's ordering and
its atomicity.

Every write is best-effort with respect to the caller: a failure logs a warning and returns, and the
decision, the mode change or the keystroke proceeds regardless (C-64). Failures are counted so a
persistently failing evidence directory becomes a session issue rather than a silent hole.

The three per-entry side effects of C-67 — the `permission_denied` issue, the `permission_approved`
timeline event, the `permission.decision` stream event — are emitted by the same call that enqueues
the entry, so the four cannot diverge, and none of them is allowed to fail the dispatch either.

Relationship to the candidate stack's event journal: the journal may carry these records as well, and
projecting into the JSONL file from the journal is a legitimate variant. What is not legitimate is
making the file a derived artifact that can be absent or stale, because C-62 and C-63 make it the
observable contract.

**Consequences accepted.**

- Compaction is O(file) and runs on the writer's queue, so it must not run on any path with a latency
  budget. Under ADR-EXEC-01 it is in the runtime, off every interface thread (C-07).
- The 5000-entry cap is per file, not per session-day, so a long session silently loses its early
  history. That is specified (C-63) and must be visible to whoever builds a diagnostics view over the
  file, or they will present a truncated history as a complete one.
- C-65's "a decision taken outside every registered session writes no entry and reports no error"
  means the writer must be *absent*, not failing, in that case — the code path is a no-op, not a
  swallowed error.
- The verification-gate file (REQ-TOOLS-190) uses the same writer with its own path and cap, so the
  retention logic is written once.

**Revisit if.** A requirement adds a query over the audit trail that a linear file cannot serve, at
which point a SQLite index *beside* the file (not instead of it) becomes the shape to consider; or the
cap or the path changes.

---

### ADR-EXEC-12 — Custom tool plugins: the specified plugin language and the chosen stack are incompatible (ESCALATE)

**Decision to be made.** What a custom tool plugin is written in, where it executes, and what
"inside the host process" means once the host process is Node.

**Constraints.** C-144 (plugins are `*.py` files under `<workspace>/.rotaris/plugins`, listed per
persona under `custom_tools:`, each defining exactly one tool definition, loaded when the persona's
agent is built, executing inside the host process with exactly that process's OS privileges and no
confinement of their own), C-145 (discovery is not loading; the inventory lists every `*.py` file and
states in text whether it is loaded and by which personas), C-146 (duplicate names and collisions with
public names are startup errors), C-147 (JSON-expressible arguments and returns; exceptions become
structured tool errors; the same run-scoped context a built-in receives), C-17 (plugin dispatch still
passes the gate), C-01 (one shipped executable, nothing else installed).

**The problem.** The specification fixes the plugin file extension as `.py` in two places — the
settings inventory (REQ-TOOLS-165) and the on-disk layout — and fixes execution as *in-process with
the host's privileges* (REQ-TOOLS-163). A TypeScript/Node host cannot import a Python module into its
own process. This is the point in my slice where a requirement and the candidate stack are genuinely
incompatible, and no amount of implementation cleverness closes it.

**Alternatives.**

1. *Bundle a Python runtime and host plugins in a sidecar process.* Preserves the file format, the
   folder, the per-persona loading and the settings inventory exactly. Against: it violates
   REQ-TOOLS-163's literal "inside the host process" — the privilege statement survives (a sidecar
   run as the same user under no confinement holds the same OS privileges), but the in-process claim
   does not. It sits badly with C-01: shipping a CPython interpreter inside the bundle arguably makes
   a second executable available to an installation, which REQ-STARTUP-002 forbids, and even read
   charitably it adds tens of megabytes and a second supply chain to sign, notarize and update. It
   also needs a serialization boundary that C-147's JSON constraint happens to make tractable.
2. *Change the plugin language to JavaScript/TypeScript.* Plugins become `*.js`/`*.mjs` loaded by
   dynamic `import()` in the runtime, genuinely in-process, genuinely holding the host's privileges,
   with exceptions becoming structured tool errors naturally. Everything else in C-144 to C-147 —
   per-persona loading, one definition per file, duplicate detection, degradation on load failure,
   the inventory tab — is unchanged. Against: it contradicts REQ-TOOLS-165 and the on-disk layout as
   written, and it changes what a user can write, so it is not this slice's decision to take.
3. *Embed Python in WebAssembly.* Keeps `.py` and stays in-process. Against: it cannot satisfy
   REQ-TOOLS-163's premise at all — a WASM Python has no unrestricted filesystem or subprocess access,
   so a plugin would *not* hold the privileges the host holds, and REQ-TOOLS-163's whole point is that
   a plugin is a privileged extension whose confinement the product cannot enforce. It would also be
   an unusual and slow host for a tool that is supposed to be a thin extension point.
4. *Drop custom plugins.* Removes a capability the specification carries. Not this slice's call.

**Recommendation — and it is an escalation, not a decision.**

> **ESCALATE.** The architectural recommendation, if the product owner is willing to amend the
> requirement, is **alternative 2**: plugins are JavaScript or TypeScript modules loaded by dynamic
> `import()` inside the runtime process, with `REQ-TOOLS-165`'s `*.py` and the on-disk layout amended
> to the corresponding extensions. It is the only option that satisfies REQ-TOOLS-163 as written —
> genuinely in-process, genuinely holding the host's privileges — while keeping every other property
> of REQ-TOOLS-161 to REQ-TOOLS-165 intact and costing nothing in bundle size or supply chain. If the
> product owner instead requires that existing Python plugin files keep working, that is a decision to
> take alternative 1 and to accept a bundled interpreter, a second signing and update surface, and a
> re-reading of REQ-TOOLS-163's "inside the host process" as "with the host's privileges". Choosing
> the plugin language changes what a user can write and therefore what the product is; it belongs to
> the product owner.

Whichever is chosen, the surrounding architecture is the same and can be settled now: the loader is
per-persona and explicit (C-145 — the folder never auto-loads), one definition per file, failures
degrade the agent's tool set with a stable reason code plus a session issue (C-15), duplicate
registered names and collisions with public tool names are startup errors (C-146), plugin dispatch
passes the same gate as everything else (C-17), and a plugin receives the same `RunContext` a built-in
receives (C-147, ADR-EXEC-01). The undeclared-capability rule of C-11 applies to plugin tools
unchanged: they declare no facet, and every rule reads them fail-closed in its own direction.

**Consequences accepted.**

- Under either choice, plugins remain unconfined code in a process that holds the user's privileges,
  and no permission rule can change that. REQ-TOOLS-163 says so; the settings inventory should say so
  too, beside the load-state text of C-145, so a user copying a file into that folder understands what
  naming it in `custom_tools:` grants.
- Under alternative 2, ADR-EXEC-01's crash-isolation argument becomes load-bearing rather than
  precautionary: a plugin that throws asynchronously or leaks handles takes down the runtime, not the
  windows.
- Under alternative 1, the plugin sidecar becomes a third process and ADR-EXEC-01's "one runtime"
  premise should be re-opened rather than extended silently.

**Revisit if.** The escalation is decided; or a requirement arrives asking for plugin confinement,
which would contradict REQ-TOOLS-163 and would be a much larger change than a language choice.

---
