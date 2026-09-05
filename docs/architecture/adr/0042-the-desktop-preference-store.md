# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-1 and SR-4
- **Origin:** DATA (ADR-DATA-09), UI (ADR-UI-06)
- **Depends on:** ADR-0002, ADR-0004
- **Two slices proposed different roots; the conflict is resolved here.**

> **This store does not move to the database, and the reason is in SR-4 itself.** The ruling's table
> places "global configuration, the discovery snapshot, **desktop preferences**" in per-user
> configuration and data directories, and its principle asks for a database only where the data is
> "high-volume, queried, or transactional". A closed table of a few dozen keys is none of the three. The
> decisive fact is scope: SR-4's database is **one per workspace**, while `REQ-SHELL-006` requires this
> store to lie **outside every workspace directory** so that no preference ever appears in a project or
> its version control. A per-workspace store cannot hold a per-user preference.

## Context

`REQ-SHELL-006` fixes one per-user store scoped to the organisation and application pair, **established
before the first preference read**, disjoint in both directions from the layered configuration surface,
with a **closed key table**: "a key that does not appear in that table does not exist… a preference key
named in another document but absent from that table is not a preference of this product." Keys are
slash-namespaced; no dot-namespaced form exists.

The observable obligations are the whole of the requirement: the host's own standard per-user
application-settings location for that pair; readable and writable **without elevation**; **outside
every workspace directory**; created on first write; **absence is not an error** but the state in which
every key answers with its declared default; a written value is the value read back after a restart; and
integer parsing tolerant of values returned as strings. **Physical path and encoding are explicitly
free** — "two conformant builds may therefore lay the same keys out differently on disk."

`REQ-CONFIG-463` and `REQ-GIT-153` state the disjointness in the same terms: **no key of the layered
configuration surface is ever read from or written to the preference store, and no preference key ever
appears in a configuration file.** `REQ-GIT-153` adds that a domain relies on preferences being scoped
to the user *and not to a workspace* — which is the property a workspace database would destroy.

`REQ-UIBENCH-038`, `REQ-UIBENCH-039` and `REQ-UIBENCH-046` add an obligation no other slice saw: the
store must be **redirectable per process to an arbitrary directory on every platform**, because a
benchmark iteration must not touch the user's real settings and must start from the same stored-settings
state as every other iteration. `REQ-UIBENCH-038` is explicit that **one temporary settings directory is
created per iteration**, used by that iteration alone and deleted when it ends; `REQ-UIBENCH-039` is
explicit that **each iteration is a process** receiving the invoking environment with every
product-read variable removed plus a fixed set of overrides, of which `XDG_CONFIG_HOME` and one
benchmark-private variable name that directory. The acceptance criterion of `REQ-UIBENCH-046` is that
**the user's real stored settings hold the same bytes after the run as before**, with no such file
created, read, modified or deleted.

`REQ-SHELL-131`, `REQ-SHELL-009` and `REQ-SHELL-128`: the theme choice is committed **at the moment it
is made**, so a choice followed immediately by a crash or power loss is still in force at the next
launch; reading a theme preference never writes it back; an unknown name degrades silently to the
default and the stored value is left exactly as the user left it.

`REQ-CHAT-014`, `REQ-SHELL-159` and `REQ-CHAT-015`: **two different debounces** govern the composer draft
and both are normative — 200 ms before the draft is published to application state, never per keystroke,
and **400 ms** before it is written to the store, flushed immediately on focus loss, view change,
workspace replacement and window close, with a write landing whole or not at all.

`REQ-SHELL-069`, `REQ-SHELL-067` and `REQ-SHELL-070`: pane layouts are per **user**, not per workspace,
keyed by a stable per-view string, with a pane count and one schema-version stamp; **a retired key is
never reused**, so an old stored layout can only fail to match and fall back to declared defaults;
divider drags persist with a 250 ms debounce; capture before first layout is a silent no-op.

**Tolerant reads are contractual.** `REQ-CONFIG-405`: boolean restoration is tolerant of how the backend
spelled the value. Domain 08 repeats it — "a text backend round-trips a boolean as a string, a native
backend does not" — and one board key's rule is "any value other than the string `false`,
case-insensitively, reads as true", which is **not** a generic boolean parse. `REQ-SHELL-069` adds
tolerant integer parsing: a third rule.

**Some values are structured strings.** One board key is "one JSON object string, **keys sorted**,
mapping column key to boolean" — so a preference value is sometimes a serialised document and its
serialisation is fixed.

**Failure behaviour is specified.** `REQ-TRACE-498`: fold settings unreadable, or written by a later
build, means nothing is folded and the board opens under the emptiness rule; a stored sort order or axis
unknown to this build uses the default for that setting. `REQ-GIT-153`: a stored value that cannot be
used restores the view's declared default rather than raising.

`REQ-CHAT-045` and `REQ-SHELL-157`: prompt history and stash are **per workspace only**, at
`<workspace>/.rotaris/rotaris-prompts.json`, holding a pretty-printed JSON object with the two keys in
the order `history` then `stash`, two-space indentation, ending with a newline, written atomically with
no leftover temporary file; caps of 200 and 100; absent-or-unparseable loading as empty rather than as an
error; save failure degrading to in-memory with a persistent notice. There is explicitly **no**
user-global prompt history or stash.

## Alternatives considered

**A — The operating system's native settings API per platform.** The most literal reading of "scoped by
organisation name and application name", and one platform's redirection variable falls out for free.
*Against:* three implementations with three durability stories. The theme write must survive an
immediate power loss, and the three backends have different flush semantics — one is explicitly
asynchronous. And the **per-process redirection has no mechanism at all** on two of the three platforms,
so the benchmark's isolation requirement would need a platform-specific escape hatch in each backend:
three chances to leak into a user's real settings.

**B — A file in the application-data directory through a preferences package.** One implementation;
redirection through a single path-setting call on every platform; atomic write and flush ours to
control; the closed key set enforced by a typed accessor layer.
*Against:* a package's schema-and-defaults model **normalises on read**, which fights the
tolerant-coercion contract — a boolean stored as a string by a text backend must read as true, not fail
validation. Its migration feature has no counterpart in the requirements and would be dead weight or,
worse, a temptation. And it does not enforce a **closed** key set, which is the one property
`REQ-SHELL-006` insists on twice.

**C — Our own store, file-backed, with an explicitly resolved root.** One implementation, one format,
and a root resolved in a fixed order: **the benchmark-private variable if set; else the standard
configuration-home variable under the organisation and application pair; else the platform's per-user
application-settings location under that pair.** Chosen.

**D — Preference rows in a database (new under SR-4).** Assessed rather than dismissed, because the
question will be asked again. Four objections:

1. **Scope.** SR-4's database is one per workspace. `REQ-SHELL-006` requires the store to lie outside
   every workspace, `REQ-SHELL-069` requires pane layouts to be per user, and `REQ-GIT-153` names
   per-user rather than per-workspace scoping as the property its domain relies on. A per-workspace row
   cannot express any of that; a *second*, per-user database could, at the cost of a store engine
   holding a few dozen keys.
2. **The principle does not ask for one.** SR-4 wants a database where the data is high-volume, queried
   or transactional. This store's key set is closed by requirement, its access pattern is
   read-key-write-key, and its only atomicity obligation is that one write lands whole or not at all —
   which a staged-and-replaced file already gives.
3. **The benchmark redirection.** `REQ-UIBENCH-039` redirects an iteration by setting an environment
   variable naming a directory, and `REQ-UIBENCH-038` deletes that directory when the iteration ends. A
   file store makes that a one-line guarantee on all three platforms and makes cleanup an `rm -r`. A
   database would have to be created, opened, closed and deleted per iteration, and any handle left open
   is a file the iteration failed to remove — `REQ-UIBENCH-046` requires a completed run to leave no
   file behind outside its own output directory.
4. **Start-up ordering.** The root must be resolved and the theme read **before the first window
   becomes visible** (`REQ-SHELL-009`) and before the first preference read (`REQ-SHELL-006`). That is
   ahead of any workspace being open, so no workspace database exists yet.

## Decision

**Alternative C, with DATA's typed registry, unchanged by SR-4 and confirmed against it.** The two
proposals differed only in the root: DATA proposed the application-data directory, UI proposed explicit
resolution driven by the benchmark's redirection obligation. **UI's resolution is adopted**, because
`REQ-UIBENCH-046` makes leaving the user's stored settings byte-identical an acceptance criterion and
gives exactly one portable mechanism to achieve it; an explicit, testable rule makes that a one-line
guarantee on all three platforms.

- **Root resolution runs before the first preference read**, in main, before any window exists, and the
  resolved root is recorded in diagnostics. Recording it is not decoration: it is how a benchmark run
  that silently wrote into the user's real settings would be caught.
- **A typed key registry** mirrors `REQ-SHELL-006`'s key table exactly: key, type, default, owning
  requirement. **Reading an unregistered key is a compile error, not a runtime fallback.** That is the
  strongest form of "a key that does not appear in that table does not exist", and no package gives it.
  It is also the mechanism that makes `REQ-STARTUP-111`'s acceptance criterion — that no entry names
  update checking, an endpoint, a release source or an update channel — checkable by **reading the
  registry** rather than by searching the codebase.
- **Writes are atomic** through the primitive of ADR-0004. **The theme key is written synchronously,
  flushed, before the call returns.** Ordinary keys may be debounced; the composer draft uses the
  400 ms debounce with its four named flush points.
- **Tolerant coercion is per type and per key, not global**, and the registry entry carries it. Three
  distinct rules coexist by requirement and must not be collapsed into one.
- **Structured values serialise deterministically** — sorted keys, in byte order per `REQ-GIT-057`'s
  ordering rule, which the whole record uses.
- **Prompt history and stash are not in this store.** They are per workspace, at the path
  `REQ-CHAT-045` names, in the byte-exact format it fixes, sharing the atomic-write helper and nothing
  else.

### What SR-4 does and does not touch

- **Nothing moves.** The store is a per-user file and stays one, for the four reasons under alternative
  D. The registry, the root resolution, the debounces and the theme's synchronous flush are all
  unchanged.
- **The prompt-history file also stays a file**, and it is worth showing the work because it is the one
  item here that SR-4's table does not name. Only the application reads it, so the principle's first
  clause is met — but it is not high-volume, not queried and not transactional, and
  `REQ-CHAT-045` fixes its **path and its bytes** as observables, down to indentation, key order and the
  trailing newline. A specification that fixes a file's bytes has decided it is a file. If that byte
  format is ever withdrawn under the standing direction, the question reopens; until then it is settled
  by the requirement rather than by preference.
- **ADR-0004 rule 1 survives and still binds this store.** Preference and prompt files are replaced by
  rename, and on Windows an ordinary open reader still blocks that rename, so every read stays
  open-read-close within one call. **Rule 3 and constraint D-28** — the writer's-handle
  close-stage-rename-reopen discipline for append-and-compact files — never applied here and are
  dissolved product-wide; nothing in this store appends.
- **The debounces here are not the debounce SR-4 dissolves.** SR-4 removes the ten-second debounced
  whole-file *session state* save, which existed because every save rewrote a whole JSON document and
  which collided with `REQ-MONITOR-218`'s "no delay floor of any size". The 400 ms composer-draft write,
  the 200 ms draft publish and `REQ-SHELL-069`'s 250 ms divider debounce are **normative figures serving
  named requirements**, not workarounds for a file format, and they are untouched. So is the theme's
  rule that it is written synchronously and flushed with no debounce at all (`REQ-SHELL-131`) — which is
  now the only durable-write-on-a-gesture path left in the product's file stores and must not acquire a
  debounce by being grouped with its neighbours.

### What SR-1 requires of whoever implements it — a constraint this store owns the reason for

`REQ-UIBENCH-039` makes each benchmark iteration **a process the product starts**, and `REQ-UIBENCH-037`
establishes that nothing outside the product can start one. Under SR-1 a second launch of the
application surfaces the running instance rather than starting a rival process. **If the single-instance
gate treats a benchmark iteration as a second launch, `REQ-UIBENCH-046` breaks silently**: the iteration
would rendezvous with the running instance, its redirected `XDG_CONFIG_HOME` and benchmark-private
variable would never be consulted, and the measurement would run against — and write into — the user's
real preferences, which is the exact outcome `REQ-UIBENCH-038`, `REQ-UIBENCH-039` and `REQ-UIBENCH-046`
exist to prevent. The failure is silent because the run still completes and still reports numbers.

The obligation this places on the single-instance mechanism is therefore stated here, where the
requirement it protects lives: **the gate must admit a process the product itself started as an
iteration**, and it must do so by something the parent sets rather than by anything a user could set.
`REQ-UIBENCH-039`'s benchmark-private variable is already exactly such a marker, already required to
exist, and already private to the implementation. Two checks make the arrangement testable:

1. an iteration's resolved preference root is recorded in diagnostics (above), so a leak is visible in
   the run's own output rather than only in the user's settings file; and
2. `REQ-UIBENCH-046`'s byte-identity assertion over the user's real store is a test, not a hope.

This is raised as an open question against the SR-1 mechanism rather than decided here, because the gate
is not this ADR's to design and because "which processes the gate admits" is a decision with a security
flavour that deserves its own hearing.

## First execution — 2026-09-04, the theme preference

*Recorded under GD-10.* `packages/platform/src/preferences.ts` builds the first closed registry entries:
`appearance/theme`, `interface/settingsTab` and `ui/reduced_motion`, each with its type, default, owner and
coercion. Main resolves the root once before its first read and records it. The implemented order is
`ROTARIS_PREFERENCES_ROOT`, then `XDG_CONFIG_HOME/Rotaris/Rotaris`, then the platform per-user settings root;
Windows resolves to `%LOCALAPPDATA%\Rotaris\Rotaris`.

The theme write uses `replaceDocumentSync`, including the file flush and directory flush supplied by the
atomic document primitive, before the command returns. Tests established that an unknown stored theme resolves
to Rotaris Dim while leaving the file byte-identical, ordinary registered values round-trip, and the isolated
proof root keeps the user's preference location untouched. The fifteen startup captures each exercised this
same read path before first window creation.

## Consequences accepted

1. A small piece of infrastructure we own and must test on all three platforms, **including the case
   where the root is unwritable**.
2. Users cannot inspect preferences with platform tooling. No requirement asks for that; if one ever
   does — enterprise policy management, or another program reading it — this decision is what changes.
3. **Forward and backward compatibility need no migration mechanism**, because every key answers with
   its declared default when absent and every unknown stored value falls back to a default. That is why
   alternative B's migration feature is not a loss, and it is why alternative D's strongest offer — a
   schema — buys nothing here.
4. Adding a preference means editing the registry table. That is the intended friction:
   `REQ-SHELL-006` requires a new preference to be "registered in that table rather than minting a key
   of its own".
5. **Two draft debounces are both implemented and both tested.** They are different figures serving
   different requirements and it would be easy to collapse them into one by accident.
6. **The single-instance gate must admit benchmark iteration processes**, and if it does not,
   `REQ-UIBENCH-046` fails without any test that currently exists noticing. Raised as an open question;
   the two checks above are this ADR's contribution to catching it.
7. **This store is a named exception to SR-4 and must stay one.** The guard is the same as ADR-0029's:
   no preference key has a row type anywhere in any schema, which is checkable by reading the schema
   next to the registry table.

## Revisit if

A requirement makes the store's physical form observable; `REQ-SHELL-006` currently says the opposite.
Or the key set ceases to be closed. Or `REQ-CHAT-045`'s byte-exact prompt-history format is withdrawn,
which is the only change that would make that one file a candidate for the workspace database.

**Second execution — 2026-09-05, the first pane layout (Part M).** `panels/overview` joins the closed registry as
REQ-SHELL-069 fixes it: a record with `version: 1`, the view's pane count (2) and one size per pane; anything else —
another version, another count, a malformed size — reads as nothing stored and the declared defaults apply
(340 px right, 260..560, the left column at least 320). Written through `prefs.set` from the view's divider (pointer
drag, or Left/Right/Home/End on the focused separator), read at boot beside the theme and the motion preference.
`pnpm overview-proof` writes a layout and reads it back on a relaunch. **Found — the eighteenth first-execution defect:** the
store's serialiser handed `JSON.stringify` the sorted key list as its replacer, and a replacer ARRAY filters every level,
not the top one — so the first nested value ever stored (this layout) was written as `{}` and read back as nothing
stored. Every earlier preference was a string or a boolean and could not show it. The top-level order is now built
before serialising; the falsified reading is kept beside the line.
