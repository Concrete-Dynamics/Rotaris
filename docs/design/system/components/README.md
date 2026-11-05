# The components — one folder per family, three files per component

The component inventory of the adopted design language: **27 React components** — 22 primitives and 5 composed
patterns — grouped into seven families. The design language itself, and the rule that governs it, is
[`../README.md`](../README.md) §1 and §2; which of these a specified screen may use is
[`../README.md`](../../README/04-4-component-inventory-against-the-specification.md) §4.1.

**These are the design system's own components, not the product's.** The application draws through
`packages/ui/src/design-system/`, which is the only place a design-equivalent control may exist
(`tools/check-ui-language.mjs` fails `pnpm lint` on one written elsewhere). Read a folder here for what a member
*is*; read `packages/ui/src/` for what the product currently builds.

## What is in each folder

- **Three files per component, and only these three:** `Name.jsx` (the component, plain React, no build step),
  `Name.d.ts` (its typed prop contract — the authority a caller's editor reads) and `Name.prompt.md` (how the
  component is described to a design tool: what it is for, its variants, and when not to use it).
- **The families are the design system's own grouping** and are not a dependency order: `core` (17 files, 6
  components), `data` (12, 4), `feedback` (12, 4), `forms` (6, 2), `navigation` (9, 3), `patterns` (15, 5), `surfaces`
  (9, 3). **81 files** on 2026-11-05.
- **A pattern is a composition, not a new primitive.** The five in `patterns/` — `TableCard`, `PageHeader`,
  `EmptyState`, `LogPanel`, `ConfirmDialog` — assemble the primitives of the other families; a new one is justified
  only where a recurring assembly would otherwise be re-derived on every surface.
- **`docs/design/system/README.md` names the inventory** ("Components"), and the stylesheet that paints it is
  `docs/design/system/components.css` — a class spelled by a `.jsx` file here that the stylesheet does not define is a
  defect, not a variant (as `Tag`'s tones once were).

## The seven families

| Family | Components | Files |
|---|---|---|
| [core/](core/) | `Button`, `Kbd`, `SegmentedControl`, `StatusDot`, `Tag`, `ToggleSwitch` | 18 |
| [data/](data/) | `ContextRing`, `MeterBar`, `Sparkline`, `Table` | 12 |
| [feedback/](feedback/) | `Dialog`, `Spinner`, `Toast`, `Tooltip` | 12 |
| [forms/](forms/) | `Input`, `Select` | 6 |
| [navigation/](navigation/) | `CommandPalette`, `NavRail`, `Tabs` | 9 |
| [patterns/](patterns/) | `ConfirmDialog`, `EmptyState`, `LogPanel`, `PageHeader`, `TableCard` | 15 |
| [surfaces/](surfaces/) | `Card`, `KpiCard`, `SectionLabel` | 9 |

## Where a new component goes

Into the family it belongs to, as the three files beside its siblings, **and** as a class in
`docs/design/system/components.css` — and into `docs/design/system/README.md`'s inventory list and §4.1's
affordance table in the same change. The inventory in this folder is the design system's; a component the product
needs that the language does not carry is an open question against the requirement, never a local addition
([`../README.md`](../README.md) §2).
