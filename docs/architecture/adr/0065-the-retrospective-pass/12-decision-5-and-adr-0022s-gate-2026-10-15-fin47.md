# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 5 and ADR-0022's gate — 2026-10-15 (fin47, `fin47-accept1-4`; acceptance finding A3)

Part 12 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 5 and ADR-0022's gate — 2026-10-15 (fin47, `fin47-accept1-4`; acceptance finding A3)

**Found by reading, then seen in the built app:** decision 5's "a pass with no run resolves its own model and its own credential"
was built by preparing the pass with the run start's own `prepareRun`, which carries ADR-0022's start-time confinement gate. With
`runtime.sandbox_mode` anything but `off` the gate refused the retrospective wherever the run host's verdict was unsettled (no run
start, no Settings read yet) or unavailable (every Windows host; a Linux host without `bwrap`), and `leasedSetup` turned that
refusal — like every refusal but `no-model` — into `unconfigured`: "The workspace configuration could not be loaded" at the
gesture, "The captured improvement job is no longer available" at the analysis. The reading that the run start's preparation was
the right one for a pass with no run **was false for its gate**, and is kept here beside its replacement. **Now:** `prepareRun`
leaves the gate out of a retrospective's setup (`PrepareOptions.retrospective`) — the pass opens no shell and its setup never
reaches a run — and only an unloadable configuration is said as one, with the loader's reason; a loaded configuration's other
refusals answer `retrospective.configuration` with their own reason, and whether they should refuse the pass at all is
[OQ-363](../../../archive/architecture/open-questions/65-spikes-and-later-questions-32.md#oq-363). *(Ruled 2026-10-20 under R-072, (b) refined: neither refuses the pass — `PD-LIBRARY-002`
revision 6; built the same day, the next section.)* Pinned by `launch.test.ts`'s seven cases and a `dispatch.test.ts` case, and by
`retrospective-proof` launch 12 (`confinement-requested`), red on three checks on the base `7c9182c` and green after
([`../../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](../../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md)).
