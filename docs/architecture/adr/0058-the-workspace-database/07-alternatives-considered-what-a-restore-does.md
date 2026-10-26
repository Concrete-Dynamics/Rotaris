# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — what a restore does about the identifier

Part 7 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Alternatives considered — what a restore does about the identifier

Also new with ESC-19, and the sharp edge of it. `REQ-SESSION-201` fixes that the artifact carries the
workspace identifier it was taken from and that "a restore into a store belonging to a different
identifier MUST be reported as what it is rather than performed silently". What it does not fix is what
the restore does when the *workspace* in front of the user carries a different identifier, or none.

**X — Restore into the store of whichever workspace is open, ignoring what the artifact says.** Refused.
It is precisely the "poured into the wrong workspace by accident" outcome the requirement exists to
prevent, and it destroys in two directions at once: the open workspace's history is overwritten by an
unrelated one, and the artifact's own workspace is left as empty as it was.

**Y — Restore, and write the artifact's identifier over the identifier the open workspace carries.**
*Refused when this record was written, on the grounds that `REQ-SESSION-197` forbids the identifier
changing "for any reason", forbids minting a replacement over one the product can read, and names the harm
— silently orphaning every session recorded under the old value. The refusal was recorded with the note
that it "would make disaster recovery frictionless" and that its cost was paid by the user.* **ESC-26 has
since ruled, and the escalation this record raised is answered: `REQ-SESSION-197` gains one narrow
exception and Y is adopted in a confirmed form only.** The unconditional shape of Y — the product doing
this because it is convenient, or by default, or anywhere but inside a restore — remains refused and is
refused in the ruling's own terms. What is adopted is **Y′**, below.

**Y′ — Restore, and establish the artifact's identifier over the workspace's, only on explicit
confirmation.** Chosen for case (c), per ESC-26. The exception exists **only inside the restore action**;
it is never automatic and never a default; it names both identifier values and states what becomes
unreachable; the absent-identifier case is unchanged and is not an exception at all; a present-but-
**unreadable** identifier is still reported and never overwritten; and the displaced store is kept. ESC-26
draws it this narrowly because the absolute rule is this record's best-evidenced decision — three surveyed
products carry the filed history-loss bug `REQ-SESSION-197` prevents — so the protection is kept
everywhere it earns its place and the recovery path is paid for only where a user has asked for it in as
many words.

**Z — The restore is keyed by the identifier the artifact carries, and it never writes over an identifier
it can read.** Chosen.

**AA — Restore, and rewrite the *artifact's* identifier to the open workspace's, adopting the history.**
Refused, and it is worse than Y rather than safer. It makes a workspace's recorded history one it never
produced, which the product can never afterwards distinguish from history it did produce, and it lets one
identifier name two unrelated histories on two machines — breaking the one property `REQ-SESSION-197`
exists to give. `REQ-SESSION-201` makes the artifact name its workspace so this cannot happen by
accident; doing it on purpose is not an improvement on doing it by accident.
