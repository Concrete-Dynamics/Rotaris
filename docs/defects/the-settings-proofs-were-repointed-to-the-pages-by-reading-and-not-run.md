## The Settings proofs were repointed to the pages by reading, and not run

`PD-CONFIG-012` replaced the thirteen Settings categories as navigation entries by a Setup page and twelve pages. Every
proof script that opened a category by its label was edited to name the page that now holds what it drives, by reading
the script and not by running it: the owner's instruction for that work was that tests run on the hosted runner, and the
hosted runner runs no proof suite (R-079). So each of these is unverified against the built product:
`config-proof`, `sandbox-proof`, `mode-reset-proof`, `init-proof`, `skills-proof`, `mcp-proof`, `code-intel-proof`,
`mission-proof`, `store-resolution-proof`, `notice-proof`, `settings-proof`, and `lib/settings-runtime-field.mjs`
(`continuation-proof`, `retrospective-proof`, `live-run`).

One launch is known to be wrong as edited: `settings-proof`'s `reload-last-write` reads the circuit breaker and the
permission mode in one launch, and they stand on two pages now (Delegation and Permissions). Launches that probe a
row's caption by its visible box may also read differently, since a caption is closed until asked for.

Also unrepaired: a proof or capture that opened Settings and relied on the Models category being the first shown now
meets Setup.

## Specs

- `AGENTS.md`, "The proof scripts": a proof is evidence of the product, and a change that moves a shared seam runs the
  whole suite it touches. This change did not.
- `PD-CONFIG-012` (the pages), REQ-CONFIG-269 (the identifiers the capture seam's labels stood beside).

## Relevant files

- `apps/desktop/scripts/*-proof.mjs` named above, and `apps/desktop/scripts/lib/settings-runtime-field.mjs` — the label each passes to `ROTARIS_CAPTURE_SETTINGS` or clicks.
- `apps/desktop/src/main/capture/seams.ts` — the seam's default page, now `Session store`.
- `packages/ui/src/settings/pages.ts` — the pages and the category-to-page table.
