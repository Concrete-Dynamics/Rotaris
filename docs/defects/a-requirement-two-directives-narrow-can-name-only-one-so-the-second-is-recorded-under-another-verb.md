## A requirement two directives narrow can name only one, so the second is recorded under another verb

`tools/symbol-artifact/generate.mjs` keeps one directive per verb per requirement (`NARROWED_BY`, `EXTENDED_BY` and
`SUPERSEDED_BY` each map a requirement to one identifier) and refuses a second ("… is narrows by both … and …; precedence
must be unambiguous"). `docs/product/README.md` defines the verbs by what a directive does to the requirement:
**Narrows**, the requirement still governs except in the case the directive names; **Extends**, the requirement is
untouched and still governs in full. When a second directive narrows a requirement another directive already narrows,
the record cannot say so, and the builds have written it under the other verb (or dropped it) to get past the generator:

- `PD-TOOLS-013` (OQ-226, 2026-10-07) adds a member to REQ-TOOLS-112's closed `outcome_kind` set and a mapping to its
  test 1, and exempts an interrupted call from REQ-SESSION-136's issues: both narrowings, recorded as **Extends**
  because `PD-TOOLS-009` and `PD-SESSION-003` already narrow those two.
- `PD-CONFIG-003` (OQ-218) names REQ-CONFIG-256 and REQ-CONFIG-417 as **Narrows** where its ruling named them extended,
  because `PD-WORKSPACE-002` already extends them.
- `PD-SHELL-009` (OQ-206) carries its ruling's REQ-SHELL-021 through REQ-SHELL-122, because `PD-SHELL-001` already
  narrows REQ-SHELL-021.

Each build stated the substitution in its directive and its first-executions row, so nothing is hidden, but the generated
artifact (`packages/kernel/src/generated/requirements.ts`) answers "extended by PD-TOOLS-013 … still governs in full" for
REQ-TOOLS-112, which no longer governs in full, the shape acceptance finding F15 repaired for `PD-ORCH-014`
([`pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it`](fixed/pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md)).
Whether two directives may narrow one requirement in disjoint cases (the register then holding a list), or a later one
must revise the earlier, is a decision for the record's owner, not this note.

Noticed 2026-10-07 by fin31's reviewer while reviewing PD-TOOLS-013. Recorded, not repaired.

## Specs

- `docs/product/README.md`, "The shape of an entry" (the meaning of Narrows and Extends) and "The back-pointer, in place"
  ("to match the disposition").
- No requirement's text is contradicted.

## Relevant files

- `tools/symbol-artifact/generate.mjs`: the per-verb maps and the "precedence must be unambiguous" refusal.
- `docs/product/directives.md`: the disposition blocks of `PD-TOOLS-013`, `PD-CONFIG-003` and `PD-SHELL-009`, and the
  italic lines under them that state the substitution.
- `packages/kernel/src/generated/requirements.ts`: `NARROWED_BY` and `EXTENDED_BY`, generated from those blocks.
