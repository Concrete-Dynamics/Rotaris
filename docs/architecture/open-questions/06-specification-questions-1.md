# Open questions — Specification questions (1 of 27)

Part 6 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds no live entry; OQ-3, OQ-11, OQ-26, OQ-27, OQ-1, OQ-5, OQ-38, OQ-21 – OQ-23, OQ-28, OQ-36 archived in [the archive](../../archive/architecture/open-questions/06-specification-questions-1.md).

## Specification questions

### Resolved, and closed with the reason

Four entries are answered here, and a fifth — **OQ-28** — was resolved on 2026-09-02 and is closed in
place among the ADR-specific entries below, because the argument that closed it is long and belongs
beside the measurement it rests on. They keep their numbers and stay in the register because ADRs cite
them, and each says what closed it, so a reader who finds the citation is not left guessing. **Nothing is
listed as closed that the record did not actually settle** — three further questions the rulings expected
to close did not, and they are still open below with their residues stated (OQ-12, OQ-19, OQ-41).

***A sixth entry closed on 2026-09-02: OQ-49, closed by amendment rather than by argument.***
`REQ-STARTUP-163` now owns what makes two directory strings the same directory — what is resolved, what is
deliberately not reconciled, and the bounded cost of not reconciling it — with two additions ADR-0002 did
not state: a trailing separator carries no meaning, and abbreviated alternate spellings the filesystem
itself resolves are resolved. It states explicitly that it is **not** the definition of workspace identity,
which is `REQ-SESSION-197`'s and is never derived from a path. **Constraint W-25 moves from a ruling to a
requirement citation and ADR-0002 should now cite rather than decide.** The store side of the same hazard
is *not* closed by that requirement and is now a rule of its own — see constraint **W-27** and the entry
immediately below.

***One question a spike raised is answered rather than filed, and it is recorded here in the closed form
so the spike's own request for an entry is not silently ignored.*** `spikes/remote-and-synchronised-storage.md`
section 11 item 14 asked: **where does a first-statement store failure after a successful open belong?**
`REQ-EVENTS-084` governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a
run; the measured case — a store that opens cleanly, reports and reads back its journal mode, owns its
shared-memory companion at the expected size, and throws on the very next statement — belonged to neither,
**30 times out of 30 on a mapped network drive**. It is **minted and closed in the specification rather
than left open here**: `REQ-EVENTS-179` requires the store to be *exercised* rather than merely opened,
by a write made and then undone, before the run starts; it resolves its own failure into `REQ-EVENTS-084`
and refuses on exactly that requirement's terms; `REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the
boundary sentence that routes to it; and `REQ-SESSION-089` gained the matching clause on the run-lifecycle
side. **What is NOT closed and is listed under the spikes below is the cost of the probe itself**, which
has not been measured on the startup path. Constraints **W-04**, **W-08** and **E-05** carry it.

- OQ-3 — Is a second application instance on one workspace a supported configuration? Resolved: no; resolved; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-3)
- OQ-11 — Two incompatible Windows retry schedules. Resolved — and the reason previously recorded here was wrong. Rewritten rather than deleted, …; resolved; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-11)
- OQ-26 — Ordering between the delivery state write and the audit append. Resolved; resolved; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-26)
- OQ-27 — Delivery record file granularity. Resolved by dissolution; resolved; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-27)

### Named against a specific ADR

***No question in this group blocks an ADR from ratification any more.*** OQ-28 was the last one, and
ESC-13 unblocked it by ruling the trade instead of leaving the record to pay it. The heading is kept
because ADRs cite it, and each entry still names the record it decides something for; what it no longer
means is that the named record cannot be ratified until the question is answered. **Ratification is now
blocked by the gate items in `docs/clean-room/specification-gate.md` and by the escalations above, not by
anything in this list.**

- OQ-1 — Decision closed, 2026-09-07; closed 2026-09-07; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-1)
- OQ-5 — Decision closed, 2026-09-11; closed 2026-09-11; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-5)
- OQ-38 — Decision closed, 2026-09-11, and the ruling narrowed the reading it ratified; closed 2026-09-11; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-38)
- OQ-21 — Per-token prices: floating point in the format, exact decimal in the arithmetic; ruled; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-21)
- OQ-22 — Does a spawned stdio child inherit the parent process environment?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-22)
- OQ-23 — What the reserved-token branch must do; resolved 2026-09-06; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-23)
- OQ-28 — What the two structural counts mean for a document-model interface; resolved 2026-09-02; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-28)
- OQ-36 — CLOSED by accepted review, applied 2026-09-07; closed 2026-09-07; [archived](../../archive/architecture/open-questions/06-specification-questions-1.md#oq-36)

### Silence and under-determination
