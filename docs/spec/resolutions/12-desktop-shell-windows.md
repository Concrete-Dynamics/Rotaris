---
reference: ROTARIS-CRW-001
domain: desktop-shell-windows
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 12, Desktop Shell, Navigation, and Window Management

> ## Amendment, 2026-09-29 — a non-zero cost that would read as zero renders as a floor (ESC-42)
>
> `REQ-SHELL-045` keeps its property — "a cost that is small but not nothing is never rendered as zero" — and now names
> what delivers it: the single money rule's floor, `< 0.0001`, which `REQ-PROVIDER-121` gains in the same round. Item 22
> below gave four decimal places as the reason the property holds, and it does not: half-up rounding to four places
> renders every amount above zero and below 0.00005 as `0.0000`. The reason is kept in the row beside its correction.
>
> **Why this is an amendment and not a directive.** Two live requirements disagreed: `REQ-PROVIDER-121` stated a rule,
> and `REQ-SHELL-045` claimed a property that rule could not deliver. The owner ruled ESC-42 option (b) as it recommended
> ([R-067](../../product/requests.md#r-067)); `owner-decisions.md` holds the ruling and the four details it settles.

> ## Amendment, 2026-09-02 — "the folder that is already open" is decided by one rule for the product
>
> **No disposition below is reversed.** This domain makes two decisions that turn on whether two
> directory strings name the same directory: REQ-SHELL-010 (a) resolves a workspace a window was
> explicitly built for before persisting it, and REQ-SHELL-021 does nothing when the folder selected in
> the chooser is the one already open. Both stated their own rule, and REQ-SHELL-010's — "normalized to
> an absolute path" — was weaker than the rules the startup domain and the hooks domain applied to the
> same question. Which of two outcomes a user gets (a second window, or nothing at all) depended on
> which document an implementer read.
>
> REQ-STARTUP-163 is now the product's **single definition** of when two directory strings name the same
> directory, and states in its own text that a document needing the rule cites it rather than restating
> it. Both requirements above now cite it. The rule resolves symbolic and directory links, expands
> home-relative prefixes and relative segments, gives a trailing separator no meaning, resolves
> abbreviated alternate spellings the filesystem itself keeps, and compares case-sensitively or not
> according to the filesystem holding the paths. It deliberately does **not** reconcile spellings that
> reach one directory only through a mapping the user configured outside the filesystem, and the cost of
> that is bounded to a second window opened on one folder — which is a better outcome than silently
> merging two workspaces.
>
> **Nothing here decides workspace identity.** What binds a workspace to its sessions is the identifier
> REQ-SESSION-197 fixes, which is carried in the workspace and never derived from a path.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - Any disposition locating **prompt history and stash** at a file under `<workspace>/.rotaris/` is
>   superseded: they are held in the durable store the application keeps for the workspace
>   (REQ-LIBRARY-138, REQ-SHELL-157). The per-workspace scoping, the caps, the no-partial-state guarantee
>   and the "Could not save prompt history" degradation all stand.
> - **OQ 36**'s 400 ms composer-draft debounce is **unaffected**. It is a preference-store write, not a
>   session save, and is recorded here only so it is not confused with the persistence debounce SR-4
>   withdrew.


This record disposes of every open question raised in the draft of
[`../12-desktop-shell-windows.md`](../12-desktop-shell-windows.md) (requirement prefix `REQ-SHELL`).
The body of that specification has been amended so that each decision below is stated normatively in
place; the original open-question numbering is preserved here so that the draft and the resolved
specification can be read against one another.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case was
   under-determined, this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading more
   coherent with the rest of the document; where no coherent reading exists, the behavior is omitted
   rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent rather than something known to work.
4. **The product is one Electron desktop application with no command-line interface and no
   terminal user interface.** Not deferred — removed. Domains 17 and 18 are retired and the
   `REQ-TUI` and `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below for what
   that did to this domain. Running external programs — the agent's own terminal commands, lifecycle
   hooks, tool servers on the stdio transport, version-control invocations — remains fully in scope;
   what is removed is any way for a *user* to drive the product from a shell.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable format). Open questions
   asking for the exact phrasing, punctuation, separators, or grammatical inflection of a
   *human-readable* message are resolved by stating what the message must convey and leaving the
   wording to the implementation.

Cross-domain vocabulary was taken from `04-model-providers-auth.md` (money rendering, cloud credit
states), `06-git-worktrees-checkpoints.md` (generated worktree branch names, collision suffixes),
`07-sessions-persistence.md` (execution-status vocabulary), `10-sandbox-network-egress.md` (sandbox
mode vocabulary), `11-startup-distribution-updates.md` (diagnostics run-directory location) and
`15-settings-configuration.md` (Settings category identifiers, desktop preference keys). No other
source was consulted.

New requirements added by these resolutions: **REQ-SHELL-162** and **REQ-SHELL-163** (rescued
capabilities, see the sweep below), and **REQ-SHELL-164** through **REQ-SHELL-167** (open questions
9, 11, 12 and 13). Four requirements — REQ-SHELL-001 through REQ-SHELL-004 — are withdrawn. No
requirement identifier was renumbered, reused, or deleted. **The sixth reconciliation round added
one further requirement, REQ-SHELL-168**, which was not raised by an open question: domain 01's
resolution record had recorded the plan gate (REQ-ORCH-153, REQ-ORCH-154) and the surface set closed
by REQ-ORCH-155 as new obligations on this domain, and no round between that record and the sixth
executed them. REQ-SHELL-168 states that this window hosts those surfaces, that each is presented
inside the primary view its run belongs to and offers its actions in the one action vocabulary of
REQ-SHELL-048, that this document holds no copy of what any of them must convey, that window-level
Escape does not answer the gate, and that a session waiting at the gate is not an active run for the
close guard of REQ-SHELL-119. Of the 36 open questions raised in the
draft, 34 are resolved, 2 are moot, none are omitted, and none are escalated. The "Open Questions"
section of the specification is consequently empty of outstanding items.

## Graphical-only sweep

Five requirements in the draft had a command line as their only observable surface. Each is
withdrawn in place; every capability that reached the user through it is carried by a
desktop-reachable requirement, two of which are new.

*Count corrected on re-verification: four **requirement identifiers** are withdrawn here —
REQ-SHELL-001 through REQ-SHELL-004 — and the table's fifth row is a Data & Formats block, not a
requirement. The domain's withdrawn count is four throughout, and that is the figure the index and
the gate document carry.*

| Withdrawn | What it specified | Capability now carried by |
| --- | --- | --- |
| REQ-SHELL-001 | The whole argument vocabulary: positional workspace, `--demo`, `--version`, `--diagnostics [light\|deep]`, `--diagnostics-output DIR` | Workspace selection: REQ-SHELL-010, REQ-SHELL-021. Demo mode: **REQ-SHELL-162** (new). Diagnostics capture: **REQ-SHELL-163** (new). Running version: REQ-SHELL-033, REQ-SHELL-140. |
| REQ-SHELL-002 | `--version` prints `Rotaris {version}` on stdout and exits 0 without a window | REQ-SHELL-033 (title-bar `v{version}` label) and REQ-SHELL-140 (About page Version row, selectable text, announced as "{name}: {value}") |
| REQ-SHELL-003 | Rejected diagnostics invocation: usage message naming the rejected option, exit code 2, nothing written | **REQ-SHELL-163** (new) — the level control offers only `off`/`light`/`deep` and the folder comes from the platform chooser, so an invalid selection is unreachable and no error for one is defined |
| REQ-SHELL-004 | The process exit code of a normal interactive run | No capability to rescue — a process exit code is only observable to a script. The shutdown obligations that were observable to a user stay in REQ-SHELL-121, which was amended to drop its reference to the exit code. |
| Data & Formats, "Command-line grammar" | The argv grammar block and `--version` output format | Replaced by "Application entry" (a statement that no such surface exists and where each capability lives) and "Diagnostics capture vocabulary" (the `off`/`light`/`deep` enum and the output-folder value) |

Two further amendments follow from the sweep rather than from an open question:
REQ-SHELL-005 now reads "In demo mode (REQ-SHELL-162)" instead of "Under `--demo`", keeping the whole
of the demo-mode behavior it specified; and REQ-SHELL-010 branch (a) now names the folder a window
was explicitly built for through REQ-SHELL-017 instead of a command-line argument, keeping the
precedence ladder intact. The section heading "Command line and process lifecycle" became
"Application entry, demo mode, and preference store".

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | The physical path and on-disk encoding are deliberately not fixed, and REQ-SHELL-006 now says so as the requirement rather than as an omission: it states an exhaustive set of observable properties — the host's own standard per-user application-settings location for organization "Rotaris" and application "Rotaris"; readable and writable by the invoking account with no elevation; outside every workspace directory so no preference ever lands in a project or its version control; created on first write, its absence meaning every key answers with its declared default; and a written value read back unchanged after a restart, subject to tolerant integer parsing. Two conformant builds may lay the same keys out differently. The store is the desktop-scoped surface and is disjoint from the layered YAML surface: no key of this document is ever read from or written to YAML, and no YAML field is ever read from or written to this store (REQ-CONFIG-463). | REQ-SHELL-006 |
| 2 | RESOLVED | macOS supplies the signal from its "Reduce motion" accessibility setting; Linux from whichever reduced-motion or animations-enabled preference the desktop environment publishes through its standard settings interface. The fallback is intended and is now stated as a deliberate answer rather than a gap: a platform that publishes no such signal, and a signal that cannot be read for any reason, both fall through to motion-on, so motion is on exactly when the operating system has not said otherwise. The value is read at each animation start rather than cached, so an in-app change and an OS-side change both take effect without a relaunch. | REQ-SHELL-135 |
| 3 | RESOLVED | Four properties are settled from rendered output on a real display rather than from theme tokens, each with an acceptance criterion. Contrast: ratios are measured from the pixels actually painted, sampling the rendered label against the rendered background after all styling, states and overlays — a token pair that computes correctly but paints over a different surface fails. Native surfaces: on each supported platform and in each built-in theme, no native dialog, menu, caret or disabled-text surface may present a light background under a dark theme or the reverse, and text on those surfaces must still clear 4.5:1. Focus indication: every focusable control, self-painted navigation controls and divider handles included, shows a ring wholly inside its own bounds clearing 3:1 against the surface it is drawn on. Scaling: the icon rule is measured at 100/125/150/175/200% and again after the window is dragged between monitors of differing scale, and the icon must cover its declared logical size within one device pixel and never be drawn from artwork smaller than the required raster. A build that cannot demonstrate all four fails this domain's accessibility contract. | REQ-SHELL-160 (new), REQ-SHELL-030, REQ-SHELL-130, REQ-SHELL-144, REQ-SHELL-145, REQ-SHELL-148 |
| 4 | RESOLVED | A declined raise is a supported outcome, not a failure. "Show, raise and activate" is a request to the host window manager; a refusal is not retried, raises no error, shows no notification, and the requesting action still counts as having succeeded. What is guaranteed regardless is that the window exists, is not minimized, is not hidden, carries the content the request asked for, and — where the platform offers one — has the attention or urgency hint set so the user can find it in the task switcher. Stacking among auxiliary windows is left entirely to the host; no z-order is required between a persona window, the terminal window and the main window. A declined raise is never compensated for by anything that takes keyboard focus, and an auxiliary window opened by something other than a direct user gesture never takes focus. | REQ-SHELL-161 (new), REQ-SHELL-072, REQ-SHELL-081, REQ-SHELL-109, REQ-SHELL-110 |
| 5 | RESOLVED | Three numeric thresholds, all measured under a sustained burst of changes at a rate the display cannot match: a user gesture — keystroke, click, view switch, divider drag — is acknowledged on screen within **100 ms**; the interval between consecutive repaints of a surface with pending changes never exceeds **120 ms**; and the final state of a burst is on screen within **120 ms** of the last change arriving. A build that misses any of the three under sustained load fails, whatever its average behaviour. The hidden-surface budget is stated as work rather than as a CPU share so that it is checkable on any hardware: while a surface is off screen, zero repaints of it are performed and zero repaint or refresh timers belonging to it are running, however fast changes arrive; when it becomes visible its first painted frame already carries current state, reached within the same 100 ms gesture budget. | REQ-SHELL-150, REQ-SHELL-151, REQ-SHELL-084 |
| 6 | RESOLVED | Generated slash entries — one per user-invocable skill — take their name from the skill's declared name reduced to catalogue normal form: lower-cased, each run of whitespace or underscores collapsed to a single hyphen, every character outside a–z, 0–9 and hyphen removed, leading and trailing hyphens trimmed; a name that reduces to empty yields no entry. The description is the skill's own one-line description, or, absent one, a sentence stating the skill is available and naming it. Built-in commands always win a collision: a generated name equal to a built-in name, or to a generated name already accepted in the same rebuild, is offered under the first free `-2`, `-3`, … suffix (the same deterministic suffixing REQ-GIT-010 uses for branch names), and that entry's description additionally names the skill it came from. No skill is silently unreachable and no built-in command changes meaning because a skill was installed. `/model <name>` and `/persona <name>` take arguments from configuration and generate no extra entries. | REQ-SHELL-056 |
| 7 | RESOLVED | They report. Silent failure is dropped: when the host has no handler for the folder or the URL, or the handler cannot be launched, the transient error notification of REQ-SHELL-112 appears and conveys both that the target could not be opened and the path or URL that was attempted, so the user can reach it another way; the wording is left to the implementation. The link stays enabled and can be activated again, and nothing else about the status strip changes. The About page keeps its own inline-caption form for the same class of failure. | REQ-SHELL-040, REQ-SHELL-141, REQ-SHELL-142 |
| 8 | RESOLVED | The deferred prompt suppresses itself. It is a one-shot offer abandoned unshown whenever the question has already been answered by the time the 650 ms elapses — the user has started the workspace-open flow, or a workspace has been chosen by any route. Two folder choosers are therefore never on screen at once and the deferred prompt never appears over a chooser the user opened. A prompt abandoned this way shows no reminder; the REQ-SHELL-012 reminder belongs only to a chooser the user actually saw and cancelled. | REQ-SHELL-011, REQ-SHELL-012, REQ-SHELL-021 |
| 9 | RESOLVED | The product is answerable only for what it hands the host: the dialog title, the initial location or selection, the restriction to directories where one is stated, the button set and which button is default, and the correct interpretation of every answer the dialog can return. Keyboard traversal, focus order, localization of platform-supplied button text, high-contrast rendering and screen-reader behaviour inside a native dialog are inherited, are not requirements on this product, and a host that falls short of them does not put the product out of conformance with the REQ-SHELL-144 sweep, which covers the seven primary views and the product's own windows. Two obligations survive regardless: a dialog dismissed by any host-offered means (Escape, the close control, a platform gesture) is treated as identical to its Cancel button with the same stated consequences; and no native dialog is ever the only route to a capability, so every flow one guards also states what happens on cancel. | REQ-SHELL-164 (new), REQ-SHELL-011, REQ-SHELL-021, REQ-SHELL-119, REQ-SHELL-163 |
| 10 | RESOLVED | The difference is intended and persists. The navigation rail is a set of mutually exclusive buttons, not a vertical navigation list: it keeps the button semantics of REQ-SHELL-027 through REQ-SHELL-032, in which each button is its own tab stop and activation both selects and switches. The list semantics of REQ-SHELL-153 — arrows move focus without changing selection, Space or Enter selects, a rule down the left edge marks the selection — apply to the shell's vertical navigation lists and explicitly not to the rail, and REQ-SHELL-153 says so. | REQ-SHELL-153, REQ-SHELL-027 through REQ-SHELL-032 |
| 11 | RESOLVED | The Rotaris binding is dropped for that chord, never remapped. A chord the host or an active input method consumes before the window sees it is not contested: the product takes no action, does not intercept or re-register it, and does not substitute some other chord — a shortcut this document names is that chord or nothing. No capability is lost, because every shortcut-bearing action is also a palette entry and a slash-catalogue entry (REQ-SHELL-048). Where the product can determine that a registered chord will never be delivered, keyboard help and the palette row show the action with no shortcut beside it rather than one that does nothing; where it cannot determine that — the ordinary case, since hosts do not publish their reservations — the chord is still shown and no notification, banner or error is raised. | REQ-SHELL-165 (new), REQ-SHELL-048, REQ-SHELL-049, REQ-SHELL-053, REQ-SHELL-054 |
| 12 | RESOLVED | Five criteria, all demonstrated against a real pseudo-terminal rather than a simulated stream. Echo latency: with take-control armed, the character a keystroke produces is visible in the grid within the 100 ms gesture budget of REQ-SHELL-150, measured from key press to the frame showing it. Ordering and fidelity: keystrokes reach the process in press order with nothing dropped, duplicated or reordered, and what arrives is exactly the REQ-SHELL-096 vocabulary — control chord as its control byte, printable text verbatim, an unencodable key transmitting nothing. Interrupt and end input: a command that acts on them is observably affected within 500 ms. Resize: once a resize settles, the size the process itself reports equals the columns and rows the grid last reported, no later than the first output written after the resize; a full-screen program repaints with no corrupted cells; the emulated screen resizes even with the backend gone. Throughput: a command outrunning the repaint rate still finishes with the same output and exit status it would have had with no terminal window open. | REQ-SHELL-166 (new), REQ-SHELL-093, REQ-SHELL-096, REQ-SHELL-103, REQ-SHELL-106 |
| 13 | RESOLVED | All of them are normative, with one class of exception: a value qualified "in the default theme" is a theme token, where the requirement is that the value is read from the active theme and that the default theme declares the stated number, so another theme may declare a different one and the layout must follow it. Named explicitly as normative: the auxiliary window sizes 820×620 and 900×620, which are the sizes the window opens at when the display work area can hold them and otherwise the largest size within that work area preserving the stated aspect — the user resizes freely afterwards and no auxiliary window size is required to be remembered; the 4200 ms transient-notification and default toast lifetimes; the elision caps of 28 characters on a terminal tab label, 12 on a background-session identifier and 90 on a command label, each counted as the user sees them and each keeping the full text in tooltip and accessible description; and the responsive thresholds 1180 px and 1080 px in the status strip and 1180 px for Workspace compact mode. A build that misses one misses the requirement that states it. | REQ-SHELL-167 (new), REQ-SHELL-047, REQ-SHELL-059, REQ-SHELL-072, REQ-SHELL-081, REQ-SHELL-082, REQ-SHELL-087, REQ-SHELL-112, REQ-SHELL-113 |
| 14 | MOOT | The question asks which stream carries a command-line usage message and how much of the argv grammar it repeats. There is no command line, no standard output contract and no usage message: REQ-SHELL-003 was withdrawn in the graphical-only sweep, and the capability it guarded — choosing a diagnostics level and output folder — is carried by REQ-SHELL-163, whose controls cannot express an invalid selection in the first place. | REQ-SHELL-003 (withdrawn), REQ-SHELL-163 (new) |
| 15 | MOOT | The question asks what `--diagnostics-output` does when supplied without `--diagnostics`. Neither option exists: REQ-SHELL-003 was withdrawn in the graphical-only sweep. In REQ-SHELL-163 the output folder and the capture level are two independent stored preferences, so a folder set while the level is `off` is simply the folder that will be used when a level is next chosen — a state, not an invocation, and therefore not an error. | REQ-SHELL-003 (withdrawn), REQ-SHELL-163 (new) |
| 16 | RESOLVED | Yes, refused, and the refusal vocabulary gains its missing entry. The exact sentence added to REQ-SHELL-149 is "Runs are unavailable in demo mode.", matching the form of the four already there. In demo mode the send control and Ctrl+Return decline with that sentence, the composer keeps the text the user typed, and no session state changes — the same no-partial-application rule the rest of REQ-SHELL-005 states. | REQ-SHELL-005, REQ-SHELL-149 |
| 17 | RESOLVED | The workspace-open flow uses the same three gates in the same fixed order as a window close: unsaved settings, then worktree integration, then active runs. One order for both flows is more coherent than two, and the close order is the one already fixed. Unsaved settings raises the save/discard/cancel dialog, where Cancel ends the flow with nothing changed and a Save that fails also ends it, while a successful Save or a Discard lets evaluation continue. A running worktree integration and an active run each decline outright with the transient error notification and their stated sentence. A decline shows no folder chooser and changes no window, workspace or stored preference. | REQ-SHELL-021, REQ-SHELL-119, REQ-SHELL-124 |
| 18 | RESOLVED | Arrow keys do nothing at the rail. While a rail button holds focus, Arrow Up, Down, Left and Right move no rail selection and switch no view; movement between rail buttons is by Tab and Shift+Tab only, and Space or Return on the focused button both checks it and switches the view, exactly as a click does. This is the difference from the vertical-navigation-list semantics that Open Question 10 decided to keep, and it is deliberate: rail activation both selects and navigates, so arrow traversal must not be able to reach it. | REQ-SHELL-028, REQ-SHELL-032, REQ-SHELL-153 |
| 19 | RESOLVED | One group to each of the five state text colours the theme already declares under REQ-SHELL-145, which makes the mapping exhaustive and leaves no group borrowing another's colour: {active, starting} use `running`; the waiting family {pausing, paused, cancelling} uses `waiting`; {completed} uses `done`; {failed, cancelled} uses `fail`; {idle} uses `info`. No group falls back to plain text colour, so all five are distinguishable from one another and from ordinary text, and every status tag drawn elsewhere in the product shares the same colour for the same word. | REQ-SHELL-036, REQ-SHELL-145 |
| 20 | RESOLVED | No exact sentence is fixed, because this is human-readable message text (product-owner decision 5). The requirement now states the explanation's information content exhaustively: it conveys exactly two things and no more — that the Settings view is holding edits which have not been saved, and that runs keep using the last saved values until they are saved — and the wording is left to the implementation. The joined "{short form} — {explanation}" form of the tooltip and accessible description is unchanged, since that join is a structural contract rather than wording. | REQ-SHELL-041 |
| 21 | RESOLVED | Nouns always agree with the count; the literal parenthesised "(s)" form is never rendered anywhere in the product, and REQ-SHELL-042's "N commit(s) ahead" tooltip was rewritten accordingly. Neither the tokens item nor the background-sessions item is hidden at a count of zero: zero is a known value, unlike the *unavailable* figures REQ-SHELL-045 and REQ-SHELL-046 deliberately withhold, so the strip reads "0 tok" before any tokens are consumed and "0 bg sessions" with none in the background, subject only to the responsive hiding of REQ-SHELL-047. The persona-window instance summary likewise always shows and always agrees — a persona window has at least the instance it was opened for. | REQ-SHELL-042, REQ-SHELL-044, REQ-SHELL-074 |
| 22 | RESOLVED | The product's single money rule governs, and no second rule is introduced: exact decimal arithmetic rather than binary floating point; rounded half-up; two decimal places, or four when the magnitude is below $0.01 so that a small non-zero cost is never rendered as zero; the currency the provider reports the cost in, shown as $, € or £ for USD, EUR and GBP and otherwise as the amount followed by the upper-cased code (REQ-PROVIDER-121). Costs billed in different currencies are never summed into one figure; where this workspace's runs span more than one currency, each is shown as its own separately readable figure within the item. The "n/a" literal for an unpriced model is unchanged. *Corrected 2026-09-29 (ESC-42, [R-067](../../product/requests.md#r-067)): the reason above is kept as written and does not hold — half-up rounding to four places renders every amount above zero and below 0.00005 as `0.0000`, so four places alone never delivered it. The rule now carries a floor that does: a non-balance amount greater than zero that would render as zero renders as `< 0.0001`.* | REQ-SHELL-045, REQ-PROVIDER-121 |
| 23 | RESOLVED | The balance uses the same money rule with the one difference that rule already draws: a *balance* is rounded **down** toward negative infinity rather than half-up, to two decimal places or four below $0.01 magnitude, in the currency the account reports, with $/€/£ for USD/EUR/GBP and the amount plus upper-cased code otherwise (REQ-PROVIDER-121). The {state} substituted into the tooltip is exactly the four-value credit-state vocabulary of REQ-PROVIDER-130 — `available`, `exhausted`, `overdrafted`, `unknown` — one readable word per state, mapped one-to-one so the state is recoverable from the text, with any state the backend reports that is none of the first three rendering as `unknown` rather than failing the read. The " ⚠ no credit" suffix is tied to the payload's admission-allowed flag being false. | REQ-SHELL-046, REQ-PROVIDER-121, REQ-PROVIDER-130 |
| 24 | RESOLVED | Excluded from all three surfaces alike — not the palette, not keyboard help, not the composer's slash catalogue. Escape is a contextual dismissal rather than an invocable action: it has nothing to do when there is nothing to dismiss, so listing it among things the user may choose would offer an action the window often cannot carry out, which REQ-SHELL-048 forbids. Its label "Close current overlay" exists to name the binding in this document, not to be presented as a command. Discoverability is preserved instead by prose: keyboard help carries a line conveying what Escape does and where it applies, and the drawer close controls already name it in their tooltip. | REQ-SHELL-048, REQ-SHELL-049, REQ-SHELL-054, REQ-SHELL-062 |
| 25 | RESOLVED | Yes, and modal surfaces always answer Escape before the window sees it, so window-level Escape never fires while one is open. The palette and the keyboard-help dialog close on Escape with no command run and nothing changed. Every confirmation, warning and save/discard/cancel dialog treats Escape as identical to its declining answer with that answer's full consequences — unsaved settings blocks the transition, the kill confirmation leaves the process alone, the quit prompt aborts the close, the no-credit confirmation starts no run. One qualification applies throughout: where a declining answer would also open an external page or hand something to an external handler, Escape performs the refusal alone and does not perform the external open, because dismissing a dialog must never launch something outside the application. An informational dialog whose only answer is acknowledgement closes on Escape; the non-cancellable progress dialog does not close on Escape at all, having no answer to give. | REQ-SHELL-055, REQ-SHELL-051, REQ-SHELL-054, REQ-SHELL-092, REQ-SHELL-117, REQ-SHELL-119, REQ-SHELL-124, REQ-SHELL-158 |
| 26 | RESOLVED | The per-view key strings are exactly the lower-cased view names of REQ-SHELL-023: `overview`, `workspace`, `mission`, `requirements`, `git`, `library`, `settings`. A view carrying more than one independent multi-pane arrangement keys each of them `{view}.{arrangement}`, the arrangement part a lower-case ASCII identifier that view declares. A key that has been used is never reassigned to a different view or arrangement — the vocabulary may gain a key and a key may be retired, but a retired key is never reused — so a layout written by an older release can only ever fail to match and fall back to declared defaults, never be applied to the wrong panes. | REQ-SHELL-069, REQ-SHELL-023 |
| 27 | RESOLVED | Equal division subject to minimums, and no other rule. The space along the divider's axis, less the space the dividers occupy, is divided equally among the panes; any pane that equal division would leave below its declared minimum is fixed at that minimum and removed from the division, and the remainder is divided equally among the panes still free, repeating until none is below its minimum. Leftover logical pixels go one each to the leading panes — leftmost for a horizontal split, topmost for a vertical one — so the result is exact rather than approximate. The acceptance tolerance is one logical pixel per pane. Where the minimums together exceed the available space, every pane takes its minimum and the view is at the size below which REQ-SHELL-022 refuses to resize. | REQ-SHELL-071, REQ-SHELL-022 |
| 28 | RESOLVED | One standard wheel notch scrolls exactly 3 rows. A high-resolution or fractional delta scrolls in the same proportion, with the fractional remainder accumulated across events so that slow continuous scrolling loses no motion and eventually advances a row. Scrolling is clamped at both ends of the retained history and never wraps. | REQ-SHELL-101 |
| 29 | RESOLVED | The toast travels 12 px upward into its final position while its opacity goes from 0 to 1, over 160 ms in the default theme. Both the travel distance and the duration are theme motion tokens (REQ-SHELL-129), so another theme may declare different values and the animation must follow them; the stated numbers are the default theme's. Under reduced motion neither runs — no timer and no intermediate frame — and the toast simply appears at its final position and opacity. | REQ-SHELL-113, REQ-SHELL-129, REQ-SHELL-136 |
| 30 | RESOLVED | No exact string; the information content is fixed and the wording left to the implementation (decision 5). While the download runs, the notice keeps its title and identity — updated in place, never replaced — and its message conveys exactly two things: that the update is downloading, and how far it has got as a whole-number percentage, redrawn only when that whole number changes. "Update now" is disabled for the duration so the same download cannot be started twice, and its accessible description says why. On completion the message conveys that the update is ready to install and the action is enabled again, performing REQ-SHELL-115's install action. On failure the notice becomes the persistent ERROR notice of REQ-SHELL-116, conveying that the download failed, carrying the reason as copyable details, with the action enabled again so it can be retried. | REQ-SHELL-118, REQ-SHELL-115, REQ-SHELL-116 |
| 31 | RESOLVED | Exactly four of the nine count: `active`, `starting`, `pausing`, `cancelling` — the statuses in which work is still in flight and a model provider may still be consumed. `paused`, `completed`, `failed`, `cancelled` and `idle` do not count, because quitting in those states loses no in-flight work, which is the only thing the prompt warns about. The same four-status test is now what "a run is active" means throughout the domain: the workspace-open gate, the close guard, and the new-session and session-browser refusals all apply it. REQ-SHELL-155 is the single exception and keeps its own stricter test, under which a run whose liveness cannot be determined counts as live. | REQ-SHELL-122, REQ-SHELL-021, REQ-SHELL-036, REQ-SHELL-119, REQ-SHELL-125, REQ-SHELL-126, REQ-SHELL-155 |
| 32 | RESOLVED | Both are taken from the domains that already own them rather than invented here. Sandbox modes are exactly the three values of REQ-SANDBOX-048 — `off`, `workspace-write`, `read-only` — offered in that order with `off` preselected to match that requirement's default; the dialog offers no fourth value and no free-text entry, so an invalid mode is unreachable from this surface. The generated worktree branch name is `rotaris/session/<session-id>` (REQ-GIT-007), shown in the dialog before it is accepted, receiving the deterministic `-2`, `-3`, … collision suffixes of REQ-GIT-010 when the name is taken. A branch name the user supplies instead is accepted only when already in the normal form of REQ-GIT-009 and otherwise draws that requirement's rejection error, unchanged. | REQ-SHELL-125, REQ-SANDBOX-048, REQ-GIT-007, REQ-GIT-009, REQ-GIT-010 |
| 33 | RESOLVED | Labels and descriptions are human-readable text, so their content is fixed and their spelling is not (decision 5). Every registered theme declares a display label and a one-line description alongside its name. The label must be a human-readable rendering of that theme's own name, distinct from every other registered theme's label, and stable for the life of the name so a user's label-to-theme mapping does not shift between releases. The description must convey what visually distinguishes the theme and whom it suits; for the three built-ins it must convey that `rotaris-dim` is the default, a dark theme at moderate contrast for long working sessions, that `nocturne` is a darker dark theme with deeper backgrounds for low ambient light, and that `high-contrast` raises contrast well beyond the REQ-SHELL-129 floors and is the theme to choose when the other two are hard to read. | REQ-SHELL-133, REQ-SHELL-128, REQ-SHELL-129 |
| 34 | RESOLVED | The transient error notification of REQ-SHELL-112 — the same surface the workspace-open, new-session and session-browser refusals already use, so a refused action always reports in one place. The message conveys three things: that nothing was restored; that the reason is a live run, or that liveness could not be read and is therefore treated as live; and that finishing or cancelling the run makes restore available. Wording is left to the implementation. A refused restore changes nothing at all — no file, no checkpoint record, no view contents — and leaves the checkpoint listing exactly as it was, so a refusal is never a partial restore. | REQ-SHELL-155, REQ-SHELL-112 |
| 35 | RESOLVED | Either condition triggers it, and either alone is enough: the polled balance is at or below zero, or that same poll reported the service declining new work (admission not allowed, REQ-PROVIDER-130). The two need not agree and no reconciliation is attempted. Title and body are stated as content, not wording: they convey that the account has no credit or is being refused new work, that a run on a cloud model may therefore fail partway or not start at all, and that the choice is between starting anyway and topping up. Two answers only — "Start anyway", and a declining answer whose own label states that it opens the account page, which is the default. Escape starts no run and opens nothing, under the general rule of REQ-SHELL-055 that dismissing a dialog never launches anything outside the application. The already-polled-balance rule is unchanged: no network request between the request and the confirmation. | REQ-SHELL-158, REQ-SHELL-055, REQ-PROVIDER-130 |
| 36 | RESOLVED | The interval is 400 ms after the last keystroke, with an immediate flush — not waiting out the interval — whenever the composer loses focus, the active view changes, the workspace is replaced, or the window closes. Survival of an abnormal termination is deliberately not promised; the bound is stated instead, which is checkable where a promise would not be: a power loss or a killed process may lose at most the keystrokes of the last debounce interval and nothing earlier, because every deliberate departure from the composer has already flushed. A draft is never left half-written — a write lands whole or not at all — so the text read back is always text the user actually typed at some moment. | REQ-SHELL-159 |


> ## Amendment, 2026-09-02 — ESC-24, and the preference store's per-user location
>
> *The ESC-24 half is recorded by the sweep pass rather than by the agent that made it, so the record is
> not owed twice. The preference-store half is the sweep's own corrective edit.*
>
> **ESC-24 — a launch arriving while this instance is shutting down is refused.** `REQ-SHELL-169` is
> minted, placed in the window-close and shutdown section. "Shutting down" is the interval from the
> ordered shutdown effects `REQ-MONITOR-131` fixes beginning until the process ends, force-exit allowance
> included and not copied. Through it the instance builds no window, opens no workspace, and starts and
> writes nothing on the launch's behalf — including the window `REQ-STARTUP-162` would otherwise have a
> window-less instance build. The reason the ruling gave is carried in the requirement: admitting the
> launch would mean two instances briefly existed, which `REQ-STARTUP-161` exists to prevent, at the
> moment the product is least able to reason about its own state.
>
> **The refusal is answered, never silent**, and the requirement states why silence is not equivalent: an
> unanswered launch treats the instance as unreachable and reclaims the record, which is the path
> `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that can would
> produce the two simultaneous processes the refusal exists to avoid. Where a main window is on screen it
> is surfaced and already states that stopping is under way; where none is, the user is still told the
> application is finishing shutting down and will open when it has, so a launch that appears to do
> nothing for the length of the allowance is not mistaken for one that failed. The waiting launch's
> surface is handed to domain 11 rather than fixed here.
>
> **Domain 11 was amended in step, because without it the refusal is defeated by the requirement it
> relies on.** `REQ-STARTUP-164` clause (3) reclaimed the record where "a process that is running does
> not answer" within 5 seconds. A refusal is an answer but is not an acknowledgement of the hand-over, so
> on the literal reading a launch refused one second into a thirty-second allowance would reclaim the
> record four seconds later and become exactly the second instance ESC-24 forbids. The clause now states
> that an answered refusal stops that interval running at all, that the launch waits instead, that the
> wait is bounded by the force-exit allowance, and that the deferred launch re-enters the resolution
> order at clause (1) once the record is released. `REQ-STARTUP-162` gained the shutting-down exception
> to its build-a-window clause, had its silence rule scoped to a launch that has been handed over and has
> ended, and gained the paragraph fixing what a refused launch shows while it waits.
> `REQ-STARTUP-161` states that waiting is not a third outcome and that the two-outcome set stays closed.
> The Data & Formats constant for the 5 s hand-over wait now says it bounds an **unanswered** hand-over.
>
> **`REQ-SHELL-006`'s preference store now says which per-user location it is.** This is the sweep's own
> correction and it closes the last residue of the round's first defect. `REQ-STARTUP-145` now fixes
> which per-user location the product uses and directs every requirement that places something in a
> per-user directory to cite it. The desktop preference store is **not** one of `REQ-STARTUP-145`'s
> directories, so it inherited nothing, and its own closed list of observable properties described it
> only as "the host platform's own standard per-user application-settings location" — the same silence
> the round had just closed elsewhere. The store holds `workspace/lastOpened` and
> `diagnostics/outputDir`, both paths that describe *this* machine, so a replicated store would answer a
> launch on one machine with a folder that exists only on another. The property is added to the closed
> list with `REQ-STARTUP-145` cited for its terms and the reason stated locally, so a later reader meets
> the argument rather than the silence. The store's physical path and on-disk form remain implementation
> choices.
>
> **The alternative that was available and not taken** was for this document to state why the preference
> store *may* replicate. Nothing in the corpus supports that and two of the store's own keys contradict
> it, so the selection was made rather than the exception.

> ## Amendment, 2026-09-02 (requirement-shape sweep)
>
> **`REQ-SHELL-155` restated a refusal that domain 07 owns, and inherited its defect with it.** The
> checkpoint-restore refusal was stated independently here and in `REQ-SESSION-164`, and both attached the
> refusal to the decision to begin rather than to the whole of the restore — so a session becoming live
> after the question was answered was a session the user was never told about, and the restore proceeded to
> replace the working tree under a run that was using it.
>
> **Corrected by citation rather than by a second statement**, which is the pattern this corpus uses
> wherever two documents describe one condition. `REQ-SESSION-164` owns the condition and states the window;
> this requirement holds no copy of it and states no window of its own. What remains here is the part that
> is genuinely the shell's: **a restore refused because a session became live during it is reported on the
> same surface, in the same terms, as one refused at the moment it was asked.** Without that, an
> implementation could correctly refuse late and still present the user with a failure that looks like a
> different problem, which is how a correct refusal becomes an unhelpful one.
