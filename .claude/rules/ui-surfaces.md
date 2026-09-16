---
paths:
  - "packages/ui/**/*.{ts,tsx}"
  - "packages/ui-core/**/*.ts"
  - "apps/desktop/src/renderer/**/*.{ts,tsx,css}"
---

# Drawing a surface

The design language is **adopted and authoritative**; its information architecture is **not**. Screens,
order and tabs come from `docs/spec/` — `REQ-SHELL-023` governs — and `docs/design/mockup/` is read for
craft only. Where the two disagree, the specification wins. `docs/design/README.md` §2 is the rule.

- **Build from `packages/ui/src/design-system/`.** A design-equivalent control written anywhere else in
  `packages/ui/src` or `apps/desktop/src/renderer` fails `pnpm lint` (`tools/check-ui-language.mjs`).
- **Cite tokens by name.** Never a literal colour or pixel value. `pnpm theme-proof` holds two
  counterfactuals that must stay red, and OQ-56 keeps one finding red on `rotaris-dim` **by decision** —
  do not "fix" the disabled token.
- **Publish a layout contract on the root** — `layoutContractAttributes` from
  `design-system/layout-contract.ts`. `pnpm ui-audit` evaluates live geometry against it, and
  `shrunkBoxes` guards UIR-014's whole class: a box standing smaller than its content on an axis that
  does not scroll. `flex-shrink` on a page header was the original.
- **One row renderer** (`transcript/Row.tsx`, a pure function of its props — Part Z's pool rebinds slots)
  and **one Markdown renderer** (`markdown/`). Nothing renders either a second way.
- A renderer **may not name a workspace, a preference family or a session it was not given**; main mints
  per-workspace keys from the window it opened. A renderer raising a persistent notice sends
  `notice.report` — it does not draw one.

Ordered edit path: `docs/architecture/views/04-seams.md` §8. Evidence after drawing: `pnpm build`,
`pnpm app:drive shot`, then `pnpm ui-audit` and `pnpm ui-review` (report-only, three iterations at most).
The `.agents/skills/build-ui` and `debug-ui` workflows drive this loop; `review-ui` only critiques it.
