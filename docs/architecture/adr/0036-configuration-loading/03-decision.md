# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Decision

Part 3 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

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
