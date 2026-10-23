# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` ESC-14, and against the specification as amended —
  `REQ-CONFIG-477` (new), `REQ-CONFIG-252`, `REQ-CONFIG-288`, `REQ-CONFIG-192`, `REQ-CONFIG-010`
- **Supersedes reasoning in:** its own 2026-08-31 revision, whose placement argument leaned on
  `REQ-CONFIG-192` (see alternative D, objection 3)
- **Origin:** DATA (ADR-DATA-03, Spike 2)
- **Depends on:** ADR-0002, ADR-0004
- **Constrains:** ADR-0015, ADR-0017, ADR-0022, ADR-0023, ADR-0032, ADR-0034

## Context

**The placement is no longer this record's to argue.** When this ADR was first written the only thing
saying configuration stays in files was a line in SR-4's table. `REQ-CONFIG-477` now states it as a
requirement — "Configuration MUST be held as files, and MUST NOT be moved into a store that only this
application can read" — and says why it is stated at all: "so that moving configuration into an
application-owned store is a change someone has to argue for against these grounds, rather than an
optimisation that can be made quietly while every requirement of this document still appears to be
satisfied." It carries four grounds and calls each independently sufficient. What is left for this
record is the *loader*: which library, which model, which write discipline, and where the boundary is
enforced mechanically rather than by intention.

`REQ-CONFIG-031` and `REQ-CONFIG-449`: **five layers, fixed and total** — built-in defaults,
auto-discovered tool servers, the global discovery snapshot, global configuration files, workspace
configuration files — "and there is no sixth layer: the product accepts no configuration file from
outside the two scopes, because it has no command-line invocation with which to name one".
`REQ-CONFIG-234` and `REQ-CONFIG-235`, which described that sixth layer and the flag that named it, are
**withdrawn**; the rule now lives in `REQ-CONFIG-031` itself. Within one scope, that scope's model file
overlays that scope's model block per field, and a global model file still loses to a workspace
configuration file (`REQ-CONFIG-005`).

`REQ-CONFIG-040` fixes **four merge classes with different overlay depths**: replace-if-not-null;
named-entry, where entries union by name and the entry's **immediate** fields are overlaid, the overlay
reaching exactly one level (`REQ-CONFIG-046`); section, which overlays per field and is **recursive
through nested mappings at any depth** (`REQ-CONFIG-048`), stopping at any value that is not a mapping;
and computed, produced by the loader and never merged from a file. `REQ-CONFIG-050` and
`REQ-CONFIG-450`: **no key anywhere merges list contents** — every list is replaced by a layer that
states it. `REQ-CONFIG-461` makes these the only merge rules in the product.

`REQ-CONFIG-056` and `REQ-CONFIG-057` are a **representation constraint, not a policy one**. Three
settings must stay three-valued after the merge — the verification check list (unset means auto-detect,
an empty list means explicitly none, a list means that suite), the checkpoint enable flag, and the hook
entry list where a bare key means inherit and an empty list replaces — and a per-model concurrency value
written explicitly as null is distinguishable from an omitted one and defeats a provider-conditional
default. `REQ-CONFIG-052` and `REQ-CONFIG-451`: at the top level, null and absent are behaviourally
identical and a null cannot clear an inherited value. `REQ-CONFIG-053`: **inside a named entry a null
can clear**, because entry fields are overlaid without a null guard. So the loaded document model must
distinguish **absent, explicit null and value**, and must apply a **different null policy per merge
class**. `REQ-CONFIG-054`: a bare section key means unset and is coerced to an empty section rather than
raising a type error.

`REQ-CONFIG-062`, `REQ-CONFIG-148` and `REQ-CONFIG-151` fix passes that run **per scope before any
cross-scope merge**, because provenance is unrecoverable once a higher layer's list has replaced a
lower one — and `REQ-CONFIG-452` calls dropping superseded lists a privilege-reduction vector.
`REQ-CONFIG-035` to `REQ-CONFIG-038`, `REQ-CONFIG-067`, `REQ-CONFIG-073` and `REQ-CONFIG-096` fix the
post-merge order, with placeholder and secret resolution **after** validation, so a stored secret value
can never itself be the cause of a schema failure. `REQ-CONFIG-035` enumerates what a completed load
must already have resolved: **no caller finishes the job.**

`REQ-CONFIG-014`: the configuration file set has **no read cache** — every load re-reads from disk.
`REQ-CONFIG-211` gives the discovery snapshot a modification-time-or-size cache with the false negative
**accepted rather than defended against**, and no content hashing on that path.

`REQ-CONFIG-024` and `REQ-CONFIG-233` fix a closed five-way severity taxonomy — fatal, silent, warn and
continue, coerce, report-not-fatal — with a deliberate inversion: `REQ-CONFIG-183` makes an unknown key
**anywhere** under the requirements section a hard load failure, "the opposite of the top-level policy",
and `REQ-CONFIG-476` deliberately withholds coercion from the run-start mode because a mis-spelled value
read as the permissive one would remove a gate the user asked for. The *top-level* policy that
inversion names is the one this ADR now has to defend: **an unknown key elsewhere is carried and
ignored, not rejected and not dropped.**

`REQ-CONFIG-111`, `REQ-CONFIG-183` and `REQ-CONFIG-436`: **validation happens on assignment as well as
on load** for two sections, "so a settings surface writing an invalid value onto a loaded configuration
is refused at the moment of the write, not silently at the next load", and every value a security
control produces is assigned through the validating policy **before any file is written**. This forbids
a validate-once-at-parse design: the loaded configuration object is itself a validating model.

`REQ-CONFIG-015`: parsed in a **safe subset that cannot construct arbitrary language objects from
document tags**. `REQ-CONFIG-020`: for any field whose accepted values are a string vocabulary, a value
the parser folded to a boolean is coerced back to a lower-cased string **before validation**, so one
spelling loads as an accepted value while its opposite is rejected as an unrecognised member naming the
accepted list — "never as a type error, and never silently accepted". `REQ-CONFIG-090` requires the same
tolerance for a model's thinking level.

`REQ-CONFIG-248`, `REQ-CONFIG-441` and `REQ-CONFIG-199`: writers preserve key order and **never
alphabetise**. `REQ-CONFIG-252` no longer says comments and formatting are lost. It now says the
opposite in terms — "**Comments and formatting are preserved.** The write is a targeted edit of the
existing document rather than a re-emission of the whole of it" — names the comment header the
first-run bootstrap wrote (`REQ-CONFIG-025`) as the thing a user would otherwise lose, records that
"the earlier statement that comments and formatting are lost is withdrawn", and binds **all four
writers at once** rather than leaving each to restate it: the startup model-preference path
(`REQ-CONFIG-248`), the desktop save (`REQ-CONFIG-256`), the scoped per-field write path
(`REQ-CONFIG-441`) and the first-run bootstrap (`REQ-CONFIG-027`). It also gives the reason the rule is
not cosmetic: it is the same discipline that forbids a writer to discard content it could not interpret
(`REQ-CONFIG-442`, `REQ-CONFIG-458`), and "a writer that preserves an unrecognized key but discarded the
comment explaining it would honour the letter of that rule and defeat its purpose."

`REQ-CONFIG-464` and `REQ-CONFIG-471`: the advanced runtime card renders that scope's **raw `runtime:`
mapping, read directly from that scope's file rather than from the merged configuration**, so a user can
see whether a setting is stated globally, stated in this workspace, or stated nowhere and inherited —
"the file itself remaining the place a runtime key is written by hand". This is a requirement that a
human reads and hand-edits the artifact. `REQ-CONFIG-477`'s ground 2 makes it load-bearing for the
placement, and adds a fact this record did not have: when the surface that first carried the capability
was withdrawn, the capability was **deliberately re-sited rather than dropped** (`REQ-CONFIG-445`). The
product has already declined to lose this once.

`REQ-CONFIG-458`, `REQ-CONFIG-442`, `REQ-CONFIG-256` and `REQ-CONFIG-260`: no surface writes a
configuration it cannot load back; the scoped per-field writer **refuses** when the existing file cannot
be parsed or parses to a non-mapping; and the whole desktop save is validated **before any file is
touched**.

`REQ-CONFIG-040` and the domain's format table describe one key read by a **separate parse of the same
file**, with no global equivalent, no merge semantics and no schema validation — a top-level key
belonging to no merge class that contributes nothing to the merged configuration and is neither
reported nor rejected, yet is read.

`REQ-GIT-071` and `REQ-GIT-138`: a rejected value fails the load **as a whole** rather than falling back
to a default or repairing the value; nothing that depends on it starts; **no session directory and no
lock are created**; and the application continues to run with no workspace configuration loaded. A fatal
configuration error is fatal to the *workspace*, not to the *process*. `REQ-GIT-138` additionally puts
branch-namespace validation **at configuration load, on a rendered example** — every placeholder
substituted with a fixed sample, slugged and assembled exactly as a real name, then tested for the
forbidden prefixes, because a template that reaches a forbidden namespace only after substitution would
be missed by a literal prefix test.

**Spike evidence (DATA, `yaml@2.9.0` and `js-yaml@5.4.1`).** Under the default 1.2 core schema the
first parses the two ambiguous switch spellings as **strings** and only the literal boolean spellings as
booleans; under a 1.1 setting it folds all six. Tri-state is available and robust through the document
API: for a bare key, presence is true while the value node is null, and an absent key is absent — so
absent, explicit-null and value are all distinguishable at the tree. Key order is preserved on round
trip and **not** alphabetised. Both libraries resolve an unknown language tag safely by default.
Editing through the document API **preserves comments and layout alongside key order**; only
parse-then-stringify loses them.

## Alternatives considered

**A — Parse to plain objects and merge with a schema library's defaults.** Attractive: validation and
typing fall out, and the codebase gets one description of the shape. It breaks on the tri-state and the
merge classes. A schema library's job is to **normalise** — apply defaults, coerce, produce a known
shape — and every one of those operations destroys the absent-versus-null distinction three requirements
require to survive the merge. Applying defaults per layer is worse than useless: it turns every unstated
field of the global layer into a stated value that then shadows the workspace layer, **inverting the
precedence for every key the user did not write**. It also cannot express the depth rules: named entries
overlay exactly one level while sections recurse to any depth, and no generic deep-merge does both.

**B — Parse to the document tree, merge over a tri-state model, validate the merged result.** Chosen.

**C — A general configuration library.** None models five fixed layers with four merge classes,
per-class null policies, per-scope pre-merge passes, or a five-way severity taxonomy. Each would be
fought rather than used, and each brings its own precedence model that would have to be disabled.

**D — Configuration in the workspace database (raised under SR-4, now refused by requirement).**
Assessed on its merits rather than dismissed by citing a ruling, because a reader who reaches this
alternative in two years will want the reasons and not the citation. Four of the five objections below
are `REQ-CONFIG-477`'s own grounds, restated as objections; the fifth is this record's.

1. **Tolerance of what this release does not know** (`REQ-CONFIG-477` ground 1). An unrecognised
   top-level key is a **warning**, contributes nothing to the merge, and is nevertheless still in the
   file afterwards, so a document authored against a later release loads, is edited, and is written
   back by an earlier one without losing the key (`REQ-CONFIG-040`, `REQ-CONFIG-233`); every writer of
   `agents.yaml` is forbidden to discard content it could not interpret (`REQ-CONFIG-442`,
   `REQ-CONFIG-458`), "and the file is what makes that possible". A document tree carries such a key
   through a targeted edit untouched. A table with a fixed column set cannot represent one at all, and
   a key-value table that could would have to re-derive the tri-state, the merge classes and the
   ordering that the tree gives for free. `requirements:` is the deliberate exception in the other
   direction — an unknown key there is a hard load failure (`REQ-CONFIG-183`) — and `REQ-CONFIG-477`
   is explicit that this is "an exception about a *configuration block*, not a licence to store
   configuration the way the product stores its own records."

   > **Correction, and it is this record's own.** The previous revision argued this objection partly by
   > analogy: it said the same tolerance "is what `REQ-CONFIG-192` asks of *delivery records*", and that
   > the configuration-side property "is no weaker". **Do not cite that.** `owner-decisions.md` ESC-14
   > records that SR-4's use of `REQ-CONFIG-192` to argue about configuration was wrong, because that
   > requirement's subject is the delivery store, which moved to rows. `REQ-CONFIG-192` now says so
   > itself: the delivery store "is not configuration and `REQ-CONFIG-477`'s boundary does not reach
   > it". The analogy was not merely imprecise, it pointed at the one neighbouring requirement whose
   > answer is the opposite. What survives of the argument is the part that never needed the analogy —
   > the carry-and-ignore policy stated of configuration, by `REQ-CONFIG-040` and `REQ-CONFIG-233`, and
   > enforced on every writer by `REQ-CONFIG-442` and `REQ-CONFIG-458`. That is strictly stronger than
   > the borrowed version, because it is stated of the thing under discussion.

2. **The product shows the user the file's own contents** (`REQ-CONFIG-477` ground 2). The advanced
   runtime card renders the chosen scope's **raw** `runtime:` mapping read directly from that scope's
   file, "exactly so a user can tell a setting stated globally from one stated in this workspace from
   one inherited from the built-in defaults" (`REQ-CONFIG-471`). The requirement's own sharpest
   sentence is the one to keep: "That distinction is a distinction between two files, and there is
   nothing raw to render when there is no file."

3. **Version control stays the user's choice** (`REQ-CONFIG-477` ground 3). These are the user's own
   text in the user's own directories — diffable, mergeable, reviewable, quotable in a bug report. The
   ignore rule of `REQ-CONFIG-013` and `REQ-CONFIG-456` is best-effort and is "a default about what is
   staged by accident, not a prohibition" (`REQ-CONFIG-010`); *deciding otherwise* is a choice a file
   leaves open, and "a store the application keeps for itself forecloses it for every user at once."
   Note what this is **not**: it is not a claim that the product commits configuration, and it is not
   in tension with the workspace being ignored by default. The ground is the availability of the
   choice, not the exercise of it.

4. **Three of the five layers are not per workspace** (`REQ-CONFIG-477` ground 4). Built-in defaults,
   the auto-discovered tool servers and the global discovery snapshot are not workspace-scoped at all,
   and the global scope is per user; the store SR-4 introduces is one per workspace and, under ESC-15,
   machine-local. A store scoped to one workspace could hold at most layer 5, so migrating
   configuration would put a single fixed total merge across two storage models with different failure
   modes — at no gain, since the workspace layer is hand-edited exactly as the global one is.

5. **There is nothing to gain, by SR-4's own test.** The principle asks for a database when the data is
   "high-volume, queried, or transactional". Configuration is none of the three: `REQ-CONFIG-014`
   forbids a read cache and requires a full re-read on every load precisely because the volume is
   negligible; there is no query beyond "read the whole thing and merge"; and the only atomicity
   anyone asks for is `REQ-CONFIG-260`'s validate-before-any-file-is-touched, which is a pre-check
   rather than a transaction. Contrast the delivery store, where `REQ-CONFIG-192` now states the
   opposite of all three in one sentence — the records "are high-volume, queried and transactional",
   and the state, the history, the prune and the audit entry are written "together, indivisibly". The
   two requirements were amended to sit beside each other, and reading them together is the fastest way
   to see that this alternative fails a test the delivery store passes.

## Decision

**Alternative B — configuration stays YAML under `.rotaris/` and the per-user configuration
directory** — with `yaml@2.9.0` or later (the `eemeli/yaml` package) rather than `js-yaml`: both are
safe by default, but only the former exposes the document tree the tri-state, the order-preserving
writes and `REQ-CONFIG-252`'s comment preservation need.

**No configuration value is read from, written to, cached in, or mirrored into the workspace
database.** `REQ-CONFIG-477` now states that boundary, so this ADR's job is no longer to draw it but to
make it **mechanical**, which a requirement cannot do on its own. The guard is the same shape ADR-0040
uses for its layout argument: **the loader's entry point takes no database handle**, so a later change
that wanted to consult one would have to alter a signature that ADR-0002 and the constraints table both
name, rather than adding a line inside a function. Note the asymmetry with ADR-0040, which is
deliberate and is the reason both records state their guard rather than sharing one: the traceability
engine's no-handle rule is now a *default* that `REQ-TRACE-089` explicitly permits to be lifted for a
validated index, while this one has no such escape and is meant not to acquire one.

Use the **default 1.2 core schema**, under which the two ambiguous switch spellings parse as strings;
`REQ-CONFIG-020` then reduces to un-folding the two literal boolean spellings **per field against that
field's vocabulary**, which is a smaller and more auditable rule than un-folding six. The requirement's
observable is satisfied either way; this is the cheaper route to it.

**Comments and layout are preserved on every write path (`REQ-CONFIG-252`).** Every writer edits the
parsed document in place and re-emits it, rather than parsing to a value and stringifying that value;
the spike shows this is the *cheaper* route, because only parse-then-stringify loses comments. A test
that round-trips a commented file through each of the four writers the requirement names —
`REQ-CONFIG-027`, `REQ-CONFIG-248`, `REQ-CONFIG-256`, `REQ-CONFIG-441` — and asserts the comments,
blank lines and indentation survive is the guard, and it is the direct replacement for the consequence
this ADR used to accept. The test belongs with the unrecognised-key test rather than beside it:
`REQ-CONFIG-252` binds the two together, and a writer that keeps a key it does not understand while
dropping the comment explaining it "would honour the letter of that rule and defeat its purpose". One
fixture, carrying an unknown key *and* the comment above it, through all four writers.

Validation: whatever library is chosen must support **assignment-time** validation for the two sections
that require it. The natural shape is a validating wrapper around those sections whose setters run the
same schema the load runs, so that "validated before any file is touched" and "nothing invalid reaches
the store" are **one code path rather than two**. `REQ-CONFIG-237` fixes the error rendering as
`<dotted.path>: <message>` with an empty path rendered as a fixed word, so the library's issue objects
must expose a dotted path and a message; `REQ-CONFIG-238` requires missing-field errors under a model
entry to be gathered into exactly two lines, which is post-processing over the issue list either way.

Write-back: **four writers exist and they are not interchangeable** — the bootstrap, the startup
model-preference path, the desktop save and the scoped per-field writer. All four leave the specified
mode, all four preserve comments and key order, and all four go through ADR-0004's primitive. The
per-field writer overlays "recursively through nested mappings exactly as a section merge does",
**so the merge code is shared between the loader and one of the writers** — which makes a divergence
between them a compile-time impossibility rather than a test we might forget.

`REQ-CONFIG-288` — which no longer hands the decision over, and takes it against the coupling — has the
composer's permission-mode control write **only its own key**, through that same scoped per-field
writer, into the scope `REQ-CONFIG-463` fixes, refusing outright if the target file cannot be read
(`REQ-CONFIG-442`), and reloading after. Pending Settings edits stay pending, stay dirty and are still
undone by Discard. That is a use of an existing writer, not a fifth one. Its architectural weight is
that the *refusal* path matters more here than anywhere else the per-field writer is used: an
unparseable `agents.yaml` must fail this write loudly, because silently not writing a permission mode
leaves a run at a mode the user did not choose.

The tier-alias substitution and reasoning-synthesis passes are exported as **pure transforms over a
configuration value**, not as private steps of a file-reading function, because `REQ-CONFIG-263` calls
them at run start with no file involved (ADR-0037's Tier B).

The separately-parsed key gets its own small reader over the **same parsed document** — literally a
second lookup, not a second file read — checking the value against its three accepted spellings and
leaving the default in place otherwise.

Branch-namespace validation is part of the load, which puts `REQ-GIT-139`'s slugging and assembly rules
and `REQ-GIT-009`'s branch-name rule set **inside the configuration validator**. That is a coupling
between domains 15 and 06 that must be stated rather than discovered.

### What the SR rulings change here

- **SR-1** removes nothing from this ADR. Under one instance the loader still runs in both the
  workspace service and the run host (consequence 4), because those are processes of the one instance,
  not rival instances.
- **SR-3** removes nothing either. `REQ-CONFIG-014`'s no-cache rule means configuration is re-read on
  demand, never followed; there was no polling cadence here to withdraw. `REQ-CONFIG-211`'s
  modification-time-or-size check on the discovery snapshot is a check performed *during a load*, not a
  timer, and it survives untouched.
- **SR-4** confirms the placement, which `REQ-CONFIG-477` has since made a requirement. ADR-0004
  **rule 1** (readers hold no descriptors; every read is open-read-close) still binds every file in
  this store, because these files are still replaced by rename and an ordinary reader still blocks that
  rename on Windows — measured, and not merely inherited: the writer-handle spike held the target with
  `'r'`, `'r+'`, `'a'`, `'a+'` and `'w'` and got `EPERM` from `fs.renameSync` on every one. What the
  same spike corrects is the *reason* the record used to give. Node's `open` does request share-delete;
  the blocker is the replace-by-rename call, which reproduces `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`'s
  failure conditions exactly. Rule 1 is unaffected and this store is the least interesting place that
  correction lands, but a reader who finds the old reason quoted here should follow it to ADR-0004 and
  ADR-0040 where it changes an answer. ADR-0004 **rule 3** (a writer's handle across its own
  compaction) never applied here — configuration has no append-and-compact file — and is dissolved
  product-wide with the stores that had one.
- **Configuration is one of the two things this loader must keep out of the store, and the other one is
  not this record's.** `REQ-CONFIG-010` now enumerates what is left under `<workspace>/.rotaris/`: the
  workspace identifier, plugins, per-session checkouts, and the configuration files themselves. Session
  records, improvement artifacts and delivery records are gone from it, "and no key of this domain
  names a location for any of them". A loader that ever grew a key naming one would be re-creating a
  layout three requirements deleted.

## Consequences accepted

1. **We own the merge.** It is the largest single piece of hand-written logic in the workspace service
   and the place where a conformance failure would be least visible. `REQ-CONFIG-051`'s end-to-end
   fixture is a first-class test, plus a per-rule test for each of the tri-state rules.
2. The no-cache rule means every settings-screen open, every run start and every workspace open
   re-reads and re-merges. At these file sizes that is microseconds; it is recorded here so it is not
   later "optimised" into a violation — and, now that a database exists in the product, so that the
   optimisation nobody should reach for is named: **not a configuration table, not a parsed-document
   cache in a row.**
3. **Comments and layout survive every write.** This reverses what this ADR previously accepted, and
   the reversal is now the specification's rather than a ruling's: `REQ-CONFIG-252` states preservation
   and withdraws its own earlier sentence. Key order preserved and never alphabetised
   (`REQ-CONFIG-248`) is unaffected and was always the case.
4. Both the workspace service and the run host instantiate this loader (ADR-0002). The tri-state model
   and the validating wrapper must therefore be free of process-specific dependencies — and, now, free
   of any database dependency.
5. **`requirements.delivery` stays a configuration block whose records are rows, and the loader is
   where that split is enforced.** `REQ-CONFIG-192`'s four remaining keys — `schema_version`,
   `retain_tombstones`, `audit_trail`, `history_limit` — are authored by a user in YAML and merged by
   this loader like any other section; the delivery records they govern are rows in ADR-0041's store.
   The requirement now states the split itself, including that `REQ-CONFIG-477`'s boundary does not
   reach it.
6. **Two withdrawn subpath keys become load failures, and this loader is what delivers them.** The
   storage move withdrew `store_subpath` with the directory it named, and `worktree_subpath` was never
   a key of this domain (`REQ-CONFIG-192`, `REQ-CONFIG-194`). Both sat under `requirements:`, where
   `REQ-CONFIG-183` makes an unrecognised key a **hard load failure** rather than a warning — so a
   workspace configured against an earlier build does not degrade, it stops loading, and under
   `REQ-GIT-071` that is fatal to the workspace: nothing that depends on it starts, no session
   directory and no lock are created, and the application goes on running with no workspace
   configuration. That is the one place the storage decision reaches this ADR at all, and it is worth
   stating because it is the only user-visible cost of the move that this record owns. Two things
   follow. The failure message must name the key and the file, as `REQ-CONFIG-183` and
   `REQ-CONFIG-237`'s `<dotted.path>: <message>` rendering require, and the strict block is exactly
   where a bare "unknown key" is least helpful. And this is a genuine argument *against* the strictness
   inversion that `REQ-CONFIG-183` chose, recorded rather than smoothed away: had `requirements:`
   followed the top-level carry-and-ignore policy, a withdrawn key would have been a warning and the
   workspace would still open. The inversion is the specification's decision and this record does not
   reopen it; it does note that the amendment pass made the inversion cost something it did not cost
   before.

   **Superseded by the specification, reported 2026-10-15 (fin47).** The reading above — that both keys are hard load
   failures — **is false** and is kept here beside its replacement. `REQ-CONFIG-183`'s carve-out and `REQ-CONFIG-192`/`194`
   now make a key the specification withdrew, or names as not a key of this domain, **reported and ignored**: a warning
   naming the file, its scope and the key's full path (`REQ-CONFIG-233`'s warn-and-continue), and the workspace opens —
   exactly the outcome this consequence said strictness had cost. The loader delivers it in
   `packages/config/src/sections/requirements.ts`: `execution.worktree_subpath` since Part AP, and `delivery.store_subpath`
   since fin47 (`WITHDRAWN_STORE_SUBPATH`; until then the opaque `delivery` block carried it unread, so it was neither
   rejected nor reported:
   [`../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md`](../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md)).

## Revisit if

`REQ-CONFIG-477` is amended — which is now the only route by which alternative D reopens, and is
deliberately a harder route than reversing this ADR. A requirement makes absent and null equivalent
everywhere, removing the tri-state; or a sixth layer or a per-key precedence inversion appears, both of
which `REQ-CONFIG-031` and `REQ-CONFIG-449` currently forbid; or a validation library models tri-state
optionality natively without normalising, which would collapse alternatives A and B into one; or
`REQ-CONFIG-252` is reversed and comments are again to be discarded, which would make the document API
optional rather than required.

Two contingencies turn on measurements this record does not have and must not guess at. **The
document-API write path has not been timed on a real `agents.yaml`** — the DATA spike established that
a targeted edit *preserves* comments, layout and key order, not what it costs. If a measurement shows
the in-place edit is materially slower than parse-and-stringify at the sizes users actually write, that
is a cost to record, not a reason to reverse: `REQ-CONFIG-252` fixes the observable and the alternative
does not produce it. **The no-cache rule has not been timed against `REQ-SHELL-150`'s 100 ms gesture
budget** on the paths that re-read and re-merge on every settings-screen open. Consequence 2 asserts
microseconds; that is an estimate from file sizes and not a figure. If it turns out to be wrong the
answer is still not a cache — `REQ-CONFIG-014` forbids one — but the settings screen's own
sequencing would then belong in a decision record rather than in an assumption here.

## First slice built — 2026-09-03, for the hooks (ADR-0015)

*Recorded under GD-10.* `@rotaris/config` exists with `yaml@2.9.0`, the document tree, the tri-state
(absent / null / value observed as three different things through the document API, as the DATA spike said),
and readers for **one section**: `hooks:` in both file scopes, with the list shorthand, the bare-key
semantics of REQ-HOOKS-011, every invalid entry reported at once with its YAML path, the scope stamped
before the merge, full-list substitution and the displaced lists kept. The entry point takes no database
handle. The default 1.2 core schema behaved as decided: `on` stayed a string, `true` folded and was un-folded
per field for the event vocabulary and rejected as an unrecognised member naming the seven. An unknown
top-level key was carried and ignored. **Not built:** the four merge classes beyond what the section needs,
the validating wrapper, the placeholder and secret passes, the four writers, the discovery layer, the
runtime keys — those stay environment stopgaps at the run-host root. Neither timing contingency of "Revisit
if" is measured yet: the hooks read is a few kilobytes and no settings save exists.

**Two more readers, 2026-09-04, for the playbooks and the intent gate.** `readPlaybookOverrides(dir)` reads a
directory of YAML files as `SLOT: { variant: text }` (decision 5 of the plan: the format is this build's, the
specification fixing none) and `readIntentMapping(file)` reads `intent-tools.yaml` as intent → `direct-work`
| `none`, rejecting any other value as REQ-ORCH-017's "obsolete instruction-text entry". Both are fresh reads
on every run (REQ-CONFIG-014); an unknown slot or variant is the engine's to warn about against the
catalogue. The loader still holds no merge classes, no writers, no runtime keys.

## First execution — 2026-09-05, the whole loader, the four writers, and the screen (Part I)

*Recorded under GD-10. The eleventh defect of ADR-0058 consequence 17's pattern.*

**Built and run:** `loadConfiguration(globalDir, workspaceRoot)` (`packages/config/src/load.ts`), taking no
database handle; the built-in defaults copied per load; the four merge classes (`merge.ts`) with the section
overlay written once over a mapping adapter and run by the loader over plain values and by the per-field writer
over the YAML tree — the divergence this record wanted made a compile-time impossibility is now that one
function; the typed sections `models:`, `personas:`, `runtime:`, `compressor:`, `circuit_breaker:` with every
key's type, range and default; tier-alias substitution and reasoning synthesis as pure transforms (`slots.ts`);
the two validation stages with REQ-CONFIG-237/238's rendering and REQ-CONFIG-478's fatal report; the four
writers (`writers.ts`) editing the parsed document in place through ADR-0004's replace; the load split into
merge and resolve so ADR-0037's Tier B runs the loader's own passes; the workspace service's Tier A
(`snapshot.ts`); the run host reading its files per run start (`apps/desktop/src/run-host/configuration.ts`);
Settings → Models, Personas and Runtime. Fifty-nine tests across the package and the screen's state; `pnpm config-proof`
in the built app: commented files at both scopes drive a run, a Runtime toggle and a Models slot save leaving
every other line as written, Discard writes nothing, the composer's control writes its one key, a fatal file
refuses the run naming file, scope and path, and the corrected file runs.

**Measured (the two contingencies of "Revisit if").** The no-cache rule: a full load — four files, the merge,
the sections, the synthesis, the referential list — takes **4.3–4.7 ms** in the built app on this workstation,
timed on the run host's monotonic clock and logged at every run start; REQ-SHELL-150's 100 ms gesture budget is
not approached and consequence 2's "microseconds" was an underestimate by three orders of magnitude that changes
nothing. The document-API write path is exercised (five saves and per-field writes in the proof, each followed by
a reload inside the same action) but **not timed separately**; that figure is still owed.

**Found — re-emission is not byte-identical.** The DATA spike said a targeted edit "preserves comments, layout
and key order", and consequence 3 says "comments and layout survive every write". First execution: the comment
text, the blank lines, the indentation, the key order and an unknown key all survive every writer — and the
spacing before an inline comment collapses to one space on re-emission (`default_persona: orchestrator   # x`
comes back as `default_persona: orchestrator # x`). REQ-CONFIG-252's observable (comment text, blank lines,
indentation) is met; "the file's bytes outside the written keys are untouched" is not, and the guard test now
asserts the former and pins the latter. The reason the record gave — only parse-then-stringify loses comments —
stands; what it did not say is that the document API normalises whitespace it does not own. Kept beside the
claim rather than repaired: no alternative produces the observable at all.

**Corrected against this record's own first slice:** the circuit-breaker reader reported a `timeout_seconds`
key as an error; REQ-CONFIG-233 makes an unknown key in a merged section a warning, and it is one now.

**Readings recorded.** (a) The built-in default layer declares the thirteen roles with a tier each so a
`personas:` override that states one field merges onto a complete entry and validates (`personas.name` and
`.model` are required); the tiers — large for the coordinating and designing roles, medium for the rest — are
this build's proposal, the owner's to replace. (b) The hooks section keeps its tri-state reader as a section of
the one load; the hook engine's summary and review keep `loadHooksConfig` for their per-file states, so a run
start reads the files twice (REQ-CONFIG-014 forbids a cache, not a second read). (c) `rotaris` is exempt from
the unknown-top-level-key warning as the key the specification places outside the layered model. (d) Every load
keeps `.rotaris/` out of version control (REQ-CONFIG-013), the screen's reads included. (e) Known-token-limit
back-fill (REQ-CONFIG-096) has no table to read; the budget fields stay as written. (f) Mode `0644` is a no-op on
Windows. (g) Credentials for the classifier, summariser and loop slots use the entry model's resolver
(`api_key`/`api_key_env`) until ADR-0029.

**Not built, said so:** the discovery-snapshot and auto-discovered-server layers (REQ-CONFIG-033/034) and
`mcp_servers`; `secrets.yaml`; providers and credential files (ADR-0028/0029); REQ-CONFIG-183's strict
`requirements:` block (consequence 6 is not yet delivered — the section is carried, not validated);
`verifier`, `skills`, `display`, `transcript`, `checkpoints`, `integration` beyond carrying them; the security
policy card (no confinement backend, ADR-0022); the Display, Skills, MCP, Plugins and Tools categories.

## Second execution — 2026-09-05, layer 3 folded (Part K)

The discovery snapshot (`project_settings.yaml`, REQ-CONFIG-034) is now layer 3 of REQ-CONFIG-031's order, read by
the loader on every load with no lock and no database handle — the guard in the signature holds. An invalid
snapshot is a warning (`Ignoring project settings snapshot: …`) and never a fatal; a `models:` entry naming an
`auth_provider` the snapshot does not mark authenticated is a referential message (REQ-CONFIG-232's family) with
REQ-WORKSPACE-133's hint, and the hint now rides on the unset-slot messages **only while no provider is
authenticated** — reading (g) of the first execution (credentials through the entry model's `api_key_env` until
ADR-0029) is closed by ADR-0030's lease. The auto-discovered-server layer (REQ-CONFIG-033) still has no producer.
Four tests over the layer; the whole package's load figure was not re-measured.

## Third execution — 2026-09-08, the `display:` section's surface and write path (Part AG)

The first execution's "not built, said so" list named five categories; four of them are now drawn, and the fifth and
sixth (Skills, Plugins) still wait on a mechanism rather than on drawing — portable-skill discovery
(REQ-WORKSPACE-056/062/063/064, cited nowhere in this tree) and REQ-TOOLS-161's plugin loader (ADR-0025).

> **Skills is drawn since 2026-09-15** (ADR-0063). The sentence above is kept as it was written, because what it
> records is what was true at the third execution; `skills:` is now a registered section with a reader behind it
> (`sections/skills.ts`), the desktop save writes its three keys sparsely (REQ-CONFIG-256/258), and the category
> is a surface. **Plugins is the one that still waits.**

**It found a defect, in the reader Part Z built.** REQ-CONFIG-172 fixes the section's keys as
`tool_result_max_lines` and `tool_input_max_lines` and states that a cap of **`0` means no limit**.
`display-section.ts` read `tool_result_lines` and `tool_input_lines` — key names no requirement states — and passed
`0` through as a literal cap of zero lines. A file written exactly as the requirement words it therefore drew
**nothing** where it had asked for **everything**, and no reading of the code had caught it because both halves were
self-consistent: the reader and its only caller agreed with each other and with nothing else. The falsified reason —
that the resolved view's own field names could stand in for the file's — is kept in that file's header beside its
replacement. The view keeps its field names (`tool_result_lines`, `null` for unlimited); only the **document's**
spelling is the requirement's, since only the document round-trips. `displayCapToFile` / `displayCapFromFile` in
`@rotaris/contracts` are the single mapping, so the surface and the reader cannot drift apart again.

Nothing else in the loader moved. `saveDesktop`'s `display` branch (REQ-CONFIG-256, written per field so a `display:`
key the screen does not offer is left as the file states it) had never run before this part and now does: the proof
writes four fields into a file that already carried an unknown `show_thinking: true` and finds it untouched.
`readSnapshot` additionally carries REQ-CONFIG-277's Instructions inventory — a presence check over the workspace's
two instruction files, not a read of them — so the settings screen gains an inventory without a new message.

## The first execution's proof on Linux with the code-intelligence bundle present — 2026-09-28 (R-062)

The first execution above says "Discard writes nothing", and `pnpm config-proof`'s scenario 3 measured it by byte
comparison against a never-initialized seed. That measurement stopped isolating Discard when Part AS (ADR-0064) gave
the same `agents.yaml` a second writer. On open, a never-initialized workspace starts `code-intelligence-setup` in
the background. When the task succeeds, its one writer (REQ-WORKSPACE-085) records the `initialization:` section in
that file while Discard is being pressed. The task succeeds only where the bundled runtime is present, so the proof
was green in trees without the bundle and red, "Discard wrote the file", in the Linux sweep tree that had one. It
was reproduced both ways in one tree. **The loader and the four writers are not implicated.** The recorded section
sits after every seeded line, and those lines are unchanged. The Runtime and Models saves in the same run keep both
the initialization record and every seeded line (checked with `includes`, as before).

The proof now seeds the Discard scenario as a workspace initialized before, and fails if an initialization run
starts anyway. The byte check stands unweakened against that seed, and Discard's result is also read from the
save-status probe ("All changes saved", REQ-CONFIG-280). The scenario's steps now wait for their controls and are
each read back from the log. The sweep's first run had shown a launch whose Settings category stayed on Models,
whose two clicks pressed nothing, and whose script carried on. Recorded and repaired in
[`config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md`](../../defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md).
**What it could not show:** whether a Settings save and the initialization record can interleave so that one
overwrites the other. Both writers round-trip the whole document. This run saw them land a second apart, never
together, and nothing here measures the overlap. The run was on Linux as root under Xvfb; Windows and macOS were
not measured (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

## Discard pressed where the notice banner moved it — 2026-10-23

Scenario 3 went red once on a Linux tree, the status still `Unsaved changes` after a Discard the capture seam reported
clicked, and passed once on the unmodified `a118d59b` beside it. The two logs differ only in whether the "No model provider
is authenticated yet" notice was raised between Discard's measurement and its press; the reading that the press met the
banner is inferred from those timestamps and the screenshot, not logged. **The loader, the writers and Discard are not
implicated**: the file stayed byte-identical in both runs. The scenario is now driven, each press a settled click confirmed
landed, each step waiting for the state the last produced; the assertions stand as they were. Four repaired runs passed Discard (one of them red later, at scenario 5 under load),
without meeting the banner, so the race is guarded by the settled click's contract rather than shown by these runs. Recorded
and repaired in [`config-proofs-discard-leaves-the-save-status-unsaved.md`](../../defects/fixed/config-proofs-discard-leaves-the-save-status-unsaved.md).
