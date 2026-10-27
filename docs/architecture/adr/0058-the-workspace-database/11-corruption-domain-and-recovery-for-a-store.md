# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Corruption domain, and recovery for a store nobody backed up

Part 11 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

### Corruption domain, and recovery for a store nobody backed up

**Stated plainly: one file per workspace is one blast radius.** Under the file design a torn write cost one
session, or one document inside one session; under this decision it can cost every session in a workspace,
together with that workspace's delivery records and improvement library. That is a real reduction in fault
isolation, accepted for the ruling's benefits, and it is bounded four ways.

1. **Scope bounds it to one workspace.** Other workspaces are separate files in separate directories.
2. **The user's own material is never in it.** Requirement documents, baselines, the generated artifact and
   the retired-identifier log are files in the user's repository (`REQ-TRACE-513`); configuration, personas
   and model slots are files (`REQ-CONFIG-477`); credentials are individually protected files
   (`REQ-PROVIDER-016`); artifact, attachment and image bodies are files referenced by row
   (`REQ-LIBRARY-087`, `REQ-SESSION-002`). A destroyed store costs the record of what the product did. It
   never costs work the user authored, and the artifact bodies outlive the index that named them.
3. **A pre-migration copy exists** for the one operation most likely to cause the damage. See schema
   evolution.
4. **The exports are the user's own readable copy, and `REQ-SESSION-201`'s backup is the restorable one.**
   *(Corrected 2026-09-02: this consequence read "and under SR-9(b) they are now the **only** one", which
   the paragraph below already withdraws. The two statements contradicted each other on one page.)* See
   below.

**What SR-9(b) changes about all of this.** A machine-local store is not in the user's backup of their
workspace. Backing up the project folder, pushing it to a remote, or letting a sync client replicate it
captures the repository, the configuration and the workspace identifier — and none of the session history.
On macOS a whole-machine backup does reach the per-user data directory; on Windows and Linux a
workspace-scoped backup does not, and the ordinary user has only the former by accident. Two consequences
follow and are stated rather than assumed.

- **The exports' role, corrected.** `REQ-EVENTS-166`, `REQ-SESSION-189`, `REQ-EVENTS-172`,
  `REQ-SESSION-199`, `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted so a user could read their own
  records without this application. The previous version of this record went on to say they were "now also
  the only user-controlled durable copy of those records". **That is no longer true and must not be
  cited:** `REQ-SESSION-201`'s backup is a user-controlled durable copy, and it is the one that restores.
  What survives, and is the useful half, is that an export is *readable* where a backup is not, and that
  `REQ-SESSION-199` and `REQ-SESSION-201` each forbid being collapsed into the other. Both are needed and
  neither is the other's fallback.
- **The recovery ladder may not assume a copy exists.** Every step below is written on the assumption that
  what is in front of the user is the only copy there has ever been. A backup **may** exist, and the ladder
  may say so — but it may not look for one, may not restore one, and may not be built on the assumption
  that a user took one, because `REQ-SESSION-201` forbids a restore happening "as a repair" and nothing
  makes taking a backup mandatory.

**Detection, and its limit.** After an unclean shutdown the workspace service runs `PRAGMA quick_check` at
open, which is bounded, alongside rule 3's write probe — the probe establishes that the store is *usable*
and the check that it is *intact*, and neither substitutes for the other. **Neither establishes that it is
complete**: consequence 15's silent-loss mode leaves a store that passes `integrity_check` and is simply
short. A full `PRAGMA integrity_check` is available only from an explicit user action, because it is
O(store) and must never sit on an open path — and the packaged-first-paint spike puts the whole pre-paint
budget on the passing artifact flavour at a few seconds against `REQ-STARTUP-155`, which is not a budget an
O(store) check belongs in. Store opening runs in the workspace service after the window is shown, on
`REQ-STARTUP-043`'s post-show activation, so it delays neither first paint nor the moment the interface
accepts input.

**Recovery, in order, and it never destroys anything.** On a store that will not open or fails
`quick_check`:

1. **Report the workspace store as unopenable**, naming the store path and the engine's own error unaltered
   — `REQ-EVENTS-084` requires exactly that of the run refusal, "so a user can act on the actual cause" —
   and never a generic failure.
2. **Offer salvage first**, attempting SQLite's own recovery over the damaged file **into a fresh store**,
   and reporting what it could not read. This is offered before anything else because it is the only step
   that can return history, and there is no backup behind it.
3. **Offer the exports of what salvage recovered**, before the user is asked to accept the loss of the rest.
4. **Offer to move the damaged store aside**, renamed with a UTC timestamp, and start an empty one, stating
   in terms that the sessions in it will no longer be listed and that this machine holds no other copy —
   which is the same displacement a restore performs, so a store set aside by recovery and one set aside by
   a restore are the same kind of leftover and are reclaimed the same way.
5. **Name the restore as a remedy the user may take, and do not take it.** Where a user holds a
   `REQ-SESSION-201` artifact for this workspace, restoring it is the one action that returns history this
   ladder cannot. The ladder therefore says so — after step 2's salvage, because salvage returns *this*
   store's history and a backup returns history as of when it was taken. It **must not** look for an
   artifact, must not offer one it noticed, and must not restore anything itself: `REQ-SESSION-201` forbids
   a restore "as a repair" in those words, and a repair path that restores on a user's behalf is exactly
   the silent, whole-store overwrite the requirement's explicitness rules exist to prevent.

**The application never deletes a store and never repairs one in place.** That is the same instinct as
`REQ-CONFIG-192`'s "neither is rewritten, migrated in place, or deleted", applied one level up, and under
SR-9(b) it is no longer merely tidy: a store the application deletes is history that existed nowhere else.

### Reclaiming a superseded store

Machine-local storage accumulates. Three kinds of leftover exist and are handled differently.

**A pre-migration copy** is reclaimed by the product itself, at the next clean open at the migrated version.
It is the one leftover with a definite end of life.

**A store nobody references any more** — the user deleted the workspace folder, or replaced its identifier —
is reclaimed **only by an explicit, user-confirmed action**, from a surface listing the stores this machine
holds with each store's last-seen workspace paths (`origin.txt`), its size, its session count and when it
was last opened. Deletion offers the exports first. **ESC-26 gives this kind a second and now
product-driven source**: a restore that establishes the artifact's identifier over the workspace's leaves
the store recorded under the old value intact and unreferenced. It is listed here like any other, and
because it is intact rather than displaced, re-creating the old identifier value in `.rotaris/` by hand is
a complete undo — which is why the confirmation shows that value.

**Automatic reclamation is refused**, and the reason is the whole point of ESC-15. The only signal available
is that a store's last-seen path no longer resolves — and a path fails to resolve when an external drive is
unmounted, when a share is down, and, above all, **when the folder has been moved**, which is precisely the
case the identifier exists to survive. Reclaiming on that signal would delete a user's history to punish
them for the operation the design was built to support. Age is no better: `REQ-SESSION-043` makes a workspace
that has not been run here an ordinary state, and ESC-9 already ruled retention unbounded.

This needs a specification surface it does not currently have; it is listed in this record's open items.

### Schema evolution

**1. Record payloads keep their own version field, unchanged.** Where a requirement fixes a `schema_version`
inside a record it stays a column on that record's row and is read exactly as specified.
`REQ-CONFIG-192` is carried verbatim: a delivery record whose `schema_version` exceeds the supported version
is reported as unsupported and not interpreted, is not rewritten, migrated in place or deleted, its
neighbours read normally, and the condition is reported in the three places the requirement names — the board
showing that requirement's delivery history as unavailable *for that reason*, the session log, and any
surface that reads delivery records — and "a workspace holding an unsupported record still opens and still
runs". A row is a better home for that rule than a file was, because skipping one row is cheaper than
skipping one file. `REQ-SESSION-013`'s persisted-state version is likewise a column, and `REQ-SESSION-038`'s
refusal of a higher version is a row-level refusal.

**2. The table schema is versioned by `PRAGMA user_version`, and migrations are forward-only.** Numbered
from 1, each migration is a single statement sequence inside **one transaction**, so a migration either
completes or leaves the previous schema in force; a half-migrated store cannot exist. Migrations run **only
in the workspace service**, at workspace open, **before the run host is told the workspace is open** — so no
second process is ever inside a schema change. The run host refuses to open a store whose `user_version` is
not the one it was built for; it does not migrate and it does not wait.

**Before any migration runs, the store is copied** with `VACUUM INTO` to `workspace.db.pre-<n>.bak` beside
it, kept until the next clean open at version `n`. This is the answer to the blast-radius question for the
one operation most likely to cause the damage, and under SR-9(b) it is the only copy that will exist. **A
copy that cannot be written aborts the migration**: the workspace opens at the old version with the reason
stated, rather than migrating without a way back.

**Downgrade, and a store newer than the application, are the same case with the same answer.** When
`user_version` exceeds the version this build supports, **the application refuses the store**: it does not
migrate downward, does not guess which columns it still understands, and **writes nothing to it** —
including no `user_version` — so a store opened by a newer build and then by an older one is returned
untouched. The refusal names the store path, the version it carries, the version this build supports, and
the one remedy: update the application. Downward migrations are not written, ever; the cost of maintaining a
reverse for every schema change is paid on every change and redeemed almost never, and a wrong one silently
destroys history.

**The workspace still opens.** Refusing the store refuses the *rows*. Configuration, personas, model slots,
the requirement documents, the generated artifact, the baselines, the retired-identifier log and the
credentials are all files (`REQ-CONFIG-477`, `REQ-TRACE-513`, `REQ-PROVIDER-016`) and are all still readable
and editable; version control is unaffected. A user who opens their project with an older build sees their
material and cannot see their session history — not a workspace that will not open.

**The honest cost, stated because it is a genuine regression.** Under files, one unsupported record sat
uninterpreted while its neighbours read normally — that is `REQ-CONFIG-192`'s whole point, and it is
preserved for records. Under a store, an unsupported **table schema** stops every row in the workspace at
once. Forward tolerance that was per-record for payloads is per-store for structure. Nothing recovers that;
it is inherent to having a schema, and it is why migrations are additive by policy: **a migration adds
tables and adds nullable columns, and does not drop or retype a column an older supported build reads**, so
`user_version` rises less often than the schema changes.

### What is not in the store

Repeated here because this is the file a reader will open to ask. The configuration a user edits, which
`REQ-CONFIG-477` now states as a boundary with four independently sufficient grounds; personas and model
slots; the requirement documents, the generated symbol artifact, the three baselines and the
retired-identifier log, which `REQ-TRACE-513` states as a boundary of its own; global configuration, the
discovery snapshot and desktop preferences, which are per-user and outlive any workspace; artifact,
attachment and image **bodies**, which are files beside the store, referenced by row, and **never blobs**
(`REQ-LIBRARY-087`); provider credentials, which stay individually protected files because
`REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read back, and no row makes
that guarantee; the session's human-readable summary and the session's log, which exist to be read by a
person (`REQ-SESSION-006`, `REQ-SESSION-140`, `REQ-SESSION-142`, `REQ-SESSION-191`) — *the path
`evidence/debug.log` this record previously named here is withdrawn and must not be cited: it belonged to
the session-directory layout domain 18 carried, `REQ-SESSION-142` now names only "the session's log,
which is a file", and `REQ-SESSION-002` closes the per-session set at three **kinds** and fixes no
filenames*; the workspace identifier
itself (`REQ-SESSION-197`) — a store cannot hold the thing that names it; and `REQ-GIT-128`'s integration
lock, which is a file in the workspace on purpose.

**And the backup artifact of `REQ-SESSION-201` is not in it either, in the other direction.** It is written
where the user chose, it is never read back in place of the store, and nothing the product does consults it
except a restore the user asked for. `REQ-SESSION-201` says so itself, and adds that it does not collide
with `REQ-SESSION-028`'s ban on a second whole-state copy: that rule governs what a *save* writes and
forbids the product keeping a duplicate the store could disagree with. The artifact is not kept, is not
maintained, and is not consulted — so there is nothing for the store to disagree with.
