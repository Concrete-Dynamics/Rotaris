---
req-id: SWR-3118
status: draft
trace: optional
test: optional
title: "A requirement source may report its own delivery state"
epic: SWR-3100
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3118 — A requirement source may report its own delivery state

The Zielbild lists GitHub Issues, Jira and other external issue systems among the
sources a project may already use (§2.1, §8), and epic SWR-3100 already carries
the adapter interface, its declared capabilities and multiple sources in one
workspace. What none of them answers is what happens to the *status* such a
system keeps: a Jira issue is `In Progress` or `Done` in Jira, and that is
neither the requirement's lifecycle nor Rotaris' delivery state.

Mapping it onto lifecycle would misreport the specification. Mapping it onto
Rotaris' delivery state would claim Rotaris did work it never did — the same
mistake SWR-3217 exists to avoid for a local codebase. Silently preferring one
over the other would hide precisely the disagreement a user needs to see.

Requirement: a source may declare that it reports a delivery-shaped state, and
where it does, Rotaris carries that state beside its own rather than instead of
it.

- The capability is declared like every other (SWR-3105) and surfaced, so the
  board only offers what the source honestly supports.
- A state a source reports arrives with the `external` origin of SWR-3219 — the
  vocabulary already exists, so nothing here extends the model.
- Rotaris' own delivery state remains Rotaris' own. A source's report never
  drives a transition and never satisfies a completion condition.
- Where the two disagree, both are shown, the way SWR-3202 shows lifecycle and
  delivery side by side rather than merging them into one badge.
- Writing a state *back* into the external system is a separate question and not
  part of this requirement.

## Notes

Specified as part of the adoption work (SWR-3217) so that the origin vocabulary
it needs is introduced once and completely. Deliberately `draft`: no adapter
produces an external state yet, and the requirement is here to keep the seam
honest rather than to claim a feature.

Epic: [Requirement Sources and Canonical Model](../3100-requirement-sources.md)
