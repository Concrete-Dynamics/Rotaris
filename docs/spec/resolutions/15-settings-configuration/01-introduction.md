# Open-Question Resolutions — Settings and Configuration — introduction

Part 1 of 4 of [domain 15's resolutions](../15-settings-configuration.md), which indexes every part.



> ## Amendment, 2026-09-27 — the Skills table has seven columns (ESC-38)
>
> `REQ-CONFIG-343` counts seven columns instead of five: Skill, Source, Path, Trigger, Invocation, Load,
> Description. The description tooltip and the empty state are unchanged.
>
> **Why this is an amendment.** `REQ-WORKSPACE-067` was amended by domain 13's resolution round to add the
> `Path` column and a per-row invocation selector, and this domain was not amended alongside it, so its count
> went stale. The approved mockup draws the selector as a column between Skill and Load. The owner ruled
> ESC-38 as it recommended ([R-052](../../../product/requests.md#r-052)); `owner-decisions.md` holds the ruling.

> ## Amendment, 2026-09-23 — per-token prices are decimals (OQ-21)
>
> `REQ-CONFIG-088` types the two price fields as decimal ≥ 0 instead of float ≥ 0. A price may still be
> written as a YAML number, and it is taken as the decimal its text states. The project-settings snapshot's
> `pricing` map carries decimal strings. The both-or-neither rule is unchanged.
>
> **Why this is an amendment and not a directive.** Two live requirements disagreed: `REQ-PROVIDER-072` and
> the snapshot format typed prices as floats, while `REQ-PROVIDER-121` forbids computing any amount, "including
> the per-token pricing carried through discovery", in binary floating point. A value that has been through a
> binary float cannot afterwards be made exact, so the float typing was the defect. The owner ruled OQ-21 as it
> recommended ([R-049](../../../product/requests.md#r-049)); `owner-decisions.md` holds the ruling.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - Any row settling the **requirement delivery store**'s directory, or the default of
>   `requirements.delivery.store_subpath`, is superseded. Delivery records are rows (**SR-4**), the key is
>   withdrawn as a recognized field, and a file that still states it is a hard load failure under
>   REQ-CONFIG-183, following REQ-CONFIG-194's precedent for `worktree_subpath` (REQ-CONFIG-192).
> - Configuration itself is **not** affected and is not a candidate for the same move. REQ-CONFIG-477 now
>   states the boundary and its four grounds, so a later reader must argue against them rather than
>   discover that nothing forbids the migration.
> - **ESC-2 (preserve comments on configuration write-back) is ruled and still unmade.** REQ-CONFIG-252
>   continues to state that comments and formatting are lost. ESC-1 (REQ-CONFIG-288, the composer's
>   permission-mode write path) appears to be in the same position. Neither was in scope for the storage
>   passes and neither is closed.
>   >
>   > **Both closed 2026-09-01.** ESC-2 is applied: REQ-CONFIG-252 now states that comments, formatting
>   > and layout are **preserved**, the write being a targeted edit of the existing document rather than
>   > a re-emission of the whole of it, and the requirement is now the single statement of that
>   > preservation discipline for every writer of `agents.yaml` — so the desktop save and the scoped
>   > per-field path (REQ-CONFIG-441) are not left silently different. REQ-CONFIG-248's key order
>   > preserved and never alphabetised is unaffected, as the ruling said it would be.
>   >
>   > ESC-1 is applied: REQ-CONFIG-288 no longer states the shared save path. The composer's
>   > permission-mode control writes its single key through the scoped per-field writer and commits
>   > nothing else; pending Settings edits stay pending, stay dirty, and are still undone by Discard.
>   > The ruling's two protected requirements hold — REQ-CONFIG-423's guarantee that a control never
>   > continues to display a permission mode the pending state no longer holds is preserved by amending
>   > its antecedent rather than the guarantee, and REQ-CONFIG-418 needed no change because the
>   > composer's control does not defer to Save and so does not participate in Save and Discard, exactly
>   > as REQ-CONFIG-471's diagnostics toggle does not.
>   >
>   > **A consequence a later reader should not have to rediscover.** Choosing candidate 1 for the
>   > open architecture question ESC-23 raises — the per-field write also lands in the pending settings
>   > state — narrows REQ-CONFIG-420: for this one field a refresh may displace an unsaved selection.
>   > Both requirements state it, and the alternative was a security-relevant control displaying a mode
>   > no run is operating under. This is the one place in the ESC-1 amendment where a conflict between
>   > two requirements was resolved by narrowing one of them, and it is the owner's to reverse if
>   > candidate 2 is preferred.
> - **ESC-7's `*.py` plugin extension is withdrawn corpus-wide, and this domain carried two of the
>   sites.** REQ-CONFIG-277's Plugins inventory and the workspace layout block both fixed the
>   extension; both now defer to REQ-TOOLS-161, which owns what a plugin file is and states that no
>   language, runtime, packaging form or file extension is fixed anywhere in this specification. This
>   domain holds no second definition of the inventory's membership rule.


> ## Amendment, 2026-09-02 — the withdrawn-key dead end gains a stated remedy (REQ-CONFIG-478 minted)
>
> Three requirements compose into a workspace that will not open over a key a previous statement of this
> specification invited the user to write: REQ-CONFIG-192 withdraws `requirements.delivery.store_subpath`;
> REQ-CONFIG-183 makes an unrecognized key anywhere under `requirements:` a **hard load failure**, the
> opposite of the top-level warn-and-continue policy; and REQ-GIT-071 makes a rejected configuration value
> fatal to the workspace. REQ-CONFIG-192 states that consequence itself — "stated here rather than
> discovered" — so it is considered rather than accidental. **What no requirement stated was what the user
> is told or how they get out.** A dead end with no stated remedy is a defect even where the dead end was
> intended, and it is the kind of defect nothing catches, because every requirement involved is
> individually satisfied by a build that leaves the user stuck.
>
> **REQ-CONFIG-478 is minted** as the single definition of what a fatal load failure conveys and what
> recovers from it. It requires the report to name the file by full path and by scope, to name the
> rejected key by its full path within that file, and — where the key is one this specification names as
> withdrawn or as not a configuration key — to convey that it was **withdrawn rather than mistyped** and
> what became of what it configured, so a user does not hunt for a spelling error that is not there. It
> binds the failure to REQ-NOTIFY-001's *failed with one concrete next step named*, that step being to
> remove the key and open the workspace again. It then states the recovery as a **guarantee**: removing
> the key and loading again is sufficient, nothing outside that file needs repair, the product has written
> nothing on the user's behalf, the application keeps running with that workspace's configuration
> unloaded, other workspaces are unaffected, and a rejected key in the **global** scope stops every
> workspace opening until it is removed — which is why naming the scope is not optional.
>
> **The rule is written against a property, not a list.** "The specification withdraws this key by name"
> covers `requirements.delivery.store_subpath` (REQ-CONFIG-192) and `requirements.execution.worktree_subpath`
> (REQ-CONFIG-194) today, and covers a key withdrawn by a later amendment without REQ-CONFIG-478 being
> amended.
>
> **What was deliberately not done.** REQ-CONFIG-183's fatality is **not** relaxed: the hard failure is
> what stops a mistyped requirements key being silently ignored on a block that drives unattended runs,
> and REQ-CONFIG-192 accepted the cost knowingly. No new surface is added and the product is granted no
> licence to edit the user's file for it; the remedy is available because configuration is a file the user
> owns and can edit with anything, which is ground 3 of REQ-CONFIG-477 doing the work it was recorded for.
> **Whether the product should go further — offer to remove the withdrawn key itself, or open the file for
> editing from the failure report — is a user-visible choice and is escalated rather than taken here.**
>
> REQ-CONFIG-183, REQ-CONFIG-192, REQ-CONFIG-194 and REQ-CONFIG-233 are amended in place to cite
> REQ-CONFIG-478 rather than to restate any part of it. REQ-GIT-071 states the same refusal shape for the
> values domain 06 rejects; REQ-CONFIG-478 says in its own text that it does not vary that shape, and
> reconciling the two into an explicit owner and follower is domain 06's to complete.
>
> **Also in this pass, from domain 04.** The Copilot gateway staging directory leaves the workspace for
> the per-user data directory (REQ-PROVIDER-063). REQ-CONFIG-010 and the workspace-layout block are
> amended: `<workspace>/.rotaris/` never held it, and now the two documents agree about that.


> ## Amendment, 2026-09-02 — three owner rulings land (ESC-27, ESC-28, ESC-29) and the per-user location is cited
>
> **ESC-27 — `secrets.yaml` gains a file mode, and it is `0600`.** REQ-CONFIG-216 fixed the write as
> atomic and directory-creating and fixed **no mode**, so the one file in this document's configuration
> set that holds credentials by design took whatever the process mask happened to leave. Ruled `0600`,
> matching credentials. REQ-CONFIG-216 is amended in place: every write leaves the file at `0600` with no
> group or other bit, applies that explicitly rather than by inheritance, and on a platform with no POSIX
> mode uses the explicit owner-only access control REQ-PROVIDER-016 fixes for the credential store —
> **cited, not restated**, because that requirement owns the platform-specific form of the protection. The
> `0644` of REQ-CONFIG-444 and REQ-CONFIG-212 is untouched and now reads as the rule for ordinary
> configuration, with the contrast stated so the two are not read as a conflict; REQ-CONFIG-444's
> "leave the platform's own default in place" fallback is explicitly **not** available for this file. Where
> the protection cannot be applied, the existing failure path governs and no secret is written at a weaker
> protection. The Data & Formats secrets entry carries the same statement as a citation.
>
> **ESC-28 and ESC-29 — a withdrawn configuration key is reported and the workspace opens.** Ruled
> together: report and carry on. Amended in REQ-CONFIG-183, which owns the rule, rather than carved out
> elsewhere. A key this specification itself defined and withdrew, and a key it names as not a
> configuration key of this domain, are **reported and ignored**: they contribute nothing to the merge,
> every other key loads as though they were absent, and the workspace opens. **REQ-CONFIG-183's rule for a
> genuinely unknown key is not weakened** — it is restated as unweakened, with its reason (the block drives
> unattended runs, so a silently ignored key there would let a run proceed under settings its author
> believed they had given it), so that a later reader cannot take this carve-out as licence to widen it.
>
> The requirement states **why** rather than merely carving an exception, because the departure is
> deliberate: an unknown key a stranger wrote and a withdrawn key this product solicited are not the same
> case, and treating them alike converts our own deprecation into the user's outage. In the global scope
> the asymmetry is total — one line in one file would stop *every* workspace opening at once, with no
> surface of the product reachable to repair it, the settings screen that edits that very file included.
>
> **What moved and what did not.** The report's content — file by full path and scope, key by full path,
> withdrawn-rather-than-mistyped, what became of what the key configured — is **relocated, not withdrawn**:
> it moves from REQ-CONFIG-478 into REQ-CONFIG-183 because it now describes a warning rather than a fatal
> failure, and REQ-CONFIG-183 adds that the report must also convey that the key is being ignored and that
> the rest of the configuration loaded. REQ-CONFIG-478 keeps its identifier and its job — the floor every
> **fatal** load failure meets — with its stated motivation corrected in place rather than deleted, since
> the case that motivated it is now handled at its source. REQ-CONFIG-233 moves the case from **Fatal** to
> **Warn and continue** and narrows the fatal entry to a key this specification has never defined.
> REQ-CONFIG-192 and REQ-CONFIG-194 are amended to cite the new outcome instead of the old refusal.
> REQ-CONFIG-477 ground 1 now reads the surviving withdrawn key as that ground working rather than as an
> exception to it.
>
> **Deliberately not done.** No new surface, and no licence to edit the user's file: the product neither
> removes the key nor offers to. The second half of ESC-28 — a confirmed one-click removal — would need the
> no-repair rule narrowed explicitly and was not taken. `REQ-CONFIG-478`'s no-repair guarantee is unchanged.
>
> **The per-user location is now cited rather than assumed.** REQ-STARTUP-145 gains the clause fixing
> which per-user location is meant where a platform offers both a replicated one and a machine-local one.
> REQ-CONFIG-001 and the workspace-layout block now cite it; this domain states no rule of its own about
> the location and the per-platform spellings in REQ-CONFIG-001 are that location rather than a second
> definition of it.


This record disposes of every open question raised in the draft of
[`../15-settings-configuration.md`](../../15-settings-configuration.md) (domain 15, requirement prefix
`REQ-CONFIG`). The body of that specification has been amended so that each decision below is stated
normatively in place; the numbering of the original open questions is preserved here so the draft and
the resolved specification can be read against each other.

The following product-owner decisions of 2026-08-30 governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is more coherent with the rest of the document; where no coherent reading exists, the
   behavior is withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. See the
   graphical-only sweep below for what that did to this domain. Configuration that governs the
   programs the application itself runs is untouched; what was removed is every way a *user* reached
   this product from a shell or a text-mode screen.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable output
   format). Open questions asking only about phrasing, punctuation, or inflection of a human-readable
   message are resolved by fixing the information the message must carry and leaving the wording to
   the implementation.

New requirements added by these resolutions: **REQ-CONFIG-461**, **REQ-CONFIG-462**, **REQ-CONFIG-463**,
**REQ-CONFIG-464** and **REQ-CONFIG-466**; **REQ-CONFIG-465** was left free by this pass and was
taken afterwards by the product owner's answer to OQ 44, which registers the tool-server `enabled`
field.
Requirements withdrawn: **REQ-CONFIG-058** through **REQ-CONFIG-061** (legacy directory adoption).
No requirement identifier was renumbered, reused, or deleted.

Of the 63 open questions raised in the draft, 60 were resolved, 2 were omitted (OQ 32 and OQ 33,
legacy directory adoption) and 1 was escalated (OQ 44, the identity of the three default tool
servers). That escalation was answered by the product owner on 2026-08-30 and the answer is recorded
in `docs/clean-room/specification-gate.md` *(removed 2026-10-26)*, so every
question raised against this document is now disposed of and none remains open.
