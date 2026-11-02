## A directive's entry text runs past a section heading into the next section's introduction

`tools/symbol-artifact/generate.mjs` collects each directive's entry text, where OQ-237's pair rule looks for one narrowing's
identifier in the other's entry, from its heading to the next directive's heading. A heading of another kind does not end it,
so the last directive before a `## ` or `### ` section heading also takes that heading and the section's introduction, and a
mention of the other directive there satisfies the pair check by accident: two narrowings of one requirement whose entries
never name each other would generate. The register holds no section heading after its first directive today, so nothing
committed passes this way; a register that grows domain sections would. Found by fin34's review of GV1
(`review:record-and-cancels#1`); recorded by fin36 before the repair.

## Outcome

Repaired 2026-10-13 (fin36). An entry's text now ends at any heading of level 1 to 3 that opens no directive (`entryOpen` in
the parse loop); dispositions are read as before. Pinned by a new refusal in `pnpm directive-proof` — two narrowings of
REQ-CHAT-006 whose only mention of the first stands in a `## ` section's introduction after the second's entry — which the old
generator accepted (`42/43 checks passed`, that one FAIL) and the repaired one refuses (`43/43`). The committed register is
unchanged by it: `pnpm symbols` regenerates the artifact unchanged.

## Specs

- `docs/product/README.md`, "Two directives on one requirement" (OQ-237): the later directive names the earlier "in its own
  entry", and the generator refuses a pair of which neither names the other.

## Relevant files

- `tools/symbol-artifact/generate.mjs` — the directive parse loop, `text` per entry, `entryText` and the pair check.
- `apps/desktop/scripts/directive-proof.mjs` — the refusals section, where the pair rule's refusals are proved.
