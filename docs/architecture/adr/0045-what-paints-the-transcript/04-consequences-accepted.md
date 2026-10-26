# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — Consequences accepted

Part 4 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## Consequences accepted

1. **We write and own a virtualiser rather than adopting one.** The transcript becomes the most intricate
   component in the product and needs its own test suite covering cost-by-visible-rows, the caches,
   identity-keyed expansion, anchor restoration, follow state and the element-count invariant.
2. Contributors must know the transcript is a recycler and that ordinary list idioms are wrong inside
   it.
3. The `widgets` and `ui_objects` split becomes a **documented product definition**, not an
   implementation detail — and, until OQ-28 is answered, a **documented product definition that may not
   be the one the specification meant**. The earlier form of this consequence went further: "If reading
   2 is confirmed, this record does not survive amendment: it is replaced." **ESC-13 reverses that.**
   Under reading 2 the only structure that satisfies `REQ-UIBENCH-054` is the canvas, the canvas is
   refused, so `REQ-UIBENCH-054` is relaxed instead. The residual cost of reading 2 is therefore a
   specification amendment in a domain whose whole point is determinism, plus a `widgets_stable_after_warmup`
   that reports false — informational under `REQ-UIBENCH-088` — and **not** the replacement of this
   record.
4. **`H_max` is a product constant somebody must choose**, and choosing it fixes the behaviour on a
   display taller than it — the one case in which the slot count changes after construction. The spike
   makes the consequence concrete rather than theoretical: at a 20,000 px viewport, 671 slots are called
   for and 80 exist, so the choice decides how much of the transcript pane is blank in that state.
5. **The two invariants this record could not demonstrate are now demonstrated, and the result is
   reported here rather than left in the spike.** Element-count invariance holds under reading 1 at 629
   across 384 observations and fails under reading 2 at the first post-construction record, exactly as
   this record predicted; the tail-phase memory tripwire passes at a worst case of 10.7 % of its limit.
   Both were run against **both** counting rules, which is what the earlier form of this consequence
   asked for. Three incidental results are carried because an implementer will meet them: the operation
   counters were **byte-identical across all twelve fresh processes**, so `REQ-UIBENCH-083`'s
   determinism claim survives a real recycler; rendered-body cache occupancy stayed inside
   `REQ-UIBENCH-063`'s bounds in all 84 records, at most 256 entries and 78,592 source characters
   against the 2,000,000 limit; and `REQ-UIBENCH-059`'s `unchanged_state` phase does **not** re-apply a
   state "identical to the state already displayed" once `tail_replacements_1000` has run before it, so
   it counts as one `update` rather than one `noop`. That last is a reading question about the
   requirement, not a finding about this decision, and is reported as such.
6. **The 200 ms budget is measured and held, with one qualification that is a reading question.**
   `REQ-CHAT-055` and `REQ-CHAT-157` were exercised at 0, 100, 1,000, 2,000, 5,000 and 10,000 total rows
   in both scroll variants, 60 repetitions per operation. The worst single apply-to-paint observation
   anywhere, across **2,520 apply-to-paint measurements**, was **34.2 ms — 17 % of the budget**. The
   apply-to-paint p50 was **13.8–13.9 ms at every total-row count in both variants without exception**,
   a floor set by the frame cadence and not by the transcript, which is `REQ-CHAT-055`'s
   cost-by-visible-and-changed-rows claim showing up directly. Ordinary-least-squares slopes of sync
   cost against total rows ran 0.0024–0.274 µs/row with **two of five negative**, which is the clearest
   available statement that what is left is noise rather than dependence. The qualification:
   `REQ-CHAT-055`'s "appending a row MUST cost no more than it does on an empty transcript" is **not met
   as a synchronous figure** — 1.4 ms on an empty transcript against 2.7 ms at 10,000 rows in the follow
   variant — while being met exactly to paint, 13.9 ms at both. The 1.3 ms residue is the O(n) scan a
   **whole-transcript assignment** forces at the view boundary, which `REQ-UIBENCH-055`,
   `REQ-UIBENCH-057` and `REQ-UIBENCH-058` all mandate: they hand the view the entire transcript on
   every update, so some per-row work is unavoidable however the view is built. **This record does not
   claim the requirement is met on the strict reading**, and whether "cost" means the synchronous call
   or the time to paint is a question for the specification.
7. **The settle signal is a shared obligation with ADR-0053 and the evidence says the obvious primitive
   fails.** See the Decision. The consequence worth stating separately is that a settle which expires
   also invalidates `REQ-UIBENCH-087`'s memory sample taken beside it, so the two invariants this record
   is responsible for are coupled through a mechanism neither of them mentions.
8. **`REQ-UIBENCH-118`'s interface-lag invariant is decided by how a phase is driven, not by the
   recycler.** The spike measured maximum `event_loop_lag_ms` at 581.7–2,752.4 ms with a burst driver and
   **≤ 74.8 ms with a driver that yields after every update** — false against the 100 ms threshold by up
   to 27× in the first case and true in the second — with the widget counts and operation counters
   identical either way. Yielding costs an order of magnitude in phase wall time. That is ADR-0053's
   choice to make; it is recorded here because the apply pipeline is what a yielding driver yields
   between, and because whichever way it is settled, one of `REQ-UIBENCH-118`'s boolean and the phase
   wall times will look very different from the other reading and the two are not separately tunable.
