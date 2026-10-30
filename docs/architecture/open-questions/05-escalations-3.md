# Open questions — Escalations — product-owner decisions (3 of 3)

Part 5 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds ESC-26 – ESC-31.

### ESC-26 — the identifier cannot be re-established by any product action, and that blocks the recovery path ESC-19 just minted *(raised 2026-09-02; **RULED 2026-09-01 and APPLIED 2026-09-02**)*

> ***Ruled: option 2, drawn as narrowly as it can be drawn. `REQ-SESSION-197` gains one exception — a
> restore MAY establish the workspace identifier on explicit user confirmation, and no other action ever
> may.*** The ruling is in `owner-decisions.md`; the amendment has landed in `REQ-SESSION-197` (which
> carries the whole exception) and `REQ-SESSION-201` (which carries a pointer, because a contract has
> exactly one home). **Five conditions bind it and it is unavailable unless every one holds:** only inside
> the restore action, with the requirement naming the paths that do *not* gain it — opening or preparing a
> workspace, `REQ-SESSION-060`'s explicit repair, a migration, an update, a later convenience; explicit
> confirmation naming **both** identifiers and stating that this workspace's own sessions become
> unreachable from it, never automatic, never the default or pre-selected, with report-and-do-nothing kept
> as a correct outcome; the **absent**-identifier case unchanged and explicitly *not* this exception; a
> present-but-**unreadable** identifier still reported and never overwritten; and the displaced store
> **moved aside and kept**, never deleted, with the confirmation saying where it went. ADR-0058 adds that
> the operation is reversible by hand and says so in the confirmation, which is what makes a
> one-way-looking action safe to confirm.
>
> **What it does NOT settle, stated because the shapes are similar enough to be confused.** A user who
> **copies** a workspace folder and wants the copy to have an identity of its own still has no product
> action — **OQ-47 stays open on that side**, and ADR-0058 says so explicitly rather than letting the
> ruling read as covering it. **OQ-48 is more owed, not less**: the exception adds a third producer of
> orphaned stores, and the reclamation surface is now the only route *back* to a store a user may well
> want rather than only the route to clearing one they do not.
>
> *The reading question this entry flagged is answered by the amendment rather than by an ADR: the restore
> may write the identifier, on the conditions above and on no others.*

**The entry below is the statement of what was decided between, kept because a ruling is only legible
beside the options it chose from.**

**Where:** ADR-0058, ADR-0002; constraints W-19, W-24; OQ-47. **Source:** `REQ-SESSION-201` against
`REQ-SESSION-197`. **This is the one thing the backup pass could not settle inside the architecture,
because settling it means amending a requirement.**

ESC-19 was ruled so that a user can carry their history to another machine. `REQ-SESSION-201` builds
that: one artifact, the whole store, carrying "the workspace identifier it was taken from … so a backup
cannot be poured into the wrong workspace by accident". But `REQ-SESSION-197` forbids the identifier
changing "afterwards for any reason", forbids minting a replacement over one the product can read, and
states no user-confirmed exception — for a good reason, which the same requirement gives: overwriting one
"would silently orphan every session recorded under it".

**Follow the intended journey and it ends in a text editor.** A user's machine dies. On the new machine
they clone their repository — `.rotaris/` is kept out of version control by `REQ-CONFIG-013`, so no
identifier arrives. They open the workspace once, which is the natural first thing to do, and the product
mints a new identifier. *Then* they restore their backup. The artifact names identifier A; the open
workspace reads identifier B; `REQ-SESSION-197` says the product may not touch B. The sessions restore
into a store the open workspace will never resolve to, and the only remedy the product may offer is to
close the workspace, replace the identifier file by hand, and reopen. **This is the same dead end OQ-47
already records for a copied folder, reached from a second and much more likely direction** — and
reaching one dead end twice, from two independent routes, is evidence rather than coincidence.

Three options, and the architecture has taken the only part of the third that is unambiguously legal:

1. **Leave it.** `REQ-SESSION-200`'s disclosure at least means nobody is surprised. The cost is a
   recovery path people will get wrong, at the worst moment to get something wrong.
2. **Grant `REQ-SESSION-197` one narrow exception**, available only during a restore, only behind an
   explicit user confirmation that names what is being detached, and never automatic. This weakens the
   protection ESC-19's own comparative evidence identifies as this record's single best decision — the
   filed, painful, path-keyed history-loss bug three surveyed products have and this one does not — so it
   should not be granted casually.
3. **Allow a restore to establish an identifier only where the workspace has never been prepared.** This
   fixes the *clone-then-restore-before-first-open* order and leaves the common order broken.

ADR-0058 implements the part of (3) that no requirement forbids: where `.rotaris/` carries **no**
identifier file at all, the restore establishes it from the artifact by exclusive create, arguing that
nothing is replaced and the value established is the one the restored sessions were recorded under.
It is guarded twice — a file that is present but unreadable is **not** this case, because
`REQ-SESSION-197` requires that reported rather than overwritten, and the write is an exclusive create so
a racing file wins. It refuses to invent the rest, and records the residue undressed.

*One reading question rides on this and ADR-0058 flags it rather than burying it:* `REQ-SESSION-201`'s
"It MUST NOT reach outside that store" sits in the backup paragraph, and the restore's obligations are
stated separately in the same requirement with none of them forbidding an identifier write. ADR-0058
takes the narrow reading. **If the owner reads it the other way, the legal case above collapses into the
manual remedy and this escalation gets worse rather than better.**

### ESC-27 to ESC-31 — five product decisions the defect-correction round raised rather than took *(raised 2026-09-02; **ALL FIVE RULED AND APPLIED 2026-09-02**)*

> ***"All five OPEN and none ruled" is WITHDRAWN and must not be cited.*** All five were ruled on the day
> they were raised, together with ESC-22 and ESC-24, and all five have landed in requirements. **ESC-27:**
> `0600`, applied **explicitly on every write** by `REQ-CONFIG-216`, with `REQ-CONFIG-444`'s platform-default
> fallback denied to this one file by name and no write at all where the protection cannot be applied —
> **OQ-14 closes with it**. **ESC-28 and ESC-29:** *report and carry on*, owned by `REQ-CONFIG-183`, which
> reports and ignores a key this specification defined and withdrew and a key it names as not a
> configuration key of this domain, loads every other key as though they were absent, opens the workspace,
> and restates the hard load failure for a genuinely unknown key as **unweakened** with the carve-out
> bounded to exactly those two kinds. The second half of ESC-28 — a confirmed one-click removal — was **not**
> taken, because it would need the no-repair rule narrowed and nobody ruled that. **ESC-30:** *make them
> distinguishable* — `REQ-LIBRARY-047` records, inside its own all-or-nothing operation, that a version was
> **due**, so one the best-effort write then failed to record is afterwards known to be absent and countable;
> `REQ-LIBRARY-176` carries **two separate figures** per artifact, each identified as which it is and each
> stated as zero rather than omitted; and both exports are forbidden from carrying an absence figure in a
> shape shared with the other. **ESC-31:** *in the entry* — `REQ-TOOLS-079` makes the identifier a field of
> the entry and names it in the field set, because `REQ-EVENTS-056` requires the locator to resolve **through
> the export**, on a machine carrying none of this product's code. ***That discharges the one architecture
> consequence this group had***: ADR-0024's choice is no longer permitted-and-unblessed. What the ruling did
> **not** settle is the field's *token*, which would have been a decision the ruling did not make;
> `REQ-TOOLS-079` fixes the property instead. **The entries below are kept as the statement of what was
> decided between.**

**These are not architecture's and were not architecture's to raise.** The defect-correction round of
2026-09-02 corrected ten specification defects this record reported and, in five places, found that
closing the defect required deciding something a user would see. It recorded the decision rather than
taking it. **They are stated in full in
`docs/clean-room/specification-gate.md` *(removed 2026-10-26)*, which is canonical for
them; they were listed here so this register's count of open escalations stayed honest.**

- **ESC-27 — `secrets.yaml` has no file mode.** `REQ-CONFIG-216` fixes the write as atomic and
  directory-creating and states no mode, so the one configuration file that holds credentials by design
  inherits the process mask. `0600` plus the explicit access-control list treats it by what it holds;
  `0644` treats it by what it is, matching every other configuration file. Constraint **D-26** and
  **OQ-14** are the same fact from two directions and neither closes without this ruling.
- **ESC-28 — should the product do more than tell a user about a withdrawn configuration key?**
  `REQ-CONFIG-478` fixes the honest minimum. Opening the offending file for editing from the failure
  report, or a confirmed one-click removal, are further options; the second sits against the rule that the
  product does not repair a user's configuration and would need that rule narrowed explicitly.
- **ESC-29 — a withdrawn key in the *global* scope stops every workspace opening**, and no in-product
  surface is reachable from that state, including the settings screen that would edit the global file.
  Worth ruling with ESC-28.
- **ESC-30 — a version missing because it was never recorded is not distinguishable from one retention
  pruned.** This is **OQ-45**'s product half, escalated. `REQ-LIBRARY-047` makes recording a version
  best-effort and outside the write's all-or-nothing boundary; `REQ-LIBRARY-052` now obliges the store to
  say how many pruning dropped and `REQ-LIBRARY-176` forbids the export implying that figure accounts for
  every absence. Whether the export must tell the two causes apart is the owner's, and a conformant export
  can be built today under either ruling and widened later without rework.
- **ESC-31 — where the permission-audit entry's identifier lives.** `REQ-EVENTS-056` fixes the locator's
  form and its record-kind token; `REQ-TOOLS-079` is obliged to give an audit entry an identifier.
  Whether that identifier is a further **field** of the entry or travels **beside** it is deliberately
  left open, and the two are observably different in the exported audit file. **ADR-0024's choice that
  the identifier is the export ordinal is permitted and unblessed until this is ruled**, and whichever is
  chosen, `REQ-TOOLS-079`'s no-argument-values property must survive untouched: it is what makes the audit
  exportable at all.

---
