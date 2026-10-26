# ADR-0008 — One ordered session writer per session, owning the session's transactions — Revisit if

Part 5 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## Revisit if

Measurement shows per-change commits dominating the run host's loop at the concurrency `REQ-GIT-145`
permits. The lever is then widening **one** transaction to cover a burst of rows raised inside one
iteration — never delaying a commit that ADR-0010's publish rule anchors on, which would reinstate a
delay floor `REQ-MONITOR-218` forbids, and never reintroducing a window, which `REQ-SESSION-067`
forecloses. Or the save-request *rate* rather than the commit cost proves to be the expense, in which
case the lever is the call sites that request saves and not a mechanism in this writer. Or
`REQ-SESSION-028`'s per-save summary rebuild is measured to be the dominant cost of a save, in which
case consequence 5 becomes a specification question.
