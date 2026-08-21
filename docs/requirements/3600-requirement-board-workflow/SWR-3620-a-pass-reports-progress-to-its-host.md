---
req-id: SWR-3620
status: approved
trace: required
test: required
title: "Adoption and verification report progress to whoever started them"
type: technical
derived-from: SWR-3615
epic: SWR-3600
date: 2026-08-19
---

# SWR-3620 — Adoption and verification report progress to whoever started them

The verification pass (SWR-3221) and the adoption pass (SWR-3217) are composed in
the engine and started from two places: the board's controls (SWR-3614,
SWR-3615) and `rotaris-headless requirements verify`. Both passes are opaque
while they run. They return one report at the end, and until then a host has
nothing to show — which is why the desktop can say only that a pass is running
and not what it is doing (SWR-3320).

The suite runner already solved this one layer down: `run_check_suite` takes a
progress host, tells it about each check as it starts and settles (SWR-2609), and
dispatches to it defensively so a broken host cannot fail a run. What is missing
is the same seam one layer up, over the pass's own phases — and the two callers
that run the suite for a requirement pass never passed the existing one.

Requirement: a pass reports its phases and its per-item positions to a host that
asks for one, and behaves exactly as it does today for a host that does not.

- **The pass declares its phases**, not its internals: reading the requirement
  source, running the check suite, sweeping coverage, recording verifications,
  adopting candidates. A host renders a phase; it does not infer one from a
  pattern of callbacks.
- **A phase states its total before its first item.** A count that arrives with
  no denominator cannot be rendered as a position, and a denominator that arrives
  late is the reason a progress display flickers between shapes.
- **Reporting cannot change what a pass concludes.** A host hook that raises is
  logged and stepped over — the contract SWR-2609 already holds the runner to —
  and a pass given no host produces the same report, the same records and the
  same writes as before, with no reporting work done at all.
- **The seam is not shaped like any one surface.** It is a protocol of plain
  values in the engine, consumed by at least the desktop's worker and the
  headless command; a seam with one consumer is a seam that quietly becomes that
  consumer's internals.
- **Existing hosts stay unchanged.** The verification seam a test replaces keeps
  its signature, so a pass that reports progress and a pass driven by a double
  are the same pass.

## Test coverage

Unit tests cover the phase sequence a verification pass reports, the adapter that
turns the suite runner's check callbacks into the pass's own items, one item per
written verification and per adopted candidate, a host that raises leaving the
report untouched, and a pass with no host behaving byte-for-byte as before. The
product flow this enables is SWR-3615's verification and SWR-3614's adoption,
whose surfaces are covered by SWR-3320.

Derived from: [SWR-3615 — A user can verify without delivering](SWR-3615-verification-is-offered.md)

Epic: [Requirement Board Workflow](../3600-requirement-board-workflow.md)
