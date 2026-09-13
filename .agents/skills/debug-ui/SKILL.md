---
name: debug-ui
description: Diagnose and fix a bounded Rotaris visual, layout, focus, clipping, stacking, breakpoint, or interaction defect by driving the built Electron app, measuring rendered DOM geometry, identifying the source cause, and adding regression evidence. Use when an existing surface looks wrong or behaves incorrectly. Use build-ui for broad surface construction and review-ui for critique only.
---

# Debug a Rotaris surface

Read the governing requirement, `packages/ui/CONTEXT.md`, the affected architecture view, and the approved mockup section before editing. Use the Shell context's vocabulary in findings and proof names.

## Evidence loop

1. Build and launch the real renderer: `pnpm build`, `pnpm app:drive start --fresh`, then `pnpm app:drive waitFor ".app-shell"`.
2. Reproduce through product controls. Capture a screenshot, `inspect` the relevant selectors, and measure boxes and computed styles with `eval`.
3. Check named grid tracks, viewport and ancestor containment, centre-point hit testing, focus, text fit, scroll extent, and the down-and-up breakpoint transition. Await `document.getAnimations()` before reading moving overlays.
4. Trace the winning rule or state update to source. Record the falsified cause beside its replacement when an earlier rule encoded a wrong assumption.
5. Implement the smallest source repair through shared components and tokens. Add or extend a `UiLayoutContract` when the relationship should stay machine-checkable. The probe in `ui-audit.mjs` only measures; the verdict is `apps/desktop/scripts/lib/layout-relations.mjs`, a pure function with a unit test beside it — a new relation is added there, with both directions of its failure pinned.
6. Add a focused regression that fails on the original behavior and passes on the repair. Extend `layout-proof.mjs` for stable geometry and stacking contracts; use a dedicated proof for behavior with its own lifecycle.
7. Rebuild, repeat the exact reproduction, inspect the PNG, and run the focused proof. Stop the driven app when complete.
8. **Re-measure with `pnpm ui-audit` and keep the repair only if the number moved.** The sweep reports `SHRUNK` for any marked box holding more content than it shows on an axis that does not scroll — the deterministic form of a defect that took a critic two cycles to see by hand. Three candidate repairs in one round each looked right, changed nothing measurable, and were reverted rather than shipped: a plausible fix that does not move its own number is a second defect wearing the first one's clothes. The same sweep caught a rail repair clipping a label within minutes of merging, which is the point of running it on the repair and not only on the report.
9. Update the architecture and first-execution records required by `CLAUDE.md`.

Read [references/geometry-probes.md](references/geometry-probes.md) for reusable live probes and false-positive guards.
