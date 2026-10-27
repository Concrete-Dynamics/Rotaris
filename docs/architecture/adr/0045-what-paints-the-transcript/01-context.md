# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — Context

Part 1 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## Context

`REQ-CHAT-055`, `REQ-CHAT-154` and `REQ-CHAT-157`: paint and measure cost depends on **visible rows and
changed rows, never on total rows**. At a thousand rows or more, scrolling, expanding and searching each
stay inside the 200 ms budget, and appending costs no more than on an empty transcript.

`REQ-CHAT-165` and `REQ-SESSION-192`: bounded residency with **on-demand paging** — scrolling toward the
top loads the next older span, places it above, leaves the reader's position undisturbed and every
expansion state as set; loading happens off the interface thread; the oldest recorded row is
distinguishable from a failed load; a re-loaded row is *identical* to the row released.

`REQ-CHAT-058`: **two bounded caches with least-recently-used eviction** — retained row *measurements*
and retained row *renderings*. A rendering is reused only while **identity, content, laid-out width and
expansion state** are all unchanged. Live rows are redrawn every repaint and never reused. A theme
switch redraws every row and preserves every expansion state. `REQ-UIBENCH-063` and `REQ-UIBENCH-086`
give the rendered-body cache an **observable capacity**: 256 entries and two million characters, where
characters count the *source* text an item was rendered from, and hit and miss counts are running totals
over the life of the process.

`REQ-CHAT-059`: expansion state is keyed by **stable identity, not position**. `REQ-CHAT-053` and
`REQ-CHAT-071`: scroll preservation is **by anchor, never by stored pixel offset** — record the identity
and viewport offset of the top visible row and restore it after geometry settles; append, truncate,
in-place replacement and last-row extension must each preserve scroll position and expansion state
without a reset. `REQ-CHAT-057` fixes row layout metrics normatively, in pixels.

`REQ-CHAT-056`, `REQ-CHAT-075` and `REQ-CHAT-076`: Markdown rendering must be **synchronous**, must issue
**no network request**, and text selection must select exactly the characters the pointer covers **in
every row category, including rendered-Markdown bodies**. `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`: full keyboard navigation, per-row accessible names, and hover styling.

**`REQ-UIBENCH-054`, `REQ-UIBENCH-085` and `REQ-UIBENCH-050` are the hard part.** The count of live
paintable visual elements must be **invariant after window construction**: the window-construction phase
is "the only phase allowed to change the number of interface elements alive in the process: from the
moment this phase's record is taken until the iteration ends, the `widgets` value must not change". Six
later phases — a bulk apply, per-event appends, simulated streaming, a thousand tail replacements, an
idempotent re-apply, and a resize sweep — must all leave it unchanged. `widgets` is defined as "live
visual elements of the constructed window — those that occupy space in the window's layout and can be
painted". `ui_objects` — every live interface-framework object owned by the window, visual or not, never
smaller than `widgets` — is reported in every record but is **informational only**: no invariant reads
it and no value it takes changes any outcome.

`REQ-UIBENCH-051` and `REQ-UIBENCH-119`: each phase's timings cover its work **up to the point at which
the interface has finished showing that work's effect**, bounded at 30 s per settle. The architecture
must therefore expose an observable "the interface has finished showing this" signal.
