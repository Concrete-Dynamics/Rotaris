# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — First execution — 2026-09-05, the whole loader, the four writers, and the screen (Part I)

Part 7 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## First execution — 2026-09-05, the whole loader, the four writers, and the screen (Part I)

*Recorded under GD-10. The eleventh defect of ADR-0058 consequence 17's pattern.*

**Built and run:** `loadConfiguration(globalDir, workspaceRoot)` (`packages/config/src/load.ts`), taking no
database handle; the built-in defaults copied per load; the four merge classes (`merge.ts`) with the section
overlay written once over a mapping adapter and run by the loader over plain values and by the per-field writer
over the YAML tree — the divergence this record wanted made a compile-time impossibility is now that one
function; the typed sections `models:`, `personas:`, `runtime:`, `compressor:`, `circuit_breaker:` with every
key's type, range and default; tier-alias substitution and reasoning synthesis as pure transforms (`slots.ts`);
the two validation stages with REQ-CONFIG-237/238's rendering and REQ-CONFIG-478's fatal report; the four
writers (`writers.ts`) editing the parsed document in place through ADR-0004's replace; the load split into
merge and resolve so ADR-0037's Tier B runs the loader's own passes; the workspace service's Tier A
(`snapshot.ts`); the run host reading its files per run start (`apps/desktop/src/run-host/configuration.ts`);
Settings → Models, Personas and Runtime. Fifty-nine tests across the package and the screen's state; `pnpm config-proof`
in the built app: commented files at both scopes drive a run, a Runtime toggle and a Models slot save leaving
every other line as written, Discard writes nothing, the composer's control writes its one key, a fatal file
refuses the run naming file, scope and path, and the corrected file runs.

**Measured (the two contingencies of "Revisit if").** The no-cache rule: a full load — four files, the merge,
the sections, the synthesis, the referential list — takes **4.3–4.7 ms** in the built app on this workstation,
timed on the run host's monotonic clock and logged at every run start; REQ-SHELL-150's 100 ms gesture budget is
not approached and consequence 2's "microseconds" was an underestimate by three orders of magnitude that changes
nothing. The document-API write path is exercised (five saves and per-field writes in the proof, each followed by
a reload inside the same action) but **not timed separately**; that figure is still owed.

**Found — re-emission is not byte-identical.** The DATA spike said a targeted edit "preserves comments, layout
and key order", and consequence 3 says "comments and layout survive every write". First execution: the comment
text, the blank lines, the indentation, the key order and an unknown key all survive every writer — and the
spacing before an inline comment collapses to one space on re-emission (`default_persona: orchestrator   # x`
comes back as `default_persona: orchestrator # x`). REQ-CONFIG-252's observable (comment text, blank lines,
indentation) is met; "the file's bytes outside the written keys are untouched" is not, and the guard test now
asserts the former and pins the latter. The reason the record gave — only parse-then-stringify loses comments —
stands; what it did not say is that the document API normalises whitespace it does not own. Kept beside the
claim rather than repaired: no alternative produces the observable at all.

**Corrected against this record's own first slice:** the circuit-breaker reader reported a `timeout_seconds`
key as an error; REQ-CONFIG-233 makes an unknown key in a merged section a warning, and it is one now.

**Readings recorded.** (a) The built-in default layer declares the thirteen roles with a tier each so a
`personas:` override that states one field merges onto a complete entry and validates (`personas.name` and
`.model` are required); the tiers — large for the coordinating and designing roles, medium for the rest — are
this build's proposal, the owner's to replace. (b) The hooks section keeps its tri-state reader as a section of
the one load; the hook engine's summary and review keep `loadHooksConfig` for their per-file states, so a run
start reads the files twice (REQ-CONFIG-014 forbids a cache, not a second read). (c) `rotaris` is exempt from
the unknown-top-level-key warning as the key the specification places outside the layered model. (d) Every load
keeps `.rotaris/` out of version control (REQ-CONFIG-013), the screen's reads included. (e) Known-token-limit
back-fill (REQ-CONFIG-096) has no table to read; the budget fields stay as written. (f) Mode `0644` is a no-op on
Windows. (g) Credentials for the classifier, summariser and loop slots use the entry model's resolver
(`api_key`/`api_key_env`) until ADR-0029.

**Not built, said so:** the discovery-snapshot and auto-discovered-server layers (REQ-CONFIG-033/034) and
`mcp_servers`; `secrets.yaml`; providers and credential files (ADR-0028/0029); REQ-CONFIG-183's strict
`requirements:` block (consequence 6 is not yet delivered — the section is carried, not validated);
`verifier`, `skills`, `display`, `transcript`, `checkpoints`, `integration` beyond carrying them; the security
policy card (no confinement backend, ADR-0022); the Display, Skills, MCP, Plugins and Tools categories.
