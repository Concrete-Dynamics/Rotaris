# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Unresolved conflict between slices

Part 4 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## Unresolved conflict between slices

**UI placed the projection owner and the queued-prompt service in the main process; this record places
both in the run host.**

- **UI's position:** main is the application process, so `REQ-NOTIFY-025`'s and `REQ-CHAT-041`'s
  "the process" is main, and building the projection there from persisted state keeps
  persist-before-publish trivially true.
- **Adopted position:** `REQ-MONITOR-218` forbids any delay floor on an unseen row and `REQ-SESSION-071`
  forbids following a run by re-reading state on a timer, with no exception anywhere in the product, so
  a projection built in main from persisted state alone cannot meet the contract; it would need the run
  host to push to it anyway, at which point main is a relay. And `REQ-EVENTS-098` keeps the writing of a
  live session in the lock holder. The notice store is the one piece that genuinely belongs in main, and
  it stays there.

*One of UI's arguments got stronger under SR-4 and still does not carry.* Its "keeps
persist-before-publish trivially true" was true of a design that could not have met
`REQ-MONITOR-218`, because the anchor was a debounced whole-document save. With rows committed
individually the anchor is cheap, so a main-side projection would no longer be *slow* — but it would
still be learning about the change by reading back what another process wrote, which is what
`REQ-SESSION-071` forbids as a way of following a run, and it would still put a store reader in the
process that must answer a gesture in 100 ms. The objection was never only about cost.

The queued prompt queue is the sharper half. `REQ-CHAT-041` scopes visibility and consumption to windows
and runs "sharing the same process", and `REQ-CHAT-038` requires an **atomic queued-to-triggered
transition exactly one caller wins**. Placing the service in the run host makes the consuming side
in-process and the atomicity local; placing it in main makes the window side local and the consumption
cross-process. **Recommendation: the run host**, because `REQ-MONITOR-139` and `REQ-ORCH-071` make the
queue session-owned and a run may consume only its own session's prompts — and under SR-1, with several
main windows able to show one session, "the window side" is not a single place anyway. **This must be
confirmed**, because it decides whether `REQ-CHAT-041`'s phrase is satisfied or merely not violated.
See OQ-1.
