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
- **Revised:** 2026-09-02, against the settled specification. Three things land. Phase −1 gains an
  **outcome that is not silent** — `REQ-STARTUP-165` (c) now specifies a notice for a preparation that
  cannot be made at all, and this record owns where in the post-show order it sits. The workspace store
  is named in that order, because ADR-0058 puts its opening there and a **native binding that will not
  load** must fail loudly on `REQ-SESSION-089`'s terms rather than be swallowed. And `REQ-STARTUP-121`'s
  update restart is a **hand-over of the instance record**, which the platform primitive alternative II
  chose has no operation for — a gap this record had not noticed and now closes.
- **Revised:** 2026-09-02, a second time. **This record's own verification obligation was measured and it
  fired.** Observation 2 does not hold on Windows: against a primary that was running but not pumping
  messages, `app.requestSingleInstanceLock()` **blocked the launching process for 20.0 seconds**, returned
  `false`, performed no reclaim and no retry, and the hand-over **never reached the primary — not even in
  the 25 seconds after it recovered.** The second launch ended **with no window on screen**, which
  `REQ-STARTUP-164` forbids in terms. By this record's own stated rule, **the claim moves to alternative
  I — our own record file — on every platform**, and the platform primitive is dropped rather than wrapped
  in a timeout. The paint sequence is unaffected and alternative B stands. The portable's steady-state
  budget is also now measured rather than asserted, and the "Revisit if" clause that turned on it is
  discharged.
- **Origin:** UI (ADR-UI-13)
- **Depends on:** ADR-0002, ADR-0042, ADR-0048, ADR-0049, ADR-0050, ADR-0054, ADR-0056, ADR-0058
- **Governed by:** `owner-decisions.md` SR-1, SR-7, and the consequence for ADR-0058 recorded with ESC-21
- **Evidence:** `../spikes/presenter-liveness-and-instance-claim.md` §5 — the measurement that discharges
  and fails this record's verification obligation on the instance claim;
  `../spikes/cached-portable-launch.md` — the portable's steady-state launch, which fixes phase −1's cost
  and the budget arithmetic of consequence 8; `../spikes/packaged-first-paint.md` for the installed
  flavours and for the portable target SR-7 replaced.

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
ends, **"a record that outlives its process being settled by `REQ-STARTUP-164`"**; and creatable,
readable and removable **without elevation**. Its form and location are explicitly implementation
choices — which is what this record decides. That closing clause matters more than it looks: the
requirement **anticipates the record surviving its holder** and hands that case to the probe-and-reclaim
path rather than to any operating-system release, which is what lets the record be an ordinary unheld
file.

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
record while resolving it. **The requirement closes by licensing the one state the reclaim can produce**,
and this record now depends on that sentence: *"Reclaiming from a process that is running but
unresponsive is the one path by which two processes of the application can briefly exist, and what makes
it safe is that a session is protected by its own lock whichever process reaches it (`REQ-SESSION-046`,
`REQ-SESSION-047`), not by this record."*

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
run of a given *version* of that artifact for that user on that machine. Preparing is silent on four
paths — made, reused, superseded or redone (`REQ-STARTUP-150`) — must issue no network request and raise
no elevation prompt, and an unusable preparation must be redone rather than reported. ADR-0054 owns the
preparation's design; what this record owns is that it happens **before the application process exists**,
so it is upstream of the instance claim, of `REQ-STARTUP-040`, and of everything else here.

**There is a fifth path and it is not silent, which changes what phase −1 owes the rest of startup.**
`REQ-STARTUP-165` (c) now states the outcome for a run that produces **no usable preparation at all** —
the storage refusing the write, being full, or being unavailable, so that redoing it does not succeed
either. Such a run still starts the artifact, keeps every behaviour of clause (f), is exempt from the
5-second bound on `REQ-STARTUP-155`'s own terms because it performs the work a preparation exists to
avoid, and **is reported once, after the window is painted**, on the persistent non-modal non-blocking
surface `REQ-STARTUP-116` uses, at warning severity. `REQ-STARTUP-150` was amended to carve this out
explicitly: "an artifact preparing itself for launch, reusing a preparation, or redoing an unusable one
is always silent … while an artifact that could produce no preparation at all is always warned about and
never prevented from running, that being the one preparation outcome the product reports". **So phase −1
can now produce something the post-show pipeline has to deliver**, which it could not before.

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
for the hand-over. **Chosen, on measurement, 2026-09-02.**

*For:* it is visibly the same idiom as the session lock, which `REQ-STARTUP-164` explicitly asks for,
and every constant in the requirement — the 5 s wait, the one reclaim, the two claim attempts — is ours
to set and to test. Nothing is inherited from a component whose behaviour we do not control.
*Against:* it is a cross-platform IPC endpoint and a stale-detection protocol written from scratch, on
the critical path of every launch, in the one place where a bug makes the product unlaunchable rather
than merely wrong. It duplicates something the platform layer already ships, and it would have to be
correct on three platforms with three different ideas of what a process handle means, including the
`REQ-SESSION-054` hazards — pid recycling, and Windows reporting an exited process as alive while any
handle to it survives.

*What measurement has since established about that "against".* **Its first clause is false and its
second and third stand.** "It duplicates something the platform layer already ships" was the load-bearing
half, and there is nothing to duplicate: the primitive does not implement `REQ-STARTUP-164`'s discipline
at all. Against a primary that was running but not pumping messages it performed **no reclaim, no second
claim attempt, and no bounded wait** — it blocked for 20.0 s and returned `false`. So the choice was never
between writing the discipline and inheriting it; it was between writing it and not having it. The other
two clauses are unaffected and are now the real cost of this alternative, and they are stated as
consequences rather than talked down: the endpoint and the stale-record protocol are ours, on the launch
path, and the `REQ-SESSION-054` hazards are ours to resolve — which the product must do for the session
lock anyway, and which is exactly why `REQ-STARTUP-164` names that lock's discipline as its lineage.

**II — The platform's single-instance primitive.** Electron's `app.requestSingleInstanceLock()`, which
returns whether this process obtained the lock, with the `second-instance` event delivering the other
launch's `argv`, working directory and an `additionalData` object to the primary. **Was chosen. Refused
on measurement, 2026-09-02** — see the verification section below, which is where the numbers are.

*For:* it is one call and one event; the record lives in the per-user data directory, satisfying every
observable `REQ-STARTUP-161` states — one per user account, outside every workspace, not a preference
key, released when the process ends, no elevation; the stale-record probe and reclaim are the
platform's, written against each platform's own process semantics; and on macOS it composes with the
convention that a second launch of a bundle does not create a second process at all.
*Against:* the 5 s bound, the at-most-one-reclaim and the no-spin guarantee of `REQ-STARTUP-164` become
properties of a component we did not write. **That is a verification obligation, not an assumption**,
and it is discharged below rather than waved at.

*A second objection, found on 2026-09-02 and not previously recorded, because it comes from a requirement
this record had never read against the claim.* `REQ-STARTUP-121` requires the update restart to be a
**hand-over**: "the record of `REQ-STARTUP-161` passes from the current instance to the successor rather
than being released for anyone to claim". **The platform primitive has no pass operation.** It offers a
claim and a release, and this record's own decision states that the release is never called. So the one
verb the requirement names is the one verb the component does not have, and the gap is not cosmetic — the
requirement is explicit that a launch arriving mid-hand-over "SHALL be handed to whichever of the two
holds the record at that moment and SHALL never start a third process", which is a statement about there
being no moment when the record is unheld. Alternative I would have this for free, since a record we own
can be rewritten in place. **This was recorded as the strongest argument alternative I had. It is no
longer the strongest and it is no longer an argument: the claim has moved, and this gap closes with it**
— see the restart section, where the concession this record used to make is withdrawn.

*What the measurement confirmed about alternative II's "for", which must be carried forward rather than
lost with the primitive.* Everything the primitive was chosen **for**, apart from the reclaim it turned
out not to perform, was measured and holds — and each item becomes a requirement on the replacement
rather than a benefit surrendered:

- **Claim latency is negligible.** `requestSingleInstanceLock()` returned in **3.3–7.1 ms**, and 65
  consecutive failed calls from one process cost 0.97–2.11 ms each. Our exclusive create must stay in
  that order; it is inside the launch-to-first-paint span.
- **A record left by a force-killed holder does not strand the product.** The claim became available
  within a **67–69 ms** window of `taskkill /F`, bracketed by a 62 ms poller, and a fresh launch
  reacquired it on the **first attempt at +187 ms**, with a window at +345/+373 ms. That 187 ms was
  dominated by process startup, not by the claim: Electron's own floor from spawn to the first line of
  `main.js` was 137–154 ms on the same machine.
- **The probe leaves the probed process unaffected.** 65 consecutive probes plus 4 discrete ones; primary
  alive, pid unchanged, its own 500 ms heartbeat uninterrupted, window intact, no signal.
- **A declared field is required, because `argv` really is mangled.** The `second-instance` payload
  carried `additionalData.workspace` verbatim and `workingDirectory` correctly, while `argv` arrived with
  **`--allow-file-access-from-files` appended and the application-path argument moved to the end.** This
  record predicted that from documentation; it is now measured. The prediction outlives the primitive:
  under alternative I the workspace directory is resolved by the launching process and sent as a declared
  field, and the receiving side never re-derives it from a command line.

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

**Alternative I for the claim, alternative B for the paint**, with these specifics.

*Alternative II was chosen here until 2026-09-02 and is refused on measurement, not on preference.* Every
sentence below that describes the claim was rewritten for that reason; the paint sequence, phase −1 and
the post-show pipeline are unchanged by it.

### Phase −1 — the launch preparation, on the `onefile` portable only

**Before an application process exists.** A `onefile` portable launch resolves its preparation
(`REQ-STARTUP-165`, ADR-0054) and executes the prepared payload; every other artifact skips this phase
entirely because it has no preparation to resolve. Three orderings are fixed here because they are
startup properties rather than packaging ones:

- **It precedes everything.** The instance claim, the preference-store scoping, the icon, the fonts and
  the theme all belong to the application process, and on this artifact that process does not exist
  until phase −1 has chosen which image to run. Nothing in phase 0 or later may be relied on here.
- **It is silent on four of its five outcomes, including the recovery path**, and a recovery is
  indistinguishable from a first run (`REQ-STARTUP-165` (c), `REQ-STARTUP-150`). Nothing in this record's
  notice or diagnostics machinery is available in phase −1 anyway, which makes that silence structural.
- **The fifth outcome is not silent, and the silence being structural is exactly why it needs a
  mechanism.** A run that could produce no preparation at all must raise a warning notice after the
  window is painted. Phase −1 cannot raise it — there is no notice surface, no window, and no application
  — so the outcome has to survive into a process that has all three. ADR-0054 carries it in the marker
  the stub writes into the tree it placed, deliberately not in an environment variable
  (`REQ-STARTUP-147`'s list is closed) and not in a launch argument (the product has none, and OQ-43 is
  already open on the one sentinel this record needs *(ruled 2026-10-06,
  [R-071](../../product/requests.md#r-071): the exception stated as built in `PD-STARTUP-002`)*). **What this record fixes is the consequence for
  ordering:** the application reads that marker relative to its own image during the pre-window phase,
  where it is one read of a file the fast path has already touched, and **holds the finding until after
  the show**. Reading it early and delivering it late is the only arrangement that satisfies both
  constraints — the value is only available from the launch chain, and the notice is only permitted after
  first paint. *(That marker is no longer small: ADR-0054's correction of 2026-09-02 makes it carry the
  completeness manifest as well, which is what stops a damaged preparation launching to no window. The
  read is still one file and still off first paint's critical arithmetic — the whole fast-path check
  measured at a few milliseconds against 5,000 — but the "shrink the marker" escape hatch both records
  once reserved is now closed, and consequence 11's chain is what would break first if anyone reopened
  it.)*
- **The instance claim cannot serialise it.** Two portable launches can race to prepare, because the
  claim they would be serialised by lives in a process neither has started yet. ADR-0054 resolves the
  race in the preparation itself; what this record records is that **SR-1 does not remove it**, and that
  the two launches converge on the ordinary hand-over once both have an application process.

**The budget, now measured on the mechanism rather than asserted from a baseline.** The run that prepares
is exempt from `REQ-STARTUP-155`'s 5 seconds; every later run of that artifact is bound by it exactly as
every other artifact is, and the release gate now checks both runs on the same machine
(`REQ-STARTUP-156`). So this record's own first-paint discipline is measured against the **steady-state**
portable launch, not against the preparing one — and that launch was measured at **575.5–624.2 ms warm
and 897.3–1,242.5 ms cold**, with the worst observation anywhere **1,414.6 ms**. Phase −1 itself costs
about **37 ms** of that on a warm cache, of which the whole fast-path check is well under a millisecond
and the manifest check ADR-0054 added is a few more.

**What that leaves this record is roughly 3.6–4.4 s, which is the same order of headroom the installed
flavour has — and that equality is the point.** Consequence 8's figure for the installed build was
0.6–1.6 s consumed and 3.4–4.4 s left; the portable running from its preparation consumes 0.58–1.41 s and
leaves 3.6–4.4 s. **The portable is no longer a special case and this record no longer has to sequence
against a worst artifact that fails.** The same two qualifications hold on both figures and neither is
softened by the new measurement: the measured application **contains no product at all** — no framework,
no store, no native module, no preload, no theming, and none of `REQ-STARTUP-040`'s icon, font
registration or theme restore — so everything this record sequences is *additional*; and the clock starts
at process creation from a parent rather than at a double-click, so both are lower bounds.

**The preparing run was priced rather than assumed, and it is comfortable at this bundle weight.** It
painted in **1,634.7–2,091.3 ms warm** and **3,798.8–3,909.8 ms when forced to a single thread** — inside
the bound it is exempt from, in both cases. That is a margin and not a dependency, but it scales with the
payload and with the core count, so it is the figure to re-take if the bundle grows materially.

### Phase 0 — the instance claim, before anything else

**The claim is the first thing a launch does, ahead of every step of `REQ-STARTUP-040`.** It runs
before `app.whenReady()` resolves, so a launch that is handed over performs no preference scoping, sets
no icon, registers no font, reads no theme, constructs no window and opens no connection. That is what
makes `REQ-STARTUP-162`'s "writes nothing to the preference store and nothing to any per-user or
per-workspace state" structural rather than a discipline to remember. **Moving the claim off the platform
primitive makes this easier rather than harder**: the primitive had to be called at module scope because
that is where it works, whereas an exclusive create and a listening socket depend on nothing the
application layer provides and can sit at the very top of the entry point without qualification.

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
anywhere, and that is OQ-43.** It is left open rather than closed by this record. *(OQ-43 ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the exception stated as built in `PD-STARTUP-002`.)*

- **The record is our own file, on every platform, and the platform primitive is not used at all.** It
  lives in the per-user data directory of `REQ-STARTUP-145`, which gives `REQ-STARTUP-161`'s observables
  directly: one per user account, outside every workspace so it never enters a project or its version
  control, not a key of the closed preference store (`REQ-SHELL-006`, `REQ-STARTUP-146`), and creatable,
  readable and removable without elevation. **This is the same idiom as the session lock and deliberately
  not the same store.** `REQ-SESSION-046` now holds the session lock as a record *in the store that holds
  the session it locks*, and under ESC-15 that store is machine-local and per workspace; an instance
  record must be outside every workspace and there is no per-user store to put it in. **The discipline is
  shared, the medium is not, and a reader who tries to unify them will land the instance record inside a
  workspace, which `REQ-STARTUP-161` forbids in terms.**
- **What the record carries, and why the file existing is not the exclusion.** `pid`, `host` and
  `acquired_at` under **the same three names and value types `REQ-SESSION-046` fixes**, so one probe and
  one parse serve both records, plus the address of the hand-over endpoint — which is `REQ-STARTUP-161`'s
  "how a launch reaches it" and is the only field the session lock has no analogue for. **The record must
  carry the liveness fact rather than rely on its own existence**, and that is a measured lesson, not a
  precaution: the platform primitive's record survived a `taskkill /F` and was still present afterwards,
  and it did not prevent the next launch from claiming, because the file was never what excluded anyone.
  Under alternative I an exclusive create makes the file's existence exclude by construction, so a
  force-killed holder would strand every later launch **for ever** unless the pid and host in it are what
  the next launch actually decides on. That is precisely the case `REQ-STARTUP-164`'s first sentence
  exists to forbid.
- **No handle is held open on the record.** The obvious implementation — hold an exclusive handle so the
  operating system releases it on process death — is refused twice over. `REQ-STARTUP-161` already
  anticipates the record outliving its process and says it is "settled by `REQ-STARTUP-164`", i.e. by the
  probe and the reclaim, not by an operating-system release. And a held handle would make the record
  un-replaceable by rename on Windows, which is exactly the operation the update-restart hand-over below
  depends on: the `windows-writer-handle-compaction` spike found that replace-by-rename fails with
  `EPERM`/`ERROR_ACCESS_DENIED` against **any** held handle and succeeds against an unheld path. **The
  record is deliberately unheld so that it can be rewritten in place.**
- **The claim, and the resolution, are `REQ-STARTUP-164` step for step.** (1) Atomic exclusive create;
  success makes this process the instance and startup continues at phase 1. (2) A create that fails means
  a record exists: read it, and connect to the endpoint it names to be handed over; the launch ends under
  `REQ-STARTUP-162` when the instance acknowledges. (3) **Not acknowledged within 5 seconds — for any of
  the four reasons the requirement enumerates, and they are not distinguished** — remove the record and
  retry the exclusive create **exactly once**. (4) A second failure means another launch claimed inside
  the interval: attempt the hand-over once more and end. **At most one reclaim, two create attempts, one
  interval, no spin**, so a record another party keeps recreating cannot make a launch loop.
- **The probe is the session lock's probe, with the ambiguous case resolved the other way — deliberately,
  and the requirement says so.** `REQ-SESSION-051` to `REQ-SESSION-054` are inherited whole, including
  the rule that matters most in practice: on Windows **the probe must deliver no signal and no console
  control event**, because implementing it as a null signal injects a real console interrupt into the
  target (`REQ-SESSION-053`). That is what buys `REQ-STARTUP-164`'s "probing SHALL have no effect on that
  process", which the measurement confirmed for the primitive across 69 probes and which is now ours to
  hold. What is **not** inherited is the direction: `REQ-SESSION-047` and `REQ-SESSION-056` resolve every
  ambiguity toward *live* because two writers would corrupt a session, and `REQ-STARTUP-164` states in its
  own text that it resolves the same ambiguity the opposite way, because an unreachable instance record
  resolved toward live leaves the user unable to start the application at all. **The two directions are
  both correct and a later reader must not harmonise them.** `REQ-SESSION-054`'s residual hazards — a
  recycled pid, and Windows reporting an exited process as alive while a handle to it survives — resolve
  toward live here too, and cost at most one 5-second hand-over wait followed by the single reclaim, which
  is what makes the inherited bias safe on this record rather than dangerous.
- **The hand-over endpoint is served by the instance's main process, and the acknowledgement means the
  window is on screen.** A named pipe on Windows, a unix-domain socket on macOS and Linux, its address in
  the record so a launch never has to guess it. **The acknowledgement is sent after the surfacing of
  `REQ-STARTUP-162` has actually happened, not on receipt**, and that ordering is the whole point: an
  acknowledgement from a process that then fails to surface anything would end the launch silently with
  nothing on screen, which is the exact observable the platform primitive produced and the one
  `REQ-STARTUP-164` closes with — "every path therefore ends with exactly one instance running and a
  window on screen". The one refinement is for an instance that is **still starting** and has no window
  yet: there the acknowledgement follows the request being bound to that startup, whose own 5-second
  paint bound (`REQ-STARTUP-155`) is what guarantees the window. **The property that is load-bearing in
  both cases is the same — an acknowledgement proves main's event loop is running**, which is precisely
  what the twenty-second failure did not.
- **The endpoint is listening before the record is written, not after.** The claim writes a record naming
  an address, and a second launch that reads that record and cannot connect is, by `REQ-STARTUP-164` (3),
  a process that "does not answer" — so it would wait its 5 seconds and reclaim a record a healthy
  starting instance holds. Creating the endpoint first closes that window by construction and costs
  nothing: **the record never names an address that is not already accepting.**
- **It follows that a main process running no JavaScript does not acknowledge, and that is correct.** The
  endpoint is served from main's event loop, so a main that is wedged, or blocked in a synchronous
  platform dialog, answers nothing; the 5 seconds elapse, the launch reclaims once and becomes the
  instance. `REQ-STARTUP-164` licenses exactly this — "reclaiming from a process that is running but
  unresponsive is the one path by which two processes of the application can briefly exist, and what makes
  it safe is that a session is protected by its own lock whichever process reaches it". **Under the
  platform primitive that same host state produced no window at all after twenty seconds. Under this
  design it produces a window inside the bound.** The endpoint must **not** be moved somewhere that
  survives a blocked main in order to keep answering: it would then acknowledge a hand-over the instance
  cannot act on, which is worse than not answering, and the measurement shows the only transport in the
  tree that survives a blocked main touches neither main nor any window.
- **The frequency of that reclaim is governed by a rule that lives in another record, and the two must be
  read together.** A synchronous platform-native dialog on main runs no JavaScript at all — not a timer,
  not an IPC handler, not a utility-process channel — for as long as it is on screen, and the product
  specifies native dialogs on ordinary paths. So the application-wide prohibition on synchronous
  platform-dialog calls that ADR-0019 needs for the approval liveness poll is **the same rule that keeps a
  user picking a project folder from causing an instance reclaim.** One host state, two records; neither
  is sufficient on its own.
- **Releasing is best-effort deletion of our own record on ordinary exit**, and a crash or force-quit
  simply leaves it, which is the case step (3) settles. There is no supported way to run two instances
  (`REQ-STARTUP-161`, `REQ-STARTUP-146`); the only path that ever rewrites a record this process holds is
  the update restart of `REQ-STARTUP-121`, decided below.
- **A launch that is handed over writes nothing, and that stays structural rather than becoming a
  discipline.** An exclusive create that fails writes nothing; the launch then connects, sends and exits
  without ever reaching `app.whenReady()`, so it performs no preference scoping, sets no icon, registers
  no font, reads no theme and constructs no window — which is what makes `REQ-STARTUP-162`'s "writes
  nothing to the preference store and nothing to any per-user or per-workspace state" true by
  construction. The only launch that writes is one that **reclaims**, and a launch that reclaims becomes
  the instance rather than being handed over. `REQ-STARTUP-164`'s "a launch SHALL write nothing but the
  record itself while resolving it" is therefore satisfied with the record as the sole exception it names.
  **Corrected 2026-10-13 (fin34's review): this no longer holds as written beside the order above, once the code keeps
  that order.** ~~"An exclusive create that fails writes nothing"~~ is true of the create; but the endpoint is opened
  first, so on Linux and macOS a launch that loses the create has already made a unix socket (and, on the fallback path,
  its private directory below the temporary directory), which it closes and unlinks before it hands over (`closeEndpoint`,
  `packages/platform/src/instance.ts`). On Windows the endpoint is a named pipe and nothing is written. Whether that
  transient socket is a write `REQ-STARTUP-164` forbids, and which of the two decisions gives way if it is, is
  [OQ-248](../open-questions/53-spikes-and-later-questions-20.md#oq-248).
  **Ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072), [OQ-248](../open-questions/53-spikes-and-later-questions-20.md#oq-248)):
  neither gives way, and the decision reads _a launch that is handed over leaves nothing behind_.** The record is the file and
  the endpoint it names, with whatever a claim attempt creates to hold that endpoint — "the record itself" of
  `REQ-STARTUP-164`, since `REQ-STARTUP-161` makes "how a launch reaches it" part of what the record is. A handed-over launch's
  exclusive create fails and writes nothing; the endpoint it opened first is closed and unlinked, and the private directory
  its attempt made below the temporary directory removed, before it exits (`closeEndpoint`). A reclaim removes the endpoint
  of a dead recorded process with its record. Built by fin36 (2026-10-13): below.
- **The workspace directory travels as a declared field over that endpoint, never as a command line.**
  The launch resolves the directory the operating system handed it (`REQ-STARTUP-024`,
  `REQ-STARTUP-041` (a)) on `REQ-STARTUP-163`'s same-directory terms and sends it as one named value with
  the launch's working directory beside it. The reason this record originally gave for not trusting a
  command line is now measured rather than cited: a command line delivered across the platform primitive
  arrived with a parameter appended and its ordering altered. Under our own endpoint the hazard does not
  arise at all, and the rule is kept anyway, because the receiving side re-deriving a directory from a
  command line is the mistake, not the transport.
- **The instance handles an arriving hand-over by resolving `REQ-STARTUP-163`, then `REQ-STARTUP-162`,
  and only then acknowledges:** if a main window already has that directory open, surface it and build
  nothing; if a directory was carried and no window has it open, build an additional main window on it,
  show it, surface it, and leave every other window untouched; if no directory was carried, surface the
  main window that most recently held keyboard focus, or the first built, and build nothing. If the
  instance has no window at all, build one, resolving its workspace as a launch does. Every window built
  this way goes through the ordinary post-show activation of `REQ-STARTUP-043` and the ordinary shared
  deferral of `REQ-SHELL-011`. **The window this path builds is bounded by the same 5 seconds**
  (`REQ-STARTUP-155`), and the handed-over launch is bounded by the hand-over interval rather than by a
  paint of its own — so the acknowledgement, which now waits for the surfacing, must not wait on that
  window's *post-show* work.
- **macOS is a different shape and still needs no special protocol; dropping the primitive does not drop
  the convention.** A second launch of the same bundle does not create a second process — the system
  activates the running one — so on that platform the claim path is rarely the one exercised, and our
  record simply stays claimed by the one process there is. The instance therefore also listens for
  `open-file`, which must be registered **before** `ready` or a launch-time file is missed, and for
  `activate`, whose `hasVisibleWindows: false` case is exactly `REQ-STARTUP-162`'s "holds the record but
  has no window open at all". Both converge on the same handler as an arriving hand-over, so the
  surfacing rule is written once. **This is a platform behaviour and was never a property of the
  primitive**, which is why moving the claim does not disturb it — and the record is still needed there,
  because a launch that does reach a second process must resolve against something.
- **On every platform the directory arrives in the launch's own arguments** and is read from
  `process.argv` in main before the claim, so it is available to resolve and to send as the declared
  field above.

### The update restart is a hand-over of the record — and with the claim moved, we have a verb for it

`REQ-STARTUP-121` is the one case in which this product starts the application while an instance is
running. It fixes the order — the updated installation is started first; the record passes to the
successor rather than being released; the current window closes only after the successor has started; the
successor keeps running once the current process has exited — and it fixes two negatives: the successor
**is not handed back** to the instance that started it and **does not surface** that instance's windows
(`REQ-STARTUP-162`, `REQ-STARTUP-164`). ADR-0005 and ADR-0032 both already depend on the brief overlap
this produces, so two live processes is a state the record has accepted; what nobody had written down is
how the record moves between them.

**The obvious sequence does not work, and it is worth seeing why before the one that does.** If the
predecessor holds the lock and starts the successor, the successor's own claim **fails** — and a failed
claim is, by phase 0 above, exactly a hand-over: the successor would notify the predecessor, surface its
window and end, which is the outcome `REQ-STARTUP-121` forbids by name. If instead the predecessor
releases first, there is a
window in which the record is unheld and an ordinary launch arriving in it becomes a third instance,
which the same sentence forbids. **Neither ordering is available, so the successor cannot be an ordinary
launch.**

**The decision: the successor is started on the sentinel branch that already exists, and the predecessor
rewrites the record in place rather than releasing it.** In order: the predecessor starts the successor
with the sentinel that marks it not-an-ordinary-launch; the successor performs no claim and no hand-over
attempt, opens its own hand-over endpoint, and signals the predecessor that it is ready; the predecessor
**replaces the record's contents with the successor's `pid`, `host` and endpoint address in one atomic
replacement**, and tells the successor the record is now its own; only then does the predecessor close its
window and exit. `REQ-STARTUP-121`'s failure branch covers every way this stalls — "when the successor
cannot be started, nothing SHALL close" — so a successor that never signals leaves the predecessor holding
the record with its window open and accepting input, which is both the requirement's outcome and the safe
one.

**The concession this record used to make here is withdrawn.** Under the platform primitive there was no
pass operation, so the sequence had to release and re-claim, and between those two calls the record was
genuinely unheld: a launch arriving in that gap became the instance while the successor then failed its
claim and was handed to it. This record called that "not conformant", bounded by two calls, and "the one
place `REQ-STARTUP-121` is met by argument rather than by construction". **With the claim moved to our own
record it is met by construction.** The record is never unheld, because a rewrite is not a release: the
file exists continuously and every launch arriving at any moment reads either the predecessor's fields or
the successor's, which is exactly `REQ-STARTUP-121`'s "handed to whichever of the two holds the record at
that moment". **This is a property the migration buys back, not merely relocates**, and it is the second
reason for it after the measurement.

**Two implementation rules keep that true rather than nearly true.** The replacement must be **atomic** —
write a sibling and rename over, never truncate-and-rewrite, because a reader that observes a
half-written record sees a record it cannot parse and `REQ-STARTUP-164` (3) would then have it reclaim a
record two live processes are relying on. And the rename-over is possible only because **nothing holds a
handle on the record**: the `windows-writer-handle-compaction` spike measured replace-by-rename failing
against any held handle and succeeding against an unheld path, which is why the no-handle rule in phase 0
is stated as load-bearing rather than as a preference. *(Note the contrast with the directory commit
ADR-0054 had to correct: renaming a **directory** onto an existing directory fails on Windows, renaming a
**file** onto an existing file does not. The two lessons are not interchangeable and neither should be
transplanted onto the other.)*

**Two orderings that follow and are easy to get wrong.** The successor is a new artifact version, so on
the portable **its first run is a preparing run** — the exempt one — and on the measured payload the
predecessor therefore holds its record and its window for **roughly 1.6–2.1 seconds, and up to about 3.9
seconds on a single core**. *(This record previously put that at 13–19 seconds, which was the cost of the
extraction mechanism SR-7 replaced and not of the one that shipped in its place; the wait is real and it
is seconds rather than tens of seconds.)* Nothing about that is a failure and nothing may time it out
into one — in particular the successor's readiness signal has no timeout of its own, and
`REQ-STARTUP-121`'s "when the successor cannot be started, nothing SHALL close" is what covers a
successor that never arrives. And the successor
must not be sent through phase 0's ordinary path at all, which means the sentinel branch is now load-
bearing for a third case; **OQ-43 covers two of the three and should be read as covering this one too.**
*(Ruled 2026-10-06, [R-071](../../product/requests.md#r-071): `PD-STARTUP-002` names all three, the update-restart successor among them.)*

**Amended 2026-09-28 (R-062) — the pass is two steps, because "tells the successor" is not "the successor was
told".** The sequence above has the predecessor rewrite the record and *then* tell the successor. Built that way
(`packages/platform/src/instance.ts`, `passRecord`), it assumed the successor was still there to be told. The successor
bounds its wait for the answer by the hand-over interval, as it must, since an unanswered successor may not become a
rival. If the predecessor's loop was blocked past that bound, the successor had closed and ended, but its announcement
was still buffered. The predecessor then read it, rewrote the record for a process that had gone, and closed its own
window. The record then named nobody running and no instance was left, which is what `REQ-STARTUP-121` and
`REQ-STARTUP-161` exist to prevent. A later launch reclaims the dead pid's record under `REQ-STARTUP-164` (3), but the
user who chose `Restart now` was left with nothing on screen. The note is
`../../defects/fixed/the-record-can-pass-to-a-successor-that-stopped-waiting.md`. The sequence is now: the predecessor
**offers** the record (`{"record":"offered"}`, deliberately not `ok:true`); the successor **acknowledges**
(`{"ack":true}`), which proves it is still waiting and commits it to take the record; the predecessor waits for that
acknowledgement **at most the hand-over interval, on the timer port**; and only then does it replace the record
atomically, answer `{"ok":true,"record":"passed"}` and close. A successor that closed before acknowledging, or whose
acknowledgement does not arrive within the interval, leaves the record exactly as it was. The restart fails through
`onRecordPassFailed` — `Update not installed`, nothing closes — which is `REQ-STARTUP-121`'s failure branch.
**One reading is stated rather than hidden:** once it has acknowledged, the successor waits for the last word with **no
bound of its own**. From that moment the record may name it, so a successor that gave up then would be exactly the
process the record must never be left naming. The predecessor's own bound, its answer, or its exit ends that wait. If
the connection ends with no last word, the successor reads the record: the pass happened if and only if the record names
it. A predecessor hung for ever between the acknowledgement and the rewrite leaves a windowless successor waiting on it.
That is the mirror of this section's accepted "successor that never signals", and it does not produce a second instance.
The ordinary hand-over of a second launch (`REQ-STARTUP-162`) is unchanged: one line in, `{"ok":true}` out. The
successor's readiness signal still has no timeout of its own; the new bound applies only to the acknowledgement, after
the predecessor has offered.

### Verification obligation on `REQ-STARTUP-164` — taken, 2026-09-02, and it fired

`REQ-STARTUP-164` fixes a 5 second hand-over wait, at most one reclaim, at most two claim attempts, no
spin, no side effect on the probed process, and nothing written but the record. This record made three
observations the condition of keeping the platform primitive, on all three platform keys of
`REQ-STARTUP-030`, and stated the consequence in advance: **"if any of the three does not hold,
alternative I is adopted for the claim and the platform primitive is dropped, not wrapped in a timeout."**
The measurement was taken on Windows. **Observation 2 does not hold. The rule has fired and the claim has
moved, on every platform.**

**Observation 1 — a record left by a process killed without cleanup must not make the application
unlaunchable. PASS.** After `taskkill /F` with no cleanup, the claim was reacquired on the **first
attempt at +187 ms** (2 runs, 4.8–5.0 ms for the call itself) and a window was on screen at
**+345 / +373 ms**. A separate poller calling every ~62 ms across the kill bracketed the release itself
to a **69 ms / 67 ms** window. Nothing close to `REQ-STARTUP-155`'s 5 seconds was consumed. *(The window
here is a harness's trivial one, not a product first paint.)*

**Observation 2 — a recorded process that is running but not answering must be resolved within the stated
interval, at most one reclaim, no spin. FAIL, on Windows, for a primary that is running but not pumping
messages.** Two runs, the second designed specifically to distinguish "delayed" from "dropped":

| | measured |
|---|---|
| `app.requestSingleInstanceLock()` in the second launch **blocked for** | **20,004.6 ms / 20,010.9 ms** |
| …and returned | **`false`** |
| reclaims performed | **none** |
| second claim attempts | **none** |
| windows shown by the second launch | **none** |
| primary's hand-over handler | not observed in run 1; in run 2 **never fired**, including the **25 s after the wedge ended** |

Run 2 exists to settle the "delayed or lost" question and settles it: the wedge ended, the primary went on
running normally for 25 further seconds, and **the hand-over never arrived. It was not queued behind the
block. It was dropped.**

Against the requirement, item by item: the 5-second bound was exceeded **fourfold**; "reclaim the record
and retry the exclusive claim exactly once" did not happen at all; and "every path therefore ends with
exactly one instance running and a window on screen" was violated — one instance was running and **no
window was on screen**. The user double-clicks the icon, waits twenty seconds, and gets nothing.

**And the failure is invisible by construction, which is what makes it the worst kind.** A `false` return
means "you have been handed over", and `REQ-STARTUP-162` requires a handed-over launch to be silent — no
window, no dialog, no banner, no error. The launch cannot tell a successful hand-over from a failed one,
and the requirement forbids it from reporting the difference even if it could.

**It cannot be rescued by wrapping, and that is now a measurement rather than an argument.** The call is
**synchronous on the launching process's own main thread** and takes no timeout argument; the two samples
differed by 6 ms, consistent with a fixed timeout inside the component. There is nothing to put a timeout
around without moving the claim off the launch's main thread entirely, which is not a smaller change than
owning the record.

**The other sub-case passed, and it is recorded so the failure is not overstated.** Where the primary was
blocked in a synchronous native dialog — running no JavaScript, but still pumping window messages — the
second launch's call returned `false` in **4.07 / 4.82 ms** and the primary's hand-over handler ran
**during** the dialog, while its own 500 ms timer was recording zero firings. So the primitive handles one
kind of "not answering" and drops the other. **One sub-case failing is enough by this record's own rule**,
which was written that way deliberately: a claim that is correct for some unresponsive primaries and
produces no window at all for others is not a claim whose reclaim rules we can state.

**And the sub-case that passed passed in a way this record would not have chosen.** The hand-over
callback executed **while the primary's own timers were dead** — the inference offered, and labelled as
one, is that the notification is dispatched by the nested message pump the dialog runs, not by the outer
loop. So the primitive can deliver a hand-over **into a process that is otherwise entirely stopped**, and
the handler then runs at an arbitrary point inside a nested loop rather than at a quiescent point of
main's own event loop. Under alternative I that cannot happen: our endpoint is serviced from the outer
loop, so an instance that is not running that loop simply does not answer and the specified reclaim
follows. **The failing sub-case is why the claim moved; this one is a second, quieter reason not to
regret it.**

**Observation 3 — the probe must leave the probed process unaffected. PASS.** 65 consecutive probes plus
4 discrete ones: primary alive, pid unchanged, its 500 ms heartbeat uninterrupted, window intact, no
signal, no state change beyond the specified event. This is the property phase 0 now inherits through
`REQ-SESSION-051` to `REQ-SESSION-054`.

**macOS and Linux were not measurable and the decision does not wait on them.** The measuring host runs
Windows 11 only; no macOS machine and no Linux environment was available, and neither behaviour can be
inferred from the Windows result — macOS is a different shape, and Chromium's Linux process singleton is
a filesystem construction with entirely different stale-record and reclaim rules from the Windows
hidden-window path that failed. **This record's rule already says the claim moves on every platform once
one fails**, for the reason it gave at the time — one record resolved two different ways is worse than
either — so two thirds of the platform coverage being absent does not block the *decision*. **It does
relocate the obligation rather than discharge it.** Alternative I's own stale-record protocol, endpoint
and hand-over must be verified on macOS and Linux, on macOS additionally composing with the convention
that a second launch produces no second process; and `REQ-STARTUP-152` makes this a release-checkable
claim per platform — "launching that entry point twice on one user account SHALL leave exactly one process
of the application running". That check is where the missing two thirds land.

**One measured fact about the record itself carries into the design and is easy to lose.** The
primitive's record file **survived a force-kill and was not itself the exclusion**: it was still present
after `taskkill /F` and did not prevent the next launch from claiming. Our record's existence *is* the
exclusion, so the same force-kill would strand every later launch unless the record carries the liveness
fact. That is why phase 0 puts `pid` and `host` in it and probes them, and it is the single most
important thing not to simplify away.

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
- **Two more things happen after the show, and neither is a member of `REQ-STARTUP-043`'s list.** That
  requirement names four activities and requires them not to precede the show; it is not a licence for
  anything else to precede it, and it is not an enumeration of everything a shown window may then do.
  Both additions are ordered here rather than left to fall where they may.
  - **The preparation-failure notice of `REQ-STARTUP-165` (c)**, where phase −1 found one. It is raised
    **once per run**, at warning severity, on the same surface `REQ-STARTUP-116`'s offer uses. It is
    placed **before the update check** in the order, for a reason that is about what the user reads
    rather than about cost: both can put a notice on that surface in the same second, and the one
    explaining why this launch took twenty seconds should not arrive underneath an unrelated update
    offer. It waits on nothing, since the finding was read before the window was built.
  - **Opening the workspace store**, which ADR-0058 places after the window is shown and which
    `PRAGMA quick_check` bounds. It must not move earlier: this record's first paint is rendered from
    stored preferences and constants only, and a store open on the critical path would put an unbounded
    disk operation inside the 5 seconds — the same discipline that keeps a workspace read, a
    version-control probe and a session load out of it.
- **A store that will not open is loud, and a native binding that will not load is the same failure with
  a different cause.** ESC-21 recorded `better-sqlite3` failing silently under an Electron runtime
  through an interface mismatch, with the error swallowed by a `try`/`catch`. Three rules follow, and
  they belong here because this is the record that decides what a failure during startup is allowed to
  do:
  - **Neither condition is caught and continued.** `REQ-SESSION-089` requires the run to refuse rather
    than degrade, conveying the session id, that nothing was started, which store could not be opened,
    and the reason the store itself gave. ESC-16 ruled that partial-failure mode out of existence; a
    swallowed load error would reintroduce it in the one shape nobody would notice.
  - **Neither is a first-paint failure.** The window is already shown, so a store that will not open is
    a workspace whose sessions are unavailable, not an application that will not start. That is the
    correct outcome and it is a deliberate consequence of putting the open after the show: the user gets
    a painted window and a stated reason instead of a launch that dies.
  - **The two causes are distinguished in what is reported, because their remedies differ.** A store
    that will not open has ADR-0058's recovery ladder behind it — salvage, export, move aside — and a
    binding that will not load has none of that: it is a defect in the build, identical for every
    workspace and every user of that build, and no user action changes it. Reporting the second as the
    first sends a user to salvage a store that is fine. **The real defence is upstream**: ADR-0056 rule 4
    requires the packaged tree to be proved to load before an artifact is accepted, precisely because
    `REQ-STARTUP-156`'s gate would not catch it — the gate observes first paint, and first paint does
    not open a store.
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
4. **A launch handed to an instance that is still starting waits on that instance's own paint, and the
   two 5-second bounds are the same 5 seconds.** The handed-over launch is bounded by the hand-over
   interval rather than by a paint of its own (`REQ-STARTUP-155`), and the instance it is waiting on is
   bounded by 5 seconds to paint. So a user who double-clicks the icon twice in quick succession waits
   the primary's own startup and is then surfaced — the correct behaviour rather than a defect to
   engineer around. **What changed on 2026-09-02 is what happens at the boundary**, and it is stated
   rather than smoothed: under the platform primitive the second launch returned immediately and could
   not tell a delivered hand-over from a dropped one; under our own record it waits for an acknowledgement
   and, where a primary near its own paint bound does not acknowledge inside the interval, it **reclaims
   and becomes the instance**. That is `REQ-STARTUP-164` (3) applied literally, it still ends with a
   window on screen, and its cost is a second process in the narrow case of a launch arriving against a
   primary that is both starting and slow. Two things bound it: the endpoint is listening before the
   record is written, so the failure cannot come from a connect that was merely early; and the same
   pre-window discipline that protects first paint is what keeps a primary away from its own bound.
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
8. **The budget this record is disciplined against is now a measured number, and it is no longer per
   flavour** — the portable's steady state was measured on 2026-09-02 and lands in the same band as the
   installed build (phase −1 above). The figures below are the installed flavour's and are unchanged.
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
10. **We own the claim, the endpoint and the stale-record protocol, on three platforms, on the critical
    path of every launch.** This is alternative I's stated cost and it is now real rather than avoided.
    Two things make it smaller than it reads. The probe is not new work: `REQ-SESSION-051` to
    `REQ-SESSION-054` already specify it for the session lock, and `REQ-STARTUP-164` names that lineage
    itself, so **a second probe implementation here would be a defect, not a cost**. And the constants
    the requirement fixes — the 5 s wait, the one reclaim, the two attempts — become ours to *test*,
    which is the property whose absence the measurement exposed. What is genuinely new is a cross-platform
    hand-over endpoint, and it is the piece with no Windows measurement behind it at all.
    *2026-10-21: measured on Windows (the claim over a named pipe, "The claim over a named pipe, measured" below): the order,
    the loser's close, a terminated holder's reclaim and the probe, in unit cases and in the built app.*
    **This consequence replaces the previous one**, which recorded that
    `app.releaseSingleInstanceLock()` — written here as "exists and is never called" — had acquired a
    single exception on the update-restart path. There is no such call now, the absolute-with-one-exception
    hazard it warned about is gone, and the update restart rewrites the record instead of releasing it.
11. **Startup now has an outcome it must carry across a process boundary it does not own.** The
    preparation-failure finding is produced by the launcher stub, read by the application before its
    window exists, and delivered after that window is painted. Three components have to agree about one
    small file for a warning to appear, and the failure mode of that chain is a **missing** warning: the
    artifact is permanently slow and nothing anywhere says why, which is the outcome
    `REQ-STARTUP-165` (c) exists to prevent. It needs a test that asserts the notice appears, not one
    that asserts the notice is silent on the other four paths.
12. **First paint is now provably independent of the store, and that independence is load-bearing rather
    than incidental.** It was already true — nothing on the critical path waits on a workspace read — but
    it now carries weight it did not: it is why a store that will not open is a stated reason rather than
    a dead launch, and it is also why `REQ-STARTUP-156`'s gate cannot see an unloadable native binding.
    The same property that makes the failure graceful makes the release gate blind to it. **Both halves
    have to be said together or the second gets lost.**
13. **Windows will not clamp a window to a display, and no construction-time figure bounds its
    viewport.** A content height of 20,000 CSS pixels was requested, granted and laid out on a machine
    whose tallest display is 1,080 px, and display enumeration at construction offered nothing that
    bounds it. This record's "the seven views are constructed — which ADR-0045 needs anyway for
    construction-time slot allocation" therefore rests on a **declared constant** rather than on
    anything the host tells us at startup, and a window driven past that constant degrades to a
    partly-blank pane rather than to a slow one. The constant and its growth branch belong to ADR-0045;
    what belongs here is that startup cannot supply a better figure and must not be written as though it
    could.
14. **A wedged main process now costs a second process rather than a dead launch, and that trade is
    deliberate.** Under the platform primitive, a primary that stopped pumping messages produced a
    20-second block and no window at all. Under this record's claim it produces a hand-over that goes
    unacknowledged, one reclaim, and a launch that becomes the instance — so the user gets a window, and
    two processes of the application exist until the wedged one is dealt with. `REQ-STARTUP-164`
    licenses this in terms and explains why it is safe: a session is protected by its own lock whichever
    process reaches it. **The residue is that the requirement says "briefly", and nothing here makes the
    reclaimed-from process stand down.** A primary that recovers still believes it is the instance. It
    must therefore re-read the record before acting as one, and where it finds a record naming another
    process it must stop behaving as the instance rather than compete — which is a rule this record
    states and which has no measurement behind it.
    *2026-10-21, measured on Windows: it does not hold. A primary suspended past the 5 s wait and then resumed answered the
    hand-over queued on its pipe and surfaced its window beside the instance that had reclaimed the record ([the note](../../defects/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md)).*
15. **The frequency of consequence 14 is governed by a rule in another record.** A synchronous
    platform-native dialog on main runs no main-process JavaScript at all for as long as it is open —
    measured across timers, renderer IPC and the utility-process channel alike — and the product
    specifies native dialogs on ordinary paths, including a project-folder chooser and a
    "quit while a run is active" guard. So **the application-wide prohibition on synchronous
    platform-dialog calls that ADR-0019 needs for the approval liveness poll is the same rule that keeps
    a folder chooser from causing an instance reclaim.** Neither record can enforce it alone and neither
    currently states it where the person writing a folder chooser would read it.
16. **The verification obligation is relocated, not discharged, and its hardest two thirds are still
    unmeasured.** Windows is measured; macOS and Linux are not, on either the primitive or the
    replacement, and the endpoint is the piece with the least evidence behind it anywhere.
    `REQ-STARTUP-152` makes this release-checkable per platform, and `REQ-STARTUP-156`'s gate is where a
    failure would be caught — but that gate observes a *single* launch to first paint, so **launching
    twice is the specific thing it must be made to do**, or the whole of SR-1 goes untested by it.
    *2026-10-21: the replacement is now measured on Windows as well (below); macOS and Linux still are not, and the release
    gate still launches once.*

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

## Discharged — the two clauses that fired, retired 2026-09-02

**The steady-state clause fired the good way.** It read: *"the portable's steady state is asserted to
resemble [the installed flavour] on the strength of a 0.7-second file-copy baseline, which is a baseline
and not a result."* It is now a result and the assertion held: 575.5–1,414.6 ms across every cached
measurement, 0.58–1.41 s consumed against the installed flavour's 0.6–1.6 s. None of the three bad
outcomes the clause was written for occurred. The prepared launch reached first paint with about 3.6–4.4 s
to spare, so the **font await** the clause named as the first thing this record would give up is not under
pressure and stays. The fast-path check is well under a millisecond of it, so consequence 11's marker
chain does not have to change — **and it must not, because ADR-0054 has since made that marker carry the
completeness manifest as well; shrinking it now would trade this record's warning chain and that record's
damage check for a saving the budget does not need.** Cache invalidation across an update was exercised
directly and worked: a second version prepared afresh while the first version's preparation stayed intact
and was still used, so the successor of the restart sequence runs the payload it was updated to.

**The verification clause fired the bad way, and this record wrote down in advance what to do.** It read:
*"Or the three observations under the verification obligation do not hold on some platform — in which case
the claim moves to alternative I on every platform, not only the one that failed, because one record
resolved two different ways is worse than either. Note that the hand-over gap named in the restart section
moves with it and is closed by that migration rather than merely relocated, so a failure there buys back
a property this record currently concedes."* **Observation 2 failed on Windows. Both halves were carried
out**: the claim moved on every platform, and the restart section's concession is withdrawn rather than
relocated. The clause is retired because it has been acted on, not because it stopped applying.

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

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10.*

**Built and run:** alternative I — our own record file, exclusive create, `pid`/`host`/`acquired_at`
plus a hand-over endpoint (named pipe on Windows), probed by the lock liveness predicate; at most one
reclaim and two claim attempts. `platform/src/instance.ts`, before `app.whenReady()`.

**Measured on the built application:** a second launch carrying a workspace directory was handed
over and **exited 0 in 327–328 ms**, with no window; the running instance logged the hand-over,
surfaced its window and opened the carried directory (REQ-STARTUP-162, -163). A force-killed instance
left its record behind and the next launch reclaimed it (probed pid dead) — as REQ-STARTUP-164 (3)
requires and as the primitive this record refused did not do.

**Found, in the harness rather than the mechanism:** the in-process test's third claim collided with
its own second endpoint (`EADDRINUSE`) because `close()` did not await the server's close and the
endpoint name was the pid alone. Fixed by making `close` awaitable and adding a nonce to the endpoint
name — which is also the right shape for a reclaimed pid, which must not inherit a dead process's name.
**Not exercised:** the 5-second hand-over interval against a primary that is running but not pumping
messages — the case that refused the primitive — because no wedge exists in the skeleton to inject.

## Corrected on the Overview's first execution — 2026-09-05: a view's start-time read arrives before the workspace is open

*The seventeenth first-execution defect (ADR-0058 c.17).* Main loads the window (`loadFile`) and only then opens the
argument workspace, so the renderer's startup view mounts and issues its first reads — the session list and
REQ-GIT-102's one refresh at start, which the requirement places "after the window has first been drawn" — while
`currentWorkspaceId` is still undefined, and both were refused with "open a workspace before …". The Overview
showed its empty state and never read the repository. The order is right (REQ-STARTUP-156's first paint comes first)
and the refusal was wrong: `session.list` and `repository.read` now **wait, bounded at 30 s, for the open in
flight** (`workspaceReady`, set by every `openWorkspace` call) before deciding there is no workspace. The falsified
reading — "a command that names the current workspace can be answered from the current state" — held for every
command a person sends, because a person cannot click before the open completes; a view that reads at mount can.

## Preceded by the reserved-token branch — 2026-09-06, Part T (ADR-0035's first execution)

Phase 0 is no longer the first thing main does. `main/sentinel.ts` is main's first import and, when the first argument
is `builtin:code-intelligence`, hands the process to the bundled runtime **synchronously** and exits with its status
before this file's phase 0 — the machine id, the data directory, the instance claim that reads `process.argv` — is
evaluated at all; a launch that carries the token never claims, never hands over, never writes. For every other launch
nothing changed: the module sees no token and phase 0 runs as recorded above. Measured on the development and the
packaged binary (`spikes/code-intelligence-branch.md`): no instance record touched, no window, the runtime's own exit
status. The one ordering hazard ADR-0035 named — anything that writes to standard output before the branch — turned
out to be Electron's own CR LF, not ours, and is tolerated by the transport rather than prevented here.

## The builder — first executed 2026-09-12, and consequence 6 is what it cost

Consequence 6 — "two entrances, one builder" — had never been executed, because there was one entrance and no
builder: the window was constructed inline in `main()`, and a launch-carried folder and a folder chosen from
inside the application could not have shared a construction path had the second existed.

`buildMainWindow({ workspace, origin })` is that builder. Two orderings turned out to be load-bearing, and
neither was visible on paper:

- **The renderer load must be the last thing the builder does.** Every listener the window needs — the relay
  attachment, the presenter registration, the close guard, `ready-to-show` — is attached before the load is
  awaited, or a renderer can paint and speak before the main process is listening for it.
- **The one call site must sit below `CHANNEL.command`'s handler.** A renderer's first act is a command, so a
  builder called where the construction used to be would race its own window's first message. The builder is
  therefore *declared* at that point and *called* two hundred lines further down.

Consequence 5's most-recently-focused ordering is executed here too, maintained on focus rather than on
creation, so a switch that briefly holds two windows still answers "which window" with the one the user is
looking at. The driver seam reads that ordering, which is how a proof addresses a second window at all.

**The builder found no defect.** The defects it exposed belonged to what it replaced and are recorded with the
registry at ADR-0048. The resolution precedence this record fixes (`REQ-SHELL-010`) is **not** executed yet: a
launch still either carries a folder or opens on the sentinel, and the remembered folder, the working directory
and the deferred 650 ms chooser are Stage B's.

## The resolution precedence and the deferred offer — first executed 2026-09-12

The paragraph above is now discharged and is kept as it was written: what it called Stage B's is built.
`REQ-SHELL-010`'s three-way precedence, `REQ-SHELL-011`'s one deferred offer and `REQ-SHELL-021`'s gated
replacement all run for the first time, and the title-bar chip is the gesture that reaches them.

**The sequencing this record fixes held.** Nothing in the precedence, the deferral or the post-show activation
order needed changing to be built. Three findings are worth the record, none of them a defect of this decision:

- **The 650 ms figure had no home in the code.** `REQ-SHELL-011` makes itself the product's single definition
  of the deferred first-paint delay and tells other documents to cite it rather than restate it. A search found
  no constant, so the interval is minted once, named for the requirement, and the machine-setup modal of
  `REQ-SHELL-013` and the initialization offer of `REQ-SHELL-016` have something to cite when they are built.
- **The one-shot flag is set when the flow starts, not when it succeeds.** `REQ-SHELL-011` forbids two folder
  choosers being on screen at once, so a chooser the user opened must abandon the deferred offer *before* it
  is known whether they chose anything. Setting the flag on success would have put a second chooser over the
  first for as long as someone browsed.
- **A remembered path that no longer exists is never rewritten, and the store never asks the filesystem.**
  `REQ-WORKSPACE-007` says so, and the reason survives the coerce in `PREFERENCE_KEYS`: a key that answered
  "no workspace" for a folder on an unmounted drive would lose a project silently, so the existence question
  is asked at resolution and nowhere else.

**Two obligations this record places on the resolution have nothing to stand on**, and are reported rather than
quietly skipped. `REQ-WORKSPACE-109`'s initialization-cancellation machinery does not exist in the codebase —
three literal occurrences, all of them in `docs/spec` — so `REQ-WORKSPACE-013` cannot be reported complete; and
no in-flight worktree integration is observable from main (`worktree.integrate`: no occurrences; `'integrating'`:
one, an unread member of `MERGE_STATUSES`), so `REQ-SHELL-021`'s second gate is written in its place in the fixed
order as an explicit no-op naming the state it would read. `REQ-STARTUP-166`'s workspace-storage determination,
which this record places on every path that opens a workspace, is likewise not built.

*Note on deepened structure (2026-09-12):* The builder, startup resolution, project-folder chooser, gates,
add/replace flows, hand-over routing, and per-window deferred offers were deepened into `MainWindows`
(`apps/desktop/src/main/main-windows.ts`). Consequence 6's two entrances and listener-before-load ordering are
guaranteed by the `MainWindows` lifecycle seam.

## Corrected 2026-10-07 (fin30): where the unix socket lives, and a claim that cannot listen

"A named pipe on Windows, a unix-domain socket on macOS and Linux" said nothing about where the socket is, and the code
answered with the data directory, or `XDG_RUNTIME_DIR` when one was set (2026-09-19, for the proofs). Two things this record
never priced followed from that. A unix socket's address holds 108 bytes on Linux and 104 on macOS, so a data directory below a
home of about sixty characters could not hold one: the listen failed with `EINVAL`, nothing awaited the rejection, and the launch
ended with no window and nothing said
(`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`). And a set-but-empty `XDG_RUNTIME_DIR` addressed the
socket relative to the working directory, so the record named an endpoint only a launch from that same directory could reach
(`docs/defects/fixed/an-empty-xdg-runtime-dir-puts-the-instance-socket-in-the-working-directory.md`).

Since fin30 the socket goes in the first of `socketDirectoryCandidates` (`packages/platform/src/instance.ts`) that is absolute,
leaves the whole path inside the platform's limit, and can hold a file: `XDG_RUNTIME_DIR`, the data directory beside the record,
then a private `rotaris-<uid>` directory (`0700`, owned by this user, refused otherwise) below the temporary directory and below
`/tmp` — the replacement directory the XDG Base Directory Specification tells an application without a runtime directory to fall
back to. *Since fin36 (2026-10-13, [OQ-248](../open-questions/53-spikes-and-later-questions-20.md#oq-248)) that private directory is made per claim attempt
(`mkdtemp`, `rotaris-XXXXXX`, `0700`) and removed with the socket; the shared `rotaris-<uid>` above, which another local user
could take first and which nothing removed, no longer governs.* The record still lives in the data directory, as `REQ-STARTUP-161` requires; only the address it names moves, and the
record's `endpoint` field is what every later launch reads, so nothing has to guess it. A claim whose listen still fails gives its
record back and is refused with the reason, which main logs at `error` before it exits 2 — `REQ-STARTUP-164`'s bounded end
rather than a launch left running with no window. No platform dialog is raised for it: ADR-0019's prohibition on a synchronous
native box in main stands.

~~**The order this record fixes is not yet what the code does.** "The endpoint is listening before the record is written" is the
rule above; `claimInstance` takes the record first and opens the endpoint after it, and fin30 kept that order, giving the record
back when the listen fails rather than reordering the claim. Recorded, not repaired:~~
~~`docs/defects/the-instance-record-is-written-before-its-endpoint-listens.md`.~~ <!-- historical-path: docs/defects/the-instance-record-is-written-before-its-endpoint-listens.md -->

**Since fin34 (2026-10-13) the code keeps the order this record fixes.** Each claim attempt opens its endpoint first
(`openEndpoint`) and only then takes the record by exclusive create naming it; an attempt that loses the record closes the
endpoint it opened (`closeEndpoint`), and a listen that fails writes no record at all, so there is nothing to give back. The
property is pinned where a second launch stands: `packages/platform/src/instance-order.test.ts` connects to the endpoint the
record names at the instant the record is written, and fails on the old order
(`docs/defects/fixed/the-instance-record-is-written-before-its-endpoint-listens.md`). The interval in which two launches could
both become the instance needed launches started within one `listen` of each other; it was read from the code, never
measured, and is closed by construction rather than by a measured bound. The order has a cost this record did not price: a launch that loses
the claim has opened, and then removes, an endpoint of its own, which on a platform whose endpoint is a file contradicts "a
launch that is handed over writes nothing" above (corrected there; [OQ-248](../open-questions/53-spikes-and-later-questions-20.md#oq-248), ruled 2026-10-13:
the endpoint is part of the record, and a handed-over launch leaves nothing behind).

**Since fin36 (2026-10-13), OQ-248's ruling as built.** `placeSocket` (`packages/platform/src/instance.ts`) makes each
attempt's private directory below a temporary-directory candidate with `mkdtempSync`, `socketDirectoryCandidates` sizes such a
candidate with the `rotaris-XXXXXX/` component, and `closeEndpoint` — which the instance's closer and the successor's now share
— removes the socket and that directory (`rmdirSync`, never recursive); `removeDeadEndpoint` unlinks, at a reclaim of a record
whose process is dead on this host, the socket that record names when it is a socket of this user's named
`instance-<pid>-<8 hex>.sock`, and its per-attempt directory once empty. Pinned by `instance.test.ts` (a name already taken
below the temporary directory no longer denies the fallback; the candidates' sizing; the reclaim's three cases) and
`instance-order.test.ts` (on the fallback, the handed-over launch leaves nothing and the closed instance takes its directory),
each red on the code before, and by `pnpm workspace-proof`'s scenario 13b.

## The unit suite on Windows 11 ARM64 — 2026-10-15: the claim's Windows spellings ran, the pipe's order cases did not

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, at `b9e30052` ([first-executions](../first-executions.md),
the row of that date; windows-arm64 only, OQ-400).* `instance.test.ts` passed 18 and skipped 6, every skip behind its
`posixHost` gate (the unix socket's directories and reclaim); the successor hand-over cases and the candidate list ran here.
`instance-order.test.ts` skipped all 3 (`it.skipIf(process.platform === 'win32')`), so the named pipe's claim, loser and
reclaim order has no unit case on Windows yet; the session's C6 adds the win32 counterparts and reports them here.

## The claim over a named pipe, measured — 2026-10-21 (the Windows ARM64 session's C6)

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, the built app at `51d85dd7`, tests at `c9ebc8cf`; [first-executions](../first-executions.md), the row of that date, citing the fin34 and fin36 rows of 2026-10-13.* `instance-order.test.ts` gained four `it.runIf(win32)` cases, each shown red against a deliberate break of its own property and green once restored (no case went red against another's break): **(a)** the pipe the record names accepts a connection at the instant the record is written, named `\\.\pipe\rotaris-<16 hex>-<pid>-<8 hex>` (red when the record was written before the listen); **(b)** a launch that loses the claim closes its own pipe, the directory holds only `instance.json`, and the instance's pipe goes when it closes (red with the loser's `closeEndpoint` removed); **(c)** a holder in a process of its own, ended with `TerminateProcess`, leaves no pipe, and the next claim takes the record (red with the reclaim's removal of the record taken out); **(d)** `probePid` reads `dead` after an exit and after a `TerminateProcess` while another process held the target's handle — Windows answered **ESRCH** both times, never EINVAL (red with ESRCH read as alive). No case calls `existsSync` on a pipe; they ask by connecting. Three runs of `instance.test.ts`, `instance-order.test.ts` and `platform.test.ts` before them: 57 passed, 11 skipped each time, every skip a POSIX socket case or a POSIX permission case.

In the built app, with a scratch `LOCALAPPDATA`, `APPDATA`, `USERPROFILE` and `ROTARIS_PREFERENCES_ROOT`: **(i)** a second launch exited 0 in 379 ms, and the profile's only change against an 8 s control interval was the instance's own log line for the hand-over; this run's pipes went 1 → 1 → 0 at the quit (one more rotaris pipe, another launch's on the host, was there throughout). **(ii)** After `taskkill /F /T`, three relaunches claimed at once — no hand-over wait, the dead record's process probed gone — and loaded their window 0.81–1.01 s after their claim; without `/T`, one of main's five children was still alive 0.5 s after main was gone (ended by the driver after). **(iii)** With the primary suspended, a second launch logged `instance claimed` 5,263 ms after it started — the 5 s wait and one reclaim — and the resumed primary then went on acting as the instance ([the note](../../defects/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md)); the second launch's CPU while it waited was not read (the sampler returned nothing). **(iv)** 100 connections to the instance's pipe and 10 handed-over launches (each exit 0, 343–872 ms) left the primary answering, its record unchanged. **(v)** `LOCALAPPDATA` set to `rel`, `\rel` and `C:rel` each put the data directory under `<USERPROFILE>\AppData\Local\rotaris\data`, and nothing under the launch's working directory or the drive's root.

`pnpm workspace-proof`: 50 passed, 0 failed, 5 skipped; scenario 13's hand-over checks passed (REQ-STARTUP-162/163, both workspaces), and 13b and 13c skipped as written for win32 (no socket directory, no XDG variable). Beside Spike 16's figures: its observation 1 (+187 ms to reacquire after `taskkill /F`, a window at +345/+373 ms, a harness's trivial one) is now a product launch claiming at once and loading its window under 1.1 s after the claim; its observation 2 (the platform primitive blocking 20.0 s and dropping the hand-over) is now this claim's 5.26 s and one reclaim. These are development-host figures on an ARM64 machine (OQ-400) and carry no REQ-STARTUP-156 gate weight.
