## The About page's licence caption is set in the browser's default size

The caption REQ-SHELL-142 shows when a build carries no third-party licence bundle ("This build does not carry a
third-party license bundle.") is drawn larger than the text around it. It is a `<p className="text-secondary">`, and
`.text-secondary` sets only a colour, so the paragraph takes the browser's default size. The rows and the licence line
above it take `--rt-text-sm`. In `settings-proof`'s `no-workspace.png` the caption is visibly the largest text on the
page, larger than the "Licensing" heading it sits under. The refusal line under it (`composer__error`) is smaller again.
Noticed on 2026-09-27 while measuring the page's present branch for first-release-plan.md §4.4. It is recorded here and
not repaired: that step did not redraw the surface.

## Specs

No requirement fixes the caption's size; REQ-SHELL-142 fixes its words. It departs from the adopted design language
(`docs/design/README.md` §2 and §7), where secondary text takes a type token by name, not the browser's default.

## Relevant files

- `packages/ui/src/settings/About.tsx` — the caption `<p className="text-secondary" data-testid="licenses-caption">`.
- `packages/ui/src/shell.css` — `.text-secondary` (colour only) and `.about__value` (`--rt-text-sm`), its neighbours.
- `.proof/settings-proof/no-workspace.png` — the evidence, written by `pnpm settings-proof` (not committed).
