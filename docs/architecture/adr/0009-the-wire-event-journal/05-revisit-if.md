# ADR-0009 — The event history as a table, with the line-delimited form as an export — Revisit if

Part 5 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

## Revisit if

The event catalogue stops being closed, or a requirement asks the history to carry state that is not
also durably recorded elsewhere — either would reopen alternative A. Or a requirement appears that puts
`REQ-EVENTS-166` back on the **write path** — that a third party must read the history *as it is being
written* rather than as an exported copy — which would reopen alternative B and would not be satisfiable
by any export.

**On the trim boundary, which is now settled rather than open:** it reopens only on an amendment, and only
on one of two. If `REQ-EVENTS-091`'s tolerated failed trim is amended away — or if `REQ-EVENTS-088`'s
sticky-failure rule is relaxed so that a rolled-back trim no longer ends the history — the argument above
loses its decisive step and the trim may move back inside the append's transaction, converging with
`REQ-SESSION-133`'s rings. If instead `REQ-SESSION-133`'s "same durable operation" clause is withdrawn, the
two converge the other way. **An argument does not reopen it; the requirements do.**

**On the measurements: one of the two has landed and one has not.**

**The commit figure is in hand and the trigger it guarded did not fire.** The escalation this section
anticipated — *"if the commit figure lands high enough that per-event durability threatens
`REQ-MONITOR-218`'s no-delay publish, that is a conflict between two requirements"* — is **closed on
evidence**. `REQ-MONITOR-218` forbids a minimum wait, debounce or delay floor; a commit is work rather
than a wait; and the whole persist-then-publish interval measured **p95 1.774 ms against
`REQ-MONITOR-222`'s 250 ms**, with zero of 20,000 publications exceeding it. `REQ-EVENTS-029` and
`REQ-MONITOR-218` do not conflict on this path and no escalation is raised.

**But the spike found a way to manufacture the floor `REQ-MONITOR-218` forbids, and it is not ours.** A
second process holding a write transaction turns this record's commit into a wait of exactly that
transaction's length — **205.4 ms measured for a 200 ms hold**, before the transport has done anything.
That is a floor a user would experience, imposed by another process, and what keeps `REQ-MONITOR-218` true
is ADR-0058 rule 4 rather than anything in this record. **Rule 4 is a conformance obligation with a number
attached, not hygiene.** If it is ever relaxed, this trigger reopens immediately.

**The delete figure is still not in hand.** The latency of a `cap ÷ 8` row delete on the writer's queue
(consequence 9) is what prices keeping the headroom, and the commit spike did not measure it — it measured
inserts and one narrow update, and states in terms that it modelled no trim of any kind. Unchanged: if that
figure lands high enough to sit on a budgeted path, the headroom is the tuning knob, since
`REQ-EVENTS-091` permits it rather than requiring it.

**And one figure nobody has asked for yet.** Consequence 2 records that this record's derived envelope
columns will need indexes the measured schema did not have, and that each index adds WAL frames per insert
— which moves both the commit cost and the checkpoint period of consequence 11. **`REQ-EVENTS-175`'s
100 ms filter budget and `REQ-EVENTS-029`'s per-event insert are one trade-off**, and it is unmeasured. If
the indexes needed for the filter axes move the append materially, that is a decision this record must
take rather than inherit.
