# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Context

Part 1 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

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
