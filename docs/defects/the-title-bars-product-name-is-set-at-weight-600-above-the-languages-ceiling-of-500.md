## The title bar's product name is set at weight 600, above the language's ceiling of 500

`.title-bar__name` in `packages/ui/src/shell.css` (line 25) sets the wordmark in the display face at `font-weight: 600`.
The adopted language admits three weights — 400 for body, 500 for headings, labels and controls, 300 for large mono
numerals — and states that nothing in the system goes above 500, hierarchy coming from size, colour and space and never
from weight (`docs/design/README.md` §1.4). The rubric's C1 row ("never from a fourth weight") scores exactly this, so a
`review-ui` pass over the title bar files it on every capture until it is repaired. Noticed 2026-11-02 while reviewing
the design research corpus; guide 08's worked example (section 5, "One thing to file") first read it from the source.

## Specs

- No requirement names the wordmark's weight: `REQ-SHELL-033` fixes the title bar's contents and their order, not their
  type. The contradiction is with the adopted design language, `docs/design/README.md` §1.4 ("Three weights, and only
  three"; "Nothing in the system goes above 500"), which `AGENTS.md` makes authoritative for every drawn surface.

## Relevant files

- `packages/ui/src/shell.css` — `.title-bar__name`, line 25, the one declaration.
- `packages/ui/src/AppShell.tsx` — renders the title bar and its wordmark.
- `docs/design/README/01-1-the-design-language.md` — §1.4, the three weights.
- `.agents/skills/review-ui/references/critique-rubric.md` — C1, the row that scores it.
- `docs/research/design/08-platform-conventions-for-electron.md` — section 5 (the reading) and check K17 (no title-bar
  text above 500).
