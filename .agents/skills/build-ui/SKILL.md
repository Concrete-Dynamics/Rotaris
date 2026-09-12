---
name: build-ui
description: Build or substantially restyle a Rotaris desktop surface using the adopted design language, shared component layer, explicit layout contracts, and rendered evidence. Use for new primary-view content, overlays, dialogs, controls, or broad UI migrations. Use debug-ui for a bounded existing defect and review-ui for a read-only critique.
---

# Build a Rotaris surface

Treat the specification as information-architecture authority and `docs/design/` as visual-language authority. Read `CLAUDE.md`, `CONTEXT-MAP.md`, `packages/ui/CONTEXT.md`, and the affected architecture view before editing. Classify an owner request in `docs/product/requests.md` when it can change product behavior.

## Workflow

1. Run `pnpm mockup`, inspect the matching surface named in `docs/design/README.md` section 7, and record the specific type, spacing, surface, hierarchy, and alignment decisions that apply.
2. Start from `@rotaris/ui/design-system`. Reuse the behavior-rich Shell components already exported by `@rotaris/ui` for NavRail, CommandPalette, ContextRing, ConfirmDialog, and Acknowledgements. The design-system feedback adapter uses the product term Acknowledgement.
3. Express repeated geometry through tokens and component variants. Product CSS may cite requirement-owned fixed geometry. Add or burn down literal debt through `tools/ui-language-baseline.json`; `pnpm lint` refuses growth.
4. Give important alignments a `UiLayoutContract`. Use stable `data-ui` identifiers and target identifiers, so `pnpm ui-audit` can evaluate relationships from live boxes.
5. For a broad native-control migration, run `pnpm migrate:ui-primitives` first, review its report, then run `pnpm migrate:ui-primitives -- --write`. The transform edits JSX tag tokens through the TypeScript parser.
6. Run focused component tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Drive the built app with `pnpm app:drive`, wait for each state, capture the changed surface, and visually compare it with the approved material.
7. Run `pnpm ui-review -- --iteration=1`. Use `$review-ui` for an external report when subjective craft review adds value. Apply accepted findings and repeat up to iteration 3.
8. Update the affected architecture view, its reconciliation date, and the first-execution record for a new mechanism. Keep evidence states explicit: proposed, approved, implemented, verified, partially verified.

Read [references/component-inventory.md](references/component-inventory.md) when choosing or adding a component.
