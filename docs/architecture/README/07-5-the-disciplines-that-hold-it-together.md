# Rotaris-crw — system architecture — 5. The disciplines that hold it together

Part 7 of 13 of [the architecture README](../README.md), which indexes every part.

## 5. The disciplines that hold it together

Eight rules recur across the whole record. Each exists because a requirement made it observable, or
because a measurement showed the alternative fails.

**One definition, cited everywhere else.** The child state machine, the tool capability table, the
redaction algorithm, the liveness predicate, the artifact naming scheme, the key encoding table, the
status normalisation — each has exactly one implementation, and a second is a defect rather than a
duplication.

**One predicate, even where the media differ.** The product holds **one** liveness verdict over **two**
lock media — a row for `REQ-SESSION-046` and a file for `REQ-GIT-128` — because `REQ-SESSION-171` and
`REQ-GIT-093` both demand one answer about one pid at one moment, and the media differ deliberately.
This is the rule most likely to be broken by a well-meaning tidy-up.

**Direction is part of the query.** A tool outside the registry has no capability declaration, and is read
fail-closed **in the direction of the reading rule**: a rule that grants sees nothing declared, a rule
that withholds sees everything declared. One accessor cannot serve both, so there are two.

**Fail closed, and never by timeout — and the mechanism this rule named for one case does not exist.** The
permission gate fails closed on any exception; approvals suspended at quit resolve as denied; liveness
resolves toward alive, so a session that might be running is never reaped. **The clause that said "a lost
channel to main makes every session unattended, reached without a timer" was measured and is withdrawn as
the account of a dead main.** The run host does not outlive main: across six runs it was gone within
**207–341 ms** of main's death and **never observed the channel close at all** — in the one run that got a
sample in, main's pid was already gone while the channel still reported itself open. **The conclusion
survives — nothing hangs — but it survives because nothing is left to hang**, not because a revocation
ran. The run, its pending-approval map and its host cease to exist together. The revocation that operates
in every case a run host can actually reach is the **gap-based lapse** above, and the channel-close branch
is kept only for a main that closes its end deliberately and for a differently-hosted run host that would
outlive main — neither of which is the case the record used to cite it for.

**One consequence of that reaches well past approvals and is flagged here because it belongs to no single
record.** Nothing that must happen *on the way down* can be placed in the run host: settling pending
approvals, flushing a session, writing a terminal timeline entry are all unreachable after main dies, and
what is durable is exactly what had already committed. ADR-0014 owns cancellation, teardown and quit and
has not been swept against this.

**Persist before publish, durable before wire.** Nothing reaches a view before **the transaction that
recorded it has committed**, and for an enumerated set of pairs nothing reaches the wire before its
durable record. **A transaction makes several of these guarantees cheap; it does not excuse stating
them.** Isolation is not sequence: emission order, ordinal assignment, the serialised per-session writer
and the publish sequencing are all still owned, still stated, and still tested. Two of the record's
cross-artifact orderings are not covered by any transaction at all, because one side of each is a Git ref
— and `REQ-GIT-049` settles their direction.

**Time is injected.** Every duration is measured against a monotonic clock and must be demonstrable with a
controlled clock; no conformance claim may depend on real provider latency. Two clock ports — monotonic
for budgets, wall for the three timestamp conventions that coexist deliberately — and a `Budget` value
type carrying the composition rules. No bare timer appears in engine code. **And no cross-process interval
is asserted without calibration**, because `performance.timeOrigin` is not a shared epoch.

**Structure over discipline.** Where a requirement demands a property, the record prefers a shape that
makes it true rather than a convention that keeps it true: a branded type for redacted strings, distinct
reader and writer handles for the delivery store, a typed key registry that will not compile for an
unregistered preference, a store-level trigger that refuses an `UPDATE` on an append-only table, an
assertion the application checks at start-up before it will run.

**Measure the thing the requirement bounds, not the thing that is easy to measure.** Every one of the
seven spikes earned it. The end-to-end p95 passes `REQ-MONITOR-223` because a ~500 µs transport floor
dwarfs a store apply — so a regression in the apply stage would not show up at all, and the test that
would catch it measures the apply in isolation. Bundle weight was assumed to bound first paint and moves
it by about 10 ms; the packaging mechanism was assumed harmless and costs 13 s. A settle signal was chosen
for being "real rather than a proxy" and turned out to be absent exactly where the phase changes nothing
visible.

**The measurement round added a harder version of the same rule: the obvious test can return a clean
pass on a broken thing.** A store on a network path reports the log enabled, reads the setting back as
enabled, reports itself writable — and throws on the next statement, so **only a write detects it**. Two
writers on one file reached by two spellings lose 95 % of committed rows and the **integrity check passes**,
because the store is not corrupt, merely short. A naive copy of a live store fails 625 times in 627 under
load and **0 times in 40** at a realistic cadence, so the cheap experiment gives a false all-clear. A
preparation with one runtime library deleted passes a marker-and-entry-point check, launches, and **never
paints a window**. And a terminal save's readability — the property `REQ-SESSION-070` actually states —
passes at the *weaker* durability setting, which is why the stronger one had to be re-grounded rather than
defended on the clause it does not need. **In every case the failing configuration reports success**, which
is the shape of defect this discipline exists to catch, and in every case the correction is in the record
beside the argument it replaced.

**A mechanism's first execution reports back into the record that decided it — in place, and including when
it found nothing.** *Standing policy, ruled by the Architecture Gate on 2026-09-03 (decision 5). It was this
record's practice already; the gate made it a rule, because the practice's value arrives at exactly the
moment the record stops being read, which is the moment implementation begins.*

What that means concretely. The first person to build a mechanism this record decided writes what they found
into the ADR that decided it, beside the claim it bears on. **A falsified reason is kept next to its
replacement, not overwritten** — a record whose conclusions are right and whose reasons are false is a
record that gets "simplified" back into the defect by the next reader, and this record has watched that
nearly happen four times. **A clean first execution is also reported**, in one line, because "nobody
recorded a problem" and "somebody ran it and there was no problem" are different states and only one of
them is evidence. And **a defect found this way is not repaired quietly in the code that meets it**: the
code is the fix, the record is where the reason lives, and the reason is the only thing that stops the fix
being removed.

The cost is a paragraph per mechanism. The alternative is the four-for-four finding in section 6 continuing
to be discovered rather than known.

---
