---
name: review-ui
description: Produce a read-only visual critique of a built Rotaris UI from ui-review screenshots, DOM geometry, computed styles, layout-contract results, and the adopted design language. Use after implementation or when evaluating visual quality. Reports findings and evidence status; source repairs belong to build-ui or debug-ui.
---

# Review a Rotaris surface

This workflow is report-only. Write evidence under `.ui-review/`; leave production source unchanged.

1. Read `docs/design/README.md`, the relevant requirement, and `packages/ui/CONTEXT.md`.
2. Run `pnpm ui-review -- --iteration=N`, where `N` is 1, 2, or 3. The command drives the built app and records every primary view at the standard wide and minimum sizes, plus reachable overlays. Narrow it with `--views=`, `--sizes=` and `--theme=` (`rotaris-dim`, `nocturne` or `high-contrast`); the theme the pack was captured on is recorded in `manifest.json` under `captured`, and a critique that names a colour relationship states which palette it read.
3. Inspect every screenshot in the iteration together with `geometry.json`, `styles.json`, deterministic findings, and `manifest.json`.
4. Evaluate design quality, originality, craft, and functionality. Give special attention to typography hierarchy, repeated spacing, competing alignment axes, visual density, colour harmony, focus visibility, clipping, and affordance clarity.
5. Write `critique.json` beside the manifest using [references/critique-schema.md](references/critique-schema.md). Every finding begins with status `proposed`, cites concrete evidence, and names the affected primary view or overlay.
6. Keep aesthetic judgement separate from deterministic findings. A deterministic red retains its measured severity. An aesthetic observation states why it weakens the adopted direction.
7. End after iteration 3. Carry unresolved findings forward with their current evidence status.
8. **A critique is the least durable file in the pack — report its substance, do not rely on it surviving.** `.ui-review/` is ignored by git, so nothing here is ever committed, and everything around `critique.json` is reproducible by capturing again while the reading is not. The tools protect it as far as tools can (`ui-review` refuses to re-capture over one, `ui-audit` carries it across its own wipe, `--reshoot` is how the loss is made intentional) — but a reading that exists only as a path is one stray command from gone, twice over now. Put the findings and their numbers in the message you hand back, so the record can be written from the report rather than from the file.
