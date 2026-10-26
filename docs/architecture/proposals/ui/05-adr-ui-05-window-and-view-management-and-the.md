# Architecture proposals — UI slice — ADR-UI-05 — Window and view management, and the three modality levels

Part 5 of 10 of [the ui proposal](../ui.md), which indexes every part.

### ADR-UI-05 — Window and view management, and the three modality levels

**Decision.** How top-level windows are created, retained, hidden and destroyed; how the seven
primary views coexist; and how the three required modality levels are implemented.

**Constraints that bear on it.** T4 (replacement-then-close workspace switch), T5 (per-persona
windows, one terminal window, per-artifact dialogs, hide-not-destroy), T6 (zero work off screen,
current first frame on show), T7 (three modality levels), T8 (layered Escape), T9 (raise is a
request, never steal focus), A10 (minimum size obligations on all seven views), A11 (determinate
default splits), P6 (per-user pane layouts), N1 (the acknowledgement surface is anchored to the host
window's content area, so every window that raises one has its own).

**Alternative A — one BrowserWindow, everything else in-window.** Persona panes, the terminal, and
artifact details become overlays or docked panels of the main window.

*For:* one renderer, one store replica, one theme application, cheap; T6 is easy because a hidden
panel is just a component that is not rendered.
*Against:* it contradicts the specification directly. REQ-SHELL-072, REQ-SHELL-081 and REQ-SHELL-154
describe separate windows with their own titles, their own initial sizes, their own accessibility
sweeps (REQ-SHELL-146) and their own banners (REQ-NOTIFY-034). REQ-SHELL-161 talks about a host
window manager declining a raise. This is not a presentation detail that can be reinterpreted.

**Alternative B — one BrowserWindow per top-level window, each a full renderer.**

*For:* matches the specification's window model exactly. Each window gets its own banner (N2/
REQ-NOTIFY-034), its own acknowledgement stack anchored to its own content area (N1), its own
accessibility tree. A crash in a persona window does not take the main window with it. Hiding a
window gives Chromium's own occlusion handling a chance to stop painting, which helps T6.
*Against:* each window is a process, so memory cost is real (a persona window per persona plus a
terminal window is easily four or five renderers). Each holds its own store replica (ADR-UI-01) and
its own theme tokens. Cross-window application-modality (T7) has to be implemented by us, because
Electron's `modal: true` is window-modal against a parent, not application-modal.

**Alternative C — main window as a BrowserWindow, auxiliaries as `WebContentsView`s inside a
lightweight frame window.**

*For:* one renderer bundle, fewer processes than B.
*Against:* the auxiliary windows must be movable, resizable, independently titled OS windows; wrapping
views in a frame window buys nothing over B and loses the per-window isolation.

**Recommendation: Alternative B**, with these specifics.

- **A window registry in the main process** owns the mapping from (main window → persona windows,
  terminal window, artifact dialogs) and enforces the uniqueness rules of T5. It is also where T4's
  replacement-then-close sequence is orchestrated, because the sequence spans two windows and a
  preference write, and only the main process sees both.
- **Hide, do not destroy, for persona windows** (T5): `win.hide()` retains the renderer and its
  replica, so reopening is instantaneous. On `hide`, the renderer unsubscribes and cancels every
  timer (T6); on `show`, it requests a snapshot and applies it before the first paint. Chromium
  throttles background renderers, which is what we want for "zero repaints" — but the fact that
  throttling is a Chromium behaviour rather than ours is not sufficient evidence for T6, which
  demands *zero repaint or refresh timers belonging to it are running*. That is an explicit teardown,
  not a reliance on throttling.
- **`backgroundThrottling` stays at its default (enabled) for user-facing windows** and is
  **disabled** for the benchmark iteration window (ADR-UI-07), where a throttled timer would corrupt
  measurement.
- **Three modality levels, implemented differently:**
  - *Application-modal* (command palette, keyboard help — REQ-SHELL-051, REQ-SHELL-054): rendered
    in-window as an overlay **and** registered with the window registry, which disables input
    routing in every other window of that main window's family for the duration. Electron has no
    application-modal primitive, so this is ours to enforce; it is observable (a click on the persona
    window while the palette is open must do nothing) and therefore must be built rather than assumed.
  - *Window-modal* (checkpoint/worktree progress, message-limit confirmation — REQ-SHELL-117,
    REQ-NOTIFY-266): an in-window overlay with a focus trap, blocking only its own window.
  - *Non-modal window-level* (project-setup consent, re-authentication prompt — REQ-WORKSPACE-106,
    REQ-NOTIFY-071): an in-window panel that does not trap focus and leaves the rest navigable.
- **Native dialogs are used only where the specification names them**: the three folder choosers and
  the message boxes of REQ-SHELL-119 (REQ-SHELL-164). Everything else is ours, so that A3/A4's
  labelling obligations and A1's rendered-pixel contrast rule apply.
- **All seven views stay mounted; only one is visible** (REQ-SHELL-023). This is required anyway by
  REQ-SHELL-152's "switching tabs exchanges panes that are already built, so no tab shows an
  intermediate blank state", by REQ-SHELL-070's "every registered divider in every view — including
  views not on screen", and by ADR-UI-03's construction-time element allocation (B1). A hidden view
  must nonetheless perform zero repaint work and run no timers (T6), so visibility is a first-class
  signal passed down to every surface, not a CSS property.
- **Pane geometry is owned by a layout service** keyed exactly as P6 requires, with the equal-division
  fallback of A11 implemented as a pure function so it is testable at each of the two canonical window
  sizes.

**Consequences accepted.** Several renderer processes, with their memory cost; application-modality
is our code and must be tested across windows; a `visible` signal threaded through every surface.
Windows created and destroyed immediately must not deliver deferred offers (REQ-SHELL-016,
REQ-STARTUP-045), so every deferred timer is owned by the window registry and cancelled on close.

**Revisit if.** Renderer memory becomes the constraint that breaks B9's memory tripwire or a
practical machine budget — the first thing to give would be keeping hidden persona windows alive,
which trades REQ-SHELL-076's "reopening is instantaneous" for footprint and would need a requirement
change rather than an implementation change.

**Open question — a specification conflict I cannot resolve from the specification.**
REQ-SHELL-160(b) makes it an acceptance criterion that, on each supported platform and in each
built-in theme, "no native surface presents a light background while a dark theme is active", and it
names the native dialogs of REQ-SHELL-130 as things to be inspected on screen. REQ-SHELL-164 says the
product is answerable only for what it supplies to a native dialog, and that a host whose native
dialog falls short does not put the product out of conformance. On Windows and most Linux desktops,
the OS folder chooser follows the *system* light/dark setting, not the application's theme, and no
application-side call changes that. Under REQ-SHELL-160(b) read literally, a dark Rotaris theme on a
light-mode Windows host is non-conformant and the only remedy is to stop using native choosers —
which REQ-SHELL-011, REQ-SHELL-021, REQ-SHELL-163 and REQ-WORKSPACE-009 all require us to use. My
reading is that REQ-SHELL-160(b) is meant to cover surfaces the application itself tints (Chromium's
own menus, caret, disabled text, and form-control colour scheme, all of which
`nativeTheme.themeSource` plus the CSS `color-scheme` property do control) and that REQ-SHELL-164
carves out the host's own dialogs. That reading needs confirming rather than assuming.

---

### ADR-UI-06 — The desktop preference store

**Decision.** What the "single platform-standard per-user preference store" of REQ-SHELL-006 actually
is, and how its closed key table, its durability rules and its per-process redirection are met.

**Constraints that bear on it.** P1–P7 (closed key table, observable properties, per-process
redirection, immediate theme commit, two draft debounces, per-user pane layouts, per-workspace prompt
files), B5 (the benchmark's environment overrides name `XDG_CONFIG_HOME` and one private variable),
U1 (scoping established before the first preference read, which is before any window exists),
D1 (diagnostics activation has exactly one source and no environment variable sets it).

**Alternative A — the OS-native settings API per platform.** Windows registry under
`HKCU\Software\Rotaris\Rotaris`, `NSUserDefaults` on macOS, a `~/.config/Rotaris/Rotaris.conf`-style
file on Linux — the arrangement the phrase "scoped by organization name and application name"
describes.

*For:* the most literal reading of REQ-SHELL-006; `XDG_CONFIG_HOME` redirection (P3) falls out on
Linux for free.
*Against:* three implementations with three durability stories. P4 requires a theme write to survive
an immediate power loss; a registry write and an `NSUserDefaults` write have different flush
semantics and `NSUserDefaults` in particular is explicitly asynchronous. P3 then has no mechanism at
all on Windows and macOS — `XDG_CONFIG_HOME` means nothing there — so the benchmark's isolation
requirement (REQ-UIBENCH-046: the user's stored settings hold the same bytes after a run) would need a
platform-specific escape hatch in each backend. That is three chances to leak into a user's real
settings.

**Alternative B — Electron's `userData` directory with a JSON file (electron-store or equivalent).**

*For:* one implementation; `app.setPath('userData', …)` gives per-process redirection on every
platform in one call, satisfying P3 uniformly; atomic write and fsync are ours to control, satisfying
P4 and P7's atomicity discipline; the closed key table (P1) is trivially enforced by a typed accessor
layer over one object.
*Against:* it is a JSON file in the app-data directory rather than the platform's settings *API*.
Whether that counts as "the host platform's own standard per-user application-settings location for
that organization and application pair" is a judgement call — `%APPDATA%\Rotaris` and
`~/Library/Application Support/Rotaris` are standard per-user application-settings locations, but
they are a single-level app name, not an org/app pair.

**Alternative C — our own store, file-backed, with an explicitly resolved root.** One implementation,
one format, and a root resolved in a fixed order: the benchmark-private variable if set; else
`XDG_CONFIG_HOME/Rotaris/Rotaris` on Linux; else the platform's per-user application-settings
location under `Rotaris/Rotaris` on Windows and macOS.

*For:* everything alternative B gives, plus it honours the org/app pair literally on every platform,
plus it makes P3's two named mechanisms (`XDG_CONFIG_HOME` and the private variable) the *actual*
resolution rule rather than a special case. Durability (P4) and atomic replacement are one
implementation. The closed key table becomes a typed registry that fails loudly on an unregistered
key, which is what P1 asks for.
*Against:* we write it; roughly 200 lines including atomic write, tolerant integer parsing (P2), and
key-registry validation. It is not the OS settings API, so a user cannot inspect it with `regedit` or
`defaults read` — which no requirement asks for.

**Recommendation: Alternative C.** The deciding argument is P3 together with REQ-UIBENCH-046: a
benchmark iteration must leave every one of the user's stored settings byte-identical, and it is
given exactly one portable mechanism to do so. A store whose root is resolved by an explicit,
testable rule makes that a one-line guarantee on all three platforms. Alternative A makes it three
platform-specific escape hatches, each of which is a way to corrupt a user's settings; alternative B
is the same design as C with a less literal reading of "organization and application".

Specifics:

- **Root resolution runs before the first preference read** (U1, REQ-SHELL-006's "established before
  the first preference read"). It happens in the main process before any window exists, and the
  resolved root is recorded in diagnostics.
- **A typed key registry** mirrors the key table of REQ-SHELL-006's Data & Formats section exactly:
  key, type, default, owning requirement. Reading an unregistered key is a programming error, not a
  runtime fallback. This is the mechanism that makes REQ-STARTUP-111's acceptance criterion —
  "no entry names update checking, an endpoint, a release source, or an update channel" — checkable by
  reading the registry rather than by grepping the codebase.
- **Writes are atomic** (temp file in the same directory, fsync, rename). **The theme key is written
  synchronously with an fsync before the call returns** (P4). Ordinary keys may be debounced;
  `workspaces/{key}/composerDraft` uses the 400 ms debounce of P5 with the four named flush points.
- **Booleans and integers parse tolerantly** on read (P2), because the specification anticipates a
  backend returning a string.
- **Prompt history and stash are *not* in this store.** P7 puts them in
  `<workspace>/.rotaris/rotaris-prompts.json` with a byte-exact format. They share the atomic-write
  helper and nothing else.
- **Two draft debounces are both implemented and both tested** (P5): 200 ms to application state,
  400 ms to disk. These are different figures serving different requirements and it would be easy to
  collapse them into one by accident.

**Consequences accepted.** A small piece of infrastructure we own and must test on all three
platforms, including the case where the root is unwritable. Users cannot inspect preferences with
platform tooling. If a future requirement wants preferences visible to platform management tooling,
this decision is what would have to change.

**Revisit if.** A requirement appears that makes the store's physical form observable — for example
enterprise policy management, or a requirement that another program read it. REQ-SHELL-006 currently
says the opposite: "Two conformant builds may therefore lay the same keys out differently on disk."

---

### ADR-UI-07 — The benchmark harness: how an iteration renders offscreen

**Decision.** How a benchmark iteration process is started, how it renders the product interface with
nothing on screen, and how the phase timings are taken.

**Constraints that bear on it.** T1 (one executable; the iteration child is internal and has no
user-invocable argument grammar), B4 (offscreen, never on a display, never takes focus, the rest of
the application stays usable), B5 (fresh sequential child processes, environment stripped and
overridden, per-iteration settings directory, user settings untouched), B6 (bundled fonts and the
default theme, no host fallback, a failed font load is a crash), B7 (10 ms lag probe, <100 ms
threshold), B8 (phase timing closes when the interface has finished showing the effect, 30 s bound),
B11 (the About-tab card), B12 (byte-exact output formats), P3 (redirectable preference root).

**Alternative A — a hidden `BrowserWindow` (`show: false`).**

*For:* the simplest thing that never appears on a display; it is a real window with the real renderer,
so B4's "the same rendering path the live application uses" is satisfied without argument.
*Against:* Chromium does not composite a window that has never been shown. `requestAnimationFrame`
does not fire, so B8's "the interface has finished showing that work's effect" has no signal to wait
for, and the phase timings would measure layout without paint. `setBackgroundThrottling(false)` keeps
timers running but does not make an unshown window paint. This alternative measures the wrong thing.

**Alternative B — a window positioned outside every display's work area and shown inactive.**

*For:* it really composites, so paint timings are real.
*Against:* B4 says no benchmark window "SHALL ever appear on a display". A window at negative
coordinates is not on a display today and is on one the moment a monitor is rearranged, and on some
window managers it is clamped back into view. It also risks appearing in the task switcher and in
screenshots. Too fragile for a requirement stated that absolutely.

**Alternative C — Electron offscreen rendering (`webPreferences: { offscreen: true }`).** Confirmed
against the current Electron documentation (electronjs.org, latest, checked this session): a
BrowserWindow created with `offscreen: true` renders into a bitmap and emits `paint` events on its
`webContents`; `setFrameRate`, `startPainting`, `stopPainting`, `isPainting` and `invalidate` are the
control surface. The documented example pairs it with `app.disableHardwareAcceleration()`.

*For:* it composites and emits a `paint` event per frame, which is exactly the "the interface has
finished showing that work's effect" signal B8 needs, and it is a real signal rather than a proxy.
Nothing appears on a display, nothing takes focus, nothing can be clamped into view. It works
identically on all three platforms.
*Against:* offscreen rendering uses a different compositing path from an on-screen window (software
composition, or shared-texture mode). B4 says entries are rebuilt "through the same rendering path the
live application uses". The *application* rendering path — DOM, style, layout, the recycler of
ADR-UI-03, the Markdown cache — is identical; only Chromium's final composite differs. That is a
defensible reading, but it is a reading, and it should be recorded rather than glossed.

**Recommendation: Alternative C**, with the reading above written into the code and the report.

Specifics:

- **The iteration child is the same executable with a private argv sentinel**, matching the pattern
  REQ-STARTUP-015 already establishes for the bundled tool server's reserved token. REQ-UIBENCH-037
  says explicitly that how such a process is started is internal, that no user or external program can
  start one, and that no argument grammar is fixed — so the sentinel must be undocumented,
  unadvertised, and must not appear in any user-facing surface. It must also be inert if a user
  discovers it: the child window is offscreen and non-interactive by construction, so the worst
  outcome of someone finding the sentinel is an invisible process that writes a JSON-lines file to a
  path it was told to write to.
- **Environment handling is explicit, not inherited.** B5 requires *every* variable the product reads
  to be removed. The list of variables the product reads is a closed enumeration
  (REQ-STARTUP-147: `APPIMAGE`, `ROTARIS_BUNDLED`, `COMSPEC`, plus the two cache variables it writes),
  so the stripping is a computed set difference against that enumeration and must be regenerated
  whenever the enumeration changes. That coupling should be a single shared constant.
- **`XDG_CONFIG_HOME` plus the private variable both point at the per-iteration temporary directory,
  and the preference store's root resolution (ADR-UI-06) reads the private variable first**, which is
  what makes B5 and REQ-UIBENCH-046 hold on Windows and macOS where `XDG_CONFIG_HOME` means nothing.
- **Display scale factor 1** is forced with `--force-device-scale-factor=1` on the child command line;
  `LANG=C` and `LC_ALL=C` are set as B5 states. "One platform-independent widget style" maps, for a
  DOM interface, to: the bundled theme (B6), a reset stylesheet, and no host-derived values —
  concretely, no `system-ui` font, no `prefers-color-scheme` query, no OS accent colour, and reduced
  motion resolved from the stored setting only.
- **Fonts are loaded and *verified*.** B6 forbids the host-font fallback that REQ-SHELL-008 permits
  the live application. The iteration must await `document.fonts.load` for each of the three bundled
  families and terminate non-zero if any fails, which the parent records as a crash
  (REQ-UIBENCH-041). This is one of the few places where iteration behaviour legitimately differs
  from live behaviour, and the specification says so.
- **The lag probe (B7) runs in the renderer**, because it is the interface's responsiveness that is
  being measured: a 10 ms interval timer recording `max(0, actual − scheduled)`, reported per record
  interval and reset after each record. It must be started before the first phase and stopped when the
  last phase's record is taken, so every instant falls inside exactly one record's interval.
  `backgroundThrottling` must be disabled on this window or the probe measures throttling.
- **Phase timing** closes on the paint-completion promise of ADR-UI-03, itself resolved by the `paint`
  event under offscreen rendering, bounded at 30 s with `settle_timed_out` recorded (B8).
- **`rss_bytes`, `threads`, `handles`** are read for the process that produced the record — the
  iteration child. In a multi-process Chromium child, "the process" is ambiguous; the honest reading
  is the process running the measured window's renderer, and that choice must be documented because
  REQ-UIBENCH-050's comparability claim is between runs of one revision.

**Consequences accepted.** The benchmark measures an offscreen composite rather than an on-screen one,
so its absolute timings are not the same numbers a user's window would produce — which
REQ-UIBENCH-099 already anticipates by making every timing comparative. `app.disableHardwareAcceleration()`
in the iteration child means the benchmark never exercises the GPU path. The private argv sentinel is
a surface that must never be documented or user-reachable.

**Revisit if.** Electron's offscreen rendering proves unable to drive a full application shell at
useful frame rates, or its `paint` cadence turns out not to correspond to layout settling — in which
case the fallback is alternative B on a virtual display, which changes the deployment story for the
benchmark and would need a requirement conversation.

**Open question.** REQ-UIBENCH-039 names `XDG_CONFIG_HOME` contractually, which is a Linux-only
variable. My reading is that it is named because it is the one *standard* variable available, and that
the benchmark-private variable carries the same job on Windows and macOS. If instead the intent is
that the preference store must honour `XDG_CONFIG_HOME` on all three platforms, ADR-UI-06's resolution
order should say so; either reading is implementable, but they are different.

---

### ADR-UI-08 — One instrumentation layer for the benchmark, the diagnostics recorder, and the budgets

**Decision.** Where the numbers come from: `widgets`, `ui_objects`, `markdown_cache`,
`transcript_operations`, `event_loop_lag_ms`, the per-view diagnostics entries, and the runtime
checks behind the responsiveness budgets.

**Constraints that bear on it.** B1–B3, B7, B9 (benchmark counters), D1 (zero work when diagnostics is
off), D2 (per-view entries keyed by lower-cased view name, carrying visibility, live widget count and
principal-collection size; plus the count and names of the concurrent execution contexts the
application creates), D3 (no session content in any diagnostics file), D4 (bounds and cadences), S6
(the 100/120/200/250 ms budgets), R4 (the Markdown cache's declared capacity).

**Observation that drives the decision.** The benchmark and the diagnostics recorder want almost the
same numbers. `widgets` and `ui_objects` appear in both (REQ-UIBENCH-050 and REQ-STARTUP-134).
Event-loop lag appears in both, at different cadences (10 ms probe for the benchmark, 250 ms heartbeat
for diagnostics). The Markdown cache's occupancy is a benchmark field but is the same object
diagnostics would want. Building these twice would guarantee they disagree.

**Alternative A — two independent instrumentations.** The benchmark reads what it needs; the
diagnostics recorder reads what it needs.

*For:* each is simple and neither constrains the other; diagnostics can be compiled out entirely
under D1.
*Against:* two definitions of `widgets` is a defect waiting to happen, and the definition is exactly
the thing ADR-UI-03 had to argue for. Two lag measurements at two cadences, if independently
implemented, will disagree about what "lag" is.

**Alternative B — one metrics registry the product owns; two readers with different cadences and
different budgets.** Every countable is registered once, with one definition, and exposed through a
single synchronous `sample()` returning a plain object. The benchmark samples it at phase boundaries;
the diagnostics recorder samples it every 1000 ms.

*For:* one definition of every counter. The per-view entries D2 needs (visibility, live widget count,
principal-collection size) come from the same view registry that ADR-UI-05 already needs for the
`visible` signal and that ADR-UI-03 already needs for slot pools. The Markdown cache exposes its own
occupancy, satisfying R4 and D2 from one object.
*Against:* D1's "when diagnostics is off, no diagnostics files, timers, or instrumentation of any kind
exist — zero work, zero disk writes" now applies to a shared registry. The registry must therefore be
*passive*: counters are values maintained as a side effect of work that happens anyway (a slot pool
knows its size; a cache knows its occupancy; the apply stage increments its own counters), and
`sample()` merely reads them. No timer, no allocation, no traversal exists unless a reader is
attached.

**Recommendation: Alternative B, with the passive-registry discipline made explicit**, because it is
the only way to satisfy D1 and still have one definition of each counter.

Specifics:

- **Passive counters only.** Nothing in the registry may compute anything on write. `widgets` is the
  sum of the fixed pool sizes and the chrome element count, maintained when a pool is allocated;
  `ui_objects` is a counter the row renderer adjusts when it creates or releases content nodes;
  `transcript_operations` are incremented by the apply stage of ADR-UI-04; `markdown_cache` counters
  are fields of the cache. `sample()` is O(number of registered counters), not O(DOM).
- **Two lag observers, one definition.** "Lag" is `max(0, actualStart − scheduledStart)` for a
  scheduled callback. The benchmark's is a 10 ms interval reporting the maximum since the last record
  (B7); diagnostics' is the 250 ms heartbeat reporting the inter-heartbeat interval minus 250 ms
  (D4). Both are instances of one observer with different periods and different reducers. Neither
  exists unless its reader is attached (D1).
- **The lag observer lives in the renderer**, because REQ-UIBENCH-118 ties the reading to
  REQ-SHELL-150's *interface* responsiveness budget. A main-process lag reading would be measuring the
  wrong loop. Diagnostics additionally wants main-process figures (thread names, handle counts), so
  the recorder assembles a record from both sides; the assembly is what crosses the boundary, and it
  carries counts and names only, never content (D3).
- **"Concurrent execution contexts the application itself creates, together with the names it gives
  them"** (D2) maps, for this stack, to: the renderer processes we created (named by their window
  role), any utility processes, and any worker threads. This must be a registry we maintain when we
  create one, not an introspection of the runtime — the requirement says "whatever the runtime it is
  built on calls them", which is an invitation to name them ourselves.
- **The budgets of S6 get runtime assertions in development builds**, fed from the same registry: a
  gesture-to-acknowledgement timer (100 ms), a pending-changes repaint interval watchdog (120 ms), a
  publication-to-paint timer (250 ms p95). These are the numbers REQ-SHELL-150 and REQ-MONITOR-222
  state as pass/fail criteria, and having them measured continuously in development is far cheaper
  than discovering a regression through the benchmark.
- **D3 is enforced at the type level.** The record type admits numbers, booleans, enumerated strings
  and registered names only — never free text drawn from session state. A field carrying a path is
  reduced to a base name at the point of capture, not at the point of writing.

**Consequences accepted.** Every counter becomes a small ongoing obligation on the code that owns the
thing being counted. A misplaced counter increment is a determinism bug in B3 rather than a cosmetic
one, so the apply stage's counters need direct unit tests. The registry is a place where an
enthusiastic contributor could add an expensive counter and break D1; the passive rule needs to be
stated in the code, not only here.

**Revisit if.** D1's zero-work rule and the shared registry turn out to conflict in practice — for
example if a counter cannot be maintained passively — in which case that specific counter moves to a
diagnostics-only path computed on demand.

---
