# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 5's refusal set, built and measured — 2026-10-20 (`PD-LIBRARY-002` revision 6, OQ-363, R-072; loc1)

Part 13 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 5's refusal set, built and measured — 2026-10-20 (`PD-LIBRARY-002` revision 6, OQ-363, R-072; loc1)

**Reported back.** The question the previous section left as [OQ-363](../../open-questions/65-spikes-and-later-questions-32.md#oq-363) was ruled (b), refined, on
2026-10-20 under R-072 *(the ruling in that entry; `PD-LIBRARY-002` revision 6)*, and built the same day by loc1
(`loc1-confinement-retro`). Of a configuration that loads, decision 5's pass is now refused for exactly what the directive's "The
model" states, and the run's refusals reach it no longer:

- **Refused:** a configuration that does not load or apply (`unloaded` → `retrospective.no-configuration` with the loader's reason);
  no resolvable retrospective model (`no-model` → `retrospective.no-model` at the capture, `improvement.no-model` at the analysis),
  now also where `default_persona` names no role this build knows and no retrospective model resolves, with the reason "default_persona
  '<x>' names no role this build knows, and no retrospective model resolves (retrospective_model, then medium_model)."; and revision
  5's lease refusal (`session.provider-auth`, the retrospective's sentence).
- **Not refused:** a `default_persona` naming no known role (the setup completed on the pass's own model, the configured name kept,
  no role's system text, logged "configuration: default_persona '<x>' names no role this build knows; a retrospective sends nothing to
  it, so its setup is completed on its own model '<key>' (PD-LIBRARY-002)"); an entry role with no usable model (fin47); a confinement
  mode (fin47); and REQ-CONFIG-246's referential errors, whatever the presenter — `prepareRun` reads no attendedness for a
  retrospective, and `retrospective.capture` writes each warning of the setup once at `warn`, prefixed `retrospective: `, the analysis
  none.
- **`retrospective.configuration`**, `leasedSetup`'s answer for a loaded configuration that refuses the pass, is reached by no current
  refusal; the branch stays as the truthful answer for one that ever does.

Every run start and continuation keeps both refusals word for word. **Measured:** in `apps/desktop/src/run-host/launch.test.ts`, four
retrospective cases red before the change (the unknown persona completed on `selected` over the leased bearer with an empty system
text and the stand-in line; the same with no one present, its referential message among the warnings; referential errors alone with
no one present; and `no-model` with nothing leased) and the run start's two refusals pinned beside them; in `dispatch.test.ts`, the
capture's two warn lines once each and none at the analysis, red before. `pnpm retrospective-proof` launch 13 (`unknown-persona`) went
red on its first five checks on the base and green after: no refusal notice, the indicator seen then gone, one `retrospective`
artifact with no source session, the stand-in line, and one `warning` line "retrospective: configuration: default_persona
'a-role-this-build-does-not-know' names no existing role"; its sixth check, a prompt refused "The run was refused before it started"
with "names no role this build knows", green on both. The whole proof read 83 of 84 on Windows 11 ARM64 (78 of 84 on the base); the
one red both times is launch 1's machine-wide-base check, Windows-only and recorded in
[`../../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md`](../../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md).
**Not measured in the built app:** the analysis with the presenter lapsed — the gesture is always attended there — which
`launch.test.ts` carries.
