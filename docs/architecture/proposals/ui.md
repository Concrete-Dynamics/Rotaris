# Architecture proposals — UI slice

**Status:** proposal, for the Architecture Gate. Nothing here is decided.
**Slice:** the desktop application shell and its rendering, state, and IPC.
**Domains owned:** 03 (`REQ-CHAT`), 11 (`REQ-STARTUP`), 12 (`REQ-SHELL`), 13 (`REQ-WORKSPACE`),
19 (`REQ-NOTIFY`), 21 (`REQ-UIBENCH`).

## 1. Scope of this slice

This slice covers everything a user sees and touches: the single main window with its seven primary
views, the auxiliary persona and terminal windows, the artifact dialogs, the conversation transcript
and composer, the notification and recovery surfaces, the theming and accessibility contract, the
startup sequence, how the application installs and updates itself, the opt-in diagnostics recorder,
and the built-in UI performance benchmark.

It does **not** cover: how a run is orchestrated, how tools are executed or permitted, git and
worktree mechanics, session persistence formats, the model layer, MCP, settings semantics, or the
requirements board's own logic. Where a decision of mine depends on one of those, it is cited and
named as a dependency rather than decided here.

Two things are settled by product decision and are not open in any proposal below: the product is an
Electron desktop application, and the model layer sits behind an internal abstraction. Everything
else in the candidate stack is assessed against the requirements.

**A note on what is missing.** The approved visual design reference is not available in this
session. Every proposal below is about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. Where a decision would fix information
architecture or visual design, I have said so and stopped rather than inventing one.

---

## 2. Extracted constraints

Each constraint is labelled:

- **HARD** — the specification fixes an observable that only some designs can produce.
- **HINT** — not fixed, but one design makes several requirements natural and the others awkward.
- **FREE** — genuinely an implementation choice, recorded so nobody re-argues it later.

### 2.1 Process topology, windows, and modality

| # | Constraint | Label | Requirements |
|---|---|---|---|
| T1 | Exactly one shipped executable. No console, headless, benchmark or secondary executable may be published or made available by an installation. The only permitted self-launches are internal children: the bundled code-intelligence tool server, and a benchmark iteration process. Neither is a user-invocable surface and neither may define an argument vocabulary a user could type. | HARD | REQ-STARTUP-002, REQ-STARTUP-015, REQ-UIBENCH-037, REQ-EVENTS-005 |
| T2 | The persistent-notice store belongs to **the application process**, not to a window: re-creating the main window neither resets the monotonic notice-identifier sequence nor discards the current notice, and identifiers are unique across every window of the process. | HARD | REQ-NOTIFY-025, REQ-NOTIFY-027 |
| T3 | The queued-prompt service is shared across every window and every run "sharing the same process", with an atomic `QUEUED → TRIGGERED` transition exactly one caller may win. | HARD | REQ-CHAT-038, REQ-CHAT-041 |
| T4 | A workspace switch **builds a new main window first**, shows it, then closes the old one; if the old window vetoes its close, the replacement is discarded and nothing changes. Two main windows therefore exist simultaneously during a switch. | HARD | REQ-SHELL-017, REQ-SHELL-018, REQ-SHELL-019, REQ-STARTUP-047, REQ-WORKSPACE-013 |
| T5 | Auxiliary windows: at most one persona window **per persona** (not per agent instance), 820×620; exactly one terminal window per main window, 900×620; one dialog per artifact. All are owned by their main window and destroyed with it. Closing a persona window **hides** rather than destroys it, so reopening is instantaneous. | HARD | REQ-SHELL-072, REQ-SHELL-076, REQ-SHELL-078, REQ-SHELL-081, REQ-SHELL-111, REQ-SHELL-123, REQ-SHELL-154, REQ-SHELL-167 |
| T6 | A surface that is not on screen performs **zero repaints and runs zero repaint or refresh timers**, however fast changes arrive for it; when it becomes visible its *first painted frame already carries current state*, reached within the 100 ms gesture budget, with no visible catch-up redraw. | HARD | REQ-SHELL-151, REQ-SHELL-084, REQ-SHELL-076, REQ-CHAT-063, REQ-WORKSPACE-150 |
| T7 | Three distinct modality levels are required and observably different: **application-modal** (command palette, keyboard help), **window-modal** (worktree/checkpoint progress, message-limit confirmation), and **non-modal window-level** (project-setup consent dialog, re-authentication prompt). | HARD | REQ-SHELL-051, REQ-SHELL-054, REQ-SHELL-117, REQ-NOTIFY-266, REQ-NOTIFY-071, REQ-WORKSPACE-106 |
| T8 | Escape resolution is layered and fixed: a modal surface answers Escape *before* the window sees it; window-level Escape is live **only on the Workspace view** and resolves search panel → both compact drawers; the plan gate is answered by no dismissal at all. Every confirmation treats Escape as its declining answer, and a declining answer that would open an external page performs the refusal alone. | HARD | REQ-SHELL-055, REQ-CHAT-002, REQ-CHAT-026, REQ-SHELL-168, REQ-STARTUP-046 |
| T9 | "Show, raise and activate" of an auxiliary window is a *request* to the host window manager; a declined raise is a supported outcome, never retried or reported, and must never be compensated for by taking focus. No z-order between auxiliary windows is required. | HARD (no-focus-steal); FREE (z-order) | REQ-SHELL-161, REQ-SHELL-081, REQ-SHELL-109, REQ-SHELL-110 |
| T10 | Whether run execution occupies the same OS process as the UI is **not fixed** by my domains — but T2 and T3 bind whatever topology the orchestration slice chooses. | HINT | REQ-NOTIFY-025, REQ-CHAT-041, REQ-MONITOR-232 |

### 2.2 State synchronisation: the renderer ↔ runtime contract

| # | Constraint | Label | Requirements |
|---|---|---|---|
| S1 | **Two channels, not one.** The transcript travels as an *incremental* update carrying the lowest row index whose content may still change, the rows from that index onward, new diffs, and the persona set. Everything else travels as **one whole-session update** carrying the session record with unbounded collections emptied and bounded collections carried in full. | HARD | REQ-MONITOR-214, REQ-MONITOR-216 |
| S2 | The whole-session update must carry **every field any surface can display** — a curated subset is a defect, observable as a surface showing a value the persisted record has moved past. | HARD | REQ-MONITOR-217 |
| S3 | **Persist before publish.** No change may be published to any view before it is durable. A view may never display content a resume would not restore. | HARD | REQ-MONITOR-221 |
| S4 | Row stability: a row already delivered may change only through a later update whose earliest-changed index is at or below it. Nothing may mutate, in place, a row a view already holds. A shrunk transcript publishes earliest-changed index 0. | HARD | REQ-MONITOR-215, REQ-MONITOR-229 |
| S5 | Publication timing: a row a view has not yet seen is published **immediately** — no debounce, delay floor or minimum wait of any size, on any platform. Growth of an already-visible row is coalesced on a **trailing 50 ms** tick; per-token publication is forbidden. Coalescing loses nothing; pending publications flush at run end. | HARD | REQ-MONITOR-218, REQ-MONITOR-219, REQ-MONITOR-220 |
| S6 | Latency budgets, all acceptance criteria rather than aspirations: run activity visible on the focused session's live surfaces within **250 ms at p95** regardless of session length; the run surfaces of REQ-ORCH-155 reflect a recorded state change within **100 ms**; a user gesture acknowledged within **100 ms**; a surface with pending changes repaints at least every **120 ms**; a burst's final state on screen within **120 ms** of the last change; streamed output on screen within **200 ms** of production. | HARD | REQ-MONITOR-222, REQ-ORCH-155, REQ-SHELL-150, REQ-CHAT-157 |
| S7 | Cost proportional to change, not accumulation: measured end to end (run emits → surface shows), an update to a session holding ≥10,000 rows costs no more than **2×** the same update to an empty session at p95. A session with nothing happening does **no work at all** beyond the liveness poll. | HARD | REQ-MONITOR-223 |
| S8 | Poll and repaint cadences are fixed: foreign-session poll **750 ms**; local-run reconcile poll **2000 ms**, switching between the two as the followed session changes; live-row repaint about **1 s**, **250 ms** while a terminal stream is live; persona-window rebuild coalesced at **120 ms**; terminal window header refresh **120 ms**; status-bar git refresh every **10.0 s**, non-overlapping, measured from completion. | HARD | REQ-MONITOR-287, REQ-MONITOR-288, REQ-CHAT-063, REQ-CHAT-097, REQ-SHELL-076, REQ-SHELL-084, REQ-WORKSPACE-150 |
| S9 | A view that cannot correctly apply an increment must **decline** it, record a diagnostic, stop consuming increments, and re-render from a whole read; it must never render a result that differs from what a whole read would produce, and declining must not interrupt the user or blank the transcript. Correctness outranks update latency. | HARD | REQ-MONITOR-224, REQ-MONITOR-226, REQ-CHAT-052 |
| S10 | A broken, slow or absent view leaves the run bit-identical: progress, timing, terminal result and event sequence unchanged. No view may hold a run open or slow it. | HARD | REQ-MONITOR-232 |
| S11 | On focus change the transcript on screen is the newly focused session's, in full, from the persisted record; no row and no in-flight update from the previous session may survive. A stale read must never overwrite newer content, however late it arrives. | HARD | REQ-MONITOR-227, REQ-MONITOR-225 |
| S12 | Trailer rows (pending question, pending approvals) are **not** recorded history: they are computed from what is pending at that moment, always follow every recorded row, and are appended identically by the whole-state and incremental paths. Pending state becomes visible within one 750 ms poll. | HARD | REQ-MONITOR-230, REQ-CHAT-051, REQ-CHAT-097 |
| S13 | A display tick (elapsed clocks) must not write session state and must not cause a transcript publication. | HARD | REQ-MONITOR-108, REQ-CHAT-158 |
| S14 | The wire encoding of either channel is unconstrained. | FREE | — |

### 2.3 Transcript: rendering, residency, and identity

| # | Constraint | Label | Requirements |
|---|---|---|---|
| R1 | Paint and measure cost depends on **visible rows and changed rows**, never on total rows. At ≥1000 rows, scrolling, expanding and searching each stay inside the 200 ms budget, and appending costs no more than on an empty transcript. | HARD | REQ-CHAT-055, REQ-CHAT-154, REQ-CHAT-157 |
| R2 | Bounded memory with **on-demand paging**: resident rows are bounded (live transcript cap 5000 rows, evicted in pages of 50 to `transcript_archive.jsonl`); scrolling toward the top loads the next older span, places it above, leaves the reader's position undisturbed and every expansion state as set; loading happens **off the interface thread**; the oldest recorded row is distinguishable from a failed load; a re-loaded row is *identical* to the row released. | HARD | REQ-CHAT-165, REQ-SESSION-192, REQ-SESSION-131, REQ-SESSION-160 |
| R3 | Two bounded caches with LRU eviction: retained row **measurements** and retained row **renderings**. A rendering is reused only while identity, content, laid-out width and expansion state are all unchanged. Live rows (running tool/verifier/group, streaming reasoning) are redrawn every repaint and never reused. A theme switch redraws every row and preserves every expansion state. | HARD | REQ-CHAT-058 |
| R4 | The rendered-body cache has an **observable capacity**: `max_entries` 256 and `max_chars` 2,000,000, where `chars` counts characters of the *source* text an item was rendered from, and `hits`/`misses` are running totals over the life of the process. | HARD | REQ-UIBENCH-063, REQ-UIBENCH-086 |
| R5 | Expansion state is keyed by **stable identity**, not position: tool/verifier rows by tool-call key (content-hash fallback), thinking rows by start time (text-hash fallback), delegation headers by agent, groups by the key of the group's *first* member. | HARD | REQ-CHAT-059 |
| R6 | Scroll preservation is by **anchor, never by stored pixel offset**: record the identity and viewport offset of the top visible row and restore it after geometry settles. Append, truncate-from-end, in-place replacement and last-row extension must each preserve scroll position and expansion state without a reset. | HARD | REQ-CHAT-053, REQ-CHAT-071 |
| R7 | Exactly two follow states, derived from the scrollbar resting at maximum. Only reader-caused movement may change the state; application-performed scrolls (tail pin, anchor restore, search jump) must not. The state is exposed in the accessible description and by a border treatment, and the two states are never described by the same text. | HARD | REQ-CHAT-070, REQ-CHAT-072 |
| R8 | Row layout metrics are normative: timestamp column 52 px, role column 112 px, minimum row height 30 px, timestamps in the monospace stack at 8 pt, margins 10 px horizontal / 5 px vertical, continuation rows drawing a 2 px persona-coloured gutter bar. Block attribution is drawn only on the first row of a run of same-role rows. | HARD | REQ-CHAT-057 |
| R9 | The row-category vocabulary is **closed** (12 members); the row-role vocabulary is **open** (5 named roles project to their own kind; any other role projects to a message row carrying that role as its display name). Neither may be restated or narrowed elsewhere. | HARD | REQ-CHAT-046, REQ-CHAT-047 |
| R10 | The row model retains **untruncated** tool input and output; display caps (10 lines results, 2 lines inputs; settable 1/2/5/10/20/50/unlimited) affect only what is drawn, and raising a cap or reopening the session reveals the rest with nothing re-run. Expansion always shows the untruncated value whatever the caps say, and a cap change takes effect immediately on rows already on screen. | HARD | REQ-CHAT-046, REQ-CHAT-061, REQ-CHAT-166, REQ-CONFIG-472 |
| R11 | Markdown rendering must be **synchronous**, must issue **no network request**, and must render mid-stream incomplete Markdown without error and without altering neighbouring rows. Text selection must select exactly the characters the pointer covers **in every row category, including rendered-Markdown bodies**. Bare `http(s)` URLs — not only Markdown links — are activatable, with trailing punctuation excluded. | HARD | REQ-CHAT-056, REQ-CHAT-075, REQ-CHAT-076, REQ-NOTIFY-243 |
| R12 | Full keyboard navigation in the transcript: arrows, PageUp/PageDown, Home/End move the current row; selection is supported; the hovered row receives hover styling. Group copy and a group's accessible description yield a readable summary and must **not** emit raw tool input or output. | HARD | REQ-CHAT-077, REQ-CHAT-065, REQ-SHELL-144 |
| R13 | Folding is deterministic and content-derived: ≥2 consecutive same-agent rows whose tool names map to the same family fold; four named families plus "a tool name outside those lists forms a family of its own"; any intervening row of another kind ends the run. Group headers carry a searchable member blob capped at 2000 characters and take colour from a fixed severity ordering. Structured-question rows and unsettled live terminal rows never fold. | HARD | REQ-CHAT-064, REQ-CHAT-065, REQ-CHAT-066 |
| R14 | Search is **case-folded substring over displayed rows** (role + text + tool name + detail; for groups role + family + capped blob), recomputed automatically whenever rows change while the panel is open, wrapping in both directions, disabling tail-follow and centring the matched row. | HARD | REQ-CHAT-074 |
| R15 | Stream fidelity: the finished message equals the concatenation of the deltas received, character for character. A whitespace-only delta is kept exactly as received. Tool-call chunks never appear in visible message text. Provider-marked internal deliberation appears only in the reasoning channel, recognised from all three carrier shapes. | HARD | REQ-CHAT-163, REQ-CHAT-157 |
| R16 | Attachments are stored under the owning session's directory and referenced from the row and snapshot by **relative path plus content digest**, never inlined; a missing or digest-mismatched attachment renders as unavailable without failing the row or the rest of the transcript. | HARD | REQ-CHAT-173 |
| R17 | Which element technique paints a row is unconstrained, subject to R1–R12 and to §2.4. | FREE | — |

### 2.4 Structural determinism — the benchmark's grip on the UI architecture

This is where domain 21 reaches furthest into the design. It is not a testing concern that can be
bolted on afterwards; it constrains what the interface may be made of.

| # | Constraint | Label | Requirements |
|---|---|---|---|
| B1 | **The count of live paintable visual elements must be invariant after window construction.** `construct_window` is "the only phase allowed to change the number of interface elements alive in the process: from the moment this phase's record is taken until the iteration ends, the `widgets` value must not change." Six later phases — bulk apply, per-event appends, simulated streaming, 1000 tail replacements, an idempotent re-apply, a resize sweep — must all leave it unchanged. `widgets` is defined as "live visual elements of the constructed window — those that occupy space in the window's layout and can be painted". | HARD | REQ-UIBENCH-054, REQ-UIBENCH-085, REQ-UIBENCH-050 |
| B2 | `ui_objects` — every live interface-framework object owned by the window, visual or not, never smaller than `widgets` — is reported in every record but is **informational only**: no invariant reads it and no value it takes changes any outcome. | HARD (report it); FREE (any bound) | REQ-UIBENCH-050, REQ-UIBENCH-109 |
| B3 | **The view must own an explicit transcript apply/diff stage** producing six cumulative counters — `noop`, `insert`, `remove`, `update`, `refused`, `reset` — classified by comparing the state being applied with the state currently displayed, monotonically non-decreasing across an iteration's seven records, and **byte-identical across iterations in fresh processes** replaying the same fixture. `refused` and `noop` are distinguished by whether the application was *valid*, not by whether anything visibly changed. | HARD | REQ-UIBENCH-064, REQ-UIBENCH-083, REQ-UIBENCH-099 |
| B4 | Every iteration renders the product interface **offscreen**: no benchmark window ever appears on a display, takes focus, or moves/resizes/refocuses a user window; no iteration prompts; the rest of the application stays usable. Entries are rebuilt "through the same rendering path the live application uses; the benchmark defines no rendering path of its own". | HARD | REQ-UIBENCH-112, REQ-UIBENCH-027 |
| B5 | Every iteration runs in a **fresh child process of the product's own program**, sequentially, with the invoking environment stripped of every variable the product reads plus overrides forcing: no on-screen output, one platform-independent widget style, display scale factor 1, `LANG=C`, `LC_ALL=C`, `XDG_CONFIG_HOME` pointed at a per-iteration temporary settings directory, and one benchmark-private variable naming that directory. The user's real stored settings hold the same bytes after the run as before. | HARD | REQ-UIBENCH-037, REQ-UIBENCH-038, REQ-UIBENCH-039, REQ-UIBENCH-046 |
| B6 | Fonts and theme come from the package, never the host: the three bundled families and the default built-in theme `rotaris-dim`. The host-font fallback the live application is allowed **must not apply here** — a bundled family that fails to load terminates the iteration non-zero, counted as a crash. | HARD | REQ-UIBENCH-047, REQ-SHELL-008, REQ-SHELL-128 |
| B7 | Responsiveness is measured by a probe scheduled **every 10 ms**; `event_loop_lag_ms` is the largest amount by which one probe ran later than scheduled over the interval between the previous record and this one, never accumulated, with the whole measured part of the iteration covered by exactly one record's interval. The single absolute threshold the benchmark applies is that every record's lag is strictly below **100 ms**. | HARD | REQ-UIBENCH-049, REQ-UIBENCH-118, REQ-SHELL-150 |
| B8 | Each phase's `wall_ms`/`cpu_ms` cover its work **up to the point at which the interface has finished showing that work's effect**, bounded at 30 s per settle with `settle_timed_out` recorded. The architecture must therefore expose an observable "the interface has finished showing this" signal. | HARD | REQ-UIBENCH-051, REQ-UIBENCH-119 |
| B9 | Memory: `rss_bytes` per record, 11 samples at fixed indices during the tail phase, and a tripwire that second-half growth over 1000 tail replacements is **strictly below 64 MiB**. | HARD | REQ-UIBENCH-058, REQ-UIBENCH-087 |
| B10 | Timings and memory are explicitly **not** required to be reproducible; only structural counters and the seven invariants are. | FREE | REQ-UIBENCH-099 |
| B11 | The benchmark's own surface is the Settings → About performance-benchmark card, keyboard-reachable, usable at the 1000×680 minimum, with progress, iteration count and a cancel control; report presentation meets the 100 ms budget for a run of up to 10 iterations. | HARD | REQ-UIBENCH-110, REQ-UIBENCH-111, REQ-UIBENCH-113, REQ-UIBENCH-115, REQ-UIBENCH-116 |
| B12 | Fixture and report byte formats are fixed exactly (2-space indent, sorted keys, ASCII-escaped, canonical-JSON SHA-256 checksums, JSON Lines records, the `summary.md` line grammar with three-decimal fixed-point and a locale-independent decimal point). | HARD | REQ-UIBENCH-018 – REQ-UIBENCH-021, REQ-UIBENCH-043, REQ-UIBENCH-062, REQ-UIBENCH-067 |

### 2.5 Preferences, drafts, and per-workspace files

| # | Constraint | Label | Requirements |
|---|---|---|---|
| P1 | One per-user preference store, scoped by organization "Rotaris" and application "Rotaris", established **before the first preference read**, disjoint from the layered YAML surface in both directions, with a **closed key table**: a key absent from that table does not exist. Keys are slash-namespaced; no dot-namespaced key is a key of this store. | HARD | REQ-SHELL-006, REQ-CONFIG-463, REQ-CONFIG-405 |
| P2 | Observable properties, which are the whole of the requirement: the host's own standard per-user application-settings location for that org/app pair; readable and writable without elevation; **outside every workspace directory**; created on first write; absence is not an error but the state in which every key answers with its declared default; a written value is the value read back after restart; integer parsing tolerant of values returned as strings. Physical path and encoding are implementation choices. | HARD (properties); FREE (path, encoding) | REQ-SHELL-006, REQ-SHELL-069 |
| P3 | The store must be **redirectable per process** to an arbitrary directory on every platform, because a benchmark iteration must not touch the user's real settings and must start from the same stored-settings state as every other iteration. `XDG_CONFIG_HOME` and one private variable are the named mechanisms. | HARD | REQ-UIBENCH-038, REQ-UIBENCH-039, REQ-UIBENCH-046 |
| P4 | The theme choice is committed **at the moment it is made**, so a choice followed immediately by a crash or power loss is still in force at the next launch. Reading a theme preference never writes it back; an unknown name degrades silently to the default and the stored value is left exactly as the user left it. | HARD | REQ-SHELL-131, REQ-SHELL-009, REQ-SHELL-128 |
| P5 | Two different debounces govern the composer draft and both are normative: **200 ms** before the draft is published to application state (never per keystroke), and **400 ms** before it is written to the preference store under `workspaces/{workspace-key}/composerDraft`, flushed immediately on focus loss, view change, workspace replacement and window close. A write lands whole or not at all. Survival of abnormal termination is bounded, not promised. | HARD | REQ-CHAT-014, REQ-SHELL-159, REQ-NOTIFY-066, REQ-CHAT-015 |
| P6 | Pane layouts are per **user**, not per workspace, under `panels/`, keyed by a stable per-view string (lower-cased view names, `{view}.{arrangement}` where a view has several), with a pane count and one schema-version stamp (1). A retired key is never reused, so an old stored layout can only fail to match and fall back to declared defaults. Divider drags persist with a **250 ms** debounce; capture before first layout is a silent no-op. | HARD | REQ-SHELL-069, REQ-SHELL-067, REQ-SHELL-070 |
| P7 | Prompt history and stash are **per workspace only**, at `<workspace>/.rotaris/rotaris-prompts.json`, pretty-printed with **two-space** indentation, keys emitted in the order `history` then `stash` even when empty, trailing newline, written atomically with no leftover temporary file, caps 200 and 100, blanks dropped on load, absent-or-unparseable loading as empty rather than as an error, save failure degrading to in-memory with a persistent notice. There is explicitly **no** user-global prompt history or stash. | HARD | REQ-CHAT-045, REQ-SHELL-157 |
| P8 | The four tool-row display controls are **workspace YAML**, not preferences, yet must take effect on rows already on screen the moment the control moves — read from pending settings state, with Save deciding only what the file says. | HARD | REQ-CHAT-166, REQ-CONFIG-472, REQ-CONFIG-262 |

### 2.6 Theming, accessibility, and motion

| # | Constraint | Label | Requirements |
|---|---|---|---|
| A1 | Contrast is settled **from rendered pixels on a real display**, not from token arithmetic: the label as painted against the background as painted, after all styling, states and overlays. A token pair that computes correctly but paints over a different surface fails. Thresholds 4.5:1 normal text, 3:1 large text and non-text boundaries. | HARD | REQ-SHELL-160(a), REQ-SHELL-144, REQ-SHELL-145 |
| A2 | Derived colours (persona shades, chips, the four slash-highlight roles) are corrected by **raising perceptual lightness only** — hue and saturation preserved, adjustment upward only, capped near-white, never by darkening — until the floor is met; no two concurrently running instances get the same shade; the four slash-token colours must all differ from one another. | HARD | REQ-SHELL-134, REQ-SHELL-145, REQ-CHAT-027 |
| A3 | **No state by colour alone**, product-wide: severity by border *plus* glyph, status words beside dots, glyph-distinguished task states, the take-control button re-labelling, keycap chords announced as one accessible name, the active theme legible as text. Every notice exposes its severity word in its accessible name. | HARD | REQ-SHELL-149, REQ-NOTIFY-258, REQ-CHAT-086, REQ-CHAT-027 |
| A4 | Any element showing a tooltip exposes that identical sentence as its accessible description, whether or not it takes focus, with the platform-formatted shortcut appended where it has one. **No information in the shell is available on hover alone.** Every disabled control publishes its reason through *both* tooltip and accessible description. | HARD | REQ-SHELL-058, REQ-CHAT-007, REQ-NOTIFY-008 |
| A5 | Reduced motion resolves in a fixed precedence — stored in-app setting, then the OS signal where the host publishes one, else motion on — and is **read at each animation start rather than cached**, so a change takes effect without relaunch. Under reduced motion, outcomes are preserved and only travel is removed; nothing is suppressed, delayed or reordered. | HARD | REQ-SHELL-135, REQ-SHELL-136, REQ-NOTIFY-022 |
| A6 | A theme change fully recolours everything, including baked icon inks, native dialog/menu/caret/disabled-text colours, and every live top-level window (windows mid-close skipped safely); re-selecting the active theme still applies fully. Cell geometry derived from the monospace face is **re-measured on theme change** and the new grid size re-reported to the backend. | HARD | REQ-SHELL-130, REQ-SHELL-031, REQ-SHELL-100, REQ-CHAT-058 |
| A7 | Icons: artwork raster ≥ `ceil(L × device pixel ratio)` in each dimension, verified at 100/125/150/175/200 % scaling and across a drag between monitors of different scale, covering the declared logical size within one device pixel. | HARD | REQ-SHELL-030, REQ-SHELL-160(d) |
| A8 | Focus rings are drawn **wholly within the control's own bounds**, at the theme's ring width and colour, clearing 3:1 — including on self-painted navigation controls and divider handles, which take focus and are named. | HARD | REQ-SHELL-148, REQ-SHELL-068, REQ-SHELL-160(c) |
| A9 | Two keyboard interaction patterns must be *different* and both are specified: the navigation rail is a set of buttons where arrows move nothing and Tab traverses; vertical navigation lists move focus with arrows **without** changing selection, selecting only on Space/Enter, marking selection with a left-edge rule announced in words. Tab strips select on Left/Right and Home/End, without wrapping. | HARD | REQ-SHELL-028, REQ-SHELL-152, REQ-SHELL-153 |
| A10 | The window refuses to resize below **1000×680**, opens at **1440×900**, and at the minimum every control on every one of the seven views lies wholly inside the bounds, is Tab-reachable, has its label rendered in full (two named elision exceptions), and needs no horizontal scrolling. Workspace compact mode below **1180 px** of the view's own width; status-strip elision at **1180 px** and **1080 px** of window width. | HARD | REQ-SHELL-022, REQ-SHELL-059, REQ-SHELL-047, REQ-SHELL-061, REQ-SHELL-064, REQ-SHELL-065 |
| A11 | A view whose dividers declare no defaults still opens determinately, by **equal division subject to minimums**, leftover logical pixels given one each to the leading panes in order; tolerance one logical pixel per pane. | HARD | REQ-SHELL-071 |
| A12 | Which styling technology expresses tokens is unconstrained. | FREE | REQ-WORKSPACE-153 |

### 2.7 Notices, acknowledgements, and dialogs

| # | Constraint | Label | Requirements |
|---|---|---|---|
| N1 | **Exactly one transient acknowledgement surface** in the product, a stack of at most 3, anchored to the bottom-right of the **host window's content area** with 16 px margins, drawn over all other content of that window, restored relative to the window on move or resize. A lone acknowledgement is that stack holding one member. Widths 520 px single / 360 px stacked, narrowed to host width less margins. Newest nearest the corner, 8 px gap, no reordering. Lifetime 4200 ms; timeout ≤0 means until removed. | HARD | REQ-NOTIFY-011 – REQ-NOTIFY-022, REQ-SHELL-112, REQ-SHELL-113 |
| N2 | **Exactly one persistent notice at a time per application session**, rendered as an inline banner below the title bar; the most recent publication is presented; no queue, no restoration, no re-presentation. Publications are **totally ordered** — applied one at a time in acceptance order, each assigned its identifier and its clearing rules applied before the next is accepted — with painting free to coalesce. | HARD | REQ-NOTIFY-023 – REQ-NOTIFY-026, REQ-NOTIFY-033, REQ-NOTIFY-259, REQ-SHELL-114 |
| N3 | Every `warning` or `error` notice is **recorded at publication** — title, body and technical detail unchanged — into that session's timeline, or into application diagnostics where no session applies. **Recording precedes rendering**, so a notice superseded within the same event-loop turn is still recorded. | HARD | REQ-NOTIFY-268, REQ-NOTIFY-262 |
| N4 | Channel choice is a rule, not a preference: a failure, a refusal, or an outcome carrying a recovery action must **additionally** be published as a persistent notice; anything else may be acknowledged transiently and reported nowhere else. | HARD | REQ-NOTIFY-003 |
| N5 | An error reaches the user in two parts: a plain-sentence headline naming what did not work, and a **separate, selectable, copyable** detail area for stack traces, provider payloads and subprocess output. A headline that is raw diagnostic output fails the requirement. | HARD | REQ-NOTIFY-005, REQ-NOTIFY-037, REQ-NOTIFY-038 |
| N6 | The notice **action vocabulary is closed**, and each action carries its object's identity so the handler acts without a further lookup. No action writes into the user's project. Named views, settings categories and library tabs are drawn from the owning domain's vocabulary, and an action naming a value outside it is not dispatched. | HARD | REQ-NOTIFY-044, REQ-SHELL-115 |
| N7 | Notice scoping: an empty session id means "the focused run"; a notice about another session survives an unrelated run start, whatever order start and completion events arrive in across threads; a starting run clears only unscoped notices and notices for that same session. | HARD | REQ-NOTIFY-028, REQ-NOTIFY-029, REQ-NOTIFY-058 |
| N8 | The status vocabularies the UI renders are **closed and owned elsewhere**, and the shell must never render a raw backend or persisted status string: nine normalised lifecycle members with a total mapping arm for each of the fourteen persisted values; four tool-row statuses; four notice severities; four acknowledgement kinds; seven provider statuses with a fixed precedence; four task display states. | HARD | REQ-NOTIFY-048, REQ-NOTIFY-049, REQ-NOTIFY-050, REQ-CHAT-060, REQ-CHAT-086, REQ-NOTIFY-200, REQ-SHELL-036 |
| N9 | Every region holding zero items shows, in its accessible tree and as ordinary content, both a sentence naming why it is empty and at least one instruction or control that would fill it. Every workflow makes six conditions distinguishable on screen without opening, expanding or querying anything. | HARD | REQ-NOTIFY-006, REQ-NOTIFY-001, REQ-NOTIFY-010, REQ-CHAT-073 |
| N10 | Repeating the gesture that began an in-flight action starts no second instance; meanwhile unrelated controls respond, the window repaints, and move/resize/close are honoured. | HARD | REQ-NOTIFY-007, REQ-STARTUP-114 |
| N11 | Wording of most messages is the implementation's, but a substantial set of strings is **fixed character-for-character** (composer placeholders, decline sentences, refusal reasons, empty-state copy, disabled reasons, dialog titles and bodies). Parenthesised "(s)" plural markers must never be rendered literally; counts agree grammatically including the zero case. | HARD | REQ-CHAT-004, REQ-CHAT-168, REQ-SHELL-044, REQ-SHELL-149, REQ-NOTIFY-261 |

### 2.8 The terminal panel and grid

| # | Constraint | Label | Requirements |
|---|---|---|---|
| X1 | Output is a **character grid**, not an append-only log, checkable by behaviour: cursor addressing overwrites cells, the alternate screen replaces and restores, a self-rewriting progress line updates in place. | HARD | REQ-SHELL-095 |
| X2 | **No keystroke reaches the process until take-control is armed.** While unarmed, any printable or named key raises a one-time informational banner and is consumed. Key handling priority is fixed in five ordered rules; Shift+Tab always leaves and is never forwarded. | HARD | REQ-SHELL-089, REQ-SHELL-090, REQ-SHELL-097 |
| X3 | The key encoding vocabulary is **closed**: named encodings for arrows, Home/End, PgUp/PgDn, Tab, BS, ESC, ENTER, `C-{letter}`; printable text verbatim; **a key with no encoding transmits nothing at all** and no substitute sequence is invented. | HARD | REQ-SHELL-096, REQ-SHELL-166 |
| X4 | The same stream is shown in **three places at once** — the transcript preview in the main window, the persona window's transcript card, and the pop-out grid — with identical visible cells, identical running/exited state and identical truncation indication, the persona card lagging by at most one refresh interval. Only the pop-out accepts input. Previews keep updating whether the pop-out is open or not. | HARD | REQ-SHELL-079, REQ-SHELL-102, REQ-SHELL-075 |
| X5 | Delivery is ordered frames with a monotonically increasing sequence number; metadata frames are idempotent; a late-attaching viewer receives everything accumulated so far; an already-applied sequence number is never applied twice, so no line is ever shown twice even when retained and fresh output are both being displayed. | HARD | REQ-SHELL-104, REQ-SHELL-105 |
| X6 | Display must never throttle execution: completion time and output are identical whether the window is open, closed, hidden or visible; when repaints cannot keep up, **no output is dropped and none is shown out of order**. | HARD | REQ-SHELL-103, REQ-SHELL-166 |
| X7 | Grid geometry: cell size from the theme's monospace face, re-measured on theme change and re-reported; a 6 px padding gutter; never fewer than 20×4; preferred 80×24; dimensions reported to the backend **only while visible and meaningfully laid out, and only when they change**, so a placeholder-size viewport can never shrink the emulated screen and discard output. | HARD | REQ-SHELL-100 |
| X8 | Scrollback: scrollbar range equals retained history rows; a refresh keeps the tail only if already at the tail; one wheel notch scrolls **exactly 3 rows**, high-resolution deltas scroll proportionally with the **fractional remainder accumulated across events** so slow continuous scrolling loses no motion; clamped at both ends, never wrapping. Selection is whole-cell, direction-independent, right-trimmed per row, newline-joined; an empty-selection copy puts nothing on the clipboard and **reports failure**. | HARD | REQ-SHELL-101, REQ-CHAT-075 |
| X9 | The cursor is painted only when *all three* hold — process running, grid focused, view at the tail — filled while armed, hollow while read-only. The theme's terminal background fills the entire widget throughout a resize, so no frame exposes the platform surface colour. Reverse video swaps per cell; bold, italic and underline apply per cell; the 16 ANSI colours are theme tokens. | HARD | REQ-SHELL-098 |
| X10 | User terminal input is **not a tool call**: it bypasses permission patterns but is written to the session permission audit log as user-originated input, one entry per submitted line, with control sequences flushing the pending line; navigation keys are not logged; a held key must not flood the log; both the typed line and the command context are secret-redacted before logging. | HARD | REQ-SHELL-107 |
| X11 | Interactive input and resize must be demonstrated **against a real pseudo-terminal**: echo within the 100 ms budget, order and fidelity preserved with nothing dropped, duplicated or reordered, interrupt and end-input observably acting within 500 ms, the process's own reported terminal size equal to the last reported grid size no later than its first output after the resize, a full-screen program repainting with no corrupted cells, and the emulated screen resizing even when the backend is gone. | HARD | REQ-SHELL-166, REQ-SHELL-106 |
| X12 | Which terminal emulator library provides the screen model is unconstrained, subject to X1–X11. | FREE | — |

### 2.9 Startup, distribution, and updates

| # | Constraint | Label | Requirements |
|---|---|---|---|
| U1 | Startup order is fixed and observable: preference scoping established → branded icon set → bundled fonts registered → persisted theme restored — **all before any window exists**; then the window is shown; then and only then repository discovery, the update check, and cloud-credit polling. Constructing a window without showing it must produce **no network traffic**. | HARD | REQ-STARTUP-040, REQ-STARTUP-043, REQ-SHELL-015, REQ-WORKSPACE-014, REQ-WORKSPACE-141 |
| U2 | **One shared deferred first-paint delay of 650 ms**, measured from the moment the window is shown, serves every deferred offer; the deferred workspace prompt is a one-shot abandoned unshown if the question has already been answered, so two folder choosers are never on screen at once. | HARD | REQ-SHELL-011, REQ-STARTUP-044, REQ-WORKSPACE-008 |
| U3 | The main window is painted within **5 seconds** of launch, on every published artifact and every bundle mode, with no per-flavour differential. The machine-setup empty-plan fast path is decided within the 100 ms budget and delays neither first paint nor post-show activation. | HARD | REQ-STARTUP-155 |
| U4 | Four published artifacts and no others, from a single naming authority: `Rotaris-{v}-windows-x64-setup.exe`, `Rotaris-{v}-windows-x64-portable.exe`, `Rotaris-{v}-macos-arm64.dmg`, `Rotaris-{v}-linux-x86_64.AppImage`. The Windows portable is the **only** single-file artifact; every other payload is a directory tree. macOS is ARM64-only, `rotaris.app`, bundle id `ai.rotaris.app`. Linux is an AppImage running unextracted on an unmodified Ubuntu 24.04. Windows installs strictly per-user under `%LOCALAPPDATA%\Rotaris` with no elevation. | HARD | REQ-STARTUP-031, REQ-STARTUP-013, REQ-STARTUP-014, REQ-STARTUP-020, REQ-STARTUP-022, REQ-STARTUP-024, REQ-STARTUP-016 |
| U5 | Binaries are **deliberately unsigned and un-notarized** on Windows and macOS; SmartScreen and Gatekeeper prompts are expected and disclosed. | HARD | REQ-STARTUP-021, REQ-STARTUP-023 |
| U6 | The update check contacts **exactly one endpoint** — the GitHub latest-release API of the product repository — with a 10.0 s timeout and `Accept: application/vnd.github+json`, once per window activation, only after the window is visible, and it **cannot be disabled by any user-reachable means**; the acceptance criterion is that four closed configuration enumerations contain no entry naming update checking, an endpoint, a release source, or a channel. | HARD | REQ-STARTUP-105, REQ-STARTUP-111, REQ-STARTUP-114, REQ-STARTUP-152 |
| U7 | Asset selection is **exact-name matching only** — same case, same separators, same literal version text; abbreviated, re-cased, re-separated, prefix, suffix and substring matches are all rejected, and a release with no exact match simply offers nothing. Verification is against `SHA256SUMS.txt` published with that release (two-space separator, sorted by filename, `sha256sum -c` compatible, never self-listed); a release publishing no manifest is refused as unverifiable. No signature is verified. | HARD | REQ-STARTUP-108, REQ-STARTUP-032, REQ-STARTUP-113, REQ-STARTUP-123, REQ-NOTIFY-219 |
| U8 | Every asset a release publishes, every filename its manifest lists, and every filename the update client asks for are values of that **one** naming scheme and must agree. | HARD | REQ-STARTUP-152, REQ-STARTUP-035 |
| U9 | Four apply strategies selected by **installation flavour, not operating system**, each with a fixed observable result: AppImage — hidden sibling `.{name}.update` on the same filesystem, then moved onto the target at mode 0755, succeeding while the running application is still running; Windows portable — new file beside the target, old backup deleted, running executable renamed to `<name>.old`, new file moved in, with rollback on failure and `<name>.old` cleaned up on a later launch; Windows installer — setup executable started as a surviving process, the application editing nothing itself, window auto-closing after 1200 ms; macOS — disk image mounted and revealed, **the installed bundle left byte-for-byte unchanged and never replaced automatically**. | HARD | REQ-STARTUP-125, REQ-STARTUP-119, REQ-STARTUP-115, REQ-NOTIFY-220 |
| U10 | Not one file of the existing installation is moved or modified before the replacement has been fetched in full and verified; a failure at any stage leaves what is installed byte-for-byte what it was. | HARD | REQ-STARTUP-126 |
| U11 | Windows flavour classification is decided by the **installer's own registry record** (`HKCU\Software\Rotaris\InstallDir` existing *and* the running executable resolving inside it), every other Windows standalone build being portable; AppImage is identified from the `APPIMAGE` variable and that test runs first; a build not running from a released artifact is not updatable and issues no request at all. | HARD | REQ-STARTUP-106 |
| U12 | A failed update **check** is always invisible (log only; there is no user-facing failure path at all); a failed update **install** is always visible as a persistent error notice with copyable detail and a retry action. | HARD | REQ-STARTUP-110, REQ-STARTUP-120, REQ-STARTUP-150 |
| U13 | Update download progress is reported **inside the offer notice, updated in place, never replaced**, at whole-percent granularity (or whole MiB when the size is unknown), with the action disabled for the duration and its accessible description saying why, and a final update published when the download settles. | HARD | REQ-SHELL-118, REQ-STARTUP-118, REQ-NOTIFY-218 |
| U14 | Exactly one waved-off version is remembered — never a list — recorded **before** the notice naming it is cleared, and only by that notice. | HARD | REQ-SHELL-118, REQ-STARTUP-116, REQ-STARTUP-117, REQ-NOTIFY-262 |
| U15 | Shutdown is checkable from outside the process: no persona window, artifact dialog or terminal window left on screen; a diagnostics run leaves a complete readable directory; an in-flight update download leaves no partially written and no locked file; no error dialog and no crash report; in-flight update work waited for **at most 5000 ms**. | HARD | REQ-SHELL-121, REQ-STARTUP-046 |
| U16 | Demo mode is a **property of a window fixed when that window is built**, never toggled in an open window, never persisted, never inherited by a replacement window; a demo window carries a non-colour "Demo" marker for its whole life, never writes `workspace/lastOpened`, never prompts for a workspace, and performs no update or cloud network traffic on any runtime. Demo content is a constant of the build — identical on any machine at any time, derived from no clock, host, directory or random source. | HARD | REQ-SHELL-162, REQ-SHELL-005, REQ-STARTUP-055, REQ-STARTUP-056, REQ-STARTUP-057 |
| U17 | Bundle mode, installer technology and build tooling are unconstrained provided U4 holds. | FREE | REQ-STARTUP-001, REQ-STARTUP-036 (both withdrawn) |

### 2.10 Diagnostics

| # | Constraint | Label | Requirements |
|---|---|---|---|
| D1 | When diagnostics is off, **no diagnostics files, timers or instrumentation of any kind exist** — zero work, zero disk writes. Activation has exactly one source, the preference store; no environment variable and no other surface sets either value. | HARD | REQ-STARTUP-130, REQ-STARTUP-129 |
| D2 | Every metric record (one per 1000 ms) carries, among others: OS thread count with names, the count and names of the concurrent execution contexts the application itself creates, handle/fd count, live widget and object counts, measured event-loop lag, **one per-view entry for each of the seven primary views** keyed by its lower-cased name carrying visibility, live widget count and principal-collection size, and **counts only** for session stores. | HARD | REQ-STARTUP-134 |
| D3 | **No diagnostics file may contain session content of any kind** — no transcript or prompt text, no model or tool output, no file contents, no credentials — and stack frames identify source files by base name only, never a directory path. | HARD | REQ-STARTUP-134, REQ-STARTUP-136 |
| D4 | Bounded on disk: 4 segments × 8 MiB per stream, oldest replaced; 16 MiB total snapshot budget, further writes refused without raising an error; statistics over rings of 4096 metric and 1024 span samples; ≤128 distinct span names with the rest under `__other__`; a 250 ms heartbeat whose lag reading is the inter-heartbeat interval minus 250 ms. Every bound and cadence in force is readable from `manifest.json`. | HARD | REQ-STARTUP-133, REQ-STARTUP-157 |
| D5 | A diagnostics **view** that cannot read or render its own data reports that within itself and nowhere else, as that region's empty condition, publishing no notice and no acknowledgement; unreadable records are skipped and counted rather than failing the view. | HARD | REQ-NOTIFY-267 |
| D6 | Field names and nesting of the diagnostics files are the implementation's, stable within a schema version; units are fixed (ms, bytes, bytes/s, whole-number percentages, ISO-8601 UTC). | HARD (units, stability); FREE (names) | REQ-STARTUP-157 |

---

## 3. ADR proposals

Numbering is local to this slice; the synthesis step assigns final numbers.

### ADR-UI-01 — Where authoritative UI state lives, and how the renderer stays in step

**Decision.** Which process owns the state the interface renders, and by what mechanism a renderer
converges on it while a run executes elsewhere.

**Constraints that bear on it.** S1–S13 (the whole sync contract), T2 (the notice store belongs to
the process, not a window), T3 (the prompt queue is shared across windows and runs), T4 (two main
windows coexist during a workspace switch), T5–T6 (auxiliary windows show the same data and must do
zero work while hidden), R2 (rows are released to and paged back from the session record), B3
(the apply stage's counters must be identical across fresh processes).

**Alternative A — renderer-authoritative store.** Each renderer owns a Zustand store that is the
source of truth for what it draws; the main process forwards raw events and the renderer folds them
in.

*For:* the simplest React data flow; no serialisation on the read path; selectors are cheap.
*Against:* it breaks T2 outright — the notice store must survive window re-creation within one
process, and a renderer-owned store dies with its window. It breaks T4 — during a workspace switch
two renderers would independently fold the same events. It makes S3 (persist before publish)
unenforceable from the renderer's side, and S9's "decline and re-read from a whole read" becomes a
renderer-initiated file read, which conflicts with R2's requirement that paging happen off the
interface thread against the session record. Every auxiliary window would fold events independently,
so X4's "identical visible cells at the same time" becomes a race rather than a guarantee.

**Alternative B — main-process authoritative projection; renderers hold a derived replica.** The
main process holds one *session view model* per followed session, built only from what has already
been persisted (S3). It publishes on the two channels S1 fixes. Each renderer holds a replica store
whose only writers are the two channel handlers and purely local UI state (scroll anchor, expansion
map, composer text, search query, drawer open state).

*For:* T2 and T3 fall out — the notice store and the queue live beside the projection, in the
process, and every window observes them. S3 is enforced structurally: the projection has no path to
a value that is not yet durable. S11 is a single-writer concern rather than a distributed one. T4
works because two renderers subscribe to two different session view models from the same owner.
S10 is enforceable: the publisher never awaits a renderer.
*Against:* every update crosses a process boundary and is serialised, which costs against S6/S7;
duplicated state in N renderers costs memory; the replica can drift if a channel handler has a bug,
which is exactly why S9's decline-and-re-read path is mandatory rather than optional.

**Alternative C — renderers read the persisted session record directly.** No push; each renderer
polls and reads `state/ui_transcript.json` and friends itself.

*For:* one source of truth, no replica drift, paging (R2) is a local read.
*Against:* fails S5 — "published immediately, no delay floor of any size" cannot be met by polling,
and the 750 ms/2000 ms cadences of S8 are explicitly described as a *correctness backstop* for a
local run, not the delivery path. Fails S7's "a session with nothing happening does no work at all".
Puts file I/O on the interface thread or forces a second worker per window. Multiplies read
amplification by the number of open windows.

**Recommendation: Alternative B.** The specification's own shape — two channels, earliest-changed
index, persist-before-publish, whole-session snapshot carrying every displayable field, a view that
may *decline* an increment — describes a publisher/replica pair with a re-read escape hatch. That is
alternative B almost verbatim.

Specifics of the recommendation:

- **One projection owner per followed session**, living in the main process next to the notice store
  and the prompt-queue service. It is the only thing that reads the session record for display.
- **Renderer store is Zustand**, but with a discipline: the two channel handlers are the only
  writers of run-derived state, and they write through a single `applyIncrement` /
  `applySnapshot` pair (see ADR-UI-04). Local-only UI state lives in separate slices so it can
  survive a `reset` without being republished. Zustand is a good fit here — it is a plain store with
  cheap selector subscriptions and no context re-render fan-out — but nothing in the specification
  requires it; any store with equality-checked selectors would do.
- **Renderers never read a session file.** Paging older rows (R2) is a request to the owner, which
  serves it from the live window or the archive and returns a span; "off the interface thread"
  is satisfied because the read happens in another process entirely.
- **Hidden windows unsubscribe.** T6 requires zero repaints *and* zero timers while off screen. A
  hidden renderer tells the owner it is not observing; on becoming visible it requests a whole
  snapshot and applies it before its first paint. This also gives the persona window's "closing
  hides rather than destroys" (T5) its meaning: the window and its DOM survive, its subscription
  does not.

**Consequences accepted.** Serialisation cost on every update, which ADR-UI-02 must budget for.
Replica drift is possible in principle, so the decline-and-re-read path is load-bearing and must be
exercised by tests rather than treated as an error branch. The main process becomes a place where a
slow projection can stall every window, so the projection must never do unbounded work synchronously.

**Revisit if.** The measured cost of crossing the process boundary threatens S6's 100 ms figure for
the run surfaces of REQ-ORCH-155; or the orchestration slice puts run execution in a third process
in a way that makes the main process a pure relay, at which point a direct runtime→renderer channel
may be cheaper (it would still have to preserve T2, T3 and S3).

**Open question.** REQ-CHAT-041 scopes the prompt queue's visibility to windows and runs "sharing
the same process", while the candidate stack proposes a separate runtime process for run execution.
If the orchestration slice takes that route, REQ-CHAT-038's atomic `QUEUED → TRIGGERED` transition
becomes a cross-process exactly-once problem. This is not mine to decide, but it must be decided
before ADR-UI-02's channel list is fixed.

---

### ADR-UI-02 — The IPC contract between the renderer and the rest of the system

**Decision.** What crosses the renderer/main boundary, in what shape, over what mechanism, and how
it is versioned and secured.

**Constraints that bear on it.** S1–S13; T1 (no second executable, so no external socket surface is
expected); T5 (several renderers observing overlapping data); S6 (100 ms and 250 ms p95 budgets);
S7 (2× cost ceiling at 10,000 rows); B4/B5 (the same path must work in an offscreen child process);
D3 (nothing crossing the boundary may end up in a diagnostics file as session content).

**Alternative A — one generic bidirectional event bus.** A single `ipcRenderer.on('event')` channel
carrying tagged messages, with a matching generic `invoke('command', …)`.

*For:* trivial to extend; one place to instrument; easy to record and replay for the benchmark.
*Against:* it puts the two channels S1 distinguishes into one lane, and S5 explicitly gives them
different timing rules (immediate for unseen rows, 50 ms trailing coalesce for growth). A single lane
means a whole-session snapshot can head-of-line-block an unseen transcript row. It also erases the
type boundary: S2 requires the snapshot to carry *every* displayable field, which is a property you
can only test if the payload has a declared shape.

**Alternative B — a small number of named, typed channels with a declared payload contract.**
Distinct channels for: transcript increment, whole-session snapshot, terminal stream frames, notice
publication/clearing, and a request/response surface for commands. Payload types are declared once in
a shared package and are the same types the projection produces and the replica consumes.

*For:* matches S1's two-channel shape and lets S5's two timing rules live in two different senders.
Terminal frames (X5, up to 250 ms repaint cadence and high volume) get their own lane so they cannot
delay a transcript row. Makes S2 checkable: "the snapshot type has a field for every field a view
component reads" is a compile-time property if the view components are typed against the same model.
*Against:* more surface to keep in step; a channel added carelessly re-creates alternative A's
problem one channel at a time.

**Alternative C — a shared read replica in the renderer backed by the database.** The renderer opens
the SQLite file read-only and subscribes to change notifications.

*For:* no serialisation of bulk state; the renderer can page rows itself.
*Against:* requires Node integration in the renderer, which forfeits the process isolation that makes
`contextIsolation` meaningful; two writers/readers of one SQLite file across processes brings locking
into the interface thread; and it still cannot satisfy S5's immediate publication without a push
channel on top, so it is alternative B plus a second mechanism rather than instead of it.

**Recommendation: Alternative B**, with these specifics.

- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`** in every renderer. A
  preload script exposes exactly one frozen namespace built from an explicit method list. This is not
  a security posture chosen for its own sake: the transcript renders Markdown authored by a model
  (R11), and the terminal grid renders bytes authored by an arbitrary process (X1).
- **Five channels**, each with a declared payload type:
  1. `transcript:increment` — `{ sessionId, fromIndex, rows[], diffs[], personas[] }` (S1, S4).
  2. `session:snapshot` — the whole-session update of S1/S2, bounded collections in full.
  3. `terminal:frames` — `{ streamId, seq, kind: 'data' | 'meta', … }` (X5).
  4. `notice:current` — the single current notice or null (N2), plus the acknowledgement stream.
  5. `command` — request/response, every command returning an explicit outcome value rather than
     throwing across the boundary (N5 needs a headline and a detail block, which is a value, not an
     exception).
- **Every payload carries the `sessionId` it belongs to** and the renderer discards any payload whose
  session is not the one it is currently showing (S11). This is cheap and it makes the focus-change
  race structurally impossible rather than timing-dependent.
- **Structured clone, not JSON strings.** Electron's IPC uses the structured clone algorithm;
  hand-serialising to JSON adds a parse on both sides for no benefit. Rows should be plain objects
  with no class instances, no `Map`/`Set` in hot payloads (they clone, but more expensively), and no
  functions.
- **The increment is bounded by construction.** S4 says an increment carries rows from
  `fromIndex` onward. For an append that is one row. The sender must never publish `fromIndex = 0`
  for anything but a genuine reset (S4/REQ-MONITOR-229), because doing so silently converts every
  update into a whole-transcript transfer and breaks S7's 2× ceiling at 10,000 rows. This deserves an
  assertion in the sender and a counter in diagnostics.
- **Versioning.** The payload contract carries a schema version. A renderer receiving a version it
  does not understand declines every increment and re-reads (S9) rather than guessing. This matters
  because the benchmark launches a child process of the same build, so the versions always agree
  there — the check exists for the case where a stale renderer survives an in-place update.

**Consequences accepted.** Five channels is five things to keep in step; the payload types become a
shared package that both the main-process projection and the renderer depend on, which is a coupling
we are choosing deliberately so that S2 is checkable. Sandboxed renderers cannot read files, so every
file-touching capability the UI needs (attachment thumbnails per R16, the third-party licence bundle,
the diagnostics directory) must be routed through an explicit command with a path-validating handler.

**Revisit if.** Measurement shows structured-clone cost dominating the 250 ms p95 for large snapshots
— in which case the snapshot should be split by collection rather than the boundary being removed;
or if a fourth window type appears whose data is disjoint enough to want its own lane.

**Open question (design).** The channel list above is derived from the sync requirements, not from
the information architecture. If the approved design reference introduces a surface fed by data no
current requirement names, the snapshot type must grow rather than a sixth channel appearing —
S2 makes the snapshot the single carrier for non-transcript state.

---

### ADR-UI-03 — What paints the transcript

**Decision.** The rendering substrate for the transcript list: what a row is made of, how rows are
virtualised, and how the structural-count invariant of the benchmark is satisfied.

**This is the decision in my slice with the tightest constraint, and the one most likely to be got
wrong by defaulting to the obvious React answer.**

**Constraints that bear on it.** R1 (cost by visible and changed rows only), R2 (bounded residency
with paging), R3 (measurement and rendering caches with LRU and a precise reuse key), R6 (anchor-based
scroll restoration), R8 (fixed pixel metrics), R11 (Markdown, synchronous, character-exact pointer
selection over rendered bodies), R12 (full keyboard navigation, accessible names, hover styling),
**B1 (the live paintable element count must not change after `construct_window`)**, B4 (the same
rendering path under replay as live), B7/B8 (10 ms lag probe; an observable "finished showing"
signal), B9 (memory tripwire).

**The problem B1 creates.** A conventional keyed React list mounts and unmounts DOM elements as rows
enter and leave the window and as content changes. Under the benchmark's seven phases the transcript
is bulk-applied, cleared and re-appended event by event, streamed prefix by prefix, tail-replaced
1000 times, re-applied unchanged, and resized five times. Every one of those changes the number of
mounted elements. `widgets_stable_after_warmup` would be false for every iteration, and — more
seriously — REQ-UIBENCH-054 states the rule in MUST form: after the `construct_window` record is
taken, "the `widgets` value must not change". The invariant boolean is informational
(REQ-UIBENCH-088), but the rule it reports is not. A design that cannot hold the count steady does
not satisfy REQ-UIBENCH-054, whatever the report says.

**Alternative A — keyed React list with a standard virtualiser (react-window, TanStack Virtual).**

*For:* idiomatic; variable row heights are a solved problem; accessibility, selection and links come
free from the DOM; R11's character-exact selection over Markdown is native browser behaviour;
R12's keyboard navigation is ordinary focus management.
*Against:* fails B1. Rendered element count tracks visible row count and each row's internal content,
both of which change constantly. It also sits awkwardly with R3: React owns element identity, so "a
retained rendering is reused only while identity, content, laid-out width and expansion state are
unchanged" becomes a memoisation convention rather than an enforced cache with an observable
entries/chars occupancy (R4).

**Alternative B — canvas-painted transcript.** One canvas element per transcript, rows measured and
painted by our own code, with a retained-rendering cache of offscreen bitmaps.

*For:* B1 becomes trivial — one element, forever. R3, R4 and R8 map directly onto a measurement cache
and a painted-tile cache with real occupancy figures. Paint cost is exactly "visible rows", satisfying
R1 by construction. It is the closest analogue to what the specification's own vocabulary describes
("retained row measurements and retained row renderings", "re-measuring only it", "redrawn on every
repaint").
*Against:* it forfeits the DOM's accessibility and selection, and both are hard requirements. R11
demands pointer selection of exactly the characters covered, in every row category including rendered
Markdown; R12 demands keyboard navigation and per-row accessible names; A3 and A4 demand accessible
descriptions everywhere; REQ-CHAT-060 and REQ-CHAT-065 demand accessible descriptions on tool rows
and group headers. Meeting those over a canvas means building and maintaining a parallel
accessibility tree and a text-selection model by hand — a large, permanently load-bearing subsystem
whose failure mode is "a screen-reader user cannot read the conversation". That is too much risk to
take for a benchmark counter.

**Alternative C — a fixed-capacity recycled DOM row pool.** The transcript is a scroll container
holding a **constant** number of absolutely positioned row slots, allocated at window construction and
never added to or removed from. Scrolling and content changes rebind slots to row indices and mutate
their contents in place; a slot showing nothing is emptied rather than unmounted. Row *content* is
produced by a per-slot renderer that reuses a cached rendering when R3's four-part key matches.

*For:* B1 holds if the pool is fixed and content mutation does not change the element count within a
slot. Rows are DOM, so R11's selection, R12's keyboard navigation and accessibility, A4's tooltips
and descriptions, and A7's vector icons all remain native. R1 holds — work is proportional to visible
slots and changed slots. R6's anchor restoration is natural because slots are positioned from a
measured offset table rather than from document flow. R3's caches are explicit objects with real
occupancy, satisfying R4.
*Against:* it is a recycler, not a React list — the slot index must be the React key, never the row
identity, or React unmounts and remounts. Content mutation within a slot must also be count-stable,
which is the hard part: a Markdown body produces a different number of elements for different
content. Variable row heights need our own measurement pass. It is more code than alternative A, and
it is code that must be right.

**Recommendation: Alternative C, with the content-count problem solved explicitly.**

The pool gives B1's *outer* stability. The remaining question is what "live visual elements" means
inside a row. REQ-UIBENCH-050 is explicit that both structural counts are "defined against the
interface framework the product is built on", that their absolute values are comparable only between
two runs of one product revision, and that they are "deliberately not comparable between product
revisions or between implementations". That is licence to *define* the counting rule for a
DOM-based interface — but the definition must stay honest against the words "live visual elements of
the constructed window — those that occupy space in the window's layout and can be painted".

The honest and satisfiable definition:

- **`widgets`** = the count of live **structural elements the application's own layout owns**: the
  seven views' panes, the navigation rail, title bar, status strip, the fixed transcript slot pool,
  the fixed list-slot pools of the agents, todo, artifact and board surfaces, the composer and its
  chips. Every one of these is allocated at window construction and is count-stable thereafter. Each
  occupies space in the layout and can be painted, so the definition is met.
- **Content nodes inside a slot** — the spans, code blocks and links a Markdown body produces — are
  counted in `ui_objects`, which is explicitly informational and unbounded (B2). This is where the
  variance goes, and REQ-UIBENCH-109 has already said that no invariant reads it and no value it
  takes changes any outcome.

This split is what makes B1 achievable for a DOM interface without misreporting. It should be written
down once as the product's definition of both counters and cited from the benchmark's own code, so a
later reader does not conclude the counter was gamed.

Further specifics:

- **Pool size is a function of viewport height and the 30 px minimum row height of R8, fixed at
  construction and re-derived only during `construct_window`.** The resize sweep of the seventh phase
  moves between 1000×680, 1440×900 and 1180×760, so the pool must be sized at construction for the
  largest viewport the window can reach without growing. That is a design obligation, not an
  optimisation.
- **Every other list surface with unbounded content uses the same recycler** — agent tree, todo strip,
  artifact list, requirements board columns — because `apply_fixture` populates all of them *after*
  the `construct_window` record is taken.
- **Row heights are measured, not assumed.** A measurement cache keyed by (row identity, content,
  laid-out width, expansion state) — exactly R3's key — feeds a prefix-sum offset table, which is what
  makes R6's anchor restoration and R14's scroll-to-centre exact rather than approximate.
- **The "finished showing" signal B8 needs** is a paint-completion promise: after applying a state,
  resolve once layout has settled and a frame has been presented. This must be a first-class part of
  the apply pipeline rather than benchmark-only code, because B4 forbids a benchmark-specific
  rendering path. It is also what the 30 s settle bound of REQ-UIBENCH-119 is measured against.

**Consequences accepted.** We write and own a virtualiser rather than adopting one. The transcript
becomes the most intricate component in the product and needs its own test suite covering R1, R3, R5,
R6, R7 and B1. Contributors must know the transcript is a recycler and that ordinary React list
idioms are wrong inside it. The `widgets`/`ui_objects` split becomes a documented product definition.

**Revisit if.** A measured DOM recycler cannot hold R1's 200 ms budget at 1000+ rows with Markdown
bodies, in which case alternative B returns — but only together with a costed plan for the
accessibility tree, because R11, R12, A3 and A4 do not bend.

**Escalation.** None. This is a build-mechanism choice, invisible to the user except through the
performance and accessibility behaviour the specification already fixes.

---

### ADR-UI-04 — The transcript apply pipeline, and where determinism is enforced

**Decision.** How an incoming transcript state becomes what is on screen: who diffs, who decides an
increment is inapplicable, and where the six operation counters come from.

**Constraints that bear on it.** S4, S5, S9 (decline and re-read), S12 (trailer rows computed, not
recorded), R5 (expansion keyed by identity), R6 (anchor), R7 (follow state), R13 (folding), R14
(search over displayed rows), **B3 (six cumulative counters, classified by comparing incoming state
with displayed state, identical across fresh processes)**, B10 (only structural values must be
reproducible).

**Alternative A — let React's reconciler be the apply stage.** Push the new row array into the store
and let React work out what changed; derive the counters from render callbacks.

*For:* no second diff to write.
*Against:* B3 requires counters classified against *the state currently displayed*, with a distinction
between `refused` (a valid-shaped application the view declined) and `noop` (an accepted application
that changed nothing) that React has no notion of. It also requires the totals to be a pure function
of the sequence of states applied — React's scheduling is not something to hang a determinism claim
on. And S9's "decline the increment" is a decision that must be made *before* anything is applied,
which is upstream of any reconciler.

**Alternative B — an explicit, synchronous view-model stage in front of the renderer.** Incoming
state (increment or snapshot) enters a pure function together with the currently displayed view
model; it returns either a refusal, or a new view model plus a classified operation list. The
renderer then renders the new view model.

*For:* B3's counters are the natural output of that function. S9's decline is its first branch.
R13's folding, S12's trailer-row appending, R10's cap application and R14's search index all belong
in the same stage — they are all "what the displayed rows are", as distinct from "what the session
record holds". Being pure and synchronous makes it directly unit-testable and makes B3's
cross-process identity a property of the function rather than of the environment.
*Against:* a second model to keep in step with the session record; a class of bug where the view model
and the record disagree, which is precisely what S9's re-read exists to correct.

**Recommendation: Alternative B.** The pipeline, in order, on receipt of a transcript increment:

1. **Applicability check.** Is `fromIndex` within the rows this view holds, and does the increment
   preserve the order of rows already displayed? If not → classify `refused`, do nothing else, and
   request a whole read (S9). Refusal is an ordinary reported outcome and must not interrupt the user
   or blank the transcript (REQ-CHAT-052).
2. **Reset check.** `fromIndex = 0` on a shrunk transcript, or a snapshot after a session focus change
   → classify `reset`, discard the displayed rows, rebuild (S4, S11, REQ-MONITOR-229).
3. **Row-level classification.** Otherwise compare incoming with displayed from `fromIndex`: one
   `insert` per row added, one `remove` per row removed, one `update` per retained row whose content
   changed; if nothing changed at all, one `noop` and no row counters (B3's exact rule).
4. **Projection.** Apply the row-role → display-kind mapping (R9), duplicate-reasoning and
   dead-session hygiene (REQ-CHAT-048, REQ-CHAT-049), edit-diff row placement (REQ-CHAT-050), tool
   grouping (R13), display caps (R10), and finally append the computed trailer rows (S12).
5. **Present.** Hand the new displayed-row array to the recycler of ADR-UI-03 together with the
   preserved anchor (R6) and expansion map (R5), and resolve the paint-completion promise (B8).

Notes that follow from the constraints and are easy to get wrong:

- **The counters are cumulative for the life of the process and never reset between phases** (B3).
  They belong to the view-model stage, not to a component instance, and must survive a `reset`.
- **`refused` and `noop` both leave the view unchanged; only the reason differs.** The classification
  must be taken from the applicability decision, not from whether pixels changed.
- **Grouping is on by default and must apply increments correctly** by treating a row that cannot join
  a group as a group boundary; the agent-scoped filter is off by default and is allowed to decline
  (REQ-MONITOR-224). Both live in step 4, so both are covered by the same refusal path.
- **The search index is derived from displayed rows** (R14), which means it is invalidated by step 4
  and not by step 3 — a change that only alters a cap or a grouping setting still invalidates it.
- **Determinism has a concrete threat: iteration order.** Any use of object key order, `Set`/`Map`
  insertion order derived from asynchronous arrival, or a hash seeded per process would make B3's
  cross-process identity fail. The stage must sort by explicit keys wherever order matters and must
  not use randomness, wall-clock time, or locale-sensitive comparison (`localeCompare`) anywhere in
  its output path. `LANG=C`/`LC_ALL=C` in the benchmark environment (B5) will surface a locale
  dependency as a difference rather than hiding it, which is useful, but the code should not have one.

**Consequences accepted.** A view model distinct from the session record, with the drift risk that
implies; a decline path that must be tested deliberately, since in normal operation it never fires;
and a rule that no transformation with an environment-dependent result may live between the incoming
state and the presented rows.

**Revisit if.** The projection stage becomes the dominant cost in S6's 250 ms p95 at large session
sizes — in which case the fix is incrementalising step 4 (projecting only from `fromIndex`), not
removing the stage.

---

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

### ADR-UI-09 — Notices, acknowledgements, and the recovery surfaces

**Decision.** Where the notice store lives, how single-slot replacement and total ordering are
enforced, and how the acknowledgement stack is rendered.

**Constraints that bear on it.** T2 (the notice store belongs to the process), N1–N11, S3 (persist
before publish, which N3's record-before-render mirrors), T4 (a window is re-created during a
workspace switch and must render whatever notice is current), T5 (secondary windows render their own
banner), A5 (motion tokens and reduced motion).

**Alternative A — renderer-owned notice state.** Each window keeps its own notice slot; the main
process forwards publication events.

*For:* rendering is local; no boundary crossing to read the current notice.
*Against:* fails T2 twice over. Identifiers must be unique across every window of the process and
monotonic across window re-creation, which a per-renderer counter cannot provide. And a window
re-created within one process must render whatever notice is current, which requires the notice to
have outlived the previous window. It also makes N2's total ordering a distributed problem.

**Alternative B — a single notice store in the main process; renderers render a projection of it.**

*For:* T2 falls out. Total ordering (N2) becomes a single-threaded queue in one place: accept, assign
identifier, apply clearing rules, record if warning or error (N3), then publish. N7's scoping rules
are evaluated once, by the owner, rather than N times by N windows with N views of which session is
focused. N3's "recording precedes rendering" is enforceable because recording and rendering are on
opposite sides of a boundary and the recording side goes first.
*Against:* a publication crosses the boundary before it is seen, adding latency to a surface that is
often the report of a failure. In practice this is one small message and is well inside the 100 ms
gesture budget.

**Recommendation: Alternative B.**

Specifics:

- **One notice store per application process**, holding at most one current notice (N2), with a
  monotonically increasing identifier that is never reset while the process lives. `clear(id)` is a
  compare-and-clear: it removes the current notice only if the identifiers match (N2/REQ-NOTIFY-026),
  so dismissing a superseded notice leaves its successor standing.
- **Publication is a serialised queue, not a callback.** N2 requires publications to be "applied one at
  a time and in the order they were accepted, each one assigned its identifier and its clearing rules
  applied before the next is accepted, so no two publications interleave". That is a queue with a
  single consumer. Several publications in one turn of the loop all get applied, the last one wins on
  screen, and painting may coalesce — the absence of an intermediate frame is explicitly allowed.
- **The record-then-render order of N3 is the queue's first step**, before the identifier is even
  handed back, so a notice superseded within the same turn is still recorded to the session timeline
  or to application diagnostics.
- **The acknowledgement stack is per window** and is *not* the notice store: N1 makes it a
  window-content-area-anchored surface, so each window that raises one owns its own stack of at most
  three. Its lifetimes, widths, motion and glyphs are all fixed figures and should be a single shared
  component consumed by the main, persona and terminal windows alike (REQ-SHELL-146 sweeps auxiliary
  windows independently).
- **The channel-choice rule of N4 is enforced at the call site by types, not by convention.** A
  failure, a refusal, or an outcome carrying a recovery action is published through a function that
  raises both surfaces; anything else goes through the acknowledgement-only function. Making these two
  different functions is what stops a refusal from being reported as a toast that disappears —
  REQ-NOTIFY-178 calls that out as an explicit failure mode.
- **The action vocabulary of N6 is a closed discriminated union carrying its parameter**, and the
  dispatcher refuses an action naming a view, settings category or library tab outside the owning
  domain's vocabulary. Because the vocabularies belong to other domains (REQ-SHELL-023,
  REQ-CONFIG-269, REQ-LIBRARY-103), they are imported rather than restated — an action type that
  restates a category list would drift.
- **Status vocabularies (N8) are imported types, never string literals at a call site.** The
  normalisation of REQ-NOTIFY-049 — fourteen persisted values onto nine presentation members, with a
  catch-all reachable only from a foreign version — is one total function, written once, with a test
  per arm. No surface may see a raw persisted status.
- **The two motion figures and the reduced-motion rule are theme tokens read at animation start**
  (A5), never cached, so flipping the OS setting while running takes effect.

**Consequences accepted.** Notices cross the boundary. The recovery dialogs of REQ-NOTIFY-072 to
REQ-NOTIFY-080 and the quota-wait surface of REQ-NOTIFY-263 stay in the renderer as ordinary
components fed by the session snapshot — only the *notice* is centralised, not every failure surface.
The temptation to let a component publish a notice directly must be resisted, or N2's ordering
guarantee is lost.

**Revisit if.** A requirement appears for more than one notice on screen at once — REQ-NOTIFY-181's
per-requirement standing banners are close to that, and belong to the requirements board rather than
to the shell banner slot; if that boundary moves, the single-slot store is what changes.

---

### ADR-UI-10 — The terminal grid and the fan-out of one stream to three views

**Decision.** What provides the terminal screen model and its rendering, how input is gated, and how
one stream is shown identically in three places.

**Constraints that bear on it.** X1–X11, T5/T6 (the terminal window is one per main window, hidden
windows do no work), A6 (cell geometry re-measured on theme change and re-reported), S8 (250 ms
live-row refresh while a terminal stream is live; 120 ms terminal-window header refresh), R13 (an
unsettled live terminal row never folds).

**Alternative A — xterm.js with its default input and link handling.**

*For:* a mature VT parser, a correct screen model including the alternate screen (X1), per-cell
attributes and reverse video (X9), and a fast renderer.
*Against:* as configured by default it *is* the input path — it attaches key handlers and writes
sequences to whatever is attached. X2 forbids a keystroke reaching the process until take-control is
armed; X3 forbids inventing any sequence for a key outside a closed vocabulary; X8 fixes wheel
scrolling at exactly 3 rows per notch with fractional accumulation, which is not xterm.js's own
`scrollSensitivity` behaviour. Adopting the defaults would fail three hard constraints quietly.

**Alternative B — xterm.js used as a *screen*, with the product owning input entirely.** The emulator
receives bytes and maintains the grid; every key event is intercepted before xterm.js sees it, and
what reaches the process is produced by our own encoder implementing X3's closed vocabulary.

*For:* keeps the hard part (VT parsing, alternate screen, wide characters, per-cell attributes) and
replaces exactly the parts the specification fixes differently. X2's arming gate, X3's
transmit-nothing-for-unknown-keys rule, X7's priority ordering and X8's wheel arithmetic all become
our code, which is where the requirements put them. Theme integration is straightforward: the 16 ANSI
colours are theme tokens (X9) and the cell geometry derives from the theme's monospace face (X7).
*Against:* we are fighting a library's defaults, which needs discipline — `attachCustomKeyEventHandler`
returning false for everything, no `onData` wiring to the backend, our own wheel handler, our own
selection-to-text extraction to satisfy X8's right-trim-and-newline-join rule.

**Alternative C — our own VT parser and grid.**

*For:* total control; nothing to fight.
*Against:* a VT parser is a deep, adversarial surface — the bytes come from arbitrary programs. Getting
the alternate screen, scroll regions, wide/combining characters and attribute handling right is a
project of its own, and X11 demands demonstration against a real pseudo-terminal with full-screen
programs repainting without corrupted cells. Not worth it.

**Recommendation: Alternative B.** Specifics:

- **One screen model per stream, in the renderer that owns the main window**, fed by the ordered
  frames of X5 with their sequence numbers. Metadata frames are idempotent; a frame whose sequence has
  been applied is dropped. This is the mechanism behind X5's "no line is ever shown twice" when
  retained and fresh output arrive together.
- **Three views over one model, not three models.** The transcript preview, the persona-window card
  and the pop-out grid all render from the same screen state. X4 requires identical visible cells at
  the same time and allows the persona card to lag by at most one refresh interval, which the shared
  model gives for free; three independently fed emulators would make it a race. The persona window is
  a separate renderer, so it receives the *screen state* (a serialised snapshot of the visible cells
  plus the metadata flags), not the raw byte frames — that keeps one parser and satisfies X4's
  "identical cells" claim by construction rather than by hoping two parsers agree.
- **Input is gated in three layers**: the grid's key handler implements X7's five ordered rules; the
  arming state decides whether anything is transmitted at all (X2); the encoder implements X3's
  closed vocabulary and transmits nothing for an unmapped key. The encoder is a pure function with a
  table, and it is shared with the agent's own input path (the Data & Formats section of domain 12
  says the vocabulary is shared), so there is one table and one test suite.
- **Geometry is reported only when it changes and only while visible and meaningfully laid out**
  (X7). This is a real hazard with a virtualised or hidden panel: a zero-height or placeholder-size
  measurement must never be reported, or a running full-screen program has its screen shrunk and its
  output discarded. The reporting path needs an explicit "is this a real layout" guard, and the
  re-measure on theme change (A6) must go through the same guard.
- **Execution is never throttled by display** (X6). Because frames are consumed by the model rather
  than by a renderer, a slow or absent view cannot apply back-pressure. When repaints cannot keep up,
  the model still ingests every frame in order and the view simply paints the latest state. This is the
  same shape as S10's rule for the transcript and should be implemented the same way.
- **Audit logging (X10) happens on the input side, in the main process**, one entry per submitted
  line, with the pending buffer flushed by a control sequence, navigation keys unlogged, and both the
  line and the command context passed through the shared redaction pass before writing. It must not be
  possible for the renderer to write the audit log directly.
- **The pop-out window's own lifecycle** follows T5/T6: closing it stops its ticking, the previews keep
  streaming, and the next open rebuilds it fresh (REQ-SHELL-086) — note the deliberate difference from
  the persona window, which hides rather than rebuilds.

**Consequences accepted.** We own the input path, the wheel arithmetic, the selection extraction and
the encoder, and we must keep them from drifting back to library defaults during upgrades. Serialising
screen state to the persona window costs a message per refresh interval; at 120 ms coalescing
(REQ-SHELL-076) for a bounded grid that is acceptable, but it is a real cost that a single-window
design would not pay.

**Revisit if.** X4's cell-identity requirement can be met more cheaply by shipping byte frames to the
persona renderer and accepting two parser instances — that would need evidence that two instances fed
the same bytes are cell-identical, which is a stronger claim than it looks.

---

### ADR-UI-11 — Theming, design tokens, and how the accessibility floors are actually enforced

**Decision.** How the three built-in themes are expressed, applied and verified, and where the
contrast floors are enforced.

**Constraints that bear on it.** A1 (contrast settled from rendered pixels), A2 (lightness-only
correction), A3 (no state by colour alone), A6 (a theme change recolours everything including native
surfaces and re-measures cell geometry), A7 (icon rasters and multi-monitor scaling), A8 (focus rings
within bounds), P4 (theme committed at the moment it is made), B6 (the benchmark uses `rotaris-dim`
from the package), REQ-SHELL-129 (token groups and declared metrics), REQ-SHELL-133 (each theme
declares a label and a one-line description).

**Alternative A — CSS custom properties on a root element, one stylesheet per theme.**

*For:* the native mechanism; a theme switch is one attribute change and the whole tree recolours,
which is A6's requirement for our own surfaces. Cheap, no re-render, works in every window.
*Against:* it puts token *values* in CSS, where the runtime cannot read them to perform A2's
lightness-only correction or A1's contrast checks, and where the benchmark cannot assert that
`rotaris-dim` was applied. It also cannot express REQ-SHELL-129's non-colour declarations (spacing,
radius, size, typography, motion, elevation, and the declared shell metrics) in a form the layout code
can read — REQ-SHELL-029's rail width, for instance, is derived from the theme *and* must widen when
labels do not fit, which is arithmetic, not styling.

**Alternative B — themes as data in TypeScript, projected to CSS custom properties at apply time.**
Each theme is an object declaring its light/dark flag, its token groups, its declared metrics, its
label and its description; applying a theme computes any derived colours, runs the contrast
corrections, and writes the resulting values as custom properties on every window's root.

*For:* the runtime owns the values, so A2's lightness-only correction is a function over the theme
object; the declared metrics of REQ-SHELL-129 are readable by layout code; a theme's label and
description (REQ-SHELL-133) live with it; the benchmark can assert which theme is in force. A theme
switch is still one attribute-and-properties write, so A6's "no widget retains a colour from the
previous palette" holds by construction.
*Against:* two representations to keep in step (the object and the emitted properties), and a
build-time discipline that no component may hard-code a colour.

**Recommendation: Alternative B.** Specifics:

- **Derived colours are computed, not authored.** A2 fixes the correction: raise perceptual lightness
  only, preserve hue and saturation, adjust upward only, cap near white. That is one function used by
  persona shades, chips, and the four slash-highlight roles of REQ-CHAT-027 — which additionally must
  all differ from one another after correction, so the function's caller must check pairwise
  distinctness rather than correcting each in isolation.
- **Contrast is asserted twice, at two different strengths.** A *static* check over the theme objects
  catches the ordinary case cheaply and can run in CI. But A1 is explicit that the real criterion is
  rendered pixels: "a token pair that computes correctly but paints over a different surface fails".
  So the acceptance evidence must be a screenshot-sampling pass over the seven views and every tab
  page in each built-in theme, sampling the rendered label against the rendered background. That pass
  is a deliverable of this slice, not an afterthought — REQ-SHELL-160 says a build that cannot
  demonstrate all four of its properties does not meet the accessibility contract.
- **`nativeTheme.themeSource` is set from the theme's light/dark flag**, and `color-scheme` is set on
  the document, which is what makes Chromium's own caret, scrollbars, form controls and menus follow
  the theme (A6). See the open question in ADR-UI-05 about the limits of this for host-owned dialogs.
- **Icons are vector, drawn from a single sprite or per-icon components, and inherit `currentColor`.**
  This satisfies A7's raster rule trivially (there is no raster), A6's "no stale-theme icon colour
  survives a switch", and REQ-SHELL-030's two distinct inks for resting and selected rail icons with a
  3:1 floor. The multi-monitor and 100–200 % scaling evidence A7 demands is then a rendering check
  rather than an asset-inventory check.
- **Focus rings are drawn inside the control's own bounds** (A8) — `outline` with a negative offset, or
  an inset `box-shadow` — never an outline that overflows, because REQ-SHELL-148 requires no part of
  the ring to be cut off on self-painted controls and divider handles.
- **Reduced motion is a value read at each animation start** (A5), resolved by the precedence of
  REQ-SHELL-135. Concretely: not a CSS `prefers-reduced-motion` media query alone, because the stored
  in-app setting outranks the OS and the OS signal must be re-read rather than cached. The resolved
  value is a store field; animations read it when they start.
- **Theme commit is synchronous and fsynced** (P4, ADR-UI-06), and reading a stored theme never writes
  it back, so an unrecognised name degrades to the default with the stored value untouched
  (REQ-SHELL-009, REQ-SHELL-128).

**Consequences accepted.** A rendered-pixel contrast harness is a real piece of test infrastructure to
build and maintain across three platforms and three themes. Every component must take its colours from
tokens with no exceptions, which needs a lint rule rather than a convention. A fourth theme is cheap
to add, which is the upside.

**Revisit if.** The design reference introduces a token model incompatible with the group structure
REQ-SHELL-129 declares — in which case the requirement, not the implementation, is what moves.

**Open question (design).** REQ-SHELL-129 fixes the default theme's shell metrics and token groups,
and REQ-SHELL-133 fixes what each built-in theme's description must convey, but the palettes
themselves are not specified anywhere I own. They come from the approved visual design reference.
Nothing above depends on the particular values; the mechanism is what is being proposed.

---

### ADR-UI-12 — Packaging, and how the application updates itself

**Decision.** What builds the four artifacts, and what performs the update check, verification and
apply.

**Constraints that bear on it.** U4 (four artifacts, exact names, one single-file artifact, per-user
Windows install, ARM64-only macOS, Ubuntu 24.04 AppImage baseline), U5 (deliberately unsigned),
U6 (one endpoint, undisableable), U7 (exact-name asset matching, `SHA256SUMS.txt` verification, no
signature), U8 (one naming scheme across publish, manifest and client), U9 (four flavour-specific
apply strategies, including macOS never being replaced automatically), U10 (nothing touched before a
verified download), U11 (Windows flavour from the installer's registry record), U12–U14 (invisible
check failure, visible install failure, in-place progress in one notice, one waved-off version),
T1 (one executable), U15 (clean shutdown, no partial or locked update file).

**Alternative A — electron-builder for packaging *and* electron-updater for updates.** The default
pairing.

*For:* it is the well-trodden path; NSIS per-user installer, portable exe, dmg and AppImage are all
first-class electron-builder targets, matching U4 exactly; electron-updater implements download,
verification and staged install for all four flavours.
*Against:* **electron-updater is unworkable against these requirements**, for several independent
reasons, each sufficient on its own:
  - It consumes its own metadata files (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`) and
    publishes `.blockmap` files alongside the artifacts. U8 requires that *every* filename a release
    publishes be a value of the single naming scheme of REQ-STARTUP-031, and REQ-STARTUP-035's release
    body carries "exactly one row per published asset except `SHA256SUMS.txt`". Extra published assets
    break both.
  - It verifies with the SHA-512 recorded in its own metadata, not against the `SHA256SUMS.txt` that
    U7 makes the sole verification source, and it expects code-signature validation on Windows and
    macOS, which U5 removes.
  - Its macOS strategy replaces the installed bundle via Squirrel.Mac. U9 requires the opposite: the
    installed bundle is left byte-for-byte unchanged and never replaced automatically; the disk image
    is mounted and revealed for the user to complete the move.
  - Its Windows differential update and its own flavour detection do not correspond to U11's
    registry-record discriminator or to U9's rename-to-`.old` portable strategy.
  - It supports channels and configurable feed URLs, which U6 forbids being reachable at all.

**Alternative B — electron-builder for packaging; a bespoke updater implementing U6–U14 directly.**

*For:* the update behaviour is fully specified, down to failure sentences, progress granularity, the
`.old` cleanup and the 1200 ms auto-close. A bespoke implementation is a direct transcription of
REQ-STARTUP-105 to REQ-STARTUP-128 rather than a fight with a library's assumptions. electron-builder
still earns its place: it produces exactly the four artifact shapes U4 requires, including the NSIS
per-user installer with `/S` and `/D=` (REQ-STARTUP-017), the registry writes of REQ-STARTUP-018, the
single-file portable, the ARM64 dmg with the `/Applications` symlink, and the AppImage.
*Against:* we own the updater, including its failure paths and its cross-platform file operations.
The Windows portable strategy renames a running executable — legal on Windows, but it and the AppImage
in-place replacement both need real testing.

**Alternative C — Electron Forge with custom makers, plus the bespoke updater.**

*For:* a cleaner plugin model and first-party maintenance.
*Against:* its NSIS/dmg/AppImage story is thinner than electron-builder's, and U4's requirements
(per-user install with no elevation, an exact artifact naming scheme, a `/Applications` symlink, an
Ubuntu 24.04 glibc baseline) are precisely where electron-builder's maturity pays. No benefit here to
offset the work.

**Recommendation: Alternative B.** Specifics:

- **electron-builder configured to emit exactly four artifacts and nothing else**, with `artifactName`
  templates producing `Rotaris-{v}-windows-x64-setup.exe`,
  `Rotaris-{v}-windows-x64-portable.exe`, `Rotaris-{v}-macos-arm64.dmg` and
  `Rotaris-{v}-linux-x86_64.AppImage`. Publishing must be off, so no `latest*.yml` or `.blockmap` is
  emitted (U8). `SHA256SUMS.txt` is generated by the release pipeline from the emitted assets, sorted
  by filename, two-space separator, never self-listed (U7).
- **The artifact naming scheme is one module shared by the build configuration and the updater**
  (REQ-STARTUP-031 says "a single authority shared with the updater"), so U8's agreement is
  structural. The updater's asset lookup is exact string equality against that module's output
  (U7) — no normalisation, no case folding, no `includes`.
- **The updater is a main-process module** with a strict sequence: fetch and parse `SHA256SUMS.txt` →
  stream the asset into a fresh `rotaris-update-` staging directory in 1 MiB chunks → verify → apply
  (U10, REQ-STARTUP-122, REQ-STARTUP-124). It reports progress into the *same* notice by identity,
  never by replacement (U13), at whole-percent or whole-MiB granularity with a final settle update.
- **Four apply strategies, selected by flavour** (U9, U11), each a separate function with its own
  rollback story. The macOS one mounts and reveals and *changes nothing*; that is worth a comment in
  the code, because it looks like an omission.
- **`app.isPackaged` is not sufficient for flavour classification.** U11 fixes the discriminator:
  `APPIMAGE` first, then the macOS bundle, then on Windows the `HKCU\Software\Rotaris\InstallDir`
  value *and* the running executable resolving inside the directory it names, everything else
  portable. Reading a registry value from the main process needs a small platform helper; this is one
  of the few places where a Windows-specific code path is unavoidable.
- **Electron's own `autoUpdater` is not used at all**, on any platform, and neither is any update
  feed other than the one endpoint of U6.
- **U6's undisableability is a property of the configuration surfaces, not of the updater.** The
  acceptance criterion is that four closed enumerations contain no entry naming update checking, an
  endpoint, a release source or a channel. ADR-UI-06's typed key registry makes one of those four
  checkable mechanically; the others belong to other slices, and the check should be a single test
  that reads all four registries.
- **Shutdown waits at most 5000 ms for in-flight update work** and leaves no partially written or
  locked file (U15); the staging directory is removed on both success and failure.

**Consequences accepted.** We own an updater, including its Windows and Linux file operations and
their failure modes; that is perhaps 600–900 lines plus tests, and it must be exercised on all three
platforms because U9's strategies share no code. Unsigned binaries (U5) mean the product will always
trip SmartScreen and Gatekeeper on first launch — a product decision already taken and disclosed, not
one to revisit here. Without differential updates every update is a full artifact download; at these
artifact sizes that is acceptable and U7's verification model assumes it.

**Revisit if.** The product ever acquires code signing, at which point signature verification becomes
possible and REQ-STARTUP-123's explicit note that "a matching digest establishes that the download is
the published file and nothing about who published it" would be worth revisiting as a requirement.

**Escalation — `ESCALATE`.** Not a technology choice, but a product one that this ADR sits on top of.
U5 makes unsigned binaries a deliberate decision, and REQ-STARTUP-123 states plainly that the update
path establishes *what* was downloaded and nothing about *who* published it, over the same connection
the download came from. The options are: (a) keep it as specified, disclosed in the release notes;
(b) add code signing for Windows and Apple notarization, which changes cost, release process and
REQ-STARTUP-021/023, and would make signature verification possible in the updater; (c) sign the
`SHA256SUMS.txt` manifest with a key shipped in the application, which is cheaper than (b) and gives
publisher authenticity for updates without changing first-launch OS warnings. This is the product
owner's call, not mine; I raise it because the architecture is materially different under (b) or (c)
and it is far cheaper to decide now than after the updater exists.

---

### ADR-UI-13 — Startup sequencing and the first-paint budget

**Decision.** What runs before the first window exists, what runs before the first paint, what is
deferred, and how the bundling choice is kept from eroding the 5-second budget.

**Constraints that bear on it.** U1 (a fixed pre-window order; no network traffic from constructing a
window without showing it), U2 (one shared 650 ms deferral, one-shot and abandonable), U3 (5 s to
first paint on every artifact and every bundle mode; the empty-plan fast path inside 100 ms),
U16 (demo mode fixed at window construction), P1/P4 (preference scoping before the first read; theme
restored before the first window is visible), B6 (bundled fonts), REQ-WORKSPACE-141 (the full
workspace-open ordering), REQ-SHELL-013/REQ-STARTUP-044 (two mutually exclusive post-show schedules).

**Alternative A — a single renderer bundle loaded from `file://`, main process does the sequencing.**

*For:* simple; electron-vite's default output.
*Against:* nothing inherently, but it does nothing to help U3 either: the 5 s budget must hold for the
Windows `onefile` portable artifact, which self-extracts before the process even starts, and for an
AppImage, which mounts a squashfs. The budget is stated with *no per-flavour differential*, so the
slowest artifact sets the target and the renderer's own load time is the part we control.

**Alternative B — the same, plus an explicit paint-first discipline.** The window is created hidden,
loads a shell that paints the chrome and the default view from *stored* state only, and is shown at
`ready-to-show`; everything that could block is deferred behind the show.

*For:* it is what U1 already describes — preference scoping, icon, fonts, theme, then window, then
(and only then) repository discovery, the update check and cloud-credit polling. It also gives
REQ-STARTUP-050's "the complete default desktop SHALL be painted and visible before the modal chooser
opens" a mechanism rather than a hope, and it makes U1's "constructing a window without showing it
produces no network traffic" structurally true because every network path hangs off the show event.
*Against:* requires discipline about what the first paint depends on: any await on a workspace read,
a git probe, a provider catalogue or a session load moves into the deferred phase or the budget goes.

**Recommendation: Alternative B**, with these specifics.

- **The pre-window phase, in the main process, in this order** (U1): resolve the preference-store root
  and establish scoping (P1); set the application icon; register the bundled font families; read the
  stored theme. Only the first of these may touch disk on the critical path, and it reads one small
  file.
- **The first paint is rendered from stored preferences and constants only.** The seven views are
  constructed (which ADR-UI-03 needs anyway, for construction-time slot allocation), the rail, title
  bar and status strip are drawn, and the Workspace view shows its empty state. Nothing on this path
  awaits a workspace read, a git snapshot, a session load, a provider catalogue or a model list — the
  composer's model chip has a neutral loading label precisely because model options are not yet
  loaded (REQ-CHAT-009).
- **Post-show activation is a single ordered pipeline** (REQ-WORKSPACE-141): git refresh → update check
  → cloud-credit polling; then, once the window is interactive, initialization resolution and the
  hook-review notice; then, after the shared 650 ms deferral, the project chooser if it is still owed.
  The two mutually exclusive schedules of REQ-STARTUP-044 — bundled-first-run with machine setup, and
  everything else — are two branches of that one pipeline, sharing one delay (U2).
- **The 650 ms deferral is one timer owned by the window registry** (ADR-UI-05), cancelled on window
  close (REQ-STARTUP-045, REQ-SHELL-016) and abandoned unshown if the question it asks has already
  been answered (U2). It must not be re-implemented per offer — REQ-SHELL-011 is explicit that it is
  the product's single definition of the delay.
- **Fonts are preloaded and their load is awaited before the first paint** (`<link rel="preload">` plus
  `document.fonts.ready`), because REQ-SHELL-008 requires them available before the first paint and a
  late font swap would reflow the transcript and invalidate R3's measurement cache. In the live
  application a failure falls back to host fonts and continues; in a benchmark iteration it is a crash
  (B6). One loader, two failure policies.
- **Demo mode is a construction-time window parameter** (U16), carried from the palette entry through
  the window registry into the renderer's initial state; there is no runtime toggle and nothing is
  written to the preference store.
- **Budget protection is a measurement, not an intention.** Launch-to-first-paint is recorded in
  diagnostics as a span (REQ-STARTUP-140 already requires a `config.load` span), and the release gate
  of REQ-STARTUP-156 requires each published artifact to be downloaded and launched to first paint at
  least once on its own platform key — so the budget has both a continuous signal and a release check.

**Consequences accepted.** A hard rule that nothing may be awaited before `ready-to-show`, which is
easy to violate accidentally and needs a test that fails on a regression rather than a review
convention. The first frame is deliberately empty of workspace content, which is a visible design
consequence: the user sees the shell before they see their project.

**Revisit if.** Measurement on the slowest artifact (the Windows `onefile` portable, which
self-extracts) shows the 5 s budget cannot be met even with an empty first paint — the remedy would be
a bundle-mode change, and U4 makes the portable's single-file shape a hard requirement, so the
conversation would be about the budget or about what is bundled.

---

### ADR-UI-14 — Markdown rendering and the bounded render cache

**Decision.** How agent-message bodies are turned into rendered content, and how the cache the
benchmark reports is structured.

**Constraints that bear on it.** R11 (synchronous, no network request, partial mid-stream input
renders without error and without affecting neighbouring rows, character-exact pointer selection),
R3 (rendering reused only while identity, content, width and expansion state are unchanged; live rows
never reused), R4 (`max_entries` 256, `max_chars` 2,000,000 counted in *source* characters,
`hits`/`misses` cumulative for the process), R1/S6 (200 ms budget with rows still streaming),
B3 (deterministic across processes), REQ-CHAT-056 (fenced code in a monospace face on its own shaded
background, bold heavier, italic slanted, inline code monospace, links in a distinct colour),
REQ-NOTIFY-243 (streaming Markdown renders partial input as readable text and resolves to the correct
final rendering once the remainder arrives).

**Alternative A — a Markdown-to-HTML library plus `dangerouslySetInnerHTML`, sanitised.**

*For:* fast, simple, one dependency, and HTML gives R11's native text selection.
*Against:* it hands model-authored text to an HTML parser. Sanitising is a mitigation, not a
guarantee, and the same content is also rendered in the persona window and copied to the clipboard.
It also makes R3's cache key awkward: an HTML string can be cached, but reuse must still be gated on
the laid-out width because the rendering the specification talks about is *measured*, and an HTML
string is not.

**Alternative B — parse to an abstract syntax tree, render the tree to React elements, cache the
parsed tree.** No HTML string is ever produced and nothing is injected.

*For:* no HTML injection surface at all; the renderer emits only the element types we allow, which is
also how REQ-CHAT-056's enumerated treatments (fenced code, bold, italic, inline code, links) become
a closed list rather than a sanitiser's allow-list. Selection stays native because the output is DOM.
The cache holds parsed trees keyed by source text, and `chars` is naturally the count of source
characters R4 specifies. Parsing is synchronous and does no I/O (R11).
*Against:* a tree-to-elements renderer is ours to write and to keep in step with whatever subset of
Markdown we support; a parser that produces an AST is slightly slower than one that streams straight
to a string.

**Alternative C — pre-render bodies in the main process and ship rendered output over IPC.**

*For:* the renderer never parses; the cache is shared across windows.
*Against:* fails R3 outright — reuse is gated on the laid-out width, which only the renderer knows —
and would put rendering on the far side of the boundary from the 200 ms budget. It also moves the
injection surface rather than removing it.

**Recommendation: Alternative B.** Specifics:

- **Two caches, not one, matching R3's two kinds.** A *parse* cache keyed by source text (this is the
  one the benchmark reports as `markdown_cache`, with occupancy in entries and in source characters,
  bounded at 256 and 2,000,000, LRU); and a *measurement* cache keyed by R3's full four-part key
  (identity, content, laid-out width, expansion state) holding the row's measured height. The
  specification's "retained row renderings" maps to the parse cache plus React's own element reuse;
  its "retained row measurements" maps to the measurement cache. Keeping the parse cache keyed on
  source text alone is what makes R4's `chars` figure meaningful and comparable to `max_chars`.
- **Live rows bypass both caches** (R3): a row that is still streaming is re-rendered every repaint,
  which is also why R4's `hits`/`misses` grow during the streaming phase rather than staying flat.
- **Partial input is a first-class case, not an error path.** An unterminated fence, an unclosed
  emphasis run or a half-written link must render as readable text and must resolve to the correct
  final rendering when the remainder arrives (REQ-NOTIFY-243, R11). The parser must therefore be
  tolerant by construction rather than by try/catch, and the streaming phase of the benchmark
  (prefixes at 0, 256, 512, …) exercises exactly this.
- **Links are rendered as elements that request an external open through the command channel**, never
  as navigable anchors — the renderer is sandboxed and must not navigate. Bare URLs are linkified by
  the renderer with trailing punctuation excluded (R11), which is a post-parse text transform applied
  to text nodes only, so it can never turn part of a code span into a link.
- **Determinism (B3):** the parser and the linkifier must not depend on locale, on `RegExp` behaviour
  that varies with Unicode data versions in a way we cannot pin, or on iteration order of an object.
  The benchmark's `LANG=C` environment will expose a locale dependency rather than hide it.
- **Copy uses the row's source text, not the rendered output** (REQ-CHAT-075's "Copy message" is the
  row text), and a group's copy yields the summary form, never raw tool input or output
  (REQ-CHAT-065).

**Consequences accepted.** We own a Markdown subset and its renderer; the supported subset must be
written down, because REQ-CHAT-056 enumerates treatments but not the grammar. The parse cache is a
reported figure, so changing its keying changes a benchmark output and should be treated as a
behavioural change rather than an internal one.

**Revisit if.** The parse cost at the 200 ms budget with many streaming rows proves too high, in which
case the answer is incremental parsing of the changed tail rather than moving the work.

**Open question.** No requirement fixes *which* Markdown dialect is rendered. REQ-CHAT-056 names five
treatments and requires links to be activatable; nothing says whether tables, task lists, block
quotes, headings or images are supported. This needs answering — probably by the design reference,
since it is as much a visual question as a functional one — before the renderer's element list is
fixed. Images in particular interact with REQ-CHAT-056's "MUST NOT issue any network request".

---

### ADR-UI-15 — The renderer build toolchain

**Decision.** What builds the main, preload and renderer bundles during development and for release.

**Constraints that bear on it.** T1 (one shipped executable, so the build must not emit a second entry
point), B4/B5 (the very same build must run as an offscreen child process with no on-screen output),
B6 (fonts and theme resolved from the package, never the host, so assets must be genuinely bundled),
U3 (5 s to first paint, which bounds bundle size and load work), U4 (four artifacts), ADR-UI-02's
sandboxed preload (which must be a single self-contained script, since a sandboxed preload cannot use
CommonJS `require` of arbitrary modules).

**Alternative A — electron-vite.** A Vite-based toolchain with three configured targets (main,
preload, renderer), hot module replacement in the renderer, and conventional handling of the preload
sandbox constraint.

*For:* it is built for exactly this three-target shape; Vite's dev server gives fast renderer
iteration, which matters for a UI slice this large; it composes with electron-builder for packaging
(ADR-UI-12) rather than competing with it; the preload target can be emitted as a single bundled file,
which is what a sandboxed preload requires.
*Against:* an extra abstraction over Vite whose configuration surface must be understood; a dev-mode
renderer served over HTTP rather than `file://`, which differs from production in exactly the axis
(origin, CSP) where mistakes are expensive — so the CSP and the sandbox settings must be verified
against a packaged build, not a dev build.

**Alternative B — plain Vite with hand-written build scripts for main and preload.**

*For:* nothing hidden; one fewer dependency.
*Against:* re-implements what electron-vite provides, including the preload bundling rule and the
dev/production asset-path difference. No requirement is served better.

**Alternative C — Electron Forge with the Vite plugin.**

*For:* one tool for build and package; first-party.
*Against:* couples the build to Forge's packaging, which ADR-UI-12 rejected in favour of
electron-builder for U4's artifact shapes. Mixing Forge's build with electron-builder's packaging is
the worst of both.

**Recommendation: Alternative A (electron-vite), with electron-builder for packaging.** The candidate
stack's suggestion holds here, and it holds for a specific reason: the three-target shape and the
sandboxed-preload bundling rule are the two things this build must get right, and they are exactly
what electron-vite is for.

Specifics:

- **Three targets, one renderer bundle reused by every window.** The main, persona, terminal and
  benchmark-iteration windows all load the same renderer bundle with a different initial route and
  window role, so B4's "the same rendering path the live application uses" is true by construction
  rather than by discipline. A separate benchmark bundle would violate it.
- **Assets are bundled, not fetched.** Fonts, the brand mark, icons, the third-party licence bundle
  and the build-identifier file are packaged (REQ-STARTUP-159 requires every run-time data asset to
  resolve from what was installed, with no download, under blocked network).
- **A strict Content-Security-Policy with no `unsafe-inline` and no remote origins**, consistent with
  R11's "rendering MUST NOT issue any network request" and REQ-SHELL-139's "the About page renders
  exclusively from local data — zero network requests at render time". The CSP is a mechanism that
  makes those two checkable rather than merely intended.
- **The renderer must be verified in a packaged build** for the paths where dev and production differ:
  asset resolution, CSP, sandbox, and font loading. That verification belongs in the release gate of
  REQ-STARTUP-156, which already requires each artifact to be launched to first paint.

**Consequences accepted.** A toolchain dependency in the critical path of every build; dev/production
divergence that must be actively tested rather than assumed away.

**Revisit if.** The bundle size threatens U3's 5 s budget on the slowest artifact, or if a future
requirement needs a second renderer entry point with genuinely different capabilities.

---

## 4. How the design meets the domain 21 budgets

Domain 21 and REQ-SHELL-150 state numbers as acceptance criteria. This section says how the design
above is meant to meet each, so the claim can be checked rather than asserted.

| Budget | Requirement | How the design meets it |
|---|---|---|
| Gesture acknowledged within 100 ms | REQ-SHELL-150 | Every gesture's first effect is local renderer state (composer text, expansion toggle, drawer, tab, divider). Nothing that acknowledges a gesture waits on the boundary. Commands that must cross the boundary acknowledge locally first (disabled state, spinner) and report the outcome when it returns (N10). |
| Repaint interval ≤120 ms under sustained change | REQ-SHELL-150 | The 50 ms trailing coalesce of S5 sets the publication floor; the renderer applies each publication in one pass (ADR-UI-04) and paints on the next frame. The persona and terminal windows coalesce at 120 ms by their own timers (S8). |
| Burst final state on screen within 120 ms of the last change | REQ-SHELL-150 | The trailing coalesce reads current state when it fires (REQ-MONITOR-220), so the last change is always in the last publication; nothing is dropped. |
| Streamed output on screen within 200 ms | REQ-CHAT-157 | Unseen rows are published immediately (S5); growth is coalesced at 50 ms; the apply pipeline touches only rows from `fromIndex` and the recycler repaints only visible slots (R1). |
| 250 ms p95 visibility regardless of session length | REQ-MONITOR-222 | Cost is bounded by increment size, not session size: `fromIndex` bounds the diff (ADR-UI-04), the recycler bounds the paint (ADR-UI-03), and the measurement cache bounds re-measurement (R3). |
| ≤2× cost at 10,000 rows vs empty | REQ-MONITOR-223 | The only structures that grow with session length are the offset table (O(1) update per changed row via prefix sums) and the row array. Nothing in the per-update path iterates the whole transcript. This is the constraint that makes a `fromIndex = 0` publication a defect rather than a slow path, and it needs an explicit sender-side assertion and a diagnostics counter. |
| Idle session does no work | REQ-MONITOR-223 | No timer runs unless a row is live (REQ-CHAT-063's "when no row is live, nothing in the transcript may animate or repaint on a timer"); hidden surfaces unsubscribe and cancel timers (T6). |
| Interface lag <100 ms in every benchmark record | REQ-UIBENCH-118 | The renderer must never do unbounded synchronous work. The three places it could: the apply pipeline (bounded by increment size), Markdown parsing (bounded by the cache and by row size), and measurement (bounded by visible slots). The 1000-replacement tail phase is the adversarial case and is the one to measure first. |
| `widgets` stable after construction | REQ-UIBENCH-054/085 | Fixed slot pools allocated at construction, sized for the largest reachable viewport; content variance accounted to `ui_objects` (ADR-UI-03). |
| Operation counters identical across iterations | REQ-UIBENCH-083 | The apply stage is a pure function of (displayed state, incoming state) with no clock, randomness, locale comparison or environment-dependent iteration order (ADR-UI-04). |
| Tail-phase second-half growth <64 MiB | REQ-UIBENCH-087 | Both caches are LRU-bounded (R3, R4); the recycler allocates no elements per replacement; the parse cache is keyed on source text so 1000 distinct replacement strings evict rather than accumulate. This is the invariant most likely to fail first, and it fails loudly. |
| Report presentation within 100 ms for ≤10 iterations | REQ-UIBENCH-115 | The report is computed in the main process and delivered as one payload; presentation is rendering a bounded object. |
| First paint within 5 s | REQ-STARTUP-155 | Nothing is awaited before `ready-to-show` except the preference root read and font loading (ADR-UI-13). |

Two of these are not yet demonstrable and should be treated as the first spikes after the gate: the
`widgets` invariance of a slot-pool recycler through the seven phases, and the tail-phase memory
tripwire. Both are cheap to test against a throwaway harness and both would change ADR-UI-03 if they
failed.

---

## 5. Open questions

These are places where the specification is silent, or where two requirements pull in different
directions, and where I have declined to invent an answer.

1. **Design reference (blocking several decisions).** The approved visual design reference is not
   available in this session. It is needed for: the theme palettes and the token values behind
   REQ-SHELL-129; the information architecture inside each of the seven views; the Markdown dialect
   and its treatments (see ADR-UI-14); and the visual form of the benchmark and diagnostics cards. No
   mechanism above depends on it, but no screen can be built without it.

2. **Process topology and the prompt queue.** REQ-CHAT-041 scopes queue visibility and consumption to
   windows and runs "sharing the same process", and REQ-CHAT-038 requires an atomic `QUEUED →
   TRIGGERED` transition that exactly one caller wins. If run execution moves to a separate runtime
   process, that becomes a cross-process exactly-once problem. Owned by the orchestration slice;
   binds ADR-UI-01 and ADR-UI-02.

3. **Native surfaces under a dark theme.** REQ-SHELL-160(b) requires that no native surface present a
   light background while a dark theme is active, on each supported platform; REQ-SHELL-164 says the
   product is answerable only for what it hands a native dialog, and the OS folder chooser on Windows
   and most Linux desktops follows the system setting rather than the application's. My reading is in
   ADR-UI-05; it needs confirming rather than assuming.

4. **Demo mode and process-wide network silence.** REQ-SHELL-005 says that in demo mode "the process
   opens no outbound network connection for its whole lifetime", while REQ-SHELL-162 lets a demo
   window be opened from a non-demo window and REQ-STARTUP-057 says "a non-demo window of the same
   process is unaffected and checks exactly as REQ-STARTUP-114 requires". Those cannot both hold once
   a mixed process exists. Either REQ-SHELL-005's claim is per-window rather than per-process, or a
   demo window must be its own process. The second reading has architectural consequences and the
   first is probably what was meant; it should be stated.

5. **`XDG_CONFIG_HOME` on non-Linux hosts.** REQ-UIBENCH-039 names it contractually. See the open
   question in ADR-UI-07: is it named because it is the one standard variable available (so the
   private variable carries the job elsewhere), or must the preference store honour it on all three
   platforms?

6. **What `widgets` and `ui_objects` mean for a DOM interface.** REQ-UIBENCH-050 defines them against
   "the interface framework the product is built on" and leaves the mapping to the implementation.
   ADR-UI-03 proposes a specific, honest mapping. Because it decides whether REQ-UIBENCH-054 is
   satisfiable at all, it should be reviewed explicitly rather than absorbed as an implementation
   detail.

7. **Application-modality across windows.** REQ-SHELL-051 calls the command palette
   "application-modal". Electron has no application-modal primitive, so ADR-UI-05 proposes enforcing
   it in the window registry. Confirmation that the intended behaviour really is "a click on the
   persona window while the palette is open does nothing" would be useful, since the alternative
   reading — window-modal, with the word used loosely — is much cheaper.

8. **The benchmark's per-process figures.** REQ-UIBENCH-050 reports `rss_bytes`, `threads` and
   `handles` "for the process that produced the record". In a multi-process browser engine there are
   several. ADR-UI-07 proposes the renderer process of the measured window; the alternative — the sum
   over the iteration's process tree — is also defensible and gives different numbers. Since
   REQ-UIBENCH-050 only claims comparability between runs of one revision, either is conformant, but
   the choice must be recorded.

9. **`REQ-EVENTS-005` and where a run executes.** "Every run executes inside the desktop application"
   reads naturally as "there is no headless entry point", not as "in the same OS process". If it is
   meant more strictly than that, it constrains the orchestration slice's topology and, through T3,
   mine.

---

## 6. Dependencies on other slices

- **Orchestration / monitoring** — the publisher side of every constraint in §2.2 (S1–S13). The
  transcript increment and whole-session snapshot payload types are a shared contract; I consume
  them, I do not define them. Also the plan-gate, quota-wait and message-limit surfaces that
  REQ-ORCH-155 hosts inside my views, and REQ-ORCH-155's 100 ms reflection budget.
- **Sessions and persistence** — the live transcript cap and archive paging that R2 relies on
  (REQ-SESSION-192, REQ-SESSION-131, REQ-SESSION-160), the split on-disk layout the benchmark's
  capture reads (REQ-SESSION-036, REQ-SESSION-037), and the persisted status vocabulary my
  normalisation maps from (REQ-SESSION-073).
- **Settings and configuration** — the settings category identifiers my notice actions and tab
  restoration use (REQ-CONFIG-269), the desktop preference key registry (REQ-CONFIG-405), the
  workspace/user write-scope rule (REQ-CONFIG-463), and the Display-category controls whose values my
  transcript reads live (REQ-CONFIG-472, REQ-CONFIG-262).
- **Tools and permissions** — the terminal stream control surface, the permission audit log my
  terminal input writes to (X10), and the approval payloads my trailer rows and approval modal render.
- **Model providers** — the image-input and image-cost declarations the composer's attachment gate and
  token estimate depend on (REQ-PROVIDER-149, REQ-PROVIDER-150), the money-rendering rule the status
  strip and KPI surfaces must use and never re-implement (REQ-PROVIDER-121), and the credit states the
  status strip renders (REQ-PROVIDER-130).
- **Library and requirements board** — the library tab names and artifact vocabularies my notice
  actions and artifact dialogs address (REQ-LIBRARY-088, REQ-LIBRARY-103), and the board's own
  preference keys that live in my store.
