# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Context

Part 1 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Context

`REQ-CONFIG-192` has been amended and now **states this record's own conclusion as a requirement**,
which changes what has to be argued here. It fixes four settings: a `schema_version` written into every
record; a tombstone-retention flag keeping the ids of requirements the sources have stopped declaring so
a retained id is never issued again; an audit-trail flag recording each state transition with the actor,
the time and the stated reason; and a history limit of 200 entries per requirement with older entries
pruned. The store "holds operational records only; requirement text is never written there".

Three things in the amendment bear directly on the decision below. **The store is placed by requirement
rather than by ruling**: "That store is not configuration and `REQ-CONFIG-477`'s boundary does not reach
it: only this application reads a delivery record, the records are high-volume, queried and
transactional". **The transaction is required rather than chosen**: the delivery state, the history, the
`history_limit` prune and the audit entry are written "**together, indivisibly**, so no failure can
leave a state recorded without its audit entry or an audit entry for a state that was never recorded" —
which is exactly what alternative B′ was selected to provide, and is now an obligation rather than a
benefit. And `store_subpath` **is withdrawn**, together with the directory it named; a file that still
states it is rejected as an unknown key under `requirements:` like any other (`REQ-CONFIG-183`, and see
ADR-0036's consequence 6, which is where that rejection is delivered). `REQ-CONFIG-192` no longer fixes
any file granularity because it no longer names a file: "no key of this domain names a directory, a file
or a document format for it".

*(2026-10-15, fin47: "rejected as an unknown key … like any other" **is false** and is kept above beside its
replacement. `REQ-CONFIG-192` as now written says a file that still states `store_subpath` is "**reported and ignored**
rather than rejected", and `REQ-CONFIG-183`'s carve-out fixes what the report conveys. The loader read neither: the opaque
`delivery` block carried the key unread, so it was neither rejected nor reported. It is now reported once and dropped
(`WITHDRAWN_STORE_SUBPATH` in `packages/config/src/sections/requirements.ts`;
[`../../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md`](../../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md)).)*

`REQ-CONFIG-192` also fixes **forward-tolerant version handling**, and this is the sharpest constraint
in the domain for a database: the reader supports exactly versions 1 through the configured value; a
record whose version is higher is reported as unsupported and **is not interpreted**; a record whose
value is below 1, absent or not an integer is reported as unreadable; **neither is rewritten, migrated
in place, or deleted**. Such a record is reported in exactly three places and nowhere else — on the
board with its delivery history shown as unavailable *for that reason* rather than hidden or empty, in
the session log, and as the return of any surface that reads delivery records. **A workspace holding an
unsupported record still opens and still runs.**

`REQ-TRACE-382`: a closed set of **fourteen** state-changing actions, "closed deliberately so that a
completeness sweep over the action set is possible". `REQ-TRACE-399`: "**no path anywhere in the
application shall persist a delivery state except by calling the engine's transition function**, and
**none shall install the terminal state while circumventing the completion conditions** — not via a
drop, not via a context menu, and not via a bulk operation. **A guard test shall assert that no module
writes the delivery store directly.**"

`REQ-TRACE-403`: "**reading and writing shall be separately grantable.** A component given only the
ability to read requirement data shall have no route by which to change a delivery state, write an audit
record or start a run, and a guard test shall assert that a component composed with read access alone
offers no state-changing operation at all." That is a **capability-object requirement, not a naming
convention**, and it is indifferent to what the capability is over.

`REQ-TRACE-405`: every state-changing action writes who performed it, when, which requirement, and
**that requirement's hash at that instant**; the record is interleaved in the requirement's history with
runs and verifications; an action taken by the scheduler or an agent is recorded as such and is
distinguishable from one taken by a person; and no state-changing action completes without leaving such
a record. `REQ-TRACE-402`: a requirement whose text has changed since the snapshot its run was taken
against shall not be recordable as delivered by any route, and "**where the application is assembled
with a delivery-state writer that does not make that comparison, it shall refuse to start** and shall
name the comparison that is missing". `REQ-TRACE-401`: an override requires a deliberate confirmed act
with a stated reason, is marked as an override, names who and on what grounds, and stays visible.

`REQ-CONFIG-198` fixes what counts as **a person**: an action arriving through an interactive surface in
direct answer to a prompt the product raised for that specific action, with that surface attached to a
window. An action from an agent, a hook, a scheduled or unattended run, or a replay of recorded events
is never a person, **whatever it claims about itself**. The audit record names the operating-system
account the interactive session ran under together with the surface the answer came from; the product
maintains no identity of its own and asks for none.

`REQ-TRACE-388`: at most one state-changing board action per requirement, a second refused with a stated
reason and writing nothing "rather than being queued behind the first or racing it" — and **no further
bound at all on how many actions may be in flight across different requirements, each being
independent**. No card ever comes to rest in a state the engine has not agreed to.

`REQ-TRACE-476`: restart rebuilds, out of what was persisted, the delivery state of every requirement,
its execution units, the runs that were queued or running, and the worktrees belonging to them; a run
whose process is no longer alive is detected and reported **interrupted with its work retained** — never
displayed as still running — with its worktree, branch and partial output kept; the queue resumes where
it stopped **without re-running completed units**, and **no requirement is silently reset**.
`REQ-TRACE-464`: a board-started run's session identifier is already stored on the run record while it
is still executing, and survives a restart; closing the application **cancels** the run rather than
leaving it orphaned.

`REQ-TRACE-239`: putting a board on screen once the engine has answered occupies the interface thread
for no more than **100 ms** at the minimum window size, and that figure does not grow with the size of
the store. `REQ-TRACE-300`: 100 populated columns supported on an open axis.

**`REQ-TRACE-514` mints the delivery store's export**, and its terms are specific enough to constrain
the design rather than merely to authorise it. Every field of every record must reach a stock parser on
a machine carrying none of this product's code; the guarantee "is `REQ-EVENTS-166`'s and is not restated
in a second form here", applied "on the same terms `REQ-SESSION-199` applies it to the timeline, the
issues record, the metrics document and the permission audit". It runs against the open workspace's
repository root exactly as `REQ-TRACE-512` requires of the four toolchain operations, with neither a
root nor a store nominated by the user, and is available whether or not a run is in flight. It is
explicitly **not a fifth toolchain operation** — `REQ-TRACE-508` through `REQ-TRACE-511` "remain exactly
four, and this action performs none of their passes". What it carries is enumerated: the delivery state
from `REQ-TRACE-232`'s column vocabulary together with `REQ-TRACE-233`'s blocked condition and the
origin state a blocked requirement returns to; the delivered specification hash an acceptance stored
(`REQ-TRACE-387`, `REQ-TRACE-402`); the retained per-requirement history; each recorded transition with
the acting party, the time and the stated reason, an override additionally carrying that it was one and
the grounds given (`REQ-TRACE-401`); and the store's own retained retired ids — which the requirement is
at pains to distinguish from the toolchain's retired-identifier log, "which is already the user's and
needs no export". **The audit exports as an audit**: transitions in the order taken, none omitted, and
where retention has pruned earlier entries "the export SHALL state that it has and how many, so a pruned
history can never be mistaken for a complete one". A record the running build cannot interpret is
exported as it stands and identified as uninterpretable with the version it carries, "which is the same
answer `REQ-CONFIG-192` requires of every other surface that reads delivery records; an export that
silently omitted it would be the one place a user could not discover it existed."

**`REQ-LIBRARY-176` mints the improvement store's export** on the same terms and with one addition this
record has to build for. It must carry the artifact container's fields (`REQ-LIBRARY-011`), each
proposal's fields including its evidence entries in stored order (`REQ-LIBRARY-008`, `REQ-LIBRARY-010`),
and "**the recorded version history `REQ-LIBRARY-168` calls 'the audit trail the write path keeps'**" —
every retained version with its `version`, its `recorded_at`, its cause from `REQ-LIBRARY-050`'s closed
vocabulary, and the state that version holds. The same ordering clause applies: every retained version
in the order recorded, none omitted, and where `REQ-LIBRARY-052`'s retention has dropped intermediate
versions, a statement that it has and how many. A version that cannot be read is reported as skipped
rather than dropped without trace (`REQ-LIBRARY-053`). It is offered for a single artifact and for every
artifact of the workspace, from the detail of `REQ-LIBRARY-167` and the list of `REQ-LIBRARY-166`, and
is available whether or not any session is live.

**Both requirements draw ESC-20's boundary the same way, and it is a boundary on content rather than on
readership.** A record gains an export when it carries no unredacted user or tool content.
`REQ-LIBRARY-176` states the consequence as a prohibition on the export's *shape*: it must carry the
artifact exactly as stored, "adding nothing to it and reaching nothing it does not already hold", and in
particular must not resolve an evidence entry's `source_session_id`, `source_artifact_id` or
`source_task_id` into the material those ids name, "because a session's tool-call evidence deliberately
holds unredacted arguments and never gains an export of its own (`REQ-SESSION-136`). An export that
followed those ids would become the export that record is denied." `REQ-TRACE-514` says the same of the
delivery export: it "SHALL NOT be widened to carry the run material a delivery decision refers to."

**On the no-locking citation this record used to carry.** The previous version cited `REQ-LIBRARY-042`
and `REQ-TRACE-502` jointly as imposing "no locking" on the delivery store. Neither does.
`REQ-LIBRARY-042` governs **improvement artifacts**, which are held in a store the application keeps for
the workspace and whose organisation is expressly not contractual — "no path, no file, no document
format"; `REQ-TRACE-502` governs the four artifacts **the toolchain writes**, and `REQ-TRACE-152` limits
those to the generated artifact, the three baselines and the retired-identifier log, which
`REQ-TRACE-513` now fixes as files in the user's repository. The delivery store is written by the
application's transition function, not by the toolchain. **No requirement forbids the delivery store a
transaction**, and `REQ-CONFIG-192` now requires one. The correction still matters in both directions,
but its second half has been overtaken: see consequence 6, where ESC-18 and the amended
`REQ-LIBRARY-042` change the answer.
