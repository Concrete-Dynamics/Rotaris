# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Consequences accepted

Part 4 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Consequences accepted

1. **The delivery store is no longer inspectable with a text editor, and the export is the answer
   rather than a hypothetical one.** Under A′ a user could open a requirement's record. This record
   previously noted that no requirement asked for that — `REQ-CONFIG-192` requires reporting on
   surfaces, not on disk — and offered an export only "if one is ever wanted". **That judgement was
   wrong and has been overruled**, by SR-6's reasoning and then by SR-9(a) and ESC-20: moving records a
   user could previously read for themselves into rows is a straight reduction in what a user owns about
   their own project's delivery history, whether or not a requirement had noticed. The argument the old
   consequence rested on — that a property nobody wrote down is a property nobody is owed — is preserved
   here as the thing that turned out to be false. `REQ-TRACE-514` now requires the export, and the
   restored capability is **not** the old one: a user gets a file rendered for other software rather
   than a directory to browse. That is a better artifact for checking against and a worse one for
   idle inspection, and the trade is deliberate.
2. **`REQ-CONFIG-192`'s `store_subpath` is withdrawn, and the specification decided it rather than this
   record.** The previous version reported the key as vestigial, noted that the directory itself does not
   disappear because `REQ-GIT-140` places requirement-unit worktrees beneath it, and declined to choose
   between narrowing the key and withdrawing it. The amendment withdraws it outright and disposes of the
   worktree half separately: `REQ-CONFIG-194` records that `worktree_subpath` was never a key of this
   domain either, and `REQ-GIT-137` fixes where requirement-unit checkouts go without a configuration
   key naming it. The user-visible consequence is a hard load failure for a workspace still stating
   either key, which lands in ADR-0036 rather than here. *(2026-10-15, fin47: no longer so — the specification
   now makes both keys reported and ignored, `REQ-CONFIG-183`'s carve-out; the hard failure is kept here as the
   reading it replaced, and ADR-0036 consequence 6 records the replacement.)*
3. **The blast radius is one workspace, and what it holds is operational rather than substantive.**
   SR-4 concentrates the crash domain, and that must be stated rather than assumed. The specific
   containment here is `REQ-CONFIG-192`'s own rule that this store holds operational records only and
   never requirement text: losing the workspace database loses delivery history and audit trail, not a
   single requirement, not a line of the user's code, and not a worktree. The requirement documents are
   in the project's version control (ADR-0040) and the worktrees are on disk. That is not a reason to be
   careless with backups; it is the reason the store was allowed to move.
4. **The audit trail is now inside the same durability domain as the state it audits.** Under A′ they
   were separate files and could survive each other. That is a real change and it is the price of the
   transaction; it is accepted because a surviving audit line for a transition that never happened, and
   a surviving state with no audit line, were both states no requirement described.
5. **Three structural assertions this area owes are unchanged in obligation and cheaper in
   implementation**: the read-only composition offers no state-changing operation (`REQ-TRACE-403`), no
   module writes the store directly (`REQ-TRACE-399`), and the assembly refuses to start without the
   hash comparison (`REQ-TRACE-402`).
6. **ESC-3's accepted loss no longer exists to be homed, and the correction runs the opposite way from
   the one this record recorded.** The previous version said: the rule "losing one of two genuinely
   interleaved decisions is an accepted outcome and must not be improved on with a lock" belongs to
   `REQ-LIBRARY-042`, the improvement artifact store, "where ESC-3 ruled it stands as specified" — and
   flagged that no ADR owns that store, so the rule had no home. **The first half is now wrong.** ESC-18
   overtook ESC-3 on the ground that a store providing atomicity makes the interleaving unreachable, and
   `REQ-LIBRARY-042` has been amended to match: the read-modify-write "MUST take effect as one
   indivisible step, so no other mutation can be interleaved between its read and its write", decisions
   on different proposals "consequently both survive — always, not merely when the later writer's read
   happened to follow the earlier writer's write", and the requirement records its own concession as
   withdrawn "as unreachable, not as unimportant". Constraint C-10 has been re-derived on the same
   basis. There is no accepted loss left to carry, in either store.

   The distinction the old consequence was defending still holds and is still worth keeping: what
   `REQ-LIBRARY-042` governs is the **improvement artifact store** and nothing else, and it does not
   reach delivery records. What has changed is that the two stores now agree rather than differ, and for
   the same reason — a store that can make a write indivisible removes a defect that a document layout
   could only accept. **The second half stands**: no ADR owns the improvement store's write path, which
   is OQ-45. This record now owns its **export** and only that, and the live question OQ-45 inherits is
   `REQ-LIBRARY-047`'s best-effort version write, which the amendment did *not* touch and which the
   export section above shows now has an observable consequence it did not have before.
7. Worktree references are rows; **worktrees are directories** and stay on disk with their branches and
   partial output (`REQ-GIT-140`, `REQ-GIT-142`, `REQ-TRACE-476`). Artifacts, attachments and images
   referenced from run records are on disk and referenced by row, never stored as blobs.
8. **The store owes a counter it would not otherwise keep.** Commitment 3 adds a monotonic
   transitions-ever-recorded count per requirement, written in the transition transaction. It exists
   solely so an export can say how much history was pruned. That is a small, permanent cost paid on
   every transition for the benefit of an action most users will take rarely, and it is recorded as such
   rather than hidden inside the export: an implementer who finds it and cannot see who uses it will
   remove it, and the export will then quietly understate what is missing.
9. **The export is a second reader of the store and is not on any latency budget.** `REQ-TRACE-239`'s
   100 ms applies to putting a board on screen and is bounded by what is on screen (`REQ-TRACE-358`); an
   export reads everything and is bounded by nothing the specification states. It runs off the interface
   thread like the four operations of `REQ-TRACE-512`, and — because it is a user-initiated action
   producing a file — a slow export is a progress problem rather than a responsiveness one. What must
   not happen is an export holding a long read transaction that blocks transitions; that is a store
   concurrency question belonging to ADR-0058, named here so it is designed for rather than discovered.
10. **`REQ-SESSION-201`'s whole-store backup is a different artifact and this record must not be read as
    providing it.** The requirement is explicit: "an **export** is a record rendered so that software
    knowing nothing about this product can read it; a **backup** is the store rendered so that this
    product can put it back". The two exports here discharge readability and discharge nothing about
    durability. A user who exports every delivery record has not backed up their workspace store, and
    the disclosure of `REQ-SESSION-200` is what tells them so.
