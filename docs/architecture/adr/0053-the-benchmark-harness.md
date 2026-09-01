# ADR-0053 — The benchmark harness: how an iteration renders offscreen

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **The settle mechanism this record chose does not work and is replaced.**
  Offscreen rendering — the window choice — is confirmed and unchanged; the *signal* the phase timing
  closed on is withdrawn on measurement. This revision also settles how a phase is driven, which the
  record previously left implicit and which turns out to decide `REQ-UIBENCH-118` on its own.
- **Origin:** UI (ADR-UI-07)
- **Depends on:** ADR-0042, ADR-0045, ADR-0046, ADR-0052, ADR-0056
- **Evidence:** `../spikes/renderer-invariance-and-benchmark-cadence.md`

## Context

`REQ-STARTUP-002`, `REQ-STARTUP-015` and `REQ-UIBENCH-037`: exactly one shipped executable; the
iteration child is an **internal** child of the product, not a user-invocable surface, and it may not
define an argument vocabulary a user could type. How such a process is started is internal, no user or
external program can start one, and no argument grammar is fixed.

The corpus fixes **exactly one** reserved argument token, and it is not this one. `REQ-MCP-033` fixes
`builtin:code-intelligence`; `REQ-STARTUP-015` states that "no argument vocabulary beyond it is defined
for the shipped executable", the startup domain's own self-invocation flag having been withdrawn in
favour of that single sentinel (`docs/spec/resolutions/11-startup-distribution-updates.md`).
`REQ-UIBENCH-037` fixes **none** for the iteration child, and the resolution record for domain 21
(`docs/spec/resolutions/21-ui-performance-benchmark.md`, question 11) withdrew the requirement that used
to define one, adding that "a third party running one iteration directly is not a capability the product
offers". `REQ-UIBENCH-039` leaves the private overrides unnamed on the same ground.

`REQ-UIBENCH-035`, `REQ-UIBENCH-036`, `REQ-UIBENCH-041` and `REQ-UIBENCH-046`: the **parent** creates the
run directory, including missing parents, and fails outright — creating and modifying nothing inside it —
if it already exists; the frozen fixture and the crash marker and log are the parent's files; and a
completed run "leaves no file behind **outside its own output directory**". The child's whole write budget
is `<output>/iteration-NNN.jsonl` plus its own temporary settings directory, which is deleted with it.

`REQ-UIBENCH-112` and `REQ-UIBENCH-027`: every iteration renders the product interface **offscreen** —
no benchmark window ever appears on a display, takes focus, or moves, resizes or refocuses a user
window; no iteration prompts; the rest of the application stays usable. Entries are rebuilt "**through
the same rendering path the live application uses; the benchmark defines no rendering path of its
own**".

`REQ-UIBENCH-037` to `REQ-UIBENCH-039` and `REQ-UIBENCH-046`: every iteration runs in a **fresh child
process of the product's own program**, sequentially, with the invoking environment **stripped of every
variable the product reads** plus overrides forcing: no on-screen output, one platform-independent
widget style, display scale factor 1, a fixed locale, a configuration-home variable pointed at a
per-iteration temporary settings directory, and one benchmark-private variable naming that directory.
**The user's real stored settings hold the same bytes after the run as before.**

`REQ-UIBENCH-047`, `REQ-SHELL-008` and `REQ-SHELL-128`: fonts and theme come from the package, never the
host — the bundled families and the default built-in theme. **The host-font fallback the live
application is allowed must not apply here**: a bundled family that fails to load terminates the
iteration non-zero, counted as a crash.

`REQ-UIBENCH-049` and `REQ-UIBENCH-118`: responsiveness is measured by a probe scheduled **every 10 ms**;
the reported lag is the largest amount by which one probe ran later than scheduled over the interval
between the previous record and this one, never accumulated, with the whole measured part of the
iteration covered by **exactly one record's interval**.

`REQ-UIBENCH-051` and `REQ-UIBENCH-119`: each phase's timings cover its work **up to the point at which
the interface has finished showing that work's effect**, bounded at 30 s per settle with a timeout flag
recorded. `REQ-UIBENCH-058` and `REQ-UIBENCH-087` fix the memory sampling and the tail-phase growth
tripwire. `REQ-UIBENCH-018` to `REQ-UIBENCH-021`, `REQ-UIBENCH-043`, `REQ-UIBENCH-062` and
`REQ-UIBENCH-067` fix the fixture and report byte formats exactly, including canonical-JSON checksums
and a locale-independent decimal point.

`REQ-UIBENCH-110` to `REQ-UIBENCH-116`: the benchmark's own surface is a settings card, keyboard-
reachable, usable at the minimum window size, with progress, iteration count and a cancel control, and
report presentation meeting the 100 ms budget for a run of up to ten iterations.

**What the specification fixes about the settle, checked word by word before anything here was
changed.** `REQ-UIBENCH-051` fixes an **outcome**: both timings "cover the phase's work up to the point
at which the interface has finished showing that work's effect, or up to the bound of REQ-UIBENCH-119,
whichever comes first". `REQ-UIBENCH-119` fixes a **bound** — 30 s from submission — and the reporting
of `settle_timed_out`. Neither names a signal, an event, an API or a rendering mode. **The mechanism is
this record's to choose, and therefore this record's to change.** `REQ-UIBENCH-112` constrains the
*window* (offscreen, never on a display, never taking focus) and `REQ-UIBENCH-027` constrains the
*rendering path* ("the benchmark defines no rendering path of its own"); neither reaches the settle
either. So the swap below is inside the architecture's latitude and needs no requirement change.

**What the specification fixes about how a phase is driven, which is the other half of this revision.**
`REQ-UIBENCH-055` says the fixture is applied "in one pass". `REQ-UIBENCH-056` says every event is added
back "individually, in fixture order, one event per update rather than in bulk — **the same way events
arrive in the live application**". `REQ-UIBENCH-057` performs a full transcript assignment per prefix
step; `REQ-UIBENCH-058` re-applies the whole transcript after each of 1000 replacements and reads RSS at
11 of them, "each sample … read immediately after the replacement at its index has been applied **and
the interface has finished showing it**". `REQ-UIBENCH-118` then requires `event_loop_lag_ms` strictly
below 100 ms in **every** record and is, by `REQ-UIBENCH-099`, "the only absolute threshold the
benchmark applies to a measured value". Whether the driver hands those updates to the interface in one
synchronous burst or yields between them is not stated — and it decides `REQ-UIBENCH-118`.

## Alternatives considered

### For the window

**A — A window created but never shown.**

*For:* the simplest thing that never appears on a display; it is a real window with the real renderer,
so "the same rendering path the live application uses" is satisfied without argument.
*Against:* **the engine does not composite a window that has never been shown.** Frame callbacks do not
fire, so "the interface has finished showing that work's effect" has no signal to wait for, and the
phase timings would measure layout without paint. Disabling background throttling keeps timers running
but does not make an unshown window paint. **This alternative measures the wrong thing.**

**B — A window positioned outside every display's work area and shown inactive.**

*For:* it really composites, so paint timings are real.
*Against:* the requirement says no benchmark window shall **ever appear on a display**. A window at
negative coordinates is not on a display today and is on one the moment a monitor is rearranged, and
some window managers clamp it back into view. It also risks appearing in the task switcher and in
screenshots. **Too fragile for a requirement stated that absolutely.**

**C — The platform's offscreen rendering mode.** Confirmed against the current Electron documentation
(electronjs.org, latest, checked while producing the UI proposal): a window created with the offscreen
option renders into a bitmap and emits a paint event per frame on its web contents, with frame-rate,
start, stop, is-painting and invalidate controls, and the documented example pairs it with disabled
hardware acceleration. Chosen.

*For:* nothing appears on a display, nothing takes focus, nothing can be clamped into view. It works
identically on all three platforms. **Measurement confirms it is not slow and not throttled**: with
damage present it delivered 59.4 frames per second against 60 requested, and an offscreen run produced
element counts, operation counters and tail-growth figures identical to the onscreen runs.
*Against:* offscreen rendering uses a **different final compositing path** from an on-screen window. The
requirement says entries are rebuilt through the same rendering path the live application uses. The
*application's* rendering path — the document model, style, layout, the recycler of ADR-0045, the
Markdown cache — is identical; only the engine's final composite differs. **That is a defensible
reading, but it is a reading, and it should be recorded rather than glossed.**

*Withdrawn from C's case:* "it composites and **emits a paint event per frame, which is exactly the
'the interface has finished showing this' signal the phase timing needs, and it is a real signal rather
than a proxy**". That sentence chose the settle mechanism as a side effect of choosing the window, and
it is false in the case that matters. See the settle alternatives below. C survives as the window
choice; it does not survive as the settle choice, and this record should never have let one argument
carry both.

### For the settle signal

**S1 — The offscreen window's `paint` event.** *This record's original choice. Now refused on
measurement.*

*The argument it was chosen on, preserved:* the engine emits a paint event per frame on the web
contents, carrying the composited bitmap, so awaiting the next paint after submitting a phase's work is
a direct observation that a frame was produced — a real signal where every alternative is a proxy.

*What changed:* **the paint event fires where there is damage, and only there.** Measured over 5 s
windows: with a visible row changing every animation frame, 297 paints; with the renderer doing nothing
at all, **1**. That is correct engine behaviour and it is exactly what breaks a settle built on "wait
for the next paint", because several of `REQ-UIBENCH-053`'s phases legitimately change nothing inside
the viewport.

Driven through the seven phases offscreen at 1,200 rows, with the 30 s bound of `REQ-UIBENCH-119`:
**3 of 7 phase records carried `settle_timed_out` true** with the reader at the top of the transcript,
and 1 of 7 with the reader following the bottom. `tail_replacements_1000` ran **360,438.7 ms**, of which
360 s was expired bounds — the whole run took 426.6 s against 2.17 s for the same work with the
alternative below. Zero paints were observed across an entire 30 s wait, so this is not an arming race
that a tighter listener would fix. **Which phases fail depends on where the reader is scrolled**, not on
the phase, which makes the failure look intermittent to anyone who meets it without this measurement.

Two further findings make S1 worse than "it times out sometimes". First, `REQ-UIBENCH-119` states that
`settle_timed_out` is informational and **no invariant reads it**, so nothing in the report is false
when this happens — the phase simply reports a wall time that is 30 s of waiting. Second, a settle that
times out **destroys the memory sample taken beside it**: in the timed-out run the process sat idle for
five and a half minutes inside one phase, Windows trimmed its working set from 129.8 MB to 3.8 MB, and
`rss_second_half_growth_bytes` came out at **−109,273,088** — a value that satisfies
`REQ-UIBENCH-087`'s tripwire while measuring nothing about the transcript at all.

**S2 — `invalidate()`, then await the paint.** The obvious repair, since forcing a paint produces one in
every no-damage case. *Refused, and it is worse than S1.* Tested against pixels rather than argued: 40
trials of set-a-known-colour, change, flush layout, `invalidate()`, await paint, read the delivered
bitmap. **0 of 40 carried the committed frame; all 40 were exactly one frame stale**, returning in a p50
of 0.189 ms. The damage-driven paint was correct in 40 of 40. So S2 converts a settle that fails
honestly into one that returns instantly, reports work the interface has not shown, and writes
`settle_timed_out` **false** while doing it. A wrong number that marks itself is recoverable; a wrong
number that certifies itself is not.

**S3 — A renderer-side double `requestAnimationFrame` after the commit.** **Chosen.**

*For:* it completed **every phase in every offscreen run, with no timeout anywhere** — 2.6–30.9 ms per
settle, against 30 s bounds that S1 exhausted. The seven-phase run finished in 2.17 s and 5.97 s in the
two scroll variants, against 426.6 s and 41.5 s for the identical work under S1, and the widget counts,
operation counters and tail-growth figures it produced match the onscreen runs exactly.

*And the argument that is decisive rather than merely favourable:* **`paint` does not exist for an
onscreen window.** The identical probe against an ordinary window recorded **0 paint events in 57 s**
across ten armed waits, while its rAF settle resolved in 1.9–20.0 ms every time. ADR-0045 requires the
"finished showing" signal to be **a first-class part of the apply pipeline rather than benchmark-only
code**, because `REQ-UIBENCH-112` and `REQ-UIBENCH-027` forbid the benchmark having a rendering path of
its own. S1 could never have satisfied that: it is available only in the mode the benchmark runs in and
never in the mode the product ships in. S3 is the same signal in both. **The mechanism the record chose
for being "real rather than a proxy" was the one the live application could not use.**

*Against, and stated rather than glossed:* a double rAF **is** a proxy. It establishes that a frame
boundary passed after the change was committed, not that a frame containing the change was presented.
Where both signals resolve, nothing here establishes that they measure the same interval — the spike
says so explicitly and did not run that comparison. So this record trades a signal that is exact where
it works and absent where it does not, for one that is approximate everywhere and always present. Given
that `REQ-UIBENCH-099` makes every timing comparative, and that an absent signal costs 30 s of fiction
per phase, that is the right trade — but it is a trade.

### For driving a phase

**D1 — Apply a phase's updates in one synchronous burst.** The obvious implementation of the phase text,
and what this record left implicit. *Refused.* Measured maximum `event_loop_lag_ms` over a run:
**588, 591 and 582 ms** with the reader at the top and **2752, 2568 and 2547 ms** following the bottom,
against `REQ-UIBENCH-118`'s strictly-below-100 ms. `interface_lag_within_budget` is **false by a factor
of up to 27**, in every run, on a harness with no framework and no real product in it.

**D2 — Yield to the event loop after every update.** **Chosen.** Measured maximum lag **74.8 ms** and
**68.7 ms** in the two variants — true in both, with the largest remaining value being
`apply_fixture`'s single bulk assignment, which `REQ-UIBENCH-055` requires to be one pass and which
yielding cannot break up.

*Why this and not D1, beyond the number:* `REQ-UIBENCH-056` says the events are added back "the same way
events arrive in the live application", and in the live application they arrive on separate turns of the
event loop, one publication at a time (`REQ-MONITOR-214`, `REQ-MONITOR-218`). A synchronous burst
measures a shape the product never has, and it measures it in the one place the benchmark reports an
absolute rather than a comparative figure.

*Against:* yielding is not free and the cost is large. `ordered_appends` went from 363.8 ms to 6,318.2 ms
and `streaming_updates` from 593.0 ms to 15,693.9 ms, because each yield costs a clamped timer turn. The
widget counts and operation counters are unchanged. **One of `REQ-UIBENCH-118`'s boolean and the phase
wall times is going to look very different under either choice, and the two are not separately
tunable** — which is the honest statement of the conflict, and why this belongs in the record rather
than in an implementer's head.

## Decision

**Alternative C for the window, S3 for the settle, D2 for the driver**, with the offscreen-compositing
reading above written into the code and into the report.

- **The iteration child is the same executable behind a private argument sentinel, and that is this
  record's choice rather than the specification's.** The specification compels the *property* — not
  user-invocable, no fixed grammar (`REQ-UIBENCH-037`) — and leaves the mechanism open; it fixes one
  reserved token and that token is `builtin:code-intelligence` (`REQ-MCP-033`, `REQ-STARTUP-015`). A
  sentinel of the same shape as ADR-0035's is chosen because the entry point must already branch on one,
  and a second branch of that shape adds no new kind of surface. It must be undocumented, unadvertised,
  and must not appear in any user-facing surface.
- **The sentinel is obscurity, so the guarantee rests on the child being inert — and inertness has to be
  stated more tightly than "it writes where it was told".** No undocumented argument can deliver
  `REQ-UIBENCH-037`'s "no user or external program can start one": the token is recoverable from the
  shipped binary and from the parent's own process launches. What the child must not become is a **write
  primitive attributable to a signed product binary** — an invisible, trusted process creating a file at
  a path a caller chose, which is a capability worth having even where the caller already runs as the
  same user, because it launders the write through the product's identity and past
  application-allowlisting. The output location is therefore not free text. The child **refuses to start
  unless the directory it is given already exists** (`REQ-UIBENCH-035` has the parent create it), creates
  no directory and no parent, writes exactly one file inside it under `REQ-UIBENCH-037`'s fixed
  `iteration-NNN.jsonl` name — a name with no caller-supplied component, so no traversal — and writes
  nowhere else, which is `REQ-UIBENCH-046` restated as a rule the child enforces on itself rather than a
  property the parent hopes for. The file's content is the closed record schema of `REQ-UIBENCH-033` and
  the Data & Formats block, produced by the child from its own measurements. Under that rule the sentinel
  hands a caller nothing it did not already have: one fixed-named file of typed measurements in a
  directory it can already write to.
- **Environment handling is explicit, not inherited.** *Every* variable the product reads must be
  removed, and the list of variables the product reads is a **closed enumeration** (`REQ-STARTUP-147`),
  so the stripping is a computed set difference against that enumeration and **must be regenerated
  whenever the enumeration changes**. That coupling is a single shared constant.
- **Both redirection variables point at the per-iteration temporary directory, and the preference
  store's root resolution reads the private variable first** (ADR-0042), which is what makes the
  isolation guarantee hold on the two platforms where the standard variable means nothing.
- **Display scale factor 1** is forced on the child command line; the locale is forced as stated. "One
  platform-independent widget style" maps, for this interface, to: the bundled theme, a reset style
  sheet, and **no host-derived values** — no system font stack, no colour-scheme media query, no
  operating-system accent colour, and reduced motion resolved from the stored setting only.
- **Fonts are loaded and verified.** The iteration awaits each bundled family and **terminates non-zero
  if any fails**, which the parent records as a crash. This is one of the few places where iteration
  behaviour legitimately differs from live behaviour, and the specification says so.
- **The lag probe runs in the renderer**, because it is the interface's responsiveness being measured. It
  must be started before the first phase and stopped when the last phase's record is taken, so every
  instant falls inside exactly one record's interval, and **background throttling must be disabled on
  this window or the probe measures throttling**.
- **Phase timing closes on the paint-completion promise of ADR-0045**, bounded at 30 s with the timeout
  flag recorded (`REQ-UIBENCH-051`, `REQ-UIBENCH-119`). **That promise resolves on a renderer-side
  double `requestAnimationFrame` taken after the apply pipeline's commit has returned, in the live
  application and in an iteration alike.** It does not resolve on the offscreen `paint` event, it never
  calls `invalidate()`, and no benchmark-only branch exists in the promise — which is what keeps
  ADR-0045's "first-class part of the apply pipeline rather than benchmark-only code" true rather than
  aspirational. The 30 s bound stays, as the guard against a genuinely wedged interface rather than as a
  routine outcome; **a run in which any phase reaches it is now evidence of a defect and not of a
  scroll position.**
- **`settle_timed_out` true invalidates that phase's memory sample, and the report must be read that
  way.** `REQ-UIBENCH-119` makes the flag informational and `REQ-UIBENCH-087` reads
  `rss_second_half_growth_bytes` without consulting it, so a timed-out tail phase can satisfy the
  tripwire on a number produced by the operating system trimming an idle process's working set. Under
  S3 no phase is expected to reach the bound, so this is a residual hazard rather than a live one — but
  it is recorded, and it is raised against the specification rather than worked around here.
- **A phase's updates are submitted with a yield to the event loop between them**, one update per turn,
  except where a requirement fixes a single pass (`REQ-UIBENCH-055`). The yield is a real event-loop
  turn, not a microtask: a microtask drains before the loop is released and measures nothing. This is
  what makes `REQ-UIBENCH-118` true, and it is the shape `REQ-UIBENCH-056` describes.
- **The lag probe and the settle must not be confused for one another.** The probe of
  `REQ-UIBENCH-049` measures how late a 10 ms interval ran; the settle measures when a change was shown.
  Under D2 the probe is measuring an interface that is deliberately being given the loop back, which is
  the condition the 100 ms budget of `REQ-SHELL-150` describes; under D1 it was measuring a burst no
  product ever produces.
- **The iteration child's branch is taken before the single-instance claim.** ADR-0055 puts the instance
  claim of `REQ-STARTUP-164` ahead of everything else a launch does; an iteration is a fresh child of
  the same executable and would be handed over and killed by a naive claim, after which
  `REQ-UIBENCH-046`'s isolation guarantee would fail **silently, with the run still reporting numbers**.
  The sentinel branch is therefore evaluated in the entry point ahead of the claim, in the same place
  ADR-0035's branch is. `REQ-STARTUP-161`'s prohibition enumerates a configuration key, an environment
  variable, a preference and an interface control, and does not name a command-line argument — so the
  sentinel does not create the thing that requirement forbids. **That reading should be in the
  requirement rather than inferred here; it is OQ-43 and it is not closed by this record.**
- **Per-process figures are read for the process running the measured window's renderer.** In a
  multi-process engine "the process" is ambiguous; that choice must be documented, because the
  comparability claim is only between runs of one revision. See OQ-32.

## Consequences accepted

1. The benchmark measures an **offscreen composite rather than an on-screen one**, so its absolute
   timings are not the numbers a user's window would produce — which `REQ-UIBENCH-099` already
   anticipates by making every timing comparative.
2. Disabled hardware acceleration in the iteration child means **the benchmark never exercises the
   accelerated path**.
3. The private argument sentinel joins the code-intelligence sentinel of ADR-0035 as the second such
   branch in the entry point, and it is the **only one of the two that no requirement fixes**. Any
   summary of the reserved-token surface must say so: the corpus names one token (`REQ-MCP-033`) and
   deliberately names none for the iteration child (`REQ-UIBENCH-037`), so the second branch is an
   architecture liability this record owns and not a specification obligation. It must never be
   documented or user-reachable, and what makes its discovery uninteresting is the inertness rule in the
   decision, not the fact that it is undocumented.
4. **Phase wall times under D2 are much larger than under D1 and are not comparable across the change.**
   `ordered_appends` and `streaming_updates` grew by roughly seventeen and twenty-six times on the
   measuring harness, dominated by clamped timer turns rather than by rendering. `REQ-UIBENCH-099`
   already makes every timing comparative between runs of one revision, so this costs nothing the
   requirement relies on — but a reader holding numbers from a burst-driven build must be told that the
   two sets are of different quantities. The pair to watch together is `wall_ms` and
   `event_loop_lag_ms`: they move in opposite directions and only one of them has an absolute threshold.
5. **The settle is now a proxy, and the record says so rather than claiming otherwise.** Nothing
   establishes that a double-rAF settle and a paint settle measure the same interval where both resolve;
   the obvious comparison — run both signals side by side in the phases where the paint event does
   arrive, and difference them — was not made. It is cheap and it would either retire this consequence
   or size it.
6. **The benchmark is no longer the only consumer of the finished-showing signal.** Under S1 the settle
   was a mechanism only the benchmark could use; under S3 it is the apply pipeline's own promise, so a
   change to it changes live behaviour as well as measured behaviour. That is the property ADR-0045 and
   `REQ-UIBENCH-027` ask for, and it is also a coupling: the promise now has two callers with different
   failure appetites, and the live one must never be made to wait 30 s.

## Revisit if

The offscreen window proves unable to drive a full application shell at useful frame rates — in which
case the fallback is alternative B on a virtual display, which changes the deployment story for the
benchmark and would need a requirement conversation; or a double-rAF settle is shown to resolve before
the interface has shown a phase's effect, which is the failure S3 is theoretically exposed to and S1
was not, and would be caught by the side-by-side comparison in consequence 5; or a requirement is added
that fixes an invocation grammar for the iteration child, at which point the sentinel and the inertness
rule stop being this record's choices and become a stated contract with a compatibility surface.

**Discharged: the paint-cadence clause.** This record previously carried *"or its paint cadence turns out
not to correspond to layout settling — in which case the fallback is alternative B on a virtual
display"*. The paint cadence **does** turn out not to correspond to layout settling, and the fallback
that clause named is not the one taken: alternative B was not needed, because the failure is in the
signal rather than in the window, and the window is confirmed sound by the same measurement. The clause
is discharged by the settle replacement above rather than by alternative B.

## Open question

The configuration-home variable is named contractually and is meaningful on one platform only. The
reading taken here is that it is named because it is the one *standard* variable available and the
private variable carries the same job elsewhere. **If instead the intent is that the preference store
honour it on all three platforms, ADR-0042's resolution order should say so.** Either reading is
implementable; they are different. See OQ-33.
