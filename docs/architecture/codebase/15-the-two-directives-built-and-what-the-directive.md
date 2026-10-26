# The codebase — how the architecture is laid out in code — The two directives, built — and what the directive layer learned about itself (2026-09-12)

Part 15 of 22 of [the codebase record](../codebase.md), which indexes every part.

## The two directives, built — and what the directive layer learned about itself (2026-09-12)

`PD-SHELL-001` (a chosen folder may open in an *additional* main window, by a palette entry or the chip with the
platform's secondary-activation modifier) and `PD-WORKSPACE-001` (choosing the folder a window already has open
offers a new session) are built. `workspace.choose` carries a `newWindow` flag decided by the **gesture**, before
the chooser opens, because a native chooser carries no buttons of ours (`REQ-SHELL-164`) and the two routes differ
in exactly one way that matters: the add route evaluates none of `REQ-SHELL-021`'s gates and closes no window.
`REQ-STARTUP-163`'s rule — cited by both directives rather than restated — settles all three same-folder cases in
one place: the requesting window offers a session, another window is surfaced, nobody holding it means the route
decides.

**The eighty-ninth — a verification seam no harness could reach.** Stage B's project-folder seam read its answer
behind `capturing`, which is `ROTARIS_CAPTURE_PNG` — and that same variable arms the screenshot-and-exit path. A
proof that set the seam to answer the chooser would have had the app photograph itself and quit instead, so the
seam existed and was unreachable by the only harness that can drive the flow. It is gated on `__ROTARIS_SEAMS__`
now, exactly as the driver endpoint is, and it takes a `;;`-separated queue of answers, because one launch has to
answer the chooser differently several times over and a single value forces a relaunch per assertion — which is
how a proof ends up measuring a different process from the one whose behaviour it claims.

**What the directive layer learned about itself, one day after it was written.** Both directives were buildable
as *behaviour*. Neither named every requirement it had to govern. `PD-WORKSPACE-001` asks for a transient notice
carrying an action; `REQ-NOTIFY-013` is the product's single definition of that surface and its structure carries
none, and `REQ-NOTIFY-003` says an outcome carrying a recovery action is *additionally* published as a persistent
notice — which this offer deliberately is not. The directive named only `REQ-WORKSPACE-010` and `REQ-SHELL-021`.
Under the layer's own rule — a directive governs over the requirements it names, per identifier and never
wholesale — that is not a judgement call an implementer may make silently; building it as written would have been
an ungoverned deviation from two requirements. The dispositions now name both, with back-pointers at each, and
`REQ-NOTIFY-013` turned out to prescribe the remedy in its own closing sentence: *a surface that needs different
behaviour extends this requirement rather than adding a second acknowledgement surface beside it.*

One thing was deliberately **not** widened. `REQ-SHELL-115` fixes what a persistent banner action may do as a
closed list of thirteen operations, and starting a session is not among them. Rather than add a member — a product
statement no directive asked for — the transient's action is its own closed one-member type, and
`notices.test.ts` asserts that the banner union still refuses `start-session`. The cheap widening is the one a
later part would reach for, so the assertion is what keeps the list closed.

**`pnpm workspace-proof` — 24 passed, 0 failed, 2 skipped, and every defect it found was its own.** The flow is
measured against the built app: the working-directory fallback, `REQ-SHELL-011`'s deferral at 1002 ms against a
650 ms floor, `REQ-SHELL-012`'s exact reminder, a remembered folder reopened with no prompt, a vanished one
falling back **without** being overwritten, the chip's name, tooltip and description verbatim, a hostile folder
name rendered as text, the 1000×680 floor, Return activating the chip, `REQ-SHELL-017`'s build-before-close and
its preference written only afterwards, `REQ-SHELL-018`'s discarded replacement on a veto, `REQ-SHELL-019`'s
sentence with the old window still usable, and `PD-SHELL-001`'s two windows alive at once with no gate evaluated
and both answering for themselves.

Five defects, all in the harness, and **each one would have read as a product failure**:

- A folder literally named `<b>bold</b>` cannot exist on Windows, so rule 3's fixture killed the run before it
  measured anything. The entity form (`project-&lt;b&gt;-and-{x}`) is the better test anyway: if any surface ever
  rendered that label as markup, `&lt;b&gt;` would *display* as `<b>`.
- `d.command` resolves an already-parsed value while `d.eval` resolves a string. Parsing a command's answer
  failed at the first assertion with `"[object Object]" is not valid JSON`.
- `d.windows()` answers `{ windows, selected }`, not a list. Three window assertions compared `undefined`,
  printed `? window(s)` and reported FAIL about a product that had done exactly the right thing.
- `d.chord` sends `keyDown` and `keyUp` and **no `char` event**, which is what Chromium needs to perform a
  focused button's native activation; `type`'s Enter path sends all three. So "Return activates the chip" failed
  for want of a keystroke. Asserting through `type` keeps the activation the platform's, which is the whole
  reason the chip is a real `<button>` — the fix was to send the right key, never to weaken the claim.
- `session.start` **carries** its prompt and the schema refuses a start without one, so `{ kind: 'session.start' }`
  was answered `command.malformed` and the active-run gate went unexercised. This one is the most instructive:
  the harness reported it as a SKIP with an honest reason, and a skip reads as "the product cannot be asked
  this" when what was true is "the proof asked wrongly". Gate 3 is the only place `REQ-SHELL-021`'s exact
  sentence is checked, so it was repaired rather than left skipped, and the choose is now issued with no wait
  after the start — a sleep there would let a scripted run finish first and turn a real gate into a no-op that
  passes.

Two further lessons are in the file itself. A proof that dies mid-run reports *nothing* about the assertions
below the crash, which reads exactly like a shorter proof — so a harness error is now recorded as a failed check
rather than allowed to kill the process. And one app runs at a time: seven live Electron processes were competing
with a 650 ms measurement, and a finished launch's socket rejecting with nobody awaiting it took the run down
twice. The two remaining skips are stated rather than quietly passed, and both are properties of this build
rather than of the proof: gate 2 has no worktree-integration state to read *(built since 2026-10-15 over a reader that
answers none running, so the gate 3 check passes through it and the skip says so)*, and `REQ-STARTUP-043` has no
observable unshown interval on a route that shows its window in the same turn it builds it. Gate 3 is not among
them — it passes, with the requirement's own sentence and no chooser opened.

**Driven by hand two days later: the ninetieth defect.** The proof above was green on 26 checks when the surface
was put under `pnpm app:drive` on 2026-09-12. Four of the five rule-2 checks it carries now did not exist, and
the one that did could not fail.

**The ninetieth — the chip's elision budget could latch onto a wrong answer and stay there.** `WorkspaceChip`
computed what the chip spends on its own furniture as `button.offsetWidth - span.offsetWidth`, reasoning that the
difference between the chip and its label is the padding, the border, the gaps, the folder glyph and the session
tail. That holds only while the span is *shrunk to fit*. Take one measurement while the span still stands at its
full width inside a clamped button and the spend is **negative**: the budget comes out larger than the label
itself, every candidate "fits", and the label is left whole and drawn clipped — the one outcome
`REQ-WORKSPACE-149` rule 2 forbids. Nothing re-fires afterwards, because the slot's width has not changed, so the
wrong answer is stable for the life of the window. It appeared twice, intermittently — once across four widths in
the debugging session, once in the proof's own run — with green runs on either side of both. The budget is now the
slot's inner width less the chip's borders, padding, gaps and `flex: none` children, so no term in it depends on
the label; the gaps are counted from the fixed children rather than from the children present, because a budget
that grew by one gap the moment the label disappeared could show and hide it alternately at one slot width.

Two repairs sit beside it. `elideMiddle` now refuses a measurer that charges nothing for a label with characters,
and hides the label instead: `measurerFor` answers `() => 0` wherever a canvas 2D context or the computed font is
unavailable, and with that measurer every candidate fits — which, in a window that really was drawn, is a full
absolute path in a chip too small for it. The falsified reason is kept beside its replacement: zero was called
"the right answer where there is no width", which is true of a test renderer, where the available width is zero
as well and the clause above it has already answered. And `.title-bar__spacer` is deleted — the eighty-eighth
defect's repair removed its only use and left the rule standing.

**Four harness defects, three of which read as product failures.**

- The rule-2 check **could not fail**. It resized to `REQ-SHELL-022`'s own floor of 1000 px, where the centred
  slot is still some 760 px and every fixture path fits whole, and then let `narrow.label === wide.label` mean
  "zero ellipses is correct". It passed having measured nothing, and the latch lived behind it. The budget is
  squeezed directly now — `max-width` on the slot, which is what the layout itself varies — at widths no window
  on this platform can reach.
- **`pnpm app:drive` could not hand a seam to the app it drives.** `startApp` builds the child's environment from
  `cleanEnvironment()`, which deletes every `ROTARIS_*` name so a proof measures the product rather than the shell
  it was started from. An exported `ROTARIS_CAPTURE_PROJECT_FOLDER` therefore never arrived: the chip's click
  opened the **real** native chooser, nothing appeared in the document, and that read as a control wired to
  nothing — a diagnosis stated twice before the log was read properly. `--env=KEY=VALUE` hands one over
  explicitly, and the reply names which seams were armed.
- **No check had ever exercised the chip's own click.** Every other assertion drives `workspace.choose` through
  the driver's command op, so an unwired handler — or a missing `onChooseWorkspace` prop, which leaves
  `onChoose?.()` a silent no-op — would have passed all of them. The pointer route is asserted now, beside the
  Return route that was already there.
- The counterfactual **failed to fail**. Pinning the span with `width: 444px` changes only the flex base size, and
  a span with `flex-shrink: 1` and the stylesheet's `min-width: 0` shrank straight past it to 198 px: the forced
  state never existed and the check reported PASS against the very arithmetic it was written to catch. Pinned with
  `flex-shrink: 0` and a real `min-width` it fails before the repair and passes after, with the span still
  unshrunk at 444 px — which is the repair itself, rather than a number that moved.

The proof is **29 passed, 0 failed, 2 skipped**, the two skips being the same properties of this build as before.
Every squeeze step is read twice and reports whether the two readings agreed: a label read after the observer has
delivered but before React has committed is the frame *before* the change, and one reading cannot tell that apart
from a label that never moves at all.
