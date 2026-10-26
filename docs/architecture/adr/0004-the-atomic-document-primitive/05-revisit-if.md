# ADR-0004 — One document primitive, three write shapes, and a guarded read side — Revisit if

Part 5 of 5 of [ADR-0004](../0004-the-atomic-document-primitive.md), which indexes every part.

## Revisit if

The runtime, or a native binding this product already carries, exposes the platform's file-replacement call
— measured to replace a target this process holds open while a held reader continues to see the complete
previous contents. That single capability would remove rule 1 and the ladder together, and it is the correct
trigger; the previous version's trigger, a runtime API exposing share-delete on open, **is already the case
and would change nothing**. Or a power-loss test establishes what a directory `fsync` guarantees on this
platform, which would settle OQ-12 and may add one call to the replace path. Or the specification supplies
the bounded Windows ladder `REQ-TRACE-061` needs, in which case the policy table's ladder field gets its
second value and OQ-44 closes. Or a requirement appears under which a remaining store file may legitimately
be empty and must be read as empty without a retry.

On the trim boundary specifically: **this record now takes no position of its own**, and reopening it is
ADR-0009's and ADR-0024's. It would reopen if `REQ-EVENTS-091`'s tolerated failed trim were amended away, at
which point the event history's trim could move inside the append's transaction and the two stores would
converge — or if `REQ-SESSION-133`'s "same durable operation" clause were withdrawn, at which point they
would converge the other way. Either amendment, and not an argument, is what changes it.

**The measurement this record did not have, reported.** *(The previous version read: "Nothing has measured
the replace path's cost against a destination the product does not own … A second measurement pass is in
flight as this is written and its results are not in hand; if it reports a replace failure rate at such a
destination that a bounded ladder would fix, the ladder field gets a value there too." It has reported, and
it does.)* On a network share the replace fails on **37 of 600 first attempts with no other opener present**,
against **0 of 300** locally, and a bounded ladder fixed every one of them within two extra attempts. **The
antecedent of that clause is satisfied**: the ladder field should get a value for every target that can
land on a share, which is the workspace documents, the traceability artifacts and the export destination —
and per the paragraph above, this record still will not invent the constants. **This is now a specification
question that has been asked and answered by measurement on one side and is unanswered on the other**, on
the same footing as OQ-44 and with more urgency than OQ-44 currently carries.

**What remains unmeasured, so the gap is not mistaken for closed.** Removable media, a directory the user
has open in another application, and a real file-synchronisation client's tree were all named in
consequence 9 and none was tested — the spike declined to write into the machine's live sync roots because
they hold the user's own material. Exclusive create against a *dehydrated* placeholder inside such a tree
is specifically flagged as a code path nobody has exercised, and that is the one that bears on shape 2's
two identity guarantees. And every remote figure came from one SMB client talking to a server on the same
machine: no latency, no packet loss, no reconnection. The 12 ms p50 is a floor and the 6.2 % is not
necessarily one.
