# ADR-0004 — One document primitive, three write shapes, and a guarded read side — Consequences accepted

Part 4 of 5 of [ADR-0004](../0004-the-atomic-document-primitive.md), which indexes every part.

## Consequences accepted

1. A read can cost two attempts under contention; the added latency is bounded by the store's policy and is
   zero uncontended. One replace path can additionally cost a bounded ladder of up to five attempts within
   about 1.55 s (`REQ-SESSION-033`), and that ladder is on the save path of a running session. **And the
   uncontended write itself is not free where the target is on a share: p50 12.06 ms against 2.07 ms local,
   p95 26.50 ms against 2.53 ms, measured over loopback SMB with no network latency at all, so that is a
   floor.** Every configuration-document write for a user whose workspace is on a file server pays it, and
   nothing in the record carried that number before.
2. We own the filesystem edge cases for **nine replace targets, two exclusive-create targets and one lock
   file** — anti-malware handles, network shares, case-insensitive collisions — rather than for a dozen
   independently written stores. The count is of targets and is reproducible from the table; it is not the
   count of callers, which is larger. Some of those targets are now in per-user storage rather than the
   workspace, which changes which foreign processes can interfere but not that some can. **"Network shares"
   has stopped being a listed hazard and become a measured one**: the replace fails on 6.2 % of first
   attempts there with nothing else touching the file, and the exclusive-create shape is correct there —
   2,500 races, exactly one winner in every one. Owning these in one module is what makes a single ladder
   fix all nine rather than nine.
3. **The primitive does run in the run host, for exactly one file.** The previous version said it did not;
   that is wrong. `REQ-SESSION-028` rebuilds `summary.md` on every save and makes it "the one part written
   as a file", and the save is taken by the process holding the session lock, which is the run host
   (`REQ-EVENTS-098`, ADR-0002). So the run host owns one replace path, on the save path, with a retry
   ladder on it — and it is the one place in the product where this primitive can add latency to a running
   session. Everything else through the primitive belongs to main (credentials, the per-user documents and
   their locks) or the workspace service (configuration, the traceability artifacts, the integration lock,
   the identifier — both its exclusive-create mint and ESC-26's single confirmed replace of it, which
   ADR-0058 places in the same process for the same reason: it is the only process that reads `.rotaris/`
   and resolves an identifier) — **except the export write, whose process this record does not fix.** It reads the store,
   which needs no lock (`REQ-EVENTS-098`), and writes a file outside every path the product owns, so nothing
   requires it to be in the run host and `REQ-SESSION-199` requires it not to disturb a run. Where it runs is
   ADR-0002's and ADR-0058's; what it must not do is take the run host's thread while a session is recording.
4. `REQ-PROVIDER-016`'s read-back remains the only place in the product where a write verifies its own
   effect after the fact, which makes it worth its own test rather than a shared one.
5. Constraint D-27's "file-handle lifetime is a free implementation choice" is true again for append
   handles, because no compaction renames over one — and it stays **false for readers**, which is rule 1.
6. **Two of this record's long-standing factual claims were wrong and were corrected by measurement, not by
   argument.** The share-delete claim and the directory-`fsync` claim were both stated confidently and both
   failed a test. Neither changed a decision, which is worth noticing: the rules were right for a reason the
   record had mis-identified. The lesson is carried rather than the numbers.
7. **The exclusive-create shape is new here and it carries two of the product's identity guarantees** —
   which workspace this is (`REQ-SESSION-197`) and who is integrating (`REQ-GIT-128`). It is a smaller
   mechanism than the replace path and a more consequential one: a bug that overwrites rather than reads
   orphans a user's history, silently. The comparison behind ESC-19 to ESC-21 makes that concrete rather
   than hypothetical: path-keyed harnesses lose sessions when a directory is renamed, one user losing 63
   sessions across 10 projects, and *even a change of case* orphans everything. The identifier is what
   this product has instead, so the write that mints it is load-bearing out of proportion to its size.
   **The primitive itself is now measured and it is sound** — 2,500 of 2,500 races produced exactly one
   winner, including across mixed I/O stacks — so the risk is entirely in how it is *called*, which is the
   distinction this record has to keep visible. **And ESC-26 has since put exactly one replace of the
   identifier file into the product**, inside the restore and behind an explicit confirmation. That write
   is the one place where "overwrites rather than reads" is the intended behaviour, which makes it the one
   place a reviewer cannot rely on the shape to tell them the call is wrong. It is called out in shape 2
   above and owned by ADR-0058.
8. **Two secret-bearing files stay inside the workspace, and ESC-15 does not reach them.**
   `REQ-PROVIDER-063` puts the Copilot gateway's `access-token` and `api-key.json` under
   `<workspace>/.rotaris/copilot-gateway/`, and that path cannot be relocated to per-user storage the way
   the session store was, because consumers are pointed at the directory by `GITHUB_COPILOT_TOKEN_DIR`
   (`REQ-PROVIDER-064`) and the name is stated to be part of the observable contract. So a workspace in a
   synchronising folder has bearer tokens inside the synchronised tree. Three things bound it, and they are
   named together because no one of them is sufficient: `REQ-CONFIG-013` keeps `.rotaris/` out of version
   control; `REQ-PROVIDER-063` requires the same protection as the credential store, refusing to write
   either file when it cannot be applied; and the tokens are short-lived. **What is *not* bounded is a sync
   client replicating them to a vendor's servers**, and no requirement addresses that. Recorded here
   because this record owns the write and is where a reader would look, not because it is this record's to
   decide.
9. **The export destination is the one replace whose target the product does not choose.** Every other
   entry in the table is a path the product owns; `REQ-EVENTS-145`'s document lands wherever a save dialog
   points — removable media, a network share, a synchronised folder, a directory the user has open in
   another application. The primitive's stage-in-the-target's-own-parent rule is what makes that work at all
   (a temporary file beside the destination is on the same volume, so the rename is a rename and not a
   copy), and it is also the rule most likely to be broken by a well-meaning simplification that stages in
   a temporary directory. It is also the target on which a foreign handle is **most** likely, since the user
   picked the location for a reason and may well have the previous export open in another application.
   **Whether a ladder applies to it is genuinely unclear, and this record does not resolve it.**
   `REQ-EVENTS-145` states none. `REQ-SESSION-033`'s ladder is scoped to "where this domain replaces a whole
   file in place", naming `summary.md` only as "the one written repeatedly" rather than as the only one —
   and the sessions domain writes exports too (`REQ-SESSION-189`, `REQ-SESSION-199`), which over an existing
   destination is a whole-file replace in place. So the ladder either reaches the export or stops at
   `summary.md`, and the text supports both readings. The two differ in what a user observes — a failed
   export against a held file, or a successful one a second later — so this is a specification question and
   is raised as one rather than chosen here. The policy record carries either answer without changing shape.

   **The measurement this consequence was written waiting for has arrived, and it does not settle the
   reading — it raises the stakes on getting it right.** A network share is one of the destinations named
   here, and the replace fails there on **6.2 % of first attempts with no foreign handle involved at all**.
   So the ambiguity is no longer academic: under the narrow reading, roughly one export in sixteen to a
   share fails for a reason the user cannot act on and cannot reproduce; under the wide reading it
   succeeds on the second attempt, which is what happened in 29 of the 30 retries measured. **The
   specification question is unchanged and the argument for answering it is now numerical rather than
   hypothetical.** Removable media, a synchronised folder and a directory open in another application
   remain unmeasured; the share is the one of the four that was tested.
