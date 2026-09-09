# ADR-0049 — Notices, acknowledgements and the recovery surfaces

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-09)
- **Depends on:** ADR-0002, ADR-0043, ADR-0044, ADR-0048

## Context

`REQ-NOTIFY-011` to `REQ-NOTIFY-022`, `REQ-SHELL-112` and `REQ-SHELL-113`: **exactly one transient
acknowledgement surface** in the product — a stack of at most three, anchored to the bottom-right of the
**host window's content area** with fixed margins, drawn over all other content of that window, restored
relative to the window on move or resize. A lone acknowledgement is that stack holding one member.
Widths are fixed for the single and stacked cases, narrowed to host width less margins. Newest nearest
the corner, a fixed gap, **no reordering**. Lifetime is a fixed number of milliseconds; a non-positive
timeout means until removed.

`REQ-NOTIFY-023` to `REQ-NOTIFY-026`, `REQ-NOTIFY-033`, `REQ-NOTIFY-259` and `REQ-SHELL-114`: **exactly
one persistent notice at a time per application session**, rendered as an inline banner below the title
bar; the most recent publication is presented; **no queue, no restoration, no re-presentation**.
Publications are **totally ordered** — applied one at a time in acceptance order, each assigned its
identifier and its clearing rules applied before the next is accepted — with painting free to coalesce.

`REQ-NOTIFY-025` and `REQ-NOTIFY-027`: the store belongs to the **application process**, not to a
window; re-creating the main window neither resets the monotonic identifier sequence nor discards the
current notice, and identifiers are unique across every window of the process.

`REQ-NOTIFY-268` and `REQ-NOTIFY-262`: every warning or error notice is **recorded at publication** —
title, body and technical detail unchanged — into that session's timeline, or into application
diagnostics where no session applies, and **recording precedes rendering**, so a notice superseded within
the same turn of the loop is still recorded.

`REQ-NOTIFY-003`: channel choice is a **rule, not a preference** — a failure, a refusal, or an outcome
carrying a recovery action must **additionally** be published as a persistent notice; anything else may
be acknowledged transiently and reported nowhere else. `REQ-NOTIFY-178` calls out the failure mode this
prevents.

`REQ-NOTIFY-005`, `REQ-NOTIFY-037` and `REQ-NOTIFY-038`: an error reaches the user in two parts — a
plain-sentence headline naming what did not work, and a **separate, selectable, copyable** detail area.
A headline that is raw diagnostic output fails the requirement.

`REQ-NOTIFY-044` and `REQ-SHELL-115`: the notice **action vocabulary is closed**, and each action carries
its object's identity so the handler acts without a further lookup; **no action writes into the user's
project**; named views, settings categories and library tabs are drawn from the owning domain's
vocabulary, and an action naming a value outside it is not dispatched.

`REQ-NOTIFY-028`, `REQ-NOTIFY-029` and `REQ-NOTIFY-058`: an empty session id means "the focused run"; a
notice about another session survives an unrelated run start, **whatever order start and completion
events arrive in across threads**; a starting run clears only unscoped notices and notices for that same
session.

`REQ-NOTIFY-048` to `REQ-NOTIFY-050`, `REQ-CHAT-060`, `REQ-CHAT-086`, `REQ-NOTIFY-200` and
`REQ-SHELL-036`: the status vocabularies the interface renders are **closed and owned elsewhere**, and
the shell must **never render a raw backend or persisted status string** — nine normalised lifecycle
members with a total mapping arm for each of fourteen persisted values, four tool-row statuses, four
notice severities, four acknowledgement kinds, seven provider statuses with a fixed precedence, four
task display states.

## Alternatives considered

**A — Renderer-owned notice state.** Each window keeps its own slot; the process behind it forwards
publication events.

*For:* rendering is local; no boundary crossing to read the current notice.
*Against:* fails `REQ-NOTIFY-025` twice over. Identifiers must be unique across every window of the
process and monotonic across window re-creation, which a per-renderer counter cannot provide. And a
window re-created within one process must render whatever notice is **current**, which requires the
notice to have outlived the previous window. It also makes total ordering a distributed problem.

**B — A single notice store in main; renderers render a projection of it.** Chosen.

*For:* the process-ownership rule falls out. Total ordering becomes a **single-consumer queue in one
place**: accept, assign identifier, apply clearing rules, record if warning or error, then publish. The
scoping rules are evaluated once by the owner rather than N times by N windows with N views of which
session is focused. And "recording precedes rendering" is **enforceable because recording and rendering
are on opposite sides of a boundary and the recording side goes first**.
*Against:* a publication crosses the boundary before it is seen, adding latency to a surface that is
often the report of a failure. In practice this is one small message and is well inside the 100 ms
gesture budget.

## Decision

**Alternative B.**

- **One notice store per application process, in main** (ADR-0002), holding at most one current notice,
  with a monotonically increasing identifier never reset while the process lives. Clearing is a
  **compare-and-clear**: it removes the current notice only if the identifiers match, so dismissing a
  superseded notice leaves its successor standing.
- **Publication is a serialised queue, not a callback.** Several publications in one turn of the loop
  all get applied, the last one wins on screen, and painting may coalesce — the absence of an
  intermediate frame is explicitly allowed.
- **The record-then-render order is the queue's first step**, before the identifier is even handed back,
  so a notice superseded within the same turn is still recorded to the session timeline or to
  application diagnostics.
- **The acknowledgement stack is per window and is not the notice store.** Each window that raises one
  owns its own stack of at most three. Its lifetimes, widths, motion and glyphs are fixed figures and
  should be a **single shared component** consumed by the main, persona and terminal windows alike,
  since each is swept for accessibility independently.
- **The channel-choice rule is enforced at the call site by types, not by convention.** A failure, a
  refusal, or an outcome carrying a recovery action is published through a function that raises **both**
  surfaces; anything else goes through the acknowledgement-only function. Two different functions is
  what stops a refusal from being reported as a transient that disappears.
- **The action vocabulary is a closed discriminated union carrying its parameter**, and the dispatcher
  refuses an action naming a view, settings category or library tab outside the owning domain's
  vocabulary. Because those vocabularies belong to other domains, **they are imported rather than
  restated** — an action type that restated a category list would drift.
- **Status vocabularies are imported types, never string literals at a call site.** The fourteen-onto-
  nine normalisation is **one total function, written once, with a test per arm**, and no surface ever
  sees a raw persisted status.
- **The two motion figures and the reduced-motion rule are theme tokens read at animation start**
  (ADR-0050), never cached, so changing the setting while running takes effect.

## Consequences accepted

1. Notices cross a boundary. The recovery dialogs and the quota-wait surface stay in the renderer as
   ordinary components fed by the session snapshot — **only the notice is centralised, not every failure
   surface.**
2. **The temptation to let a component publish a notice directly must be resisted**, or the ordering
   guarantee is lost. A single entry point plus a lint rule is the cheapest enforcement.
3. `REQ-NOTIFY-006`, `REQ-NOTIFY-001` and `REQ-NOTIFY-010`'s empty-state obligations — every region
   holding zero items shows, in its accessible tree and as ordinary content, both a sentence naming why
   it is empty and at least one instruction or control that would fill it — are a **per-surface**
   obligation, not a notice-store one, and belong in each surface's own tests.

## Revisit if

A requirement appears for more than one notice on screen at once — the requirements board's
per-requirement standing banners are close to that and belong to the board rather than to the shell
banner slot; if that boundary moves, the single-slot store is what changes.

## First execution with a second publisher — 2026-09-03, the run host's notices

*Recorded under GD-10.* Until the hooks, main was the only source of a notice. ADR-0015 gives the run host
three (REQ-HOOKS-054's advisory, REQ-HOOKS-086's withheld notice, REQ-NOTIFY-223/224) and they arrive over
one `notice.publish` event that main alone turns into the current notice, with a key for REQ-NOTIFY-224's
once-per-pair rule and an action id main maps to the notice's recovery entry — consequence 2's single entry
point held. **Found:** the single slot loses one of them. In the built app the switched-off advisory
("Hooks need attention") was published at teardown and the run's own outcome notice ("The run completed")
followed a moment later and replaced it; the user saw the second. REQ-HOOKS-054 and REQ-SESSION-186 each
require their notice and the slot holds one. Not repaired here: the advisory is also a `hook_failure` issue
and an entry on the Hooks tab, so nothing is lost durably, and a queue or a second slot is a change to this
record's decision, which the requirements board's banners were already pressing on ("Revisit if"). Left as
the first concrete case for that revisit.

## Executed in full — 2026-09-06 (Part V), and the "Revisit if" answered

*Recorded under GD-10.* Everything this record decided is now built, and the entry above — the single slot losing the
hooks advisory to the run's outcome — is answered rather than repaired. **The answer is not a queue.**
`REQ-NOTIFY-024` states that single-slot replacement is canonical and that no notice is queued, restored or
re-presented; what makes a replaced notice retrievable is `REQ-NOTIFY-268`'s record, which had never been built. So the
missing mechanism was the record, not a second slot, and this part built it.

**What was built.** The store left `main/index.ts` for `main/notices.ts` and is now the whole of decision B: one
serialised chain, so several publications in one turn are applied in acceptance order and the last of the burst is what
stays on screen; **record-then-render**, so a `warning` or an `error` is written to the session's timeline before it is
broadcast and a notice superseded within the same turn is still recorded; compare-and-clear on dismissal; and the
run-start clear that spares a notice about another session. The two entry points of decision 5 are `report` and
`acknowledge`, and the type refuses the mistake the decision names: `acknowledge` takes no action and no severity, so a
failure or a refusal cannot be reported as a transient that disappears. The action vocabulary is a closed discriminated
union carrying each member's identity, and the renderer's dispatcher checks a view against `REQ-SHELL-023`'s ids and a
settings category against the Settings view's own list — imported from the domains that own them, never restated.

**The transient surface is one surface.** `packages/ui/src/Acknowledgements.tsx` is the single stack of
`REQ-NOTIFY-013`, mounted once per window (the main window and every persona window own their own, as decision 4 says).
The Git view's private fixed toast is gone: it was a second transient surface, which `REQ-SHELL-113` forbids, and it
had been in the built product since Part O without anyone reading the requirement that way.

**Measured by `pnpm notice-proof` in the built application.** The advisory burst reproduced with a global hook that
fails until it is switched off: the run's outcome and the advisory were published one millisecond apart, the slot held
exactly one of them, and the advisory was read back out of the session's timeline afterwards, actor `system`, its body
unchanged ("1 hook was switched off for the rest of this session after failing repeatedly…"). Scoping: an unscoped
notice went at a run start, one about another session survived it and went only when its own session started.
Compare-and-clear: dismissing the superseded identifier left its successor standing. The stack: 520 px alone, 360 px
when three, 8 px gaps, 16 px from the right and bottom of the window's own content area, three visible of four
published with the oldest gone and the newest nearest the corner, the kind words "Done / Warning / Failed" in the
accessible names, and nothing left after the 4200 ms of `REQ-NOTIFY-011`.

**Found — one defect, in this part's own wiring, and the proof is what found it.** Main's run-host branch built the
notice with an empty body, so the advisory's sentence — the entire content of that notice — was dropped between the
run host and both the screen and the record. The timeline entry was written with an empty message and an empty detail,
which satisfies "an entry exists" and fails `REQ-NOTIFY-268`'s "unchanged". No test caught it because the store's own
tests pass the body in directly; only the built application carried the field through five hops. The reading kept: a
record is not evidence until something reads what it contains.

**A reading, recorded because Part C's note says the opposite.** That note found the outcome replacing the advisory.
With the same burst the winner is now the advisory, because the outcome is accepted first and the advisory second, and
acceptance order is what the chain preserves. Neither is lost: the warning half is in the timeline, and the run's own
outcome is in the session record. This proof does not fix which of the two wins, because nothing in the requirements
does.

**An open question for the owner — RULED 2026-09-06 as ESC-33, the same day.** `REQ-MCP-044` gave its warning a UI
toast "with an 8-second auto-dismiss". `REQ-NOTIFY-011` fixes the transient lifetime at 4200 ms and states that no
surface declares a lifetime of its own. The build followed `REQ-NOTIFY-011` and routed that warning to the
acknowledgement channel; the 8 s figure was honoured nowhere. **The owner amended `REQ-MCP-044` to cite the lifetime
rather than restate it** — the copy was the defect, not the definition, and the durable half of that requirement's
two-channel delivery is its `mcp_config` issue record, which the amendment leaves untouched. **The build needed no
change under this ruling**; the ruling is `owner-decisions.md` ESC-33 and the amendment is recorded in
`../../spec/resolutions/16-mcp-integration.md`. The lever kept beside it: a warning that must outlive an
acknowledgement is a **persistent notice** under `REQ-NOTIFY-040`, never a longer transient.

**Not built, said so.** The application diagnostics of `REQ-NOTIFY-268`'s second branch are main's log line, because
the diagnostics store (`REQ-STARTUP-130` onward) does not exist; a warning with no session and no focused run is
therefore readable in the log and nowhere else. `REQ-SHELL-118`'s update-offer notice, updated in place with download
progress, is not built (there is no updater). Seven members of the action vocabulary parse and dispatch to nothing in
this build — the update, the restart, the cloud account, the project initialization, the retry, the proposal revert and
the settings save — each logged rather than silently ignored, and `open-library` has no target until the Library view
exists. Two members outside `REQ-NOTIFY-044`'s list were carried because two other requirements demand them
(`REQ-NOTIFY-224`'s hook review and `REQ-WORKSPACE-152`'s provider sign-in). **That gap was RULED 2026-09-06 as
ESC-34, the same day:** the owner added both members to `REQ-NOTIFY-044` on the precedent of its own resolution 12,
where this vocabulary was corrected to match a behavioural requirement rather than the other way round. **This ruling
did change the code:** `REQ-NOTIFY-044` requires an action concerning an object to carry that object's identity, and
the two members shipped here carried none — `open-hook-review` now names the workspace whose hooks it concerns
(`REQ-NOTIFY-224` publishes per workspace and hook set, so an unparameterised action reviews whichever workspace
happens to be open), and `open-provider-sign-in` names a provider where one is named. A review action naming a
workspace other than the open one opens nothing and is logged; navigating between workspaces from a notice is not
built. The ruling is `owner-decisions.md` ESC-34 and the amendment is recorded in
`../../spec/resolutions/19-notifications-errors-recovery.md`.

**The changed path was measured, and it found nothing (GD-10).** `pnpm notice-proof` gained a sixth launch, because
the identity main writes into the action and the identity the renderer checks it against are produced in two different
processes and no unit test spans them. A workspace declaring one hook raises `REQ-NOTIFY-224`'s notice; the notice
offers `Review hooks` carrying `data-action="open-hook-review"`; activating it opened `REQ-HOOKS-106`'s review for
that workspace and no other, one hook listed, and the renderer's mismatch branch was never taken. The two strings
agreed on the first run. Recorded because the finding is the absence: this change held no defect.

## Third execution — 2026-09-09 (Part AN), a persistent notice a renderer surface must raise

*Recorded under GD-10; the proof is `pnpm slash-proof`.*

**What was asked.** `REQ-CHAT-021`: any non-executed outcome of a slash submission raises a **persistent** notice
titled "Command not run" — not a transient toast — carrying the outcome's message. The composer is a renderer surface;
the outcome is decided in the renderer; nothing crosses to main.

**Defect fifty-seven — decision B has no entry for a renderer.** The record's two entry points, `report` and
`acknowledge`, are main's (`main/notices.ts`); the command surface carries `notice.acknowledge` and no `notice.report`,
and `ui-core`'s store is a projection of what main last published. A renderer therefore has no way to publish into the
one persistent slot, and the requirement's first surface to need one found the gap. The decision was written with
every persistent notice originating in main or the run host, which held until this part.

**What was built, stated as a stopgap.** The composer draws the notice itself, with the shell's own `NoticeBanner`,
above its field: one at a time, replaced by the next slash submission, dismissible, never on a timer — the design's
notice component on a second surface, which `REQ-SHELL-113`'s one-transient-surface rule does not reach because this
is not a transient, and which decision 4's one-persistent-slot rule is bent by, knowingly. `WorkspaceView` takes an
optional `slash.raiseNotice` and routes the notice there when the host passes one, so the stopgap is removed by
wiring, not by rewriting. **Owed:** a `notice.report` command (contracts and main — neither is this part's file) that
carries the renderer's title and message into `report` with `sessionId` empty for the focused run, so the notice
enters the record of `REQ-NOTIFY-268` and the single slot like every other; the renderer then passes `raiseNotice`
and the composer's banner goes.

**Measured.** Eleven non-executed submissions in the proof raised exactly one banner each — title, message, a Dismiss
control, the previous one gone — and an executed command raised none and cleared the last.
