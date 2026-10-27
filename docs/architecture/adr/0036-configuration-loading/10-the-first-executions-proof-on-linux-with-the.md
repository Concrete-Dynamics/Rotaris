# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — The first execution's proof on Linux with the code-intelligence bundle present — 2026-09-28 (R-062)

Part 10 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## The first execution's proof on Linux with the code-intelligence bundle present — 2026-09-28 (R-062)

The first execution above says "Discard writes nothing", and `pnpm config-proof`'s scenario 3 measured it by byte
comparison against a never-initialized seed. That measurement stopped isolating Discard when Part AS (ADR-0064) gave
the same `agents.yaml` a second writer. On open, a never-initialized workspace starts `code-intelligence-setup` in
the background. When the task succeeds, its one writer (REQ-WORKSPACE-085) records the `initialization:` section in
that file while Discard is being pressed. The task succeeds only where the bundled runtime is present, so the proof
was green in trees without the bundle and red, "Discard wrote the file", in the Linux sweep tree that had one. It
was reproduced both ways in one tree. **The loader and the four writers are not implicated.** The recorded section
sits after every seeded line, and those lines are unchanged. The Runtime and Models saves in the same run keep both
the initialization record and every seeded line (checked with `includes`, as before).

The proof now seeds the Discard scenario as a workspace initialized before, and fails if an initialization run
starts anyway. The byte check stands unweakened against that seed, and Discard's result is also read from the
save-status probe ("All changes saved", REQ-CONFIG-280). The scenario's steps now wait for their controls and are
each read back from the log. The sweep's first run had shown a launch whose Settings category stayed on Models,
whose two clicks pressed nothing, and whose script carried on. Recorded and repaired in
[`config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md`](../../../defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md).
**What it could not show:** whether a Settings save and the initialization record can interleave so that one
overwrites the other. Both writers round-trip the whole document. This run saw them land a second apart, never
together, and nothing here measures the overlap. The run was on Linux as root under Xvfb; Windows and macOS were
not measured (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).
