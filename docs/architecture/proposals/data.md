# Architecture proposals — DATA slice

Status: **proposal**. Nothing here is approved. The Architecture Gate has not been held and
implementation is not authorised.

Slice owner domains: **06** (git, worktrees, checkpoints, `REQ-GIT`), **08** (requirements board and
traceability, `REQ-TRACE`), **14** (library, artifacts, improvement proposals, `REQ-LIBRARY`),
**15** (settings and configuration, `REQ-CONFIG`).

## Scope of this slice

This slice owns everything the product writes down and everything it reads back: what lives in a
database and what stays as files; how the layered YAML configuration is loaded, merged, validated
and watched; how the per-user desktop preference store relates to that configuration; how Git is
invoked and how worktrees, checkpoints and integration are managed; and how the requirement
delivery and traceability stores behave as they grow.

It does **not** own: the run event journal itself (domain 20, `REQ-EVENTS`), the session snapshot
format (domain 07, `REQ-SESSION`), permission and sandbox policy (domains 05 and 10), or model
routing (domain 04). Where a decision of mine depends on one of those, the dependency is named.

Requirement counts in scope: `REQ-GIT` 161 identifiers (8 withdrawn), `REQ-TRACE` 512 (16
withdrawn), `REQ-LIBRARY` 175 (14 withdrawn), `REQ-CONFIG` 476 (16 withdrawn) — 1,324 identifiers,
1,270 carrying live behaviour, roughly a third of the shipping total.

---

# Part 1 — Extracted constraints

Each constraint is labelled **hard** (the specification fixes an observable only some designs can
produce), **strong hint** (not fixed, but one design makes several requirements natural and the
alternatives make them awkward), or **free** (genuinely an implementation choice).

## A. On-disk shape and file formats

**A1 — The workspace scope is a directory literally named `.rotaris` at the workspace root, and its
internal layout is fixed. (hard)**
`REQ-CONFIG-001`, `REQ-CONFIG-010`, `REQ-GIT-005`, `REQ-GIT-019`, and the `Data & Formats` layouts of
domains 06, 14 and 15 fix, between them: `sessions/<session-id>/`, `worktrees/` (subpath
configurable, `REQ-GIT-073`/`REQ-CONFIG-068`), `worktrees/integrations/<integration-id>/`
(`REQ-GIT-130`), `requirements/worktrees/<unit-dir>/` (fixed, named by **no** configuration key —
`REQ-GIT-137`, `REQ-GIT-138`, `REQ-CONFIG-194`), `requirements/` for delivery records (subpath
configurable, `REQ-CONFIG-192`), `improvement_artifacts/` and its `history/` subtree
(`REQ-LIBRARY-042`, `REQ-LIBRARY-049`), `persona_memory/<persona>.md` (`REQ-LIBRARY-150`),
`plugins/*.py`, `tools/`, `agents.yaml`, `models.yml`, `secrets.yaml`, `rotaris-prompts.json`
(`REQ-LIBRARY-138`) and `integration.lock` (`REQ-GIT-128`).
`REQ-CONFIG-058` withdraws directory adoption outright: the directory is addressed by its current
name only and a directory under any other name is left untouched. There is no migration path to
design and no configurable root.

**A2 — `.rotaris` exclusion is a first-component, case-insensitive, name-based test that never
follows links. (hard)**
`REQ-GIT-003`. The test is applied to the path as the tree names it; a symlink or junction is an
ordinary entry at its own path and its target is never read, written or deleted. `.Rotaris/` and
`.ROTARIS/` are excluded exactly as `.rotaris/` is. Consequences the specification enumerates:
cleanliness (`REQ-GIT-014`), capture (`REQ-GIT-034`), restore (`REQ-GIT-040`), drift
(`REQ-GIT-056`), the Git view's diff totals (`REQ-GIT-105`, `REQ-GIT-107`), and both
base-cleanliness gates (`REQ-GIT-127`, `REQ-GIT-133`). This forbids any path filter implemented by
resolving real paths, and it forbids reusing a gitignore matcher — gitignored paths are excluded
separately and by a different rule (`REQ-GIT-034`, `REQ-GIT-035`).

**A3 — There are three separate per-user stores and they are not interchangeable. (hard)**
(1) The per-user **configuration** directory — `~/.config/rotaris/`,
`~/Library/Application Support/rotaris/`, `%LOCALAPPDATA%\rotaris\rotaris\` (`REQ-CONFIG-001`) —
holding `agents.yaml`, `models.yml`, `secrets.yaml`, `project_settings.yaml`, `tools/`.
(2) The per-user **data** directory, a *different* directory (`REQ-CONFIG-010`, `REQ-CONFIG-011`),
holding provider credentials and `setup/state.json` (`REQ-CONFIG-397`).
(3) The per-user **preference store**, platform-standard for organisation/application pair
`Rotaris`/`Rotaris` (`REQ-SHELL-006`), whose key set is closed and whose keys are slash-namespaced.
`REQ-CONFIG-463`, `REQ-GIT-153` and `REQ-LIBRARY`'s configuration section all state the disjointness
in the same terms: **no key of the layered YAML surface is ever read from or written to the
preference store, and no preference key ever appears in a YAML file.** Domains 06 and 14 mint no
preference key of their own; they rely on `interface/worktreeCleanupPrompt` (`REQ-CONFIG-405`) and
on the pane-layout keys of `REQ-SHELL-069`.
The preference store's *physical path and on-disk encoding are explicitly free* (`REQ-SHELL-006`) —
the only observable obligations are the location convention, no elevation, outside every workspace,
absent-is-not-an-error, and survive-a-restart.

**A4 — The traceability store lives in the user's own repository, not under `.rotaris/`. (hard)**
`REQ-TRACE-001` (default `docs/requirements`, repository-relative and configurable),
`REQ-TRACE-004` (four plain-text bookkeeping artifacts at the store root), `REQ-TRACE-039` (the
generated symbol artifact under `src/`, implementation and test roots), `REQ-TRACE-040` (the layout
configuration is `rotaris-traceability.json` **at the repository root and nowhere else**; no key,
preference or surface renames it or nominates a second location). The requirement documents are the
project's own versioned artifacts. The product reads and, under two named actions only, writes
them — it does not own them and keeps no second copy (`REQ-TRACE-275`: the description is rendered
from the source, "there is no second requirement repository").

**A5 — Every persisted format is fixed, and every one of them is a file a person can open.
(hard)**
YAML: `agents.yaml`, `models.yml`, `secrets.yaml`, `project_settings.yaml` (`REQ-CONFIG-015`
through `REQ-CONFIG-024`, `REQ-CONFIG-199`).
JSON: improvement artifacts and their history, 2-space indent (`REQ-LIBRARY-042`, `REQ-LIBRARY-049`);
`rotaris-prompts.json`, 2-space indent plus trailing newline (`REQ-LIBRARY-138`);
`proposed-requirements.json` in a run's artifact directory (`REQ-TRACE-427`);
`rotaris-traceability.json` (`REQ-TRACE-013`, `REQ-TRACE-040`); the two lock files
(`REQ-GIT-020`, `REQ-GIT-128`); `setup/state.json` (`REQ-CONFIG-397`); `metadata.json`
(`REQ-GIT-018`); session-artifact records and `index.json` (`REQ-LIBRARY-087`).
JSONL, append-only: `timeline.jsonl`, `issues.json`, the evidence streams and `events.jsonl`
(`REQ-GIT-048`, `REQ-GIT-062`, and domains 07 and 20).
Markdown: requirement documents (`REQ-TRACE-001`), artifact sidecars with YAML frontmatter
(`REQ-LIBRARY-090`), persona memory (`REQ-LIBRARY-150`).
TSV: the retired-identifier log (`REQ-TRACE-131`).
Plain text: the three debt baselines (`REQ-TRACE-118` to `REQ-TRACE-120`).
Generated source: the requirement-symbol module (`REQ-TRACE-051` to `REQ-TRACE-059`).
Git objects and refs: checkpoints and improvement checkpoints (`REQ-GIT-029`, `REQ-LIBRARY-067`).

**A6 — No requirement anywhere in the specification names a database, a table, an index, a query,
or a schema migration. (hard, by exhaustion)**
A search of all twenty-one domain documents for `sqlite`, `database`, `SQL`, `b-tree` and `index
file` returns exactly two kinds of hit: Git's own on-disk index, which `REQ-GIT-004` and
`REQ-GIT-030` require to be left byte-identical, and `REQ-STARTUP-087`'s promise that nothing is
registered with an OS package database. The only versioning concept the specification defines is
`schema_version` as a **field written into each record** (`REQ-CONFIG-192`, `REQ-SESSION-013`,
`REQ-EVENTS` envelope), read forward-compatibly and never migrated in place. This is not silence
that leaves the question open; it is a complete enumeration of persisted state in which every entry
is a document.

**A7 — UTF-8, LF, and byte-stability across platforms are contractual for the traceability
artifacts. (hard)**
`REQ-TRACE-006` (read UTF-8 with replacement, normalise CRLF and lone CR to LF *before* parsing or
hashing), `REQ-TRACE-059` (deterministic generation: ascending order, LF, UTF-8, trailing newline —
generating from a reversed input list produces byte-identical output), `REQ-TRACE-126`,
`REQ-TRACE-137`, `REQ-TRACE-495`. `REQ-CONFIG-462` fixes UTF-8 for configuration files, accepts and
discards a BOM, and makes an undecodable primary file fatal with its own distinct message.
`REQ-EVENTS-090` fixes LF for the event store on every platform.

**A8 — Sort order is byte order, everywhere, by requirement. (hard)**
`REQ-GIT-057` fixes ascending path order as ascending byte order of the path's UTF-8 encoding,
"deterministic and independent of locale and of platform", and applies it to the whole of domain 06.
`REQ-TRACE-005` sorts the store scan by repository-relative POSIX path string; `REQ-TRACE-494`
requires every ordered output to be explicitly sorted and enumerates each one. `REQ-LIBRARY-045`
sorts artifact ids lexicographically by file stem; `REQ-LIBRARY-046` names covering artifacts in
ascending lexicographic order. No locale-aware collation may be used anywhere in this slice.

## B. Write discipline: atomicity, ordering, durability

**B1 — Atomic whole-file replacement is required for every store this slice owns. (hard)**
Stated independently in five places, with the same mechanism each time: stage beside the target,
then replace.
`REQ-CONFIG-027` (bootstrap: staged beside the target, mode `0644`, "a crash mid-write can never
leave a truncated `agents.yaml`, and no temporary file is left behind on any path"),
`REQ-CONFIG-212` (snapshot writes), `REQ-CONFIG-216` (secrets), `REQ-CONFIG-013` (the `.gitignore`
maintenance write), `REQ-CONFIG-444` (every writer of `agents.yaml` leaves mode `0644`),
`REQ-LIBRARY-043` (improvement artifacts: "at any instant a concurrent read returns either the
complete previous file or the complete new one, never a partial, empty, or unparseable file"),
`REQ-LIBRARY-049` (history versions), `REQ-LIBRARY-087` (session artifact store),
`REQ-LIBRARY-138` (prompts, temp prefix `.rotaris-prompts-`), `REQ-LIBRARY-151` (persona memory),
`REQ-TRACE-061` (generated artifact: "a temporary file created in the target's own parent
directory"), `REQ-TRACE-126` (baselines), `REQ-TRACE-137` (tombstone log — atomic *because* the log
is append-only evidence that cannot be reconstructed), `REQ-EVENTS-091` (the event trim replaces the
file in one atomic step).

**B2 — The temporary file must be created in the target's own parent directory. (hard)**
`REQ-TRACE-061` and `REQ-TRACE-126` say so explicitly. This is not a style note: a rename is only
atomic within a filesystem, and the workspace, the per-user config directory and the per-user data
directory can each be on a different volume. It also interacts with **B3**.

**B3 — A transient file must never be mistakable for a real record, and must be gone afterwards
whether the write succeeded or failed. (hard)**
`REQ-LIBRARY-043` states both halves for the improvement store, and the listing rule it must not
collide with is `REQ-LIBRARY-045` (ids are file stems, sorted lexicographically). `REQ-LIBRARY-049`
adds that `history/` can never collide with an artifact file because artifact ids carry the
`impart_` prefix and `history` is not a `.json` file at that level. `REQ-LIBRARY-138` fixes the
prompts temp prefix as `.rotaris-prompts-`. `REQ-CONFIG-027` and `REQ-CONFIG-212` require no
temporary file left behind on any path. `REQ-TRACE-061` requires best-effort removal on failure and
re-raise.

**B4 — Windows replace contention must be retried, and two domains fix two different retry
schedules. (hard, with a conflict to resolve)**
`REQ-LIBRARY-043`: "up to 5 attempts in total, with a non-zero pause before each retry"; **all 5
attempts must complete within 1 second of the first**; the individual delays are explicitly not
observable and must not be relied on.
`REQ-SESSION-033` (adjacent slice, quoted in domain 07's constants table): 5 attempts, backoff
`0.05 / 0.1 / 0.2 / 0.4 / 0.8 s` — which sums to 1.55 s and therefore **cannot** satisfy
`REQ-LIBRARY-043`'s one-second bound.
The two are compatible only if the retry schedule is a parameter of the write primitive rather than
a constant inside it. Recorded as open question **OQ-3**.

**B5 — File mode `0644` on POSIX for every `agents.yaml` writer and for the discovery snapshot;
platform default where there is no POSIX mode. (hard)**
`REQ-CONFIG-027`, `REQ-CONFIG-212`, `REQ-CONFIG-248`, `REQ-CONFIG-441`, `REQ-CONFIG-444`.
Note the asymmetry: `secrets.yaml` is *not* given a mode by `REQ-CONFIG-216`, which requires only
atomicity, directory creation, and staged-file removal on failure.

**B6 — Cross-file write ordering is fixed in five places, and each ordering exists to make a crash
survivable. (hard)**
- The retired-identifier log is written **before** the new generated artifact, "so that a crash
  between the two leaves the identifier recorded rather than forgotten" (`REQ-TRACE-133`).
- A `checkpoint.created` event does not become observable until the session snapshot lists the
  checkpoint, the list has been trimmed to the retention limit with the trimmed refs deleted, and
  `timeline.jsonl` holds the entry (`REQ-GIT-048`). A consumer reading the snapshot on receipt of
  the event always finds both the checkpoint and the honoured retention limit.
- A safety checkpoint is recorded, and must succeed, before a restore touches a file
  (`REQ-GIT-058` gate 5); failure to create or persist it stops the restore with no file modified.
- A `pre_rollback` checkpoint is recorded before an improvement rollback restores the tree; failure
  blocks — "an irreversible rollback is forbidden" (`REQ-LIBRARY-075`, `REQ-LIBRARY-163`).
- Retention trims the Git refs and the recorded list **together**, so no operation of domain 06 ever
  leaves a recorded checkpoint without its ref (`REQ-GIT-049`).

**B7 — Some writes are best-effort by requirement, and their failure must not fail the operation.
(hard)**
`REQ-LIBRARY-047`: when the artifact file is written but its history version cannot be, the save
**still reports success**, the user's change still takes effect, and the failure appears only in the
application log — "review decisions, edits, and deletions therefore keep working in a workspace
whose `history/` directory cannot be written."
`REQ-CONFIG-013`: every failure of the `.gitignore` maintenance write is swallowed and never fails
the configuration load.
`REQ-GIT-069`: checkpoint ref cleanup on session deletion is best-effort and never blocks deletion.
`REQ-GIT-133`: the integration worktree removal after a successful promotion is best-effort and a
failure does not turn a completed promotion into a reported failure.
`REQ-GIT-045`: automatic capture never raises and never aborts the run.

**B8 — "No surface writes a configuration it cannot load back." (hard)**
`REQ-CONFIG-458`. Reinforced by `REQ-CONFIG-442`: the scoped per-field writer **refuses** when the
existing file cannot be parsed or parses to a non-mapping — nothing is written, the file is left
exactly as it stands, and the user is told which file and what the parse fault was. And by
`REQ-CONFIG-256`/`REQ-CONFIG-259`: the desktop save refuses a non-mapping file with an error
identifying which file. `REQ-CONFIG-260` requires the whole save to be validated **before any file
is touched**, so a rejected save leaves the workspace file byte-identical and still loadable.
The one deliberate exception is `REQ-CONFIG-257`: a pre-existing non-mapping value *at one of the
sections the desktop save writes into* is silently replaced with a fresh mapping.

**B9 — Writers preserve key order and lose comments. (hard)**
`REQ-CONFIG-248` and `REQ-CONFIG-441`: written atomically "with the file's key order preserved and
never alphabetized". `REQ-CONFIG-199`: the discovery snapshot is written with insertion order
preserved, not alphabetised. `REQ-CONFIG-252` is explicit that everything the startup-preference
write does not touch round-trips through parse-and-re-emit, and that **"comments and formatting are
lost while content is preserved — the observable cost of editing models from a UI"**.
Preserving comments would exceed the requirement rather than violate it, and it changes what a user
sees; see **ESC-2**.

**B10 — Reading a workspace never rewrites it. (hard)**
`REQ-TRACE-090` (verification is pure: returns lists, logs nothing, writes nothing),
`REQ-TRACE-152` (the toolchain writes *only* under the regeneration and baseline-update actions),
`REQ-TRACE-408` (showing an offer, dismissing one, opening the board, reading it and changing the
grouping axis each write nothing), `REQ-TRACE-510` (baseline update is invoked deliberately and is
never a consequence of opening or reading the board), `REQ-LIBRARY-051` ("opening a workspace never
rewrites untouched files"), `REQ-CONFIG-419` (no reload path may emit a change notification; a
reload must never write back what it just read), `REQ-TRACE-497` (a write produced by rendering,
dismissing, opening, reading or re-grouping is never observable).
The single stated exception is `REQ-CONFIG-013`'s best-effort `.gitignore` line, which is a write
performed on **every** configuration load.

## C. Concurrency

**C1 — The document stores are coordinated by atomic replacement alone. There is no locking, and
this is stated as a decision, not an omission. (hard)**
`REQ-LIBRARY-042`: "Coordination between processes goes no further than the whole-file atomic
replacement of `REQ-LIBRARY-043` and `REQ-LIBRARY-158` — there is no locking. Every mutation MUST
therefore be a read-modify-write against what the store holds at that moment: the writer re-reads
the artifact file immediately before applying the change and writes back that freshly read state
with the change applied, never a copy a surface has been holding on screen." Losing one of two
genuinely interleaved decisions is an accepted outcome; the later replacement wins whole.
`REQ-LIBRARY-158` repeats it for the session artifact store and adds that within one process
mutations *are* serialised.
`REQ-TRACE-502`: "Concurrent invocations SHALL be safe without any lock, lease or coordination
file… **no invocation SHALL wait for another** … An invocation SHALL NEVER fail, hang or leave a
lock behind because another was running." A check running beside a regeneration may legitimately
report the artifact stale.
This is the single most consequential constraint in the slice. A store that answers a concurrent
writer with a *busy* error, or that makes one writer wait, does not produce these observables.

**C2 — Exactly two lock files exist, and both have fixed content and fixed reclaim rules. (hard)**
Session lock `<session-dir>/lock`, exclusive-create, content
`{"pid": int, "host": string, "acquired_at": ISO-8601 UTC}` (`REQ-GIT-020`, restated identically by
`REQ-SESSION` domain 07). **At most one reclaim retry per acquisition** — so a lock another party
recreates continuously cannot make an acquisition loop. A lock recorded by another host, and a lock
whose content cannot be read or parsed, are treated as held by a live process and are **never**
reclaimed automatically, by an acquisition or by any repair.
Workspace integration lock `<workspace>/.rotaris/integration.lock`, exclusive-create, content
`{"session_id", "pid", "host", "started_at"}`, same reaping rule (`REQ-GIT-128`).
Exclusive-create semantics (`O_EXCL`) is the mechanism named: "of two processes racing for the same
session lock exactly one acquires it and the other does not run."

**C3 — Every liveness ambiguity resolves toward "live". (hard)**
`REQ-GIT-093`: the probe asks one question only — does a process bearing the recorded pid exist on
this machine now — and does **not** attempt to confirm it is the same process that took the lock. A
recycled pid answers yes and the session is reported live; a platform that still reports an exited
process as present answers yes; a lock from another host is not probed at all. `REQ-GIT-150`,
`REQ-GIT-160`, `REQ-GIT-092`. The cost of each such verdict is a refusal that names a remedy, which
the domain prefers to a restore racing a live run.

**C4 — Single-flight rules, per subject. (hard)**
- At most one desktop checkpoint operation in flight; a request arriving while another is in flight,
  or during shutdown, is **declined** with a stated toast (`REQ-GIT-091`, `REQ-GIT-145`).
- One integration per base workspace, enforced by the lock file (`REQ-GIT-128`, `REQ-GIT-136`).
- One run per session, enforced by the session lock (`REQ-GIT-020`).
- At most one traceability operation *of a given kind* per workspace; a second request is **refused
  with a stated reason rather than queued or raced** (`REQ-TRACE-512`).
- At most one state-changing board action per requirement; a second is refused with a stated reason
  and writes nothing, "rather than being queued behind the first or racing it". No bound at all on
  concurrent actions across *different* requirements (`REQ-TRACE-388`).
- One improvement analysis at a time, **in the order the runs that produced them finished**, so
  artifacts and notices appear in that order and never interleave (`REQ-LIBRARY-123`).
- Requirement refresh passes: starting one while another is in flight returns false rather than
  queueing (`REQ-TRACE-229`); a batch arriving during an in-flight read is re-attempted **150 ms**
  later, and that delay is explicitly *not* a debounce (`REQ-TRACE-350`).
- Two threads opening a cold board read the workspace source **once**: the first open coalesces
  concurrent reads (`REQ-TRACE-349`).

**C5 — There is no ceiling on concurrent isolated runs. (hard)**
`REQ-GIT-145`: "no fixed ceiling on how many isolated runs may proceed at once — host resources are
the only limit." Every store in this slice must therefore tolerate N concurrent writers in one
workspace, where N is unbounded, under **C1**'s no-lock discipline.

**C6 — A cancelled pass never blanks the last good state. (hard)**
`REQ-TRACE-223`, `REQ-TRACE-227` (cancellation never abandons the pass: rules already applied are
not rolled back, the projection is still computed, the result is still delivered),
`REQ-TRACE-338` and `REQ-TRACE-379` (a failed evaluation or unavailable projection keeps the last
good board and never falls back to a locally computed one), `REQ-TRACE-224` (a fresh token per pass;
a shared token would leave every pass after the first already cancelled).

## D. Configuration load semantics

**D1 — Five layers, fixed and total, with no sixth and no per-key inversion. (hard)**
`REQ-CONFIG-031`: built-in defaults → auto-discovered tool servers → the global discovery snapshot →
global `agents.yaml` + `models.yml` → workspace `agents.yaml` + `models.yml`. `REQ-CONFIG-449`.
`REQ-CONFIG-234` and `REQ-CONFIG-235` withdraw the sixth layer explicitly: there is no command line
with which to name a configuration file, so no such file exists.
Within one scope, that scope's `models.yml` overlays that scope's `agents.yaml` `models:` block per
field, and a global `models.yml` still loses to a workspace `agents.yaml` (`REQ-CONFIG-005`).

**D2 — Four merge classes with different overlay depths, and lists never append anywhere. (hard)**
`REQ-CONFIG-040`. Replace-if-not-null (`REQ-CONFIG-041`): a higher layer replaces only with a
non-null value. Named-entry (`REQ-CONFIG-043`): entries union by name; where both values are
mappings the entry's **immediate** fields are overlaid, otherwise the higher value replaces
outright; the overlay reaches exactly one level — top-level key → named entry → whole field value
(`REQ-CONFIG-046`). Section (`REQ-CONFIG-047`): overlays per field and is **recursive through
nested mappings at any depth** (`REQ-CONFIG-048`), stopping at any value that is not a mapping.
Computed (`REQ-CONFIG-049`): produced by the loader, never merged from a file; a `workspace_root`
written into a file has no effect.
`REQ-CONFIG-050` and `REQ-CONFIG-450`: **no key anywhere merges list contents.** Role tool lists,
verification checks, hook entries, requirement sources, refresh triggers, escalation triggers,
source-file extensions, host lists, writable roots — every one is replaced by a layer that states
it. `REQ-CONFIG-461` makes these the *only* merge rules in the product and says a shipped example
describing whole-document replacement is wrong and is corrected, not honoured.

**D3 — Three-state and four-state distinctions must survive the merge. (hard — and this is a
representation constraint, not a policy one)**
`REQ-CONFIG-056` names three deliberately three-valued settings that must stay distinguishable:
`verifier.checks` (unset = auto-detect, `[]` = explicitly no verification, a list = that suite),
`checkpoints.enabled` (unset / `true` / `false` — and `REQ-CONFIG-159`, `REQ-GIT-044`,
`REQ-GIT-070` all restate that a written `false` stays off even for an isolated session), and
`hooks.entries` (`REQ-CONFIG-055`: a bare `entries:` means inherit; `entries: []` means an explicit
empty list that replaces).
`REQ-CONFIG-057` adds a fourth: a per-model `max_parallel` written explicitly as `null` is
distinguishable from an omitted one and defeats the provider-conditional default of
`REQ-CONFIG-095`.
`REQ-CONFIG-052` / `REQ-CONFIG-451`: at the top level `null` and absent are behaviourally identical
and a null cannot clear an inherited value. `REQ-CONFIG-053`: inside a named entry a null **can**
clear, because entry fields are overlaid without a null guard.
Taken together: the loaded document model must distinguish *absent*, *explicit null*, and *value*,
and must apply a **different null policy per merge class**. A model that maps YAML `null` onto a
language's own nullish value, or that treats "absent" and "null" as one, cannot produce these
observables.
`REQ-CONFIG-054`: a bare section key (`verifier:`, `checkpoints:`, `initialization:`,
`project_init:`, `hooks:` with no value) means "unset" and is coerced to an empty section rather
than raising a type error.

**D4 — Passes run in a fixed order relative to each other. (hard)**
Per scope, **before** any cross-scope merge: legacy role-name canonicalisation (`REQ-CONFIG-062`)
and hook scope stamping (`REQ-CONFIG-151` — provenance is unrecoverable once a higher layer's list
has replaced a lower one; `REQ-CONFIG-452` calls dropping superseded lists a privilege-reduction
vector). `hooks:` shorthand normalisation also happens before validation and merging
(`REQ-CONFIG-148`).
After the merge: tier-alias substitution (`REQ-CONFIG-073`) **before** per-role reasoning synthesis
(`REQ-CONFIG-036`); `fallback_model` resolution before referential validation (`REQ-CONFIG-067`);
schema validation; tool-server provenance after validation but before secret resolution
(`REQ-CONFIG-038`); known-token-limit back-fill after validation (`REQ-CONFIG-037`,
`REQ-CONFIG-096`); placeholder and secret resolution after validation, **so a stored secret value
can never itself be the cause of a schema failure** (`REQ-CONFIG-035`, `REQ-CONFIG-037`).
Auto-discovered locations are applied user-level first then project-level, so a project-level
declaration of the same server name wins, and the winning source per name is recorded and observable
(`REQ-CONFIG-039`, `REQ-CONFIG-222`).

**D5 — A completed load is fully resolved; no caller finishes the job. (hard)**
`REQ-CONFIG-035` enumerates what must already hold: `workspace_root` resolved; no reference field
still holding a tier alias; the synthetic reasoning entries of `REQ-CONFIG-076`/`REQ-CONFIG-079`
existing and pointed at; the schema satisfied; token limits back-filled only where the entry stated
neither; every `mcp_servers:` entry carrying a provenance value; every environment placeholder and
stored secret resolved.

**D6 — No read cache for the primary files; a `(mtime, size)` cache for the snapshot, with the
false negative accepted. (hard)**
`REQ-CONFIG-014`: "The configuration file set has no read cache: every load re-reads `agents.yaml`
and `models.yml` from disk."
`REQ-CONFIG-211`: an updated `project_settings.yaml` is observed on the next load whenever its
modification time **or** its byte size differs from the previous read. A rewrite leaving both
unchanged is not observed before restart, and **that is accepted rather than defended against** —
the product's own writer always advances the mtime (`REQ-CONFIG-212`), so the unobserved case needs
a deliberate external writer. "No content hashing is performed on this path."
`REQ-CONFIG-210`: any snapshot read failure drops the cached entry for that path.

**D7 — The severity taxonomy is a closed, total contract across the whole load. (hard)**
`REQ-CONFIG-024`, `REQ-CONFIG-233`. **Fatal**: YAML syntax error; a primary file that is not valid
UTF-8; a non-mapping top level; a `hooks:` value that is neither mapping nor list; a bad hook event,
matcher or blank command; a bad confinement mode, egress disposition or relative writable root; a
bad check name, command, `cwd` or `failure_pattern`; a run-start mode outside `auto`/`plan`; a
duplicate check name or duplicate requirement source id; **an unknown key under `requirements:`**.
**Silent**: missing or empty file; extra top-level keys in `models.yml`.
**Warn and continue**: an unknown top-level key, and an unknown key inside any merged section other
than `requirements`; a corrupt discovery snapshot; a circular startup-model alias chain; a reasoning
override on an unconfigured or missing base model; a tool-server `url` carrying an unresolved
placeholder.
**Coerce**: unknown permission mode → `restricted`; unknown non-interactive approval policy →
behaves as `deny`; unknown board role name → the workspace default role.
**Report, not fatal**: every referential error.
Note the deliberate inversion: `REQ-CONFIG-183` makes an unknown key **anywhere** under
`requirements:` a hard load failure — "the opposite of the top-level policy". And
`REQ-CONFIG-476` deliberately withholds coercion from `run_start_mode` because a mis-spelled `plan`
read as `auto` would remove a gate the user asked for.

**D8 — Validation happens on assignment as well as on load, for two sections. (hard)**
`REQ-CONFIG-111` (`runtime:`) and `REQ-CONFIG-183` (`requirements:`): "so a settings surface writing
an invalid value onto a loaded configuration is refused at the moment of the write, not silently at
the next load." `REQ-CONFIG-436` closes the loop: every value a security control produces is
assigned through the validating runtime policy **before any file is written**, so a value the schema
would reject is refused at the control that produced it and never reaches a file.
This forbids a validate-once-at-parse design. The loaded configuration object is itself a validating
model.

**D9 — Two parsers for one file, deliberately. (hard, and odd)**
`REQ-CONFIG-040` and the `Data & Formats` table: `rotaris.delegation_strategy` is "a workspace-only,
desktop-only key read by a **separate parse of the same file**, with no global equivalent, no merge
semantics and no schema validation"; accepted values `orchestrator`/`swarm`/`single`, anything else
leaves the default. It is a top-level key belonging to no merge class, so it "contributes nothing to
the merged configuration and is neither reported nor rejected" — yet it is read.

**D10 — YAML must be parsed in a safe subset, and YAML 1.1 boolean folding must be undone
symmetrically. (hard — this constrains the library choice)**
`REQ-CONFIG-015`: "parsed in a safe subset that cannot construct arbitrary language objects from
document tags."
`REQ-CONFIG-020`: for any field whose accepted values are a string vocabulary, a value the parser
folded to a boolean is coerced back to a lower-cased string before validation — `off`/`false`/`no`
become `"off"`/`"false"`/`"no"`, and `on`/`true`/`yes` become `"on"`/`"true"`/`"yes"`. The coerced
string is then validated normally, so `sandbox_mode: off` loads as the accepted value `off` while
`sandbox_mode: on` is rejected as an **unrecognised confinement mode naming the accepted list**
(`REQ-CONFIG-127`) — "never as a type error, and never silently accepted."
`REQ-CONFIG-090` requires the same tolerance for a model's `thinking`: `true` reads as `high`,
`false` reads as unset.
A YAML 1.2 parser does not fold `on`/`off`/`yes`/`no` at all, in which case they arrive as the
strings the requirement demands and the coercion is a no-op for those spellings — but `true`/`false`
still fold under 1.2 and must still be un-folded. A YAML 1.1 parser folds all six. Either is
workable; the coercion must be written for whichever is chosen, and must be applied per-field
against a vocabulary rather than globally.

**D11 — A rejected configuration value fails the whole load, and nothing that depends on it starts.
(hard)**
`REQ-GIT-071` states the rule for the whole of domain 06 and `REQ-GIT-138` relies on it: "the load
fails as a whole rather than falling back to a default or repairing the value, nothing that depends
on that configuration starts, **no session directory and no lock are created**, and the failure is
reported on the surface that asked for the load as an error the user can act on, the application
continuing to run with no workspace configuration loaded." That last clause is the important one:
a fatal configuration error is fatal to the *workspace*, not to the *process*.
`REQ-CONFIG-246` adds that for a run no person is watching, referential errors are **always** fatal
to that run — there is no inline sign-in or model editor to offer.

**D12 — Branch-namespace validation happens at configuration load, on a rendered example. (hard)**
`REQ-GIT-138`: a `branch_template` or `integration_branch_template` that would produce names under
`rotaris/session/` or `rotaris/integration/` is rejected **while configuration is loaded**, so that
nothing is ever created from it. And the check must be made on a rendered example, not on the
literal template prefix: every placeholder is substituted with a fixed non-empty sample value, the
result is slugged and assembled exactly as `REQ-GIT-139` assembles a real name, and the finished
example is tested for the forbidden prefixes. "A template that reaches a forbidden namespace only
after substitution is therefore caught, which a literal prefix test would miss."
This puts the branch-name slugging and assembly rules of `REQ-GIT-139` — lower-case fold, replace
each maximal run outside `a–z 0–9 . _ -` with a single `-`, strip leading and trailing `-` and `.`,
truncate to 40 characters, strip a trailing `-` or `.` left by truncation, fall back to `x` — inside
the configuration validator, and it puts the `REQ-GIT-009` branch-name rule set there too.
`worktree_storage_subpath` is rejected when it resolves to, or inside, the fixed requirement
checkout directory of `REQ-GIT-137`.

## E. When a change takes effect

**E1 — Three tiers, and Tier B is an architectural requirement, not a UI convenience. (hard)**
`REQ-CONFIG-261` (**Tier A**): a desktop settings save re-runs the configuration load at the end,
so a saved change is reflected within the same action, with no restart.
`REQ-CONFIG-262` (**Tier B**): "When a run starts, the loaded configuration is copied and the
settings store's **current** values are layered on top, so what a run uses is what is on screen at
that moment, not whatever was last committed to the file. The dirty flag therefore governs the
**file**, not the **next run**."
`REQ-CONFIG-263` fixes the overlay contents, and one clause is load-bearing: the five model slots
are overlaid "**synthesizing slot-level reasoning variants on the fly exactly as the loader does**".
The loader's synthesis step (`REQ-CONFIG-076`, `REQ-CONFIG-079`, `REQ-CONFIG-081`) must therefore be
a callable transform over a configuration value, not a phase buried inside a file-reading pipeline.
The overlay also strips the delegate tool from every role under a `single` delegation strategy, and
filters tool servers to those both enabled and available in the UI.
`REQ-CONFIG-265` (**Tier C**): everything else — verification, hooks, checkpoints, requirements,
transcript, project classification, model entries beyond the five slots, tool-server definitions —
takes effect at the next workspace open or application start.
`REQ-CONFIG-264`: the permission-mode overlay sets the runtime field only; per-role permission pins
are never widened by it.

**E2 — Bounds on observing an out-of-process change. (hard)**
`REQ-CONFIG-266`: the discovery snapshot is picked up on the `(mtime, size)` rule of
`REQ-CONFIG-211`; a change to the **published desktop artifact set** — any addition, removal or
revision in the workspace's artifact library, whoever made it — is reflected within **750 ms**, and
that figure is an upper bound on how long the change may take to appear, **not a polling interval**;
a change made inside this process appears without waiting for it. The resolved per-user
configuration directory is fixed for the life of the process, so a change to it takes a restart.

**E3 — Two settings surfaces share one save path, and the coupling is flagged for a decision.
(hard, with an escalation)**
`REQ-CONFIG-288`: "The same save path is shared with the composer's permission-mode control, with
the consequence that choosing a permission mode there **also commits every other pending Settings
edit**. A rewrite must decide about this cross-surface coupling explicitly." See **ESC-1**.

**E4 — Five persistence destinations, only one of which participates in Save/Discard. (hard)**
`REQ-CONFIG-417`, `REQ-CONFIG-418`. (1) workspace/global YAML configuration, committed by Save —
with one stated exception, the diagnostics toggle of `REQ-CONFIG-471`, which writes its single key
immediately through the scoped per-field writer and is consequently not undone by Discard;
(2) desktop preferences, written the moment the control moves; (3) the external hook policy store,
written immediately by the hook checkboxes (`REQ-CONFIG-360`); (4) provider credential storage and
the provider catalogue, written asynchronously and entirely outside the dirty flag; (5) theme and
reduced motion, persisted by their own services. Tool-server enablement is **not** a further
destination: toggling a server records a session-scoped override that a run picks up per
`REQ-CONFIG-263`.

## F. Git execution

**F1 — Every Git operation is a bounded external invocation, and the bounds differ by layer.
(hard)**
`REQ-GIT-146` gathers them: worktree-layer 30 s per invocation (`REQ-GIT-013`); checkpoint
ref-only operations 30 s and every checkpoint operation that inspects or writes tree content 300 s
(`REQ-GIT-033`); desktop Git reads 15 s each and the Git version check 15 s (`REQ-GIT-102`,
`REQ-GIT-103`); requirement-execution 30 s (`REQ-GIT-141`); the traceability layer's version-control
queries 30 s (`REQ-TRACE-170`, `REQ-TRACE-201`).
`REQ-GIT-033` is explicit that the limits are "the whole time budget and not a target: a repository
so large that staging or diffing it cannot finish inside 300 seconds SHALL produce this timeout
error rather than a longer wait, and that outcome is a correct result of this requirement and not a
defect in it." `REQ-TRACE-170`: "**No operation SHALL be able to block indefinitely on a child
process.**"

**F2 — Git's own stderr is the error text, verbatim, with exactly one exception. (hard)**
`REQ-GIT-013`: cannot start → `Could not run Git: <detail>`; non-zero exit → Git's stderr verbatim,
else stdout, else `git command failed`; timeout → `Git timed out after 30s: <command>`.
`REQ-GIT-033` fixes how `<command>` is rendered: the Git subcommand name followed by the arguments
passed to it, in invocation order, separated by single spaces, with the executable path omitted and
**"with no quoting, eliding, or truncation of any argument."**
`REQ-GIT-012` is the only case in the whole domain where Git's wording is replaced, and it is
triggered by a case-insensitive substring match against three specific phrases, with the *complete*
Git failure text — not merely the substring that matched — reproduced on line 2.
`REQ-GIT-010` matches three further case-insensitive Git message phrases to decide whether a failure
counts as a branch collision; "every other failure propagates unchanged without retrying."
`REQ-GIT-110`, `REQ-GIT-111`, `REQ-GIT-116`: Git failures surface Git's own wording.
Any layer that normalises, wraps, localises or structures Git's error output destroys these
observables.

**F3 — Git output is decoded UTF-8 with U+FFFD replacement, never strictly. (hard)**
`REQ-GIT-013`: "so a Git message carrying arbitrary bytes still yields a reported error rather than
an aborted operation." Same rule for repository files in `REQ-TRACE-006` and `REQ-TRACE-081`.

**F4 — Fourteen named Git environment variables must be neutralised, and the repository and working
tree named explicitly on every invocation. (hard)**
`REQ-GIT-031`: `GIT_INDEX_FILE`, `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`,
`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`,
`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_NAME`,
`GIT_COMMITTER_EMAIL`, `GIT_COMMITTER_DATE`. Each is neutralised for the invocation; the checkpoint
taken from inside a Git hook must be identical to one taken with none of them set, and the file
`GIT_INDEX_FILE` named must be byte-identical afterwards. **Every other environment variable is
passed through unchanged**, "since a checkpoint must still run under the user's PATH and locale."

**F5 — A checkpoint must leave the user's entire Git state byte-identical. (hard — the sharpest
mechanism constraint in the slice)**
`REQ-GIT-004`: identical before and after — the checked-out branch and the commit it points at, HEAD
including a detached HEAD, the symbolic-ref target, **the on-disk index file byte for byte**, the
reflogs of HEAD and of every branch, the stash, the set of branches, and the set of staged entries.
`REQ-GIT-030` adds: no reflog entry is written for HEAD or for any branch, no repack or garbage
collection is started, and **the repository's index file is never refreshed, rewritten, or locked**.
The only addition is one ref under `refs/rotaris/checkpoints/` and the objects it reaches.
This rules out `git stash`, `git add`, `git commit`, `git checkout`, `git reset`, and any temporary
branch. It requires a private index and object-level plumbing. `REQ-GIT-043` adds that this must
work on a detached HEAD and inside a linked worktree, with the ref stored in the shared repository
and the restore affecting only the linked tree.

**F6 — Capture content rules are exact. (hard)**
`REQ-GIT-034`: every tracked path at its current working-tree content **including tracked paths that
gitignore rules would otherwise cover**; plus every untracked path gitignore does not cover when
`checkpoints.include_untracked` is true; minus everything under `.rotaris/`; minus a tracked path
deleted in the working tree. Executable bit preserved. A symlink recorded as a symlink carrying its
target text, never as a copy of what it points at. A submodule recorded as the commit id the
containing repository currently has for it and nothing more — its own working tree never inspected,
captured or restored. Parent is HEAD, parentless when there is no HEAD.
The nothing-to-record comparison is made against **HEAD's tree with every excluded path removed from
it**, "so a repository that already tracks paths under `.rotaris/` can still report 'nothing to
record'".
`REQ-GIT-039`: rename detection at a similarity threshold of **50 per cent**, copy detection
**disabled**, and a status letter outside `A`/`D`/`M`/`R` carried through unchanged so a future Git
cannot make a preview unrenderable.

**F7 — Ref namespaces are fixed and disjoint; sequence numbers are never reused; deletions are
compare-and-swap. (hard)**
`REQ-GIT-029`: `refs/rotaris/checkpoints/<session-id>/<sequence>`.
`REQ-LIBRARY-067`: `refs/rotaris/improvements/<artifact_id>/<sequence>`, "disjoint from the
session-checkpoint namespace… so that neither feature's pruning can delete the other's refs".
`REQ-GIT-046` and `REQ-GIT-059`: every capture takes its sequence from **the maximum of two
sources** — the highest sequence in the recorded checkpoint list and the highest among the live refs
in that namespace — plus one. This holds numbering climbing across a prune, across a resume after an
interruption, and across a ref deleted from outside. When the live refs cannot be listed at all, the
recorded list alone is used and the capture still refuses to overwrite an existing ref.
`REQ-LIBRARY-071` states the same rule for improvement checkpoints and adds that the newest
`pre_improvement` checkpoint is never dropped by pruning.
`REQ-GIT-041`: "Ref deletions verify the recorded commit id at deletion time so a concurrently moved
ref is not silently clobbered." That is `git update-ref -d <ref> <oldvalue>` semantics, and it is the
only compare-and-swap primitive named anywhere in this slice.
`REQ-GIT-037`: listing enumerates only that session's namespace — a session id that is a prefix of
another never picks up the other's refs — keeps only numeric sequence suffixes, and sorts
**numerically** (10 after 9, not between 1 and 2).
`REQ-GIT-036`: session ids used in refs are restricted to `A–Z a–z 0–9 . _ -`, non-empty, not
starting `.`, not ending `.lock`, checked **before any Git call**.

**F8 — Branch namespaces are fixed and mutually disjoint. (hard)**
`rotaris/session/<session-id>` (`REQ-GIT-007`) with deterministic collision suffixes `-2`, `-3`, …
up to 50 attempts (`REQ-GIT-010`); `rotaris/integration/<integration-session-id>` (`REQ-GIT-130`);
`rotaris/req/…` from templates (`REQ-GIT-074`, `REQ-GIT-139`). `REQ-GIT-138` keeps the three
disjoint and puts the check at configuration load (see **D12**).
`REQ-GIT-009` fixes the branch-name rule set, and fixes an asymmetry that matters: a name the system
derives for itself is transformed into normal form and created under the transformed name, while a
name supplied by a caller or typed by a user is **never** transformed — it is accepted only if
already in normal form, so an explicitly supplied accepted name is always byte-identical to the
branch created from it. `REQ-GIT-116` requires the dialog's branch check to be "the whole rule set
of `REQ-GIT-009` and nothing narrower".

**F9 — No network Git subcommand, ever, and no write to the user's Git configuration. (hard)**
`REQ-GIT-001`: never `push`, `pull`, `fetch`, `clone`, `remote update`, `ls-remote`, "or any other
Git subcommand that opens a network connection". The checkable consequence is that with an
unreachable remote every operation produces the same user-visible result inside the same time
bounds. The only place a remote is named at all is the locally stored upstream ref, used for the
ahead/behind counters of `REQ-GIT-105`.
`REQ-GIT-012` and `REQ-GIT-114`: "No operation in this domain SHALL write to the user's Git
configuration" — including the long-path remedy, which *tells* the user the command rather than
running it. `REQ-GIT-114` also refuses the repository-setup offer outright when no Git identity is
configured, rather than inventing one.

**F10 — Repository detection asks Git, not the filesystem. (hard)**
`REQ-GIT-103`: whether the folder is a repository is decided by a Git query; whether Git is
installed at all is decided by asking Git for its version with a 15-second timeout — "a `.git`
folder on a machine without Git must not crash the window." `REQ-GIT-042`: checkpoint availability
is true exactly when Git can be run **and** the target root lies inside a Git working tree; a plain
folder or missing path degrades availability to false without raising.
`REQ-GIT-102`: "No console window SHALL appear on screen while a refresh runs" — a Windows process
spawn flag, and an easy thing to get wrong.

**F11 — Git is invoked from the desktop application under a per-read failure-tolerance rule.
(hard)**
`REQ-GIT-102`: a desktop refresh always ends in a rendered state and never raises a dialog; every
Git read that fails or is abandoned contributes its empty value instead; each read is abandoned
after 15 seconds, so a refresh finishes within 15 s × the number of reads it makes; exactly one
refresh runs at application start, after the window has first been drawn and before workspace
onboarding is offered; the interface accepts input throughout; shutdown waits for a refresh already
under way.
`REQ-GIT-101`: shutdown waits for any in-flight checkpoint Git operation rather than killing it
mid-call, bounded only by the `REQ-GIT-033` timeouts. Contrast `REQ-LIBRARY-127`, where shutdown
**abandons** the improvement analysis's provider call and must not wait.

## G. The traceability engine: scale, cost and statelessness

**G1 — No result is ever carried over between invocations. (hard — this is the decisive constraint
against a persistent index)**
`REQ-TRACE-089`: "Every operation SHALL report the repository as it stands at the moment that
operation runs. **No result SHALL be carried over from an earlier invocation and no stored summary
SHALL be consulted in place of reading the files**, so an edit made between two invocations SHALL be
reflected by the second without anything having to be cleared first, and two invocations over an
unchanged repository SHALL report the same thing. How often the work is repeated within one
invocation SHALL make no difference to what that invocation reports."
`REQ-TRACE-173` accepts the consequence explicitly: "The sweep itself SHALL NOT be reused across
single-requirement calls, so querying N requirements one at a time costs N full scans — a documented
cost."
`REQ-TRACE-152`: the toolchain writes only under regeneration and baseline update. There is no third
thing it may write, so there is nowhere to put an index.

**G2 — Cost budgets, with stated reference conditions. (hard)**
`REQ-TRACE-501` (store parse): linear in documents and bytes; **~10³ requirement documents parsed in
about one second**; and — the sharper half — "**Peak memory SHALL be bounded by the size of the
largest single document plus the accumulated metadata records, never by the total prose of the
store: a document SHALL be normalized, hashed and reduced to its metadata record before the next
document is read, and no phase of the parse SHALL require every document's text to be resident at
once.**"
`REQ-TRACE-088` (sweep): linear; **~10³ source files carrying ~10⁴ annotation sites swept in about
one second**, measured on one execution thread on a contemporary developer workstation with an SSD
and a warm cache, timing enumeration + reading + matching, excluding process start-up and the store
parse. "The linear-growth clause is the binding one."
`REQ-TRACE-239`: putting a board on screen once the engine has answered occupies the interface
thread for **no more than 100 ms** at the minimum window size, and **that figure does not grow with
the size of the store**.
`REQ-TRACE-367`: the post-debounce filter recomputation likewise ≤ **100 ms**; one keystroke costs
no board work beyond restarting the debounce timer and painting the character.
`REQ-TRACE-363`: search debounce **150 ms**. `REQ-TRACE-350`: evaluation retry **150 ms** while a
read is in flight. `REQ-TRACE-351`: progress throttled only above **20 items** in a phase, minimum
publication interval **0.1 s**, with a phase change and a phase's final item always published.
`REQ-TRACE-352`: elapsed reading redrawn every **1000 ms** from a timestamp the pass set once.
`REQ-TRACE-300`: **100** populated columns supported on an open axis.

**G3 — Board virtualisation is mandatory and its shape is fixed. (hard)**
`REQ-TRACE-358` (widgets only for cards on screen plus overscan; scrolling reuses widgets),
`REQ-TRACE-359` (a widget is repainted where it stands through the identical update path live
refresh uses, never torn down), `REQ-TRACE-360` (margin **5** cards above and **5** below; released
widget pool capped at **20** per column; after widening and re-narrowing a filter the board holds no
more card widgets than before), `REQ-TRACE-361` (height estimate until at least one card has
genuinely completed layout), `REQ-TRACE-362` (a filter change recomputes membership and repaints
bands; nothing torn down; selection, scroll offsets and open panes carried through),
`REQ-TRACE-364` (an explicit "realise this named card" operation that scrolls to it and does **not**
realise everything on the way), `REQ-TRACE-365` (acceptance: a 300-card column in a ~1000 × 640
viewport realises fewer than a quarter of its members, that count does not grow with column length,
realised cards form one contiguous band from the top, and a reused widget never goes on showing the
card it previously held), `REQ-TRACE-366` (a readiness flag and pending count as observable state).
`REQ-TRACE-367` forbids the obvious cheat: "Spreading the construction of every card across
successive turns of the event loop SHALL NOT be accepted as satisfying this, since it leaves the
total work unchanged."

**G4 — There is exactly one requirement parser, and it may use no third-party YAML, TOML or
validation library. (hard — and it forces two parsers in one product)**
`REQ-TRACE-197`: "There SHALL be exactly **one parser**… Any additional frontmatter reader would
amount to a rival definition of the repository's requirement set." An adapter reading the store as a
source adds no second parse.
`REQ-TRACE-013`: "The parser SHALL be self-contained and depend on no third-party YAML, TOML or
validation library, so that it can run wherever the engine is embedded, without an activated project
environment. For the same reason the layout configuration format SHALL be JSON."
The frontmatter grammar is fixed and is **not** YAML (`REQ-TRACE-008` to `REQ-TRACE-011`): the first
line must strip to exactly `---`; a field line opens with a letter, continues with letters, digits,
underscores or hyphens, then a colon; any other line is appended to the field most recently opened
with one space between; the value is everything after the first colon, stripped, with one matching
outer quote pair removed and **no other escape or quote processing**. An unterminated block means
the document has no frontmatter and produces **no diagnostic of any kind** (`REQ-TRACE-009`).
So the product parses YAML for `agents.yaml` with a library, and parses requirement frontmatter with
a hand-written reader that is forbidden from using one.

**G5 — The generated symbol artifact is a source module in the product's own implementation
language, and that has consequences for the language choice. (hard)**
`REQ-TRACE-075`: "**Exactly one convention SHALL be registered by default, and it SHALL claim the
single source extension of the implementation language.**" `REQ-TRACE-039`: `generated_path`
defaults to `src/requirement_ids` **with the source extension claimed by the built-in annotation
convention appended**; `skip_parts` defaults include "the two directory names under which the
implementation language's own toolchain places its generated caches and its installed dependencies".
`REQ-TRACE-053`: loading the module makes available one integer-valued symbol per requirement named
after its identifier, a constant naming every deprecated requirement, and a lookup from number to
metadata record.
`REQ-TRACE-181`(1): "in the editor and at compile time, free of charge, through the generated
symbols — a deleted requirement's symbol vanishes and every reference becomes a build error, and a
deprecated requirement's symbol carries **the language's deprecation marker** so every reference
warns at the exact spot."
`REQ-TRACE-104` requires a **parsed** test for a re-export-only module: "its parsed contents consist
of nothing beyond import statements, module-level assignments naming exported symbols, and
documentation or bare string-literal statements. Any function declaration, any class declaration,
any conditional and any other executable statement SHALL disqualify it. A module whose text cannot
be parsed SHALL NOT be excused by this rule."
`REQ-TRACE-109` requires a **syntax tree** for test collection: module-level functions and async
functions whose name begins with `test`, plus one level of class nesting deeper, module-level
classes and their `test`-prefixed methods. Nothing deeper.
`REQ-TRACE-182` requires the **test session itself** to regenerate the artifact before collecting
tests, reporting through the test run's own diagnostic reporting and never blocking collection.
Taken together: the implementation language must have an integer enumeration with per-member
documentation, a deprecation marker the editor honours, a parseable syntax tree available to the
product at runtime, and a test runner with a before-collection hook. This is a real constraint on
the language decision and it belongs to the ARCH slice as well as to mine.

**G6 — Annotation recognition is a static text scan with fixed limitations. (hard)**
`REQ-TRACE-079`: "Discovery SHALL be a static text scan — not an import and not runtime
introspection. A reference in unreachable code, or inside a string literal, SHALL still count if it
matches."
`REQ-TRACE-077`: an annotation whose argument list itself contains a call is **not** recognised, and
no diagnostic is produced; implementers must treat this as a known limitation.
`REQ-TRACE-078`: plain call sites must be recognised as well as decorator-position uses, "required
for bootstrap: the toolchain's own modules cannot use decorator syntax before the artifact they
generate exists."
`REQ-TRACE-084`: every identifier written inside an annotation is reported with the line it actually
occupies — not the line the call opens on — and with its own character span from the start of the
file; taking the text at that span yields exactly that identifier and no surrounding characters.
`REQ-TRACE-087`: offset-to-line mapping is exact at every boundary, 1-based, and verified
exhaustively over an empty text, a text of only newlines, a text with no trailing newline, and a
text with CRLF endings.

**G7 — Project-declared annotation conventions are a regex-driven language seam. (hard)**
`REQ-TRACE-073`: six keys per entry (`name`, `extensions`, `reference_pattern`,
`annotation_pattern`, `test_pattern`, `exempt_module_pattern`), patterns evaluated against the
file's normalised text, a non-compiling pattern being a configuration error naming the convention,
the key and the compilation failure. A pattern-declared convention has no syntax tree, so a test
function it collects takes the matched line as its whole span, extended by the same two-line slack,
and its node identifier carries no class segment.
`REQ-TRACE-074`: registration is a single ordered sequence with the built-in convention at position
one; a later registration claiming an already-claimed extension is accepted without diagnostic and
simply never consulted for that extension.
This means user-supplied regular expressions are compiled and run over repository files. Catastrophic
backtracking is a denial-of-service vector the specification does not address — see **OQ-6**.

**G8 — Ratchets shrink only; the tombstone log grows only. (hard)**
`REQ-TRACE-116`: all three baselines may lose entries and **never** gain them; new debt is always an
error; adding an entry by hand to silence a violation is documented as forbidden.
`REQ-TRACE-124`: the debt ratchet is a **per-identifier intersection** — for each recorded number,
keep only flags both recorded and currently unmet, drop numbers whose intersection is empty.
`REQ-TRACE-125`: the two orphan ratchets are a plain set intersection. Both bootstrap by recording
current state once when the file is absent.
`REQ-TRACE-128`: an update run twice over an unchanged repository leaves all three files
byte-identical, and "how much of the work the invocation repeats in order to achieve this SHALL NOT
be observable".
`REQ-TRACE-130`, `REQ-TRACE-136`: the retired-identifier log is only ever appended to and never
loses entries; where a record already exists for an identifier it is kept and the incoming one
discarded, "so a retirement date once written never moves".
`REQ-TRACE-135`: tombstone parsing is deliberately tolerant — a malformed line is skipped and is
never fatal.
`REQ-TRACE-140`: the retirement date comes from an **injectable clock** defaulting to today's UTC
calendar date. That is a testability requirement with an architectural consequence: the clock is a
dependency, not a global.

**G9 — A verification run judges every check against one reading, and the finding order is fixed.
(hard)**
`REQ-TRACE-091`: one reading of the store and one reading of the repository, so no two findings can
describe different states of the same file; findings grouped by check in a fixed enumerated order,
each check's findings contiguous and internally ordered as that check specifies; the error list and
the warning list each follow the same grouping, "so two implementations cannot interleave the checks
differently and both be conformant."
`REQ-TRACE-092`: any parse error short-circuits — verification returns immediately carrying **only**
the parse errors.
`REQ-TRACE-100`: every diagnostic carries the machine-parseable prefix `<path>.md (<identifier>):
<message>`, identifier optional. "This prefix format is a de facto public contract."

**G10 — Everything expensive runs off the interface thread. (hard)**
`REQ-TRACE-337` ("Evaluation and projection work SHALL NEVER run on the interface event loop"),
`REQ-TRACE-229`, `REQ-TRACE-512`, `REQ-TRACE-410`, `REQ-TRACE-425`, `REQ-GIT-091`, `REQ-GIT-102`,
`REQ-LIBRARY-122`, `REQ-CONFIG-374`. `REQ-TRACE-497` lists "evaluation or projection work blocking
the interface event loop" among the things that must never be observable.
`REQ-TRACE-214`: progress callbacks happen **on the thread running the pass**; a host that must
touch a user interface marshals for itself. `REQ-TRACE-355`: progress raised away from the interface
reaches it only once handed to the interface's own thread.

**G11 — The desktop must not shell out to the checking engine. (hard)**
`REQ-TRACE-206`: "A consuming surface SHALL acquire coverage by **calling the library directly** and
receiving plain data back. No consuming surface SHALL launch the checking engine as a process, and
none SHALL interpret rendered output in place of the data. On this path there is consequently no
child process, no exit status to inspect and no text to parse."
`REQ-TRACE-377`: "**No module of the desktop application SHALL** launch a requirement-checking or
verifier process, parse rendered output in place of the data, or re-compute evidence health,
requirement health or epic progress. **A guard test SHALL assert** that no desktop module spawns
such a process."
`REQ-TRACE-378`: a board surface takes every engine-derived value already translated, through the
bridge and from no other route, and does not load the requirement engine while running.
So the engine is an in-process library on the runtime side, reached from the renderer only through a
translation bridge — and there is a test that enforces it.

**G12 — Nothing here has a wall-clock bound, deliberately. (hard, and worth stating)**
`REQ-TRACE-154`: no progress reporting and no cancellation at the toolchain layer; no interrupt
handling, no progress callback, no partial-result reporting. "The absence of any time limit,
document limit or resource limit on the file-system scan SHALL be a **deliberate decision and not a
gap**." The one cost the layer does not control is a child process, bounded by `REQ-TRACE-170`.
`REQ-TRACE-225`: neither refresh kind places a wall-clock bound on the engine read, and that too is
deliberate — the read runs off the interface thread, the board says a refresh is in progress, the
last good board stays on screen, and every external call the read makes is itself bounded.
`REQ-TRACE-178`/`REQ-TRACE-179`: the store probe applies neither a document cap nor a time limit,
and stops at the first document that declares a requirement identifier.

## H. Delivery records and the write path

**H1 — The delivery store is a directory under `.rotaris/`, and its granularity is not fixed.
(hard for location and fields; silent for layout)**
`REQ-CONFIG-192`: `requirements.delivery` holds **operational records only; requirement text is
never written there**. `store_subpath` (default `requirements`) names the directory beneath the
workspace configuration directory holding delivery records, tombstones and audit entries.
`REQ-CONFIG-010` lists it in the workspace layout.
Fields fixed: `schema_version` (int ≥ 1, default 1) written into every record; `retain_tombstones`
(default true) keeping the ids of requirements the sources have stopped declaring so a retained id
is never issued again; `audit_trail` (default true) recording each state transition with the actor,
the time, and the stated reason; `history_limit` (int ≥ 1, default **200**) history entries kept per
requirement, older pruned.
What is **not** fixed: whether a delivery record is one file per requirement, one file per
transition, or one file for the store. See **OQ-1**.

**H2 — Version handling is forward-tolerant and never destructive. (hard)**
`REQ-CONFIG-192`: "The reader supports exactly the versions **1 through the configured
`schema_version`**, which as shipped is the single version `1`; a record whose `schema_version` is
higher is reported as unsupported and is not interpreted, and a record whose value is below 1,
absent, or not an integer is reported as unreadable. **Neither is rewritten, migrated in place, or
deleted.**" Such a record is reported in exactly three places and nowhere else: the requirement is
listed on the board with its delivery history shown as unavailable **for that reason** rather than
hidden or shown as empty; the message naming the record's path and version is written to the session
log; and the same message is returned by any surface that reads delivery records. "A workspace
holding an unsupported record still opens and still runs."

**H3 — There is exactly one write path, and a guard test enforces it. (hard)**
`REQ-TRACE-382`: a closed set of **fourteen** actions, "closed deliberately so that a completeness
sweep over the action set is possible".
`REQ-TRACE-399`: "**No path anywhere in the application SHALL persist a delivery state except by
calling the engine's transition function**, and **none SHALL install the terminal state while
circumventing the completion conditions** — not via a drop, not via a context menu, and not via a
bulk operation. **A guard test SHALL assert that no module writes the delivery store directly.**"
`REQ-TRACE-403`: "**Reading and writing SHALL be separately grantable.** A component given only the
ability to read requirement data SHALL have no route by which to change a delivery state, write an
audit record or start a run, and a guard test SHALL assert that a component composed with read
access alone offers no state-changing operation at all."
That is a capability-object requirement, not a naming convention: the read handle and the write
handle must be different values, and the read handle must not carry the write methods at all.

**H4 — Every state-changing action writes a record carrying four things, and the application
refuses to start without the hash comparison. (hard)**
`REQ-TRACE-405`: who performed it, when, which requirement, and **that requirement's hash at that
instant**; interleaved in the requirement's history with runs and verifications; an action taken by
the scheduler or an agent is recorded as such and is distinguishable from one taken by a person;
"No state-changing action SHALL complete without leaving such a record."
`REQ-TRACE-402`: "A requirement whose text has changed since the snapshot its run was taken against
SHALL NOT be recordable as delivered by any route. **Where the application is assembled with a
delivery-state writer that does not make that comparison, it SHALL refuse to start** and SHALL name
the comparison that is missing, rather than starting and admitting transitions that were never
checked."
That is a startup assembly assertion with a named failure mode.
`REQ-TRACE-401`: an override requires a deliberate confirmed act with a stated reason; the record is
marked **as an override**, names who and on what grounds, and stays visible on the requirement and
in the audit trail.
`REQ-CONFIG-198` fixes what counts as **a person**: an action arriving through an interactive
surface in direct answer to a prompt the product raised for that specific action, with that surface
attached to a window. An action from an agent, a hook, a scheduled or unattended run, or a replay of
recorded events is never a person, whatever it claims about itself. The audit record names the
operating-system account the interactive session ran under together with the surface the answer came
from; the product maintains no identity of its own and asks for none.

**H5 — Restart rebuilds delivery state from what was persisted, and detects dead runs. (hard)**
`REQ-TRACE-476`: the board rebuilds, out of what was persisted, the delivery state of every
requirement, its execution units, the runs that were queued or running, and the worktrees belonging
to them. Where a run's process is no longer alive, that is detected and the run is reported as
**interrupted, with its work retained** — never displayed as still running — and its worktree, its
branch and its partial output are all kept. The queue resumes where it stopped **without re-running
completed units**, and **no requirement is silently reset** to the first column by a restart.
`REQ-TRACE-464`: while a board-started run is still executing, its **session identifier has already
been stored on the run record** — "that being the window in which the board actually needs to be
able to open the session" — and the identifier survives an application restart.
`REQ-TRACE-497` lists "a run in flight whose record carries no session identifier" as never
observable.

**H6 — Two queue controls persist and one deliberately does not. (hard)**
`REQ-TRACE-480`: automatic scheduling and the concurrency limit are written into the **workspace
configuration**; **a stop is not persisted**, so a restart never begins with the queue stopped; a
change to either persisted control takes effect without a restart.
`REQ-TRACE-481`: the concurrency control caps its own **input** at 64, and that ceiling constrains
the widget, not the scheduler — enforcement of the effective limit belongs to the engine.

## I. Versioned artifact history and retention

**I1 — Every artifact mutation appends a version; the cause vocabulary is closed. (hard)**
`REQ-LIBRARY-049`: `<workspace>/.rotaris/improvement_artifacts/history/<artifact_id>/<version>.json`,
version zero-padded to 6 digits, containing `{version (≥ 1, monotonically increasing), recorded_at
(UTC), cause, artifact (full copy)}`, written atomically.
`REQ-LIBRARY-050`: cause is exactly `collected`, `status_change`, `edit`, `delete`, `checkpoint`,
`rollback`, `unknown`.
`REQ-LIBRARY-162`: **every** mutation — status change, edit, deletion, recorded checkpoint,
rollback — goes through the same write path and leaves a version naming its cause.
`REQ-LIBRARY-048` fixes the default attribution: with neither an existing file nor recorded history,
`collected`; any other implicit write, `edit`.

**I2 — Retention rules are fixed constants and explicitly not configurable. (hard)**
`REQ-LIBRARY-052`: at most **25** versions per artifact; for keep count N ≥ 2 the retained set is
version 1 together with the newest N−1, "so the state as first recorded is never what pruning gives
up"; N = 1 keeps only the newest; N ≤ 0 keeps none; pruning removes the oldest **droppable** version
first, a droppable version being any that is neither version 1 nor the newest. "N is fixed at 25 by
this document and MUST NOT be exposed as a configuration key."
`REQ-LIBRARY-071`: at most **10** checkpoints per artifact, oldest dropped first with their refs, the
newest `pre_improvement` never dropped; fixed and not configurable.
`REQ-LIBRARY-139`: prompt history capped at **200**, stash at **100**, enforced on both load and
save with silent truncation of the oldest; fixed and not configurable.
`REQ-LIBRARY-165`: the analyst evidence bounds — 200 transcript events, 2,000 chars per event,
40,000 chars total transcript, 100 progress entries, 200 todos, 20 child reports at 4,000 chars each
and 60,000 total, 8,000 chars of gate evidence, 5 prior artifacts at 4,000 chars each — are constants
and must not be exposed as configuration. "Because the bounds are constants, two runs over the same
session produce the same evidence regardless of how large the session grew."
`REQ-LIBRARY-462` (Data & Formats): the domain's configuration surface is **exactly** three keys.
By contrast `REQ-GIT-049`/`REQ-GIT-071` make session checkpoint retention **configurable** at
`checkpoints.max_per_session`, default 50, minimum 1 enforced at load. Two retention policies, two
different treatments, deliberately.

**I3 — Pre-history state must be seeded, not lost, and reading must never write. (hard)**
`REQ-LIBRARY-051`: reading the history of a pre-history artifact synthesises a version 1 from the
current file with cause `unknown` and `recorded_at` equal to the artifact's `generated_at`,
**writing nothing** — "opening a workspace never rewrites untouched files". The first history-aware
overwrite must **first** seed the pre-existing on-disk state as version 1 so it is preserved rather
than lost.
`REQ-LIBRARY-053`: history enumeration is defensive — unreadable or corrupt version files are
skipped with a warning, listing is newest-first, a missing version fails with a fixed message, and
an unknown artifact yields an empty history.

**I4 — A legacy import runs on first store access. (hard)**
`REQ-LIBRARY-044`: on first store access (list, load, or save), artifacts at the legacy per-session
location `.rotaris/sessions/<session_id>/improvement_artifacts/*.json` are imported into the
workspace store **when absent there**; malformed legacy files are skipped with a logged warning and
are never fatal. This is a read path that writes, and it is the only one in the domain.

## J. Free, and explicitly so

- The physical path and on-disk encoding of the per-user preference store (`REQ-SHELL-006`:
  "Two conformant builds may therefore lay the same keys out differently on disk").
- Retry delay shapes inside the stated bounds (`REQ-LIBRARY-043`: the individual delays and any
  growth between them "are implementation choices, are not observable, and MUST NOT be relied on").
- Whether a checkpoint ref carries a reflog of its own (`REQ-GIT-004`, explicitly not constrained).
- The two skip-part directory names for the implementation language's cache and dependencies
  (`REQ-TRACE-039`, "properties of the implementation language rather than of this product's
  behavior").
- Which third-party services fill the three default tool-server roles, and their pinned versions
  (`REQ-CONFIG-181`).
- All rendered visual appearance: colours, spacing, typography, theming, icon glyphs
  (`REQ-GIT-152`, `REQ-LIBRARY-125`, `REQ-TRACE-261`), except where a requirement names a specific
  visual property.
- Wording, wherever a requirement says "the wording is left to the implementation" — which it does
  in dozens of places, and which is a deliberate reduction of the conformance surface rather than an
  invitation to be vague about the facts each message must convey.
- How much work an invocation repeats internally, provided the result is unchanged
  (`REQ-TRACE-128`, `REQ-TRACE-089`, `REQ-GIT-082`).

---

# Part 2 — Spikes run

Two questions could not be answered honestly from the specification alone. Both were checked with
throwaway scripts under the scratchpad; no product code was written.

## Spike 1 — atomic replacement on Windows

Node v24.11.0, Windows 11 (build 26200), NTFS.

- `fs.renameSync(tmp, target)` over an existing file succeeds when no process holds the target.
- `fs.renameSync` **fails with `EPERM`** when any process holds a descriptor on the target obtained
  through Node's ordinary `fs.openSync(target, 'r')`. Node does not request `FILE_SHARE_DELETE`, so
  an ordinary reader blocks a replace. This is exactly the condition `REQ-LIBRARY-043` anticipates
  and requires to be retried.
- `fs.fsyncSync` on a **directory** handle fails with `EPERM`. The POSIX "fsync the parent directory
  to make the rename durable" idiom is unavailable through Node on Windows.
- Two writer processes replacing a 200 KB JSON document ~500 times each, against a reader loop: in
  1,850 reads **one read returned a zero-length string**; in a longer run, one in 16,250. No torn or
  partially written content was ever observed, and no temporary file was left behind. The failure
  mode is an **empty** read, not a partial one.

That last point matters because `REQ-LIBRARY-043` forbids exactly that word: a concurrent read must
return "either the complete previous file or the complete new one, **never a partial, empty, or
unparseable file**". The naive pairing of `writeFile(tmp)` + `rename(tmp, target)` on the write side
with `readFileSync(target)` on the read side **does not satisfy that requirement on Windows**. The
read side needs a guard, not only the write side. This drives ADR-DATA-02.

## Spike 2 — YAML library behaviour

`yaml@2.9.0` and `js-yaml@5.4.1`.

- Under the default YAML 1.2 core schema, `yaml` parses `off` and `on` as the **strings** `"off"`
  and `"on"`, and `true` as a boolean. Under `{version: '1.1'}` it folds `off`→`false` and
  `on`→`true`. `js-yaml`'s `load` behaves as 1.2 here. So `REQ-CONFIG-020`'s coercion is a
  two-spelling problem under 1.2 and a six-spelling problem under 1.1; either is workable, and 1.2 is
  less work.
- Tri-state is available and robust through `YAML.parseDocument`: for `hooks: {entries: }`,
  `has('entries')` is `true` while the value node is null, and `has('enabled')` is `false`. Absent,
  explicit-null and value are all distinguishable at the AST.
- Key order is preserved on round trip and **not** alphabetised (`zzz_last_key` stayed ahead of
  `aaa_first_key`), satisfying `REQ-CONFIG-248` and `REQ-CONFIG-441`.
- `yaml@2.9.0` resolves `!!js/function "function(){}"` to the plain **string** `"function(){}"` with
  a warning; it constructs no function. `js-yaml@5.4.1`'s `load` throws on the unknown tag. Both are
  safe by default, satisfying `REQ-CONFIG-015`.
- Editing through the `Document` API preserves comments and layout alongside key order. Only
  `parse` → `stringify` loses them. Comment preservation is therefore nearly free, which changes the
  shape of **ESC-2**.

---

# Part 3 — ADR proposals

Numbering is provisional; the synthesis step assigns final numbers.

## ADR-DATA-01 — Documents on disk are the system of record; no relational database

### Decision to be made

Whether the product keeps any state in SQLite — the candidate stack names SQLite with Drizzle and
better-sqlite3 — and if so, for what.

### Constraints that bear on it

- **A5, A6.** Every persisted artifact in this slice is a named file in a fixed format at a fixed
  path. No requirement in any of the twenty-one domain documents names a database, a table, an
  index, a query or a migration. The only versioning concept is `schema_version` as a field *inside
  a record* (`REQ-CONFIG-192`, `REQ-SESSION-013`, the `REQ-EVENTS` envelope), read forward-tolerantly
  and never migrated in place — `REQ-CONFIG-192`: "Neither is rewritten, migrated in place, or
  deleted."
- **C1.** `REQ-LIBRARY-042`, `REQ-LIBRARY-158` and `REQ-TRACE-502` fix the multi-process semantics as
  *no locking, no waiting, last complete replacement wins*. `REQ-TRACE-502` is emphatic: "no
  invocation SHALL wait for another… An invocation SHALL NEVER fail, hang or leave a lock behind
  because another was running."
- **G1.** `REQ-TRACE-089` forbids carrying any result between invocations and forbids consulting a
  stored summary in place of reading the files. `REQ-TRACE-152` limits the toolchain's writes to two
  named actions, so there is nowhere an index could legally live.
- **D6.** `REQ-CONFIG-014`: the configuration file set has no read cache.
- **B10.** Reading a workspace must not write to it (`REQ-TRACE-090`, `REQ-TRACE-408`,
  `REQ-LIBRARY-051`, `REQ-CONFIG-419`, `REQ-TRACE-497`).
- **A4.** The requirement documents are the *project's* files, versioned in the project's own
  repository and hand-edited — `REQ-TRACE-275`: "there is no second requirement repository".
- **H2.** An unsupported record must stay on disk untouched and be reported in three named places
  while the workspace still opens and still runs.
- **C5.** `REQ-GIT-145`: unbounded concurrent isolated runs in one workspace.

### Alternative A — SQLite as the primary store for delivery records, traceability and improvement artifacts

The case for this is not weak and deserves to be put properly.

The traceability domain is the largest in the product at 512 identifiers, and it is the one place
where the data is genuinely relational: requirements have parents, derived-from links, twelve
relation kinds (`REQ-TRACE-274`), evidence sites, verification records, delivery transitions and
revision history. `REQ-TRACE-279` requires revision history to be produced by *joining* the source's
revisions against locally recorded hashes and the delivery records — "joins" is the specification's
own word. `REQ-TRACE-459` requires a transitive closure over dependency ancestors, topologically
sorted, identical on every read of an unchanged project. `REQ-TRACE-404` requires a bulk action
evaluated and reported per requirement. A board of several hundred requirements, filtered on six
axes (`REQ-TRACE-293`) and sorted three ways (`REQ-TRACE-287`), is on its face a query workload.

SQLite would also supply things the file design has to build by hand: one transaction covering
"write the delivery record **and** the audit entry **and** prune history to 200"; crash atomicity
across several records without inventing an ordering; an `ORDER BY` that does not require loading
every record; and `history_limit` pruning as a `DELETE` rather than a directory scan. And the file
design's cost is real — `REQ-TRACE-173` accepts N full repository scans for N single-requirement
queries as "a documented cost", which SQLite would remove.

**Why it nonetheless fails.** Not on taste or effort, but on observables the specification fixes.

1. *It cannot produce C1's concurrency observables.* SQLite coordinates writers with locks; under
   WAL a second writer receives `SQLITE_BUSY` and either waits on a busy timeout or fails.
   `REQ-TRACE-502` requires both that no invocation waits for another **and** that none ever fails
   because another was running. `REQ-LIBRARY-042` requires two interleaved writers both to succeed
   with the later winning whole, not one to be refused. An unbounded busy timeout satisfies the
   second half by violating the first. The two halves are jointly unsatisfiable by a lock-based
   store.
2. *It cannot produce G1's freshness observable.* `REQ-TRACE-089` requires each operation to read the
   files. A database answering from stored rows is precisely the "stored summary consulted in place
   of reading the files" that requirement names. A database that re-read every file on every
   operation and then wrote rows would do strictly more work than the file design *and* violate
   **B10** by writing on a read path.
3. *It cannot hold the requirement documents at all.* They are the project's Markdown, under the
   project's version control, written back through the adapter "into the **original artifact** — the
   project's own file, never a local copy" (`REQ-TRACE-434`). Any database copy is a second
   definition of the requirement set, which `REQ-TRACE-197` forbids in terms.
4. *`schema_version` semantics are per-record and forward-tolerant, not per-database.*
   `REQ-CONFIG-192` requires an unsupported record to sit uninterpreted and unmigrated while its
   neighbours read normally, and the board to show that one requirement's history as unavailable
   *for that reason*. A migrating ORM's contract is the opposite: bring the whole store to the
   current version, or refuse to open it.
5. *It buys nothing for configuration.* `REQ-CONFIG-014` forbids a read cache and the files are the
   user's own hand-authored YAML.

### Alternative B — SQLite as a rebuildable derived index alongside the files

Files stay authoritative; a database is maintained as a cache to make board queries cheap, discarded
and rebuilt whenever it might be stale.

This is the strongest form of the SQLite argument and it survives objections 3 and 4. It still fails
on 1 and 2, and adds two problems of its own. Maintaining it is a write, so the read paths **B10**
protects would begin writing. Detecting staleness cheaply requires exactly the stored summary
`REQ-TRACE-089` forbids consulting; detecting it expensively, by re-reading every file, leaves no
saving. And under **C5** several processes would maintain the same cache concurrently under **C1**'s
no-lock rule, which is the worst of both designs.

A narrower version of B does survive, and is what I recommend elsewhere: a **process-lifetime,
in-memory** index rebuilt per pass and never written to disk. `REQ-TRACE-089`'s closing sentence
permits it explicitly — "How often the work is repeated within one invocation SHALL make no
difference to what that invocation reports" — and `REQ-TRACE-202` and `REQ-TRACE-203` positively
invite it. That is ADR-DATA-06's design, and it needs no database.

### Alternative C — an event-sourced journal with projections for the whole slice

The candidate stack names "an event journal with projections". The specification does define a
journal: `evidence/events.jsonl`, one wire event per line, capped by
`runtime.event_retention_per_session`, trimmed by atomic whole-file replacement, with a resumable
follower protocol keyed on byte offset plus a truncation marker (`REQ-EVENTS-090` to
`REQ-EVENTS-092`, `REQ-EVENTS-111`). But it is **per session**, it is **capped and trimmed**, and its
content is fixed by domain 20's catalogue. It is a record of what a run did, not a storage substrate.

Nothing in this slice is event-sourced. Configuration is a document set with a fixed merge. A
worktree binding is a record of seven fields with a closed vocabulary (`REQ-GIT-015`). An improvement
artifact is a document with an explicitly *separate* version history beside it (`REQ-LIBRARY-049`) —
a document-with-history design, not an event log: version files hold a **full copy** of the artifact,
and pruning discards intermediate versions (`REQ-LIBRARY-052`), which an event log could not survive.
Modelling these as event streams with projections would make the projection, rather than the file,
what a user opens — and every one of these files is specified as a file a user opens.

### Recommendation

**Files are the system of record for the whole of this slice. No SQLite, no ORM, no migrations.**

In one line: the specification does not merely fail to require a database, it fixes concurrency,
freshness and versioning observables that a lock-based, schema-migrating store cannot produce.
`REQ-TRACE-502`, `REQ-TRACE-089` and `REQ-CONFIG-192` each rule it out independently.

Where the relational shape genuinely helps — the board's joins, closures and sorts — the answer is an
in-memory projection built per pass by the requirement engine (ADR-DATA-06) and handed to the
renderer already translated (`REQ-TRACE-378`). `REQ-TRACE-348` already describes it: "A board pass
SHALL be held in **one value** so a reader can never observe half an update."

This removes SQLite, Drizzle and better-sqlite3 from the stack **for this slice**; if another slice
finds a requirement needing them, that is that slice's finding. Note the incidental benefit:
better-sqlite3 is a native module, and dropping it removes per-Electron-version rebuilds and
per-architecture prebuilds from the distribution problem domain 11 owns.

### Consequences accepted

- `REQ-TRACE-173`'s N-scans-for-N-queries cost, accepted exactly as the specification accepts it.
- Cross-record atomicity is built from ordered single-file writes plus the crash-survivable orderings
  **B6** already fixes. There is no transaction spanning two files, and the specification never asks
  for one — it asks for specific orderings that make a crash recoverable.
- History pruning (`history_limit` 200, `REQ-LIBRARY-052`'s 25 versions, `REQ-GIT-049`'s 50
  checkpoints) is directory work, not a `DELETE`.
- Two concurrent decisions on one artifact can lose one, as `REQ-LIBRARY-042` states plainly. We must
  not "improve" on this with a lock.

### What would have to change to revisit this

A requirement fixing a query latency the file design cannot meet; a requirement that a store refuse
or serialise a concurrent writer; a requirement for a transaction spanning two records; or a delivery
store growing past the point where a directory scan per board refresh meets `REQ-TRACE-239`'s 100 ms
budget. The last is the realistic one and is measurable against `REQ-TRACE-300`'s 100-column figure.

---

## ADR-DATA-02 — One document-store primitive, with a guarded read side

### Decision to be made

How the dozen-odd stores in this slice perform their reads and writes: one shared primitive, one per
store, or ad-hoc code at each call site. And what the read side must do, given Spike 1.

### Constraints that bear on it

- **B1** (atomic replacement, stated independently eleven times), **B2** (temp file in the target's
  own parent directory), **B3** (no leftover temp; never mistakable for a record; fixed prefix for
  the prompts file), **B4** (5 attempts, two conflicting schedules), **B5** (mode `0644` for the
  `agents.yaml` writers and the snapshot, but *not* stated for `secrets.yaml`), **B7** (some writes
  best-effort by requirement), **C1** (read-modify-write immediately before writing, no locking).
- `REQ-LIBRARY-043`'s exact words: a concurrent read returns the complete previous or the complete
  new file, "never a partial, **empty**, or unparseable file".
- Spike 1: with Node's ordinary read and write APIs on Windows, a concurrent reader observes an empty
  file roughly once in 2,000–16,000 reads under contention, and an ordinary open reader makes the
  writer's `rename` fail with `EPERM`.

### Alternative A — one primitive, uniform policy

A single `writeDocumentAtomically(path, bytes)` and `readDocument(path)` used everywhere, with
identical retry, mode and temp-naming behaviour.

Simple; one place to audit and one place to fix a filesystem bug. But it cannot be uniform without
being wrong somewhere. **B4**'s two retry schedules differ (1 s total versus 1.55 s);
`REQ-CONFIG-216` gives `secrets.yaml` no mode while `REQ-CONFIG-444` gives `agents.yaml` `0644`; the
prompts file has a fixed temp prefix (`REQ-LIBRARY-138`) while the improvement store only requires
that temps not be mistakable for artifacts by its own listing rule; and `REQ-LIBRARY-047` needs the
history write best-effort while the artifact write is all-or-nothing. A uniform primitive would
either over-constrain some stores or under-constrain others, and the over-constrained cases fail
conformance quietly.

### Alternative B — a primitive with an explicit per-store policy, and store-specific readers

One implementation of the write mechanism; a small declarative policy per store naming the
temp-naming scheme, the retry schedule, the file mode, and whether failure is fatal or best-effort.
Each store owns its own decode-and-validate step, because each has a different notion of a valid
document and a different error text: `REQ-LIBRARY-014`'s `malformed improvement artifact: ` prefix,
`REQ-CONFIG-018`'s parser detail including line and column, `REQ-TRACE-117`'s `<path>:<line>: `
malformed-baseline form.

More moving parts than A, but every difference it carries is a difference the specification fixes.

### Alternative C — a third-party atomic-write package

`write-file-atomic` and its relatives handle the tmp-and-rename dance including Windows retries, and
would be a reasonable choice if the requirements were generic. They are not. **B3**'s "never named so
that the id listing could mistake it for an artifact" is a constraint on the temp *name* that must
agree with `REQ-LIBRARY-045`'s listing rule. **B4**'s bound is "all 5 attempts MUST complete within 1
second of the first", a property of whichever schedule the package chose. And no package addresses
the read side at all, which Spike 1 shows is where the requirement actually breaks. We would end up
wrapping it until it was doing only the `rename` call, while adding a dependency to the most
security-relevant write path in the product (`secrets.yaml`).

### Recommendation

**Alternative B**, with an addition Spike 1 makes non-optional: **the read side is part of the
primitive, and it retries.**

Write side: stage into the target's own parent directory under a name the store's own listing rule
cannot mistake for a record; write; replace; on `EPERM`/`EBUSY`/`EACCES` retry on the store's
declared schedule; remove the staged file on every failure path; apply the store's declared mode.

Read side: read, and if the result is empty or fails the store's own decode *while the file is known
to exist*, retry on the same schedule before reporting the condition. Without this, Spike 1 shows we
fail `REQ-LIBRARY-043` on Windows at a rate that will present as a flaky bug rather than as the
design error it is. The guard is safe because none of these stores has a legitimately empty
document: `REQ-LIBRARY-014` requires a schema-valid artifact and `REQ-CONFIG-019` requires a mapping
at the top level.

The guard must **not** apply where empty is a legal state and is specified as such: a missing
configuration file yields an empty mapping and is not an error (`REQ-CONFIG-016`), and a file that is
empty, whitespace-only or comment-only parses to nothing and is "indistinguishable from a missing
file for load purposes" (`REQ-CONFIG-017`). Absent and empty are deliberately conflated there. So the
guard keys on *decode failure after a successful stat*, not on emptiness alone.

Two further rules follow from Spike 1 and belong in the primitive:

- **Readers must not hold descriptors.** An open reader makes a concurrent writer's `rename` fail
  with `EPERM`. Every read of a store file is open-read-close within one call. Anything that wants to
  *follow* a file — the event journal's resumable reader in domain 20 — must open per poll rather
  than hold a handle. That is a constraint this slice imposes on a neighbouring one and it should be
  carried into synthesis.
- **Durability is bounded by what the platform offers.** Directory `fsync` is unavailable on Windows
  through Node. `REQ-LIBRARY-138` asks for the prompts file to be "flushed to disk" and no other
  requirement in this slice asks for `fsync` at all; every crash-safety requirement I own is phrased
  either as an *ordering* (**B6**) or as *the replace is atomic* (**B1**), both of which `rename`
  provides. See **OQ-4**.

### Consequences accepted

- A read can cost two attempts under contention. The added latency is bounded by the store's retry
  schedule and is zero in the uncontended case.
- **B4**'s two schedules become two policy values rather than one constant. The conflict is contained
  rather than resolved (**OQ-3**).
- We own the filesystem edge cases — antivirus handles, network shares, case-insensitive collisions —
  rather than delegating them.

### What would have to change to revisit this

A requirement that a store file may legitimately be empty and must be read as empty without a retry;
or a Node API exposing `FILE_SHARE_DELETE` on open, which would let readers hold handles safely and
would remove the "no descriptors held" rule.

---

## ADR-DATA-03 — Configuration is loaded through the YAML document AST over a tri-state model

### Decision to be made

How `agents.yaml`, `models.yml`, `secrets.yaml` and `project_settings.yaml` are parsed, represented
in memory across five layers of merging, validated, and written back.

### Constraints that bear on it

- **D1** five fixed layers; **D2** four merge classes with different overlay depths and lists that
  never append; **D3** absent / explicit-null / value must stay distinct, with a *different* null
  policy per merge class; **D4** a fixed ordering of passes, three of which run per scope before the
  merge; **D5** a fully resolved result; **D6** no read cache; **D7** a closed five-way severity
  taxonomy; **D8** validation on assignment as well as on load; **D9** a second, separate parse of
  the same file for one key; **D10** safe-subset parsing and per-field boolean un-folding;
  **D11** a rejected value fails the whole load; **D12** branch-namespace validation on a rendered
  example.
- **B8** never write a configuration you cannot load back; **B9** preserve key order, comments
  explicitly lost.
- **E1** the loader's synthesis step must be callable outside a load, over a configuration value,
  because `REQ-CONFIG-263` does it at run start "exactly as the loader does".
- Spike 2: tri-state and key order are available through `yaml@2.9.0`'s `Document`; safe-tag
  behaviour is the default in both candidate libraries; comment preservation is free through the
  `Document` edit API.

### Alternative A — parse to plain objects and merge with a schema library's defaults

Parse each file with `YAML.parse`, validate each layer with a schema library (Zod, Valibot,
TypeBox), merge the validated objects.

Attractive: validation and typing fall out for free, and the codebase gets one description of the
configuration shape. It breaks on **D3** and **D2**.

A schema library's job is to *normalise* — apply defaults, coerce, produce a value of a known shape.
Every one of those operations destroys the absent-versus-null distinction `REQ-CONFIG-055`,
`REQ-CONFIG-056` and `REQ-CONFIG-057` require to survive the merge. Applying defaults per layer is
worse than useless: it turns every unstated field of the global layer into a stated value that then
shadows the workspace layer, inverting `REQ-CONFIG-031`'s precedence for every key the user did not
write. One can work around this with `.optional()` everywhere and defaults applied only at the end,
but at that point the schema library is validating a tri-state document it does not model and the
merge is hand-written anyway.

It also cannot express **D2**'s depth rules: named entries overlay exactly one level
(`REQ-CONFIG-046`) while sections recurse to any depth (`REQ-CONFIG-048`). No generic deep-merge does
both, and no schema library expresses "merge depth" at all.

### Alternative B — parse to the YAML document AST, merge over a tri-state model, validate the merged result

Parse each scope's files with `YAML.parseDocument`, project into an internal document model that
distinguishes *absent*, *null* and *value* at every node, run the per-scope passes (**D4**), merge by
explicit merge class, then validate once.

More code — a hand-written merger of a few hundred lines. But every line corresponds to a stated
rule; the rules are enumerated exhaustively in `REQ-CONFIG-040` through `REQ-CONFIG-050`; and
`REQ-CONFIG-051` supplies a ready-made end-to-end fixture for it. Validating once on the merged
result is what **D4** describes and what `REQ-CONFIG-037` requires — secret values never pass through
schema validation.

### Alternative C — a configuration library (cosmiconfig, node-config, convict)

None models five fixed layers with four merge classes, per-class null policies, per-scope pre-merge
passes, or a five-way severity taxonomy. Each would be fought rather than used, and each brings its
own precedence model that would have to be disabled.

### Recommendation

**Alternative B.** Parse with `yaml`'s `Document` API, carry a tri-state internal model, hand-write
the merger against the enumerated rules, validate the merged document once.

On the library: `yaml@2.9.0` or later, rather than `js-yaml`. Both are safe by default (Spike 2), but
`yaml` is the only one of the two that gives the `Document` AST needed for tri-state and for order-
and comment-preserving writes. Use the **default YAML 1.2 core schema**, under which
`on`/`off`/`yes`/`no` parse as strings; `REQ-CONFIG-020` then reduces to un-folding `true`/`false`
per field against that field's vocabulary, which is a smaller and more auditable rule than un-folding
six spellings. The requirement's observable is satisfied either way; this is the cheaper route to it.

On validation: whatever library is chosen must support **assignment-time** validation for `runtime:`
and `requirements:` (**D8**; `REQ-CONFIG-111`, `REQ-CONFIG-183`, `REQ-CONFIG-436`). The natural shape
is a validating wrapper around those two sections whose setters run the same schema the load runs, so
that `REQ-CONFIG-260`'s "validated before any file is touched" and `REQ-CONFIG-290`'s "nothing
invalid reaches the store" are one code path rather than two. Note that `REQ-CONFIG-237` fixes the
error rendering — `<dotted.path>: <message>`, an empty path rendered as `config`, the framework's
"field required" phrasing rewritten as "missing required field", and never an empty list — so the
library's issue objects must expose a dotted path and a message. `REQ-CONFIG-238` further requires
missing-field errors under `models` → `<name>` → `<field>` to be **gathered into exactly two lines**
rather than reported per model, which is post-processing over the issue list either way.

On write-back: four writers exist and they are not interchangeable — the bootstrap
(`REQ-CONFIG-027`), the startup model-preference path (`REQ-CONFIG-248`), the desktop save
(`REQ-CONFIG-256`) and the scoped per-field writer (`REQ-CONFIG-441`). All four leave mode `0644`
(`REQ-CONFIG-444`) and all four go through ADR-DATA-02's primitive. The per-field writer overlays
"recursively through nested mappings exactly as a section merge does" (`REQ-CONFIG-441`), so the
merge code is shared between the loader and one of the writers — which is a good thing, because it
means a divergence between them is a compile-time impossibility rather than a test we might forget.

On Tier B: the tier-alias substitution and reasoning-synthesis passes are exported as pure transforms
over a configuration value, not as private steps of a file-reading function, because
`REQ-CONFIG-263` calls them at run start with no file involved.

`rotaris.delegation_strategy` (**D9**) gets its own small reader over the same parsed document —
literally a second lookup, not a second file read — checking the value against the three accepted
spellings and leaving the default in place otherwise.

### Consequences accepted

- We own the merge. It is the largest single piece of hand-written logic in the slice and the place
  where a conformance failure would be least visible. It needs `REQ-CONFIG-051`'s fixture as a
  first-class test plus a per-rule test for each of `REQ-CONFIG-052` through `REQ-CONFIG-057`.
- **D6**'s no-cache rule means every settings-screen open, every run start and every workspace open
  re-reads and re-merges. At these file sizes that is microseconds; it is recorded here so it is not
  later "optimised" into a violation.
- Comments are lost on the paths `REQ-CONFIG-252` says they are lost on, unless **ESC-2** is taken.

### What would have to change to revisit this

A requirement making absent and null equivalent everywhere, removing **D3**; a requirement for a
sixth layer or a per-key precedence inversion, both of which `REQ-CONFIG-449` currently forbids; or a
validation library that models tri-state optionality natively without normalising, which would
collapse Alternatives A and B into one.

---

## ADR-DATA-04 — Git is reached by spawning the `git` executable

### Decision to be made

Whether Git operations go through the `git` command-line executable, an in-process Git
implementation (`isomorphic-git`), native bindings (`nodegit`/libgit2), or a wrapper over the CLI
(`simple-git`).

### Constraints that bear on it

- **F1** per-layer invocation timeouts — five different values, each bounding **one invocation**.
- **F2** the error text is Git's own stderr verbatim; `<command>` is rendered as the subcommand plus
  its arguments with "no quoting, eliding, or truncation of any argument"; three case-insensitive
  substring matches decide the long-path remedy (`REQ-GIT-012`) and three more decide what counts as
  a branch collision (`REQ-GIT-010`).
- **F3** output decoded as UTF-8 with U+FFFD replacement.
- **F4** fourteen `GIT_*` variables neutralised per invocation, repository and working tree named
  explicitly on every invocation, everything else passed through.
- **F5** HEAD, the index bytes, the reflogs, the stash and the branch set left identical.
- **F9** no network subcommand ever; never write the user's Git configuration.
- **F10** repository detection and Git presence decided by asking Git, with a 15 s version check; no
  console window on Windows.
- `REQ-GIT-105` needs `git worktree list`, ahead/behind counts, a 30-commit log with abbreviated
  hashes and diff totals; `REQ-GIT-108` needs merge-base reachability against an upstream ref.

### Alternative A — `isomorphic-git` (pure JavaScript)

Real advantages: no external dependency, so `REQ-GIT-104`'s "Git is not installed" state would never
arise; no process spawn, so no console-window problem and no per-invocation cost; and complete
control over the object layer, which is genuinely attractive for **F5**.

It fails on **F2** decisively. `REQ-GIT-013` makes Git's **own stderr** the error text of every failed
worktree operation; `REQ-GIT-110`, `REQ-GIT-111` and `REQ-GIT-116` surface "Git's own wording" to the
user; and `REQ-GIT-012` matches three phrases Git emits and reproduces the complete Git failure text.
A JavaScript reimplementation emits its own messages. We would be authoring strings purporting to be
Git's, for every failure, across every Git version — which is not reporting Git's own wording but
fabricating it.

It also fails on **F10**: `REQ-GIT-103` requires repository detection to "ask Git, not the
filesystem", and requires the Git-installed question to be answered by asking Git for its version. A
pure-JS implementation has no version to report and would make `REQ-GIT-104`'s notice unreachable.
And it does not implement `git worktree` at all, which is the centre of domain 06.

### Alternative B — libgit2 bindings (`nodegit`)

Real advantages: an actual index API, so **F5**'s private index is a first-class operation rather
than an environment-variable arrangement; and no process spawn.

It fails on **F2** for the same reason as A — libgit2's error strings are libgit2's, not Git's — and
on **F4** more subtly: `REQ-GIT-031` requires the repository and working tree to be "named explicitly
on **every Git invocation** this domain makes" and the fourteen variables neutralised *for the
invocation*. libgit2 reads its own configuration and has its own environment handling; matching
Git's behaviour exactly, `core.longpaths` included, becomes our problem rather than Git's. It is also
a native module, carrying the Electron-rebuild and prebuilt-binary burden — on a project that has
just removed its other native dependency in ADR-DATA-01.

### Alternative C — `simple-git` (a promise wrapper over the CLI)

The right mechanism, wrapped. It spawns `git`, so **F2**, **F3** and **F10** are reachable in
principle. But it parses and reshapes output for many commands, normalises errors into its own error
type, and manages its own environment and task queue. The integration would consist of fighting it
back towards raw bytes: **F2** needs untouched stderr, **F4** needs precise per-invocation
environment control, **F1** needs a timeout bounding *one invocation* and reporting a specific
string, and `REQ-GIT-102` needs the Windows no-window spawn flag. What remains of the library after
those is the `spawn` call.

### Recommendation

**Spawn the `git` executable directly**, through a single small invocation helper owned by this
slice. No Git library.

The helper is the only place in the product that spawns `git`, and it is where **F1** to **F4** live.
It takes an argument vector; applies the caller's timeout; builds the environment by deleting the
fourteen named variables from a copy of the process environment and passing everything else through;
prepends the explicit repository and working-tree arguments; sets the Windows no-window flag;
captures stdout and stderr as bytes; decodes them as UTF-8 with replacement; and returns the raw
texts and the exit status without interpretation. The `<command>` rendering of `REQ-GIT-033` is
computed from the same argument vector, which is what makes it impossible for the rendered command
and the executed command to disagree.

Everything above it is a thin, testable mapping from that raw result to the message each requirement
fixes. `REQ-GIT-012`'s three phrases, `REQ-GIT-010`'s three phrases and `REQ-GIT-013`'s
stderr-else-stdout-else-`git command failed` ladder are all pure functions of the raw result and can
be tested with no repository present.

`REQ-GIT-001`'s no-network guarantee gets a mechanical enforcement point here: the helper rejects an
argument vector whose subcommand is in the network set, so the guarantee is a property of one
chokepoint rather than a discipline spread over every call site. `REQ-GIT-036`'s ref-name character
check likewise runs "before any Git call" at this boundary.

### Consequences accepted

- Git must be on `PATH`. The specification already accepts this and specifies the degraded state in
  full: `REQ-GIT-104`'s persistent notice with a fixed identity so refreshes replace rather than
  stack it, `REQ-GIT-042`'s availability rule, `REQ-GIT-112`'s sentinel message.
- Process-spawn cost per operation. `REQ-GIT-102` already bounds a refresh at 15 s × the number of
  reads, so the budget is stated — but a refresh issuing a dozen spawns is measurable, and the read
  set should be kept small rather than convenient.
- Output parsing is ours. Where a machine-readable form exists (`--porcelain`, `-z`,
  `--null-terminated`) it should be used, because `REQ-GIT-057`'s byte-order path sorting and
  `REQ-GIT-003`'s path handling both need paths as bytes rather than as Git's quoted display form.

### What would have to change to revisit this

A requirement that the product function with no Git installed, which `REQ-GIT-104` currently
contradicts by specifying that state in detail; or `REQ-GIT-013` being relaxed so error text need not
be Git's own — that single constraint is doing most of the work here.

---

## ADR-DATA-05 — Checkpoints are built with a private index and Git plumbing

### Decision to be made

By what mechanism a checkpoint captures a working tree, previews a restore, and performs a restore,
given that the user's Git state must be byte-identical afterwards.

### Constraints that bear on it

- **F5.** `REQ-GIT-004` and `REQ-GIT-030`: identical before and after — branch, HEAD, symbolic-ref
  target, **the on-disk index file byte for byte**, the reflogs of HEAD and every branch, the stash,
  the branch set, the staged entries. No reflog entry written, **no repack or garbage collection
  started**, the index "never refreshed, rewritten, or locked".
- `REQ-GIT-029`: checkpoints are ordinary Git commit objects reachable only from
  `refs/rotaris/checkpoints/<session-id>/<sequence>`.
- **F6.** `REQ-GIT-034`'s content rules, including gitignored-but-tracked paths, the executable bit,
  symlinks recorded as symlinks, and submodules recorded as a commit id only.
- **A2.** `REQ-GIT-003`'s exclusion is first-component, case-insensitive **over the ASCII letters**,
  applied to the path as the tree names it, never following a link.
- `REQ-GIT-039`: rename detection at 50 %, copy detection disabled.
- `REQ-GIT-040`: restore returns file contents, deletes files created after the checkpoint excluding
  gitignored and `.rotaris/` paths, and returns the union of paths that differed either way.
- `REQ-GIT-031`: inherited `GIT_INDEX_FILE` must be ignored **and the file it names left
  byte-identical**; `REQ-GIT-043`: all of this must work on a detached HEAD and inside a linked
  worktree, with the ref in the shared repository and the restore affecting only the linked tree.
- `REQ-GIT-033`: 30 s for ref-only invocations, 300 s for anything touching tree content.

### Alternative A — `git stash`, or a temporary branch

The obvious approaches, and both are excluded outright rather than merely awkward.
`git stash` (including `git stash create`, which does not move `refs/stash`) takes the repository
index lock and refreshes the index, which `REQ-GIT-030` forbids in terms. A temporary branch changes
the branch set, which `REQ-GIT-004` forbids. `git checkout` and `git reset` move HEAD. Every
porcelain command that would make this easy is closed off by one clause or another of those two
requirements — which is clearly deliberate, since the two requirements enumerate exactly the state
those commands touch.

### Alternative B — snapshot outside Git entirely (a content-addressed store of our own)

Copy the captured paths into a store under `.rotaris/`, with our own hashing and our own restore.
This gives total control over `REQ-GIT-003`'s exclusion rule and needs no Git at all, so it would
work on a workspace that is not a repository.

It fails `REQ-GIT-029`, which requires checkpoints to be ordinary Git commit objects reachable from
a ref, and `REQ-GIT-060`, which requires overwritten uncommitted content to be retrievable from the
safety checkpoint's **commit**. It would also have to reimplement Git's own recording of the
executable bit, symlinks and submodule gitlinks, which `REQ-GIT-034` explicitly defers to Git
("The recorded tree SHALL preserve what Git itself records for a working tree"). That phrasing is a
strong hint that the specification expects Git to do the recording.

It is worth noting what B would buy, because it is not nothing: `REQ-GIT-044`'s "a tree Git cannot
manage resolves to disabled — a workspace without undo" is a capability gap B would close. But
closing it would change what the product is, so it is not mine to close (see **ESC-3**).

### Alternative C — a private index plus plumbing

Point `GIT_INDEX_FILE` at a temporary index of our own under `.rotaris/`, stage into it, write a
tree, commit that tree with `commit-tree`, and create the ref with `update-ref`. The repository's own
index is never opened. For restore, read the checkpoint tree into a private index and materialise it
with `checkout-index`, then remove the extra paths ourselves.

This is the only mechanism that produces **F5**'s observables while satisfying `REQ-GIT-029`.

### Recommendation

**Alternative C**, with four specifics that follow from the constraints rather than from taste.

1. **The private index is ours and inherited redirection is neutralised first.** `REQ-GIT-031`
   requires the inherited `GIT_INDEX_FILE` to be ignored and the file it names left byte-identical.
   The invocation helper of ADR-DATA-04 deletes it from the environment; the checkpoint layer then
   sets its own value. The two are not in tension: neutralise, then set our own. The temporary index
   lives under `.rotaris/`, which `REQ-GIT-003` already excludes from every capture, so the index
   cannot capture itself.
2. **`.rotaris/` exclusion is applied by us, not by a Git pathspec.** Git's `:(icase)` pathspec magic
   and its `core.ignorecase` handling are not the rule `REQ-GIT-003` states — that rule is
   first-component only and case-insensitive **over the ASCII letters only**. Delegating it to a
   pathspec would produce a subtly different answer on a Turkish locale or against a path whose first
   component merely begins with `.rotaris`. The path set is therefore computed by us from explicit
   `git ls-files` queries — tracked paths, and untracked-not-ignored paths when
   `checkpoints.include_untracked` is true — filtered by our own predicate, and handed to the staging
   step as an explicit list. Paths come back NUL-separated so they are bytes rather than Git's quoted
   display form, which is also what **A8**'s byte-order sorting needs.
3. **Garbage collection is disabled per invocation.** `REQ-GIT-030` forbids a repack or a garbage
   collection being started. `-c gc.auto=0` on every checkpoint invocation makes that a property of
   the invocation rather than a hope about which commands trigger auto-gc.
4. **The nothing-to-record comparison is against a filtered HEAD tree.** `REQ-GIT-034` requires the
   comparison to be made against "HEAD's tree with every excluded path removed from it", so that a
   repository already tracking paths under `.rotaris/` can still report "nothing to record". That is
   a second tree construction, not a plain `diff-tree` against HEAD.

Restore and preview use the same private index. Preview is a diff between the checkpoint's tree and
the working tree with `--find-renames=50%` and copy detection off, per `REQ-GIT-039`; the four status
letters map to verbs by `REQ-GIT-063` and an unknown letter is carried through and rendered `change`,
so the letter is never used as an enum. `REQ-GIT-064`'s preview text is produced character-for-
character by one function and used by the one surface that shows it, `REQ-GIT-097`'s dialog.

The improvement-rollback checkpoints of `REQ-LIBRARY-067` use the same machinery against a different
ref namespace and a different retention rule, and `REQ-LIBRARY-077` explicitly inherits the
repository's line-ending normalisation from it: "a restored path MUST hold exactly the content a
fresh checkout of that checkpoint would produce in this working tree under the repository's
configured normalisation, not necessarily the same bytes the path held before the run." Using
`checkout-index` rather than writing bytes ourselves is what makes that guarantee true by
construction rather than by argument.

### Consequences accepted

- Capture cost is a full stage of the changed set into a fresh index. `REQ-GIT-033`'s 300 s budget is
  the whole budget and a repository too large to stage inside it produces the timeout error, which
  that requirement states is "a correct result of this requirement and not a defect in it".
- We depend on `git ls-files`, `hash-object`/`add`, `write-tree`, `commit-tree`, `update-ref`,
  `read-tree`, `checkout-index` and `diff-tree` being available — all long-stable plumbing.
- A workspace that is not a Git repository has no undo. That is `REQ-GIT-044`'s stated behaviour and
  `REQ-LIBRARY-163`'s ("A workspace with no Git repository MUST lose only the rollback capability").

### What would have to change to revisit this

`REQ-GIT-004` or `REQ-GIT-030` being relaxed about the index or the branch set, which would reopen
the porcelain route; or a requirement that checkpoints work outside a Git repository, which would
force Alternative B and would be a product decision rather than an architectural one.

---

## ADR-DATA-06 — The traceability engine is a stateless streaming library with its own parser

### Decision to be made

How the requirement store is parsed, how the repository is swept, where that code runs relative to
the desktop, and what it may remember between invocations.

### Constraints that bear on it

- **G1.** `REQ-TRACE-089`: no result carried over between invocations; no stored summary consulted in
  place of reading the files; two invocations over an unchanged repository report the same thing.
- **G2.** `REQ-TRACE-501`: linear cost, ~10³ documents in about a second, and **peak memory bounded
  by the largest single document plus the accumulated metadata records** — "no phase of the parse
  SHALL require every document's text to be resident at once". `REQ-TRACE-088`: linear sweep, ~10³
  files and ~10⁴ sites in about a second under stated reference conditions.
- **G4.** `REQ-TRACE-197`: exactly one parser. `REQ-TRACE-013`: that parser depends on no third-party
  YAML, TOML or validation library, and the layout configuration is JSON for the same reason.
- **G5.** `REQ-TRACE-104` needs a *parsed* re-export-only test; `REQ-TRACE-109` needs a *syntax tree*
  for test collection; `REQ-TRACE-110` requires a syntax error to yield an empty function list rather
  than a failure; `REQ-TRACE-182` requires the test session itself to regenerate before collection.
- **G11.** `REQ-TRACE-206` and `REQ-TRACE-377`: the consuming surface calls the library directly and
  receives plain data; **no module of the desktop application may launch a checking process**, and a
  guard test asserts it.
- **G10.** `REQ-TRACE-337`: evaluation and projection never on the interface event loop.
- `REQ-TRACE-207`: a sweep performed for a consuming surface uses **the project's own layout**, never
  the toolchain's built-in defaults. `REQ-TRACE-208`: where the layout cannot be read, log a warning
  and carry on with an **empty sweep result**, showing no coverage anywhere — do not report a read
  failure to the user and do not decline to display.

### Alternative A — parse the store into a resident model and refresh it incrementally

Hold the parsed store in memory across invocations, watch the filesystem, and update the affected
entries when a document changes. This is the design most boards get, and it would make
`REQ-TRACE-173`'s N-scans cost disappear.

`REQ-TRACE-089` forbids it in the plainest language in the whole domain. And `REQ-TRACE-203` is
explicit that "Scanning is therefore not incremental by default", with incremental reading an
*optional source capability* rather than the engine's own behaviour. What survives of A is the
**within-invocation** reuse `REQ-TRACE-089`'s last sentence permits and `REQ-TRACE-202` invites —
prose reads keyed to the store's own content hash, so an unchanged document's text is not fetched
twice within one refresh.

### Alternative B — a stateless engine invoked per operation, streaming its parse

Every operation opens with a fresh parse and a fresh sweep. Within one invocation, values are shared
freely: `REQ-TRACE-091` requires one reading of the store and one reading of the repository to serve
every check in a verification run, and `REQ-TRACE-128` says "how much of the work the invocation
repeats… SHALL NOT be observable". Between invocations, nothing is retained.

### Recommendation

**Alternative B**, with five specifics.

1. **Streaming parse.** `REQ-TRACE-501`'s memory bound is a design constraint, not a performance
   note: normalise, hash and reduce each document to its metadata record before reading the next.
   That rules out the natural `readdir` → `map(readFile)` → `map(parse)` shape, which holds every
   document's text at once. It also means the content hash is computed over the normalised text as it
   streams, and the prose extraction of `REQ-TRACE-198` happens in the same pass.
2. **The frontmatter reader is hand-written and shares nothing with ADR-DATA-03's YAML library.**
   `REQ-TRACE-013` requires it, and the grammar is not YAML anyway: `REQ-TRACE-008` to
   `REQ-TRACE-011` fix a line-oriented format with continuation lines joined by a single space, a
   value that is everything after the first colon with one matching outer quote pair removed and
   **no other escape or quote processing**, and an unterminated block that yields no frontmatter and
   **no diagnostic of any kind** (`REQ-TRACE-009`). A YAML parser would reject documents this reader
   must accept and accept constructs this reader must not interpret. Two parsers in one product is
   the right answer here and it is required rather than tolerated.
3. **A syntax tree is needed, and that is a language-choice consequence.** `REQ-TRACE-104` and
   `REQ-TRACE-109` cannot be satisfied by regular expressions: one asks whether a module's *parsed*
   contents consist of nothing beyond imports, module-level assignments and documentation, and the
   other collects functions and one level of class nesting from the tree. `REQ-TRACE-110` requires a
   syntax error to produce an empty list rather than a failure, which presupposes a parser that
   reports syntax errors. So the engine ships a parser for the product's own implementation language.
   If that language is TypeScript, the realistic options are the TypeScript compiler API (correct,
   heavy, and already present if the build uses it) or a fast native parser such as `oxc` or `swc`
   (lighter, another native module — which ADR-DATA-01 has just argued against carrying). This
   belongs in the ARCH slice's language decision as an input, and I flag it rather than settle it.
   Note also that `REQ-TRACE-088`'s one-second budget covers **the sweep only** — "enumeration,
   reading and matching" — and no budget is stated for the parse-requiring orphan checks, which is
   **OQ-5**.
4. **Choosing the implementation language chooses the built-in annotation convention.**
   `REQ-TRACE-075`: "Exactly one convention SHALL be registered by default, and it SHALL claim the
   single source extension of the implementation language." `REQ-TRACE-039`'s `generated_path`
   default takes that extension, and `skip_parts` takes "the two directory names under which the
   implementation language's own toolchain places its generated caches and its installed
   dependencies". If the product is written in TypeScript, the generated symbol module is a
   TypeScript module, the built-in convention's four regular expressions are authored against
   TypeScript, and the two skip components are the TypeScript toolchain's. `REQ-TRACE-181`(1) further
   needs a symbol whose disappearance is a **build error** and whose deprecation carries "the
   language's deprecation marker" — a TypeScript `enum` with `@deprecated` JSDoc gives the first
   (a missing member fails `tsc`) and the second at editor level; making it a build-time warning
   needs a lint rule, which is a small but real obligation. `REQ-TRACE-182`'s regenerate-before-
   collection hook is a test-runner plugin and therefore an input to the test-framework choice.
   `REQ-TRACE-078` is the reason a plain-call annotation form is required regardless of what the
   language's decorators can attach to: "the toolchain's own modules cannot use decorator syntax
   before the artifact they generate exists."
5. **The board projection is one immutable value per pass.** `REQ-TRACE-348`: "A board pass SHALL be
   held in **one value** so a reader can never observe half an update, and a detail read during a
   pass SHALL describe **one generation** of the board. A finished pass SHALL retire itself and never
   the pass that replaced it." All the joining, closure and sorting that Alternative A of ADR-DATA-01
   wanted a database for happens here, over data already in memory for the pass, and is handed
   across already translated (`REQ-TRACE-378`). `REQ-TRACE-380` makes the projection-to-display
   mapping pure with every input supplied including the current time — so it reads no file, consults
   no repository, reaches no engine and requires no UI toolkit, and is therefore directly testable.

`REQ-TRACE-207`'s "the project's own layout, never the toolchain's built-in defaults" deserves a
mechanical guard: the sweep entry point should take a layout value with no default, so that omitting
it is a compile error rather than a silent fall-back to this repository's own roots. That is exactly
the failure the requirement describes — "every card in a foreign workspace would show no
implementation and no covering test".

### Consequences accepted

- `REQ-TRACE-173`'s N-scans cost stands.
- Every board refresh re-reads the store and re-sweeps the repository. `REQ-TRACE-225` accepts this
  and states the mitigations: the read runs off the interface thread, the board says a refresh is in
  progress, the last good board stays on screen, and every external call the read makes is bounded.
- A syntax-tree parser for the implementation language ships inside the product.

### What would have to change to revisit this

`REQ-TRACE-089` being relaxed to permit a cache with a stated invalidation rule; or a measured
failure to meet `REQ-TRACE-088` or `REQ-TRACE-501` on a real repository at the stated scale, which
would make the streaming design a correctness problem rather than a memory-hygiene one.

---

## ADR-DATA-07 — The delivery store is per-requirement documents behind a capability-split writer

### Decision to be made

The file granularity of the delivery record store, and how the single-write-path and
separately-grantable-read/write requirements are made structural rather than conventional.

### Constraints that bear on it

- **H1.** `REQ-CONFIG-192` fixes the directory (`.rotaris/<store_subpath>/`, default `requirements`),
  that it holds **operational records only** and never requirement text, and four settings:
  `schema_version` (written into every record), `retain_tombstones`, `audit_trail`, `history_limit`
  (200 per requirement). It does **not** fix the file granularity.
- **H2.** Forward-tolerant version handling; an unsupported record left on disk and reported in
  exactly three places while the workspace still opens.
- **H3.** `REQ-TRACE-399`: one write path; **a guard test asserts no module writes the delivery store
  directly**. `REQ-TRACE-403`: reading and writing separately grantable, with a guard test asserting
  a read-only composition offers no state-changing operation at all.
- **H4.** `REQ-TRACE-405`: every state-changing action writes who, when, which requirement, and the
  requirement's hash at that instant, distinguishable as person or machine (`REQ-CONFIG-198` fixes
  what counts as a person). `REQ-TRACE-402`: the application **refuses to start** if assembled with a
  writer that does not compare the hash.
- **H5.** `REQ-TRACE-476`: restart rebuilds delivery state, units, queued and running runs, and
  worktrees from what was persisted; a dead run is reported interrupted with its work retained; the
  queue resumes without re-running completed units; no requirement silently reset.
- **C1.** No locking; read-modify-write immediately before the write; unbounded concurrent writers.
- **G2.** `REQ-TRACE-239`: 100 ms to put a board on screen, not growing with store size.

### Alternative A — one document for the whole store

A single `delivery.json` holding every requirement's state, history and audit trail.

One read to build a board, trivially consistent, and the cheapest thing to write. But under **C1**'s
read-modify-write-with-no-locking rule, *every* transition rewrites the whole store, so two
concurrent transitions on two **different** requirements can lose one of them. That directly
contradicts `REQ-TRACE-388`, which bounds concurrency per requirement and explicitly places "no
further bound… on how many actions may be in flight across **different** requirements, each being
independent". A single document makes them not independent. It also makes **H2** unworkable: an
unsupported `schema_version` on one record must leave its neighbours readable, which a single
document cannot do.

### Alternative B — one document per requirement, plus an append-only audit log

`.rotaris/requirements/<requirement-id>.json` holding that requirement's delivery state, its
`history_limit`-bounded history, its run records and its worktree references; plus
`audit.jsonl` appended to for the audit trail; plus a `tombstones` record for retained ids.

Concurrent transitions on different requirements touch different files and cannot collide, which is
what `REQ-TRACE-388` describes. An unsupported record isolates to one requirement, which is what
**H2** requires. History pruning to 200 is a rewrite of one small document.

The cost: building a board reads N documents. At `REQ-TRACE-300`'s scale — 100 populated columns, a
store of several hundred requirements — that is several hundred small reads per board build, against
`REQ-TRACE-239`'s 100 ms budget. Note that the budget is on **putting the board on screen once the
engine has answered**, not on the engine's read, and that the read is required to be off the
interface thread anyway (**G10**); so the constraint is softer than it first appears. It should still
be measured before the gate.

### Alternative C — one document per transition (an append-only event log per requirement)

Never rewrite; only append. Concurrency-free, and a natural fit for the audit trail.

It fails `history_limit`: `REQ-CONFIG-192` requires older history entries to be **pruned**, which an
append-only log cannot do without rewriting, at which point it is Alternative B with more files. It
also makes `REQ-TRACE-476`'s restart rebuild a fold over every transition ever recorded rather than a
read of current state, and makes `REQ-TRACE-279`'s revision-history join more expensive rather than
less.

### Recommendation

**Alternative B.** One document per requirement, an append-only audit log beside it, and a tombstone
record. Every document carries `schema_version` and is read forward-tolerantly per **H2**.

Two structural points matter more than the layout:

**The write path is a capability, not a convention.** `REQ-TRACE-403` requires that a component given
read access "SHALL have **no route** by which to change a delivery state, write an audit record or
start a run", and that a guard test assert it. The way to satisfy that is two distinct handle types —
a reader value that carries only query methods and a writer value that carries the transition
function — with the reader obtainable without the writer and never derivable from it. A single
service object with a naming convention does not satisfy a test that asserts the read-only
composition "offers no state-changing operation at all"; that test can only pass if the operations
are genuinely absent from the value.

**The startup assertion is real code.** `REQ-TRACE-402`: "Where the application is assembled with a
delivery-state writer that does not make that comparison, it SHALL **refuse to start** and SHALL name
the comparison that is missing." So the writer declares, as data the assembly can inspect, that it
performs the specification-hash comparison, and startup checks that declaration and aborts with a
named message if it is absent. This is unusual and worth stating plainly: the specification is asking
for a self-check on the composition, not merely for correct behaviour. It pairs with
`REQ-TRACE-377`'s and `REQ-TRACE-399`'s guard tests as a small family of structural assertions this
slice owes.

`REQ-CONFIG-198`'s definition of **a person** is what the audit record's actor field must carry: the
action arrived through an interactive surface, in direct answer to a prompt raised for that specific
action, with that surface attached to a window. Anything from an agent, a hook, a scheduled or
unattended run, or a replay is not a person "whatever it claims about itself". So the actor is
determined at the boundary where the action enters the process, not asserted by the caller — which
means the transition function's signature must take an attribution value that only the interactive
boundary can construct.

### Consequences accepted

- N reads to build a board, mitigated by the read being off the interface thread and measurable
  against `REQ-TRACE-239`.
- Two files change per transition — the requirement document and the audit log — with no transaction
  between them. `REQ-TRACE-405` requires the record to exist; the ordering is ours to choose, and the
  audit entry should be appended **after** the state document is replaced, so a crash between them
  leaves a state with no audit line rather than an audit line for a state that was never reached.
  That direction is a judgement, not a requirement, and is worth confirming (**OQ-2**).
- Directory growth is one file per requirement, which for a store of a few thousand requirements is
  ordinary.

### What would have to change to revisit this

A measured failure to meet `REQ-TRACE-239` at `REQ-TRACE-300`'s scale, which would push toward a
per-column or per-epic grouping of documents; or `REQ-CONFIG-192` gaining a statement about file
granularity, which would settle **OQ-1** and might settle this.

---

## ADR-DATA-08 — Where the data layer runs

### Decision to be made

Which process owns workspace document I/O, configuration loading, Git invocation and the
traceability engine. This overlaps the ARCH slice's process-model decision and is offered as an
input to it rather than as a settlement of it.

### Constraints that bear on it

- **G10.** `REQ-TRACE-337`: evaluation and projection **never** on the interface event loop;
  `REQ-TRACE-497` lists it among the things that must never be observable. `REQ-GIT-102`: the
  interface accepts and acts on input for the whole time any Git refresh is running.
  `REQ-LIBRARY-122`: analysis runs off the UI thread and the user can keep typing and start runs.
- **G11.** `REQ-TRACE-377`: **no module of the desktop application may launch** a
  requirement-checking or verifier process, and a guard test asserts it. `REQ-TRACE-206`: the
  consuming surface calls the library directly — "no child process, no exit status to inspect and no
  text to parse".
- `REQ-LIBRARY-127`: shutdown leaves nothing of analysis behind, and the work "MUST NOT be handed to
  a durable out-of-process service that would outlive the application". The time from asking to quit
  to the process exiting must not depend on whether an analysis was in flight.
- `REQ-GIT-101`: shutdown **waits** for an in-flight checkpoint Git operation rather than killing it
  mid-call. `REQ-GIT-102`: shutdown waits for a refresh already under way, and exactly one refresh
  runs at start, after the window is first drawn and before onboarding is offered.
- `REQ-GIT-124`: a run counts as active whenever it holds a session lock in this workspace, "whether
  it was started in the desktop foreground or detached into the background, **and whether or not this
  application started it**". Cross-process, cross-instance coordination through lock files is the
  specified world, not an edge case.
- **G7, OQ-6.** `REQ-TRACE-073` compiles and runs **user-supplied regular expressions** over
  repository files, and `REQ-TRACE-154` and `REQ-TRACE-225` deliberately place no time limit on the
  scan.
- `REQ-CONFIG-374`: work completing after the settings screen has been destroyed must not crash.
- Configuration, the Git view, the board and the improvement library are all needed **with no run
  active**, so none of them can live in a per-run process.

### Alternative A — everything in the Electron main process, heavy passes on worker threads

Main is already a Node process with filesystem access, it owns window lifecycle (which
`REQ-GIT-102`'s "after the window has first been drawn" and `REQ-GIT-101`'s shutdown wait both need),
and it means one fewer IPC hop for the board projection.

Against it: main is the process every window's IPC and window management flows through. A synchronous
filesystem call or a runaway user regex there degrades every window at once. Worker threads mitigate
the CPU case and are terminable, so this is not fatal — but it puts the least isolated process in
charge of the least bounded work.

### Alternative B — a long-lived workspace service process, separate from per-run runtime processes

An Electron `utilityProcess` (a Node child with no Chromium) per open workspace, owning all workspace
document I/O, configuration, Git invocation and the traceability engine. Per-run runtime processes
remain separate and short-lived. The main process keeps only the preference store, window state and
lifecycle coordination. The renderer touches no filesystem at all.

For it: isolation from the two genuinely unbounded workloads — user regexes and the engine read that
`REQ-TRACE-225` deliberately leaves unbounded. `REQ-TRACE-377`'s guard test becomes structurally
easy, because a renderer with no Node integration physically cannot spawn a process. It matches the
already-specified world of `REQ-GIT-124`, where several processes coordinate through lock files.

Against it: one more IPC hop for the board projection, which can be large; and lifecycle
coordination (`REQ-GIT-101`'s shutdown wait, `REQ-GIT-102`'s post-first-paint startup refresh)
becomes cross-process choreography rather than a function call.

### Alternative C — in the renderer with Node integration

Rejected outright. `REQ-TRACE-337` forbids it, and enabling Node in a renderer that displays
model-generated content is a security decision no requirement asks for.

### Recommendation

**Alternative B**, offered to the ARCH slice as an input rather than as a settled decision, because
the process model is theirs.

The split I would propose:
- **Renderer:** no filesystem, no Git, no engine. Receives already-translated projection values
  (`REQ-TRACE-378`) and emits intents (`REQ-CONFIG-279`: "The screen's outward contract is a set of
  intent notifications, not file writes… The host commits; the screen never names a file").
- **Workspace service (one per open workspace):** ADR-DATA-02's stores, ADR-DATA-03's configuration
  loader, ADR-DATA-04's Git helper, ADR-DATA-05's checkpoint layer, ADR-DATA-06's engine, and
  ADR-DATA-07's delivery store. Within it, the engine's passes run on worker threads so a runaway
  regex is terminable without taking the service down.
- **Main:** the preference store (ADR-DATA-09), window state, and the lifecycle sequencing that
  `REQ-GIT-101` and `REQ-GIT-102` describe.
- **Per-run runtime processes:** unchanged, and they take the session lock of `REQ-GIT-020` like any
  other process.

Two consequences to carry into synthesis. First, `REQ-TRACE-239`'s 100 ms budget is measured "once
the engine has answered", so projection serialisation across the IPC boundary sits **before** that
line and is not covered by it — but it is still real, and a projection for several hundred
requirements should be measured across the boundary before the gate. Second, `REQ-LIBRARY-127` is
satisfied only if the workspace service is a child that dies with the application; it must not be a
detachable daemon.

### Consequences accepted

- Cross-process lifecycle choreography for two shutdown behaviours that differ deliberately:
  `REQ-GIT-101` waits for checkpoint Git work; `REQ-LIBRARY-127` abandons the analysis call. Both
  must be implemented, and they must not be unified.
- Projection serialisation cost.
- More processes to supervise, and a supervision story for the service itself — which
  `REQ-TRACE-507` already anticipates for the live-refresh subscription: a persistent, actionable
  notice naming what stopped, a re-subscribe action, the last good board kept on screen, no polling
  and no automatic retry.

### What would have to change to revisit this

A measured projection-serialisation cost that endangers board responsiveness; or the ARCH slice
settling on a single-process model for reasons outside this slice, in which case Alternative A plus
worker threads is a defensible fallback and none of ADR-DATA-01 to 07 changes.

---

## ADR-DATA-09 — The preference store is a closed typed registry over a plain file

### Decision to be made

How the per-user desktop preference store is implemented, given that its physical form is explicitly
free but its key set is explicitly closed.

### Constraints that bear on it

- **A3.** `REQ-SHELL-006`: one platform-standard per-user store scoped to organisation `Rotaris` and
  application `Rotaris`, established before the first preference read; disjoint from the layered YAML
  surface in both directions; outside every workspace so no preference appears in a project or its
  version control; created on first write; absence is not an error but the state in which every key
  answers with its declared default; a written value reads back after a restart. Physical path and
  encoding are free — "Two conformant builds may therefore lay the same keys out differently on
  disk."
- **The key set is closed.** `REQ-SHELL-006`: "the store's key set is exactly the keys listed in the
  per-user preference store table… and a key that does not appear in that table does not exist…
  a preference key named in another document but absent from that table is not a preference of this
  product." Keys are slash-namespaced; no dot-namespaced form exists.
- Defaults are owned elsewhere but registered there: `REQ-CONFIG-405` lists nine keys with their
  types and defaults; `REQ-GIT-153` relies on `interface/worktreeCleanupPrompt` being user-scoped and
  default-enabled; domain 08's persisted-state table adds the board's filter, sort, axis, fold and
  released-run keys.
- **Tolerant reads are contractual.** `REQ-CONFIG-405`: "Boolean restoration is tolerant of how the
  preference backend spelled the value." Domain 08 repeats it: "a text backend round-trips a boolean
  as a string, a native backend does not." `REQ-TRACE`'s `requirements/blocked_column` default is
  `true` with "any value other than the string `false`, case-insensitively, reads as true".
  `REQ-SHELL-069` adds tolerant integer parsing.
- **Some values are structured strings.** `workspaces/<resolved absolute path, or the literal default
  key>/requirementColumnFolds` is "one JSON object string, keys sorted, mapping column key to
  boolean". A preference value is therefore sometimes a serialised document, and its serialisation is
  fixed (sorted keys).
- **Failure behaviour is specified.** `REQ-TRACE-498`: fold settings unreadable, or written by a
  later build → nothing is folded and the board opens under the emptiness rule; a stored sort order
  or axis unknown to this build → the default for that setting is used. `REQ-GIT-153`: a stored value
  that cannot be used restores the view's declared default rather than raising.

### Alternative A — `electron-store` or a similar preferences package

Gives a JSON file in `userData`, schema validation, defaults and migrations, for no work.

Against it: its schema-and-defaults model normalises on read, which fights the tolerant-coercion
contract (a boolean stored as `"true"` by a text backend must read as `true`, not fail validation);
its migration feature has no counterpart in the requirements and would be dead weight or, worse, a
temptation; and it does not enforce a **closed** key set, which is the one property `REQ-SHELL-006`
insists on twice. We would wrap it in a registry to get that, at which point it is providing a JSON
file and a debounce.

### Alternative B — a native platform store per platform

Registry on Windows, `defaults`/`NSUserDefaults` on macOS, an XDG file on Linux — arguably the most
literal reading of "the host platform's own standard per-user application-settings location".

Against it: three implementations, three coercion behaviours (which is exactly the "text backend
versus native backend" split the requirements have to accommodate), and no benefit, since
`REQ-SHELL-006` explicitly frees the physical form. It would also make the structured-string values
awkward on the registry.

### Alternative C — a small typed registry over a single JSON file

One module owning: a table of key → type → default, which *is* the closed key set; typed accessors
that will not compile for an unregistered key; tolerant read coercion per type; and writes through
ADR-DATA-02's primitive into a JSON file in Electron's `userData` path for the `Rotaris`/`Rotaris`
pair.

### Recommendation

**Alternative C.**

The reasoning is that the requirement's substance is entirely in the *registry*, not in the storage.
`REQ-SHELL-006` frees the encoding and then spends its length on the closed key set, the scoping, the
absence semantics and the restart round-trip. A hand-written registry makes the closed set a
compile-time property — a key absent from the table is not addressable — which is the strongest form
of "a key that does not appear in that table does not exist". No package gives that.

Two details worth fixing here rather than discovering later:
- The tolerant coercion is **per type and per key**, not global. `requirements/blocked_column`'s rule
  ("any value other than the string `false`, case-insensitively, reads as true") is not the same as a
  generic boolean parse, and `REQ-SHELL-069`'s tolerant integer parse is a third rule. The registry
  entry carries the coercion.
- Structured values serialise deterministically. `requirementColumnFolds` is "one JSON object string,
  **keys sorted**" — so the registry's serialiser sorts, and the sorting is byte order per **A8**.

The store is established before the first preference read, per `REQ-SHELL-006`, which makes it a
main-process startup step rather than a lazily initialised singleton.

### Consequences accepted

- We own the file format and its evolution. Since every key answers with its declared default when
  absent (`REQ-SHELL-006`) and every unknown stored value falls back to a default
  (`REQ-TRACE-498`), forward and backward compatibility are already the specified behaviour and need
  no migration mechanism — which is why Alternative A's migration feature is not a loss.
- Adding a preference means editing the registry table, which is the intended friction:
  `REQ-SHELL-006` requires a new preference to be "registered in that table rather than minting a key
  of its own".

### What would have to change to revisit this

A requirement that preferences be readable or writable by another program, which would argue for a
platform-native store; or the key set ceasing to be closed.

---

# Part 4 — Escalations

These change what the product *is* for a user rather than how it is built. They are the product
owner's, not mine.

## ESC-1 — The shared save path between Settings and the composer's permission-mode control

`REQ-CONFIG-288` states the behaviour and then explicitly hands the decision over: "The same save
path is shared with the composer's permission-mode control, with the consequence that choosing a
permission mode there **also commits every other pending Settings edit**. A rewrite must decide about
this cross-surface coupling explicitly."

The options, with what each costs:

1. **Preserve the coupling.** Matches the stated behaviour exactly. A user with unsaved Settings
   edits who changes the permission mode in the composer silently commits those edits. It is the only
   option with no conformance risk, and the only one where a user can be surprised.
2. **The composer control writes only its own key**, through the scoped per-field writer of
   `REQ-CONFIG-441`, which already exists for exactly this shape of write and "leaves every other
   runtime key in that file untouched" (`REQ-CONFIG-443`). Pending Settings edits stay pending. This
   is the smallest change and the machinery is already specified.
3. **The composer control becomes Tier B only** — it changes the live settings state, which the next
   run reads under `REQ-CONFIG-262`, and writes no file at all. `REQ-CONFIG-328` already notes the
   asymmetry that "the composer's equivalent control writes and applies immediately", so this would
   change that.

Related requirements the decision must not break: `REQ-CONFIG-423` (the Settings control shows the
permission mode held in the pending state, and a change made by any other surface writing through the
shared save path lands in that pending state and appears after the next refresh) and
`REQ-CONFIG-418` (Discard restores only workspace configuration).

I have no basis in the specification for choosing, and the difference is visible to a user in a
security-relevant control. **ESCALATE.**

## ESC-2 — Whether configuration write-back preserves comments

`REQ-CONFIG-252` states plainly that everything the write path does not touch round-trips through
parse-and-re-emit, and that "**Comments and formatting are lost while content is preserved — the
observable cost of editing models from a UI**." That is a fixed observable.

Spike 2 showed that preserving comments is nearly free: `yaml`'s `Document` edit API keeps comments,
layout and key order through a targeted edit, and it is the same API ADR-DATA-03 already recommends
for tri-state. Preserving them is *less* work than deliberately discarding them.

The options:

1. **Match the specification** — parse and re-emit, losing comments. Conformant. Costs the user the
   comment header the bootstrap itself writes (`REQ-CONFIG-025` specifies a comment header explaining
   what the file overrides), the first time they touch a model slot on the settings screen.
2. **Preserve comments** — a strictly better user outcome, and cheaper to build, but it changes an
   observable the specification fixes, so a black-box conformance comparison would flag it.

This is a product decision because it changes what a user's file looks like after they use the
settings screen, and because the specification went out of its way to name the loss as a cost rather
than as an incidental. It is worth deciding deliberately rather than inheriting.

Note the interaction: `REQ-CONFIG-248` requires key order preserved and never alphabetised, which
option 2 also satisfies. Nothing else depends on comments being lost. **ESCALATE.**

## ESC-3 — Silent loss of a review decision under last-writer-wins

`REQ-LIBRARY-042` fixes the semantics and accepts the consequence: "only two writers whose read and
write genuinely interleave can lose one of the two changes, and in that case the later replacement
wins whole… The agreement guarantee of `REQ-LIBRARY-164` is an agreement about what the store holds,
not a promise that no decision can be overwritten."

So a user can approve a proposal, another window can reject it, and one decision disappears with no
report. The specification is not ambiguous about this and I would not raise it except that the
neighbouring requirement `REQ-LIBRARY-173` already builds the machinery for the adjacent case: where
an action's target is no longer present, the action writes nothing, re-reads, and **posts a warning
naming the proposal that no longer exists**. Extending that from "no longer present" to "changed
underneath you" would be small, and `REQ-LIBRARY-116` already does something very close for the Undo
path: "Given a proposal whose status was changed again from another surface after the decision the
notice announced, Undo MUST write nothing and MUST report that the proposal has since changed and
name the status it now holds."

So the product already reports a concurrent change in one place and silently loses it in another.

The options:

1. **Match the specification.** Silent loss on the ordinary write path, a stated report on the Undo
   path. Conformant. My recommendation absent a decision, because `REQ-LIBRARY-042` is explicit.
2. **Extend `REQ-LIBRARY-116`'s reporting to every write** — compare the freshly read state against
   what the surface was showing, and where they differ, write nothing and report it. This adds a
   refusal where the specification has none, which is a change to what the user experiences.

Not a decision I should take silently on grounds of correctness-mindedness. **ESCALATE.**

---

# Part 5 — Open questions

Where the specification is genuinely silent on something this slice needs.

**OQ-1 — Delivery record file granularity.** `REQ-CONFIG-192` fixes the directory, the fields and
four settings, but not whether a delivery record is one file per requirement, one per transition, or
one for the store. ADR-DATA-07 chooses one per requirement and gives its reasoning, but the choice is
mine rather than the specification's and it is observable to anyone who opens `.rotaris/`.

**OQ-2 — Ordering between the delivery state write and the audit append.** `REQ-TRACE-405` requires
both to exist; `REQ-CONFIG-192` requires the audit trail to record each transition. Neither states
which is written first, so neither states what a crash between them leaves. ADR-DATA-07 proposes
state first, audit second, on the grounds that an unrecorded transition is a lesser evil than an
audit line for a transition that never happened — but the opposite argument (the audit trail is the
evidence and must never be missing an entry) is available, and `REQ-TRACE-133` chose exactly that
opposite direction for the tombstone log: "written **before** the new generated artifact, so that a
crash between the two leaves the identifier recorded rather than forgotten." Worth confirming.

**OQ-3 — Two incompatible Windows retry schedules.** `REQ-LIBRARY-043` fixes 5 attempts completing
within **1 second** of the first. `REQ-SESSION-033` (domain 07) fixes 5 attempts with backoff
0.05 / 0.1 / 0.2 / 0.4 / 0.8 s, summing to **1.55 s**. Both describe the same mechanism on the same
platform for the same reason. Either domain 07's schedule violates domain 14's bound if one primitive
serves both, or the two stores deliberately differ. ADR-DATA-02 contains the conflict by making the
schedule a per-store policy, but the two requirements should be reconciled rather than papered over.

**OQ-4 — Durability semantics are unstated.** No requirement in this slice asks for `fsync`.
`REQ-LIBRARY-138` asks for the prompts file to be "flushed to disk", which is the only durability
verb anywhere in my domains. Every other crash-safety requirement is phrased as an *ordering*
(`REQ-TRACE-133`, `REQ-GIT-048`, `REQ-GIT-058`) or as *the replace is atomic* (`REQ-TRACE-061`,
`REQ-LIBRARY-043`). Spike 1 showed directory `fsync` is unavailable on Windows through Node, so the
POSIX rename-durability idiom cannot be applied uniformly. The question is whether "atomic" here
means only "no torn read" — which `rename` gives — or also "survives a power loss", which it does not
without an `fsync` of the file before the rename. `REQ-LIBRARY-043` says "a write interrupted by a
crash or power loss MUST leave the artifact readable", which is satisfied by either reading. I would
propose `fsync` on the staged file before `rename` and no directory `fsync`, but the requirement does
not settle it.

**OQ-5 — No cost budget for the parse-requiring checks.** `REQ-TRACE-088`'s one-second budget covers
"the sweep alone — enumeration, reading and matching". `REQ-TRACE-104`'s re-export-only test and
`REQ-TRACE-109`'s test-function collection both require a full syntax tree, and `REQ-TRACE-091`
requires them in the same verification run. No budget is stated for them. At `REQ-TRACE-088`'s scale
of 10³ source files a full-fidelity parse is materially more expensive than a regex pass, and it
would be useful to know whether that is intended to sit inside the same expectation.

**OQ-6 — User-supplied regular expressions run unbounded.** `REQ-TRACE-073` compiles four patterns
per project-declared convention and evaluates them against every claimed file's normalised text.
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern
with catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own
mitigations — the board stays usable, the last good board stays on screen — cover the *symptom* but
leave the pass wedged. ADR-DATA-08's worker-thread placement makes it terminable; whether it *should*
be terminated, and what the user is told, is not specified. Note the pattern comes from a file in the
checked-out repository, so it arrives with a project rather than from the user.

**OQ-7 — What raising `requirements.delivery.schema_version` is for.** `REQ-CONFIG-192` makes it
configurable (int ≥ 1, default 1) and says "The reader supports exactly the versions **1 through the
configured `schema_version`**, which as shipped is the single version `1`". So a user raising the key
widens what the reader will interpret, for versions the shipped build has no code to interpret. The
intent is unclear and the failure mode of setting it to 2 today is unstated.

**OQ-8 — `secrets.yaml` is given no file mode.** `REQ-CONFIG-444` requires mode `0644` for every
writer of `agents.yaml`, and `REQ-CONFIG-212` for the discovery snapshot. `REQ-CONFIG-216` requires
`secrets.yaml`'s write to be atomic and to create its directory, and says nothing about mode — so on
the plain reading it inherits the process umask. `secrets.yaml` is the one file in this slice that
holds credentials by design (`REQ-CONFIG-007`, `REQ-CONFIG-214`), and `0644` would make it
world-readable on a shared POSIX machine. This looks like an omission rather than a decision, and
`0600` would be the obvious value. Raising it rather than choosing it, because tightening a mode the
specification left unstated is still a change to an observable.

**OQ-9 — Whether the workspace service is per-window or per-application.** ADR-DATA-08 assumes one
per open workspace. Domain 12 owns window management and domain 07 owns the session model; whether
two windows on the same workspace share a service, and what that means for `REQ-GIT-091`'s
"at most one desktop checkpoint operation in flight" (is that per window or per workspace?), is not
something my domains settle. `REQ-GIT-128`'s integration lock is explicitly per base workspace, which
is a hint that workspace is the right unit.

---

# Part 6 — Findings that bear on the candidate stack

Summarised for the synthesis step.

| Candidate element | Verdict from this slice |
| --- | --- |
| **SQLite + Drizzle + better-sqlite3** | **Poor fit — recommend removing.** `REQ-TRACE-502` requires concurrent invocations never to wait and never to fail because another was running, which a lock-based store cannot provide. `REQ-TRACE-089` forbids consulting a stored summary in place of reading the files. `REQ-CONFIG-192` requires per-record forward-tolerant versioning with unsupported records left unmigrated on disk. See ADR-DATA-01. |
| **Event journal with projections** | **Partly fixed, partly misapplied.** A per-session journal is specified in detail by domain 20 and is not ours to choose. Nothing in this slice is event-sourced: configuration, worktree bindings, improvement artifacts and delivery records are documents with fixed formats, and `REQ-LIBRARY-049`'s version history holds full copies with intermediate versions pruned, which an event log cannot survive. See ADR-DATA-01 Alternative C. |
| **A separate runtime process for run execution** | **Fits, but insufficient by itself.** Configuration, the Git view, the board and the improvement library are all needed with no run active, so they cannot live in a per-run process. This slice proposes an additional long-lived per-workspace service. See ADR-DATA-08. |
| **Electron** | **Settled by product decision, and no requirement in this slice contradicts it.** `REQ-SHELL-006` frees the preference store's physical form, which Electron's `userData` path satisfies. |
| **TypeScript** | **Fits, with a named consequence.** `REQ-TRACE-075` makes the built-in annotation convention claim the implementation language's source extension, so choosing TypeScript makes the generated requirement-symbol artifact a TypeScript module, requires a TypeScript syntax tree inside the product for `REQ-TRACE-104` and `REQ-TRACE-109`, and requires a test-runner hook for `REQ-TRACE-182`. This is an input to the ARCH slice's language decision. See ADR-DATA-06. |
| **Zustand, React, Vercel AI SDK, MCP SDK, xterm.js/node-pty, electron-vite** | Outside this slice; no constraint of mine bears on them. |
| **New: a YAML library is required** | `yaml@2.9.0` recommended over `js-yaml`, because only it exposes the document AST that `REQ-CONFIG-055` to `REQ-CONFIG-057`'s tri-state and `REQ-CONFIG-248`'s key-order preservation need. See ADR-DATA-03 and Spike 2. |
| **New: no Git library** | `git` is spawned directly. `isomorphic-git`, `nodegit` and `simple-git` each fail `REQ-GIT-013`'s requirement that the error text be Git's own stderr verbatim. See ADR-DATA-04. |
