# Architecture proposals — UI slice — 4. How the design meets the domain 21 budgets

Part 8 of 10 of [the ui proposal](../ui.md), which indexes every part.

## 4. How the design meets the domain 21 budgets

Domain 21 and REQ-SHELL-150 state numbers as acceptance criteria. This section says how the design
above is meant to meet each, so the claim can be checked rather than asserted.

| Budget | Requirement | How the design meets it |
|---|---|---|
| Gesture acknowledged within 100 ms | REQ-SHELL-150 | Every gesture's first effect is local renderer state (composer text, expansion toggle, drawer, tab, divider). Nothing that acknowledges a gesture waits on the boundary. Commands that must cross the boundary acknowledge locally first (disabled state, spinner) and report the outcome when it returns (N10). |
| Repaint interval ≤120 ms under sustained change | REQ-SHELL-150 | The 50 ms trailing coalesce of S5 sets the publication floor; the renderer applies each publication in one pass (ADR-UI-04) and paints on the next frame. The persona and terminal windows coalesce at 120 ms by their own timers (S8). |
| Burst final state on screen within 120 ms of the last change | REQ-SHELL-150 | The trailing coalesce reads current state when it fires (REQ-MONITOR-220), so the last change is always in the last publication; nothing is dropped. |
| Streamed output on screen within 200 ms | REQ-CHAT-157 | Unseen rows are published immediately (S5); growth is coalesced at 50 ms; the apply pipeline touches only rows from `fromIndex` and the recycler repaints only visible slots (R1). |
| 250 ms p95 visibility regardless of session length | REQ-MONITOR-222 | Cost is bounded by increment size, not session size: `fromIndex` bounds the diff (ADR-UI-04), the recycler bounds the paint (ADR-UI-03), and the measurement cache bounds re-measurement (R3). |
| ≤2× cost at 10,000 rows vs empty | REQ-MONITOR-223 | The only structures that grow with session length are the offset table (O(1) update per changed row via prefix sums) and the row array. Nothing in the per-update path iterates the whole transcript. This is the constraint that makes a `fromIndex = 0` publication a defect rather than a slow path, and it needs an explicit sender-side assertion and a diagnostics counter. |
| Idle session does no work | REQ-MONITOR-223 | No timer runs unless a row is live (REQ-CHAT-063's "when no row is live, nothing in the transcript may animate or repaint on a timer"); hidden surfaces unsubscribe and cancel timers (T6). |
| Interface lag <100 ms in every benchmark record | REQ-UIBENCH-118 | The renderer must never do unbounded synchronous work. The three places it could: the apply pipeline (bounded by increment size), Markdown parsing (bounded by the cache and by row size), and measurement (bounded by visible slots). The 1000-replacement tail phase is the adversarial case and is the one to measure first. |
| `widgets` stable after construction | REQ-UIBENCH-054/085 | Fixed slot pools allocated at construction, sized for the largest reachable viewport; content variance accounted to `ui_objects` (ADR-UI-03). |
| Operation counters identical across iterations | REQ-UIBENCH-083 | The apply stage is a pure function of (displayed state, incoming state) with no clock, randomness, locale comparison or environment-dependent iteration order (ADR-UI-04). |
| Tail-phase second-half growth <64 MiB | REQ-UIBENCH-087 | Both caches are LRU-bounded (R3, R4); the recycler allocates no elements per replacement; the parse cache is keyed on source text so 1000 distinct replacement strings evict rather than accumulate. This is the invariant most likely to fail first, and it fails loudly. |
| Report presentation within 100 ms for ≤10 iterations | REQ-UIBENCH-115 | The report is computed in the main process and delivered as one payload; presentation is rendering a bounded object. |
| First paint within 5 s | REQ-STARTUP-155 | Nothing is awaited before `ready-to-show` except the preference root read and font loading (ADR-UI-13). |

Two of these are not yet demonstrable and should be treated as the first spikes after the gate: the
`widgets` invariance of a slot-pool recycler through the seven phases, and the tail-phase memory
tripwire. Both are cheap to test against a throwaway harness and both would change ADR-UI-03 if they
failed.

---
