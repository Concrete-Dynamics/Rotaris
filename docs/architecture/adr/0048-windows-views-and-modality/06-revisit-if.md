# ADR-0048 — Windows, views and the three modality levels — Revisit if

Part 6 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Revisit if

Renderer memory becomes the constraint that breaks the benchmark's memory tripwire or a practical
machine budget — the first thing to give would be keeping hidden persona windows alive, which trades
"reopening is instantaneous" for footprint and would need a requirement change rather than an
implementation change.

**Third execution — 2026-09-05, the startup view drawn (Part M).** `overview` is the first primary view mounted by
name beyond Workspace and Settings: the header (REQ-MONITOR-164), the resizable two-column body (165), the four metric
cards, the sessions card as a run switcher (171), and the right column's four tiles in REQ-MONITOR-173's order — the
credit tile and the limits card in their empty states (no hosted account, no usage figures exist in this build), the
agent-tree card on the SAME `AgentTree` component the Workspace sidebar uses (REQ-MONITOR-038), the proposals card
empty (no Library yet). "List sessions" opens the existing browser; "New session" follows nothing and opens the
Workspace composer, refused with REQ-SHELL-125's sentence while a run is active — that requirement's dialog (worktree
and sandbox choices) is owed with the Git view. **Found:** the start-time read (ADR-0055 note).

**First execution of the window registry — 2026-09-05, the agent surfaces (Part R).** *Recorded under GD-10.*

**Built and run:** `apps/desktop/src/main/windows.ts` — the registry of persona windows per main window (REQ-SHELL-072:
one per persona, `Rotaris · {persona}`, 820×620, reused for a second instance of the same persona with the tab
selected); a user close **hides** (the `close` event intercepted, `hide()`; REQ-SHELL-076, REQ-MONITOR-073); every persona
window destroyed when the main window closes and when a new session starts (REQ-SHELL-078) — and, a reading taken here,
when a **different stored session is loaded**, because the windows were opened onto the previous session's agents and
would otherwise keep showing them. A persona window is alternative B's full renderer of the one bundle (`role=persona`),
attached to the relay like the main window; its `window.personaPayload` asks main for its persona, the followed session
and the instance to select. The Mission view (REQ-SHELL-023's third) is mounted by name like Overview and Git — only while
shown, so a hidden Mission runs no timer and refreshes nothing (REQ-MONITOR-039/275); the inspector lives in the
Workspace view and below 1180 px becomes an overlay drawer exclusive with the agents drawer (REQ-MONITOR-051).

**The raise as a request (REQ-SHELL-161), read on Windows:** the registry calls `restore()` when minimized, `show()` when
hidden, else `focus()` — once each, nothing retried, nothing reported, no compensating focus. Electron's `focus()` on Windows
while another application holds the foreground ends as the platform's own attention hint (a taskbar flash) rather than a
foreground switch; that is the declined raise the requirement names as supported, and the window is then shown, not
minimized, not hidden, carrying the content the request produced. The proof drove the windows from the main window's own
gestures, where the raise is granted; a declined raise was not induced.

**Visibility as the signal (ADR-0048's zero-work rule):** the persona renderer takes the platform's `visibilitychange` —
on hide it unsubscribes from the session and its coalescer stops (nothing arrives, nothing rebuilds); on show it re-reads
its payload, subscribes (the relay first, then the attach whose whole-session update is the first state painted) and
selects the instance main asked for. Refreshes coalesce at 120 ms (REQ-SHELL-076): the replica's changes reach React
through one trailing timer per interval. **Measured** (`pnpm mission-proof`, `.mission-proof/results.json`): a persona
window's first painted whole-session update after `show()` — 292–307 ms when the window was created for the request
(load, boot, subscribe, snapshot, paint), 468–644 ms when a hidden window was shown again (the re-subscribe's attach round
trip, the snapshot, the 120 ms coalescer, the paint); the retained window itself appears at once with the content it held.
"Reopening is instantaneous" holds for the window; the fresh state follows within the figure above.

**Open by preference (REQ-MONITOR-072, REQ-SHELL-073):** `interface/agentPopOut` (since 2026-10-14 the registered `interface/agentPopout`, REQ-CONFIG-405, the old key carried over
once; default off, the preference store, a
toggle in Settings → Interface). Off: a click or Open selects the agent in the Workspace inspector, pinned; on: a pointer
click on any tree row or table row opens or raises the window (a keyboard move selects only — a reading: arrow keys
through the tree would otherwise raise a window per step). Explicit Pop out always opens it; the inspector's Steer opens it
with the steer card focused (REQ-MONITOR-137, REQ-SHELL-073) and that card's Send steer submits the control. An unknown
agent id is a silent no-op read as: the renderer sends `window.openPersona` only for an id its replica holds, and main
declines silently when no session is followed.

**Not built, said so (Part R; superseded by the note below):** application-modality across windows — the registry
disabling input routing in every other window of the family — because no application-modal surface existed yet (no
palette, no keyboard help); the registry holds the family so it has a place to land. **Built 2026-09-06 in Part W**,
when the palette became that surface. The persona window's terminal-preview parity (REQ-SHELL-075 b) is owed with ADR-0021.
Artifact links are empty (no artifact store). *The reason was stale when written: the store existed since Part Y; the
inspector did not link into it.* **Built 2026-09-29** (live-run finding K1, [R-067](../../../product/requests.md#r-067)):
`SessionRecord.artifacts` carries the session's artifacts not superseded, the inspector and the persona window draw an
agent's produced and received links, and what a link opens is a reading (OQ-125). The MCP heading per server in the inspector and the window's per-server
lines are slots (`data-slot="mcp"`) the merge fills from Part S's fields.

**Found:** nothing in the registry or the windows themselves. The two defects this part found were in the publication
path (ADR-0043's note): the subscribe command bound every subscription to the main window, and the record was published
on a save only.
