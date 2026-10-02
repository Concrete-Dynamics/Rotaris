# ADR-0048 — Windows, views and the three modality levels

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-05)
- **Depends on:** ADR-0002, ADR-0042, ADR-0043
- **Contains an open reading of a conflict between two requirements.**

## Context

`REQ-SHELL-017` to `REQ-SHELL-019` and `REQ-WORKSPACE-013`: a workspace switch **builds a new main
window first**, shows it, then closes the old one; if the old window vetoes its close the replacement is
discarded and nothing changes. Two main windows exist simultaneously during a switch.

`REQ-SHELL-072`, `REQ-SHELL-076`, `REQ-SHELL-078`, `REQ-SHELL-081`, `REQ-SHELL-111`, `REQ-SHELL-123`,
`REQ-SHELL-154` and `REQ-SHELL-167`: at most one persona window **per persona** — not per agent instance
— at a fixed initial size; exactly one terminal window per main window; one dialog per artifact. All are
owned by their main window and destroyed with it. **Closing a persona window hides rather than destroys
it**, so reopening is instantaneous.

`REQ-SHELL-151`, `REQ-SHELL-084`, `REQ-CHAT-063` and `REQ-WORKSPACE-150`: an off-screen surface performs
**zero repaints and runs zero repaint or refresh timers**, however fast changes arrive; when it becomes
visible its first painted frame already carries current state, within the 100 ms gesture budget, with no
visible catch-up redraw.

`REQ-SHELL-051`, `REQ-SHELL-054`, `REQ-SHELL-117`, `REQ-NOTIFY-266`, `REQ-NOTIFY-071` and
`REQ-WORKSPACE-106` require **three distinct modality levels** and they must be observably different:
**application-modal** (the command palette, the keyboard help), **window-modal** (worktree and
checkpoint progress, the message-limit confirmation), and **non-modal window-level** (the project-setup
consent dialog, the re-authentication prompt).

`REQ-SHELL-055`, `REQ-CHAT-002`, `REQ-CHAT-026` and `REQ-SHELL-168`: Escape resolution is layered and
fixed — a modal surface answers Escape *before* the window sees it; window-level Escape is live **only
on one view** and resolves a search panel then two drawers; the plan gate is answered by no dismissal at
all; every confirmation treats Escape as its declining answer, and a declining answer that would open an
external page performs the refusal alone.

`REQ-SHELL-161`, `REQ-SHELL-109` and `REQ-SHELL-110`: showing, raising and activating an auxiliary window
is a **request** to the host window manager; a declined raise is a supported outcome, **never retried or
reported, and must never be compensated for by taking focus**. No z-order between auxiliary windows is
required.

`REQ-SHELL-022`, `REQ-SHELL-059`, `REQ-SHELL-047`, `REQ-SHELL-061`, `REQ-SHELL-064` and `REQ-SHELL-065`:
the window refuses to resize below a stated minimum and opens at a stated size; at the minimum, every
control on **every one of the seven views** lies wholly inside the bounds, is reachable by keyboard, has
its label rendered in full with two named elision exceptions, and needs no horizontal scrolling.
`REQ-SHELL-071`: a view whose dividers declare no defaults still opens determinately, by **equal
division subject to minimums**, leftover logical pixels given one each to the leading panes in order,
tolerance one logical pixel per pane.

`REQ-SHELL-023`, `REQ-SHELL-152` and `REQ-SHELL-070`: switching tabs exchanges panes that are **already
built**, so no tab shows an intermediate blank state, and every registered divider in **every view —
including views not on screen** — participates in layout capture.

## Alternatives considered

**A — One window, everything else in-window.** Persona panes, the terminal and artifact details become
overlays or docked panels.

*For:* one renderer, one replica, one theme application, cheap; the zero-work-off-screen rule is easy
because a hidden panel is just a component that is not rendered.
*Against:* it contradicts the specification directly. Several requirements describe separate windows
with their own titles, their own initial sizes, their own accessibility sweeps and their own banners,
and one talks about a host window manager **declining a raise**. This is not a presentation detail that
can be reinterpreted.

**B — One window per top-level window, each a full renderer.** Chosen.

*For:* matches the window model exactly. Each window gets its own banner, its own acknowledgement stack
anchored to its own content area, its own accessibility tree. A crash in a persona window does not take
the main window with it. Hiding a window lets the platform's own occlusion handling stop painting, which
helps the zero-work rule.
*Against:* each window is a process, so memory cost is real — a persona window per persona plus a
terminal window is easily four or five renderers. Each holds its own replica and its own theme tokens.
**Application-modality has to be implemented by us**, because the platform's modal flag is window-modal
against a parent, not application-modal.

**C — The main window plus embedded views inside a lightweight frame window.** *Against:* the auxiliary
windows must be movable, resizable, independently titled operating-system windows; wrapping views in a
frame buys nothing over B and loses the per-window isolation.

## Decision

**Alternative B**, with these specifics.

- **A window registry in main** owns the mapping from a main window to its persona windows, terminal
  window and artifact dialogs, and enforces the uniqueness rules. It is also where the
  replacement-then-close switch is orchestrated, because the sequence spans two windows and a preference
  write and only main sees both.
- **Hide, do not destroy, for persona windows.** On hide, the renderer unsubscribes and cancels every
  timer; on show, it requests a snapshot and applies it before the first paint. Platform background
  throttling helps, **but throttling is not sufficient evidence** for the zero-timer rule, which demands
  that no repaint or refresh timer belonging to the surface is running. That is an explicit teardown,
  not a reliance on the platform.
- **Background throttling stays enabled for user-facing windows and is disabled for the benchmark
  iteration window** (ADR-0053), where a throttled timer would corrupt measurement.
- **Three modality levels, implemented differently:**
  - *Application-modal*: rendered in-window as an overlay **and registered with the window registry**,
    which disables input routing in every other window of that main window's family for the duration.
    The platform has no application-modal primitive, so this is ours to enforce; it is **observable** —
    a click on the persona window while the palette is open must do nothing — and therefore must be
    built rather than assumed.
  - *Window-modal*: an in-window overlay with a focus trap, blocking only its own window.
  - *Non-modal window-level*: an in-window panel that does not trap focus and leaves the rest
    navigable.
- **Native dialogs are used only where the specification names them** — the folder choosers and the
  quit-guard message boxes — so that the labelling obligations and the rendered-pixel contrast rule of
  ADR-0050 apply everywhere else.
- **All seven views stay mounted; only one is visible.** Required anyway by the no-blank-tab rule, by
  divider registration across views not on screen, and by ADR-0045's construction-time slot allocation.
  A hidden view must nonetheless perform zero repaint work and run no timers, so **visibility is a
  first-class signal passed down to every surface, not a styling property**.
- **Pane geometry is owned by a layout service** keyed as ADR-0042 requires, with the equal-division
  fallback implemented as a pure function so it is testable at both canonical window sizes.

## Open reading — native surfaces under a dark theme

`REQ-SHELL-160(b)` makes it an acceptance criterion that, on each supported platform and in each
built-in theme, **no native surface presents a light background while a dark theme is active**, and it
names native dialogs as things to be inspected on screen. `REQ-SHELL-164` says the product is answerable
only for what it supplies to a native dialog, and that a host whose native dialog falls short does not
put the product out of conformance. On most platforms the operating-system folder chooser follows the
**system** light/dark setting, not the application's theme, and no application-side call changes that.
Read literally, a dark theme on a light-mode host is non-conformant and the only remedy is to stop using
native choosers — which four requirements require us to use.

**Reading taken:** `REQ-SHELL-160(b)` covers surfaces the application itself tints — the engine's own
menus, caret, disabled text and form-control colour scheme, all of which the theme-source and
colour-scheme mechanisms of ADR-0050 do control — and `REQ-SHELL-164` carves out the host's own dialogs.
**This needs confirming rather than assuming** (OQ-29).

**First execution on Windows, 2026-09-04:** the built-app proof confirmed the reading for the product-owned
leg. Electron's native theme source follows each theme's dark flag before window creation; every document
advertises the matching colour scheme; themed window grounds, carets, form controls and disabled text followed
the active theme across all fifteen captures. The operating-system folder chooser remains governed by the
host's theme under the `REQ-SHELL-164` carve-out. Platform-specific confirmation continues with IC-3 for macOS
and Linux; `../spikes/theme-proof.md` holds the Windows evidence.

## Consequences accepted

1. Several renderer processes, with their memory cost; **application-modality is our code** and must be
   tested across windows; a visibility signal threaded through every surface.
2. Windows created and destroyed immediately must not deliver deferred offers, so **every deferred timer
   is owned by the window registry and cancelled on close** (ADR-0055).
3. The acknowledgement stack is per window and is not the notice store (ADR-0049).

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

**Open by preference (REQ-MONITOR-072, REQ-SHELL-073):** `interface/agentPopOut` (default off, the preference store, a
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
inspector did not link into it.* **Built 2026-09-29** (live-run finding K1, [R-067](../../product/requests.md#r-067)):
`SessionRecord.artifacts` carries the session's artifacts not superseded, the inspector and the persona window draw an
agent's produced and received links, and what a link opens is a reading (OQ-125). The MCP heading per server in the inspector and the window's per-server
lines are slots (`data-slot="mcp"`) the merge fills from Part S's fields.

**Found:** nothing in the registry or the windows themselves. The two defects this part found were in the publication
path (ADR-0043's note): the subscribe command bound every subscription to the main window, and the record was published
on a save only.

## Application modality — first executed 2026-09-06 (Part W)

*Recorded under GD-10.* The command palette and the keyboard help (`REQ-SHELL-051`, `REQ-SHELL-054`) are the product's
first application-modal surfaces, so the level this record decided but Part R could not exercise was built here: the
surface is an in-window overlay **and** registers itself with main's window registry over the new `window.modality`
command, which calls `PersonaWindows.setFamilyModal`. That disables every persona window of the main window's family
(`BrowserWindow.setEnabled(false)`) while the surface is open and restores them when it closes; a persona window created
while a surface is open is created disabled, and the main window's navigation, reload or renderer crash restores the
family, so a modal surface cannot outlive the renderer that opened it. Only the main window may send the command; a
persona window sending it is refused (`window.notMain`). The pause dialog, the approval dialog and the confirmations
stay window-modal, as this record says.

**How it was observed, and why the obvious way proves nothing.** This record says the level "is observable — a click on
the persona window while the palette is open must do nothing — and therefore must be built rather than assumed". The
proof's first attempt used `webContents.sendInputEvent`, and it is the wrong instrument: an injected event enters the
renderer **below** the host's input block, so it passes through a window the host has disabled and would have reported
success against a product that did nothing. `pnpm palette-proof` therefore delivers a real click and real keystrokes
through the operating system's own cursor and keyboard queue (`apps/desktop/scripts/os-input.ps1`, verification only)
and reads what the host says about the window. Measured: the persona window enabled before the palette opened, **not
enabled while it was open** — by the registry's own reading and by the host's `IsWindowEnabled` at the instant of the
click — enabled again after Escape closed it, and the window's rendered content identical before and after the blocked
click and the three keystrokes that followed it (`alpha` → `alpha`).

**A reading this forced, kept because it will mislead the next person.** A disabled window on Windows can still be
brought to the **foreground**: the host refuses the window's input, not its z-order. An assertion that the blocked
window is not foreground fails against a correct implementation, and the proof does not make it. What the reading turns
on is the host's enabled state at the moment of the input and the window's unchanged content.

**On Linux (2026-09-28, R-062) the host half is not measured, and the proof says so.** The driver is Win32's, and X11
has no per-window enabled state to report. Until then the proof spawned `powershell.exe` on every platform and went red
on `ENOENT`. Under Xvfb it now asserts the registry's reading: the persona window was enabled before the palette,
disabled while it was open, enabled after Escape, and main logged the modality pair. The host-input readings are stated
not applicable. **Not measured on Linux:** that a real X server click and real keystrokes are refused by the disabled
window. That needs an XTEST driver, which this harness does not have
([`palette-proof-reads-the-win32-host-input-on-every-platform.md`](../../defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md)).

**Found — one defect, in this part's own code, before any of the above could be measured.** Binding `Ctrl+L` and
`Ctrl+Return` through the registry made both wait two animation frames, so that the Workspace view would be mounted
before the caret moved. That is correct when the chord arrives from another view and wrong when it arrives from
Workspace, which is the ordinary case: the caret then arrived a frame after the keystroke that followed it, and text
typed immediately after `Ctrl+L` went to whatever held focus before. The product's own prompt seam is a user typing at
exactly that speed, and it stopped submitting — no run started in the modality launch, and the finding came from that
failure rather than from a review. `nowOrAfterMount` now does the work in the same turn where the surface is already
mounted and defers only where it is not (`REQ-CHAT-002`). The falsified reason is kept beside it: waiting for the mount
is right for the switch and wrong for the common case.

**Not built, said so.** Three entries of `REQ-SHELL-049` are absent from all three surfaces, each recorded in
`OMITTED_COMMANDS` with its reason rather than dropped: "Search transcript" (Ctrl+F — no transcript search panel),
"Open terminal" (Ctrl+Shift+T — no terminal window, owed with ADR-0021) and "Open demo window" (`REQ-SHELL-162` — no
demo mode), plus `REQ-CHAT-167`'s reasoning toggle, whose preference key is not registered. `REQ-SHELL-048`'s third
surface, the composer's slash catalogue, is the CHAT domain's and is not built; `slashName` and `slashDescription` are
this registry's normal form so that catalogue consumes this table rather than restating it. Window-level Escape
(`REQ-SHELL-055`) resolves in the specified order over the slots that exist: the compact drawers register a closer, and
the slash popup and the search panel register nothing because neither is built. The palette and the help are drawn in
the main window only; an auxiliary window offers neither. `REQ-SHELL-165`'s determinable case — presenting an action
with no chord where the product knows the host consumed it — is not built, because no host publishes its reservations;
the chord is shown and nothing is raised, which is that requirement's ordinary branch.

## Second execution — 2026-09-09 (Part AN), the slash popup's Escape slot and a dialog opened from the keyboard

*Recorded under GD-10; the proof is `pnpm slash-proof`.*

**The slot Part W left empty is filled.** The composer registers the slash popup's closer under `slashPopup` while the
popup shows and unregisters it when it hides, so window-level Escape (`REQ-SHELL-055`) dismisses the popup first,
then the search panel, then the drawers, in the order this record fixed. The popup itself never takes focus
(`REQ-CHAT-024`): the field's `aria-activedescendant` names the row, and the keys of `REQ-CHAT-026` are answered by
the field's own handler, whose `preventDefault` is what keeps the window handler from acting a second time.

**Defect fifty-eight — a command that opened a dialog took focus back from it.** `/pop` opens the stash dialog. The
composer, on an executed command, refocused its own field; the dialog mounted and focused its primary action between
the command's resolution and that line, and the field then stole focus back — measured on the proof's first run as
the active element being the composer while the modal was on screen, exactly the state `REQ-SHELL-055`'s "the modal
answers first" exists to prevent. The composer now refocuses itself only when nothing else has taken focus. The stash
dialog, which had never taken focus on opening, now does (its primary action, or Close when there is nothing to pop)
and gives it back when it closes, so a `/pop` typed, completed and submitted from the keyboard continues on the
keyboard.

## The registry over MAIN windows — first executed 2026-09-12 (the builder)

This record's registry had only ever run over the windows a main window *owns* — Part R's persona windows,
Part AL2's terminal window. Its own subject, the main window, was still one `BrowserWindow` constructed
inline in `main()` with its state in local variables, so the registry existed in this record and nowhere in
the composition root.

`buildMainWindow({ workspace, origin })` builds it now, and a `MainWindowState` record holds what belongs to
a window: the window and its `webContents` id, the workspace and its identifier, the followed session, the
approval queue and its open dialog, the persona and terminal registries, and the minted launch-dialog session
id (`REQ-GIT-118`). A registry keyed by `webContents` id holds the records and answers three questions a
single-window build never had to distinguish — the window that RAISED a command (`REQ-SHELL-020`), the window
that OWNS a session, and the window that owns a persona or terminal window asking for its own payload.

**It found no defect**, which is worth recording in a register where nearly every mechanism's first execution
has held one. What it found instead were three defects in the code it replaced, every one of them invisible
while the capacity was one: `runCommand`'s default sender was the first window's id, so a command from a
verification seam or the driver was answered for that window whatever else was open; and
`window.showWorkspace` and the instance hand-over each surfaced "the" main window, which with two open is the
wrong one. One latent violation went with them — a single application-wide approval-dialog slot with
`getAllWindows().find(...)` parenting, which could have put one project's permission prompt over another
project's window (`REQ-TOOLS-063`).

Measured rather than argued: a throwaway probe called the builder twice and read both renderers' title bars,
each naming its own workspace path; closing one left the survivor usable and removed it from the registry and
from the focus ordering. What is **not** yet measured, and is owed to `workspace-proof`: approval parenting
with two windows live, the notice store's application-wide broadcast (ADR-0049's open decision),
`REQ-STARTUP-043`'s constructed-but-unshown window, and a second workspace service.

*Note on deepened structure (2026-09-12):* The main window registry, per-window lifecycle state, and focus
order now live inside `MainWindows` (`apps/desktop/src/main/main-windows.ts`) with Electron and in-memory adapter
seams, replacing the inline records in `index.ts`. All behavior, attribution, and modality rules remain identical.

## The re-authentication prompt — the non-modal level's second surface, first executed 2026-10-02

*The 401 note's part B ([`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](../../defects/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md));
REQ-NOTIFY-071, REQ-NOTIFY-078. Found nothing wrong with the decision.*

The Context names two non-modal window-level surfaces, the project-setup consent dialog and the re-authentication prompt;
only the first had been built. The second is built the same way the Decision states the level — "an in-window panel
that does not trap focus and leaves the rest navigable": `packages/ui/src/ReauthPrompt.tsx`, `role="dialog"` with no
`aria-modal` and no backdrop, mounted beside the shell next to `ProjectSetupDialog` and positioned as it is (fixed, its
own corner, z-index 40, below an application-modal backdrop). It is fed by main on its own channel (`reauth:prompt`,
channel 13) to the one window that follows the session. Measured in the built app by `resilience-proof`'s
`auth-fallback` scenario with the prompt open: the composer is the element under its own centre, takes the focus and is
enabled, and the prompt carries no `aria-modal`. Not measured: Escape, which this surface does not answer (only its
two buttons close it — the dismissal keeps the fallback, REQ-NOTIFY-071), and REQ-NOTIFY-079's rule that the modal
recovery dialog closes it, since that dialog is not built (part C).
