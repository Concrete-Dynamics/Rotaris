# ADR-0032 — Discovery, snapshot and effective configuration are a pure pipeline over provenance-carrying entries

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **This record needed less correction than any other in its group and that is
  worth saying plainly: the four pure functions, the provenance-carrying entries, the two-types rule and
  the type-level unconstructibility are all unchanged.** Two things did move — why the snapshot stays a
  file is now stated in the specification rather than inherited from a ruling whose grounds were
  withdrawn (`REQ-CONFIG-477`, `owner-decisions.md` ESC-14), and `REQ-PROVIDER-152` was rewritten under
  **SR-1**, which makes consequence 4's description of the lock wrong on three counts.
- **Origin:** MODEL (ADR-MODEL-07)
- **Depends on:** ADR-0004, ADR-0007, ADR-0028, ADR-0031, ADR-0036

## Context

`REQ-PROVIDER-081` and `REQ-PROVIDER-082`: tier assignment is deterministic **and its determinism is
the requirement** — ties break on the lowest qualified id in ascending code-point order, so the same
catalogue always produces the same three picks whatever order discovery returned; the invariants hold
whatever the preference lists say; gaps close in a fixed order and a slot still empty takes the
available model with the lowest qualified id, "defined for every catalogue and independent of discovery
order and of the snapshot's stored ordering". `REQ-PROVIDER-077` lets server-side suggestions replace
picks per role.

`REQ-PROVIDER-083`: previously known models a refresh did not re-discover are **preserved**, sorted and
appended, and counted separately, with one shared discovery timestamp per refresh — so refresh is a
**merge, not a replace**, and `REQ-PROVIDER-147` surfaces the preserved count to the user.

`REQ-PROVIDER-149` and `REQ-PROVIDER-150`: the image-input declaration has a three-source precedence —
explicit YAML, then the most recent successful discovery, then shipped model-capability metadata — with
a later discovery replacing a discovery-or-metadata value but **never** an explicit YAML declaration;
absent means "does not announce image input" everywhere and is never inferred from a name. Image token
cost follows the same precedence.

`REQ-PROVIDER-091`, `REQ-PROVIDER-136` and `REQ-CONFIG-207` fix the merge into effective configuration:
authenticated snapshot providers seed the root slots; each snapshot model becomes a configured entry
keyed by qualified id with a synthesised provider family, stripped model id, sign-in provider, base
URL, limits, API mode and pricing; a user-authored YAML entry with a complete provider and model id
**always** overrides; models marked unavailable land in a separate map unless the user named them; an
invalid snapshot is ignored with a warning.

`REQ-PROVIDER-090` and `REQ-PROVIDER-075`: unavailable models live in a separate map from usable models
and **no code path can construct a model client from one**, while pickers still display the row with
its reason.

`REQ-PROVIDER-088`: seven capability slots with a single definition, a fixed unset-resolution chain in
which **every resolution source is another slot and never a literal model name**, literal slot names
used in place of a model replaced during load, and an alias whose slot is empty resolving to the
fallback slot or else leaving the field unset with a validation warning — **never failing the load**.

`REQ-PROVIDER-084` and `REQ-PROVIDER-085` fix the snapshot file: `version: 1` with any other version
rejected, **unknown keys rejected**, mapping keys emitted in written order rather than sorted,
non-ASCII written literally, mode `0644`, atomic write, two reads with no write between them equal, and
a parse or schema violation failing the read with a fixed message. Note the deliberate inversion:
`REQ-PROVIDER-151` requires **unknown fields accepted and ignored** on consumed remote payloads.

`REQ-PROVIDER-086` requires every snapshot write to be preceded by a secret scan that **refuses** the
write and reports the offending field's **path**, with a closed two-family exemption set (ADR-0007).

`REQ-PROVIDER-152` as amended fixes the concurrency discipline, and it is not the one this record
previously described. Its terms: the credential files and the provider snapshot are **per user**, so
"every window of the one running instance reaches the same files (`REQ-STARTUP-161`)"; every write stays
atomic per file; **every read-modify-write sequence** — saving a credential, deleting one, upserting a
provider record, removing one (`REQ-PROVIDER-087`) — is performed while holding an exclusive lock taken
on a **lock file adjacent to the target**; a lock not taken within **5 s** fails that operation with an
error conveying that the store is being updated and that the action can be retried, and that error
**must not assert that a second instance is running, because none can be**; a lock left by a process
that is no longer running is reclaimed and a lock held by a live process is never broken; and **reads
take no lock at all**, because atomic writes already make every read consistent. The requirement names
the only two non-routine states in which the lock is still needed against a process other than the
current instance: a lock left by an instance that crashed or was force-quit, and the brief overlap while
an in-place update hands over to its successor (`REQ-STARTUP-121`).

**The snapshot stays a file, and the reason is now in the specification.** `REQ-CONFIG-477` states the
boundary — configuration must be held as files and must not be moved into a store only this application
can read — and gives four independently sufficient grounds. Of those, the one that reaches *this*
artifact squarely is ground 4: the fold is one fixed total order over five layers (`REQ-CONFIG-031`) and
**the discovery snapshot is layer 3, which is per user rather than per workspace**, so a
workspace-scoped store could not hold it at all without splitting a single total merge across two
storage models. Ground 1 also applies through `REQ-PROVIDER-084`'s own rejection of unknown keys read
together with `REQ-CONFIG-021`'s degrade-rather-than-abort rule. This matters because
`owner-decisions.md` **ESC-14** withdrew the ground SR-4 originally gave for configuration staying in
files — that `REQ-CONFIG-192`'s unmigrated-record rule was an argument about configuration, when in fact
it is an argument about the delivery store, which is now rows. **A reader citing SR-4's original
paragraph for this record's storage would be citing a withdrawn argument.**

`REQ-PROVIDER-110`: a load that fails because a configured model entry is incomplete triggers exactly
**one** non-interactive bulk refresh and one retry, at most once per load attempt.

## Alternatives considered

**A — A service that mutates a live configuration object as discovery results arrive**, with the
snapshot as a serialisation of it.

*For:* one representation; the interface reads what the runtime uses.
*Against:* every determinism obligation becomes a statement about mutation order, which is exactly what
`REQ-PROVIDER-081`'s "the same catalogue always produces the same three picks whatever order discovery
returned it in" forbids relying on. `REQ-PROVIDER-083`'s preservation becomes a diff against live state
rather than a function of two inputs, and `REQ-PROVIDER-149`'s precedence becomes "whoever wrote last".

**B — Four named pure functions over immutable inputs, with impure I/O confined to the ends.** Chosen.

## Decision

Four pure functions:

1. `discover(provider, credential) -> DiscoveryResult` — the only network step.
2. `assignSlots(models, suggestions) -> SlotPicks` — pure, **total**, deterministic.
3. `mergeSnapshot(previousProviderRecord, DiscoveryResult, SlotPicks) -> ProviderRecord` — pure;
   implements ordering and preservation and yields the preserved count the refresh action reports.
4. `resolveEffectiveConfig(snapshot, yamlGlobal, yamlWorkspace, catalogue) -> { models, unavailable,
   slots, warnings }` — pure.

The impure edges are: reading credentials and performing HTTP in step 1; and writing the snapshot under
the adjacent-file lock `REQ-PROVIDER-152` requires, preceded by the secret screen. **Reading the
snapshot is not one of them** — it takes no lock, which is what keeps `resolveEffectiveConfig` callable
from anywhere without a lock discipline travelling with it, and it is a property of the requirement
rather than a shortcut.

**Model entries are provenance-carrying.** Each capability field governed by `REQ-PROVIDER-149` and
`REQ-PROVIDER-150` is stored as a value **plus its source** (`yaml`, `discovery`, `shipped-metadata`,
absent), because the precedence rule is stated in terms of **source and not of recency**, and "a later
discovery replaces a value that came from an earlier discovery or from shipped metadata, and never
overrides an explicit YAML declaration" cannot be implemented without it. The same technique answers
`REQ-CONFIG-222`'s provenance expectations on the settings side.

The three build-data tables of ADR-0028 — known limits, tier preferences, shipped capability metadata —
are **inputs** to these functions, not globals reached into, so a test can substitute them.

`assignSlots` must be **total**: `REQ-PROVIDER-082` guarantees a choice exists for every non-empty
catalogue of available models, and the lowest-qualified-id fallback is what makes it so. A catalogue
with no available models leaves slots unset, which `REQ-PROVIDER-088`'s resolution then handles without
failing the load.

`REQ-PROVIDER-110`'s recovery is a **retry of step 4 with a refreshed snapshot**, not a re-entrant
mutation.

## Consequences accepted

1. The pipeline is re-run on every configuration reload, refresh and sign-in. Its cost is bounded by
   catalogue size and is not on any hot path. Caching, if ever added, must be keyed on the **full input
   tuple**, or it reintroduces the staleness the pure design removes.
2. The **snapshot record and the effective model entry are two different types** with an explicit
   mapping, rather than one type reused. That is more code and it is the point: `REQ-PROVIDER-084`
   fixes the persisted shape and `REQ-PROVIDER-089` fixes the routing shape, and they are not the same
   set of fields.
3. `REQ-PROVIDER-090`'s unconstructibility is a **type-level obligation**: the unavailable map holds a
   different type that no client constructor accepts, rather than a runtime check scattered at call
   sites.
4. The snapshot lives in the per-user **configuration** directory while credentials live in the
   per-user **data** directory (ADR-0029). Two roots, one lock *discipline* — worth stating so neither
   is moved to "tidy up". **The earlier formulation of this consequence — "both are under one
   cross-process lock" — was wrong on three counts under the amended `REQ-PROVIDER-152`, and a ruling
   caused the change rather than a measurement.** There is a lock file **adjacent to each target**
   rather than one lock over both. The lock's job under **SR-1** is **serialising several
   read-modify-write sequences inside one instance** — two windows signing in to different providers, or
   a window and a background run — not excluding a rival instance, and its failure message is forbidden
   from saying otherwise. And **reads take no lock**, so the discipline governs the write path only.
   The genuinely cross-process cases are the two `REQ-PROVIDER-152` enumerates and neither is routine.
5. **The 5 s lock timeout is a new obligation on this pipeline's callers.** A refresh, a sign-in and a
   provider removal can each now fail for a reason that is neither network nor schema, and the failure
   must read as "the store is being updated, retry" rather than as a discovery failure. That is a
   distinct outcome the surfaces of `REQ-PROVIDER-147` must carry, and it is not one of the counts that
   requirement enumerates.

## Revisit if

OQ-21 changes the persisted price type, which changes the snapshot record; or the suggestions endpoint
gains roles beyond the four `REQ-PROVIDER-077` names; or a requirement moves the snapshot into a
workspace-scoped store, which `REQ-CONFIG-477`'s ground 4 says would split one total merge across two
storage models and which must therefore be argued against that requirement rather than against this ADR.
