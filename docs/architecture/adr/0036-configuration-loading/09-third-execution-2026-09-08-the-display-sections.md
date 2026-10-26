# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Third execution — 2026-09-08, the `display:` section's surface and write path (Part AG)

Part 9 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Third execution — 2026-09-08, the `display:` section's surface and write path (Part AG)

The first execution's "not built, said so" list named five categories; four of them are now drawn, and the fifth and
sixth (Skills, Plugins) still wait on a mechanism rather than on drawing — portable-skill discovery
(REQ-WORKSPACE-056/062/063/064, cited nowhere in this tree) and REQ-TOOLS-161's plugin loader (ADR-0025).

> **Skills is drawn since 2026-09-15** (ADR-0063). The sentence above is kept as it was written, because what it
> records is what was true at the third execution; `skills:` is now a registered section with a reader behind it
> (`sections/skills.ts`), the desktop save writes its three keys sparsely (REQ-CONFIG-256/258), and the category
> is a surface. **Plugins is the one that still waits.**

**It found a defect, in the reader Part Z built.** REQ-CONFIG-172 fixes the section's keys as
`tool_result_max_lines` and `tool_input_max_lines` and states that a cap of **`0` means no limit**.
`display-section.ts` read `tool_result_lines` and `tool_input_lines` — key names no requirement states — and passed
`0` through as a literal cap of zero lines. A file written exactly as the requirement words it therefore drew
**nothing** where it had asked for **everything**, and no reading of the code had caught it because both halves were
self-consistent: the reader and its only caller agreed with each other and with nothing else. The falsified reason —
that the resolved view's own field names could stand in for the file's — is kept in that file's header beside its
replacement. The view keeps its field names (`tool_result_lines`, `null` for unlimited); only the **document's**
spelling is the requirement's, since only the document round-trips. `displayCapToFile` / `displayCapFromFile` in
`@rotaris/contracts` are the single mapping, so the surface and the reader cannot drift apart again.

Nothing else in the loader moved. `saveDesktop`'s `display` branch (REQ-CONFIG-256, written per field so a `display:`
key the screen does not offer is left as the file states it) had never run before this part and now does: the proof
writes four fields into a file that already carried an unknown `show_thinking: true` and finds it untouched.
`readSnapshot` additionally carries REQ-CONFIG-277's Instructions inventory — a presence check over the workspace's
two instruction files, not a read of them — so the settings screen gains an inventory without a new message.
