[Product directives](../directives.md) › PD-ORCH-017

<a id="pd-orch-017"></a>

### PD-ORCH-017 — children have no fixed model-step cap

A delegated child MUST NOT end a conversation or return a partial report merely because it has taken a fixed number of model steps. This applies to fresh, resumed, nested and continued children. The run's iteration limit, child timeout, cancellation, pause and loop supervision retain their existing meanings. The root's internal step bound is unchanged.

**Why, and what it costs.** A productive child can need more than 100 model steps. The internal backstop otherwise ends that work independently of progress. Removing it leaves the existing child timeout and loop supervision responsible for bounding a child.

> **Extends:** REQ-ORCH-088

*Raised by the owner, 2026-10-16; logged as [R-073](../requests.md#r-073).*

**First execution, 2026-10-16.** The real-store child regression completes 105 tool calls and answers on model step 106; the focused engine, turn and back-pointer run passes 1,012 tests across 36 suites. The rebuilt application's whole `part-h-proof` passes, including `child-over-100`: one succeeded child with 105 tool calls and no step-bound warning. Its first fixture incorrectly inherited the proof helper's `single` strategy and created no child; the corrected fixture uses the ordinary delegation strategy and fails if no child runs. Lint and typecheck pass. The full gate remains red on Windows symbolic-link privileges, MCP scratch cleanup and other timeouts; continuation's later-run launch, compression startup and three resilience scenarios also failed. This is not a green landing gate or a live-model execution of the change.

**Follow-up under R-074, 2026-10-16.** The full unit gate subsequently passes while awake (6,500 tests), as do the complete MCP proof and continuation proof. Windows shutdown now gives the server stdin EOF before its runner is tree-killed at the grace bound, and path-observation fixtures use junctions without skipping their assertions. Other UI-proof readings remain recorded separately; no live-model execution is claimed.
