# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Consequences accepted

Part 5 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

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
    hand-over queued on its pipe and surfaced its window beside the instance that had reclaimed the record ([the note](../../../defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md)).*
    *2026-10-31, built, not yet re-measured on Windows: the endpoint reads the record again as each ordinary hand-over
    arrives. Where the record does not name this process at this endpoint, it acts on nothing, surfaces nothing and answers
    not-acknowledged (`onHandOverDeclined`; main logs `hand-over declined`). The rule alone was not enough, and that is the
    part of this consequence the repair corrects. A launch that read the record while it named the primary, and got that
    decline, reclaimed by removing whatever record stood there, which was the new holder's, and became a second instance;
    clause (4)'s second hand-over had never been built. The reclaim now leaves only a record naming another live claim, and (4)
    hands such a launch to the process the record names (`instance.test.ts`, "a process the record was reclaimed from stands
    down"). What the stood-down process does with its open windows is not stated here or in the specification
    ([the note](../../../defects/a-stood-down-primary-keeps-its-windows-and-runs-on-with-no-end-the-specification-states.md)).*
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
