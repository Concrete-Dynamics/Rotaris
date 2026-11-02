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

## Repaired 2026-09-28 under R-062

The caption takes `.about__caption` (`packages/ui/src/shell.css`, beside `.about__value`): the secondary ink
(`--rt-text-secondary`) at the licence line's own type token (`--rt-text-sm`), no literal size. Read for craft first
(`pnpm mockup`, the SETTINGS screen): the material never leaves a line of prose in the browser's default size. Its
helper text there is metadata — `card-meta` under a card's KPI (`--rt-text-xs`, the tertiary ink) and `field-label`
over a control (`--rt-text-xs`, the secondary ink, medium weight) — and this caption is neither: it is a full sentence
stating a fact about the build, the same kind of line as the licence statement above it, so it takes that line's
scale in the secondary ink. This is the one departure from the nearest mockup text, and its reason is stated here. **Measured in the built app** (`pnpm settings-proof`, launch 1, `results.json`'s `about.captionSize` and
`about.valueSize`): before the repair the caption's computed size was **14px** against its neighbours' **12px** and the
new assertion failed with "the licensing caption is set at 14px, its neighbours at 12px"; after it both read 12px. The
proof now probes the computed `fontSize` (`main/capture/probe.ts` reports it beside `text` and `data`) of the caption
and of every `.about__value`, and requires them equal — the test that pins it. Re-measured 2026-09-28 in the driven app as root (`pnpm app:drive eval`
on the About page): the caption reads 12px under `.about__caption`, 14px the moment its class is set back to
`text-secondary`, its neighbour 12px. The caption's margins are the base rhythm's (`p` in `docs/design/system/base.css`),
not a literal, so the error line under it keeps the same air the licence line keeps above the control. `REQ-SHELL-142`'s
words are unchanged. The report-only critic (`pnpm ui-review --views=7`) could not run on this tree: the audit it wraps dies
on the window controls' contract before writing a pack (`the-window-controls-contract-is-an-object-and-kills-every-ui-audit.md`),
so the surface was read from `.proof/settings-proof/no-workspace.png` by eye against the mockup, not by the critic.
**Pinned inside `pnpm check` too** (added in the verification round): `packages/ui/src/settings/About.test.ts` renders the
About category and requires the caption to carry `about__caption` — it fails on the pre-repair `text-secondary`, checked
by setting the class back — and reads `shell.css` to require `.about__caption`'s `font-size` to be the named token
`.about__value`'s (`--rt-text-sm`). The built-app assertion stays the evidence of the computed size; the unit test pins
what it rests on. When the window-controls defect is repaired, `pnpm ui-review --views=7` over About is owed and its
findings belong here.
**The window-controls defect was repaired 2026-09-28** (R-062), and `pnpm ui-review --skip-build --views=7` then produced
a pack as root under Xvfb: 0 deterministic findings on the Settings view at both sizes. Settings opens on its Models
category, so the pack does not show About; the audit's views flag reaches a view, not a category. A pack over About,
and the critic's reading of it, is still owed.
