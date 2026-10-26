# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Revisit if

Part 9 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Revisit if

**The bundle grows enough that the preparing run stops being comfortable.** The steady-state figure is
nearly insensitive to payload weight; the exempt preparing run is not — it was 1.6–2.1 s on sixteen
threads and 3.8–3.9 s on one, at the measured bundle weight. Nothing this record sequences is involved,
but consequence 9's instrumentation is how it would be noticed, and the question would go to ADR-0054's
archive rather than to the paint sequence.

**Any of the three observations fails for *our own* record on macOS or Linux.** The rule that moved the
claim does not have a second destination: alternative II is refused on measurement and alternative III is
withdrawn by SR-1. A failure there is therefore not a choice between recorded alternatives, and it
returns to the owner as a new escalation.

**The hand-over endpoint cannot be made to satisfy the acknowledgement rule on some platform** — that the
acknowledgement follows the surfacing rather than the receipt. That rule is what keeps `REQ-STARTUP-164`'s
closing guarantee true, and it is the one part of the design with no measurement anywhere behind it.

**Or `REQ-STARTUP-166`'s determination turns out to cost enough that it competes with the rest of
post-show activation**, in which case it needs its own place in the pipeline rather than a position in a
list.

**Or the store open proves slow enough to matter after the show.** It is off the critical path by
construction, so it cannot delay first paint — but the post-show pipeline is also where the window becomes
useful, and a `quick_check` on a large store is bounded rather than fast. Nothing measures it today. If it
does compete, the ordering above is what changes, not the placement.
