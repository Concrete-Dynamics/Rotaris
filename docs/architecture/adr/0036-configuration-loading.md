# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` ESC-2 and SR-4
- **Origin:** DATA (ADR-DATA-03, Spike 2)
- **Depends on:** ADR-0002, ADR-0004
- **Constrains:** ADR-0015, ADR-0017, ADR-0022, ADR-0023, ADR-0032, ADR-0034

## Context

SR-4 introduces a database for what only the application reads, and names configuration as one of the
things that **stays in files**: "Configuration, personas, model slots — the things a user edits, and
whose comments matter (ESC-2) — **YAML under `.rotaris/`, visible to version control**." This record
confirms that placement with the argument behind it, because an unstated boundary is what lets a later
implementer migrate configuration into the database and break ESC-2 and the tolerance rules below.

`REQ-CONFIG-031` and `REQ-CONFIG-449`: **five layers, fixed and total** — built-in defaults,
auto-discovered tool servers, the global discovery snapshot, global configuration files, workspace
configuration files. `REQ-CONFIG-234` and `REQ-CONFIG-235` withdraw a sixth layer explicitly: there is
no command line with which to name a configuration file, so no such file exists. Within one scope, that
scope's model file overlays that scope's model block per field, and a global model file still loses to
a workspace configuration file (`REQ-CONFIG-005`).

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
alphabetise**. `REQ-CONFIG-252` stated that comments and formatting are lost while content is preserved;
**ESC-2 amends it and rules that comments are preserved** (see the decision).

`REQ-CONFIG-464` and `REQ-CONFIG-471`: the advanced runtime card renders that scope's **raw `runtime:`
mapping, read directly from that scope's file rather than from the merged configuration**, so a user can
see whether a setting is stated globally, stated in this workspace, or stated nowhere and inherited —
"the file itself remaining the place a runtime key is written by hand". This is a requirement that a
human reads and hand-edits the artifact, and under SR-4's principle it settles the question on its own.

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

**D — Configuration in the workspace database (new under SR-4).** Assessed on its merits rather than
dismissed by citing the ruling, because the ruling's table is short and the reasons are what a later
reader needs. Five independent objections, any one of which is decisive:

1. **Comments.** ESC-2 rules that comments **are preserved**, including the comment header the
   bootstrap itself writes (`REQ-CONFIG-025`). A row has nowhere to put a comment, and a
   store-then-render round trip through rows would lose exactly what ESC-2 spent a spike establishing
   is cheaper to keep than to discard.
2. **Version control.** `REQ-CONFIG-471` and `REQ-CONFIG-464` require a surface to show the *raw*
   mapping of one scope's file and require the file to remain the place a runtime key is hand-edited.
   A workspace's `.rotaris/` configuration is committed, diffed and reviewed like any other project
   material. SR-4's principle decides this clause on its own: **a file when a human or another tool is
   meant to read or edit it, or when version control must track it.**
3. **Tolerance of what the schema does not know.** `REQ-CONFIG-183` calls the requirements section's
   unknown-key rejection "the opposite of the top-level policy", which fixes the top-level policy as
   carry-and-ignore. A document tree carries an unrecognised key through a targeted edit untouched. A
   table with a fixed column set cannot represent one at all, and a key-value table that could would
   have to re-derive the tri-state, the merge classes and the ordering that the tree gives for free.
   The same property is what `REQ-CONFIG-192` asks of *delivery records* — an unsupported record sits
   uninterpreted and unmigrated while its neighbours read normally. That requirement is about the
   delivery store, not about configuration (see ADR-0041, which preserves it in the database); the
   configuration-side property is this one, and it is no weaker.
4. **Scope.** Three of the five layers are **not per workspace** — built-in defaults, the global
   discovery snapshot and global configuration files. SR-4's database is one per workspace. A layered
   load that spans per-user and per-workspace roots cannot be sourced from a per-workspace store
   without either duplicating the global layers into every workspace or adding a second database, and
   the second database would hold a handful of keys nobody queries.
5. **There is nothing to gain.** SR-4's principle asks for a database when the data is "high-volume,
   queried, or transactional". Configuration is none of the three: `REQ-CONFIG-014` forbids a read
   cache and requires a full re-read on every load precisely because the volume is negligible, there is
   no query beyond "read the whole thing and merge", and the only atomicity anyone asks for is
   `REQ-CONFIG-260`'s validate-before-any-file-is-touched, which is a pre-check rather than a
   transaction.

## Decision

**Alternative B — configuration stays YAML under `.rotaris/` and the per-user configuration
directory** — with `yaml@2.9.0` or later (the `eemeli/yaml` package) rather than `js-yaml`: both are
safe by default, but only the former exposes the document tree the tri-state, the order-preserving
writes and ESC-2's comment preservation need.

**No configuration value is read from, written to, cached in, or mirrored into the workspace
database.** That sentence is the boundary this ADR exists to draw. The mechanical guard is the same
shape ADR-0040 uses for its layout argument: **the loader's entry point takes no database handle**, so
a later change that wanted to consult one would have to alter a signature that ADR-0002 and the
constraints table both name, rather than adding a line inside a function.

Use the **default 1.2 core schema**, under which the two ambiguous switch spellings parse as strings;
`REQ-CONFIG-020` then reduces to un-folding the two literal boolean spellings **per field against that
field's vocabulary**, which is a smaller and more auditable rule than un-folding six. The requirement's
observable is satisfied either way; this is the cheaper route to it.

**Comments and layout are preserved on every write path (ESC-2).** Every writer edits the parsed
document in place and re-emits it, rather than parsing to a value and stringifying that value; the
spike shows this is the *cheaper* route, because only parse-then-stringify loses comments. A test that
round-trips a commented file through each of the four writers and asserts the comments survive is the
guard, and it is the direct replacement for the consequence this ADR used to accept.

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

Under ESC-1 the composer's permission-mode control writes **only its own key**, through that same
scoped per-field writer; pending Settings edits stay pending. That is a use of an existing writer, not
a fifth one.

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
- **SR-4** confirms the placement and adds the boundary statement above. ADR-0004 **rule 1** (readers
  hold no descriptors; every read is open-read-close) still binds every file in this store, because
  these files are still replaced by rename and an ordinary reader still blocks that rename on Windows.
  ADR-0004 **rule 3** (a writer's handle across its own compaction) never applied here — configuration
  has no append-and-compact file — and is dissolved product-wide with the stores that had one.

## Consequences accepted

1. **We own the merge.** It is the largest single piece of hand-written logic in the workspace service
   and the place where a conformance failure would be least visible. `REQ-CONFIG-051`'s end-to-end
   fixture is a first-class test, plus a per-rule test for each of the tri-state rules.
2. The no-cache rule means every settings-screen open, every run start and every workspace open
   re-reads and re-merges. At these file sizes that is microseconds; it is recorded here so it is not
   later "optimised" into a violation — and, now that a database exists in the product, so that the
   optimisation nobody should reach for is named: **not a configuration table, not a parsed-document
   cache in a row.**
3. **Comments and layout survive every write (ESC-2).** This reverses what this ADR previously
   accepted. `REQ-CONFIG-252` is amended by the owner; key order preserved and never alphabetised
   (`REQ-CONFIG-248`) is unaffected and was always the case.
4. Both the workspace service and the run host instantiate this loader (ADR-0002). The tri-state model
   and the validating wrapper must therefore be free of process-specific dependencies — and, now, free
   of any database dependency.
5. `REQ-CONFIG-192` remains a **configuration key** in this store while the records it governs move to
   the database. The key that names the delivery store's settings is authored by a user in YAML; the
   delivery records themselves are rows. Nothing about that split is odd, but it is exactly the sort of
   thing a later reader mis-summarises, so it is written down here and in ADR-0041.

## Revisit if

A requirement makes absent and null equivalent everywhere, removing the tri-state; or a sixth layer or a
per-key precedence inversion appears, both of which `REQ-CONFIG-449` currently forbids; or a validation
library models tri-state optionality natively without normalising, which would collapse alternatives A
and B into one; or ESC-2 is reversed and comments are again to be discarded, which would make the
document API optional rather than required.
