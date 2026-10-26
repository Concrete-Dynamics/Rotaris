# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Discard pressed where the notice banner moved it — 2026-10-23

Part 11 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Discard pressed where the notice banner moved it — 2026-10-23

Scenario 3 went red once on a Linux tree, the status still `Unsaved changes` after a Discard the capture seam reported
clicked, and passed once on the unmodified `a118d59b` beside it. The two logs differ only in whether the "No model provider
is authenticated yet" notice was raised between Discard's measurement and its press; the reading that the press met the
banner is inferred from those timestamps and the screenshot, not logged. **The loader, the writers and Discard are not
implicated**: the file stayed byte-identical in both runs. The scenario is now driven, each press a settled click confirmed
landed, each step waiting for the state the last produced; the assertions stand as they were. Four repaired runs passed Discard (one of them red later, at scenario 5 under load),
without meeting the banner, so the race is guarded by the settled click's contract rather than shown by these runs. Recorded
and repaired in [`config-proofs-discard-leaves-the-save-status-unsaved.md`](../../../defects/fixed/config-proofs-discard-leaves-the-save-status-unsaved.md).
