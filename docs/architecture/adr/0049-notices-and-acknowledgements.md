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
