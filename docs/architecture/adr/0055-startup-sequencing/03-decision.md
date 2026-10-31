# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Decision

Part 3 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

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
  [R-071](../../../product/requests.md#r-071): the exception stated as built in `PD-STARTUP-002`)*). **What this record fixes is the consequence for
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
anywhere, and that is OQ-43.** It is left open rather than closed by this record. *(OQ-43 ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the exception stated as built in `PD-STARTUP-002`.)*

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
  *2026-10-31: (4) was built only on this date. Until then a lost retry ended `refused`. And (3)'s removal now reads the
  record first: it removes any record but one that names another LIVE claim, which is (4)'s case (consequence 14's note
  of that date). A record that cannot be read, the claim it failed to reach, or another claim whose process has ended is
  reclaimed as before; for one commit that day the removal also left a dead claim's record, and the launch ended
  `refused` with no window (the fixed note records it). (4)'s hand-over is bounded by the same interval as (2)'s, so a
  launch whose first hand-over went unanswered and whose second does too can wait two intervals. Whether "one interval"
  admits that is not ruled here.*
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
  [OQ-248](../../open-questions/53-spikes-and-later-questions-20.md#oq-248).
  **Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072), [OQ-248](../../open-questions/53-spikes-and-later-questions-20.md#oq-248)):
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
