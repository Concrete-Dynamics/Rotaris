## `pnpm palette-proof` has been red since `library.proposals` joined the command registry

The proof asserts the command palette lists exactly the registry's commands by a NUMBER written into the
script (`expect(all.length === 17, …)`), and the commit that added `library.proposals` (REQ-LIBRARY-174,
the improvement lifecycle) took `COMMANDS` to 18 without touching it. From that commit until Part AT the
script failed on its first scenario with `an empty query listed 18 commands, not the registry's 17
(REQ-SHELL-052)` — before it reached the filter, the hidden keywords or the close-then-run ordering, so
everything the proof measures after that line has been unmeasured for as long as the number has been wrong.

Two earlier commits DID maintain the number (Wave 2's three commands took it to 16, Stage C's
`workspace.chooseNewWindow` to 17, each recorded in the comment above the assertion), which is why the gap
is a miss rather than a convention that was never kept.

The count itself is worth keeping as an assertion rather than deriving it from `COMMANDS`: a derived count
passes for a command nobody decided to add, and REQ-SHELL-052 is about what the user is offered.

## Specs

No product requirement is contradicted — the palette itself is correct, and `commands.test.ts` covers the
registry. What fails is the repository's own rule that a proof is evidence and a red is a defect until the
harness is shown wrong (`.claude/rules/tests-and-proofs.md`), and the rule that a change runs the suite it
touches rather than the script named after it: adding a command touches the palette's proof by construction.

## Relevant files

- `apps/desktop/scripts/palette-proof.mjs` — scenario 1, the `all.length` assertion and the comment that
  tracks each command added since.
- `packages/ui/src/commands/registry.ts` — `COMMANDS`; seven view entries spread from `PRIMARY_VIEWS` plus
  the explicit rows.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) running the wider proof sweep, and confirmed to pre-date
that work by running the script against a clean `main` build (18 against 17, with no retrospective in it).

## Repaired — 2026-09-17

The number now reads 19 — 18 plus Part AT's `improvements.retrospective` — and the comment above it names
both the commit that missed the update and the defect this note records, so the next reader can see that the
line is maintained by hand on purpose. `pnpm palette-proof` is green again.
