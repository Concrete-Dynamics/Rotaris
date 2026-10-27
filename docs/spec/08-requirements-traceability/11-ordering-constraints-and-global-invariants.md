# Requirements Board and Traceability — Ordering Constraints and Global Invariants

Part 11 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-494 – REQ-TRACE-500.

### Ordering Constraints and Global Invariants

- **REQ-TRACE-494** — Ordering SHALL be deterministic everywhere. Every ordered output SHALL be explicitly sorted: requirements by number; store and source scans by POSIX path string; orphan lists sorted; debt baseline entries numerically and the two path baselines lexicographically; retired identifiers by number; change-comparison entries by number; coverage-map keys ascending.

- **REQ-TRACE-495** — Every artifact SHALL be written **UTF-8 with LF** endings on every platform, and CR and CRLF SHALL be normalized to LF on read before hashing, so all artifacts are byte-stable across platforms.

- **REQ-TRACE-496** — Ordering constraints on the board SHALL be: the delivery-axis column order is fixed and not derived from data; closed axes emit every value while open axes emit only present values with the unset bucket last; cards within a column follow the chosen sort order; revision history runs oldest to newest with the current marked; the blocker chain is topologically ordered and stable across reads; review decisions render in their fixed order; card alerts render in their fixed order with first-spelling-wins de-duplication; optional card facts render in their fixed order; pass phases run in their fixed sequence per pass kind with adoption's recording phase last; and surface installation is staged — board on first open or refresh, every pane on first use, never over a caller-attached surface.

- **REQ-TRACE-497** — None of the following SHALL ever be observable:
  - a requirement shown in two columns at once, or in no column at all;
  - a column count that disagrees with the number of cards visible in that column;
  - a card resting in a delivery state the engine did not grant;
  - the terminal state reached while the engine's completion conditions did not hold;
  - a state-changing action for which no record was written;
  - a write produced by rendering, dismissing, opening, reading or re-grouping;
  - a verification that moved a card or wrote a delivery record;
  - a card that has arrived in a column which remains folded;
  - a fold made in one workspace taking effect in another;
  - a health, evidence-health or epic-progress value on screen that differs from the projection's;
  - a requirement-checking or verifier process launched by the application;
  - a board assembled locally in place of an unavailable projection;
  - evaluation or projection work blocking the interface event loop;
  - a progress report that brings a card into existence, reuses one for another card, repaints one, or enables a control;
  - focus left inside a hidden filter row, a closed pane or a folded column;
  - rotated text on a folded rail;
  - a previewed create location differing from the path the write produces;
  - a run started while its disclosure was due and had not been accepted;
  - a run in flight whose record carries no session identifier;
  - a card that can be dragged between columns on an axis other than delivery;
  - an epic card offering a delivery action.

- **REQ-TRACE-498** — Every one of these failures SHALL be visible to the user and stated in words, with the behavior given here:

  | Failure | Required observable behavior |
  | --- | --- |
  | Projection unavailable | an error is stated; the last good board stays on screen; no board is assembled locally |
  | Evaluation failed | a notice that persists and can be acted on; the last good board stays; the retry names what it retries |
  | Fold settings unreadable, or written by a later build | nothing is folded; the board opens under the emptiness rule |
  | Stored sort order or axis unknown to this build | the default for that setting is used |
  | Source read-only | the read-only sentence is shown, the source is named, and opening the artifact is offered — no disabled field |
  | Write to source failed | what the user typed is kept; the failure is stated |
  | Create location cannot be previewed | the inability is reported and shown in the form; no path is invented |
  | No revision history | an "unavailable" sentence, worded differently from the pending "reading" sentence |
  | Requirement not awaiting review | the state it is actually in is named |
  | Awaiting review with no finished run | it is stated that there is nothing to review yet |
  | Workspace is not a version-controlled repository | it is stated that a run has nothing to branch from, and setting one up is offered |
  | Repository holds no commit | a notice carrying a re-check action; the release is refused before any card moves, quoting the engine |
  | Composition assembled without a run coordinator | the unit executes and reports exactly as it otherwise would |
  | A progress consumer raises | the failure is logged and stepped over; the pass's report is unaffected |
  | Analysis switched off | the control explains why instead of merely appearing disabled |
  | Workspace cannot host a run when a blocker is cleared | the blocker clears regardless; the reason nothing started is reported on the action's result |
  | Layout configuration unreadable on a consuming path | a warning and an empty sweep; never a reported read failure |
  | Layout configuration unreadable on a traceability operation | the failure is stated in the terms of REQ-TRACE-046, naming the configuration path and the cause; no operation is performed and nothing is written |

- **REQ-TRACE-499** — A single end-to-end path over the **shipped composition** SHALL be exercisable with no caller-supplied wiring: release, run, review, accept, and notice a subsequent edit.

- **REQ-TRACE-500** — **A trace that no longer holds SHALL break the build.** A reference naming a requirement that has been deleted SHALL fail compilation, and a requirement whose obligations are unmet SHALL fail the meta-tests the project's own test suite runs (REQ-TRACE-183) and SHALL be stated as a violation by the check of REQ-TRACE-508. Keeping requirements and code aligned SHALL rest on no manual coordination step between people: every trigger for propagation SHALL be a build, a test run, or a change the board observes for itself (REQ-TRACE-334, REQ-TRACE-347).
