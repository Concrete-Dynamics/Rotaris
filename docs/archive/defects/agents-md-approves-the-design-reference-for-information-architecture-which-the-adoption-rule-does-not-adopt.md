## AGENTS.md approves the design reference for information architecture, which the adoption rule does not adopt

Found 2026-11-01 while planning the design research corpus ([R-093](../../product/requests.md#r-093)). The
"Approved inputs" list of `AGENTS.md` read "the approved Claude Design UX reference for information architecture and
visual design", while `docs/design/README.md` §2 — and `AGENTS.md`'s own "Process state" paragraph,
`packages/ui/CONTEXT.md`'s preamble and `.claude/rules/ui-surfaces.md` — state that the design language is adopted and
its information architecture is **not**: which screens exist, their order, tabs and labels come from `docs/spec/`
(`REQ-SHELL-023`). The rules file every session loads whole contradicted, in its list of approved inputs, the rule it
carries forty lines later. Nothing was built from the wrong reading; the risk was an agent citing the line as a licence
to take a screen's structure from the mockup.

## Outcome

Fixed 2026-11-01 in the change that found it: the line reads "the approved Claude Design UX reference for visual
design". No requirement, directive or design rule was touched; the bytes saved went to the paragraph that names the
seventh portable skill.

## Specs

Contradicts no requirement. An inconsistency of the rules file against `docs/design/README.md` §2, which the owner
ruled on 2026-09-01 (the import commit) and GD-6 confirmed.

## Relevant files

- `AGENTS.md`, "Approved inputs" — the corrected line.
- `docs/design/README/02-2-the-adoption-rule.md` — the rule it contradicted.
