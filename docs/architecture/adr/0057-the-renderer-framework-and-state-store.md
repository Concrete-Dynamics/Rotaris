# ADR-0057 — The renderer framework and the renderer state store

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-01, ADR-UI-03, ADR-UI-04 — used throughout, recorded as a decision nowhere)
- **Depends on:** ADR-0001, ADR-0002, ADR-0043, ADR-0045, ADR-0046
- **Depended on by:** ADR-0056, which builds it. The dependency runs backwards against the record's
  numbering rule because this decision was found missing after the others were numbered.
- **Narrows ADR-0043.**

## Context

ADR-0043 records that the renderer's replica may live in "any store with equality-checked selectors" and
that nothing in the specification requires a particular one. ADR-0045 and ADR-0046 are then written
against a particular kind of renderer: ADR-0045's central rule is that the slot index must be the
**framework key** and never the row identity, or the framework unmounts and remounts; ADR-0046 rejects
its own alternative A on the ground that "a framework's scheduling is not something to hang a
determinism claim on". Neither sentence means anything until something is named. The choice is not free,
it is unrecorded, and neither of those two records can be implemented without it.

The specification declines to make the choice, deliberately. `REQ-UIBENCH-050` defines both structural
counts "against the interface framework the product is built on" and states their absolute values are
"deliberately not comparable between product revisions or between implementations". Domain 21's
resolution 13 renamed the broader counter to the framework-neutral `ui_objects` precisely so the record
schema would not carry one toolkit's vocabulary, and resolution 29 restated both counting rules in
framework-neutral terms. Where the specification is silent by design, the architecture is where the
answer belongs.

What the choice has to satisfy:

- **`REQ-UIBENCH-054`, `REQ-UIBENCH-085`.** `widgets` must not change from the construction record to
  the end of the iteration. ADR-0045 gets the outer stability from a fixed slot pool, which is
  renderer-independent — but only while rebinding a slot to a different row does not tear the slot down
  and rebuild it. That is a property of the reconciler's identity rules, and it must be one we can
  state and test, not one we hope for.
- **`REQ-UIBENCH-064`, `REQ-UIBENCH-083`.** Six cumulative counters, byte-identical across fresh
  processes replaying one fixture. ADR-0046 puts the classification in a pure synchronous stage
  **upstream** of the renderer, so the framework must accept a fully formed view model rather than
  insist on deriving one, and its scheduler must be outside the determinism claim.
- **`REQ-UIBENCH-051`, `REQ-UIBENCH-119`.** A phase's `wall_ms` and `cpu_ms` run to the point at which
  "the interface has finished showing" that phase's effect, bounded at 30 s. The framework must offer a
  way to force a commit and observe that it happened, rather than leaving the moment to a scheduler.
  ADR-0045 makes that signal a first-class part of the apply pipeline, not benchmark-only code.
- **`REQ-MONITOR-217`.** The whole-session update carries **every field any surface can display**, and
  the failure it names is observable: a surface showing a value the persisted record has already moved
  past. The store must apply that payload as a **replacement of the run-derived state**, because a
  shallow merge is exactly the mechanism by which a field the new payload no longer carries survives on
  screen.
- **`REQ-MONITOR-223`, `REQ-SHELL-151`.** A session with nothing happening does no work at all; a
  surface that is off screen performs zero repaints and runs zero timers. This rules out polling, and
  it rules out a subscription mechanism whose repaint fan-out is a function of component-tree shape
  rather than of what changed.
- **`REQ-MONITOR-225`.** Displayed state never moves backwards and controls stay operable during a read.
  Two writers into one replica, read by many selectors, is where a torn read would show up.

**What was checked.** Context7 and the npm registry, 2026-08-31. React 19.2.8 and Zustand 5.0.15 are the
current releases, both MIT. React's documented reconciliation rule is that a `key` is treated as
"part of the position": the same key in the same position preserves the element and its state, and a
changed key destroys the subtree and recreates it — which is the rule ADR-0045's recycler depends on,
stated by the framework rather than inferred from it. `flushSync` from `react-dom` forces a synchronous
commit. `useSyncExternalStore` is React's own tear-free subscription to a store it does not own, and is
what Zustand's React binding is built on. Zustand's vanilla core (`zustand/vanilla`) runs with no React
present; `setState(next, true)` **replaces** rather than merges; `subscribeWithSelector` gives
equality-checked subscriptions outside React and `useShallow` inside it. Those six facts are what the
decision rests on.

## Alternatives considered — what reconciles

**A — React over the document model.** Chosen.

*For:* the two rules the interface records already state are React's own documented rules, so they
become checkable rather than folkloric: the key-as-position rule is what makes "the slot index is the
key" a correct instruction rather than a superstition, and `flushSync` is what makes ADR-0045's
paint-completion promise a mechanism rather than a hope. `useSyncExternalStore` is a first-class seam
for a replica the framework does not own, which is precisely ADR-0043's shape. The surfaces outside the
transcript — seven views, dialogs, the settings tree, the board, the composer — are ordinary component
work, so the recycler stays the exception it is described as. It is also the framework with the deepest
accessible-component and focus-management ecosystem, and ADR-0045 refused the canvas alternative
specifically to keep accessibility native.

*Against:* the concurrent renderer may interrupt, re-order and batch work by default, which is the wrong
default in a product with a hard "finished showing" signal and a 30 s settle bound. That is a standing
discipline, not a one-off fix. React's internal objects also inflate `ui_objects` for reasons unrelated
to the product — harmless, because no invariant reads it (`REQ-UIBENCH-050`), but one more reason that
counter must never be given meaning. And `react` plus `react-dom` is a fixed bundle cost inside
`REQ-STARTUP-155`'s five seconds to first paint.

**B — A fine-grained reactive renderer with no virtual DOM** (Solid or a signals-based equivalent).

*For:* it updates exactly the nodes bound to a changed value, so "cost proportional to what changed"
(`REQ-CHAT-055`, `REQ-MONITOR-223`) is closer to being structural than earned; there is no diff, so
there is no diff-driven mount and unmount to defend against at all; the runtime is smaller, which helps
the first-paint budget.

*Against:* the advantage is largely spent before it is collected. ADR-0045's fixed pool already removes
diff-driven element churn, so the property we are buying we already have, and what remains is the
content-count problem inside a slot, which no reactivity model solves. Worse, the model pulls in the
wrong direction on ADR-0046: fine-grained reactivity invites derived state to be computed in the render
layer, and `REQ-MONITOR-224` requires that a view "never render a result that differs from what a whole
read would have produced" — the apply stage has to be a pure function outside the renderer, testable
with no renderer present, and a framework whose store *is* its reactivity graph makes that separation a
convention rather than a boundary. The accessible-component ecosystem is also materially thinner for the
surfaces of ADR-0048 and ADR-0050.

**C — No framework; the application owns the DOM directly.**

*For:* the element-count invariant becomes trivially auditable, because every node is one we allocated;
nothing sits between ADR-0046's apply stage and the screen; the smallest possible bundle; no scheduler
to defeat.

*Against:* the transcript is not the product. Seven views, a navigation rail, three modality levels
(ADR-0048), notices and an acknowledgement stack (ADR-0049), a settings surface, a board, a terminal
grid and a composer all carry keyboard-navigation, focus-order, accessible-name and accessible-
description obligations. Writing that by hand is a second and larger version of the problem ADR-0045
already took on once, and it makes the recycler's un-idiomatic discipline the *normal* case rather than a
documented exception — every contributor pays the transcript's constraint on every screen. ADR-0045
accepted owning one virtualiser; owning the whole interface layer is a different bargain.

## Alternatives considered — where the replica lives

**D — Zustand.** Chosen.

*For:* it is a plain external store, not a framework feature, so ADR-0046's apply stage can be written
and tested against `zustand/vanilla` with no renderer in the process — which is what makes
`REQ-UIBENCH-083`'s cross-process identity a property of a function rather than of an environment. Its
`setState(next, true)` replaces rather than merges, which is `REQ-MONITOR-217`'s whole-session payload
expressed directly instead of by convention. Selector subscriptions take an explicit equality function,
and the React binding goes through `useSyncExternalStore`, so a replica with two writers cannot be read
torn.

*Against:* the *default* write path merges shallowly, so the replace flag is a rule that must be enforced
by the store's own surface rather than remembered. And the default selector equality is identity, so a
composite selector that allocates a new object per call repaints on every publication — the failure mode
being a violation of `REQ-MONITOR-223`'s idle rule that looks like a performance problem rather than a
correctness one.

**E — Redux Toolkit.** *For:* a single reducer entry point makes ADR-0043's "exactly two writers"
structural rather than disciplined, and its time-travel tooling is genuinely useful against the replica
drift ADR-0043 accepts as possible. *Against:* it brings an action layer, a middleware chain and an
immutable-update layer for a store whose entire write surface is two functions that already receive a
fully formed view model from ADR-0046. Its normalisation and reducer composition solve a problem this
replica does not have, and selector memoisation is a further dependency.

**F — React's own context plus `useReducer`.** *For:* no dependency at all. *Against:* a context value
change re-renders every consumer beneath the provider, so which surfaces repaint becomes a function of
tree shape rather than of what changed — the wrong shape for `REQ-SHELL-151` and `REQ-MONITOR-223`. And
there is no store readable from outside the component tree, so ADR-0046's stage would have to live
inside it, which that record forbids.

## Decision

**React 19.x (`react`, `react-dom`, MIT) over the document model, with Zustand 5.x (`zustand`, MIT) as
the renderer's replica store.** Selection criterion for each: the framework is chosen for a documented
key-and-position reconciliation rule and a forced synchronous commit, because those are what ADR-0045
and `REQ-UIBENCH-051` respectively require of it; the store is chosen for a vanilla core testable with
no renderer and a whole-state replace that is not a merge, because those are what ADR-0046 and
`REQ-MONITOR-217` respectively require of it. Neither is chosen for its ecosystem, and neither is a
framework decision about the rest of the product.

- **The slot index is the key in every recycler**, in the transcript and in the agent, todo, artifact
  and board list pools (ADR-0045). Row identity is never a key. This is the one place React's default
  idiom is wrong, and it needs a test that fails on a regression, not a comment.
- **ADR-0046's apply stage imports nothing from React.** It is written against the vanilla store and
  runs in a plain test process. The renderer observes the result; it never computes it.
- **The store has no general write surface.** Run-derived state is written only by `applySnapshot` and
  `applyIncrement`. `applySnapshot` **replaces**, so a field the new whole-session payload does not
  carry cannot survive from the previous one (`REQ-MONITOR-217`). Local-only interface state — scroll
  anchor, expansion map, composer text, search query, drawer state — is a **separate store**, so a
  replacement of the first cannot clear the second (ADR-0043).
- **The paint-completion promise resolves after a forced synchronous commit**, not after the default
  scheduler chooses to commit. `REQ-UIBENCH-051` charges rendering cost to the phase that caused it and
  `REQ-UIBENCH-119` bounds the settle at 30 s; neither is satisfiable if the commit point is the
  scheduler's to pick. Because `REQ-UIBENCH-112` forbids a benchmark-specific rendering path, this is
  the live application's commit discipline too.
- **Every selector carries an explicit equality function**, and composite selections use the shallow
  helper. A selector returning a freshly allocated object under identity equality repaints on every
  publication, which breaks `REQ-MONITOR-223` under load and is invisible when idle.
- **`widgets` is counted from the application's own layout registry**, which ADR-0045 defines, and never
  from the framework's internal tree. Framework-internal objects are `ui_objects`, which
  `REQ-UIBENCH-050` makes informational. Reading `widgets` off React would make a product invariant a
  function of a dependency's internals.
- **Hidden windows unsubscribe from the store** rather than rendering to a hidden surface
  (`REQ-SHELL-151`, ADR-0043). Unsubscription is a store operation, which is why the store must be
  addressable outside the component tree.

**This narrows ADR-0043 rather than contradicting it.** "Any store with equality-checked selectors will
do" is true of the read path and false of the write path: `REQ-MONITOR-217`'s payload has to land as a
replacement, and a store whose only writer merges cannot express that except by convention. Read that
sentence as scoped to selectors.

## Consequences accepted

1. **A concurrent-by-default renderer in a product with a hard "finished showing" signal.** Every place
   that measures or promises paint completion forces the commit. This is a standing discipline and the
   most likely thing to be got wrong quietly, so it needs a test rather than a review convention.
2. **Two more dependencies whose major versions move.** The blast radius is the renderer, and the apply
   stage — the part with a determinism obligation — depends on neither of them.
3. **A fixed bundle cost inside the five-second first-paint budget** (`REQ-STARTUP-155`). It is small
   but not zero, and it is the first thing to measure when ADR-0056's revisit condition is approached.
4. **`ui_objects` will be dominated by framework internals** and will move between framework versions
   for reasons that have nothing to do with the product. `REQ-UIBENCH-050` makes it informational and no
   invariant reads it, which is exactly why that is tolerable — and why the counter must never be given
   a meaning it does not have.
5. **The recycler is un-idiomatic React**, which ADR-0045 already accepted in the abstract. Naming the
   framework is what turns "contributors must know the transcript is a recycler" into an instruction
   someone can act on.

## Revisit if

Forced synchronous commits at pool scale cannot hold `REQ-MONITOR-222`'s 250 ms p95 or
`REQ-UIBENCH-118`'s sub-100 ms interface lag in the thousand-replacement tail phase; or the element-count
spike (spike 1 of `open-questions.md`) shows the pool cannot hold `widgets` steady under this renderer —
in which case the framework is not the fix and ADR-0045's alternative B is the question, together with
the costed accessibility plan that record demands.
