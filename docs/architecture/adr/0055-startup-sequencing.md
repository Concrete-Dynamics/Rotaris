# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-1. Startup gains a phase in front of everything it previously
  began with: a launch first establishes whether it is the instance at all.
- **Revised:** 2026-09-01, to carry SR-7 and the first-paint measurement. Startup gains **another** phase
  in front of that one, on one artifact only: a `onefile` portable launch may have to prepare itself
  before an application process exists at all (`REQ-STARTUP-165`). The budget arithmetic is restated per
  flavour on measured figures rather than assumed, and the "Revisit if" clause that turned on that
  measurement is discharged.
- **Origin:** UI (ADR-UI-13)
- **Depends on:** ADR-0002, ADR-0042, ADR-0048, ADR-0050, ADR-0054
- **Governed by:** `owner-decisions.md` SR-1, SR-7
- **Evidence:** `../spikes/packaged-first-paint.md`

## Context

**SR-1: a second launch surfaces the running instance rather than starting a rival process.**
`REQ-STARTUP-161` fixes it: at most one instance per user account, every launch resolving to exactly
one of two outcomes and no third — it becomes the running instance, or it is handed to the instance
already running and ends without opening a window of its own. Several workspaces and several windows
are **not** a second instance and remain fully available; every main window, including
`REQ-SHELL-017`'s replacement window and `REQ-SHELL-162`'s demo window, is a window of the one
instance. The application defines no configuration key, environment variable, preference or interface
control by which a second can be started.

`REQ-STARTUP-161` also fixes what the deciding record must be, entirely in observable terms: one per
user account; **outside every workspace directory**, so it never appears in a project or its version
control; **not a key of the desktop preference store**, whose key set is closed (`REQ-SHELL-006`,
`REQ-STARTUP-146`); created by the launch that becomes the instance and released when that process
ends; and creatable, readable and removable **without elevation**. Its form and location are
explicitly implementation choices — which is what this record decides.

`REQ-STARTUP-164` fixes the resolution order and the failure direction. (1) Claim the record
exclusively; success makes this process the instance and startup continues at `REQ-STARTUP-040`.
(2) A failed claim means a record exists; attempt the hand-over, complete when the instance
acknowledges. (3) No acknowledgement within **5 seconds** — record unreadable, identifying no process,
naming a process that is not running, or naming one that does not answer — reclaim the record and retry
the claim **exactly once**. At most one reclaim and two claim attempts, and no waiting beyond that one
interval, **so a record another party keeps recreating can never make a launch spin.** (4) If the second
claim also fails, another launch claimed it inside the interval; attempt the hand-over once more and
end. The requirement names its own lineage — *"this is the discipline `REQ-SESSION-047` and
`REQ-SESSION-058` apply to a session lock — parse, probe, at most one reap, one retry, no spin, and no
side effect on the probed process"* — and it **deliberately resolves the ambiguous case in the opposite
direction**: an unreadable session lock resolves toward live because two writers would corrupt a
session, while an unreachable instance record resolved toward live would leave the user unable to start
the application at all. Probing must not affect the probed process, and a launch writes nothing but the
record while resolving it.

`REQ-STARTUP-162` fixes what a hand-over looks like: **nothing the user can see except a surfaced
window.** No window, dialog, banner, acknowledgement or error from the handed-over launch; nothing
written to the preference store or to any per-user or per-workspace state; the refusal is silent and no
surface anywhere reports it. Which window is surfaced: the main window that most recently held
keyboard focus, or the one built first if none ever has; never a persona or terminal window
(`REQ-SHELL-123`). Where the instance holds the record but has **no window open at all** — the
platform convention where a process continues after its last window closes — it builds and shows a main
window, resolving its workspace exactly as a launch does, and that window goes through the same
post-show activation as any other. Surfacing means show, un-minimise, and ask the window manager to
raise and activate; **a window manager that declines the raise is a supported outcome**, nothing is
retried, and what is guaranteed regardless is that the window exists, is not minimised or hidden,
carries the content the launch asked for, and has the platform's attention hint set if there is one
(`REQ-SHELL-161`).

`REQ-STARTUP-163` fixes what a workspace directory a launch carries does. Where the launch becomes the
instance, `REQ-STARTUP-041` applies unchanged. Where it is handed over: if a main window already has
that directory open, **that window is the one surfaced and no window is built**; otherwise the instance
**builds an additional main window** on that directory, shows it and surfaces it, leaving every window
already open exactly as it was — same workspace, same active view, same composer contents, same runs
still executing. `REQ-SHELL-017`'s replacement semantics do not apply and the close gates of
`REQ-STARTUP-053` and `REQ-SHELL-021` are **not evaluated**: such a launch adds a window rather than
displacing one. A launch carrying no directory builds no window while the instance has one open.

`REQ-STARTUP-040`, `REQ-STARTUP-043`, `REQ-SHELL-015`, `REQ-WORKSPACE-014` and `REQ-WORKSPACE-141` fix
the startup order and make it observable: **preference scoping established, branded icon set, bundled
fonts registered, persisted theme restored — all before any window exists**; then the window is shown;
then and only then repository discovery, the update check and cloud-credit polling. **Constructing a
window without showing it must produce no network traffic.**

`REQ-SHELL-011`, `REQ-STARTUP-044` and `REQ-WORKSPACE-008`: **one shared deferred first-paint delay**,
measured from the moment the window is shown, serves every deferred offer; the deferred workspace prompt
is a one-shot **abandoned unshown if the question has already been answered**, so two folder choosers
are never on screen at once. `REQ-SHELL-011` is explicit that it is the product's single definition of
that delay.

`REQ-STARTUP-155`: the main window is painted within **5 seconds** of launch, **on every published
artifact and every bundle mode, with no per-flavour differential** — and it now says whose 5 seconds:
*"that bound is on the launch that becomes the running instance; a launch handed to an instance already
running paints no window of its own, is bounded instead by the hand-over interval of
`REQ-STARTUP-164`, and where it does cause a window to be built that window is bounded by this same 5
seconds."* The machine-setup empty-plan fast path is decided within the 100 ms budget and delays
neither first paint nor post-show activation.

**`REQ-STARTUP-165` puts something in front of everything this record sequences, on one artifact.** A
`onefile` artifact may prepare itself once and start from that preparation on every later run; the run
that prepares is exempt from the 5-second bound and **no other run is**, "first run" meaning the first
run of a given *version* of that artifact for that user on that machine. Preparing must be silent on
every path — made, reused, superseded or redone (`REQ-STARTUP-150`) — must issue no network request and
raise no elevation prompt, and an unusable preparation must be redone rather than reported. ADR-0054
owns the preparation's design; what this record owns is that it happens **before the application process
exists**, so it is upstream of the instance claim, of `REQ-STARTUP-040`, and of everything else here.

**`REQ-STARTUP-043` has grown a fourth member and it is not a network call.** Post-show background
activation is now repository status discovery, **the workspace-storage determination of
`REQ-STARTUP-166`**, the update check, and the cloud-credit poll. `REQ-STARTUP-166` requires the product
to determine directly — from the storage the workspace directory sits on, and never inferred from a
failed write, a collided lock or a refused session — whether an opened workspace sits on storage shared
with or synchronised to another machine, and to warn when it does. It applies to **every** path that
opens a workspace: `REQ-STARTUP-041`'s startup resolution, a directory a launch carries to an instance
already running (`REQ-STARTUP-163`), and the project switch of `REQ-STARTUP-047`. It resolves to exactly
one of three states — reachable by another machine, replicated by a synchronisation agent, or not
classifiable — the first two raising a persistent warning and **refusing nothing**, the third silent. It
is explicitly post-show, so it delays neither first paint nor the moment the interface accepts input,
and it adds no key to the desktop preference store (`REQ-STARTUP-146`).

`REQ-STARTUP-050`: the complete default desktop is painted and visible **before** the modal chooser
opens.

`REQ-SHELL-162`, `REQ-SHELL-005`, `REQ-STARTUP-055` to `REQ-STARTUP-057`: demo mode is a **property of a
window fixed when that window is built**, never toggled in an open window, never persisted, never
inherited by a replacement window; a demo window carries a non-colour marker for its whole life, never
writes the last-opened-workspace key, never prompts for a workspace, and performs no update or cloud
network traffic. Demo content is a **constant of the build**.

`REQ-SHELL-016` and `REQ-STARTUP-045`: windows created and destroyed immediately must not deliver
deferred offers. `REQ-SHELL-008`: the bundled fonts are available before the first paint, with a host
fallback permitted in the live application and forbidden in a benchmark iteration (ADR-0053).
`REQ-STARTUP-140` and `REQ-STARTUP-156`: a configuration-load span is recorded in diagnostics, and the
release gate requires each published artifact to be downloaded and launched to first paint at least once
on its own platform. `REQ-STARTUP-152` makes the whole of SR-1 a release-checkable claim: *"launching
that entry point twice on one user account SHALL leave exactly one process of the application
running."*

## Alternatives considered

### For the instance claim

**I — Our own record file, resolved by our own discipline.** A small file in the per-user data
directory holding pid, host and a hand-over endpoint, claimed by atomic exclusive create, probed and
reclaimed by exactly the logic `REQ-SESSION-047` applies to a session lock, with a socket or named pipe
for the hand-over.

*For:* it is visibly the same idiom as the session lock, which `REQ-STARTUP-164` explicitly asks for,
and every constant in the requirement — the 5 s wait, the one reclaim, the two claim attempts — is ours
to set and to test. Nothing is inherited from a component whose behaviour we do not control.
*Against:* it is a cross-platform IPC endpoint and a stale-detection protocol written from scratch, on
the critical path of every launch, in the one place where a bug makes the product unlaunchable rather
than merely wrong. It duplicates something the platform layer already ships, and it would have to be
correct on three platforms with three different ideas of what a process handle means, including the
`REQ-SESSION-054` hazards — pid recycling, and Windows reporting an exited process as alive while any
handle to it survives.

**II — The platform's single-instance primitive.** Electron's `app.requestSingleInstanceLock()`, which
returns whether this process obtained the lock, with the `second-instance` event delivering the other
launch's `argv`, working directory and an `additionalData` object to the primary. **Chosen.**

*For:* it is one call and one event; the record lives in the per-user data directory, satisfying every
observable `REQ-STARTUP-161` states — one per user account, outside every workspace, not a preference
key, released when the process ends, no elevation; the stale-record probe and reclaim are the
platform's, written against each platform's own process semantics; and on macOS it composes with the
convention that a second launch of a bundle does not create a second process at all.
*Against:* the 5 s bound, the at-most-one-reclaim and the no-spin guarantee of `REQ-STARTUP-164` become
properties of a component we did not write. **That is a verification obligation, not an assumption**,
and it is discharged below rather than waved at.

**III — No single-instance record; rely on the session lock alone.** Recorded because it was the
product's shape before SR-1 and because it is the alternative a reader will ask about. Two application
processes could coexist; each session was protected by its own lock, so no session could be corrupted.
*Against:* it is what SR-1 withdraws, and the reasons are elsewhere in the record — the filesystem
became a transport, a session could be live somewhere this application could only watch, and polling
followed from having no channel to push over. It is not available.

### For the paint sequence

**A — A single renderer bundle loaded from the local filesystem, with main doing the sequencing.**

*For:* simple; the toolchain's default output.
*Against:* nothing inherently, but it does nothing to help the 5 s budget either. The budget must hold
for the **single-file portable artifact, which self-extracts before the process even starts**, and for
the application image, which mounts a compressed filesystem. Because the budget is stated with **no
per-flavour differential**, the slowest artifact sets the target and the renderer's own load time is the
part we control.

*What measurement has since established about this argument.* It was right that the portable's
self-extraction sets the target and wrong to imply the renderer's load time could be traded against it.
On the portable the extraction consumed **13.3–19.6 s of a 5 s budget** and left nothing at all for the
application; no choice about the renderer bundle was going to matter. On the flavours that pass,
packaging and runtime consume **0.6–1.6 s** and the payload's *weight* is nearly free — 327 MB of extra
payload moved first paint by about 10 ms. **The lever was never bundle size and never the renderer's
load path; it was the extraction mechanism**, and SR-7 changed that (ADR-0054 alternative P4). The
renderer's load time is still the part we control, but it is being spent out of a 3.4–4.4 s budget
rather than out of a deficit.

**B — The same, plus an explicit paint-first discipline.** The window is created hidden, loads a shell
that paints the chrome and the default view from **stored state only**, and is shown when it is ready;
everything that could block is deferred behind the show. Chosen.

*For:* it is what the startup order already describes, and it gives "the complete default desktop is
painted and visible before the modal chooser opens" a mechanism rather than a hope. It also makes
"constructing a window without showing it produces no network traffic" **structurally true**, because
every network path hangs off the show event.
*Against:* requires discipline about what the first paint depends on: any wait on a workspace read, a
version-control probe, a provider catalogue or a session load moves into the deferred phase or the
budget goes.

## Decision

**Alternative II for the claim, alternative B for the paint**, with these specifics.

### Phase −1 — the launch preparation, on the `onefile` portable only

**Before an application process exists.** A `onefile` portable launch resolves its preparation
(`REQ-STARTUP-165`, ADR-0054) and executes the prepared payload; every other artifact skips this phase
entirely because it has no preparation to resolve. Three orderings are fixed here because they are
startup properties rather than packaging ones:

- **It precedes everything.** The instance claim, the preference-store scoping, the icon, the fonts and
  the theme all belong to the application process, and on this artifact that process does not exist
  until phase −1 has chosen which image to run. Nothing in phase 0 or later may be relied on here.
- **It is silent, including on the recovery path**, and a recovery is indistinguishable from a first
  run (`REQ-STARTUP-165` (c), `REQ-STARTUP-150`). Nothing in this record's notice or diagnostics
  machinery is available in phase −1 anyway, which makes the silence structural.
- **The instance claim cannot serialise it.** Two portable launches can race to prepare, because the
  claim they would be serialised by lives in a process neither has started yet. ADR-0054 resolves the
  race in the preparation itself; what this record records is that **SR-1 does not remove it**, and that
  the two launches converge on the ordinary hand-over once both have an application process.

**The budget.** The run that prepares is exempt from `REQ-STARTUP-155`'s 5 seconds; every later run of
that artifact is bound by it exactly as every other artifact is, and the release gate now checks both
runs on the same machine (`REQ-STARTUP-156`). So this record's own first-paint discipline is measured
against the **steady-state** portable launch, not against the preparing one.

### Phase 0 — the instance claim, before anything else

**The claim is the first thing a launch does, ahead of every step of `REQ-STARTUP-040`.** It runs
before `app.whenReady()` resolves, so a launch that is handed over performs no preference scoping, sets
no icon, registers no font, reads no theme, constructs no window and opens no connection. That is what
makes `REQ-STARTUP-162`'s "writes nothing to the preference store and nothing to any per-user or
per-workspace state" structural rather than a discipline to remember.

**Two internal-child branches are evaluated ahead of the claim, and that ordering is deliberate.** The
product starts its own executable as a child in two cases: the bundled code-intelligence server
(`REQ-MCP-033`, `REQ-STARTUP-015`, ADR-0035) and the benchmark iteration child (`REQ-UIBENCH-037`,
ADR-0053). Neither is a launch in `REQ-STARTUP-161`'s sense — neither opens a window, neither becomes or
is handed to an instance — but both would be caught by a claim placed first, and the benchmark case
would then fail `REQ-UIBENCH-046`'s isolation guarantee **silently, with the run still reporting
numbers**. The entry point therefore takes those branches and returns before the claim is attempted.
`REQ-STARTUP-161`'s prohibition enumerates a configuration key, an environment variable, a preference
and an interface control, and names no command-line argument, so a sentinel argument does not create the
thing it forbids — but **the composition of the two requirements is inferred here rather than stated
anywhere, and that is OQ-43.** It is left open rather than closed by this record.

- **The record is Electron's single-instance lock**, claimed with `app.requestSingleInstanceLock()`.
  A `true` return makes this process the instance; startup continues at phase 1. A `false` return means
  the launch has been handed over: it ends. `app.releaseSingleInstanceLock()` exists and **is never
  called** — there is no supported way to run two instances (`REQ-STARTUP-161`,
  `REQ-STARTUP-146`).
- **The workspace directory travels in `additionalData`, not in `argv`.** Electron's documentation
  recommends `additionalData` precisely because the command-line array delivered to `second-instance`
  may have parameters appended or ordering altered by the platform. The launch resolves the directory
  the operating system handed it (`REQ-STARTUP-024`, `REQ-STARTUP-041` (a)) and passes it as one
  declared field. `argv` and the working directory are still delivered and are still read as a
  fallback, but the declared field is authoritative.
- **The primary handles `second-instance` by resolving `REQ-STARTUP-163`, then `REQ-STARTUP-162`:**
  if a main window already has that directory open, surface it and build nothing; if a directory was
  carried and no window has it open, build an additional main window on it, show it, surface it, and
  leave every other window untouched; if no directory was carried, surface the main window that most
  recently held keyboard focus, or the first built, and build nothing. If the instance has no window at
  all, build one, resolving its workspace as a launch does. Every window built this way goes through
  the ordinary post-show activation of `REQ-STARTUP-043` and the ordinary shared deferral of
  `REQ-SHELL-011`.
- **macOS is a different shape and needs no special protocol.** A second launch of the same bundle does
  not create a second process; the system activates the running one. The instance therefore also
  listens for `open-file` — which must be registered **before** `ready`, or a launch-time file is
  missed — and for `activate`, whose `hasVisibleWindows: false` case is exactly `REQ-STARTUP-162`'s
  "holds the record but has no window open at all". Both paths converge on the same handler as
  `second-instance`, so the surfacing rule is written once.
- **On Windows and Linux the directory arrives in the launch's own arguments** and is read from
  `process.argv` in main before the claim, so it is available to put in `additionalData`.

### Verification obligation on `REQ-STARTUP-164`, recorded rather than assumed

`REQ-STARTUP-164` fixes a 5 second hand-over wait, at most one reclaim, at most two claim attempts, no
spin, no side effect on the probed process, and nothing written but the record. The platform primitive
performs its own probe of the recorded process and its own reclaim of a record left by a process that
is gone, on its own schedule. **Whether that schedule matches the requirement's is a measurement this
record does not have, and it must be taken before implementation is authorised.** Three observations
decide it, on all three platform keys of `REQ-STARTUP-030`:

1. **A record left by a process killed without cleanup must not make the application unlaunchable**, and
   the next launch must reach a window within `REQ-STARTUP-155`'s 5 seconds. This is the case
   `REQ-STARTUP-164` exists to forbid and the one the requirement is emphatic about.
2. **A recorded process that is running but not answering must be resolved within the stated interval**,
   with at most one reclaim, and without spinning.
3. **The probe must leave the probed process unaffected** — no signal, no window message that changes
   its state, no termination.

**If any of the three does not hold, alternative I is adopted for the claim and the platform primitive
is dropped, not wrapped in a timeout.** A record whose reclaim rules we cannot state is not a record
that satisfies `REQ-STARTUP-161`. This is recorded as a named spike, because the failure mode — a
product that will not start — is the worst one in the domain and is invisible until it happens.

### Phase 1 onward — the paint sequence

- **The pre-window phase, in main, in this order:** resolve the preference-store root and establish
  scoping; set the application icon; register the bundled font families; read the stored theme. **Only
  the first of these may touch disk on the critical path, and it reads one small file.**
- **The first paint is rendered from stored preferences and constants only.** The seven views are
  constructed — which ADR-0045 needs anyway for construction-time slot allocation — the rail, title bar
  and status strip are drawn, and the workspace view shows its empty state. **Nothing on this path waits
  on a workspace read, a version-control snapshot, a session load, a provider catalogue or a model
  list**; the composer's model chip carries a neutral loading label precisely because model options are
  not yet loaded.
- **Post-show activation is a single ordered pipeline**: version-control refresh, **the workspace-storage
  determination of `REQ-STARTUP-166`**, update check, cloud-credit polling; then, once the window is
  interactive, initialisation resolution and the hook-review notice; then, after the shared deferral, the
  project chooser if it is still owed. The two mutually exclusive schedules `REQ-STARTUP-044` names are
  **two branches of that one pipeline, sharing one delay**.
- **The workspace-storage determination runs on every path that opens a workspace, and is one function
  with three entrances.** `REQ-STARTUP-041`'s startup resolution, `REQ-STARTUP-163`'s launch-carried
  directory, and `REQ-STARTUP-047`'s project switch each reach it; a window built for a handed-over
  launch goes through the same post-show activation as any other, so it inherits the determination
  without a second code path. It **classifies from the storage** the directory sits on and never from a
  failure — not a failed write, not a collided lock, not a refused session — which is what makes the
  warning arrive before the situation costs the user anything. Its three outcomes are: reachable by
  another machine, replicated by a synchronisation agent, or not classifiable; the first two raise the
  persistent notice and **refuse nothing**, the third is silent. It is not persisted and it adds no
  preference key.
- **It must not be on the critical path and must not be able to put itself there.** It is post-show by
  requirement, and the classification touches the filesystem, potentially a slow or unreachable network
  one — precisely the case it exists to detect. So it runs off the interface thread and a determination
  that does not answer leaves the workspace **not classifiable and silent**, which is the requirement's
  own third outcome rather than an invented failure mode.
- **The deferral is one timer owned by the window registry** (ADR-0048), cancelled on window close and
  abandoned unshown if the question it asks has already been answered. **It must not be re-implemented
  per offer**, and it is **per window**: a window built by `REQ-STARTUP-163` gets its own deferral,
  which is why the one-shot must be answered per window rather than per process.
- **Fonts are preloaded and their load is awaited before the first paint**, because they must be
  available before the first paint and **a late font swap would reflow the transcript and invalidate the
  measurement cache** of ADR-0045. In the live application a failure falls back to host fonts and
  continues; in a benchmark iteration it is a crash. **One loader, two failure policies.**
- **Demo mode is a construction-time window parameter**, carried from the palette entry through the
  window registry into the renderer's initial state; there is no runtime toggle and nothing is written
  to the preference store.
- **Budget protection is a measurement, not an intention.** Launch-to-first-paint is recorded in
  diagnostics as a span, and the release gate requires each published artifact to be launched to first
  paint on its own platform — so the budget has both a continuous signal and a release check. **The
  claim is inside that span**, because it is on the critical path of the launch that becomes the
  instance.

## Consequences accepted

1. **A hard rule that nothing may be awaited before the window is shown**, which is easy to violate
   accidentally and needs a test that fails on a regression rather than a review convention. Phase 0
   adds a second such rule: **nothing may run before the claim**, and it is easier to violate, because
   the natural place to put "set up the preference store" is at the top of main.
2. **The first frame is deliberately empty of workspace content**, which is a visible design
   consequence: the user sees the shell before they see their project.
3. The run host is forked after the shell is ready (ADR-0002), so no run can start before then; nothing
   in the startup requirements asks for one.
4. **`second-instance` is guaranteed to be emitted only after `ready`.** A launch handed to an instance
   that is still starting is acknowledged at the platform layer, but its workspace directory is acted on
   after the primary's own `ready`. That is consistent with `REQ-STARTUP-162` — the handed-over launch
   shows nothing either way — and with `REQ-STARTUP-155`, which bounds the handed-over launch by the
   hand-over interval rather than by first paint. It does mean the *worst* case for a user double-clicking
   the icon twice in quick succession is the primary's own 5 s paint followed by the surfacing, and that
   is the correct behaviour rather than a defect to engineer around.
5. **The window registry becomes the answer to "which window".** `REQ-STARTUP-162` needs the main window
   that most recently held keyboard focus, falling back to the one built first, and needs persona and
   terminal windows excluded. That is a most-recently-focused ordering the registry (ADR-0048) must
   maintain over main windows specifically, updated on focus rather than on creation, and it must survive
   a workspace switch in which two main windows are briefly alive at once (`REQ-SHELL-017`).
6. **A launch can now add a window to a running instance**, so window creation is no longer only an
   in-application gesture. `REQ-STARTUP-163` is explicit that the close gates of `REQ-STARTUP-053` and
   `REQ-SHELL-021` are not evaluated for it and that `REQ-SHELL-020` does not apply, so the code path
   that builds a window for a launch must not be the same one that a workspace-open request from a
   window uses. Two entrances, one builder.
7. **Nothing user-visible reports a refused launch**, anywhere, ever (`REQ-STARTUP-162`). A diagnostics
   record of the hand-over is permitted and useful; a toast, a banner or a log line the user is shown is
   not.
8. **The budget this record is disciplined against is now a measured number, and it is per flavour.**
   On the installed Windows build, packaging and runtime consume **0.6–1.6 s** of the 5,000 ms — 664 ms
   to 1,561 ms from launch to first paint on a trivial application, with the never-launched-from-this-
   path case at 1,232–1,593 ms. **That leaves roughly 3.4–4.4 s** for everything this record puts in
   front of first paint: preference scoping, the icon, the font registration and await, the theme read,
   the seven constructed views and the shell's first frame. It is a real budget and it is not generous
   once ADR-0040's syntax-tree parser and ADR-0035's bundled runtime are in the process. Two
   qualifications keep it honest: the measured application **contains no product at all** — no
   framework, no store, no native module, no preload, no theming — so everything this record sequences
   is *additional*; and the clock in the measurement starts at process creation from a parent, not at a
   double-click in the file manager, so the figures are a lower bound on what a user experiences.
9. **On the portable, the budget applies to the second run onward, and that is the run to instrument.**
   `REQ-STARTUP-155`'s exemption covers the preparing run only. Launch-to-first-paint is recorded as a
   diagnostics span either way, and the span must be able to say **which kind of run it belongs to**, or
   the first-run outlier will contaminate every distribution built from it. `REQ-STARTUP-156`'s
   two-run gate is the release-side form of the same distinction. Note that nothing about this may reach
   a user-facing surface (`REQ-STARTUP-165` (f), `REQ-STARTUP-150`): the run kind is a diagnostics
   property, not a notice.
10. **Windows will not clamp a window to a display, and no construction-time figure bounds its
    viewport.** A content height of 20,000 CSS pixels was requested, granted and laid out on a machine
    whose tallest display is 1,080 px, and display enumeration at construction offered nothing that
    bounds it. This record's "the seven views are constructed — which ADR-0045 needs anyway for
    construction-time slot allocation" therefore rests on a **declared constant** rather than on
    anything the host tells us at startup, and a window driven past that constant degrades to a
    partly-blank pane rather than to a slow one. The constant and its growth branch belong to ADR-0045;
    what belongs here is that startup cannot supply a better figure and must not be written as though it
    could.

## Open question

`REQ-SHELL-005` says that in demo mode "the process opens no outbound network connection for its whole
lifetime", while `REQ-SHELL-162` lets a demo window be opened from a non-demo window and
`REQ-STARTUP-057` says a non-demo window of the same process is unaffected and checks for updates
normally. **Those cannot both hold once a mixed process exists.** Either the network-silence claim is
per-window rather than per-process, or a demo window must be its own process. **SR-1 sharpens this
rather than resolving it**: with one instance, a mixed process is not an unusual configuration to be
avoided but the only one available, and "a demo window must be its own process" is no longer an option
the architecture can take, because a second process of this application is exactly what
`REQ-STARTUP-161` forbids. The per-window reading is therefore the only one that can hold, and it should
be stated in the requirement rather than inferred here. See OQ-34.

## Discharged — the slowest-artifact clause, retired 2026-09-01

This record previously carried: *"Measurement on the slowest artifact shows the 5 s budget cannot be met
even with an empty first paint — the remedy would be a bundle-mode change, and the portable's single-file
shape is a hard requirement, so the conversation would be about the budget or about what is bundled."*

**The measurement was taken, the clause fired, and its stated remedy was not what happened.** The
portable failed with an empty first paint and with an empty *bundle* — 13,287 ms on a zero-payload build
— so the trigger was met exactly as written. But the conversation the clause predicted, "about the
budget or about what is bundled", turned out to be the wrong pair: SR-7 kept the budget, kept
`REQ-STARTUP-013` and `REQ-STARTUP-031`, kept what is bundled, and changed the **launch mechanism**
instead, with `REQ-STARTUP-155` gaining a first-run-of-a-version exemption and nothing else. The clause
is preserved so a reader can see that it was right about the failure and wrong about the remedy: it
assumed the only variables were the budget and the payload, and the third variable — how the payload
gets onto the disk — was invisible until it was measured.

## Revisit if

Spike 20 shows the prepared portable's steady-state launch does not reach first paint inside 5 s, in
which case this record's pre-window phase is competing with a launch cost it cannot reduce and the
sequence has to be argued against a smaller budget than the 3.4–4.4 s consequence 8 assumes. Or the
three observations under the verification obligation do not hold on some platform — in which case the
claim moves to alternative I on every platform, not only the one that failed, because one record
resolved two different ways is worse than either. Or `REQ-STARTUP-166`'s determination turns out to cost
enough that it competes with the rest of post-show activation, in which case it needs its own place in
the pipeline rather than a position in a list.
